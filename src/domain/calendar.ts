/**
 * Dates du calendrier, manipulées sous forme de chaînes « AAAA-MM-JJ » (le
 * format des colonnes `date` de la base). Les calculs se font en UTC pour ne
 * jamais dépendre du fuseau horaire ni des changements d'heure.
 */

export type IsoDate = string

const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000

function toUtc(date: IsoDate): number {
  const match = ISO_PATTERN.exec(date)
  if (!match) throw new Error(`Date invalide : ${date}`)
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

function fromUtc(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10)
}

export function isIsoDate(value: string): boolean {
  if (!ISO_PATTERN.test(value)) return false
  return fromUtc(toUtc(value)) === value
}

/** Date du jour dans le fuseau de l'appareil. */
export function todayIso(now: Date = new Date()): IsoDate {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtc(toUtc(date) + days * DAY_MS)
}

/** Nombre de jours de from à to (positif si to est après from). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS)
}

/** 0 = lundi … 6 = dimanche. */
export function weekdayIndex(date: IsoDate): number {
  return (new Date(toUtc(date)).getUTCDay() + 6) % 7
}

/** Lundi de la semaine de date. */
export function startOfWeek(date: IsoDate): IsoDate {
  return addDays(date, -weekdayIndex(date))
}

/** Les 7 jours (lundi → dimanche) de la semaine de date. */
export function weekDays(date: IsoDate): IsoDate[] {
  const monday = startOfWeek(date)
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index))
}

export function startOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 7)}-01`
}

export function addMonths(date: IsoDate, months: number): IsoDate {
  const d = new Date(toUtc(startOfMonth(date)))
  d.setUTCMonth(d.getUTCMonth() + months)
  return fromUtc(d.getTime())
}

export function isSameMonth(a: IsoDate, b: IsoDate): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

/** Semaines complètes (lundi → dimanche) qui couvrent le mois de date. */
export function monthWeeks(date: IsoDate): IsoDate[][] {
  const first = startOfMonth(date)
  const nextMonth = addMonths(first, 1)
  const weeks: IsoDate[][] = []
  for (let monday = startOfWeek(first); monday < nextMonth; monday = addDays(monday, 7)) {
    weeks.push(weekDays(monday))
  }
  return weeks
}

export type CalendarView = 'week' | 'month'

/** Première et dernière date affichées par une vue. */
export function visibleRange(view: CalendarView, date: IsoDate): { from: IsoDate; to: IsoDate } {
  if (view === 'week') {
    const days = weekDays(date)
    return { from: days[0], to: days[6] }
  }
  const weeks = monthWeeks(date)
  return { from: weeks[0][0], to: weeks[weeks.length - 1][6] }
}

/** Avance ou recule la vue d'une semaine ou d'un mois. */
export function shiftView(view: CalendarView, date: IsoDate, step: number): IsoDate {
  return view === 'week' ? addDays(startOfWeek(date), 7 * step) : addMonths(date, step)
}

const longDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const shortDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const monthYear = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** « Mardi 10 novembre ». */
export function formatLongDay(date: IsoDate): string {
  return capitalize(longDay.format(toUtc(date)))
}

/** « mar. 10 ». */
export function formatShortDay(date: IsoDate): string {
  return shortDay.format(toUtc(date))
}

/** « 10 nov. ». */
export function formatDayMonth(date: IsoDate): string {
  return dayMonth.format(toUtc(date))
}

/** « Novembre 2026 ». */
export function formatMonth(date: IsoDate): string {
  return capitalize(monthYear.format(toUtc(date)))
}

/** « 9 – 15 nov. 2026 » ou « 30 nov. – 6 déc. 2026 ». */
export function formatWeekRange(date: IsoDate): string {
  const days = weekDays(date)
  const first = days[0]
  const last = days[6]
  const year = last.slice(0, 4)
  if (isSameMonth(first, last)) return `${Number(first.slice(8))} – ${formatDayMonth(last)} ${year}`
  return `${formatDayMonth(first)} – ${formatDayMonth(last)} ${year}`
}

/** « dans 3 jours », « demain », « aujourd'hui », « il y a 2 jours ». */
export function formatRelativeDays(from: IsoDate, to: IsoDate): string {
  const days = daysBetween(from, to)
  if (days === 0) return 'aujourd’hui'
  if (days === 1) return 'demain'
  if (days === -1) return 'hier'
  if (days > 1) return `dans ${days} jours`
  return `il y a ${-days} jours`
}
