import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAddRun, useDeleteRun, usePlaceWorkout, useWeek } from '../../api/flexible.ts'
import { type IsoDate, addDays, formatLongDay, formatShortDay, formatWeekRange, weekDays } from '../../domain/calendar.ts'
import { type WeekSession, formatKm, weekRange } from '../../domain/flexible.ts'
import { formatDuration, formatTotals, parseDistance, parseDuration, workoutTotals } from '../../domain/workouts.ts'
import type { HrZone } from '../../domain/zones.ts'
import type { AthleteRun, Workout } from '../../lib/database.types.ts'
import { errorMessage } from '../../lib/errors.ts'
import { Alert, Button, Card, LoadingBlock, TextField } from '../ui.tsx'
import { FitExport, WorkoutView } from '../workout/WorkoutView.tsx'
import { KIND_STYLES } from '../workout/kindStyles.ts'
import { SessionStateBadge } from './CoachWeekPanel.tsx'
import { VolumeGauge } from './VolumeGauge.tsx'

/**
 * Mode souple, côté athlète : le volume de la semaine (fait, fourchette, restant),
 * les séances à faire (l'athlète choisit ses jours), celles qui sont faites, et les sorties déclarées.
 * `always` : affichée même vide (athlète suivi en mode souple) ; sinon seulement s'il y a quelque chose à montrer.
 */
