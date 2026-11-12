import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { IsoDate } from '../domain/calendar.ts'
import { type CoachingMode, type WeekSummary, weekRange, weekSummary } from '../domain/flexible.ts'
import type { AthleteRun, AthleteRunInsert, WeeklyTarget, Workout } from '../lib/database.types.ts'
import { supabase } from '../lib/supabase.ts'
import { isMissingRelation, useWorkoutActivity } from './exchanges.ts'
import { useGarminActivitiesInRange } from './garmin.ts'
import { useWorkouts } from './planning.ts'

/** Le coach choisit le mode de coaching d'un athlète. */
export function useSetCoachingMode(coachId: string, athleteId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (mode: CoachingMode) => {
      const { error } = await supabase.from('coach_athletes').update({ mode }).eq('coach_id', coachId).eq('athlete_id', athleteId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coach-links'] }),
  })
}

/** Volume fixé par le coach pour une semaine (rien si le coach n'en a pas donné). */
export function useWeeklyTarget(athleteId: string, weekStart: IsoDate) {
  return useQuery({
    queryKey: ['weekly-target', athleteId, weekStart],
    retry: false,
    queryFn: async (): Promise<WeeklyTarget | null> => {
      const { data, error } = await supabase
        .from('weekly_targets')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('week_start', weekStart)
        .maybeSingle()
      if (error) {
        // Migration de la 0.9.0 pas encore appliquée : pas de volume, pas d'erreur.
        if (isMissingRelation(error)) return null
        throw error
      }
      return data
    },
  })
}

/** Le coach fixe, modifie ou retire (target vide) le volume d'une semaine. */
export function useSaveWeeklyTarget(athleteId: string, weekStart: IsoDate) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { exists: boolean; target: { km_min: number; km_max: number } | null; note: string }) => {
      const row = supabase.from('weekly_targets')
      const { error } = !input.target
        ? await row.delete().eq('athlete_id', athleteId).eq('week_start', weekStart)
        : input.exists
          ? await row.update({ ...input.target, note: input.note }).eq('athlete_id', athleteId).eq('week_start', weekStart)
          : await row.insert({ athlete_id: athleteId, week_start: weekStart, ...input.target, note: input.note })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['weekly-target', athleteId] }),
  })
}

/** Sorties déclarées par l'athlète entre deux dates. */
export function useAthleteRuns(athleteId: string, from: IsoDate, to: IsoDate) {
  return useQuery({
    queryKey: ['athlete-runs', athleteId, from, to],
    retry: false,
    queryFn: async (): Promise<AthleteRun[]> => {
      const { data, error } = await supabase
        .from('athlete_runs')
        .select('*')
        .eq('athlete_id', athleteId)
        .gte('run_on', from)
        .lte('run_on', to)
        .order('run_on')
        .order('created_at')
      if (error) {
        if (isMissingRelation(error)) return []
        throw error
      }
      return data
    },
  })
}

export function useAddRun(athleteId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: AthleteRunInsert) => {
      const { error } = await supabase.from('athlete_runs').insert(values)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['athlete-runs', athleteId] }),
  })
}

export function useDeleteRun(athleteId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('athlete_runs').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['athlete-runs', athleteId] }),
  })
}

/** L'athlète choisit le jour d'une séance souple (day vide : « pas encore choisi »). */
export function usePlaceWorkout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ workoutId, day }: { workoutId: string; day: IsoDate | null }) => {
      const { error } = await supabase.rpc('place_flexible_workout', { p_workout: workoutId, p_day: day })
      if (error) throw error
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workouts'] }),
        queryClient.invalidateQueries({ queryKey: ['workout'] }),
        queryClient.invalidateQueries({ queryKey: ['workout-activity'] }),
      ]),
  })
}

export type WeekData = {
  isPending: boolean
  error: Error | null
  target: WeeklyTarget | null
  /** Toutes les séances de la semaine (à jour fixe ou non). */
  workouts: Workout[]
  runs: AthleteRun[]
  summary: WeekSummary<Workout>
}

/** Tout ce qu'il faut pour le bilan d'une semaine d'un athlète : séances, retours, montre, sorties déclarées, volume. */
export function useWeek(athleteId: string, date: IsoDate): WeekData {
  const { from, to } = weekRange(date)
  const workouts = useWorkouts([athleteId], from, to)
  const activity = useWorkoutActivity([athleteId], from, to)
  // Absentes pour un athlète sans montre reliée : la requête renvoie alors une liste vide.
  const watch = useGarminActivitiesInRange([athleteId], from, to)
  const target = useWeeklyTarget(athleteId, from)
  const runs = useAthleteRuns(athleteId, from, to)
  const summary = weekSummary({
    week: from,
    target: target.data ? { km_min: Number(target.data.km_min), km_max: Number(target.data.km_max) } : null,
    workouts: workouts.data ?? [],
    feedback: activity.data ?? new Map(),
    watch: watch.data ?? [],
    runs: runs.data ?? [],
  })
  return {
    isPending: workouts.isPending || target.isPending || runs.isPending,
    error: workouts.error ?? target.error ?? runs.error,
    target: target.data ?? null,
    workouts: workouts.data ?? [],
    runs: runs.data ?? [],
    summary,
  }
}
