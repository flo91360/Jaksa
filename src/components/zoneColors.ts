/** Couleur de pastille par zone (Z1 bleu → Z5 rouge). */
const ZONE_BADGES = [
  'bg-sky-100 text-sky-800',
  'bg-emerald-100 text-emerald-800',
  'bg-yellow-100 text-yellow-800',
  'bg-orange-100 text-orange-800',
  'bg-red-100 text-red-800',
  'bg-fuchsia-100 text-fuchsia-800',
  'bg-violet-100 text-violet-800',
]

export function zoneBadgeClass(zone: number): string {
  return ZONE_BADGES[(zone - 1) % ZONE_BADGES.length]
}
