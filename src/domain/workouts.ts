import { PACE_MAX, PACE_MIN, formatPace } from './pace.ts'
import { type HrZone, formatHrRange, formatPaceRange } from './zones.ts'

/**
 * Contenu d'une séance : une suite d'étapes et de blocs répétés, comme sur
 * une montre Garmin. Mêmes clés que le JSON stocké en base (workouts.steps),
 * contrôlé côté base par workout_steps_are_valid.
 */

export type StepKind = 'warmup' | 'active' | 'recovery' | 'rest' | 'cooldown'

export type StepDuration =
  | { type: 'time'; seconds: number }
  | { type: 'distance'; meters: number }
  /** Jusqu'à l'appui sur le bouton « tour ». */
  | { type: 'open' }

export type StepTarget =
  | { type: 'none' }
  | { type: 'zone'; zone: number }
  /** Allures en secondes par km : fast ≤ slow. */
  | { type: 'pace'; fast: number; slow: number }
  | { type: 'hr'; min: number; max: number }

export type WorkoutStep = {
  type: 'step'
  kind: StepKind
  duration: StepDuration
  target: StepTarget
  note: string
}

export type RepeatBlock = { type: 'repeat'; count: number; steps: WorkoutStep[] }

export type WorkoutItem = WorkoutStep | RepeatBlock

export type WorkoutKind = 'run' | 'trail' | 'strength' | 'cross' | 'rest'

export const WORKOUT_KINDS: Record<WorkoutKind, string> = {
  run: 'Course',
  trail: 'Trail',
  strength: 'Renforcement',
  cross: 'Autre sport',
  rest: 'Repos',
}

export const STEP_KINDS: Record<StepKind, string> = {
  warmup: 'Échauffement',
  active: 'Effort',
  recovery: 'Récupération',
  rest: 'Repos',
  cooldown: 'Retour au calme',
}

export const LIMITS = {
  items: 40,
  repeatSteps: 10,
  repeatCount: 99,
  seconds: 86_400,
  meters: 500_000,
  note: 200,
  hr: { min: 30, max: 250 },
}

// -----------------------------------------------------------------------------
// Création
// -----------------------------------------------------------------------------

export function newStep(kind: StepKind, duration: StepDuration, target: StepTarget = { type: 'none' }): WorkoutStep {
  return { type: 'step', kind, duration, target, note: '' }
}

/** Les briques proposées par le constructeur de séances. */
export const STEP_PRESETS = {
  warmup: () => newStep('warmup', { type: 'time', seconds: 20 * 60 }, { type: 'zone', zone: 2 }),
  active: () => newStep('active', { type: 'time', seconds: 10 * 60 }, { type: 'zone', zone: 3 }),
  recovery: () => newStep('recovery', { type: 'time', seconds: 2 * 60 }, { type: 'zone', zone: 1 }),
  cooldown: () => newStep('cooldown', { type: 'time', seconds: 10 * 60 }, { type: 'zone', zone: 1 }),
  repeat: (): RepeatBlock => ({
    type: 'repeat',
    count: 10,
    steps: [
      newStep('active', { type: 'distance', meters: 400 }, { type: 'zone', zone: 5 }),
      newStep('recovery', { type: 'time', seconds: 90 }, { type: 'zone', zone: 1 }),
    ],
  }),
}

// -----------------------------------------------------------------------------
// Cibles : une zone se traduit en FC et en allure d'après les zones de l'athlète
// -----------------------------------------------------------------------------

export type ResolvedTarget = {
  /** « Z4 Seuil », « 4:30-4:40 /km », « 150-160 bpm » ou « Libre ». */
  label: string
  hrMin: number | null
  hrMax: number | null
  /** Allure la plus rapide et la plus lente (s/km). */
  paceFast: number | null
  paceSlow: number | null
  /** Zone de l'athlète, quand la cible en est une. */
  zone: HrZone | null
}

