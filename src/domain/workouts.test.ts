import { describe, expect, it } from 'vitest'
import {
  STEP_PRESETS,
  type WorkoutItem,
  countWatchSteps,
  describeTargetValues,
  distanceInput,
  durationInput,
  formatDistance,
  formatDuration,
  formatTotals,
  newStep,
  parseDistance,
  parseDuration,
  resolveTarget,
  summarizeWorkout,
  validateWorkoutItems,
  workoutTotals,
} from './workouts.ts'
import type { HrZone } from './zones.ts'

const zones: HrZone[] = [
  { zone: 1, name: 'Récupération', hr_min: 100, hr_max: 129, pace_slow: 420, pace_fast: 380 },
  { zone: 2, name: 'Endurance fondamentale', hr_min: 130, hr_max: 145, pace_slow: 380, pace_fast: 340 },
  { zone: 3, name: 'Endurance active', hr_min: 146, hr_max: 160, pace_slow: 339, pace_fast: 300 },
  { zone: 4, name: 'Seuil', hr_min: 161, hr_max: 173, pace_slow: 290, pace_fast: 270 },
  { zone: 5, name: 'VMA', hr_min: 174, hr_max: 190, pace_slow: null, pace_fast: 240 },
]

const intervals: WorkoutItem[] = [
  STEP_PRESETS.warmup(), // 20 min Z2
  STEP_PRESETS.repeat(), // 10 × (400 m Z5 + 1 min 30 Z1)
  STEP_PRESETS.cooldown(), // 10 min Z1
]

describe('cibles', () => {
  it('traduit une zone en FC et en allure d’après les zones de l’athlète', () => {
    const resolved = resolveTarget({ type: 'zone', zone: 4 }, zones)
    expect(resolved.label).toBe('Z4 Seuil')
    expect(describeTargetValues(resolved)).toBe('161-173 bpm · 4:30-4:50 /km')
  })

  it('reste lisible quand la zone n’existe pas ou est incomplète', () => {
    expect(resolveTarget({ type: 'zone', zone: 6 }, zones).label).toBe('Z6')
    expect(describeTargetValues(resolveTarget({ type: 'zone', zone: 5 }, zones))).toBe('174-190 bpm · ≤ 4:00 /km')
    expect(describeTargetValues(resolveTarget({ type: 'zone', zone: 2 }, []))).toBe('')
  })

  it('affiche les cibles en allure et en FC telles quelles', () => {
    expect(resolveTarget({ type: 'pace', fast: 270, slow: 280 }, zones).label).toBe('4:30-4:40 /km')
    expect(resolveTarget({ type: 'hr', min: 150, max: 160 }, zones).label).toBe('150-160 bpm')
    expect(resolveTarget({ type: 'none' }, zones).label).toBe('Libre')
  })
})

describe('totaux estimés', () => {
  it('additionne durées et distances, blocs répétés compris', () => {
    const totals = workoutTotals(intervals, zones)
    // 20 min à 6:00 = 3 333 m ; 10 × 400 m à 4:00 = 4 000 m en 16 min ;
    // 10 × 1 min 30 à 6:40 = 2 250 m ; 10 min à 6:40 = 1 500 m.
    expect(totals.seconds).toBe(1200 + 10 * 96 + 10 * 90 + 600)
    expect(totals.meters).toBe(Math.round(1200 / 360 * 1000 + 4000 + 10 * 90 / 400 * 1000 + 600 / 400 * 1000))
    expect(totals.complete).toBe(true)
    expect(formatTotals(totals)).toBe('1 h 01 · 11,08 km')
  })

  it('signale une estimation partielle (étape libre ou allure inconnue)', () => {
    const totals = workoutTotals([newStep('active', { type: 'open' }), newStep('active', { type: 'time', seconds: 600 })], zones)
    expect(totals).toEqual({ seconds: 600, meters: 0, complete: false })
    expect(formatTotals(totals)).toBe('≥ 10 min')
  })

  it('un repos sur place ne compte pas de distance', () => {
    expect(workoutTotals([newStep('rest', { type: 'time', seconds: 120 })], zones)).toEqual({
      seconds: 120,
      meters: 0,
      complete: true,
    })
  })
})

describe('affichage', () => {
  it('formate durées et distances', () => {
    expect(formatDuration(45)).toBe('45 s')
    expect(formatDuration(90)).toBe('1 min 30')
    expect(formatDuration(3600)).toBe('1 h')
    expect(formatDuration(4500)).toBe('1 h 15')
    expect(formatDistance(400)).toBe('400 m')
    expect(formatDistance(21097)).toBe('21,1 km')
  })

  it('résume une séance en une ligne', () => {
    expect(summarizeWorkout(intervals)).toBe('20 min Z2 · 10 × (400 m Z5 + 1 min 30 Z1 récup) · 10 min Z1')
    expect(countWatchSteps(intervals)).toBe(5)
  })
})

describe('saisie', () => {
  it('lit une durée', () => {
    expect(parseDuration('15')).toBe(900)
    expect(parseDuration('1:30')).toBe(90)
    expect(parseDuration('1:05:00')).toBe(3900)
    expect(parseDuration('1h30')).toBe(5400)
    expect(parseDuration('2h')).toBe(7200)
    expect(parseDuration('45 s')).toBe(45)
    expect(parseDuration('1,5')).toBe(90)
    expect(parseDuration('1:75')).toBeNull()
    expect(parseDuration('')).toBeNull()
    expect(parseDuration('abc')).toBeNull()
  })

  it('réécrit une durée pour la saisie', () => {
    for (const seconds of [900, 90, 3900, 45]) {
      expect(parseDuration(durationInput(seconds))).toBe(seconds)
    }
  })

  it('lit une distance', () => {
    expect(parseDistance('400')).toBe(400)
    expect(parseDistance('400 m')).toBe(400)
    expect(parseDistance('2 km')).toBe(2000)
    expect(parseDistance('2,5')).toBe(2500)
    expect(parseDistance('21.1k')).toBe(21100)
    expect(parseDistance('0')).toBeNull()
    for (const meters of [400, 1000, 2500, 1609, 21100]) {
      expect(parseDistance(distanceInput(meters))).toBe(meters)
    }
  })
})

describe('contrôle', () => {
  it('accepte une séance correcte et une séance vide', () => {
    expect(validateWorkoutItems(intervals)).toBeNull()
    expect(validateWorkoutItems([])).toBeNull()
  })

  it('signale la première erreur, avec son étape', () => {
    expect(validateWorkoutItems([newStep('active', { type: 'time', seconds: 0 })])).toBe('Étape 1 : Durée invalide')
    expect(
      validateWorkoutItems([STEP_PRESETS.warmup(), newStep('active', { type: 'time', seconds: 60 }, { type: 'pace', fast: 300, slow: 280 })]),
    ).toBe('Étape 2 : L’allure rapide doit être plus rapide que l’allure lente')
    expect(validateWorkoutItems([{ type: 'repeat', count: 0, steps: [STEP_PRESETS.warmup()] }])).toBe(
      'Étape 1 : de 1 à 99 répétitions',
    )
    expect(validateWorkoutItems([{ type: 'repeat', count: 3, steps: [] }])).toBe('Étape 1 : de 1 à 10 étapes par bloc')
  })
})
