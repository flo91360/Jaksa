/**
 * Détail d'une activité Garmin (0.5.0) : courbes, temps par zone, tours et
 * comparaison avec la séance prévue. Le format vient de la fonction
 * garmin-sync (supabase/functions/_shared/garmin-detail.ts).
 */
import type {
  ActivityDetail,
  ActivityLap,
  ActivitySeries,
  ActivitySession,
  Series,
} from '../../supabase/functions/_shared/garmin-detail.ts'
import { garminSport } from '../../supabase/functions/_shared/garmin-match.ts'
import { formatPace } from './pace.ts'
import {
  type ResolvedTarget,
  STEP_KINDS,
  type StepKind,
  type WorkoutItem,
  type WorkoutStep,
  formatDistance,
  formatDuration,
  formatStepDuration,
  resolveTarget,
} from './workouts.ts'
import type { HrZone } from './zones.ts'

export type { ActivityDetail, ActivityLap, ActivitySeries, ActivitySession, Series }

/** Vrai si `data` a la forme attendue (une ligne écrite par une version future est ignorée). */
export function isActivityDetail(data: unknown): data is ActivityDetail {
  if (!data || typeof data !== 'object') return false
  const d = data as Partial<ActivityDetail>
  return d.version === 1 && !!d.series && Array.isArray(d.series.t) && Array.isArray(d.laps) && !!d.session
}

/** Sport « à pied » : l'allure (min/km) a un sens, sinon on parle de vitesse. */
export function isFootSport(activityType: string): boolean {
  const sport = garminSport(activityType)
  return sport === 'run' || sport === 'trail' || /walk|hik/.test(activityType)
}

/** Vitesse (m/s) → allure (s/km). Null à l'arrêt ou presque (plus lent que 20:00 /km). */
export function speedToPace(speed: number | null | undefined): number | null {
  if (speed === null || speed === undefined || !Number.isFinite(speed) || speed < 1000 / 1200) return null
  return 1000 / speed
}

// -----------------------------------------------------------------------------
// Séries pour les graphiques
// -----------------------------------------------------------------------------

/** Pas de temps habituel entre deux points (médiane), pour repérer les pauses. */
export function typicalStep(t: number[]): number {
  if (t.length < 2) return 1
  const steps = t
    .slice(1)
    .map((v, i) => v - t[i])
    .sort((a, b) => a - b)
  return Math.max(1, steps[Math.floor(steps.length / 2)])
}

/** Moyenne glissante sur `window` secondes, en sautant les valeurs inconnues (lisse l'allure GPS). */
export function smooth(t: number[], values: Series, window: number): Series {
  const out: Series = []
  let start = 0
  let sum = 0
  let count = 0
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v !== null) {
      sum += v
      count++
    }
    while (t[i] - t[start] > window) {
      const old = values[start]
      if (old !== null) {
        sum -= old
        count--
      }
      start++
    }
    out.push(v === null || count === 0 ? null : sum / count)
  }
  return out
}

/** Allure lissée sur 20 s (s/km), ou vitesse en km/h pour les autres sports. */
export function paceSeries(series: ActivitySeries, foot: boolean): Series | null {
  if (!series.speed) return null
  const smoothed = smooth(series.t, series.speed, 20)
  return smoothed.map((v) => (foot ? speedToPace(v) : v === null ? null : v * 3.6))
}

/** Points d'une courbe, coupée là où l'enregistrement s'interrompt (pause, perte du capteur). */
export function segments(t: number[], values: Series): { t: number; v: number }[][] {
  const gap = typicalStep(t) * 4
  const result: { t: number; v: number }[][] = []
  let current: { t: number; v: number }[] = []
  for (let i = 0; i < t.length; i++) {
    const v = values[i]
    if (v === null || (i > 0 && t[i] - t[i - 1] > gap)) {
      if (current.length > 0) result.push(current)
      current = []
    }
    if (v !== null) current.push({ t: t[i], v })
  }
  if (current.length > 0) result.push(current)
  return result
}

