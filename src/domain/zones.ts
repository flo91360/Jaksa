import { PACE_MAX, PACE_MIN, formatPace } from './pace.ts'

/**
 * Zone d'intensité d'un athlète : une plage de fréquence cardiaque (bpm) et,
 * en face, la plage d'allure correspondante (secondes par km) que le coach
 * déduit de la FC. Mêmes clés que le JSON stocké en base (athlete_profiles.zones).
 */
export type HrZone = {
  zone: number
  name: string
  hr_min: number | null
  hr_max: number | null
  /** Allure la plus lente de la zone (le plus grand nombre de secondes). */
  pace_slow: number | null
  /** Allure la plus rapide de la zone (le plus petit nombre de secondes). */
  pace_fast: number | null
}

export type Physiology = {
  hr_max: number | null
  hr_rest: number | null
  hr_threshold: number | null
  vma_kmh: number | null
}

export const MAX_ZONES = 7
export const HR_LIMITS = { min: 30, max: 250 }

export const DEFAULT_ZONE_NAMES = ['Récupération', 'Endurance fondamentale', 'Endurance active', 'Seuil', 'VMA']

export type ZoneMethod = 'pct_hr_max' | 'pct_hr_reserve' | 'pct_threshold'

type ZonePreset = {
  label: string
  description: string
  requires: (keyof Pick<Physiology, 'hr_max' | 'hr_rest' | 'hr_threshold'>)[]
  /** Pourcentage de départ de la zone 1, puis pourcentage haut de chaque zone. */
  start: number
  uppers: number[]
}

export const ZONE_METHODS: Record<ZoneMethod, ZonePreset> = {
  pct_hr_max: {
    label: '% FC max',
    description: 'Zones à 50-60-70-80-90-100 % de la FC maximale.',
    requires: ['hr_max'],
    start: 50,
    uppers: [60, 70, 80, 90, 100],
  },
  pct_hr_reserve: {
    label: '% FC de réserve (Karvonen)',
    description: 'FC repos + pourcentage × (FC max − FC repos). Tient compte de la FC de repos.',
    requires: ['hr_max', 'hr_rest'],
    start: 50,
    uppers: [60, 70, 80, 90, 100],
  },
  pct_threshold: {
    label: '% FC seuil',
    description: 'Zones calées sur la FC au seuil : < 85 %, 85-89 %, 90-94 %, 95-99 %, ≥ 100 %.',
    requires: ['hr_threshold'],
    start: 65,
    uppers: [84, 89, 94, 99, 106],
  },
}

const PHYSIOLOGY_LABELS: Record<keyof Physiology, string> = {
  hr_max: 'FC max',
  hr_rest: 'FC repos',
  hr_threshold: 'FC seuil',
  vma_kmh: 'VMA',
}

/** Valeurs physiologiques manquantes pour appliquer une méthode (libellés). */
export function missingForMethod(method: ZoneMethod, physiology: Physiology): string[] {
  return ZONE_METHODS[method].requires
    .filter((key) => physiology[key] === null)
    .map((key) => PHYSIOLOGY_LABELS[key])
}

function bpmFor(method: ZoneMethod, physiology: Physiology, percent: number): number {
  const { hr_max, hr_rest, hr_threshold } = physiology
  switch (method) {
    case 'pct_hr_max':
      return Math.round(((hr_max as number) * percent) / 100)
    case 'pct_hr_reserve':
      return Math.round((hr_rest as number) + (((hr_max as number) - (hr_rest as number)) * percent) / 100)
    case 'pct_threshold':
      return Math.round(((hr_threshold as number) * percent) / 100)
  }
}

/**
 * Calcule 5 zones de FC contiguës selon la méthode choisie. Les noms et les
 * allures déjà saisis (previous) sont conservés zone par zone.
 */
export function computeZones(method: ZoneMethod, physiology: Physiology, previous: HrZone[] = []): HrZone[] {
  const missing = missingForMethod(method, physiology)
  if (missing.length > 0) {
    throw new Error(`Valeurs manquantes : ${missing.join(', ')}`)
  }
  const preset = ZONE_METHODS[method]
  let lower = bpmFor(method, physiology, preset.start)
  return preset.uppers.map((percent, index) => {
    let upper = bpmFor(method, physiology, percent)
    if (physiology.hr_max !== null) upper = Math.min(upper, physiology.hr_max)
    upper = Math.max(upper, lower)
    const kept = previous[index]
    const zone: HrZone = {
      zone: index + 1,
      name: kept?.name.trim() ? kept.name : (DEFAULT_ZONE_NAMES[index] ?? `Zone ${index + 1}`),
      hr_min: lower,
      hr_max: upper,
      pace_slow: kept?.pace_slow ?? null,
      pace_fast: kept?.pace_fast ?? null,
    }
    lower = upper + 1
    return zone
  })
}

/** Renumérote les zones 1..n (après ajout ou suppression d'une ligne). */
export function renumberZones(zones: HrZone[]): HrZone[] {
  return zones.map((zone, index) => ({ ...zone, zone: index + 1 }))
}

