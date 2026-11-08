import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useWorkoutActivity } from '../../api/exchanges.ts'
import { useGarminActivitiesInRange } from '../../api/garmin.ts'
import { useCreateWorkouts, useRaces, useUpdateWorkout, useWorkouts } from '../../api/planning.ts'
import {
  type CalendarView,
  type IsoDate,
  addDays,
  formatMonth,
  formatWeekRange,
  isIsoDate,
  shiftView,
  startOfWeek,
  todayIso,
  visibleRange,
} from '../../domain/calendar.ts'
import { copyWorkout, duplicateWeek, nextPosition } from '../../domain/planning.ts'
import type { Race, Workout } from '../../lib/database.types.ts'
import { errorMessage } from '../../lib/errors.ts'
import { RaceEditor } from '../RaceEditor.tsx'
import { Alert, Button, Modal, TextField } from '../ui.tsx'
import { type AthleteOption, WorkoutEditor } from '../workout/WorkoutEditor.tsx'
import { PlanningCalendar } from './PlanningCalendar.tsx'

type Editing =
  | { type: 'workout'; workout: Workout }
  | { type: 'new-workout'; athleteId: string | null; date: IsoDate }
  | { type: 'race'; race: Race }
  | { type: 'new-race'; athleteId: string; date?: IsoDate }
  | { type: 'duplicate-week' }
  | null

/**
 * Calendrier de planification du coach, à la semaine ou au mois.
 * Un seul athlète (fiche) ou tous ses athlètes actifs (multi). La vue et la
 * date affichées sont dans l'adresse (?vue=mois&date=…), pour revenir au même endroit.
 */
