import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { todayIso } from '../domain/calendar.ts'
import { type GarminSummary, importErrorMessage, importRange, matchActivities, summaryToActivity } from '../domain/garmin.ts'
import type { GarminActivity, GarminActivityInsert } from '../lib/database.types.ts'
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

const LAST_IMPORT_KEY = 'rob1coach-garmin-dernier-import'

/** Heure du dernier import réussi sur cet appareil (sert à l'import automatique). */
export function lastGarminImport(): number {
  return Number(window.localStorage.getItem(LAST_IMPORT_KEY) ?? 0) || 0
}

/**
 * Import des 14 derniers jours : la fonction garmin-import lit les activités chez Garmin, puis
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
            .gte('scheduled_on', range.from)
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
        const links = matchActivities(
          values,
          workouts.data,
          new Map(existing.data.map((row) => [Number(row.garmin_activity_id), row.workout_id])),
        )
        const rows: GarminActivityInsert[] = values.map((v) => ({ ...v, workout_id: links.get(v.garmin_activity_id) ?? null }))
        const { error: saveError } = await supabase
          .from('garmin_activities')
          .upsert(rows, { onConflict: 'athlete_id,garmin_activity_id' })
        if (saveError) throw saveError
        linked = rows.filter((row) => row.workout_id).length
      }
      window.localStorage.setItem(LAST_IMPORT_KEY, String(Date.now()))
      return { imported: values.length, linked }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['garmin-activities'] }),
  })
}