export function AthleteWeekCard({ athleteId, today, zones, always }: { athleteId: string; today: IsoDate; zones: HrZone[]; always: boolean }) {
  const [offset, setOffset] = useState(0)
  const date = addDays(today, offset * 7)
  const { from, to } = weekRange(date)
  const week = useWeek(athleteId, date)
  const { summary } = week
  const todo = summary.sessions.filter((session) => session.state === 'todo')
  const finished = summary.sessions.filter((session) => session.state !== 'todo')
  const empty = !week.target && summary.sessions.length === 0 && week.runs.length === 0

  if (!always && offset === 0 && (week.isPending || week.error || empty)) return null

  return (
    <Card
      title={offset === 0 ? 'Ton plan de la semaine' : `Semaine du ${formatWeekRange(from)}`}
      description={
        offset === 0 ? `${formatWeekRange(from)} · ton coach donne le volume et les séances, tu choisis tes jours.` : undefined
      }
      actions={
        <>
          <Button variant="secondary" aria-label="Semaine précédente" onClick={() => setOffset(offset - 1)}>
            ←
          </Button>
          {offset !== 0 && (
            <Button variant="secondary" onClick={() => setOffset(0)}>
              Cette semaine
            </Button>
          )}
          <Button variant="secondary" aria-label="Semaine suivante" onClick={() => setOffset(offset + 1)}>
            →
          </Button>
        </>
      }
    >
      {week.isPending ? (
        <LoadingBlock />
      ) : week.error ? (
        <Alert tone="error">{errorMessage(week.error)}</Alert>
      ) : (
        <div className="space-y-6">
          <VolumeGauge summary={summary} you />
          {week.target?.note && (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm whitespace-pre-line text-slate-800">
              <span className="font-semibold">Le mot de ton coach : </span>
              {week.target.note}
            </p>
          )}

          <section aria-label="Séances à faire">
            <h3 className="text-sm font-semibold text-slate-800">
              À faire{todo.length > 0 ? ` (${todo.length})` : ''}
            </h3>
            {todo.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                {summary.sessions.length === 0
                  ? 'Pas de séance à placer cette semaine.'
                  : 'Toutes les séances de la semaine sont faites. Bravo !'}
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {todo.map((session) => (
                  <li key={session.workout.id}>
                    <SessionToDo session={session} zones={zones} today={today} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {finished.length > 0 && (
            <section aria-label="Séances faites">
              <h3 className="text-sm font-semibold text-slate-800">Faites ({summary.done})</h3>
              <ul className="mt-2 divide-y divide-slate-100">
                {finished.map(({ workout, state, day }) => (
                  <li key={workout.id}>
                    <Link to={`/seance/${workout.id}`} className="flex min-h-12 items-center gap-3 py-2 hover:bg-slate-50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-900">{workout.title}</span>
                        {day && <span className="block text-xs text-slate-500">{formatLongDay(day)}</span>}
                      </span>
                      <SessionStateBadge state={state} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Runs athleteId={athleteId} from={from} to={to} today={today} runs={week.runs} sources={summary.sources} />
        </div>
      )}
    </Card>
  )
}

/** Une séance à faire : son contenu, le jour que l'athlète lui donne, et « C'est fait ». */
function SessionToDo({ session, zones, today }: { session: WeekSession<Workout>; zones: HrZone[]; today: IsoDate }) {
  const { workout, day } = session
  const place = usePlaceWorkout()
  const navigate = useNavigate()
  const days = weekDays(workout.scheduled_on)
  const totals = formatTotals(workoutTotals(workout.steps, zones))
  const thisWeek = days.includes(today)

  /** Faite aujourd'hui : la séance prend la date du jour, puis l'athlète donne son retour. */
  const done = async () => {
    try {
      if (thisWeek && day !== today) await place.mutateAsync({ workoutId: workout.id, day: today })
      navigate(`/seance/${workout.id}`)
    } catch {
      // L'erreur est affichée sous la séance (place.error).
    }
  }

  return (
    <div className={`rounded-xl border border-l-4 border-slate-200 bg-white ${KIND_STYLES[workout.kind].card}`}>
      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2">
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-slate-900">{workout.title}</span>
            <span className="block text-xs text-slate-500">
              {[day ? formatLongDay(day) : 'Jour à choisir', totals].filter(Boolean).join(' · ')}
            </span>
          </span>
          <span aria-hidden="true" className="text-slate-400 transition group-open:rotate-90">
            ›
          </span>
        </summary>
        <div className="space-y-3 border-t border-slate-100 p-3">
          <WorkoutView workout={workout} zones={zones} />
          <FitExport workout={workout} zones={zones} />
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-600">
          <span className="shrink-0">Jour</span>
          <select
            aria-label={`Jour prévu pour ${workout.title}`}
            value={day ?? ''}
            disabled={place.isPending}
            onChange={(event) => place.mutate({ workoutId: workout.id, day: event.target.value || null })}
            className="min-h-10 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:outline-2 focus:outline-emerald-600"
          >
            <option value="">à choisir</option>
            {days.map((option) => (
              <option key={option} value={option}>
                {formatShortDay(option)}
                {option === today ? ' (aujourd’hui)' : ''}
              </option>
            ))}
          </select>
        </label>
        {days[0] <= today && (
          <Button variant="secondary" busy={place.isPending} onClick={done}>
            C’est fait
          </Button>
        )}
      </div>
      {place.isError && (
        <div className="px-3 pb-3">
          <Alert tone="error">{errorMessage(place.error)}</Alert>
        </div>
      )}
    </div>
  )
}

/** Sorties déclarées à la main : pour les kilomètres courus hors séance, sans montre reliée. */
function Runs({
  athleteId,
  from,
  to,
  today,
  runs,
  sources,
}: {
  athleteId: string
  from: IsoDate
  to: IsoDate
  today: IsoDate
  runs: AthleteRun[]
  sources: { watchKm: number; declaredKm: number; feedbackKm: number }
}) {
  const [adding, setAdding] = useState(false)
  const remove = useDeleteRun(athleteId)
  const parts = [
    sources.watchKm > 0 ? `montre ${formatKm(sources.watchKm)}` : null,
    sources.feedbackKm > 0 ? `retours de séance ${formatKm(sources.feedbackKm)}` : null,
    sources.declaredKm > 0 ? `sorties ajoutées ${formatKm(sources.declaredKm)}` : null,
  ].filter(Boolean)

  return (
    <section aria-label="Sorties ajoutées" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-800">Tes autres sorties</h3>
        <Button variant="secondary" aria-expanded={adding} onClick={() => setAdding(!adding)}>
          Ajouter une sortie
        </Button>
      </div>
      {parts.length > 0 && <p className="text-xs text-slate-500">Kilomètres comptés : {parts.join(' · ')}.</p>}
      {runs.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {runs.map((run) => (
            <li key={run.id} className="flex min-h-11 items-center gap-3 py-1.5 text-sm">
              <span className="w-16 shrink-0 text-slate-500">{formatShortDay(run.run_on)}</span>
              <span className="min-w-0 flex-1 truncate text-slate-900">
                <strong>{formatKm(run.distance_m / 1000)}</strong>
                {run.duration_s ? ` · ${formatDuration(run.duration_s)}` : ''}
                {run.note ? ` · ${run.note}` : ''}
              </span>
              <Button
                variant="ghost"
                aria-label={`Supprimer la sortie du ${formatShortDay(run.run_on)}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(run.id)}
              >
                ✕
              </Button>
            </li>
          ))}
        </ul>
      )}
      {remove.isError && <Alert tone="error">{errorMessage(remove.error)}</Alert>}
      {adding && <RunForm athleteId={athleteId} defaultDate={today >= from && today <= to ? today : from} onDone={() => setAdding(false)} />}
    </section>
  )
}

function RunForm({ athleteId, defaultDate, onDone }: { athleteId: string; defaultDate: IsoDate; onDone: () => void }) {
  const add = useAddRun(athleteId)
  const [date, setDate] = useState(defaultDate)
  const [distance, setDistance] = useState('')
  const [duration, setDuration] = useState('')
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const meters = parseDistance(distance)
    const seconds = duration.trim() ? parseDuration(duration) : null
    const error = !date
      ? 'Choisis le jour de la sortie.'
      : meters === null || meters < 100
        ? 'Indique la distance, par exemple « 8 » ou « 8,5 km ».'
        : duration.trim() && seconds === null
          ? 'Durée illisible : écris par exemple « 45 » (minutes) ou « 1h10 ».'
          : null
    setProblem(error)
    if (error || meters === null) return
    try {
      await add.mutateAsync({ run_on: date, distance_m: meters, duration_s: seconds, note: note.trim() })
      onDone()
    } catch (caught) {
      setProblem(errorMessage(caught))
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-slate-200 p-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label="Jour" type="date" value={date} required onChange={(event) => setDate(event.target.value)} />
        <TextField label="Distance" value={distance} inputMode="decimal" placeholder="8,5 km" required onChange={(event) => setDistance(event.target.value)} />
        <TextField label="Durée (facultatif)" value={duration} placeholder="45 ou 1h10" onChange={(event) => setDuration(event.target.value)} />
      </div>
      <TextField label="Note (facultatif)" value={note} maxLength={300} placeholder="Footing tranquille" onChange={(event) => setNote(event.target.value)} />
      <p className="text-xs text-slate-500">
        Pour un footing fait en dehors des séances. Inutile si ta montre est reliée, ou si tu as donné la distance dans le
        retour d’une séance : ces kilomètres sont déjà comptés.
      </p>
      {problem && <Alert tone="error">{problem}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" busy={add.isPending}>
          Ajouter
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
      </div>
    </form>
  )
}
