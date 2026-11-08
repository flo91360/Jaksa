import { useEffect, useRef, useState } from 'react'
import {
  isMissingRelation,
  useAddComment,
  useComments,
  useDeleteComment,
  useFeedback,
  useMarkWorkoutSeen,
} from '../../api/exchanges.ts'
import { todayIso } from '../../domain/calendar.ts'
import { describePain, formatFeedback, painLevel } from '../../domain/feedback.ts'
import { COMMENT_MAX, cleanBody, formatDayLabel, formatTime, localDay } from '../../domain/messages.ts'
import { workoutTotals } from '../../domain/workouts.ts'
import type { HrZone } from '../../domain/zones.ts'
import type { Workout, WorkoutComment, WorkoutFeedback } from '../../lib/database.types.ts'
import { errorMessage } from '../../lib/errors.ts'
import { firstName } from '../../lib/format.ts'
import { Alert, Button, Spinner } from '../ui.tsx'
import { FeedbackForm } from './FeedbackForm.tsx'

type Role = 'coach' | 'athlete'

/**
 * Sous une séance : le retour de l'athlète (« vu par le coach ») et le fil de
 * commentaires. L'ouvrir marque comme lu ce qui vient de l'autre partie.
 */
export function WorkoutExchanges({
  workout,
  zones,
  role,
  meId,
  names,
}: {
  workout: Workout
  zones: HrZone[]
  role: Role
  meId: string
  /** Noms affichés, par identifiant (athlète et coach). */
  names: Record<string, string>
}) {
  const feedback = useFeedback(workout.id)
  const comments = useComments(workout.id)
  const markSeen = useMarkWorkoutSeen()
  const [editing, setEditing] = useState(false)
  const [today] = useState(() => todayIso())

  // Ce qui vient de l'autre partie et n'a pas encore été lu ; marqué une seule fois par état.
  const unreadIds = (comments.data ?? []).filter((c) => c.author_id !== meId && c.read_at === null).map((c) => c.id)
  const unseenFeedback = role === 'coach' && !!feedback.data && feedback.data.coach_seen_at === null
  const signature = unreadIds.length > 0 || unseenFeedback ? `${unreadIds.join(',')}|${unseenFeedback ? feedback.data?.updated_at : ''}` : ''
  const marked = useRef('')
  const { mutate: mark } = markSeen
  useEffect(() => {
    if (signature && marked.current !== signature) {
      marked.current = signature
      mark(workout.id)
    }
  }, [signature, mark, workout.id])

  if (isMissingRelation(feedback.error) || isMissingRelation(comments.error)) return null

  const canGiveFeedback = role === 'athlete' && workout.kind !== 'rest' && workout.scheduled_on <= today

  return (
    <div className="space-y-4">
      <section aria-label="Retour de séance" className="space-y-2">
        {feedback.isPending ? (
          <Spinner className="size-5 text-slate-400" />
        ) : feedback.isError ? (
          <Alert tone="error">{errorMessage(feedback.error)}</Alert>
        ) : feedback.data ? (
          <FeedbackSummary
            feedback={feedback.data}
            role={role}
            athleteName={names[workout.athlete_id] ?? ''}
            onEdit={role === 'athlete' ? () => setEditing(true) : undefined}
          />
        ) : canGiveFeedback ? (
          <Button onClick={() => setEditing(true)}>J’ai fait ma séance</Button>
        ) : role === 'coach' && workout.scheduled_on <= today && workout.kind !== 'rest' ? (
          <p className="text-sm text-slate-500">Pas encore de retour de {firstName(names[workout.athlete_id] ?? '') || 'l’athlète'}.</p>
        ) : null}
      </section>

      <CommentThread
        workoutId={workout.id}
        comments={comments.data}
        loading={comments.isPending}
        error={comments.error}
        meId={meId}
        names={names}
        today={today}
        role={role}
      />

      {editing && (
        <FeedbackForm
          workoutId={workout.id}
          title={workout.title}
          feedback={feedback.data ?? null}
          planned={workoutTotals(workout.steps, zones)}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  )
}

const PAIN_CLASSES = {
  none: '',
  light: 'bg-amber-50 text-amber-900 border-amber-200',
  moderate: 'bg-orange-50 text-orange-900 border-orange-300',
  strong: 'bg-red-50 text-red-900 border-red-300',
}

export function FeedbackSummary({
  feedback,
  role,
  athleteName,
  onEdit,
}: {
  feedback: WorkoutFeedback
  role: Role
  athleteName: string
  onEdit?: () => void
}) {
  const statusClass =
    feedback.status === 'done'
      ? 'border-emerald-200 bg-emerald-50'
      : feedback.status === 'partial'
        ? 'border-amber-200 bg-amber-50'
        : 'border-slate-200 bg-slate-50'
  return (
    <div className={`space-y-2 rounded-xl border p-3 ${statusClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {role === 'athlete' ? 'Ton retour' : `Retour de ${firstName(athleteName) || 'l’athlète'}`}
          </p>
          <p className="font-semibold text-slate-900">{formatFeedback(feedback)}</p>
        </div>
        {onEdit && (
          <Button variant="secondary" onClick={onEdit}>
            Modifier
          </Button>
        )}
      </div>
      {feedback.pain.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Douleurs signalées">
          {feedback.pain.map((pain, index) => (
            <li
              key={index}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${PAIN_CLASSES[painLevel(pain.intensity)]}`}
            >
              Douleur · {describePain(pain)}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-600">
        {feedback.coach_seen_at ? (
          <span className="font-semibold text-emerald-800">
            ✓ Vu par le coach{' '}
            {formatDayLabel(localDay(feedback.coach_seen_at), todayIso()).toLowerCase()} à {formatTime(feedback.coach_seen_at)}
          </span>
        ) : role === 'athlete' ? (
          'Pas encore vu par ton coach'
        ) : (
          `Reçu ${formatDayLabel(localDay(feedback.updated_at), todayIso()).toLowerCase()} à ${formatTime(feedback.updated_at)}`
        )}
      </p>
    </div>
  )
}

function CommentThread({
  workoutId,
  comments,
  loading,
  error,
  meId,
  names,
  today,
  role,
}: {
  workoutId: string
  comments: WorkoutComment[] | undefined
  loading: boolean
  error: unknown
  meId: string
  names: Record<string, string>
  today: string
  role: Role
}) {
  const [text, setText] = useState('')
  const add = useAddComment()
  const remove = useDeleteComment()

  const submit = async (event: { preventDefault: () => void }) => {
    event.preventDefault()
    const body = cleanBody(text, COMMENT_MAX)
    if (!body) return
    await add.mutateAsync({ workoutId, body })
    setText('')
  }

  return (
    <section aria-label="Commentaires" className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-800">
        Commentaires{comments && comments.length > 0 ? ` (${comments.length})` : ''}
      </h3>
      {loading && <Spinner className="size-5 text-slate-400" />}
      {!!error && <Alert tone="error">{errorMessage(error)}</Alert>}
      {comments && comments.length > 0 && (
        <ul className="space-y-2">
          {comments.map((comment) => {
            const mine = comment.author_id === meId
            return (
              <li key={comment.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${mine ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-900'}`}>
                  <p className={`text-xs font-semibold ${mine ? 'text-emerald-100' : 'text-slate-500'}`}>
                    {mine ? 'Toi' : firstName(names[comment.author_id] ?? '') || 'Ton coach'} ·{' '}
                    {formatDayLabel(localDay(comment.created_at), today).toLowerCase()} {formatTime(comment.created_at)}
                  </p>
                  <p className="text-sm whitespace-pre-line">{comment.body}</p>
                  {mine && (
                    <p className="mt-0.5 flex items-center justify-end gap-2 text-[11px] text-emerald-100">
                      {comment.read_at ? (role === 'athlete' ? '✓ Vu par le coach' : '✓ Lu') : 'Envoyé'}
                      <button
                        type="button"
                        className="underline hover:text-white"
                        onClick={() => {
                          if (window.confirm('Supprimer ce commentaire ?')) remove.mutate(comment.id)
                        }}
                      >
                        Supprimer
                      </button>
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <form onSubmit={submit} className="flex items-end gap-2">
        <label className="sr-only" htmlFor={`comment-${workoutId}`}>
          Ajouter un commentaire
        </label>
        <textarea
          id={`comment-${workoutId}`}
          rows={1}
          maxLength={COMMENT_MAX}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void submit(event)
          }}
          placeholder={role === 'athlete' ? 'Commenter…' : 'Répondre…'}
          className="block min-h-11 w-full flex-1 resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-2 focus:outline-emerald-600 sm:text-sm"
        />
        <Button type="submit" busy={add.isPending} disabled={!cleanBody(text, COMMENT_MAX)}>
          Envoyer
        </Button>
      </form>
      {add.isError && <Alert tone="error">{errorMessage(add.error)}</Alert>}
    </section>
  )
}
