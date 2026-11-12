/**
 * Mode de coaching « souple » : le coach donne un volume hebdomadaire (fourchette de
 * kilomètres) et des séances à faire dans la semaine ; l'athlète choisit ses jours.
 * Ce fichier calcule où en est la semaine : séances faites, séances restantes, kilomètres restants.
 */
import { type IsoDate, addDays, formatLongDay, formatWeekRange, startOfWeek } from './calendar.ts'
import type { FeedbackStatus } from './feedback.ts'
import { garminSport } from './garmin.ts'
import type { WorkoutKind } from './workouts.ts'

export type CoachingMode = 'strict' | 'flexible'

export const COACHING_MODES: Record<CoachingMode, { label: string; summary: string }> = {
  strict: {
    label: 'Strict',
    summary: 'Tu fixes les jours et les séances. L’athlète suit le calendrier et met chaque séance sur sa montre.',
  },
  flexible: {
    label: 'Souple',
    summary:
      'Tu donnes un volume de kilomètres et les séances de la semaine. L’athlète s’organise comme il veut ; vous voyez tous les deux ce qui est fait et ce qui reste.',
  },
}

/** Lundi et dimanche de la semaine d'une date. */
export function weekRange(date: IsoDate): { from: IsoDate; to: IsoDate } {
  const from = startOfWeek(date)
  return { from, to: addDays(from, 6) }
}

type Placeable = { flexible: boolean; placed_at: string | null }

/** Séance souple dont l'athlète n'a pas encore choisi le jour (rangée au lundi en attendant). */
export function isUnplaced(workout: Placeable): boolean {
  return workout.flexible && workout.placed_at === null
}

/** Séances à montrer à leur date : tout sauf les séances souples pas encore placées. */
export function datedWorkouts<T extends Placeable>(workouts: T[]): T[] {
  return workouts.filter((workout) => !isUnplaced(workout))
}

/** Jour d'une séance, tel qu'on l'affiche : son jour, ou « à faire dans la semaine du … » tant qu'il n'est pas choisi. */
export function workoutDayLabel(workout: Placeable & { scheduled_on: IsoDate }): string {
  return isUnplaced(workout) ? `À faire dans la semaine du ${formatWeekRange(workout.scheduled_on)}` : formatLongDay(workout.scheduled_on)
}

export type WeekTarget = { km_min: number; km_max: number }

export type WeekWorkout = Placeable & {
  id: string
  kind: WorkoutKind
  title: string
  scheduled_on: IsoDate
}

/** Retour de l'athlète sur une séance (vue workout_activity). */
export type WeekFeedback = { status: FeedbackStatus | null; distance_m: number | null }

export type WeekWatchActivity = {
  workout_id: string | null
  local_date: IsoDate
  activity_type: string
  distance_m: number | null
}

export type WeekRun = { run_on: IsoDate; distance_m: number }

export type SessionState = 'todo' | 'done' | 'partial' | 'skipped'

export type WeekSession<W extends WeekWorkout = WeekWorkout> = {
  workout: W
  state: SessionState
  /** Jour choisi par l'athlète (ou jour de la séance faite) ; rien tant qu'elle est « à placer ». */
  day: IsoDate | null
}

export type VolumeStatus = 'none' | 'below' | 'within' | 'above'

export type WeekSummary<W extends WeekWorkout = WeekWorkout> = {
  /** Kilomètres de course faits dans la semaine (une décimale). */
  doneKm: number
  /** D'où viennent ces kilomètres. */
  sources: { watchKm: number; declaredKm: number; feedbackKm: number }
  target: WeekTarget | null
  /** Kilomètres restants pour entrer dans la fourchette (min) et pour ne pas la dépasser (max). */
  remaining: { min: number; max: number } | null
  volume: VolumeStatus
  /** Séances souples de la semaine, celles qui restent à faire d'abord. */
  sessions: WeekSession<W>[]
  todo: number
  done: number
}

const RUN_KINDS: WorkoutKind[] = ['run', 'trail']
const round1 = (value: number) => Math.round(value * 10) / 10
const inWeek = (date: IsoDate, week: { from: IsoDate; to: IsoDate }) => date >= week.from && date <= week.to

/** État d'une séance : le retour de l'athlète prime ; sans retour, une activité de la montre rattachée vaut « faite ». */
export function sessionState(feedback: WeekFeedback | undefined, hasWatchActivity: boolean): SessionState {
  if (feedback?.status === 'done') return 'done'
  if (feedback?.status === 'partial') return 'partial'
  if (feedback?.status === 'skipped') return 'skipped'
  return hasWatchActivity ? 'done' : 'todo'
}

const STATE_ORDER: Record<SessionState, number> = { todo: 0, partial: 1, done: 2, skipped: 3 }

/**
 * Bilan d'une semaine.
 *
 * Kilomètres comptés (course et trail seulement), sans jamais compter deux fois la même sortie :
 *  - les activités de la montre de la semaine ;
 *  - les sorties déclarées à la main par l'athlète ;
 *  - la distance saisie dans le retour d'une séance faite, sauf si la montre a déjà enregistré cette sortie
 *    (activité rattachée à la séance, ou course enregistrée le même jour).
 */