export function emptyZone(zoneNumber: number): HrZone {
  return {
    zone: zoneNumber,
    name: DEFAULT_ZONE_NAMES[zoneNumber - 1] ?? `Zone ${zoneNumber}`,
    hr_min: null,
    hr_max: null,
    pace_slow: null,
    pace_fast: null,
  }
}

export type ZoneField = 'name' | 'hr_min' | 'hr_max' | 'pace_slow' | 'pace_fast'
export type ZoneErrors = Record<number, Partial<Record<ZoneField, string>>>

/** Contrôle les zones avant enregistrement (mêmes règles que la base, plus la cohérence d'ensemble). */
export function validateZones(zones: HrZone[]): ZoneErrors {
  const errors: ZoneErrors = {}
  const add = (index: number, field: ZoneField, message: string) => {
    errors[index] = { ...errors[index], [field]: errors[index]?.[field] ?? message }
  }

  if (zones.length > MAX_ZONES) add(MAX_ZONES, 'name', `${MAX_ZONES} zones au maximum`)

  zones.forEach((zone, index) => {
    const name = zone.name.trim()
    if (name === '') add(index, 'name', 'Nom requis')
    if (name.length > 60) add(index, 'name', '60 caractères au maximum')

    for (const field of ['hr_min', 'hr_max'] as const) {
      const value = zone[field]
      if (value !== null && (!Number.isInteger(value) || value < HR_LIMITS.min || value > HR_LIMITS.max)) {
        add(index, field, `Entre ${HR_LIMITS.min} et ${HR_LIMITS.max} bpm`)
      }
    }
    if (zone.hr_min !== null && zone.hr_max !== null && zone.hr_min > zone.hr_max) {
      add(index, 'hr_max', 'Inférieure à la FC min')
    }

    for (const field of ['pace_slow', 'pace_fast'] as const) {
      const value = zone[field]
      if (value !== null && (!Number.isInteger(value) || value < PACE_MIN || value > PACE_MAX)) {
        add(index, field, `Entre ${formatPace(PACE_MIN)} et ${formatPace(PACE_MAX)} /km`)
      }
    }
    if (zone.pace_slow !== null && zone.pace_fast !== null && zone.pace_fast > zone.pace_slow) {
      add(index, 'pace_fast', 'Plus lente que l’allure basse')
    }

    const previous = zones[index - 1]
    if (previous) {
      if (previous.hr_min !== null && zone.hr_min !== null && zone.hr_min < previous.hr_min) {
        add(index, 'hr_min', 'Plus basse que la zone précédente')
      }
      if (previous.pace_fast !== null && zone.pace_fast !== null && zone.pace_fast > previous.pace_fast) {
        add(index, 'pace_fast', 'Plus lente que la zone précédente')
      }
    }
  })
  return errors
}

export function hasZoneErrors(errors: ZoneErrors): boolean {
  return Object.values(errors).some((fields) => Object.keys(fields).length > 0)
}

/** « 135-148 bpm », « ≤ 148 bpm », « ≥ 177 bpm » ou chaîne vide. */
export function formatHrRange(zone: Pick<HrZone, 'hr_min' | 'hr_max'>): string {
  if (zone.hr_min !== null && zone.hr_max !== null) return `${zone.hr_min}-${zone.hr_max} bpm`
  if (zone.hr_max !== null) return `≤ ${zone.hr_max} bpm`
  if (zone.hr_min !== null) return `≥ ${zone.hr_min} bpm`
  return ''
}

/** « 5:40-6:20 /km » (de la plus rapide à la plus lente) ou chaîne vide. */
export function formatPaceRange(zone: Pick<HrZone, 'pace_slow' | 'pace_fast'>): string {
  const fast = formatPace(zone.pace_fast)
  const slow = formatPace(zone.pace_slow)
  if (fast && slow) return fast === slow ? `${fast} /km` : `${fast}-${slow} /km`
  if (fast) return `≤ ${fast} /km`
  if (slow) return `≥ ${slow} /km`
  return ''
}

/** Contrôle la physiologie (mêmes bornes que la base). */
export function validatePhysiology(physiology: Physiology): Partial<Record<keyof Physiology, string>> {
  const errors: Partial<Record<keyof Physiology, string>> = {}
  const checkInt = (key: 'hr_max' | 'hr_rest' | 'hr_threshold', min: number, max: number) => {
    const value = physiology[key]
    if (value !== null && (!Number.isInteger(value) || value < min || value > max)) {
      errors[key] = `Entre ${min} et ${max} bpm`
    }
  }
  checkInt('hr_max', 100, 240)
  checkInt('hr_rest', 25, 120)
  checkInt('hr_threshold', 80, 230)
  const { hr_max, hr_rest, hr_threshold, vma_kmh } = physiology
  if (vma_kmh !== null && (vma_kmh < 5 || vma_kmh > 30)) errors.vma_kmh = 'Entre 5 et 30 km/h'
  if (!errors.hr_rest && hr_rest !== null && hr_max !== null && hr_rest >= hr_max) {
    errors.hr_rest = 'Doit être inférieure à la FC max'
  }
  if (!errors.hr_threshold && hr_threshold !== null && hr_max !== null && hr_threshold > hr_max) {
    errors.hr_threshold = 'Ne peut pas dépasser la FC max'
  }
  return errors
}
