// Détail d'une activité Garmin (0.5.0) : du fichier .FIT d'origine aux séries enregistrées dans
// garmin_activity_details. Sans dépendance : le décodage du .FIT (SDK officiel de Garmin) est fourni
// par la fonction garmin-sync, ou par les tests. Testé par tests/functions/garmin-detail.test.ts.
//
// Le site relit ce format dans src/domain/activityDetail.ts (graphiques, zones, tours).

/** Nombre maximal de points par série : une sortie de 3 h garde un point toutes les 6 s. */
export const MAX_POINTS = 1800

export type Series = (number | null)[]

/** Les séries d'une activité, toutes de la même longueur que `t`. Une série absente du .FIT vaut null. */
export type ActivitySeries = {
  /** Secondes depuis le départ (temps écoulé, pauses comprises). */
  t: number[]
  /** Fréquence cardiaque (bpm). */
  hr: Series | null
  /** Vitesse (m/s). */
  speed: Series | null
  /** Altitude (m). */
  altitude: Series | null
  /** Distance cumulée (m). */
  distance: Series | null
  /** Cadence : pas par minute en course et en marche, tours par minute à vélo. */
  cadence: Series | null
  /** Puissance (W). */
  power: Series | null
  /** Position GPS (degrés), pour le tracé. */
  lat: Series | null
  lon: Series | null
}

/** Un tour (bouton tour, kilomètre automatique ou étape de la séance envoyée sur la montre). */
export type ActivityLap = {
  /** Départ du tour, en secondes depuis le départ de l'activité. */
  start_s: number
  /** Temps chronométré (pauses exclues). */
  duration_s: number | null
  distance_m: number | null
  avg_hr: number | null
  max_hr: number | null
  /** m/s */
  avg_speed: number | null
  max_speed: number | null
  ascent_m: number | null
  descent_m: number | null
  avg_cadence: number | null
  avg_power: number | null
  /** « active », « rest », « warmup », « cooldown », « recovery »… quand la montre suivait une séance. */
  intensity: string | null
  /** « manual », « distance », « time », « session_end »… */
  trigger: string | null
}

/** Les chiffres d'ensemble que la montre calcule elle-même (message « session » du .FIT). */
export type ActivitySession = {
  sport: string | null
  elapsed_s: number | null
  timer_s: number | null
  distance_m: number | null
  ascent_m: number | null
  descent_m: number | null
  min_altitude_m: number | null
  max_altitude_m: number | null
  avg_hr: number | null
  max_hr: number | null
  avg_speed: number | null
  max_speed: number | null
  avg_cadence: number | null
  max_cadence: number | null
  avg_power: number | null
  max_power: number | null
  calories: number | null
  /** Training Effect aérobie et anaérobie (0 à 5). */
  aerobic_te: number | null
  anaerobic_te: number | null
  avg_temperature: number | null
}

/** Ce qui est enregistré dans garmin_activity_details.data. */
export type ActivityDetail = {
  version: 1
  series: ActivitySeries
  laps: ActivityLap[]
  session: ActivitySession
}

/** Messages du .FIT tels que les renvoie le décodeur du SDK Garmin (`Decoder.read()`), réduits à l'utile. */
export type FitMessages = {
  recordMesgs?: Record<string, unknown>[]
  lapMesgs?: Record<string, unknown>[]
  sessionMesgs?: Record<string, unknown>[]
}

/** Décodage d'un fichier .FIT, fourni par l'appelant : null si le fichier est illisible. */
export type DecodeFit = (bytes: Uint8Array) => FitMessages | null

// -----------------------------------------------------------------------------
// Lecture des valeurs du .FIT
// -----------------------------------------------------------------------------

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null)

/** Première valeur numérique trouvée parmi plusieurs champs (ex. enhancedSpeed puis speed). */
function first(message: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = num(message[key])
    if (value !== null) return value
  }
  return null
}

function time(value: unknown): number | null {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value).getTime()
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

