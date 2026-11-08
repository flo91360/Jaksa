import { describe, expect, it } from 'vitest'
import { DETAIL_RETRY_MS, MAX_DETAILS_PER_RUN, MIN_INTERVAL_MS, runSync, type SyncDb } from '../../supabase/functions/_shared/garmin-sync.ts'
import { decodeFit, fixtureFit, zipOf } from './fit-fixture.ts'

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
    pendingDetails: async () => [],
    saveDetail: async () => {},
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
    expect(result).toEqual({ status: 'ok', imported: 2, linked: 1, details: 0 })
    expect(saved[0]).toMatchObject([
      { garmin_activity_id: 1, workout_id: 'mardi' },
      { garmin_activity_id: 2, workout_id: null },
    ])
    expect(logs).toEqual([{ athlete_id: 'athlete-1', status: 'ok', imported: 2, linked: 1, details: 0 }])
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
    expect(await runSync({ ...base, fetchImpl, db })).toEqual({ status: 'too_soon', imported: 0, linked: 0, details: 0 })
    expect(urls).toEqual([])
    expect(logs).toEqual([])
  })

  it('ne fait rien sans clé, et signale une adresse inconnue', async () => {
    const { fetchImpl, urls } = garmin([])
    const empty = fakeDb()
    expect((await runSync({ ...base, apiKey: undefined, fetchImpl, db: empty.db })).status).toBe('not_configured')
    const unknown = fakeDb({ athlete: null })
    expect((await runSync({ ...base, fetchImpl, db: unknown.db })).status).toBe('unknown_athlete')
    expect(unknown.logs).toEqual([{ athlete_id: null, status: 'unknown_athlete', imported: 0, linked: 0, details: 0 }])
    expect(urls).toEqual([])
  })

  it('note une clé refusée ou une panne de Garmin', async () => {
    const down = garmin({ status: 503 })
    const { db, logs, saved } = fakeDb()
    expect((await runSync({ ...base, fetchImpl: down.fetchImpl, db })).status).toBe('garmin_unavailable')
    expect(logs).toEqual([{ athlete_id: 'athlete-1', status: 'garmin_unavailable', imported: 0, linked: 0, details: 0 }])
    expect(saved).toEqual([])
  })

  it("note un échec d'enregistrement", async () => {
    const { fetchImpl } = garmin([activity(1, '2026-11-10')])
    const { db, logs } = fakeDb()
    db.save = async () => {
      throw new Error('refusé')
    }
    expect((await runSync({ ...base, fetchImpl, db })).status).toBe('save_failed')
    expect(logs).toEqual([{ athlete_id: 'athlete-1', status: 'save_failed', imported: 0, linked: 0, details: 0 }])
  })

  describe('détail des activités (.FIT)', () => {
    const zip = zipOf('1_ACTIVITY.fit', fixtureFit())

    /** Garmin : jeton, liste vide, puis les fichiers demandés (réponses dans l'ordre). */
    function garminWithFiles(files: ({ status: number; bytes?: Uint8Array })[]) {
      const urls: string[] = []
      const fetchImpl = async (url: string) => {
        urls.push(url)
        if (url.includes('/token')) return { ok: true, status: 200, text: async () => TOKEN }
        if (url.includes('/activitylist-service/')) return { ok: true, status: 200, text: async () => '[]' }
        const next = files.shift() ?? { status: 500 }
        const bytes = next.bytes ?? new Uint8Array()
        return { ok: next.status === 200, status: next.status, text: async () => '', arrayBuffer: async () => bytes.slice().buffer }
      }
      return { urls, fetchImpl }
    }

    function detailDb(pending = [{ id: 'a1', garmin_activity_id: 11 }, { id: 'a2', garmin_activity_id: 22 }]) {
      const fake = fakeDb()
      const details: { activity_id: string; status: string; hasData: boolean }[] = []
      const asked: unknown[] = []
      fake.db.pendingDetails = async (...args) => {
        asked.push(args)
        return pending.slice(0, args[3])
      }
      fake.db.saveDetail = async (row) => {
        details.push({ activity_id: row.activity_id, status: row.status, hasData: row.data !== null })
      }
      return { ...fake, details, asked }
    }

    it('lit le .FIT des activités récentes qui n’en ont pas encore', async () => {
      const { fetchImpl, urls } = garminWithFiles([{ status: 200, bytes: zip }, { status: 404 }])
      const { db, details, asked, logs } = detailDb()
      const result = await runSync({ ...base, fetchImpl, db, decodeFit })
      expect(result).toEqual({ status: 'ok', imported: 0, linked: 0, details: 1 })
      expect(asked).toEqual([['athlete-1', '2026-10-28T00:00:00Z', new Date(NOW - DETAIL_RETRY_MS).toISOString(), MAX_DETAILS_PER_RUN]])
      expect(urls.slice(2)).toEqual([
        'https://personal.connectapi.garmin.com/download-service/files/activity/11',
        'https://personal.connectapi.garmin.com/download-service/files/activity/22',
      ])
      expect(details).toEqual([
        { activity_id: 'a1', status: 'ok', hasData: true },
        { activity_id: 'a2', status: 'no_file', hasData: false },
      ])
      expect(logs).toEqual([{ athlete_id: 'athlete-1', status: 'ok', imported: 0, linked: 0, details: 1 }])
    })

    it('note un fichier illisible pour ne pas le redemander à chaque passage', async () => {
      const { fetchImpl } = garminWithFiles([{ status: 200, bytes: new Uint8Array([1, 2, 3]) }])
      const { db, details } = detailDb([{ id: 'a1', garmin_activity_id: 11 }])
      expect((await runSync({ ...base, fetchImpl, db, decodeFit })).details).toBe(0)
      expect(details).toEqual([{ activity_id: 'a1', status: 'unreadable', hasData: false }])
    })

    it("s'arrête sans rien noter si Garmin ne répond pas : nouvel essai au prochain passage", async () => {
      const { fetchImpl } = garminWithFiles([{ status: 503 }])
      const { db, details, logs } = detailDb()
      expect(await runSync({ ...base, fetchImpl, db, decodeFit })).toEqual({ status: 'ok', imported: 0, linked: 0, details: 0 })
      expect(details).toEqual([])
      expect(logs).toHaveLength(1)
    })

    it('un échec du détail ne fait pas échouer l’import des résumés', async () => {
      const { fetchImpl } = garminWithFiles([])
      const { db, logs } = detailDb()
      db.pendingDetails = async () => {
        throw new Error('base indisponible')
      }
      expect((await runSync({ ...base, fetchImpl, db, decodeFit })).status).toBe('ok')
      expect(logs).toHaveLength(1)
    })
  })
})