/** Bornes d'axe arrondies (à `step` près) qui encadrent les valeurs, avec un peu de marge. */
export function niceRange(values: Series, step: number, minSpan = step): [number, number] | null {
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (v === null) continue
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!Number.isFinite(min)) return null
  let low = Math.floor(min / step) * step
  let high = Math.ceil(max / step) * step
  if (high - low < minSpan) {
    const middle = (low + high) / 2
    low = Math.floor((middle - minSpan / 2) / step) * step
    high = low + Math.ceil(minSpan / step) * step
  }
  return [low, high]
}

/**
 * Cadence sans les arrêts : la montre note 0 (ou presque) quand on s'arrête, ce qui tirait la
 * courbe jusqu'en bas. Les valeurs sous la moitié de la cadence médiane sont écartées.
 */
export function cleanCadence(values: Series): Series {
  const known = values.filter((v): v is number => v !== null && v > 0).sort((a, b) => a - b)
  if (known.length === 0) return values.map(() => null)
  const floor = known[Math.floor(known.length / 2)] / 2
  return values.map((v) => (v === null || v < floor ? null : v))
}

/** Moyenne des valeurs connues d'une courbe (trait horizontal des graphiques). */
export function seriesMean(values: Series): number | null {
  let sum = 0
  let count = 0
  for (const v of values) {
    if (v === null) continue
    sum += v
    count++
  }
  return count === 0 ? null : sum / count
}

/** Distance (m) ou durée (s) d'échauffement écartée du calcul de l'échelle des graphiques. */
export const WARMUP_DISTANCE_M = 1000
export const WARMUP_SHARE = 0.15

/**
 * Indice du premier point après la mise en route (le premier kilomètre, ou 15 % de la durée
 * sans distance) : la FC qui monte, l'allure et la cadence des premiers mètres ne sont pas
 * représentatives et écrasaient l'échelle. Rien n'est écarté sur une sortie trop courte.
 */
export function warmupEnd(series: Pick<ActivitySeries, 't' | 'distance'>): number {
  const { t, distance } = series
  const total = distance ? Math.max(0, ...distance.filter((d): d is number => d !== null)) : 0
  let index = -1
  if (total >= 3 * WARMUP_DISTANCE_M && distance) {
    index = distance.findIndex((d) => d !== null && d >= WARMUP_DISTANCE_M)
  } else if (!distance || total === 0) {
    const limit = (t.at(-1) ?? 0) * WARMUP_SHARE
    index = t.findIndex((time) => time >= limit)
  }
  return index > 0 && index < t.length * 0.5 ? index : 0
}

/**
 * Échelle de la courbe après la mise en route : du min au max de tout le reste de la sortie.
 * Seules les valeurs des premiers mètres qui en sortent dépassent du cadre.
 */
export function focusRange(values: Series, from: number, step: number, minSpan = step): [number, number] | null {
  return niceRange(values.slice(from), step, minSpan) ?? (from > 0 ? niceRange(values, step, minSpan) : null)
}

/** Valeur d'une série au temps `t` (le point le plus proche), pour le curseur des graphiques. */
export function indexAt(t: number[], time: number): number {
  let low = 0
  let high = t.length - 1
  while (high - low > 1) {
    const mid = (low + high) >> 1
    if (t[mid] < time) low = mid
    else high = mid
  }
  return Math.abs(t[high] - time) < Math.abs(t[low] - time) ? high : low
}

/** 754 → « 12:34 », 3754 → « 1:02:34 » (temps écoulé sur l'axe des graphiques). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

// -----------------------------------------------------------------------------
// Temps passé par zone de FC
// -----------------------------------------------------------------------------

export type ZoneTime = { zone: number; name: string; range: string; seconds: number; share: number }

/**
 * Temps passé dans chaque zone de FC de l'athlète. Chaque point compte pour le temps qui le
 * sépare du suivant (au plus 4 fois le pas habituel, pour ne pas compter les pauses).
 * Une FC sous la zone 1 est comptée en zone 1, au-dessus de la dernière zone dans celle-ci.
 */
