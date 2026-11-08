import { describe, expect, it } from 'vitest'
import { fetchActivityFile } from '../../supabase/functions/_shared/garmin-api.ts'
import { buildDetail, extractFit, MAX_POINTS } from '../../supabase/functions/_shared/garmin-detail.ts'
import { decodeFit, FIXTURE_STEPS, fixtureFit, zipOf } from './fit-fixture.ts'

describe('détail d’une activité (.FIT)', () => {
  const fit = fixtureFit()
  const total = FIXTURE_STEPS.reduce((sum, step) => sum + step.seconds, 0)

  it('lit les séries, les tours et les chiffres de la montre', () => {
    const detail = buildDetail(decodeFit(fit) ?? {})
    expect(detail).not.toBeNull()
    if (!detail) return
    const { series, laps, session } = detail
    // 55 min à la seconde : réduit à MAX_POINTS points au plus, toutes les séries de même longueur.
    expect(series.t.length).toBeLessThanOrEqual(MAX_POINTS)
    expect(series.t.length).toBeGreaterThan(1000)
    for (const key of ['hr', 'speed', 'altitude', 'distance', 'cadence', 'lat', 'lon'] as const) {
      expect(series[key]?.length).toBe(series.t.length)
    }
    expect(series.power).toBeNull()
    expect(series.t[0]).toBe(0)
    expect(series.t.at(-1)).toBeGreaterThan(total - 5)
    expect(Math.max(...(series.hr as number[]))).toBeGreaterThan(165)
    // Cadence de course en pas par minute (le .FIT compte les foulées d'une jambe).
    expect(Math.max(...(series.cadence as number[]))).toBe(180)
    expect(series.lat?.[0]).toBeCloseTo(48.83, 2)

    expect(laps).toHaveLength(FIXTURE_STEPS.length)
    expect(laps[1]).toMatchObject({ start_s: 900, duration_s: 180, intensity: 'active', trigger: 'time', avg_cadence: 180 })
    expect(laps[1].distance_m).toBeCloseTo(720, -1)
    expect(laps[1].avg_speed).toBeCloseTo(4, 1)

    expect(session).toMatchObject({
      sport: 'running',
      elapsed_s: total,
      avg_cadence: 170,
      max_cadence: 184,
      calories: 640,
      aerobic_te: 3.8,
      anaerobic_te: 2.4,
    })
    // Assez petit pour la base (2 Mo au plus).
    expect(JSON.stringify(detail).length).toBeLessThan(250_000)
  })

  it("ne garde pas d'activité sans enregistrement", () => {
    expect(buildDetail({ recordMesgs: [], sessionMesgs: [{ sport: 'running' }] })).toBeNull()
  })

  it('écarte les valeurs aberrantes des capteurs', () => {
    const detail = buildDetail({
      recordMesgs: [
        { timestamp: new Date('2026-11-10T10:00:00Z'), heartRate: 255, enhancedSpeed: 3 },
        { timestamp: new Date('2026-11-10T10:00:01Z'), heartRate: 140, enhancedSpeed: 3.1 },
      ],
    })
    expect(detail?.series.hr).toEqual([null, 140])
    expect(detail?.series.altitude).toBeNull()
  })

  it("sort le .FIT de l'archive ZIP de Garmin, ou le prend tel quel", async () => {
    expect(await extractFit(zipOf('123456789_ACTIVITY.fit', fit))).toEqual(fit)
    expect(await extractFit(fit)).toBe(fit)
    expect(await extractFit(zipOf('lisez-moi.txt', new TextEncoder().encode('rien')))).toBeNull()
    expect(await extractFit(new Uint8Array([1, 2, 3]))).toBeNull()
  })

  it('télécharge le fichier avec le jeton, et distingue une activité sans fichier', async () => {
    const urls: string[] = []
    const ok = await fetchActivityFile('jeton', 42, async (url, init) => {
      urls.push(`${url} ${init?.headers?.Authorization}`)
      return { ok: true, status: 200, text: async () => '', arrayBuffer: async () => fit.slice().buffer }
    })
    expect(urls).toEqual(['https://personal.connectapi.garmin.com/download-service/files/activity/42 Bearer jeton'])
    expect('bytes' in ok && ok.bytes.length).toBe(fit.length)
    const missing = await fetchActivityFile('jeton', 42, async () => ({ ok: false, status: 404, text: async () => '' }))
    expect(missing).toEqual({ error: 'not_found' })
    const rejected = await fetchActivityFile('jeton', 42, async () => ({ ok: false, status: 401, text: async () => '' }))
    expect(rejected).toEqual({ error: 'garmin_key_rejected' })
  })
})
