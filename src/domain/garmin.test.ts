import { describe, expect, it } from 'vitest'
import {
  activityFigures,
  averagePace,
  type GarminSummary,
  garminSport,
  importRange,
  matchActivities,
  summaryToActivity,
} from './garmin.ts'

const summary = (patch: Partial<GarminSummary> = {}): GarminSummary => ({
  activityId: 21_000_000_001,
  activityName: ' Palaiseau Course à pied ',
  activityType: { typeKey: 'running' },
  startTimeLocal: '2026-11-10 08:02:11',
  startTimeGMT: '2026-11-10 07:02:11',
  duration: 3125.4,
  movingDuration: 3080.2,
  distance: 10_215.3,
  elevationGain: 85.4,
  elevationLoss: 84.6,
  averageHR: 146,
  maxHR: 171,
  calories: 690,
  averageCadence: 171.6,
  maxCadence: 188,
  ...patch,
})

describe('activités Garmin', () => {
  it('convertit une activité de la liste Garmin', () => {
    expect(summaryToActivity(summary())).toEqual({
      garmin_activity_id: 21_000_000_001,
      start_time: '2026-11-10T07:02:11Z',
      local_date: '2026-11-10',
      activity_type: 'running',
      name: 'Palaiseau Course à pied',
      duration_s: 3125,
      moving_s: 3080,
      distance_m: 10_215,
      elevation_gain_m: 85,
      elevation_loss_m: 85,
      avg_hr: 146,
      max_hr: 171,
      calories: 690,
      avg_cadence: 172,
      max_cadence: 188,
    })
  })

  it("prend le jour local de la montre, pas le jour UTC", () => {
    const late = summaryToActivity(summary({ startTimeLocal: '2026-11-10 23:30:00', startTimeGMT: '2026-11-10 22:30:00' }))
    const early = summaryToActivity(summary({ startTimeLocal: '2026-11-11 00:30:00', startTimeGMT: '2026-11-10 23:30:00' }))
    expect(late?.local_date).toBe('2026-11-10')
    expect(early?.local_date).toBe('2026-11-11')
  })

  it('écarte les valeurs aberrantes et les activités sans heure', () => {
    const odd = summaryToActivity(summary({ averageHR: 400, elevationGain: -3, elevationLoss: 40_000, duration: null }))
    expect(odd).toMatchObject({ avg_hr: null, elevation_gain_m: null, elevation_loss_m: null, duration_s: null })
    expect(summaryToActivity(summary({ startTimeLocal: null }))).toBeNull()
  })

  it('reconnaît la famille de sport', () => {
    expect(garminSport('running')).toBe('run')
    expect(garminSport('treadmill_running')).toBe('run')
    expect(garminSport('trail_running')).toBe('trail')
    expect(garminSport('ultra_run')).toBe('trail')
    expect(garminSport('strength_training')).toBe('strength')
    expect(garminSport('cycling')).toBe('cross')
    expect(garminSport('')).toBe('cross')
  })

  it('relit les 14 derniers jours', () => {
    expect(importRange('2026-11-14')).toEqual({ from: '2026-11-01', to: '2026-11-14' })
  })
})

describe('rattachement aux séances', () => {
  const activity = (id: number, date: string, time: string, type = 'running') => ({
    garmin_activity_id: id,
    local_date: date,
    start_time: `${date}T${time}Z`,
    activity_type: type,
  })
  const workout = (id: string, date: string, kind: 'run' | 'trail' | 'strength' | 'cross' | 'rest' = 'run', position = 0) => ({
    id,
    scheduled_on: date,
    kind,
    position,
  })

  it('rattache une sortie à la séance de course du même jour', () => {
    const result = matchActivities(
      [activity(1, '2026-11-10', '07:00:00'), activity(2, '2026-11-12', '07:00:00')],
      [workout('lundi', '2026-11-09'), workout('mardi', '2026-11-10'), workout('repos', '2026-11-12', 'rest')],
    )
    expect(result).toEqual(
      new Map([
        [1, 'mardi'],
        [2, null],
      ]),
    )
  })

  it('biquotidien : chaque activité prend la séance suivante de la journée', () => {
    const result = matchActivities(
      [activity(2, '2026-11-10', '18:00:00'), activity(1, '2026-11-10', '07:00:00')],
      [workout('soir', '2026-11-10', 'run', 1), workout('matin', '2026-11-10', 'run', 0)],
    )
    expect(result.get(1)).toBe('matin')
    expect(result.get(2)).toBe('soir')
  })

  it('le sport compte : vélo sur la séance « autre sport », trail sur la séance de trail', () => {
    const result = matchActivities(
      [activity(1, '2026-11-10', '07:00:00', 'cycling'), activity(2, '2026-11-10', '09:00:00', 'trail_running')],
      [workout('footing', '2026-11-10', 'run', 0), workout('trail', '2026-11-10', 'trail', 1), workout('velo', '2026-11-10', 'cross', 2)],
    )
    expect(result.get(1)).toBe('velo')
    expect(result.get(2)).toBe('trail')
  })

  it('séance faite avec un jour de retard : rattachée à la séance de la veille encore libre', () => {
    const result = matchActivities(
      [activity(1, '2026-11-11', '07:00:00'), activity(2, '2026-11-12', '07:00:00')],
      [workout('mardi', '2026-11-10'), workout('mercredi', '2026-11-11')],
    )
    // Mercredi : la séance du jour passe avant celle de la veille ; jeudi : rien le jour même, la veille est prise.
    expect(result.get(1)).toBe('mercredi')
    expect(result.get(2)).toBeNull()
    const late = matchActivities([activity(3, '2026-11-11', '07:00:00')], [workout('mardi', '2026-11-10')])
    expect(late.get(3)).toBe('mardi')
  })

  it('jamais sur la séance du lendemain', () => {
    const result = matchActivities([activity(1, '2026-11-10', '07:00:00')], [workout('mercredi', '2026-11-11')])
    expect(result.get(1)).toBeNull()
  })

  it('garde les rattachements déjà enregistrés', () => {
    const result = matchActivities(
      [activity(1, '2026-11-10', '07:00:00'), activity(2, '2026-11-10', '18:00:00')],
      [workout('matin', '2026-11-10', 'run', 0), workout('soir', '2026-11-10', 'run', 1)],
      new Map([[2, 'matin']]),
    )
    expect(result.get(2)).toBe('matin')
    expect(result.get(1)).toBe('soir')
  })
})

describe('affichage', () => {
  const values = summaryToActivity(summary())!

  it('calcule l’allure moyenne sur le temps en mouvement', () => {
    expect(averagePace(values)).toBeCloseTo(3080 / 10.215, 5)
    expect(averagePace({ ...values, activity_type: 'cycling' })).toBeNull()
  })

  it('liste durée, distance, allure, FC et D+', () => {
    expect(activityFigures(values)).toEqual([
      ['Durée', '52 min 05'],
      ['Distance', '10,22 km'],
      ['Allure', '5:02 /km'],
      ['FC moy.', '146 bpm'],
      ['FC max', '171 bpm'],
      ['D+', '85 m'],
      ['Cadence', '172 pas/min'],
    ])
  })
})