const EMPTY_TARGET: Omit<ResolvedTarget, 'label'> = {
  hrMin: null,
  hrMax: null,
  paceFast: null,
  paceSlow: null,
  zone: null,
}

export function resolveTarget(target: StepTarget, zones: HrZone[]): ResolvedTarget {
  switch (target.type) {
    case 'none':
      return { ...EMPTY_TARGET, label: 'Libre' }
    case 'pace':
      return {
        ...EMPTY_TARGET,
        label: formatPaceRange({ pace_fast: target.fast, pace_slow: target.slow }),
        paceFast: target.fast,
        paceSlow: target.slow,
      }
    case 'hr':
      return {
        ...EMPTY_TARGET,
        label: formatHrRange({ hr_min: target.min, hr_max: target.max }),
        hrMin: target.min,
        hrMax: target.max,
      }
    case 'zone': {
      const zone = zones.find((candidate) => candidate.zone === target.zone) ?? null
      return {
        label: zone ? `Z${zone.zone} ${zone.name}` : `Z${target.zone}`,
        hrMin: zone?.hr_min ?? null,
        hrMax: zone?.hr_max ?? null,
        paceFast: zone?.pace_fast ?? null,
        paceSlow: zone?.pace_slow ?? null,
        zone,
      }
    }
  }
}

