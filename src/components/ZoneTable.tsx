import { type HrZone, formatHrRange, formatPaceRange } from '../domain/zones.ts'
import { zoneBadgeClass } from './zoneColors.ts'

/** Zones en lecture seule (vue de l'athlète, récapitulatif du coach). */
export function ZoneTable({ zones }: { zones: HrZone[] }) {
  if (zones.length === 0) {
    return <p className="text-sm text-slate-600">Pas encore de zones : ton coach les définira.</p>
  }
  return (
    <ul className="divide-y divide-slate-100">
      {zones.map((zone) => (
        <li key={zone.zone} className="flex items-center gap-3 py-2.5">
          <span
            className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${zoneBadgeClass(zone.zone)}`}
          >
            Z{zone.zone}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-slate-900">{zone.name}</span>
            <span className="block text-sm text-slate-600">
              {[formatHrRange(zone), formatPaceRange(zone)].filter(Boolean).join(' · ') || 'À compléter'}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
