/**
 * Retour de séance de l'athlète : séance faite ou non, durée, distance, D+,
 * ressenti (RPE de 1 à 10) et douleurs. Mêmes règles que la base
 * (table workout_feedback, fonction pain_is_valid).
 */
import { parseDecimalField, parseIntegerField } from './drafts.ts'
import { type WorkoutTotals, formatDistance, formatDuration } from './workouts.ts'

export type FeedbackStatus = 'done' | 'partial' | 'skipped'

export const FEEDBACK_STATUS: Record<FeedbackStatus, { label: string; short: string; icon: string }> = {
  done: { label: 'Faite', short: 'Faite', icon: '✓' },
  partial: { label: 'Faite en partie', short: 'En partie', icon: '≈' },
  skipped: { label: 'Pas faite', short: 'Pas faite', icon: '✕' },
}

export type PainLocation =
  | 'foot'
  | 'ankle'
  | 'achilles'
  | 'calf'
  | 'shin'
  | 'knee'
  | 'quadriceps'
  | 'hamstring'
  | 'hip'
  | 'glute'
  | 'lower_back'
  | 'other'

export const PAIN_LOCATIONS: Record<PainLocation, string> = {
  foot: 'Pied',
  ankle: 'Cheville',
  achilles: 'Tendon d’Achille',
  calf: 'Mollet',
  shin: 'Tibia',
  knee: 'Genou',
  quadriceps: 'Cuisse (avant)',
  hamstring: 'Ischio-jambiers',
  hip: 'Hanche',
  glute: 'Fessier',
  lower_back: 'Bas du dos',
  other: 'Autre',
}

export type PainSide = 'left' | 'right' | 'both' | 'none'

export const PAIN_SIDES: Record<PainSide, string> = {
  left: 'gauche',
  right: 'droite',
  both: 'des deux côtés',
  none: '',
}

export type Pain = { location: PainLocation; side: PainSide; intensity: number }

export const MAX_PAINS = 6

/** Échelle de Borg modifiée (CR-10), en mots simples. */
export const RPE_LABELS: Record<number, string> = {
  1: 'Très facile',
  2: 'Facile',
  3: 'Modéré',
  4: 'Un peu dur',
  5: 'Dur',
  6: 'Dur +',
  7: 'Très dur',
  8: 'Très dur +',
  9: 'Presque maximal',
  10: 'Maximal',
}

export const FEEDBACK_LIMITS = { seconds: 172_800, meters: 1_000_000, elevation: 30_000 }

export type Feedback = {
  status: FeedbackStatus
  duration_s: number | null
  distance_m: number | null
  elevation_gain_m: number | null
  rpe: number | null
  pain: Pain[]
}

/** Valeurs du formulaire, en texte. */
export type FeedbackDraft = {
  status: FeedbackStatus
  hours: string
  minutes: string
  km: string
  elevation: string
  rpe: number | null
  pain: Pain[]
}

export type FeedbackErrors = Partial<Record<'duration' | 'km' | 'elevation' | 'rpe' | 'pain', string>>

/** Brouillon pré-rempli : le retour existant, sinon les estimations de la séance prévue. */
export function feedbackToDraft(feedback: Feedback | null, planned?: WorkoutTotals): FeedbackDraft {
  const seconds = feedback ? feedback.duration_s : planned && planned.seconds > 0 ? planned.seconds : null
  const meters = feedback ? feedback.distance_m : planned && planned.meters > 0 ? planned.meters : null
  const minutesTotal = seconds === null ? null : Math.round(seconds / 60)
  return {
    status: feedback?.status ?? 'done',
    hours: minutesTotal === null ? '' : String(Math.floor(minutesTotal / 60)),
    minutes: minutesTotal === null ? '' : String(minutesTotal % 60),
    km: meters === null ? '' : String(Math.round(meters / 10) / 100).replace('.', ','),
    elevation: feedback?.elevation_gain_m == null ? '' : String(feedback.elevation_gain_m),
    rpe: feedback?.rpe ?? null,
    pain: feedback?.pain ?? [],
  }
}

