import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { addDays, type IsoDate, todayIso } from '../domain/calendar.ts'
import { type GarminSummary, importErrorMessage, importRange, planImport, summaryToActivity } from '../domain/garmin.ts'
import { type ActivityDetail, isActivityDetail } from '../domain/activityDetail.ts'
import type { GarminActivity, GarminActivityDetailRow, GarminActivityInsert, GarminSyncRun } from '../lib/database.types.ts'
import { supabase } from '../lib/supabase.ts'

/** Activité Garmin rattachée à une séance (la première de la journée s'il y en a plusieurs). */
export function useWorkoutGarminActivity(workoutId: string) {
  return useQuery({
    queryKey: ['garmin-activities', 'workout', workoutId],
    retry: false,
    queryFn: async (): Promise<GarminActivity | null> => {
      const { data, error } = await supabase
        .from('garmin_activities')
        .select('*')
        .eq('workout_id', workoutId)
        .order('start_time')
        .limit(1)
      if (error) throw error
      return data[0] ?? null
    },
  })
}

/** Dernières activités importées d'un athlète (vide tant qu'il n'a rien importé). */
export function useRecentGarminActivities(athleteId: string) {
  return useQuery({
    queryKey: ['garmin-activities', 'recent', athleteId],
    retry: false,
    queryFn: async (): Promise<GarminActivity[]> => {
      const { data, error } = await supabase
        .from('garmin_activities')
        .select('*')
        .eq('athlete_id', athleteId)
        .order('start_time', { ascending: false })
        .limit(5)
      if (error) throw error
      return data
    },
  })
}

/** Erreur d'import, avec un message prêt à afficher. */
export class GarminImportError extends Error {
  readonly reason: string | null
  constructor(reason: string | null) {
    super(importErrorMessage(reason))
    this.reason = reason
  }
}

export type ImportSummary = { imported: number; linked: number }

/** Dernier passage de l'import automatique pour cet athlète (aucun tant qu'il n'a pas tourné). */
export function useLastGarminSync(athleteId: string) {
  return useQuery({
    queryKey: ['garmin-activities', 'sync', athleteId],
    retry: false,
    refetchInterval: 5 * 60 * 1000,
    queryFn: async (): Promise<GarminSyncRun | null> => {
      const { data, error } = await supabase
        .from('garmin_sync_runs')
        .select('*')
        .eq('athlete_id', athleteId)
        .order('ran_at', { ascending: false })
        .limit(1)
      if (error) throw error
      return data[0] ?? null
    },
  })
}

/**
 * Import à la demande des 14 derniers jours (l'import automatique tourne côté Supabase) : la fonction garmin-import lit les activités chez Garmin, puis
 * le site les enregistre au nom de l'athlète, rattachées aux séances prévues.
 */
export function useGarminImport(athleteId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<ImportSummary> => {
      const range = importRange(todayIso())
      const { data, error } = await supabase.functions.invoke<{ activities: GarminSummary[] }>('garmin-import', {
        body: range,
      })
      if (error) {
        let code: string | null = null
        if (error instanceof FunctionsHttpError) {
          const body: unknown = await error.context.json().catch(() => null)
          if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') code = body.error
        }
        throw new GarminImportError(code)
      }
      const values = (data?.activities ?? []).map(summaryToActivity).filter((v) => v !== null)
      let linked = 0
      if (values.length > 0) {
        const [workouts, existing] = await Promise.all([
          supabase
            .from('workouts')
            .select('id, scheduled_on, kind, position')
            .eq('athlete_id', athleteId)
            // Une séance souple sans jour choisi est rangée au lundi : ce n'est pas sa date, on ne la rapproche pas.
            .or('flexible.eq.false,placed_at.not.is.null')
            // La veille du premier jour aussi : une séance peut être faite avec un jour de retard.
            .gte('scheduled_on', addDays(range.from, -1))
            .lte('scheduled_on', range.to),
          supabase
            .from('garmin_activities')
            .select('garmin_activity_id, workout_id')
            .eq('athlete_id', athleteId)
            .in(
              'garmin_activity_id',
              values.map((v) => v.garmin_activity_id),
            ),
        ])
        if (workouts.error) throw workouts.error
        if (existing.error) throw existing.error
        const rows: GarminActivityInsert[] = planImport(
          data?.activities ?? [],
          workouts.data,
          new Map(existing.data.map((row) => [Number(row.garmin_activity_id), row.workout_id])),
        )
        const { error: saveError } = await supabase
          .from('garmin_activities')
          .upsert(rows, { onConflict: 'athlete_id,garmin_activity_id' })
        if (saveError) throw saveError
        linked = rows.filter((row) => row.workout_id).length
      }
      return { imported: values.length, linked }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['garmin-activities'] }),
  })
}

/**
 * Coach : activités Garmin de ses athlètes entre deux dates, rattachées ou non à une séance.
 * Celles sans séance sont les sorties libres du planning.
 */
export function useGarminActivitiesInRange(athleteIds: string[], from: IsoDate, to: IsoDate) {
  const ids = [...athleteIds].sort()
  return useQuery({
    queryKey: ['garmin-activities', 'range', ids, from, to],
    enabled: ids.length > 0,
    retry: false,
    queryFn: async (): Promise<GarminActivity[]> => {
      const { data, error } = await supabase
        .from('garmin_activities')
        .select('*')
        .in('athlete_id', ids)
        .gte('local_date', from)
        .lte('local_date', to)
        .order('start_time')
      if (error) throw error
      return data
    },
  })
}

/** Une activité Garmin (page d'une sortie libre). */
export function useGarminActivity(activityId: string) {
  return useQuery({
    queryKey: ['garmin-activities', 'one', activityId],
    enabled: activityId !== '',
    retry: false,
    queryFn: async (): Promise<GarminActivity | null> => {
      const { data, error } = await supabase.from('garmin_activities').select('*').eq('id', activityId).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export type ActivityDetailState =
  | { state: 'ok'; detail: ActivityDetail; fetchedAt: string }
  /** Pas encore lu : arrivera avec un prochain passage de l'import automatique. */
  | { state: 'pending' }
  /** Garmin n'a pas de fichier, ou il est illisible. */
  | { state: 'missing'; status: Exclude<GarminActivityDetailRow['status'], 'ok'>; error: string | null }

/** Détail (.FIT) d'une activité : courbes, tours, chiffres de la montre. */
export function useActivityDetail(activityId: string | null) {
  return useQuery({
    queryKey: ['garmin-activities', 'detail', activityId],
    enabled: !!activityId,
    retry: false,
    // Rien n'arrive plus souvent que l'import automatique.
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ActivityDetailState> => {
      const { data, error } = await supabase
        .from('garmin_activity_details')
        .select('*')
        .eq('activity_id', activityId ?? '')
        .maybeSingle()
      if (error) throw error
      if (!data) return { state: 'pending' }
      if (data.status === 'ok' && isActivityDetail(data.data)) return { state: 'ok', detail: data.data, fetchedAt: data.fetched_at }
      return { state: 'missing', status: data.status === 'ok' ? 'unreadable' : data.status, error: data.error ?? null }
    },
  })
}