export function PlanningBoard({ athletes, multi }: { athletes: AthleteOption[]; multi: boolean }) {
  const [params, setParams] = useSearchParams()
  const [today] = useState(() => todayIso())
  const view: CalendarView = params.get('vue') === 'mois' ? 'month' : 'week'
  const dateParam = params.get('date') ?? ''
  const anchor = isIsoDate(dateParam) ? dateParam : today
  const range = visibleRange(view, anchor)
  const ids = athletes.map((a) => a.id)

  const workouts = useWorkouts(ids, range.from, range.to)
  const races = useRaces(ids, range.from, range.to)
  const activity = useWorkoutActivity(ids, range.from, range.to)
  // Absentes tant que la migration de la 0.4.0 n'est pas appliquée : la requête échoue sans bruit.
  const garminActivities = useGarminActivitiesInRange(ids, range.from, range.to)
  const navigate = useNavigate()
  const update = useUpdateWorkout()
  const create = useCreateWorkouts()
  const [editing, setEditing] = useState<Editing>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const go = (nextView: CalendarView, date: IsoDate) => {
    const next = new URLSearchParams(params)
    if (nextView === 'month') next.set('vue', 'mois')
    else next.delete('vue')
    if (date === today) next.delete('date')
    else next.set('date', date)
    setParams(next, { replace: true })
  }

  const list = workouts.data ?? []
  const freeActivities = (garminActivities.data ?? []).filter((a) => a.workout_id === null)
  /** Séances qui ont une activité de la montre : courbes et tours à voir. */
  const watched = new Set((garminActivities.data ?? []).map((a) => a.workout_id).filter((id) => id !== null))

  // « Modifier la séance » depuis la page d'une séance : ?modifier=<id> ouvre l'éditeur.
  const toEdit = params.get('modifier')
  const toEditWorkout = toEdit ? list.find((w) => w.id === toEdit) : undefined
  const shown: Editing = editing ?? (toEditWorkout ? { type: 'workout', workout: toEditWorkout } : null)
  const close = () => {
    setEditing(null)
    if (toEdit) {
      const next = new URLSearchParams(params)
      next.delete('modifier')
      setParams(next, { replace: true })
    }
  }

  /** Une séance faite (retour ou montre) s'ouvre sur son détail : chiffres, graphiques, retour. Sinon, l'éditeur. */
  const openWorkout = (workout: Workout) => {
    if (activity.data?.get(workout.id)?.status || watched.has(workout.id)) navigate(`/seance/${workout.id}`)
    else setEditing({ type: 'workout', workout })
  }

  const drop = (workout: Workout, target: { athleteId: string; date: IsoDate }, copy: boolean) => {
    setNotice(null)
    if (copy) {
      create.mutate([copyWorkout(workout, target, list)], {
        onSuccess: () => {
          const who = athletes.find((a) => a.id === target.athleteId)?.name
          setNotice(`« ${workout.title} » copiée${target.athleteId !== workout.athlete_id && who ? ` pour ${who}` : ''}.`)
        },
      })
    } else {
      update.mutate({
        id: workout.id,
        patch: { scheduled_on: target.date, position: nextPosition(list, workout.athlete_id, target.date) },
      })
    }
  }

  const mutationError = update.error ?? create.error

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="secondary" aria-label="Période précédente" onClick={() => go(view, shiftView(view, anchor, -1))}>
            ←
          </Button>
          <Button variant="secondary" onClick={() => go(view, today)}>
            Aujourd’hui
          </Button>
          <Button variant="secondary" aria-label="Période suivante" onClick={() => go(view, shiftView(view, anchor, 1))}>
            →
          </Button>
        </div>
        <h2 className="order-first min-w-0 basis-full text-lg font-semibold text-slate-900 sm:order-none sm:flex-1 sm:basis-auto" aria-live="polite">
          {view === 'week' ? formatWeekRange(anchor) : formatMonth(anchor)}
        </h2>
        <div className="ml-auto flex rounded-xl border border-slate-300 bg-white p-0.5 shadow-sm sm:ml-0" role="group" aria-label="Vue">
          {(['week', 'month'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => go(option, anchor)}
              className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${view === option ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
            >
              {option === 'week' ? 'Semaine' : 'Mois'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setEditing({ type: 'new-workout', athleteId: multi ? null : (ids[0] ?? null), date: view === 'week' && anchor < today ? startOfWeek(anchor) : anchor })}>
          Nouvelle séance
        </Button>
        {!multi && ids[0] && (
          <>
            <Button variant="secondary" onClick={() => setEditing({ type: 'new-race', athleteId: ids[0], date: undefined })}>
              Ajouter une course
            </Button>
            {view === 'week' && (
              <Button variant="secondary" onClick={() => setEditing({ type: 'duplicate-week' })}>
                Dupliquer la semaine
              </Button>
            )}
          </>
        )}
      </div>

      <p className="hidden text-xs text-slate-500 md:block">
        Glisse une séance pour la déplacer ; maintiens Alt (ou Ctrl) pour la copier
        {multi ? ', ou dépose-la sur la ligne d’un autre athlète.' : '.'}
      </p>

      {notice && <Alert tone="success">{notice}</Alert>}
      {mutationError && <Alert tone="error">{errorMessage(mutationError)}</Alert>}
      {(workouts.isError || races.isError) && <Alert tone="error">{errorMessage(workouts.error ?? races.error)}</Alert>}

      <PlanningCalendar
        view={view}
        anchor={anchor}
        today={today}
        athletes={athletes}
        workouts={list}
        races={races.data ?? []}
        activity={activity.data}
        freeActivities={freeActivities}
        watched={watched}
        multi={multi}
        onOpenWorkout={openWorkout}
        onCreate={(athleteId, date) => setEditing({ type: 'new-workout', athleteId, date })}
        onOpenRace={(race) => setEditing({ type: 'race', race })}
        onDrop={drop}
        onShowWeek={(date) => go('week', date)}
      />

      {shown?.type === 'workout' && (
        <WorkoutEditor
          workout={shown.workout}
          athletes={athletes}
          existing={list}
          activity={activity.data?.get(shown.workout.id)}
          onClose={close}
        />
      )}
      {shown?.type === 'new-workout' && (
        <WorkoutEditor
          initial={{ athleteId: shown.athleteId ?? undefined, date: shown.date }}
          athletes={athletes}
          existing={list}
          onClose={close}
        />
      )}
      {shown?.type === 'race' && (
        <RaceEditor athleteId={shown.race.athlete_id} race={shown.race} onClose={close} />
      )}
      {shown?.type === 'new-race' && (
        <RaceEditor athleteId={shown.athleteId} defaultDate={shown.date} onClose={close} />
      )}
      {shown?.type === 'duplicate-week' && ids[0] && (
        <DuplicateWeekDialog
          athleteId={ids[0]}
          week={startOfWeek(anchor)}
          workouts={list}
          onClose={close}
          onDone={(message, target) => {
            setEditing(null)
            setNotice(message)
            go('week', target)
          }}
        />
      )}
    </div>
  )
}

function DuplicateWeekDialog({
  athleteId,
  week,
  workouts,
  onClose,
  onDone,
}: {
  athleteId: string
  week: IsoDate
  workouts: Workout[]
  onClose: () => void
  onDone: (message: string, target: IsoDate) => void
}) {
  const [target, setTarget] = useState(addDays(week, 7))
  const create = useCreateWorkouts()
  const source = workouts.filter((w) => w.athlete_id === athleteId && w.scheduled_on >= week && w.scheduled_on <= addDays(week, 6))
  const targetWeek = isIsoDate(target) ? startOfWeek(target) : null
  // Séances de la semaine cible : nécessaires pour placer les copies après elles.
  const targetWorkouts = useWorkouts([athleteId], targetWeek ?? week, targetWeek ? addDays(targetWeek, 6) : week)

  const duplicate = async () => {
    if (!targetWeek) return
    const all = [...source, ...(targetWorkouts.data ?? [])]
    const drafts = duplicateWeek(all, athleteId, week, targetWeek)
    await create.mutateAsync(drafts)
    onDone(
      `${drafts.length} séance${drafts.length > 1 ? 's' : ''} copiée${drafts.length > 1 ? 's' : ''} sur la semaine du ${formatWeekRange(targetWeek)}.`,
      targetWeek,
    )
  }

  return (
    <Modal
      title="Dupliquer la semaine"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            onClick={duplicate}
            busy={create.isPending}
            disabled={!targetWeek || targetWeek === week || source.length === 0 || targetWorkouts.isPending}
          >
            Dupliquer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-700">
          {source.length === 0
            ? 'Aucune séance cette semaine : rien à dupliquer.'
            : `Les ${source.length} séance${source.length > 1 ? 's' : ''} de la semaine du ${formatWeekRange(week)} seront copiées jour pour jour. Les séances déjà prévues sont conservées.`}
        </p>
        <TextField
          label="Vers la semaine du"
          type="date"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          hint={targetWeek ? formatWeekRange(targetWeek) : undefined}
          error={targetWeek === week ? 'Choisis une autre semaine.' : undefined}
        />
        {create.isError && <Alert tone="error">{errorMessage(create.error)}</Alert>}
      </div>
    </Modal>
  )
}
