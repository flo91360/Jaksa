import { describe, expect, it } from 'vitest'
import {
  draftToPhysiology,
  draftsToZones,
  parseDecimalField,
  parseIntegerField,
  physiologyToDraft,
  zoneToDraft,
} from './drafts.ts'
import { hasZoneErrors } from './zones.ts'

describe('champs numériques', () => {
  it('lit les entiers', () => {
    expect(parseIntegerField(' 150 ')).toEqual({ value: 150 })
    expect(parseIntegerField('')).toEqual({ value: null })
    expect(parseIntegerField('15a').error).toBe('Nombre entier attendu')
    expect(parseIntegerField('-3').error).toBe('Nombre entier attendu')
  })

  it('lit les décimaux avec virgule ou point', () => {
    expect(parseDecimalField('16,5')).toEqual({ value: 16.5 })
    expect(parseDecimalField('16.5')).toEqual({ value: 16.5 })
    expect(parseDecimalField('abc').error).toBe('Nombre attendu (ex. 16,5)')
  })
})

describe('zones saisies', () => {
  const zone = { zone: 1, name: 'EF', hr_min: 130, hr_max: 145, pace_slow: 380, pace_fast: 345 }

  it('fait l’aller-retour zone → saisie → zone', () => {
    const draft = zoneToDraft(zone)
    expect(draft).toEqual({ name: 'EF', hr_min: '130', hr_max: '145', pace_fast: '5:45', pace_slow: '6:20' })
    const { zones, errors } = draftsToZones([draft])
    expect(zones).toEqual([zone])
    expect(hasZoneErrors(errors)).toBe(false)
  })

  it('signale les erreurs de saisie et de cohérence sur la bonne ligne', () => {
    const { errors } = draftsToZones([
      zoneToDraft(zone),
      { name: 'Seuil', hr_min: '160', hr_max: '150', pace_fast: '4h', pace_slow: '' },
    ])
    expect(errors[0]).toBeUndefined()
    expect(errors[1]).toEqual({ hr_max: 'Inférieure à la FC min', pace_fast: 'Allure invalide (ex. 4:30)' })
  })

  it('renumérote les zones dans l’ordre des lignes', () => {
    const { zones } = draftsToZones([zoneToDraft({ ...zone, zone: 3 }), zoneToDraft({ ...zone, zone: 1 })])
    expect(zones.map((z) => z.zone)).toEqual([1, 2])
  })
})

describe('physiologie saisie', () => {
  it('fait l’aller-retour et arrondit la VMA au dixième', () => {
    const draft = physiologyToDraft({ hr_max: 190, hr_rest: 48, hr_threshold: null, vma_kmh: 16.5 })
    expect(draft).toEqual({ hr_max: '190', hr_rest: '48', hr_threshold: '', vma_kmh: '16,5' })
    expect(draftToPhysiology({ ...draft, vma_kmh: '16,54' }).physiology.vma_kmh).toBe(16.5)
  })

  it('cumule erreurs de saisie et de cohérence', () => {
    const { errors } = draftToPhysiology({ hr_max: '180', hr_rest: '190', hr_threshold: 'x', vma_kmh: '' })
    expect(errors).toEqual({ hr_rest: 'Entre 25 et 120 bpm', hr_threshold: 'Nombre entier attendu' })
  })
})
