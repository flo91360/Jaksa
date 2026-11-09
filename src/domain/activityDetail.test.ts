import { describe, expect, it } from 'vitest'
import {
  type ActivityDetail,
  type ActivityLap,
  type ActivitySeries,
  cleanCadence,
  comparePlan,
  detailFigures,
  focusRange,
  formatClock,
  formatGap,
  indexAt,
  isActivityDetail,
  paceSeries,
  routePath,
  segments,
  seriesMean,
  speedToPace,
  targetVerdict,
  timeInZones,
  warmupEnd,
} from './activityDetail.ts'
import { STEP_PRESETS, type WorkoutItem, newStep } from './workouts.ts'
import type { HrZone } from './zones.ts'

const zones: HrZone[] = [
  { zone: 1, name: 'Récupération', hr_min: 100, hr_max: 129, pace_slow: 420, pace_fast: 380 },
  { zone: 2, name: 'Endurance fondamentale', hr_min: 130, hr_max: 145, pace_slow: 379, pace_fast: 340 },
  { zone: 3, name: 'Endurance active', hr_min: 146, hr_max: 160, pace_slow: 339, pace_fast: 300 },
  { zone: 4, name: 'Seuil', hr_min: 161, hr_max: 173, pace_slow: 299, pace_fast: 270 },
  { zone: 5, name: 'VMA', hr_min: 174, hr_max: 190, pace_slow: 250, pace_fast: 230 },
]

const empty: ActivitySeries = {
  t: [],
  hr: null,
  speed: null,
  altitude: null,
  distance: null,
  cadence: null,
  power: null,
  lat: null,
  lon: null,
}

const lap = (over: Partial<ActivityLap>): ActivityLap => ({
  start_s: 0,
  duration_s: 180,
  distance_m: 720,
  avg_hr: 165,
  max_hr: 170,
  avg_speed: 4,
  max_speed: 4.2,
  ascent_m: 3,
  descent_m: 3,
  avg_cadence: 180,
  avg_power: null,
  intensity: 'active',
  trigger: 'time',
  ...over,
})

