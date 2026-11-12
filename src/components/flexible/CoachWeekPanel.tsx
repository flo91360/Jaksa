import { type FormEvent, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useSaveWeeklyTarget, useSetCoachingMode, useWeek } from '../../api/flexible.ts'
import { formatShortDay, formatWeekRange, isIsoDate, startOfWeek, todayIso } from '../../domain/calendar.ts'
import { COACHING_MODES, type CoachingMode, SESSION_STATES, type SessionState, parseTarget } from '../../domain/flexible.ts'
import type { WeeklyTarget, Workout } from '../../lib/database.types.ts'
import { errorMessage } from '../../lib/errors.ts'
import { firstName } from '../../lib/format.ts'
import { Alert, Button, Card, LoadingBlock, SavedHint, TextField } from '../ui.tsx'
import { type AthleteOption, WorkoutEditor } from '../workout/WorkoutEditor.tsx'
import { KIND_STYLES } from '../workout/kindStyles.ts'
import { VolumeGauge } from './VolumeGauge.tsx'

const MODES: CoachingMode[] = ['strict', 'flexible']

/** Le coach choisit, pour cet athlète, entre le mode strict et le mode souple. */
export function CoachingModeCard({ coachId, athleteId, mode }: { coachId: string; athleteId: string; mode: CoachingMode }) {
  const setMode = useSetCoachingMode(coachId, athleteId)
  return (
    <Card
      title="Mode de coaching"
      description={COACHING_MODES[mode].summary}
      actions={
        <div className="flex rounded-xl border border-slate-300 bg-white p-0.5 shadow-sm" role="group" aria-label="Mode de coaching">
          {MODES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              disabled={setMode.isPending}
              onClick={() => {
                if (option !== mode) setMode.mutate(option)
              }}
              className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${mode === option ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
            >
              {COACHING_MODES[option].label}
            </button>
          ))}
        </div>
      }
    >
      {setMode.isError ? (
        <Alert tone="error">{errorMessage(setMode.error)}</Alert>
      ) : (
        <p className="text-xs text-slate-500">
          Tu peux changer de mode à tout moment : les séances déjà planifiées ne bougent pas.
        </p>
      )}
    </Card>
  )
}

const STATE_TONES: Record<SessionState, string> = {
  todo: 'bg-slate-100 text-slate-700',
  done: 'bg-emerald-100 text-emerald-900',
  partial: 'bg-amber-100 text-amber-900',
  skipped: 'bg-red-100 text-red-900',
}

export function SessionStateBadge({ state }: { state: SessionState }) {
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATE_TONES[state]}`}>
      <span aria-hidden="true">{SESSION_STATES[state].icon}</span> {SESSION_STATES[state].label}
    </span>
  )
}

/**
 * Semaine d'un athlète suivi en mode souple, vue par son coach : le volume à fixer,
 * les kilomètres courus, et les séances « à faire dans la semaine ».
 * Suit la semaine affichée par le calendrier (?date=…).
 */
export function CoachWeekPanel({ athlete }: { athlete: AthleteOption }) {
  const [params] = useSearchParams()
  const [today] = useState(() => todayIso())
  const navigate = useNavigate()
  const dateParam = params.get('date') ?? ''
  const monday = startOfWeek(isIsoDate(dateParam) ? dateParam : today)
  const week = useWeek(athlete.id, monday)
  const [editing, setEditing] = useState<Workout | 'new' | null>(null)
  const name = firstName(athlete.name) || 'l’athlète'
  const { summary } = week

  return (
    <Card
      title={`Semaine souple · ${formatWeekRange(monday)}`}
      description={`Le volume de la semaine et les séances dont ${name} choisit le jour.`}
    >
      {week.isPending ? (
        <LoadingBlock />
      ) : week.error ? (
        <Alert tone="error">{errorMessage(week.error)}</Alert>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <VolumeGauge summary={summary} you={false} />
            <TargetForm
              // Repart des valeurs enregistrées quand on change de semaine.
              key={monday}
              athleteId={athlete.id}
              monday={monday}
              target={week.target}
            />
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">
                Séances de la semaine
                {summary.sessions.length > 0 && (
                  <span className="font-normal text-slate-500">
                    {' '}
                    · {summary.done} faite{summary.done > 1 ? 's' : ''} sur {summary.sessions.length}
                  </span>
                )}
              </h3>
              <Button variant="secondary" onClick={() => setEditing('new')}>
                Ajouter une séance
              </Button>
            </div>
            {summary.sessions.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Aucune séance « à faire dans la semaine ». Ajoute par exemple les séances de fractionné : {name} choisira ses jours.
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {summary.sessions.map(({ workout, state, day }) => (
                  <li key={workout.id}>
                    <button
                      type="button"
                      onClick={() => (state === 'todo' ? setEditing(workout) : navigate(`/seance/${workout.id}`))}
                      className={`flex min-h-11 w-full items-center gap-3 rounded-xl border border-l-4 border-slate-200 bg-white px-3 py-2 text-left hover:border-slate-300 ${KIND_STYLES[workout.kind].card}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">{workout.title}</span>
                        <span className="block text-xs text-slate-500">{day ? formatShortDay(day) : 'jour pas encore choisi'}</span>
                      </span>
                      <SessionStateBadge state={state} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {editing && (
        <WorkoutEditor
          workout={editing === 'new' ? undefined : editing}
          initial={editing === 'new' ? { athleteId: athlete.id, date: monday, flexible: true } : undefined}
          athletes={[athlete]}
          existing={week.workouts}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  )
}

function TargetForm({ athleteId, monday, target }: { athleteId: string; monday: string; target: WeeklyTarget | null }) {
  const save = useSaveWeeklyTarget(athleteId, monday)
  const [min, setMin] = useState(target ? String(target.km_min).replace('.', ',') : '')
  const [max, setMax] = useState(target ? String(target.km_max).replace('.', ',') : '')
  const [note, setNote] = useState(target?.note ?? '')
  const [problem, setProblem] = useState<string | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const parsed = parseTarget({ min, max })
    setProblem(parsed.error)
    if (parsed.error) return
    if (!parsed.target && !target) {
      if (note.trim()) setProblem('Indique un volume pour enregistrer la consigne.')
      return
    }
    save.mutate({ exists: target !== null, target: parsed.target, note: note.trim() })
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Volume : de (km)" inputMode="decimal" value={min} placeholder="35" onChange={(event) => setMin(event.target.value)} />
        <TextField label="à (km)" inputMode="decimal" value={max} placeholder="45" onChange={(event) => setMax(event.target.value)} />
      </div>
      <TextField
        label="Consigne de la semaine"
        value={note}
        maxLength={500}
        placeholder="Garde une journée de repos entre les deux séances…"
        onChange={(event) => setNote(event.target.value)}
        hint="Laisse le volume vide pour ne pas en fixer cette semaine."
      />
      {problem && <Alert tone="error">{problem}</Alert>}
      {save.isError && <Alert tone="error">{errorMessage(save.error)}</Alert>}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" busy={save.isPending}>
          Enregistrer le volume
        </Button>
        <SavedHint show={save.isSuccess} />
      </div>
    </form>
  )
}
