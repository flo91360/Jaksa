import { describe, expect, it } from 'vitest'
import {
  type HrZone,
  type Physiology,
  computeZones,
  emptyZone,
  formatHrRange,
  formatPaceRange,
  hasZoneErrors,
  missingForMethod,
  renumberZones,
  validatePhysiology,
  validateZones,
} from './zones.ts'

const physiology: Physiology = { hr_max: 190, hr_rest: 50, hr_threshold: 170, vma_kmh: 16 }
const bounds = (zones: HrZone[]) => zones.map((zone) => [zone.hr_min, zone.hr_max])

describe('computeZones', () => {
  it('% FC max : zones contiguës de 50 à 100 %', () => {
    expect(bounds(computeZones('pct_hr_max', physiology))).toEqual([
      [95, 114],
      [115, 133],
      [134, 152],
      [153, 171],
      [172, 190],
    ])
  })

  it('% FC de réserve (Karvonen)', () => {
    expect(bounds(computeZones('pct_hr_reserve', physiology))).toEqual([
      [120, 134],
      [135, 148],
      [149, 162],
      [163, 176],
      [177, 190],
    ])
  })

  it('% FC seuil, plafonné à la FC max', () => {
    expect(bounds(computeZones('pct_threshold', physiology))).toEqual([
      [111, 143],
      [144, 151],
      [152, 160],
      [161, 168],
      [169, 180],
    ])
    const nearMax = computeZones('pct_threshold', { ...physiology, hr_threshold: 185 })
    expect(nearMax[4].hr_max).toBe(190)
    for (const zone of nearMax) expect(zone.hr_min as number).toBeLessThanOrEqual(zone.hr_max as number)
  })

  it('nomme les zones par défaut, sans allure', () => {
    const zones = computeZones('pct_hr_max', physiology)
    expect(zones.map((zone) => zone.name)).toEqual([
      'Récupération',
      'Endurance fondamentale',
      'Endurance active',
      'Seuil',
      'VMA',
    ])
    expect(zones.every((zone) => zone.pace_fast === null && zone.pace_slow === null)).toBe(true)
    expect(zones.map((zone) => zone.zone)).toEqual([1, 2, 3, 4, 5])
  })

  it('garde les noms et allures déjà saisis', () => {
    const previous = computeZones('pct_hr_max', physiology)
    previous[1] = { ...previous[1], name: 'EF', pace_slow: 380, pace_fast: 345 }
    const recomputed = computeZones('pct_hr_reserve', physiology, previous)
    expect(recomputed[1]).toMatchObject({ name: 'EF', pace_slow: 380, pace_fast: 345, hr_min: 135, hr_max: 148 })
  })

  it('signale les valeurs manquantes', () => {
    const partial: Physiology = { hr_max: 190, hr_rest: null, hr_threshold: null, vma_kmh: null }
    expect(missingForMethod('pct_hr_max', partial)).toEqual([])
    expect(missingForMethod('pct_hr_reserve', partial)).toEqual(['FC repos'])
    expect(missingForMethod('pct_threshold', partial)).toEqual(['FC seuil'])
    expect(() => computeZones('pct_threshold', partial)).toThrow('FC seuil')
  })
})

describe('validateZones', () => {
  const valid = computeZones('pct_hr_reserve', physiology)

  it('accepte des zones cohérentes', () => {
    expect(hasZoneErrors(validateZones(valid))).toBe(false)
    expect(hasZoneErrors(validateZones([emptyZone(1)]))).toBe(false)
  })

  it('détecte les erreurs champ par champ', () => {
    const zones = valid.map((zone) => ({ ...zone }))
    zones[0].name = '  '
    zones[1].hr_min = 160
    zones[1].hr_max = 150
    zones[2].pace_slow = 300
    zones[2].pace_fast = 320
    zones[3].hr_min = 20
    const errors = validateZones(zones)
    expect(errors[0].name).toBe('Nom requis')
    expect(errors[1].hr_max).toBe('Inférieure à la FC min')
    expect(errors[2].pace_fast).toBe('Plus lente que l’allure basse')
    expect(errors[3].hr_min).toBe('Entre 30 et 250 bpm')
  })

  it('vérifie que les zones montent en intensité', () => {
    const zones = valid.map((zone) => ({ ...zone }))
    zones[1].pace_fast = 330
    zones[2].pace_fast = 340
    zones[3].hr_min = 100
    const errors = validateZones(zones)
    expect(errors[2].pace_fast).toBe('Plus lente que la zone précédente')
    expect(errors[3].hr_min).toBe('Plus basse que la zone précédente')
  })

  it('limite le nombre de zones à 7', () => {
    const zones = renumberZones(Array.from({ length: 8 }, (_, index) => emptyZone(index + 1)))
    expect(hasZoneErrors(validateZones(zones))).toBe(true)
  })
})

describe('affichage', () => {
  it('formate les plages de FC', () => {
    expect(formatHrRange({ hr_min: 135, hr_max: 148 })).toBe('135-148 bpm')
    expect(formatHrRange({ hr_min: null, hr_max: 148 })).toBe('≤ 148 bpm')
    expect(formatHrRange({ hr_min: 177, hr_max: null })).toBe('≥ 177 bpm')
    expect(formatHrRange({ hr_min: null, hr_max: null })).toBe('')
  })

  it('formate les plages d’allure, de la plus rapide à la plus lente', () => {
    expect(formatPaceRange({ pace_fast: 340, pace_slow: 380 })).toBe('5:40-6:20 /km')
    expect(formatPaceRange({ pace_fast: 300, pace_slow: 300 })).toBe('5:00 /km')
    expect(formatPaceRange({ pace_fast: 300, pace_slow: null })).toBe('≤ 5:00 /km')
    expect(formatPaceRange({ pace_fast: null, pace_slow: null })).toBe('')
  })
})

describe('validatePhysiology', () => {
  it('accepte des valeurs plausibles', () => {
    expect(validatePhysiology(physiology)).toEqual({})
    expect(validatePhysiology({ hr_max: null, hr_rest: null, hr_threshold: null, vma_kmh: null })).toEqual({})
  })

  it('refuse les valeurs hors bornes ou incohérentes', () => {
    expect(validatePhysiology({ ...physiology, hr_max: 260 }).hr_max).toBe('Entre 100 et 240 bpm')
    expect(validatePhysiology({ ...physiology, hr_rest: 195 }).hr_rest).toBe('Entre 25 et 120 bpm')
    expect(validatePhysiology({ ...physiology, hr_rest: 100, hr_max: 100 }).hr_rest).toBe(
      'Doit être inférieure à la FC max',
    )
    expect(validatePhysiology({ ...physiology, hr_threshold: 195 }).hr_threshold).toBe(
      'Ne peut pas dépasser la FC max',
    )
    expect(validatePhysiology({ ...physiology, vma_kmh: 40 }).vma_kmh).toBe('Entre 5 et 30 km/h')
  })
})
