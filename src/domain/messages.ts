/**
 * Messagerie et fils de commentaires : regroupement par jour et libellés.
 * Les horodatages viennent de la base (ISO 8601, UTC) et s'affichent dans le
 * fuseau de l'appareil.
 */
import { type IsoDate, daysBetween, formatLongDay, todayIso } from './calendar.ts'

export type Dated = { created_at: string }

/** Jour local d'un horodatage. */
export function localDay(timestamp: string): IsoDate {
  return todayIso(new Date(timestamp))
}

/** Messages (déjà triés du plus ancien au plus récent) regroupés par jour. */
export function groupByDay<T extends Dated>(items: T[]): { day: IsoDate; items: T[] }[] {
  const groups: { day: IsoDate; items: T[] }[] = []
  for (const item of items) {
    const day = localDay(item.created_at)
    const last = groups.at(-1)
    if (last && last.day === day) last.items.push(item)
    else groups.push({ day, items: [item] })
  }
  return groups
}

/** « Aujourd'hui », « Hier » ou « Mardi 10 novembre ». */
export function formatDayLabel(day: IsoDate, today: IsoDate): string {
  const diff = daysBetween(day, today)
  if (diff === 0) return 'Aujourd’hui'
  if (diff === 1) return 'Hier'
  return formatLongDay(day)
}

const timeFormatter = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const shortFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

/** « 14:05 ». */
export function formatTime(timestamp: string): string {
  return timeFormatter.format(new Date(timestamp))
}

/** Pour une liste de conversations : l'heure si c'est aujourd'hui, « Hier », sinon la date courte. */
export function formatWhen(timestamp: string, today: IsoDate): string {
  const diff = daysBetween(localDay(timestamp), today)
  if (diff === 0) return formatTime(timestamp)
  if (diff === 1) return 'Hier'
  return shortFormatter.format(new Date(timestamp))
}

export const MESSAGE_MAX = 4000
export const COMMENT_MAX = 2000

/** Texte à envoyer, ou null s'il est vide ou trop long. */
export function cleanBody(text: string, max: number): string | null {
  const body = text.trim()
  return body.length >= 1 && body.length <= max ? body : null
}
