import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { IsoDate } from '../domain/calendar.ts'
import type {
  Race,
  RaceInsert,
  RaceUpdate,
  Workout,
  WorkoutInsert,
  WorkoutTemplate,
  WorkoutTemplateInsert,
  WorkoutUpdate,
} from '../lib/database.types.ts'
import { supabase } from '../lib/supabase.ts'

/**
 * Séances planifiées d'un ou plusieurs athlètes entre deux dates (incluses).
 * La RLS limite de toute façon le résultat aux athlètes du coach connecté
 * (ou à l'athlète lui-même).
 */
export function useWorkouts(athleteIds: string[], from: IsoDate, to: IsoDate) {
  const ids = [...athleteIds].sort()
  return useQuery({
    queryKey: ['workouts', ids, from, to],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Workout[]> => {
      const { data, error } = await supabase
        .from('workouts')
        .select('*')
        .in('athlete_id', ids)
        .gte('scheduled_on', from)
        .lte('scheduled_on', to)
        .order('scheduled_on')
        .order('position')
      if (error) throw error
      return data
    },
  })
}

export function useWorkout(workoutId: string | null) {
  return useQuery({
    queryKey: ['workout', workoutId],
    enabled: workoutId !== null,
    queryFn: async (): Promise<Workout | null> => {
      const { data, error } = await supabase.from('workouts').select('*').eq('id', workoutId ?? '').maybeSingle()
      if (error) throw error
      return data
    },
  })
}

function useInvalidateWorkouts() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['workouts'] }),
      queryClient.invalidateQueries({ queryKey: ['workout'] }),
    ])
}

/** Crée une ou plusieurs séances (copie, duplication de semaine). */
export function useCreateWorkouts() {
  const invalidate = useInvalidateWorkouts()
  return useMutation({
    mutationFn: async (drafts: WorkoutInsert[]): Promise<Workout[]> => {
      if (drafts.length === 0) return []
      const { data, error } = await supabase.from('workouts').insert(drafts).select()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
}

export function useUpdateWorkout() {
  const invalidate = useInvalidateWorkouts()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: WorkoutUpdate }): Promise<Workout> => {
      const { data, error } = await supabase.from('workouts').update(patch).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    // Déplacement immédiat dans le calendrier (glisser-déposer), avant la réponse.
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: ['workouts'] })
      const snapshots = queryClient.getQueriesData<Workout[]>({ queryKey: ['workouts'] })
      for (const [key, list] of snapshots) {
        if (list) queryClient.setQueryData(key, list.map((w) => (w.id === id ? { ...w, ...patch } : w)))
      }
      return { snapshots }
    },
    onError: (_error, _variables, context) => {
      for (const [key, list] of context?.snapshots ?? []) queryClient.setQueryData(key, list)
    },
    onSettled: invalidate,
  })
}

export function useDeleteWorkout() {
  const invalidate = useInvalidateWorkouts()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('workouts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

// -----------------------------------------------------------------------------
// Bibliothèque de séances types
// -----------------------------------------------------------------------------

export function useTemplates() {
  return useQuery({
    queryKey: ['workout-templates'],
    queryFn: async (): Promise<WorkoutTemplate[]> => {
      const { data, error } = await supabase.from('workout_templates').select('*').order('title')
      if (error) throw error
      return data
    },
  })
}

export function useSaveTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: WorkoutTemplateInsert }): Promise<WorkoutTemplate> => {
      const query = id
        ? supabase.from('workout_templates').update(values).eq('id', id)
        : supabase.from('workout_templates').insert(values)
      const { data, error } = await query.select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workout-templates'] }),
  })
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('workout_templates').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workout-templates'] }),
  })
}

// -----------------------------------------------------------------------------
// Courses et objectifs
// -----------------------------------------------------------------------------

export function useRaces(athleteIds: string[], from: IsoDate, to: IsoDate) {
  const ids = [...athleteIds].sort()
  return useQuery({
    queryKey: ['races', ids, from, to],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Race[]> => {
      const { data, error } = await supabase
        .from('races')
        .select('*')
        .in('athlete_id', ids)
        .gte('race_on', from)
        .lte('race_on', to)
        .order('race_on')
      if (error) throw error
      return data
    },
  })
}

/** Courses à venir d'un athlète (aujourd'hui compris). */
export function useUpcomingRaces(athleteId: string, today: IsoDate) {
  return useQuery({
    queryKey: ['races', 'upcoming', athleteId, today],
    queryFn: async (): Promise<Race[]> => {
      const { data, error } = await supabase
        .from('races')
        .select('*')
        .eq('athlete_id', athleteId)
        .gte('race_on', today)
        .order('race_on')
        .limit(10)
      if (error) throw error
      return data
    },
  })
}

export function useSaveRace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; patch: RaceUpdate } | { values: RaceInsert }): Promise<Race> => {
      const query =
        'id' in input
          ? supabase.from('races').update(input.patch).eq('id', input.id)
          : supabase.from('races').insert(input.values)
      const { data, error } = await query.select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['races'] }),
  })
}

export function useDeleteRace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('races').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['races'] }),
  })
}
