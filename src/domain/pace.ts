/**
 * Allures de course, exprimées en secondes par kilomètre (entier).
 * Exemple : 4 min 30 s au kilomètre = 270.
 */

/** Allure la plus rapide acceptée (1:00 /km) et la plus lente (30:00 /km, marche en côte). */
export const PACE_MIN = 60
export const PACE_MAX = 1800

const PACE_PATTERN = /^(\d{1,2})(?:(?::|'|’|min|m)(\d{2})?(?:''|"|”|’’|s)?)?$/

/**
 * Lit une allure saisie à la main : « 4:30 », « 4'30 », « 4’30'' », « 4min30 »,
 * « 4 » (= 4:00), avec ou sans « /km ». Renvoie null si la saisie est vide ou invalide.
 */
export function parsePace(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, '').replace(/\/km$/, '')
  const match = PACE_PATTERN.exec(text)
  if (!match) return null
  const minutes = Number(match[1])
  const seconds = match[2] === undefined ? 0 : Number(match[2])
  if (seconds >= 60) return null
  const total = minutes * 60 + seconds
  return total > 0 ? total : null
}

/** 270 → « 4:30 ». Chaîne vide pour une allure absente. */
export function formatPace(secondsPerKm: number | null | undefined): string {
  if (secondsPerKm === null || secondsPerKm === undefined || !Number.isFinite(secondsPerKm)) return ''
  const total = Math.round(secondsPerKm)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Allure (s/km) → vitesse (km/h). */
export function paceToKmh(secondsPerKm: number): number {
  return 3600 / secondsPerKm
}

/** Vitesse (km/h) → allure (s/km), arrondie à la seconde. */
export function kmhToPace(kmh: number): number {
  return Math.round(3600 / kmh)
}