/** « 161-173 bpm · 4:30-4:50 /km » : la traduction concrète d'une cible. */
export function describeTargetValues(resolved: ResolvedTarget): string {
  return [
    formatHrRange({ hr_min: resolved.hrMin, hr_max: resolved.hrMax }),
    formatPaceRange({ pace_fast: resolved.paceFast, pace_slow: resolved.paceSlow }),
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Allure de référence d'une cible (milieu de la plage), pour les estimations. */
export function referencePace(resolved: ResolvedTarget): number | null {
  const { paceFast, paceSlow } = resolved
  if (paceFast !== null && paceSlow !== null) return (paceFast + paceSlow) / 2
  return paceFast ?? paceSlow
}

// -----------------------------------------------------------------------------
// Durée et distance totales estimées
// -----------------------------------------------------------------------------

export type WorkoutTotals = {
  seconds: number
  meters: number
  /** Faux si une partie n'a pas pu être estimée (étape libre, allure inconnue). */
  complete: boolean
}

function stepTotals(step: WorkoutStep, zones: HrZone[]): WorkoutTotals {
  const pace = referencePace(resolveTarget(step.target, zones))
  switch (step.duration.type) {
    case 'open':
      return { seconds: 0, meters: 0, complete: false }
    case 'time': {
      const { seconds } = step.duration
      if (step.kind === 'rest') return { seconds, meters: 0, complete: true }
      if (pace === null) return { seconds, meters: 0, complete: false }
      return { seconds, meters: (seconds / pace) * 1000, complete: true }
    }
    case 'distance': {
      const { meters } = step.duration
      if (pace === null) return { seconds: 0, meters, complete: false }
      return { seconds: (meters / 1000) * pace, meters, complete: true }
    }
  }
}

/** Durée (s) et distance (m) totales, estimées à partir des allures des cibles. */
export function workoutTotals(items: WorkoutItem[], zones: HrZone[]): WorkoutTotals {
  const total: WorkoutTotals = { seconds: 0, meters: 0, complete: true }
  const add = (part: WorkoutTotals, times = 1) => {
    total.seconds += part.seconds * times
    total.meters += part.meters * times
    total.complete &&= part.complete
  }
  for (const item of items) {
    if (item.type === 'step') add(stepTotals(item, zones))
    else for (const step of item.steps) add(stepTotals(step, zones), item.count)
  }
  return { seconds: Math.round(total.seconds), meters: Math.round(total.meters), complete: total.complete }
}

// -----------------------------------------------------------------------------
// Affichage
// -----------------------------------------------------------------------------

/** 90 → « 1 min 30 », 3600 → « 1 h », 4500 → « 1 h 15 », 45 → « 45 s ». */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.round(totalSeconds)
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return m > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`
  if (m > 0) return s > 0 ? `${m} min ${String(s).padStart(2, '0')}` : `${m} min`
  return `${s} s`
}

const kmFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

/** 400 → « 400 m », 2000 → « 2 km », 12 400 → « 12,4 km ». */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${kmFormatter.format(Math.round(meters / 10) / 100)} km`
}

export function formatStepDuration(duration: StepDuration): string {
  switch (duration.type) {
    case 'time':
      return formatDuration(duration.seconds)
    case 'distance':
      return formatDistance(duration.meters)
    case 'open':
      return 'Jusqu’au bouton tour'
  }
}

/** Cible courte : « Z5 », « 4:30-4:40 /km », « 150-160 bpm », ou chaîne vide. */
export function formatTargetShort(target: StepTarget): string {
  switch (target.type) {
    case 'none':
      return ''
    case 'zone':
      return `Z${target.zone}`
    case 'pace':
      return formatPaceRange({ pace_fast: target.fast, pace_slow: target.slow })
    case 'hr':
      return formatHrRange({ hr_min: target.min, hr_max: target.max })
  }
}

function stepShort(step: WorkoutStep): string {
  const parts = [step.duration.type === 'open' ? 'libre' : formatStepDuration(step.duration)]
  const target = formatTargetShort(step.target)
  if (target) parts.push(target)
  if (step.kind === 'recovery' || step.kind === 'rest') parts.push('récup')
  return parts.join(' ')
}

/** Résumé d'une ligne : « 20 min Z2 · 10 × (400 m Z5 + 1 min 30 Z1 récup) · 10 min Z1 ». */
export function summarizeWorkout(items: WorkoutItem[]): string {
  return items
    .map((item) => {
      if (item.type === 'step') return stepShort(item)
      const inner = item.steps.map(stepShort).join(' + ')
      return `${item.count} × ${item.steps.length > 1 ? `(${inner})` : inner}`
    })
    .join(' · ')
}

/** « ≈ 1 h 05 · 12,4 km » ; « ≈ » quand une partie n'a pas pu être estimée. */
export function formatTotals(totals: WorkoutTotals): string {
  const parts: string[] = []
  if (totals.seconds > 0) parts.push(formatDuration(totals.seconds))
  if (totals.meters > 0) parts.push(formatDistance(totals.meters))
  if (parts.length === 0) return ''
  return `${totals.complete ? '' : '≥ '}${parts.join(' · ')}`
}

/** « 1 h 01 · 11,08 km — 20 min Z2 · 10 × (…) » : totaux et résumé, pour les listes. */
export function describeWorkout(workout: { steps: WorkoutItem[] }, zones: HrZone[]): string {
  return [formatTotals(workoutTotals(workout.steps, zones)), summarizeWorkout(workout.steps)].filter(Boolean).join(' — ')
}

// -----------------------------------------------------------------------------
// Saisie
// -----------------------------------------------------------------------------

/**
 * Durée saisie à la main : « 15 » (minutes), « 1:30 » (min:s), « 1:05:00 »
 * (h:min:s), « 1h30 », « 45s », « 90 s ». Renvoie des secondes, ou null.
 */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, '').replace(',', '.')
  if (text === '') return null
  let seconds: number | null = null
  let match: RegExpExecArray | null
  if ((match = /^(\d+(?:\.\d+)?)(?:min|mn|m|')?$/.exec(text))) {
    seconds = Number(match[1]) * 60
  } else if ((match = /^(\d+)(?:s|sec|")$/.exec(text))) {
    seconds = Number(match[1])
  } else if ((match = /^(\d+):([0-5]\d)$/.exec(text))) {
    seconds = Number(match[1]) * 60 + Number(match[2])
  } else if ((match = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(text))) {
    seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
  } else if ((match = /^(\d+)h(?:([0-5]?\d)(?:min|mn|m)?)?$/.exec(text))) {
    seconds = Number(match[1]) * 3600 + Number(match[2] ?? 0) * 60
  }
  if (seconds === null) return null
  seconds = Math.round(seconds)
  return seconds >= 1 && seconds <= LIMITS.seconds ? seconds : null
}

/** Durée en secondes → texte modifiable : 90 → « 1:30 », 3600 → « 1:00:00 », 900 → « 15 ». */
export function durationInput(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  if (s === 0) return String(m)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Distance saisie : « 400 », « 400 m », « 2 km », « 2,5km », « 2.5 » (km si < 50). */
export function parseDistance(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, '').replace(',', '.')
  const match = /^(\d+(?:\.\d+)?)(km|k|m)?$/.exec(text)
  if (!match) return null
  const value = Number(match[1])
  const unit = match[2] ?? (value < 50 ? 'km' : 'm')
  const meters = Math.round(unit === 'm' ? value : value * 1000)
  return meters >= 1 && meters <= LIMITS.meters ? meters : null
}

/** 400 → « 400 m », 2500 → « 2,5 km ». */
export function distanceInput(meters: number): string {
  if (meters < 1000 || meters % 100 !== 0) return `${meters} m`
  return `${String(meters / 1000).replace('.', ',')} km`
}

// -----------------------------------------------------------------------------
// Contrôle (mêmes règles que la base)
// -----------------------------------------------------------------------------

const isInt = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max

/** Message d'erreur pour une étape, ou null si elle est valide. */
export function stepError(step: WorkoutStep): string | null {
  const { duration, target } = step
  if (duration.type === 'time' && !isInt(duration.seconds, 1, LIMITS.seconds)) return 'Durée invalide'
  if (duration.type === 'distance' && !isInt(duration.meters, 1, LIMITS.meters)) return 'Distance invalide'
  if (target.type === 'zone' && !isInt(target.zone, 1, 7)) return 'Zone invalide'
  if (target.type === 'pace') {
    if (!isInt(target.fast, PACE_MIN, PACE_MAX) || !isInt(target.slow, PACE_MIN, PACE_MAX)) {
      return `Allure entre ${formatPace(PACE_MIN)} et ${formatPace(PACE_MAX)} /km`
    }
    if (target.fast > target.slow) return 'L’allure rapide doit être plus rapide que l’allure lente'
  }
  if (target.type === 'hr') {
    if (!isInt(target.min, LIMITS.hr.min, LIMITS.hr.max) || !isInt(target.max, LIMITS.hr.min, LIMITS.hr.max)) {
      return `FC entre ${LIMITS.hr.min} et ${LIMITS.hr.max} bpm`
    }
    if (target.min > target.max) return 'La FC basse dépasse la FC haute'
  }
  if (step.note.length > LIMITS.note) return `Note : ${LIMITS.note} caractères au maximum`
  return null
}

/** Premier problème trouvé dans la séance, ou null. */
export function validateWorkoutItems(items: WorkoutItem[]): string | null {
  if (items.length > LIMITS.items) return `${LIMITS.items} étapes au maximum`
  for (const [index, item] of items.entries()) {
    const where = `Étape ${index + 1}`
    if (item.type === 'step') {
      const error = stepError(item)
      if (error) return `${where} : ${error}`
      continue
    }
    if (!isInt(item.count, 1, LIMITS.repeatCount)) return `${where} : de 1 à ${LIMITS.repeatCount} répétitions`
    if (item.steps.length === 0 || item.steps.length > LIMITS.repeatSteps) {
      return `${where} : de 1 à ${LIMITS.repeatSteps} étapes par bloc`
    }
    for (const step of item.steps) {
      const error = stepError(step)
      if (error) return `${where} : ${error}`
    }
  }
  return null
}

/** Nombre d'étapes « montre » (un bloc répété compte pour ses étapes + 1). */
export function countWatchSteps(items: WorkoutItem[]): number {
  return items.reduce((sum, item) => sum + (item.type === 'step' ? 1 : item.steps.length + 1), 0)
}
