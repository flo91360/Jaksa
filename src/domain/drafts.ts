/**
 * Conversion entre les valeurs saisies dans les formulaires (texte) et les
 * données enregistrées (nombres), avec les messages d'erreur à afficher.
 */
import { formatPace, parsePace } from './pace.ts'
import {
  type HrZone,
  type Physiology,
  type ZoneErrors,
  type ZoneField,
  renumberZones,
  validatePhysiology,
  validateZones,
} from './zones.ts'

type Parsed = { value: number | null; error?: string }

/** '' → null ; '150' → 150 ; '15a' → erreur. */
export function parseIntegerField(text: string): Parsed {
  const trimmed = text.trim()
  if (trimmed === '') return { value: null }
  if (!/^\d+$/.test(trimmed)) return { value: null, error: 'Nombre entier attendu' }
  return { value: Number(trimmed) }
}

/** '' → null ; '16,5' ou '16.5' → 16.5 ; 'abc' → erreur. */
export function parseDecimalField(text: string): Parsed {
  const trimmed = text.trim().replace(',', '.')
  if (trimmed === '') return { value: null }
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return { value: null, error: 'Nombre attendu (ex. 16,5)' }
  return { value: Number(trimmed) }
}

function parsePaceField(text: string): Parsed {
  if (text.trim() === '') return { value: null }
  const value = parsePace(text)
  return value === null ? { value: null, error: 'Allure invalide (ex. 4:30)' } : { value }
}

export type ZoneDraft = Record<ZoneField, string>

export function zoneToDraft(zone: HrZone): ZoneDraft {
  return {
    name: zone.name,
    hr_min: zone.hr_min === null ? '' : String(zone.hr_min),
    hr_max: zone.hr_max === null ? '' : String(zone.hr_max),
    pace_fast: formatPace(zone.pace_fast),
    pace_slow: formatPace(zone.pace_slow),
  }
}

/** Convertit les lignes saisies en zones ; erreurs de saisie puis de cohérence. */
export function draftsToZones(drafts: ZoneDraft[]): { zones: HrZone[]; errors: ZoneErrors } {
  const parseErrors: ZoneErrors = {}
  const zones = renumberZones(
    drafts.map((draft, index) => {
      const fields = {
        hr_min: parseIntegerField(draft.hr_min),
        hr_max: parseIntegerField(draft.hr_max),
        pace_fast: parsePaceField(draft.pace_fast),
        pace_slow: parsePaceField(draft.pace_slow),
      }
      for (const [field, parsed] of Object.entries(fields) as [ZoneField, Parsed][]) {
        if (parsed.error) parseErrors[index] = { ...parseErrors[index], [field]: parsed.error }
      }
      return {
        zone: index + 1,
        name: draft.name.trim(),
        hr_min: fields.hr_min.value,
        hr_max: fields.hr_max.value,
        pace_fast: fields.pace_fast.value,
        pace_slow: fields.pace_slow.value,
      }
    }),
  )
  const coherence = validateZones(zones)
  const errors: ZoneErrors = {}
  for (const index of new Set([...Object.keys(coherence), ...Object.keys(parseErrors)].map(Number))) {
    errors[index] = { ...coherence[index], ...parseErrors[index] }
  }
  return { zones, errors }
}

export type PhysiologyDraft = Record<keyof Physiology, string>

export function physiologyToDraft(physiology: Physiology): PhysiologyDraft {
  const text = (value: number | null) => (value === null ? '' : String(value).replace('.', ','))
  return {
    hr_max: text(physiology.hr_max),
    hr_rest: text(physiology.hr_rest),
    hr_threshold: text(physiology.hr_threshold),
    vma_kmh: text(physiology.vma_kmh),
  }
}

export function draftToPhysiology(draft: PhysiologyDraft): {
  physiology: Physiology
  errors: Partial<Record<keyof Physiology, string>>
} {
  const fields = {
    hr_max: parseIntegerField(draft.hr_max),
    hr_rest: parseIntegerField(draft.hr_rest),
    hr_threshold: parseIntegerField(draft.hr_threshold),
    vma_kmh: parseDecimalField(draft.vma_kmh),
  }
  const physiology: Physiology = {
    hr_max: fields.hr_max.value,
    hr_rest: fields.hr_rest.value,
    hr_threshold: fields.hr_threshold.value,
    vma_kmh: fields.vma_kmh.value === null ? null : Math.round(fields.vma_kmh.value * 10) / 10,
  }
  const errors: Partial<Record<keyof Physiology, string>> = validatePhysiology(physiology)
  for (const [key, parsed] of Object.entries(fields) as [keyof Physiology, Parsed][]) {
    if (parsed.error) errors[key] = parsed.error
  }
  return { physiology, errors }
}
