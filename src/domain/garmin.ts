/**
 * Activités Garmin (0.4.0, test perso) : conversion de la liste renvoyée par
 * Garmin, rattachement aux séances prévues et affichage.
 */
import type { GarminSummary } from '../../supabase/functions/garmin-import/garmin.ts'
import { addDays, type IsoDate } from './calendar.ts'
import { formatPace } from './pace.ts'
import { formatDistance, formatDuration, type WorkoutKind } from './workouts.ts'

export type { GarminSummary }

/** Nombre de jours relus à chaque import (aujourd'hui compris). */
export const IMPORT_DAYS = 14

/** Période relue à chaque import : les 14 derniers jours. */
export function importRange(today: IsoDate): { from: IsoDate; to: IsoDate } {
  return { from: addDays(today, -(IMPORT_DAYS - 1)), to: today }
}

/** Valeurs enregistrées dans garmin_activities. */
export type GarminActivityValues = {
  garmin_activity_id: number
  start_time: string
  local_date: IsoDate
  activity_type: string
  name: string
  duration_s: number | null
  moving_s: number | null
  distance_m: number | null
  elevation_gain_m: number | null
  avg_hr: number | null
  max_hr: number | null
  calories: number | null
}

export type GarminSport = 'run' | 'trail' | 'strength' | 'cross'

/** Famille de sport d'un type d'activité Garmin (running, trail_running, cycling…). */
export function garminSport(typeKey: string): GarminSport {
  const key = typeKey.toLowerCase()
  if (key.includes('trail') || key === 'ultra_run' || key === 'mountaineering') return 'trail'
  if (key.includes('run')) return 'run'
  if (key.includes('strength') || key === 'hiit' || key === 'pilates' || key === 'yoga') return 'strength'
  return 'cross'
}

const SPORT_LABELS: Record<GarminSport, string> = {
  run: 'Course',
  trail: 'Trail',
  strength: 'Renforcement',
  cross: 'Autre sport',
}

export function garminSportLabel(typeKey: string): string {
  return SPORT_LABELS[garminSport(typeKey)]
}

/** Entier dans [min, max], sinon rien (la base refuserait la valeur). */
function bounded(value: number | null, min: number, max: number): number | null {
  if (value === null || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  return rounded >= min && rounded <= max ? rounded : null
}

const GARMIN_TIME = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/

/** Une activité de la liste Garmin → ligne à enregistrer, ou rien si elle est inutilisable. */
export function summaryToActivity(summary: GarminSummary): GarminActivityValues | null {
  const local = GARMIN_TIME.exec(summary.startTimeLocal ?? '')
  const gmt = GARMIN_TIME.exec(summary.startTimeGMT ?? '')
  if (!local || !gmt || !Number.isSafeInteger(summary.activityId) || summary.activityId <= 0) return null
  return {
    garmin_activity_id: summary.activityId,
    start_time: `${gmt[1]}T${gmt[2]}Z`,
    local_date: local[1],
    activity_type: (summary.activityType?.typeKey ?? '').slice(0, 60),
    name: (summary.activityName ?? '').trim().slice(0, 200),
    duration_s: bounded(summary.duration, 1, 172_800),
    moving_s: bounded(summary.movingDuration, 1, 172_800),
    distance_m: bounded(summary.distance, 0, 1_000_000),
    elevation_gain_m: bounded(summary.elevationGain, 0, 30_000),
    avg_hr: bounded(summary.averageHR, 20, 250),
    max_hr: bounded(summary.maxHR, 20, 250),
    calories: bounded(summary.calories, 0, 30_000),
  }
}

/** Les sports d'une séance prévue qui peuvent correspondre à une activité. */
const COMPATIBLE: Record<GarminSport, WorkoutKind[]> = {
  run: ['run', 'trail'],
  trail: ['trail', 'run'],
  strength: ['strength'],
  cross: ['cross'],
}

type MatchActivity = { garmin_activity_id: number; local_date: IsoDate; start_time: string; activity_type: string }
type MatchWorkout = { id: string; scheduled_on: IsoDate; kind: WorkoutKind; position: number }

/**
 * Rattache chaque activité à une séance prévue le même jour et d'un sport compatible.
 *
 * - Un rattachement déjà enregistré (`existing`) est gardé tel quel.
 * - Une séance ne reçoit qu'une activité ; avec deux séances le même jour (biquotidien), les
 *   activités sont prises dans l'ordre de l'heure de départ, et les séances dans leur ordre de la journée.
 * - Le sport exact passe avant le sport voisin (une sortie trail va d'abord sur la séance de trail).
 */
export function matchActivities(
  activities: MatchActivity[],
  workouts: MatchWorkout[],
  existing: Map<number, string | null> = new Map(),
): Map<number, string | null> {
  const result = new Map<number, string | null>()
  const taken = new Set<string>()
  for (const [garminId, workoutId] of existing) {
    if (workoutId) taken.add(workoutId)
    result.set(garminId, workoutId)
  }
  const pending = activities
    .filter((a) => !existing.get(a.garmin_activity_id))
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
  for (const activity of pending) {
    const kinds = COMPATIBLE[garminSport(activity.activity_type)]
    const candidates = workouts
      .filter((w) => w.scheduled_on === activity.local_date && !taken.has(w.id) && kinds.includes(w.kind))
      .sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind) || a.position - b.position)
    const chosen = candidates[0]?.id ?? null
    if (chosen) taken.add(chosen)
    result.set(activity.garmin_activity_id, chosen)
  }
  return result
}

