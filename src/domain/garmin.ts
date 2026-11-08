/**
 * Activités Garmin (0.4.0, test perso) : conversion de la liste renvoyée par
 * Garmin, rattachement aux séances prévues et affichage.
 */
import type { GarminSummary } from '../../supabase/functions/_shared/garmin-api.ts'
import { type GarminSport, garminSport } from '../../supabase/functions/_shared/garmin-match.ts'
import { addDays, type IsoDate } from './calendar.ts'
import { formatPace } from './pace.ts'
import { formatDistance, formatDuration } from './workouts.ts'

export type { GarminSummary }
// Conversion et rattachement : partagés avec la fonction garmin-sync, qui tourne sans le site.
export {
  type GarminActivityValues,
  type GarminSport,
  garminSport,
  matchActivities,
  planImport,
  summaryToActivity,
} from '../../supabase/functions/_shared/garmin-match.ts'

/** Nombre de jours relus à chaque import (aujourd'hui compris). */
export const IMPORT_DAYS = 14

/** Période relue à chaque import : les 14 derniers jours. */
export function importRange(today: IsoDate): { from: IsoDate; to: IsoDate } {
  return { from: addDays(today, -(IMPORT_DAYS - 1)), to: today }
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