export function weekSummary<W extends WeekWorkout>(input: {
  week: IsoDate
  target: WeekTarget | null
  workouts: W[]
  feedback: Map<string, WeekFeedback>
  watch: WeekWatchActivity[]
  runs: WeekRun[]
}): WeekSummary<W> {
  const week = weekRange(input.week)
  const workouts = input.workouts.filter((workout) => inWeek(workout.scheduled_on, week))
  const watch = input.watch.filter((activity) => inWeek(activity.local_date, week))
  const watched = new Set(watch.map((activity) => activity.workout_id).filter((id) => id !== null))

  const watchRuns = watch.filter((activity) => ['run', 'trail'].includes(garminSport(activity.activity_type)))
  const watchDays = new Set(watchRuns.map((activity) => activity.local_date))
  const watchM = watchRuns.reduce((sum, activity) => sum + (activity.distance_m ?? 0), 0)
  const declaredM = input.runs.filter((run) => inWeek(run.run_on, week)).reduce((sum, run) => sum + run.distance_m, 0)
  const feedbackM = workouts
    .filter((workout) => RUN_KINDS.includes(workout.kind) && !watched.has(workout.id) && !watchDays.has(workout.scheduled_on))
    .reduce((sum, workout) => {
      const feedback = input.feedback.get(workout.id)
      return feedback && (feedback.status === 'done' || feedback.status === 'partial') ? sum + (feedback.distance_m ?? 0) : sum
    }, 0)

  const doneKm = round1((watchM + declaredM + feedbackM) / 1000)
  const target = input.target
  const remaining = target
    ? { min: round1(Math.max(0, target.km_min - doneKm)), max: round1(Math.max(0, target.km_max - doneKm)) }
    : null
  const volume: VolumeStatus = !target ? 'none' : doneKm < target.km_min ? 'below' : doneKm > target.km_max ? 'above' : 'within'

  const sessions = workouts
    .filter((workout) => workout.flexible && workout.kind !== 'rest')
    .map((workout): WeekSession<W> => {
      const state = sessionState(input.feedback.get(workout.id), watched.has(workout.id))
      return { workout, state, day: isUnplaced(workout) ? null : workout.scheduled_on }
    })
    .sort(
      (a, b) =>
        STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
        (a.day ?? '9999').localeCompare(b.day ?? '9999') ||
        a.workout.title.localeCompare(b.workout.title, 'fr'),
    )

  return {
    doneKm,
    sources: { watchKm: round1(watchM / 1000), declaredKm: round1(declaredM / 1000), feedbackKm: round1(feedbackM / 1000) },
    target,
    remaining,
    volume,
    sessions,
    todo: sessions.filter((session) => session.state === 'todo').length,
    done: sessions.filter((session) => session.state === 'done' || session.state === 'partial').length,
  }
}

const km = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

/** 12.5 → « 12,5 km ». */
export function formatKm(value: number): string {
  return `${km.format(value)} km`
}

/** « 35 à 45 km », ou « 40 km » quand les deux bornes sont égales. */
export function formatTarget(target: WeekTarget): string {
  return target.km_min === target.km_max ? formatKm(target.km_max) : `${km.format(target.km_min)} à ${formatKm(target.km_max)}`
}

/** Phrase sur les kilomètres restants, du point de vue de l'athlète (`you`) ou du coach. */
export function describeRemaining(summary: WeekSummary, you = true): string {
  if (!summary.target || !summary.remaining) return ''
  const { min, max } = summary.remaining
  if (summary.volume === 'above') {
    return `Fourchette dépassée de ${formatKm(round1(summary.doneKm - summary.target.km_max))}.`
  }
  if (summary.volume === 'within') {
    return max > 0
      ? `Objectif atteint. ${you ? `Tu peux encore ajouter jusqu’à ${formatKm(max)}` : `Encore ${formatKm(max)} possibles dans la fourchette`}.`
      : 'Objectif atteint, en haut de la fourchette.'
  }
  const range = min === max ? formatKm(max) : `entre ${km.format(min)} et ${formatKm(max)}`
  return `${you ? 'Il te reste' : 'Il reste'} ${range} à courir.`
}

/** Position (en %) du volume fait et de la fourchette sur une barre, dont le bout vaut un peu plus que le maximum. */
export function volumeBar(summary: WeekSummary): { done: number; from: number; to: number } | null {
  if (!summary.target) return null
  const scale = Math.max(summary.target.km_max * 1.15, summary.doneKm, 1)
  const pct = (value: number) => Math.round((value / scale) * 1000) / 10
  return { done: pct(Math.min(summary.doneKm, scale)), from: pct(summary.target.km_min), to: pct(summary.target.km_max) }
}

export const SESSION_STATES: Record<SessionState, { label: string; icon: string }> = {
  todo: { label: 'À faire', icon: '○' },
  done: { label: 'Faite', icon: '✓' },
  partial: { label: 'Faite en partie', icon: '◐' },
  skipped: { label: 'Non faite', icon: '✕' },
}

export type TargetDraft = { min: string; max: string }

/** Lit les deux champs « de … à … km » du coach. Un seul champ rempli vaut pour les deux bornes. */
export function parseTarget(draft: TargetDraft): { target: WeekTarget | null; error: string | null } {
  const read = (text: string) => {
    const trimmed = text.trim().replace(',', '.')
    if (trimmed === '') return null
    const value = Number(trimmed)
    return Number.isFinite(value) ? round1(value) : Number.NaN
  }
  const min = read(draft.min)
  const max = read(draft.max)
  if (min === null && max === null) return { target: null, error: null }
  if (Number.isNaN(min) || Number.isNaN(max)) return { target: null, error: 'Indique des kilomètres en chiffres.' }
  const low = min ?? max ?? 0
  const high = max ?? min ?? 0
  if (low < 0 || high <= 0 || high > 500) return { target: null, error: 'Le volume doit être compris entre 0 et 500 km.' }
  if (low > high) return { target: null, error: 'Le minimum dépasse le maximum.' }
  return { target: { km_min: low, km_max: high }, error: null }
}
