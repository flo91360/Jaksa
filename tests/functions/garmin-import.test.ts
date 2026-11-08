import { describe, expect, it } from 'vitest'
import { GARMIN_BASE, handleImport, parseRange, pickSummary } from '../../supabase/functions/_shared/garmin-api.ts'

const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJleHAiOjE3OTAwMDAwMDB9.c2lnbmF0dXJl'

const ACTIVITY = {
  activityId: 21_000_000_001,
  activityName: 'Palaiseau Course à pied',
  activityType: { typeId: 1, typeKey: 'running' },
  startTimeLocal: '2026-11-10 08:02:11',
  startTimeGMT: '2026-11-10 07:02:11',
  duration: 3125.4,
  movingDuration: 3080,
  distance: 10_215.3,
  elevationGain: 85,
  averageHR: 146,
  maxHR: 171,
  calories: 690,
  // Champs que la fonction ne renvoie pas au site.
  ownerFullName: 'Florian',
  summarizedDiveInfo: {},
}

type Call = { url: string; method?: string; headers?: Record<string, string> }

function fakeGarmin(responses: { status: number; body: string }[]) {
  const calls: Call[] = []
  const fetchImpl = async (url: string, init?: { method?: string; headers?: Record<string, string> }) => {
    calls.push({ url, ...init })
    const next = responses.shift() ?? { status: 500, body: '' }
    return { ok: next.status >= 200 && next.status < 300, status: next.status, text: async () => next.body }
  }
  return { calls, fetchImpl }
}

const base = { apiKey: 'cle-perso', allowedEmail: 'Florian@Exemple.fr', body: { from: '2026-11-01', to: '2026-11-14' } }

describe('import Garmin (fonction)', () => {
  it('échange la clé contre un jeton, puis lit les activités de la période', async () => {
    const { calls, fetchImpl } = fakeGarmin([
      { status: 200, body: TOKEN },
      { status: 200, body: JSON.stringify([ACTIVITY]) },
    ])
    const result = await handleImport({ ...base, email: 'florian@exemple.fr', fetchImpl })
    expect(result.status).toBe(200)
    expect(calls[0]).toMatchObject({
      url: `${GARMIN_BASE}/personalapitoken-service/personal-api/personal-api-key/token`,
      method: 'POST',
      headers: { Authorization: 'ApiKey cle-perso' },
    })
    const list = new URL(calls[1].url)
    expect(list.pathname).toBe('/activitylist-service/activities/search/activities')
    expect(list.searchParams.get('startDate')).toBe('2026-11-01')
    expect(list.searchParams.get('endDate')).toBe('2026-11-14')
    expect(calls[1].headers?.Authorization).toBe(`Bearer ${TOKEN}`)
    if (result.status !== 200) throw new Error('attendu : 200')
    expect(result.body.activities).toEqual([
      {
        activityId: 21_000_000_001,
        activityName: 'Palaiseau Course à pied',
        activityType: { typeKey: 'running' },
        startTimeLocal: '2026-11-10 08:02:11',
        startTimeGMT: '2026-11-10 07:02:11',
        duration: 3125.4,
        movingDuration: 3080,
        distance: 10_215.3,
        elevationGain: 85,
        averageHR: 146,
        maxHR: 171,
        calories: 690,
      },
    ])
  })

  it('accepte un jeton renvoyé en JSON', async () => {
    const { fetchImpl } = fakeGarmin([
      { status: 200, body: JSON.stringify({ access_token: TOKEN }) },
      { status: 200, body: '[]' },
    ])
    expect(await handleImport({ ...base, email: 'florian@exemple.fr', fetchImpl })).toEqual({
      status: 200,
      body: { activities: [] },
    })
  })

  it("refuse tout autre compte que celui désigné, sans appeler Garmin", async () => {
    const { calls, fetchImpl } = fakeGarmin([])
    expect(await handleImport({ ...base, email: 'autre@exemple.fr', fetchImpl })).toEqual({
      status: 403,
      body: { error: 'not_allowed' },
    })
    expect(await handleImport({ ...base, email: null, fetchImpl })).toMatchObject({ status: 403 })
    expect(calls).toEqual([])
  })

  it('signale une configuration incomplète', async () => {
    const { fetchImpl } = fakeGarmin([])
    expect(await handleImport({ ...base, apiKey: '', email: 'florian@exemple.fr', fetchImpl })).toEqual({
      status: 503,
      body: { error: 'not_configured' },
    })
    expect(await handleImport({ ...base, allowedEmail: undefined, email: 'florian@exemple.fr', fetchImpl })).toMatchObject({
      status: 503,
    })
  })

  it('signale une clé refusée (expirée ou supprimée) et une panne de Garmin', async () => {
    const rejected = fakeGarmin([{ status: 401, body: 'Unauthorized' }])
    expect(await handleImport({ ...base, email: 'florian@exemple.fr', fetchImpl: rejected.fetchImpl })).toEqual({
      status: 502,
      body: { error: 'garmin_key_rejected' },
    })
    const down = fakeGarmin([
      { status: 200, body: TOKEN },
      { status: 503, body: '' },
    ])
    expect(await handleImport({ ...base, email: 'florian@exemple.fr', fetchImpl: down.fetchImpl })).toEqual({
      status: 502,
      body: { error: 'garmin_unavailable' },
    })
    const garbage = fakeGarmin([{ status: 200, body: 'pas un jeton' }])
    expect(await handleImport({ ...base, email: 'florian@exemple.fr', fetchImpl: garbage.fetchImpl })).toMatchObject({
      body: { error: 'garmin_unavailable' },
    })
  })

  it('contrôle la période demandée', () => {
    expect(parseRange({ from: '2026-11-01', to: '2026-11-31' })).toBeNull()
    expect(parseRange({ from: '2026-11-01', to: '2026-12-01' })).toEqual({ from: '2026-11-01', to: '2026-12-01' })
    expect(parseRange({ from: '2026-11-01', to: '2026-12-02' })).toBeNull()
    expect(parseRange({ from: '2026-11-10', to: '2026-11-09' })).toBeNull()
    expect(parseRange({ from: '10/11/2026', to: '2026-11-09' })).toBeNull()
    expect(parseRange(null)).toBeNull()
  })

  it('écarte les activités sans identifiant', () => {
    expect(pickSummary({ activityName: 'sans id' })).toBeNull()
    expect(pickSummary('texte')).toBeNull()
  })
})
