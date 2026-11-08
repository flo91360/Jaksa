import { FEEDBACK_STATUS, maxPain, painLevel } from '../../domain/feedback.ts'
import type { WorkoutActivity } from '../../lib/database.types.ts'

const STATUS_CLASSES = {
  done: 'bg-emerald-100 text-emerald-800',
  partial: 'bg-amber-100 text-amber-800',
  skipped: 'bg-slate-200 text-slate-700',
}

const PAIN_CLASSES = {
  none: '',
  light: 'bg-amber-100 text-amber-900',
  moderate: 'bg-orange-100 text-orange-900',
  strong: 'bg-red-600 text-white',
}

/**
 * Pastilles d'une séance dans le calendrier du coach : retour (fait / en
 * partie / pas fait, RPE), douleur la plus forte, commentaires. Un point rouge
 * signale ce que le coach n'a pas encore vu.
 */
export function ActivityBadges({ activity, compact = false }: { activity?: WorkoutActivity; compact?: boolean }) {
  if (!activity || (!activity.status && activity.comment_count === 0)) return null
  const pain = maxPain(activity.pain)
  const unseen = activity.unseen_feedback || activity.unread_comments > 0
  const size = compact ? 'text-[10px] px-1' : 'text-[11px] px-1.5'
  const labels: string[] = []
  if (activity.status) labels.push(FEEDBACK_STATUS[activity.status].label)
  if (activity.rpe) labels.push(`RPE ${activity.rpe}`)
  if (pain > 0) labels.push(`douleur ${pain}/10`)
  if (activity.comment_count > 0) labels.push(`${activity.comment_count} commentaire${activity.comment_count > 1 ? 's' : ''}`)
  if (unseen) labels.push('nouveau')
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-1" aria-label={labels.join(', ')} title={labels.join(' · ')}>
      {activity.status && (
        <span className={`rounded font-bold ${size} ${STATUS_CLASSES[activity.status]}`} aria-hidden="true">
          {FEEDBACK_STATUS[activity.status].icon}
          {activity.rpe ? ` ${activity.rpe}` : ''}
        </span>
      )}
      {pain > 0 && (
        <span className={`rounded font-bold ${size} ${PAIN_CLASSES[painLevel(pain)]}`} aria-hidden="true">
          ⚠ {pain}
        </span>
      )}
      {activity.comment_count > 0 && (
        <span className={`rounded bg-sky-100 font-bold text-sky-800 ${size}`} aria-hidden="true">
          💬 {activity.comment_count}
        </span>
      )}
      {unseen && <span className="size-2 rounded-full bg-red-600" aria-hidden="true" />}
    </span>
  )
}