describe('détail d’une activité', () => {
  it('reconnaît le format enregistré', () => {
    expect(isActivityDetail({ version: 1, series: { t: [] }, laps: [], session: {} })).toBe(true)
    expect(isActivityDetail({ version: 2, series: { t: [] }, laps: [], session: {} })).toBe(false)
    expect(isActivityDetail(null)).toBe(false)
  })

  it('convertit la vitesse en allure, sauf à l’arrêt', () => {
    expect(speedToPace(4)).toBe(250)
    expect(speedToPace(0.3)).toBeNull()
    expect(speedToPace(null)).toBeNull()
  })

  it('compte le temps passé dans chaque zone, sans compter les pauses', () => {
    // 60 s en Z2 (140 bpm) puis une pause de 10 min comptée 20 s au plus, puis 60 s en Z4 (165), un pic au-dessus de Z5 compté en Z5.
    const t = [...Array.from({ length: 13 }, (_, i) => i * 5), ...Array.from({ length: 13 }, (_, i) => 660 + i * 5), 725]
    const hr = [...Array(13).fill(140), ...Array(13).fill(165), 200]
    const result = timeInZones({ ...empty, t, hr }, zones)
    expect(result.map((z) => z.seconds)).toEqual([0, 80, 0, 65, 5])
    expect(result[1]).toMatchObject({ zone: 2, name: 'Endurance fondamentale', range: '130-145' })
    expect(result.reduce((sum, z) => sum + z.share, 0)).toBeCloseTo(1)
    expect(timeInZones({ ...empty, t, hr }, [])).toEqual([])
    expect(timeInZones({ ...empty, t }, zones)).toEqual([])
  })

  it('coupe les courbes aux pauses et lisse l’allure', () => {
    const t = [0, 5, 10, 300, 305]
    expect(segments(t, [1, 2, null, 4, 5]).map((s) => s.map((p) => p.t))).toEqual([
      [0, 5],
      [300, 305],
    ])
    const pace = paceSeries({ ...empty, t: [0, 5, 10], speed: [4, 4, 4] }, true)
    expect(pace).toEqual([250, 250, 250])
    expect(paceSeries({ ...empty, t: [0], speed: [10] }, false)).toEqual([36])
    expect(indexAt([0, 5, 10, 15], 11)).toBe(2)
    expect(formatClock(3754)).toBe('1:02:34')
    expect(formatClock(754)).toBe('12:34')
  })

  it('juge un tour face à la cible de l’étape', () => {
    const z4 = { label: 'Z4', hrMin: 161, hrMax: 173, paceFast: 270, paceSlow: 299, zone: zones[3] }
    expect(targetVerdict(z4, { avg_speed: 1000 / 280, avg_hr: 165 })).toBe('on')
    expect(targetVerdict(z4, { avg_speed: 4, avg_hr: 165 })).toBe('fast')
    expect(targetVerdict(z4, { avg_speed: 1000 / 320, avg_hr: 165 })).toBe('slow')
    expect(targetVerdict(z4, { avg_speed: 4, avg_hr: 180 }, true)).toBe('high')
    const hrOnly = { label: '', hrMin: 150, hrMax: 160, paceFast: null, paceSlow: null, zone: null }
    expect(targetVerdict(hrOnly, { avg_speed: 4, avg_hr: 140 })).toBe('low')
    const free = { label: 'Libre', hrMin: null, hrMax: null, paceFast: null, paceSlow: null, zone: null }
    expect(targetVerdict(free, { avg_speed: 4, avg_hr: 140 })).toBeNull()
  })

  it('met en face étapes prévues et tours de la montre', () => {
    const steps: WorkoutItem[] = [
      STEP_PRESETS.warmup(),
      {
        type: 'repeat',
        count: 2,
        steps: [
          newStep('active', { type: 'time', seconds: 180 }, { type: 'zone', zone: 5 }),
          newStep('recovery', { type: 'time', seconds: 120 }),
        ],
      },
      newStep('cooldown', { type: 'open' }),
    ]
    const laps = [
      lap({ intensity: 'warmup' }),
      lap({}),
      lap({ avg_speed: 3 }),
      lap({}),
      lap({}),
      lap({}),
      lap({ duration_s: 20 }),
    ]
    const { rows, matched } = comparePlan(steps, zones, laps)
    expect(matched).toBe(true)
    expect(rows).toHaveLength(6)
    expect(rows[1]).toMatchObject({ label: 'Effort', repeat: '1/2', planned: '3 min', target: 'Z5 VMA', verdict: 'on' })
    expect(rows[3]).toMatchObject({ repeat: '2/2', verdict: 'on' })
    // Une récupération sans cible n'a pas de verdict.
    expect(rows[2].verdict).toBeNull()

    const free = comparePlan(steps, zones, [lap({}), lap({})])
    expect(free.matched).toBe(false)
    expect(free.rows.every((r) => r.lap === null)).toBe(true)
  })

  it('donne les écarts prévu / réalisé', () => {
    expect(formatGap(3720, 3600, 'seconds')).toBe('+2 min')
    expect(formatGap(3610, 3600, 'seconds')).toBe('=')
    expect(formatGap(9650, 10_000, 'meters')).toBe('−350 m')
    expect(formatGap(null, 10_000, 'meters')).toBe('')
  })

  it('liste tous les chiffres connus', () => {
    const detail: ActivityDetail = {
      version: 1,
      series: empty,
      laps: [],
      session: {
        sport: 'running',
        elapsed_s: 3360,
        timer_s: 3300,
        distance_m: 11_000,
        ascent_m: 80,
        descent_m: 78,
        min_altitude_m: 52,
        max_altitude_m: 68.4,
        avg_hr: 150,
        max_hr: 175,
        avg_speed: 3.33,
        max_speed: 4.2,
        avg_cadence: 172,
        max_cadence: 184,
        avg_power: null,
        max_power: null,
        calories: 640,
        aerobic_te: 3.8,
        anaerobic_te: 2,
        avg_temperature: 12,
      },
    }
    const activity = {
      activity_type: 'running',
      duration_s: 3360,
      moving_s: 3300,
      distance_m: 11_000,
      elevation_gain_m: 80,
      elevation_loss_m: 79,
      avg_hr: 150,
      max_hr: 175,
      calories: 640,
    }
    const figures = Object.fromEntries(detailFigures(activity, detail).map((f) => [f.label, f.value]))
    expect(figures).toMatchObject({
      Durée: '56 min',
      'En mouvement': '55 min',
      Distance: '11 km',
      'Allure moy.': '5:00 /km',
      'Allure max': '3:58 /km',
      'D+': '80 m',
      'D−': '79 m',
      Altitude: '52-68 m',
      'Cadence moy.': '172 pas/min',
      'Effet aérobie': '3,8',
      'Effet anaérobie': '2,0',
      Température: '12 °C',
    })
    expect(figures['Puissance moy.']).toBeUndefined()
    // Sans .FIT : le résumé seul, cadence comprise.
    expect(
      Object.fromEntries(detailFigures({ ...activity, avg_cadence: 170, max_cadence: 186 }, null).map((f) => [f.label, f.value])),
    ).toMatchObject({ 'Cadence moy.': '170 pas/min', 'Cadence max': '186 pas/min' })
    expect(detailFigures({ ...activity, activity_type: 'cycling' }, null).map((f) => f.label)).toContain('Vitesse moy.')
  })

  it('prend D+ et D− de la même source', () => {
    const detail: ActivityDetail = {
      version: 1,
      series: empty,
      laps: [],
      session: { ascent_m: 190, descent_m: 186 } as ActivityDetail['session'],
    }
    const activity = {
      activity_type: 'running',
      duration_s: 3200,
      moving_s: 3200,
      distance_m: 8000,
      elevation_gain_m: 17,
      avg_hr: null,
      max_hr: null,
      calories: null,
    }
    const figures = (a: typeof activity & { elevation_loss_m?: number | null }) =>
      Object.fromEntries(detailFigures(a, detail).map((f) => [f.label, f.value]))
    // Résumé Garmin : D+ et D− corrigés, jamais le D− brut du .FIT à côté.
    expect(figures({ ...activity, elevation_loss_m: 15 })).toMatchObject({ 'D+': '17 m', 'D−': '15 m' })
    expect(figures(activity)['D−']).toBeUndefined()
    // Sans D+ dans le résumé : les deux viennent du .FIT.
    expect(figures({ ...activity, elevation_gain_m: null as unknown as number })).toMatchObject({
      'D+': '190 m',
      'D−': '186 m',
    })
  })

  it('projette le tracé GPS dans un carré', () => {
    const route = routePath({ ...empty, t: [0, 1, 2], lat: [48.83, 48.831, 48.832], lon: [2.43, 2.431, 2.43] }, 200)
    expect(route?.d.startsWith('M')).toBe(true)
    expect(route?.start[1]).toBeGreaterThan(route?.end[1] ?? 0)
    expect(routePath({ ...empty, t: [0] }, 200)).toBeNull()
  })
})

