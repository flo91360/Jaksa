// Cœur de la fonction garmin-import, sans dépendance : testé par tests/functions/garmin-import.test.ts.
//
// API personnelle de Garmin Connect (niveau « Personal », lecture seule) :
//   1. la clé d'API personnelle s'échange contre un jeton d'accès valable 24 h :
//      POST /personalapitoken-service/personal-api/personal-api-key/token, en-tête « Authorization: ApiKey <clé> » ;
//   2. le jeton lit la liste des activités :
//      GET /activitylist-service/activities/search/activities?startDate=…&endDate=…
// Un nouveau jeton est demandé à chaque import : il n'est jamais stocké.

export const GARMIN_BASE = 'https://personal.connectapi.garmin.com'
const TOKEN_PATH = '/personalapitoken-service/personal-api/personal-api-key/token'
const LIST_PATH = '/activitylist-service/activities/search/activities'

/** Nombre de jours au plus par import. */
export const MAX_RANGE_DAYS = 31
const MAX_ACTIVITIES = 100

/** Les seuls champs renvoyés au site (le reste de la réponse de Garmin est écarté). */
export type GarminSummary = {
  activityId: number
  activityName: string | null
  activityType: { typeKey: string } | null
  /** « AAAA-MM-JJ HH:MM:SS », heure locale de la montre. */
  startTimeLocal: string | null
  /** « AAAA-MM-JJ HH:MM:SS », heure UTC. */
  startTimeGMT: string | null
  duration: number | null
  movingDuration: number | null
  distance: number | null
  elevationGain: number | null
  averageHR: number | null
  maxHR: number | null
  calories: number | null
}

export type ImportError = 'not_configured' | 'not_allowed' | 'bad_range' | 'garmin_key_rejected' | 'garmin_unavailable'

export type ImportResult =
  | { status: 200; body: { activities: GarminSummary[] } }
  | { status: 400 | 403 | 502 | 503; body: { error: ImportError } }

type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<{
  ok: boolean
  status: number
  text: () => Promise<string>
}>

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Période demandée par le site : deux dates AAAA-MM-JJ, 31 jours au plus. */
export function parseRange(body: unknown): { from: string; to: string } | null {
  if (!body || typeof body !== 'object') return null
  const { from, to } = body as Record<string, unknown>
  if (typeof from !== 'string' || typeof to !== 'string' || !DATE_RE.test(from) || !DATE_RE.test(to)) return null
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null
  // Refuse les dates qui n'existent pas (31 novembre…).
  if (new Date(start).toISOString().slice(0, 10) !== from || new Date(end).toISOString().slice(0, 10) !== to) return null
  if ((end - start) / 86_400_000 + 1 > MAX_RANGE_DAYS) return null
  return { from, to }
}

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** Ne garde que les champs utiles d'une activité de la liste de Garmin. */
export function pickSummary(raw: unknown): GarminSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const a = raw as Record<string, unknown>
  const id = num(a.activityId)
  if (id === null || id <= 0) return null
  const type = a.activityType as Record<string, unknown> | null | undefined
  return {
    activityId: id,
    activityName: str(a.activityName),
    activityType: type && typeof type.typeKey === 'string' ? { typeKey: type.typeKey } : null,
    startTimeLocal: str(a.startTimeLocal),
    startTimeGMT: str(a.startTimeGMT),
    duration: num(a.duration),
    movingDuration: num(a.movingDuration),
    distance: num(a.distance),
    elevationGain: num(a.elevationGain),
    averageHR: num(a.averageHR),
    maxHR: num(a.maxHR),
    calories: num(a.calories),
  }
}

/** Le jeton arrive en texte brut (un JWT) ; on accepte aussi une réponse JSON. */
function readToken(body: string): string | null {
  let token = body.trim()
  if (token.startsWith('{')) {
    try {
      const json = JSON.parse(token) as Record<string, unknown>
      token = String(json.access_token ?? json.accessToken ?? json.token ?? '')
    } catch {
      return null
    }
  }
  return token.split('.').length === 3 ? token : null
}

/**
 * Traite une demande d'import. `email` est l'adresse du compte connecté (vérifiée par Supabase) :
 * seule la personne désignée par le secret GARMIN_ATHLETE_EMAIL peut lire les activités de la clé.
 */
export async function handleImport({
  email,
  body,
  apiKey,
  allowedEmail,
  fetchImpl,
}: {
  email: string | null | undefined
  body: unknown
  apiKey: string | undefined
  allowedEmail: string | undefined
  fetchImpl: Fetch
}): Promise<ImportResult> {
  if (!apiKey?.trim() || !allowedEmail?.trim()) return { status: 503, body: { error: 'not_configured' } }
  if (!email || email.trim().toLowerCase() !== allowedEmail.trim().toLowerCase()) {
    return { status: 403, body: { error: 'not_allowed' } }
  }
  const range = parseRange(body)
  if (!range) return { status: 400, body: { error: 'bad_range' } }

  try {
    const tokenResponse = await fetchImpl(GARMIN_BASE + TOKEN_PATH, {
      method: 'POST',
      headers: { Authorization: `ApiKey ${apiKey.trim()}`, Accept: '*/*' },
    })
    if (tokenResponse.status === 401 || tokenResponse.status === 403) {
      return { status: 502, body: { error: 'garmin_key_rejected' } }
    }
    const token = tokenResponse.ok ? readToken(await tokenResponse.text()) : null
    if (!token) return { status: 502, body: { error: 'garmin_unavailable' } }

    const query = new URLSearchParams({
      start: '0',
      limit: String(MAX_ACTIVITIES),
      startDate: range.from,
      endDate: range.to,
    })
    const listResponse = await fetchImpl(`${GARMIN_BASE}${LIST_PATH}?${query}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (listResponse.status === 401 || listResponse.status === 403) {
      return { status: 502, body: { error: 'garmin_key_rejected' } }
    }
    if (!listResponse.ok) return { status: 502, body: { error: 'garmin_unavailable' } }
    const text = await listResponse.text()
    const list: unknown = text ? JSON.parse(text) : []
    const activities = (Array.isArray(list) ? list : [])
      .map(pickSummary)
      .filter((a): a is GarminSummary => a !== null)
    return { status: 200, body: { activities } }
  } catch {
    return { status: 502, body: { error: 'garmin_unavailable' } }
  }
}
