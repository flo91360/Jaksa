import { Decoder, Stream } from '@garmin/fitsdk'
import { describe, expect, it } from 'vitest'
import { encodeWorkoutFit, fitCrc, fitFileName } from './fit.ts'
import { STEP_PRESETS, type WorkoutItem, newStep } from './workouts.ts'
import type { HrZone } from './zones.ts'

const zones: HrZone[] = [
  { zone: 1, name: 'Récupération', hr_min: 100, hr_max: 129, pace_slow: 420, pace_fast: 380 },
  { zone: 2, name: 'Endurance fondamentale', hr_min: 130, hr_max: 145, pace_slow: 379, pace_fast: 340 },
  { zone: 3, name: 'Endurance active', hr_min: 146, hr_max: 160, pace_slow: 339, pace_fast: 300 },
  { zone: 4, name: 'Seuil', hr_min: 161, hr_max: 173, pace_slow: 299, pace_fast: 270 },
  { zone: 5, name: 'VMA', hr_min: 174, hr_max: 190, pace_slow: 250, pace_fast: 230 },
]

const intervals: WorkoutItem[] = [
  STEP_PRESETS.warmup(),
  STEP_PRESETS.repeat(),
  newStep('active', { type: 'time', seconds: 600 }, { type: 'hr', min: 150, max: 160 }),
  newStep('cooldown', { type: 'open' }, { type: 'pace', fast: 330, slow: 360 }),
]

function decode(bytes: Uint8Array) {
  const decoder = new Decoder(Stream.fromByteArray(Array.from(bytes)))
  expect(decoder.isFIT()).toBe(true)
  expect(decoder.checkIntegrity()).toBe(true)
  const { messages, errors } = decoder.read({ convertTypesToStrings: true })
  expect(errors).toEqual([])
  return {
    fileIdMesgs: messages.fileIdMesgs ?? [],
    workoutMesgs: messages.workoutMesgs ?? [],
    workoutStepMesgs: messages.workoutStepMesgs ?? [],
  }
}

describe('export .FIT', () => {
  it('produit un fichier « workout » valide, relu par le SDK Garmin', () => {
    const bytes = encodeWorkoutFit({ title: 'VMA 10 × 400 m', kind: 'run', steps: intervals }, zones, {
      now: new Date('2026-11-08T12:00:00Z'),
    })
    const messages = decode(bytes)

    expect(messages.fileIdMesgs[0]).toMatchObject({ type: 'workout', manufacturer: 'development' })
    expect(messages.fileIdMesgs[0].timeCreated).toEqual(new Date('2026-11-08T12:00:00Z'))
    expect(messages.workoutMesgs[0]).toMatchObject({ sport: 'running', wktName: 'VMA 10 × 400 m', numValidSteps: 6 })

    const steps = messages.workoutStepMesgs
    expect(steps).toHaveLength(6)
    // Échauffement 20 min en Z2, exporté en allure : 6:19 → 5:40 /km.
    expect(steps[0]).toMatchObject({
      messageIndex: 0,
      wktStepName: 'Échauffement',
      durationType: 'time',
      durationTime: 1200,
      targetType: 'speed',
      intensity: 'warmup',
    })
    expect(steps[0].customTargetSpeedLow).toBeCloseTo(1000 / 379, 3)
    expect(steps[0].customTargetSpeedHigh).toBeCloseTo(1000 / 340, 3)
    expect(steps[0].notes).toBe('Z2 Endurance fondamentale · 130-145 bpm · 5:40-6:19 /km')

    // Bloc : 400 m en Z5, 1 min 30 de récupération, répété 10 fois.
    expect(steps[1]).toMatchObject({ durationType: 'distance', durationDistance: 400, intensity: 'active' })
    expect(steps[2]).toMatchObject({ durationType: 'time', durationTime: 90, intensity: 'recovery' })
    expect(steps[3]).toMatchObject({ durationType: 'repeatUntilStepsCmplt', durationStep: 1, repeatSteps: 10 })

    // FC personnalisée.
    expect(steps[4]).toMatchObject({ targetType: 'heartRate', customTargetHeartRateLow: 250, customTargetHeartRateHigh: 260 })
    // Étape libre (bouton tour) avec cible d'allure.
    expect(steps[5]).toMatchObject({ durationType: 'open', targetType: 'speed', intensity: 'cooldown' })
  })

  it('exporte les zones en FC quand on le demande', () => {
    const bytes = encodeWorkoutFit({ title: 'Seuil', kind: 'run', steps: [newStep('active', { type: 'time', seconds: 1200 }, { type: 'zone', zone: 4 })] }, zones, {
      mode: 'hr',
    })
    const [step] = decode(bytes).workoutStepMesgs
    // Le SDK retire le décalage de 100 : valeurs en bpm + 100 dans le fichier.
    expect(step).toMatchObject({ targetType: 'heartRate', customTargetHeartRateLow: 261, customTargetHeartRateHigh: 273 })
  })

  it('se rabat sur la FC, puis sur « libre », quand la zone n’a pas d’allure', () => {
    const partial: HrZone[] = [{ zone: 1, name: 'Footing', hr_min: 120, hr_max: 140, pace_slow: null, pace_fast: null }]
    const steps = decode(
      encodeWorkoutFit(
        {
          title: 'Footing',
          kind: 'trail',
          steps: [
            newStep('active', { type: 'time', seconds: 1800 }, { type: 'zone', zone: 1 }),
            newStep('active', { type: 'time', seconds: 600 }, { type: 'zone', zone: 3 }),
          ],
        },
        partial,
      ),
    ).workoutStepMesgs
    expect(steps[0].targetType).toBe('heartRate')
    expect(steps[1].targetType).toBe('open')
  })

  it('tronque les noms trop longs sans couper un caractère accentué', () => {
    const title = 'Sortie longue très très longue avec côtes éprouvantes'
    const messages = decode(encodeWorkoutFit({ title, kind: 'trail', steps: [] }, []))
    const name = messages.workoutMesgs[0].wktName as string
    expect(title.startsWith(name)).toBe(true)
    expect(new TextEncoder().encode(name).length).toBeLessThanOrEqual(31)
    expect(messages.workoutMesgs[0].subSport).toBe('trail')
  })

  it('calcule le CRC FIT de référence', () => {
    // Valeur de contrôle : CRC-16 (poly 0xA001) de « 123456789 ».
    expect(fitCrc(new TextEncoder().encode('123456789'))).toBe(0xbb3d)
  })

  it('donne un nom de fichier lisible', () => {
    expect(fitFileName('2026-11-10', 'VMA 10 × 400 m')).toBe('2026-11-10-vma-10-x-400-m.fit')
    expect(fitFileName('2026-11-10', 'Récupération')).toBe('2026-11-10-recuperation.fit')
    expect(fitFileName('2026-11-10', '!!!')).toBe('2026-11-10-seance.fit')
  })
})