describe('échelle des graphiques', () => {
  it('écarte les arrêts de la cadence', () => {
    expect(cleanCadence([0, 172, 174, null, 176, 3, 90, 170])).toEqual([null, 172, 174, null, 176, null, 90, 170])
    expect(cleanCadence([0, 0])).toEqual([null, null])
  })

  it('calcule la moyenne des valeurs connues', () => {
    expect(seriesMean([150, null, 160, 170])).toBe(160)
    expect(seriesMean([null])).toBeNull()
  })

  it('repère la fin du premier kilomètre, sauf sur une sortie courte', () => {
    const t = Array.from({ length: 81 }, (_, i) => i * 30)
    const distance = t.map((s) => s * 3)
    expect(warmupEnd({ t, distance })).toBe(distance.findIndex((d) => d >= 1000))
    expect(warmupEnd({ t: t.slice(0, 20), distance: distance.slice(0, 20) })).toBe(0)
    // Sans distance : 15 % de la durée.
    expect(warmupEnd({ t, distance: null })).toBe(12)
  })

  it("cale l'échelle sur le min et le max après la mise en route", () => {
    const hr = [70, 90, 110, 130, ...Array.from({ length: 100 }, (_, i) => 155 + (i % 10)), 182]
    expect(focusRange(hr, 4, 5, 20)).toEqual([155, 185])
    // Sans la mise en route écartée, l'échelle descend jusqu'aux premières valeurs.
    expect(focusRange(hr, 0, 5, 20)).toEqual([70, 185])
    expect(focusRange([120, null], 1, 5, 20)).toEqual([110, 130])
    expect(focusRange([null, null], 0, 5)).toBeNull()
  })
})