export function timeInZones(series: ActivitySeries, zones: HrZone[]): ZoneTime[] {
  const usable = zones.filter((z) => z.hr_min !== null || z.hr_max !== null).sort((a, b) => a.zone - b.zone)
  if (!series.hr || usable.length === 0) return []
  const seconds = usable.map(() => 0)
  const cap = typicalStep(series.t) * 4
  const { t, hr } = series
  for (let i = 0; i < t.length; i++) {
    const value = hr[i]
    if (value === null) continue
    const dt = i + 1 < t.length ? Math.min(t[i + 1] - t[i], cap) : typicalStep(t)
    let index = usable.findIndex((z) => z.hr_max !== null && value <= z.hr_max + 0.5)
    if (index < 0) index = usable.length - 1
    seconds[index] += dt
  }
  const total = seconds.reduce((a, b) => a + b, 0)
  return usable.map((z, i) => ({
    zone: z.zone,
    name: z.name,
    range:
      z.hr_min !== null && z.hr_max !== null ? `${z.hr_min}-${z.hr_max}` : z.hr_max !== null ? `≤ ${z.hr_max}` : `≥ ${z.hr_min}`,
    seconds: seconds[i],
    share: total > 0 ? seconds[i] / total : 0,
  }))
}

// -----------------------------------------------------------------------------
// Chiffres de l'activité
// -----------------------------------------------------------------------------

type SummaryLike = {
  activity_type: string
  duration_s: number | null
  moving_s: number | null
  distance_m: number | null
  elevation_gain_m: number | null
  /** Absent des activités importées avant la 0.5.2. */
  elevation_loss_m?: number | null
  /** Absentes des activités importées avant la 0.5.4. */
  avg_cadence?: number | null
  max_cadence?: number | null
  avg_hr: number | null
  max_hr: number | null
  calories: number | null
}

/** Allure (« 4:32 /km ») ou vitesse (« 28,4 km/h ») d'une vitesse en m/s. */
export function formatSpeed(speed: number | null | undefined, foot: boolean): string {
  if (speed === null || speed === undefined || speed <= 0) return ''
  if (foot) {
    const pace = speedToPace(speed)
    return pace === null ? '' : `${formatPace(pace)} /km`
  }
  return `${(speed * 3.6).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km/h`
}

export type Figure = { label: string; value: string; hint?: string }

/** Tous les chiffres connus de l'activité, résumé Garmin complété par le .FIT. */
export function detailFigures(activity: SummaryLike, detail: ActivityDetail | null): Figure[] {
  const s = detail?.session
  const foot = isFootSport(activity.activity_type)
  const figures: Figure[] = []
  const add = (label: string, value: string | null | undefined, hint?: string) => {
    if (value) figures.push(hint ? { label, value, hint } : { label, value })
  }
  const elapsed = s?.elapsed_s ?? activity.duration_s
  const moving = activity.moving_s ?? s?.timer_s
  const distance = activity.distance_m ?? s?.distance_m
  add('Durée', elapsed ? formatDuration(elapsed) : null)
  if (moving && elapsed && Math.abs(elapsed - moving) >= 30) add('En mouvement', formatDuration(moving))
  add('Distance', distance ? formatDistance(distance) : null)
  const avgSpeed = s?.avg_speed ?? (distance && moving ? distance / moving : null)
  add(foot ? 'Allure moy.' : 'Vitesse moy.', formatSpeed(avgSpeed, foot))
  add(foot ? 'Allure max' : 'Vitesse max', formatSpeed(s?.max_speed, foot))
  add('FC moy.', (activity.avg_hr ?? s?.avg_hr) ? `${activity.avg_hr ?? s?.avg_hr} bpm` : null)
  add('FC max', (activity.max_hr ?? s?.max_hr) ? `${activity.max_hr ?? s?.max_hr} bpm` : null)
  // D+ et D− de la même source : le résumé Garmin (corrigé par Garmin) s'il donne le D+,
  // sinon le .FIT. Mêler les deux donnait 17 m de D+ pour 186 m de D− sur une sortie à plat.
  const fromSummary = activity.elevation_gain_m !== null
  const ascent = fromSummary ? activity.elevation_gain_m : s?.ascent_m
  const descent = fromSummary ? activity.elevation_loss_m : s?.descent_m
  add('D+', ascent !== null && ascent !== undefined ? `${ascent} m` : null)
  add('D−', descent !== null && descent !== undefined ? `${descent} m` : null)
  if (s?.min_altitude_m !== null && s?.min_altitude_m !== undefined && s.max_altitude_m !== null) {
    add('Altitude', `${Math.round(s.min_altitude_m)}-${Math.round(s.max_altitude_m)} m`)
  }
  const cadenceUnit = foot ? 'pas/min' : 'tr/min'
  const avgCadence = s?.avg_cadence || activity.avg_cadence
  const maxCadence = s?.max_cadence || activity.max_cadence
  add('Cadence moy.', avgCadence ? `${avgCadence} ${cadenceUnit}` : null)
  add('Cadence max', maxCadence ? `${maxCadence} ${cadenceUnit}` : null)
  add('Puissance moy.', s?.avg_power ? `${s.avg_power} W` : null)
  add('Puissance max', s?.max_power ? `${s.max_power} W` : null)
  const te = (value: number | null | undefined) => (value ? value.toLocaleString('fr-FR', { minimumFractionDigits: 1 }) : null)
  add('Effet aérobie', te(s?.aerobic_te), 'Training Effect de la montre, de 0 à 5')
  add('Effet anaérobie', te(s?.anaerobic_te), 'Training Effect de la montre, de 0 à 5')
  add('Calories', (activity.calories ?? s?.calories) ? `${activity.calories ?? s?.calories} kcal` : null)
  add('Température', s?.avg_temperature !== null && s?.avg_temperature !== undefined ? `${s.avg_temperature} °C` : null)
  return figures
}