type Displayed = {
  activity_type: string
  duration_s: number | null
  moving_s: number | null
  distance_m: number | null
  elevation_gain_m: number | null
  avg_hr: number | null
  max_hr: number | null
}

/** Allure moyenne (s/km), sur le temps en mouvement s'il est connu. Seulement pour la course. */
export function averagePace(activity: Displayed): number | null {
  const sport = garminSport(activity.activity_type)
  const seconds = activity.moving_s ?? activity.duration_s
  if ((sport !== 'run' && sport !== 'trail') || !seconds || !activity.distance_m || activity.distance_m < 100) return null
  return seconds / (activity.distance_m / 1000)
}

/** Les chiffres d'une activité, dans l'ordre d'affichage : [libellé, valeur]. */
export function activityFigures(activity: Displayed): [string, string][] {
  const figures: [string, string][] = []
  if (activity.duration_s) figures.push(['Durée', formatDuration(activity.duration_s)])
  if (activity.distance_m) figures.push(['Distance', formatDistance(activity.distance_m)])
  const pace = averagePace(activity)
  if (pace !== null) figures.push(['Allure', `${formatPace(pace)} /km`])
  if (activity.avg_hr) figures.push(['FC moy.', `${activity.avg_hr} bpm`])
  if (activity.max_hr) figures.push(['FC max', `${activity.max_hr} bpm`])
  if (activity.elevation_gain_m !== null) figures.push(['D+', `${activity.elevation_gain_m} m`])
  return figures
}

/** Message affiché quand l'import échoue, selon la réponse de la fonction. */
export function importErrorMessage(code: string | null): string {
  switch (code) {
    case 'not_allowed':
      return 'L’import Garmin n’est pas encore ouvert pour ton compte.'
    case 'not_configured':
      return 'L’import Garmin n’est pas encore configuré (clé Garmin manquante dans Supabase).'
    case 'garmin_key_rejected':
      return 'Garmin refuse la clé : elle a peut-être expiré. Crée-en une nouvelle dans Garmin Connect.'
    case 'garmin_unavailable':
      return 'Garmin ne répond pas pour le moment. Réessaie dans quelques minutes.'
    case 'not_signed_in':
      return 'Ta session a expiré : reconnecte-toi.'
    default:
      return 'L’import Garmin n’est pas disponible pour le moment.'
  }
}
