// Lecture des activités chez Garmin, sans dépendance (fonctions garmin-import et garmin-sync).
// Testé par tests/functions/garmin-import.test.ts.
//
// API personnelle de Garmin Connect (niveau « Personal », lecture seule) :
//   1. la clé d'API personnelle s'échange contre un jeton d'accès valable 24 h :
//      POST /personalapitoken-service/personal-api/personal-api-key/token, en-tête « Authorization: ApiKey <clé> » ;
//   2. le jeton lit la liste des activités :
//      GET /activitylist-service/activities/search/activities?startDate=…&endDate=…
//   3. (0.5.0) le même jeton télécharge le fichier .FIT d'origine de chaque activité, dans une archive ZIP :
//      GET /download-service/files/activity/{activityId}
// Un nouveau jeton est demandé à chaque import : il n'est jamais stocké.

export const GARMIN_BASE = 'https://personal.connectapi.garmin.com'
const TOKEN_PATH = '/personalapitoken-service/personal-api/personal-api-key/token'
const LIST_PATH = '/activitylist-service/activities/search/activities'
const FILE_PATH = '/download-service/files/activity/'

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
  elevationLoss: number | null
  averageHR: number | null
  maxHR: number | null
  calories: number | null
}

export type ImportError = 'not_configured' | 'not_allowed' | 'bad_range' | 'garmin_key_rejected' | 'garmin_unavailable'

export type ImportResult =
  | { status: 200; body: { activities: GarminSummary[] } }
  | { status: 400 | 403 | 502 | 503; body: { error: ImportError } }

export type Fetch = (
  url: string,
  init?: { method?: string; headers?: Record<string, string> },
) => Promise<{
  ok: boolean
  status: number
  text: () => Promise<string>
  /** Pour le téléchargement des fichiers .FIT. */
  arrayBuffer?: () => Promise<ArrayBuffer>
  headers?: { get: (name: string) => string | null }
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
    elevationLoss: num(a.elevationLoss),
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

export type FetchResult =
  | { activities: GarminSummary[]; /** Jeton d'accès, réutilisable pour les fichiers .FIT pendant ce passage. */ token: string }
  | { error: 'garmin_key_rejected' | 'garmin_unavailable' }

/** Échange la clé contre un jeton, puis lit les activités de la période. */
export async function fetchGarminActivities(
  apiKey: string,
  range: { from: string; to: string },
  fetchImpl: Fetch,
): Promise<FetchResult> {
  try {
    const tokenResponse = await fetchImpl(GARMIN_BASE + TOKEN_PATH, {
      method: 'POST',
      headers: { Authorization: `ApiKey ${apiKey.trim()}`, Accept: '*/*' },
    })
    if (tokenResponse.status === 401 || tokenResponse.status === 403) return { error: 'garmin_key_rejected' }
    const token = tokenResponse.ok ? readToken(await tokenResponse.text()) : null
    if (!token) return { error: 'garmin_unavailable' }

    const query = new URLSearchParams({
      start: '0',
      limit: String(MAX_ACTIVITIES),
      startDate: range.from,
      endDate: range.to,
    })
    const listResponse = await fetchImpl(`${GARMIN_BASE}${LIST_PATH}?${query}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (listResponse.status === 401 || listResponse.status === 403) return { error: 'garmin_key_rejected' }
    if (!listResponse.ok) return { error: 'garmin_unavailable' }
    const text = await listResponse.text()
    const list: unknown = text ? JSON.parse(text) : []
    const activities = (Array.isArray(list) ? list : []).map(pickSummary).filter((a): a is GarminSummary => a !== null)
    return { activities, token }
  } catch {
    return { error: 'garmin_unavailable' }
  }
}

/** Taille maximale d'une archive téléchargée (une sortie de 24 h fait quelques Mo). */
const MAX_FILE_BYTES = 20 * 1024 * 1024

/**
 * Fichier d'une activité, ou la raison de l'échec (« HTTP 403 », « réseau »…), enregistrée pour le diagnostic :
 * - `refused` : Garmin refuse ce fichier (erreur 4xx) ; inutile de réessayer à chaque passage ;
 * - `garmin_unavailable` : panne passagère (5xx, trop de demandes, réseau) ; nouvel essai au prochain passage.
 */
export type FileResult = { bytes: Uint8Array; contentType: string } | { error: 'refused' | 'garmin_unavailable'; reason: string }

/** Télécharge le fichier d'origine d'une activité (archive ZIP contenant le .FIT). */
export async function fetchActivityFile(token: string, activityId: number, fetchImpl: Fetch): Promise<FileResult> {
  try {
    const response = await fetchImpl(`${GARMIN_BASE}${FILE_PATH}${activityId}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/zip, application/octet-stream, */*' },
    })
    const reason = `HTTP ${response.status}`
    if (response.status === 429 || response.status >= 500) return { error: 'garmin_unavailable', reason }
    // Le jeton vient de servir à lire la liste : un 401 ou un 403 ici vise ce fichier, pas la clé.
    if (!response.ok) return { error: 'refused', reason }
    if (!response.arrayBuffer) return { error: 'garmin_unavailable', reason: 'réponse illisible' }
    const buffer = await response.arrayBuffer()
    if (buffer.byteLength === 0) return { error: 'refused', reason: `${reason}, réponse vide` }
    if (buffer.byteLength > MAX_FILE_BYTES) return { error: 'refused', reason: `fichier trop gros (${buffer.byteLength} octets)` }
    return { bytes: new Uint8Array(buffer), contentType: response.headers?.get('content-type') ?? '' }
  } catch (error) {
    return {
      error: 'garmin_unavailable',
      reason: `réseau : ${error instanceof Error ? error.message : String(error)}`.slice(0, 200),
    }
  }
}

/** Vrai si `email` est l'adresse désignée par GARMIN_ATHLETE_EMAIL (sans tenir compte de la casse). */
export function sameEmail(email: string | null | undefined, allowed: string): boolean {
  return !!email && email.trim().toLowerCase() === allowed.trim().toLowerCase()
}

/**
 * Traite une demande d'import du site. `email` est l'adresse du compte connecté (vérifiée par Supabase) :
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
  if (!sameEmail(email, allowedEmail)) return { status: 403, body: { error: 'not_allowed' } }
  const range = parseRange(body)
  if (!range) return { status: 400, body: { error: 'bad_range' } }
  const result = await fetchGarminActivities(apiKey, range, fetchImpl)
  return 'error' in result
    ? { status: 502, body: { error: result.error } }
    : { status: 200, body: { activities: result.activities } }
}
