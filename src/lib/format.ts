const dateFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
const shortDateFormatter = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })

/** « 8 novembre 2026 ». */
export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso))
}

/** « 22 nov. ». */
export function formatShortDate(iso: string): string {
  return shortDateFormatter.format(new Date(iso))
}

/** Premier mot du nom complet (« Léa Martin » → « Léa »). */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? ''
}