const round = (value: number | null, decimals = 0): number | null => {
  if (value === null) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** Valeur gardée seulement si elle est plausible (les capteurs envoient parfois n'importe quoi). */
const within = (value: number | null, min: number, max: number) => (value !== null && value >= min && value <= max ? value : null)

const SEMICIRCLE = 180 / 2 ** 31

/** Sports dont la cadence est comptée en foulées par jambe dans le .FIT : on l'affiche en pas par minute. */
const STEP_SPORTS = new Set(['running', 'walking', 'hiking', 'trail_running'])

function cadenceFactor(sport: string | null) {
  return sport && STEP_SPORTS.has(sport) ? 2 : 1
}

// -----------------------------------------------------------------------------
// Construction du détail
// -----------------------------------------------------------------------------

type Point = {
  t: number
  hr: number | null
  speed: number | null
  altitude: number | null
  distance: number | null
  cadence: number | null
  power: number | null
  lat: number | null
  lon: number | null
}

const NUMERIC_KEYS = ['hr', 'speed', 'altitude', 'distance', 'cadence', 'power'] as const

/** Moyenne des valeurs connues d'un groupe de points (null s'il n'y en a aucune). */
function average(points: Point[], key: (typeof NUMERIC_KEYS)[number]): number | null {
  let sum = 0
  let count = 0
  for (const p of points) {
    const v = p[key]
    if (v !== null) {
      sum += v
      count++
    }
  }
  return count > 0 ? sum / count : null
}

/** Réduit les points à MAX_POINTS au plus, en moyennant chaque tranche de temps (la distance garde la dernière valeur). */
export function downsample(points: Point[], maxPoints = MAX_POINTS): Point[] {
  if (points.length <= maxPoints) return points
  const span = points[points.length - 1].t - points[0].t
  const step = Math.max(1, Math.ceil(span / maxPoints))
  const buckets = new Map<number, Point[]>()
  for (const p of points) {
    const key = Math.floor((p.t - points[0].t) / step)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(p)
    else buckets.set(key, [p])
  }
  return [...buckets.values()].map((bucket) => {
    const firstPoint = bucket[0]
    const last = [...bucket].reverse().find((p) => p.distance !== null)
    return {
      t: firstPoint.t,
      hr: average(bucket, 'hr'),
      speed: average(bucket, 'speed'),
      altitude: average(bucket, 'altitude'),
      distance: last?.distance ?? null,
      cadence: average(bucket, 'cadence'),
      power: average(bucket, 'power'),
      lat: bucket.find((p) => p.lat !== null)?.lat ?? null,
      lon: bucket.find((p) => p.lon !== null)?.lon ?? null,
    }
  })
}

/** Une série, ou null si aucune valeur n'est connue (capteur absent). */
function column(points: Point[], key: keyof Omit<Point, 't'>, decimals: number): Series | null {
  const values = points.map((p) => round(p[key], decimals))
  return values.some((v) => v !== null) ? values : null
}

function readLap(lap: Record<string, unknown>, startMs: number, factor: number): ActivityLap | null {
  const start = time(lap.startTime)
  if (start === null) return null
  const cadence = first(lap, 'avgRunningCadence', 'avgCadence')
  const fractional = first(lap, 'avgFractionalCadence') ?? 0
  return {
    start_s: Math.max(0, Math.round((start - startMs) / 1000)),
    duration_s: round(within(first(lap, 'totalTimerTime', 'totalElapsedTime'), 0, 172_800), 1),
    distance_m: round(within(first(lap, 'totalDistance'), 0, 1_000_000), 1),
    avg_hr: round(within(first(lap, 'avgHeartRate'), 20, 250)),
    max_hr: round(within(first(lap, 'maxHeartRate'), 20, 250)),
    avg_speed: round(within(first(lap, 'enhancedAvgSpeed', 'avgSpeed'), 0, 100), 3),
    max_speed: round(within(first(lap, 'enhancedMaxSpeed', 'maxSpeed'), 0, 100), 3),
    ascent_m: round(within(first(lap, 'totalAscent'), 0, 30_000)),
    descent_m: round(within(first(lap, 'totalDescent'), 0, 30_000)),
    avg_cadence: cadence === null ? null : round((cadence + fractional) * factor),
    avg_power: round(within(first(lap, 'avgPower'), 0, 3000)),
    intensity: typeof lap.intensity === 'string' ? lap.intensity : null,
    trigger: typeof lap.lapTrigger === 'string' ? lap.lapTrigger : null,
  }
}

function readSession(session: Record<string, unknown> | undefined, factor: number): ActivitySession {
  const s = session ?? {}
  const cadence = (keys: string[], fractionalKey: string) => {
    const value = first(s, ...keys)
    return value === null ? null : round((value + (first(s, fractionalKey) ?? 0)) * factor)
  }
  return {
    sport: typeof s.sport === 'string' ? s.sport : null,
    elapsed_s: round(within(first(s, 'totalElapsedTime'), 0, 172_800), 1),
    timer_s: round(within(first(s, 'totalTimerTime'), 0, 172_800), 1),
    distance_m: round(within(first(s, 'totalDistance'), 0, 1_000_000), 1),
    ascent_m: round(within(first(s, 'totalAscent'), 0, 30_000)),
    descent_m: round(within(first(s, 'totalDescent'), 0, 30_000)),
    min_altitude_m: round(within(first(s, 'enhancedMinAltitude', 'minAltitude'), -500, 9000), 1),
    max_altitude_m: round(within(first(s, 'enhancedMaxAltitude', 'maxAltitude'), -500, 9000), 1),
    avg_hr: round(within(first(s, 'avgHeartRate'), 20, 250)),
    max_hr: round(within(first(s, 'maxHeartRate'), 20, 250)),
    avg_speed: round(within(first(s, 'enhancedAvgSpeed', 'avgSpeed'), 0, 100), 3),
    max_speed: round(within(first(s, 'enhancedMaxSpeed', 'maxSpeed'), 0, 100), 3),
    avg_cadence: cadence(['avgRunningCadence', 'avgCadence'], 'avgFractionalCadence'),
    max_cadence: cadence(['maxRunningCadence', 'maxCadence'], 'maxFractionalCadence'),
    avg_power: round(within(first(s, 'avgPower'), 0, 3000)),
    max_power: round(within(first(s, 'maxPower'), 0, 3000)),
    calories: round(within(first(s, 'totalCalories'), 0, 30_000)),
    aerobic_te: round(within(first(s, 'totalTrainingEffect'), 0, 5), 1),
    anaerobic_te: round(within(first(s, 'totalAnaerobicTrainingEffect'), 0, 5), 1),
    avg_temperature: round(within(first(s, 'avgTemperature'), -50, 60)),
  }
}

/** Messages décodés d'un .FIT d'activité → détail à enregistrer, ou null s'il n'y a aucun enregistrement. */
export function buildDetail(messages: FitMessages): ActivityDetail | null {
  const session = messages.sessionMesgs?.[0]
  const sport = session && typeof session.sport === 'string' ? session.sport : null
  const factor = cadenceFactor(sport)

  const raw = (messages.recordMesgs ?? [])
    .map((r) => ({ r, at: time(r.timestamp) }))
    .filter((x): x is { r: Record<string, unknown>; at: number } => x.at !== null)
    .sort((a, b) => a.at - b.at)
  if (raw.length === 0) return null
  const startMs = time(session?.startTime) ?? raw[0].at

  const points: Point[] = raw.map(({ r, at }) => {
    const cadence = first(r, 'cadence')
    const lat = first(r, 'positionLat')
    const lon = first(r, 'positionLong')
    return {
      t: Math.max(0, Math.round((at - startMs) / 1000)),
      hr: within(first(r, 'heartRate'), 20, 250),
      speed: within(first(r, 'enhancedSpeed', 'speed'), 0, 100),
      altitude: within(first(r, 'enhancedAltitude', 'altitude'), -500, 9000),
      distance: within(first(r, 'distance'), 0, 1_000_000),
      cadence: cadence === null ? null : within((cadence + (first(r, 'fractionalCadence') ?? 0)) * factor, 0, 400),
      power: within(first(r, 'power'), 0, 3000),
      lat: lat === null ? null : within(lat * SEMICIRCLE, -90, 90),
      lon: lon === null ? null : within(lon * SEMICIRCLE, -180, 180),
    }
  })
  // Deux enregistrements à la même seconde : on garde le dernier.
  const unique = points.filter((p, i) => i === points.length - 1 || points[i + 1].t !== p.t)
  const sampled = downsample(unique)

  return {
    version: 1,
    series: {
      t: sampled.map((p) => p.t),
      hr: column(sampled, 'hr', 0),
      speed: column(sampled, 'speed', 2),
      altitude: column(sampled, 'altitude', 1),
      distance: column(sampled, 'distance', 0),
      cadence: column(sampled, 'cadence', 0),
      power: column(sampled, 'power', 0),
      lat: column(sampled, 'lat', 5),
      lon: column(sampled, 'lon', 5),
    },
    laps: (messages.lapMesgs ?? [])
      .map((lap) => readLap(lap, startMs, factor))
      .filter((lap): lap is ActivityLap => lap !== null)
      .sort((a, b) => a.start_s - b.start_s),
    session: readSession(session, factor),
  }
}

// -----------------------------------------------------------------------------
// Fichier téléchargé : Garmin renvoie le .FIT d'origine dans une archive ZIP
// -----------------------------------------------------------------------------

/** Vrai si les octets sont un fichier .FIT (« .FIT » aux octets 8 à 11 de l'en-tête). */
export function isFit(bytes: Uint8Array): boolean {
  return bytes.length >= 14 && String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === '.FIT'
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Taille maximale d'un .FIT décompressé (une sortie de 24 h fait environ 5 Mo). */
const MAX_FIT_BYTES = 30 * 1024 * 1024

/**
 * Le premier fichier .fit d'une archive ZIP (ou les octets eux-mêmes s'il s'agit déjà d'un .FIT).
 * Lit le répertoire central de l'archive, sans dépendance. Null si rien n'est lisible.
 */
export async function extractFit(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (isFit(bytes)) return bytes
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  // Fin du répertoire central : signature 0x06054b50, dans les 64 derniers Ko.
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) return null
  const count = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true)
  for (let n = 0; n < count && offset + 46 <= bytes.length; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) return null
    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const size = view.getUint32(offset + 24, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const local = view.getUint32(offset + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
    offset += 46 + nameLength + extraLength + commentLength
    if (!name.toLowerCase().endsWith('.fit') || size > MAX_FIT_BYTES) continue
    if (local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) return null
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    const data = bytes.subarray(dataStart, dataStart + compressedSize)
    try {
      const file = method === 0 ? data : method === 8 ? await inflateRaw(data) : null
      if (file && isFit(file)) return file
    } catch {
      return null
    }
  }
  return null
}