// -----------------------------------------------------------------------------
// Prévu / réalisé
// -----------------------------------------------------------------------------

/** Étapes prévues, blocs répétés déroulés (« 3/6 » pour la 3e répétition sur 6). */
export function flattenSteps(items: WorkoutItem[]): { step: WorkoutStep; repeat: string | null }[] {
  const out: { step: WorkoutStep; repeat: string | null }[] = []
  for (const item of items) {
    if (item.type === 'step') out.push({ step: item, repeat: null })
    else
      for (let r = 0; r < item.count; r++) {
        for (const step of item.steps) out.push({ step, repeat: `${r + 1}/${item.count}` })
      }
  }
  return out
}

/** Verdict d'un tour face à la cible de l'étape. */
export type TargetVerdict = 'on' | 'fast' | 'slow' | 'high' | 'low' | null

export const VERDICT_LABELS: Record<Exclude<TargetVerdict, null>, string> = {
  on: 'Dans la cible',
  fast: 'Plus vite que prévu',
  slow: 'Moins vite que prévu',
  high: 'FC au-dessus',
  low: 'FC en dessous',
}

/** Tolérance avant de dire « hors cible » : 5 s/km en allure, 3 bpm en FC. */
const PACE_TOLERANCE = 5
const HR_TOLERANCE = 3

export function targetVerdict(
  target: ResolvedTarget,
  lap: Pick<ActivityLap, 'avg_speed' | 'avg_hr'>,
  preferHr = false,
): TargetVerdict {
  const pace = speedToPace(lap.avg_speed)
  const hasPace = target.paceFast !== null || target.paceSlow !== null
  const hasHr = target.hrMin !== null || target.hrMax !== null
  const byHr = () => {
    if (lap.avg_hr === null) return null
    if (target.hrMax !== null && lap.avg_hr > target.hrMax + HR_TOLERANCE) return 'high'
    if (target.hrMin !== null && lap.avg_hr < target.hrMin - HR_TOLERANCE) return 'low'
    return 'on'
  }
  const byPace = () => {
    if (pace === null) return null
    if (target.paceFast !== null && pace < target.paceFast - PACE_TOLERANCE) return 'fast'
    if (target.paceSlow !== null && pace > target.paceSlow + PACE_TOLERANCE) return 'slow'
    return 'on'
  }
  // Cible en zone : l'allure si la zone en a une, sinon la FC.
  if (hasHr && (preferHr || !hasPace)) return byHr()
  if (hasPace) return byPace()
  return null
}

