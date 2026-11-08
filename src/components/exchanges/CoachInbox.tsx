import { Link } from 'react-router'
import { useCoachInbox } from '../../api/exchanges.ts'
import { formatShortDay } from '../../domain/calendar.ts'
import { firstName } from '../../lib/format.ts'
import { ActivityBadges } from './ActivityBadges.tsx'

/** Coach : retours pas encore vus et commentaires non lus, en tête du planning. */
export function CoachInbox({ coachId, names }: { coachId: string; names: Record<string, string> }) {
  const inbox = useCoachInbox(coachId)
  // Base pas encore à jour, ou rien de nouveau : rien à afficher.
  if (!inbox.data || inbox.data.length === 0) return null
  return (
    <section
      aria-label="À voir"
      className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3 shadow-sm sm:p-4"
    >
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-900">
        <span className="size-2 rounded-full bg-red-600" aria-hidden="true" />À voir ({inbox.data.length})
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {inbox.data.map((item) => (
          <li key={item.workout_id}>
            <Link
              to={`/seance/${item.workout_id}`}
              className="block rounded-xl border border-slate-200 bg-white px-3 py-2 hover:border-emerald-300 hover:shadow-sm"
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold text-slate-900">
                  {firstName(names[item.athlete_id] ?? '') || 'Athlète'} · {item.title}
                </span>
                <span className="shrink-0 text-xs text-slate-500 capitalize">{formatShortDay(item.scheduled_on)}</span>
              </span>
              <ActivityBadges activity={item} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
