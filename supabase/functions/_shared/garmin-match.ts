// Conversion des activités Garmin et rattachement aux séances prévues, sans dépendance :
// partagé par le site (src/domain/garmin.ts, qui le teste) et la fonction garmin-sync.
import type { GarminSummary } from './garmin-api.ts'

/** Sports d'une séance prévue (comme workouts.kind). */
export type WorkoutKind = 'run' | 'trail' | 'strength' | 'cross' | 'rest'

/** Valeurs enregistrées dans garmin_activities. */
export type GarminActivityValues = {
  garmin_activity_id: number
  start_time: string
  local_date: string
  activity_type: string
  name: string
  duration_s: number | null
  moving_s: number | null
  distance_m: number | null
  elevation_gain_m: number | null
  elevation_loss_m: number | null
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
    elevation_loss_m: bounded(summary.elevationLoss, 0, 30_000),
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

type MatchActivity = { garmin_activity_id: number; local_date: string; start_time: string; activity_type: string }
export type MatchWorkout = { id: string; scheduled_on: string; kind: WorkoutKind; position: number }

const DAY_MS = 86_400_000
/** Veille d'une date AAAA-MM-JJ. */
const dayBefore = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10)

/**
 * Rattache chaque activité à une séance prévue d'un sport compatible.
 *
 * - D'abord le même jour (heure locale de la montre), pour toutes les activités ;
 * - puis, pour celles qui restent, la séance de la **veille** encore libre : une séance faite avec un jour
 *   de retard. Jamais celle du lendemain, qui n'a peut-être pas encore été courue.
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
  const assign = (activity: MatchActivity, date: string) => {
    const kinds = COMPATIBLE[garminSport(activity.activity_type)]
    const chosen = workouts
      .filter((w) => w.scheduled_on === date && !taken.has(w.id) && kinds.includes(w.kind))
      .sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind) || a.position - b.position)[0]
    if (chosen) taken.add(chosen.id)
    return chosen?.id ?? null
  }
  for (const activity of pending) result.set(activity.garmin_activity_id, assign(activity, activity.local_date))
  for (const activity of pending) {
    if (result.get(activity.garmin_activity_id)) continue
    result.set(activity.garmin_activity_id, assign(activity, dayBefore(activity.local_date)))
  }
  return result
}

/** Lignes à enregistrer : activités utilisables, chacune avec sa séance (ou aucune). */
export function planImport(
  summaries: GarminSummary[],
  workouts: MatchWorkout[],
  existing: Map<number, string | null>,
): (GarminActivityValues & { workout_id: string | null })[] {
  const values = summaries.map(summaryToActivity).filter((v): v is GarminActivityValues => v !== null)
  const links = matchActivities(values, workouts, existing)
  return values.map((v) => ({ ...v, workout_id: links.get(v.garmin_activity_id) ?? null }))
}