/** Contrôle et conversion du formulaire. Une séance « pas faite » n'a ni durée, ni distance, ni RPE. */
export function draftToFeedback(draft: FeedbackDraft): { feedback: Feedback | null; errors: FeedbackErrors } {
  const errors: FeedbackErrors = {}
  const skipped = draft.status === 'skipped'

  let duration: number | null = null
  const hours = parseIntegerField(draft.hours)
  const minutes = parseIntegerField(draft.minutes)
  if (hours.error || minutes.error) {
    errors.duration = 'Heures et minutes en nombres entiers'
  } else if (hours.value !== null || minutes.value !== null) {
    if ((minutes.value ?? 0) >= 60 && hours.value !== null) {
      errors.duration = 'Minutes : de 0 à 59'
    } else {
      duration = (hours.value ?? 0) * 3600 + (minutes.value ?? 0) * 60
      if (duration < 60 || duration > FEEDBACK_LIMITS.seconds) errors.duration = 'Durée entre 1 min et 48 h'
    }
  }

  let distance: number | null = null
  const km = parseDecimalField(draft.km)
  if (km.error) errors.km = km.error
  else if (km.value !== null) {
    distance = Math.round(km.value * 1000)
    if (distance > FEEDBACK_LIMITS.meters) errors.km = '1 000 km au plus'
  }

  const elevation = parseIntegerField(draft.elevation)
  if (elevation.error) errors.elevation = elevation.error
  else if (elevation.value !== null && elevation.value > FEEDBACK_LIMITS.elevation) errors.elevation = '30 000 m au plus'

  if (draft.rpe !== null && !(Number.isInteger(draft.rpe) && draft.rpe >= 1 && draft.rpe <= 10)) {
    errors.rpe = 'RPE de 1 à 10'
  }

  const painError = validatePain(draft.pain)
  if (painError) errors.pain = painError

  if (Object.keys(errors).length > 0) return { feedback: null, errors }
  return {
    feedback: {
      status: draft.status,
      duration_s: skipped ? null : duration,
      distance_m: skipped ? null : distance,
      elevation_gain_m: skipped ? null : elevation.value,
      rpe: skipped ? null : draft.rpe,
      pain: draft.pain,
    },
    errors,
  }
}

export function validatePain(pain: Pain[]): string | null {
  if (pain.length > MAX_PAINS) return `${MAX_PAINS} douleurs au plus`
  for (const item of pain) {
    if (!(item.location in PAIN_LOCATIONS) || !(item.side in PAIN_SIDES)) return 'Douleur incomplète'
    if (!Number.isInteger(item.intensity) || item.intensity < 1 || item.intensity > 10) return 'Intensité de 1 à 10'
  }
  // Même endroit et même côté en double : sans doute une erreur de saisie.
  const keys = pain.map((p) => `${p.location}-${p.side}`)
  if (new Set(keys).size !== keys.length) return 'Cette douleur est déjà indiquée'
  return null
}

/** « Genou gauche 4/10 ». */
export function describePain(pain: Pain): string {
  const side = PAIN_SIDES[pain.side]
  return `${PAIN_LOCATIONS[pain.location]}${side ? ` ${side}` : ''} ${pain.intensity}/10`
}

/** Douleur la plus forte (0 s'il n'y en a pas). */
export function maxPain(pain: Pain[]): number {
  return pain.reduce((max, p) => Math.max(max, p.intensity), 0)
}

/** « Faite · 1 h 05 · 12,4 km · D+ 150 m · RPE 6 ». */
export function formatFeedback(feedback: Feedback): string {
  const parts: string[] = [FEEDBACK_STATUS[feedback.status].label]
  if (feedback.duration_s) parts.push(formatDuration(feedback.duration_s))
  if (feedback.distance_m) parts.push(formatDistance(feedback.distance_m))
  if (feedback.elevation_gain_m) parts.push(`D+ ${feedback.elevation_gain_m} m`)
  if (feedback.rpe) parts.push(`RPE ${feedback.rpe}`)
  return parts.join(' · ')
}

/** Couleur d'alerte d'une douleur : légère (1-3), modérée (4-6), forte (7-10). */
export function painLevel(intensity: number): 'none' | 'light' | 'moderate' | 'strong' {
  if (intensity <= 0) return 'none'
  if (intensity <= 3) return 'light'
  if (intensity <= 6) return 'moderate'
  return 'strong'
}