export type PlanRow = {
  index: number
  kind: StepKind
  label: string
  repeat: string | null
  planned: string
  target: string
  lap: ActivityLap | null
  verdict: TargetVerdict
}

/**
 * Met en face chaque étape prévue et le tour correspondant. Les tours ne correspondent aux étapes que
 * si la montre a suivi la séance (autant de tours que d'étapes, à un tour final près) : sinon, `matched`
 * est faux et les tours sont listés à part.
 */
export function comparePlan(items: WorkoutItem[], zones: HrZone[], laps: ActivityLap[]): { rows: PlanRow[]; matched: boolean } {
  const steps = flattenSteps(items)
  // Un dernier tour très court (arrêt de la montre après la fin de la séance) ne compte pas.
  const usable = laps.length === steps.length + 1 && (laps.at(-1)?.duration_s ?? 0) < 60 ? laps.slice(0, -1) : laps
  const matched = steps.length > 1 && usable.length === steps.length
  const rows = steps.map(({ step, repeat }, index) => {
    const resolved = resolveTarget(step.target, zones)
    const lap = matched ? usable[index] : null
    return {
      index,
      kind: step.kind,
      label: STEP_KINDS[step.kind],
      repeat,
      planned: formatStepDuration(step.duration),
      target: step.target.type === 'none' ? '' : resolved.label,
      lap,
      verdict: lap ? targetVerdict(resolved, lap, step.target.type === 'hr') : null,
    }
  })
  return { rows, matched }
}

/** « +2 min 10 », « −350 m » : écart réalisé − prévu, ou rien s'il est négligeable. */
export function formatGap(actual: number | null, planned: number, kind: 'seconds' | 'meters'): string {
  if (actual === null || planned <= 0) return ''
  const gap = actual - planned
  const tiny = kind === 'seconds' ? 30 : 50
  if (Math.abs(gap) < tiny) return '='
  const text = kind === 'seconds' ? formatDuration(Math.abs(gap)) : formatDistance(Math.abs(gap))
  return `${gap > 0 ? '+' : '−'}${text}`
}

// -----------------------------------------------------------------------------
// Tracé GPS
// -----------------------------------------------------------------------------

/** Tracé GPS projeté dans un carré de `size` (projection équirectangulaire, suffisante pour une sortie). */
export function routePath(
  series: ActivitySeries,
  size: number,
  padding = 8,
): { d: string; start: [number, number]; end: [number, number] } | null {
  if (!series.lat || !series.lon) return null
  const points: [number, number][] = []
  for (let i = 0; i < series.t.length; i++) {
    const lat = series.lat[i]
    const lon = series.lon[i]
    if (lat !== null && lon !== null) points.push([lat, lon])
  }
  if (points.length < 2) return null
  const lats = points.map((p) => p[0])
  const lons = points.map((p) => p[1])
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2
  const k = Math.cos((midLat * Math.PI) / 180)
  const xs = lons.map((lon) => lon * k)
  const minX = Math.min(...xs)
  const maxY = Math.max(...lats)
  const span = Math.max(Math.max(...xs) - minX, maxY - Math.min(...lats), 1e-6)
  const scale = (size - 2 * padding) / span
  const offsetX = (size - 2 * padding - (Math.max(...xs) - minX) * scale) / 2
  const offsetY = (size - 2 * padding - (maxY - Math.min(...lats)) * scale) / 2
  const project = (i: number): [number, number] => [
    Math.round((padding + offsetX + (xs[i] - minX) * scale) * 10) / 10,
    Math.round((padding + offsetY + (maxY - lats[i]) * scale) * 10) / 10,
  ]
  const projected = points.map((_, i) => project(i))
  return {
    d: projected.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' '),
    start: projected[0],
    end: projected[projected.length - 1],
  }
}

/** Durée formatée pour les tableaux (« 3:00 », « 15:00 », « 1:02:10 »). */
export const formatLapTime = (seconds: number | null) => (seconds === null ? '' : formatClock(seconds))
