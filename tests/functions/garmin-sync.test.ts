import { describe, expect, it } from 'vitest'
import { MIN_INTERVAL_MS, runSync, type SyncDb } from '../../supabase/functions/_shared/garmin-sync.ts'

const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJleHAiOjE3OTAwMDAwMDB9.c2lnbmF0dXJl'
const NOW = Date.parse('2026-11-10T19:00:00Z')

const activity = (id: number, day: string, type = 'running') => ({
  activityId: id,
  activityName: 'Sortie',
  activityType: { typeKey: type },
  startTimeLocal: `${day} 18:30:00`,
  startTimeGMT: `${day} 17:30:00`,
  duration: 3000,
  movingDuration: 2950,
  distance: 10_000,
  elevationGain: 50,
  averageHR: 145,
  maxHR: 170,
  calories: 600,
})

function garmin(list: unknown[] | { status: number }) {
  const urls: string[] = []
  const fetchImpl = async (url: string) => {
    urls.push(url)
    if (url.includes('/token')) return { ok: true, status: 200, text: async () => TOKEN }
    if (!Array.isArray(list)) return { ok: false, status: list.status, text: async () => '' }
    return { ok: true, status: 200, text: async () => JSON.stringify(list) }
  }
  return { urls, fetchImpl }
}

function fakeDb({ athlete = 'athlete-1' as string | null, lastRun = null as string | null, links = new Map<number, string | null>() } = {}) {
  const saved: unknown[][] = []
  const logs: unknown[] = []
  const db: SyncDb = {
    findAthlete: async (email) => (email === 'florian@exemple.fr' ? athlete : null),
    lastRun: async () => lastRun,
    workouts: async () => [
      { id: 'mardi', scheduled_on: '2026-11-10', kind: 'run', position: 0 },
      { id: 'lundi', scheduled_on: '2026-11-09', kind: 'run', position: 0 },
    ],
    existingLinks: async () => links,
    save: async (_athleteId, rows) => {
      saved.push(rows)
    },
    log: async (entry) => {
      logs.push(entry)
    },
  }
  return { db, saved, logs }
}

const base = { apiKey: 'cle', allowedEmail: 'florian@exemple.fr', now: NOW }

describe('import Garmin automatique', () => {
  it('importe les nouvelles activités, les rattache et note le passage', async () => {
    const { fetchImpl, urls } = garmin([activity(1, '2026-11-10'), activity(2, '2026-11-08', 'cycling')])
    const { db, saved, logs } = fakeDb()
    const result = await runSync({ ...base, fetchImpl, db })
    expect(result).toEqual({ status: 'ok', imported: 2, linked: 1 })
    expect(saved[0]).toMatchObject([
      { garmin_activity_id: 1, workout_id: 'mardi' },
      { garmin_activity_id: 2, workout_id: null },
    ])
    expect(logs).toEqual([{ athlete_id: 'athlete-1', status: 'ok', imported: 2, linked: 1 }])
    // 14 derniers jours, plus le lendemain en UTC (sorties du soir).
    const list = new URL(urls[1])
    expect(list.searchParams.get('startDate')).toBe('2026-10-28')
    expect(list.searchParams.get('endDate')).toBe('2026-11-11')
  })

  it('garde les rattachements déjà faits', async () => {
    const { fetchImpl } = garmin([activity(1, '2026-11-10')])
    const { db, saved } = fakeDb({ links: new Map([[1, 'autre-seance']]) })
    await runSync({ ...base, fetchImpl, db })
    expect(saved[0]).toMatchObject([{ garmin_activity_id: 1, workout_id: 'autre-seance' }])
  })

  it("n'interroge pas Garmin plus d'une fois toutes les 5 minutes", async () => {
    const { fetchImpl, urls } = garmin([])
    const { db, logs } = fakeDb({ lastRun: new Date(NOW - MIN_INTERVAL_MS + 1000).toISOString() })
    expect(await runSync({ ...base, fetchImpl, db })).toEqual({ status: 'too_soon', imported: 0, linked: 0 })
    expect(urls).toEqual([])
    expect(logs).toEqual([])
  })

  it('ne fait rien sans clé, et signale une adresse inconnue', async () => {
    const { fetchImpl, urls } = garmin([])
    const empty = fakeDb()
    expect((await runSync({ ...base, apiKey: undefined, fetchImpl, db: empty.db })).status).toBe('not_configured')
    const unknown = fakeDb({ athlete: null })
    expect((await runSync({ ...base, fetchImpl, db: unknown.db })).status).toBe('unknown_athlete')
    expect(unknown.logs).toEqual([{ athlete_id: null, status: 'unknown_athlete', imported: 0, linked: 0 }])
    expect(urls).toEqual([])
  })

  it('note une clé refusée ou une panne de Garmin', async () => {
    const down = garmin({ status: 503 })
    const { db, logs, saved } = fakeDb()
    expect((await runSync({ ...base, fetchImpl: down.fetchImpl, db })).status).toBe('garmin_unavailable')
    expect(logs).toEqual([{ athlete_id: 'athlete-1', status: 'garmin_unavailable', imported: 0, linked: 0 }])
    expect(saved).toEqual([])
  })

  it("note un échec d'enregistrement", async () => {
    const { fetchImpl } = garmin([activity(1, '2026-11-10')])
    const { db, logs } = fakeDb()
    db.save = async () => {
      throw new Error('refusé')
    }
    expect((await runSync({ ...base, fetchImpl, db })).status).toBe('save_failed')
    expect(logs).toEqual([{ athlete_id: 'athlete-1', status: 'save_failed', imported: 0, linked: 0 }])
  })
})
