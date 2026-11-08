import { type FormEvent, useState } from 'react'
import { useCreateWorkouts, useDeleteWorkout, useSaveTemplate, useTemplates, useUpdateWorkout } from '../../api/planning.ts'
import { type IsoDate, formatLongDay, isIsoDate } from '../../domain/calendar.ts'
import { type WorkoutContent, copyWorkout, nextPosition } from '../../domain/planning.ts'
import {
  WORKOUT_KINDS,
  type WorkoutKind,
  formatTotals,
  validateWorkoutItems,
  workoutTotals,
} from '../../domain/workouts.ts'
import type { HrZone } from '../../domain/zones.ts'
import { useMyProfile } from '../../api/profile.ts'
import { useUserId } from '../../auth/auth-context.ts'
import type { Workout, WorkoutActivity, WorkoutTemplate } from '../../lib/database.types.ts'
import { WorkoutExchanges } from '../exchanges/WorkoutExchanges.tsx'
import { errorMessage } from '../../lib/errors.ts'
import { Alert, Button, Modal, SelectField, TextAreaField, TextField } from '../ui.tsx'
import { StepBuilder } from './StepBuilder.tsx'
import { type EditableItem, fromEditable, toEditable } from './editable.ts'
import { FitExport } from './WorkoutView.tsx'

export type AthleteOption = { id: string; name: string; zones: HrZone[] }

const EMPTY_CONTENT: WorkoutContent = { kind: 'run', title: '', description: '', steps: [] }

/** Champs communs aux séances planifiées et aux séances types. */
function useContentState(initial: WorkoutContent) {
  const [kind, setKind] = useState<WorkoutKind>(initial.kind)
  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description)
  const [items, setItems] = useState<EditableItem[]>(() => toEditable(initial.steps))
  const load = (content: WorkoutContent) => {
    setKind(content.kind)
    setTitle(content.title)
    setDescription(content.description)
    setItems(toEditable(content.steps))
  }
  const content = (): WorkoutContent => ({
    kind,
    title: title.trim(),
    description: description.trim(),
    steps: fromEditable(items),
  })
  return { kind, setKind, title, setTitle, description, setDescription, items, setItems, load, content }
}

type ContentState = ReturnType<typeof useContentState>

function ContentFields({ state, zones, zonesHint }: { state: ContentState; zones: HrZone[]; zonesHint?: string }) {
  const steps = fromEditable(state.items)
  const totals = formatTotals(workoutTotals(steps, zones))
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
        <TextField
          label="Titre"
          value={state.title}
          maxLength={120}
          required
          placeholder="VMA courte, sortie longue…"
          onChange={(event) => state.setTitle(event.target.value)}
        />
        <SelectField label="Type" value={state.kind} onChange={(event) => state.setKind(event.target.value as WorkoutKind)}>
          {(Object.keys(WORKOUT_KINDS) as WorkoutKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {WORKOUT_KINDS[kind]}
            </option>
          ))}
        </SelectField>
      </div>
      <TextAreaField
        label="Consignes"
        value={state.description}
        maxLength={5000}
        placeholder="Terrain, sensations recherchées, alternative en cas de fatigue…"
        onChange={(event) => state.setDescription(event.target.value)}
      />
      {state.kind !== 'rest' && (
        <section className="space-y-2" aria-label="Étapes">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-800">Étapes</h3>
            <p className="text-sm text-slate-600" aria-live="polite">
              {totals ? `Total estimé : ${totals}` : 'Total estimé : —'}
            </p>
          </div>
          {zonesHint && <p className="text-xs text-slate-500">{zonesHint}</p>}
          <StepBuilder items={state.items} onChange={state.setItems} zones={zones} />
        </section>
      )}
    </div>
  )
}

function checkContent(content: WorkoutContent): string | null {
  if (!content.title) return 'Donne un titre à la séance.'
  return validateWorkoutItems(content.steps)
}

/**
 * Création ou modification d'une séance planifiée, par le coach.
 * `existing` sert à placer une nouvelle séance après celles du même jour.
 */
export function WorkoutEditor({
  workout,
  initial,
  athletes,
  existing,
  activity,
  onClose,
}: {
  workout?: Workout
  initial?: { athleteId?: string; date: IsoDate; content?: WorkoutContent }
  athletes: AthleteOption[]
  existing: Workout[]
  /** Retour et commentaires de la séance : ouvre directement cet onglet s'il y a du nouveau. */
  activity?: WorkoutActivity
  onClose: () => void
}) {
  const meId = useUserId()
  const me = useMyProfile()
  const [tab, setTab] = useState<'content' | 'exchanges'>(
    activity && (activity.unseen_feedback || activity.unread_comments > 0) ? 'exchanges' : 'content',
  )
  const state = useContentState(workout ?? initial?.content ?? EMPTY_CONTENT)
  const [athleteId, setAthleteId] = useState(workout?.athlete_id ?? initial?.athleteId ?? athletes[0]?.id ?? '')
  const [date, setDate] = useState<IsoDate>(workout?.scheduled_on ?? initial?.date ?? '')
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [copying, setCopying] = useState(false)

  const templates = useTemplates()
  const create = useCreateWorkouts()
  const update = useUpdateWorkout()
  const remove = useDeleteWorkout()
  const saveTemplate = useSaveTemplate()

  const athlete = athletes.find((a) => a.id === athleteId)
  const zones = athlete?.zones ?? []
  const busy = create.isPending || update.isPending || remove.isPending

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const content = state.content()
    const problem = checkContent(content) ?? (isIsoDate(date) ? null : 'Choisis une date.') ?? (athleteId ? null : 'Choisis un athlète.')
    setFormError(problem)
    if (problem) return
    try {
      if (workout) {
        const moved = date !== workout.scheduled_on
        await update.mutateAsync({
          id: workout.id,
          patch: { ...content, scheduled_on: date, ...(moved ? { position: nextPosition(existing, athleteId, date) } : {}) },
        })
      } else {
        await create.mutateAsync([
          { ...content, athlete_id: athleteId, scheduled_on: date, position: nextPosition(existing, athleteId, date) },
        ])
      }
      onClose()
    } catch (error) {
      setFormError(errorMessage(error))
    }
  }

  const deleteWorkout = async () => {
    if (!workout || !window.confirm('Supprimer cette séance ?')) return
    try {
      await remove.mutateAsync(workout.id)
      onClose()
    } catch (error) {
      setFormError(errorMessage(error))
    }
  }

  const addToLibrary = async () => {
    const content = state.content()
    const problem = checkContent(content)
    setFormError(problem)
    if (problem) return
    try {
      await saveTemplate.mutateAsync({ values: content })
      setNotice(`« ${content.title} » est dans ta bibliothèque de séances types.`)
    } catch (error) {
      setFormError(errorMessage(error))
    }
  }

  return (
    <Modal
      wide
      title={workout ? 'Modifier la séance' : 'Nouvelle séance'}
      onClose={onClose}
      footer={
        workout && tab === 'exchanges' ? (
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        ) : (
        <>
          {workout && (
            <Button variant="danger" onClick={deleteWorkout} busy={remove.isPending} className="mr-auto">
              Supprimer
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="workout-form" busy={create.isPending || update.isPending}>
            Enregistrer
          </Button>
        </>
        )
      }
    >
      {workout && (
        <div className="-mt-1 mb-4 flex gap-1 border-b border-slate-200" role="tablist">
          {(
            [
              ['content', 'Séance'],
              ['exchanges', `Retour et commentaires${activity?.comment_count ? ` (${activity.comment_count})` : ''}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`-mb-px inline-flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-semibold ${tab === key ? 'border-emerald-700 text-emerald-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              {label}
              {key === 'exchanges' && activity && (activity.unseen_feedback || activity.unread_comments > 0) && (
                <span className="size-2 rounded-full bg-red-600" aria-label="nouveau" />
              )}
            </button>
          ))}
        </div>
      )}
      {workout && tab === 'exchanges' && (
        <WorkoutExchanges
          workout={workout}
          zones={zones}
          role="coach"
          meId={meId}
          names={{ [workout.athlete_id]: athlete?.name ?? '', [meId]: me.data?.full_name ?? '' }}
        />
      )}
      <form
        id="workout-form"
        onSubmit={submit}
        className={`space-y-4 ${workout && tab === 'exchanges' ? 'hidden' : ''}`}
        noValidate
      >
        {!workout && templates.data && templates.data.length > 0 && (
          <SelectField
            label="Partir d’une séance type"
            value=""
            onChange={(event) => {
              const template = templates.data.find((t) => t.id === event.target.value)
              if (template) state.load(template)
            }}
          >
            <option value="">Choisir dans la bibliothèque…</option>
            {templates.data.map((template) => (
              <option key={template.id} value={template.id}>
                {template.title}
              </option>
            ))}
          </SelectField>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {workout ? (
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-700">Athlète</p>
              <p className="py-2.5 text-sm font-semibold text-slate-900">{athlete?.name ?? '—'}</p>
            </div>
          ) : (
            <SelectField label="Athlète" value={athleteId} onChange={(event) => setAthleteId(event.target.value)}>
              {athletes.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </SelectField>
          )}
          <TextField
            label="Date"
            type="date"
            value={date}
            required
            onChange={(event) => setDate(event.target.value)}
            hint={isIsoDate(date) ? formatLongDay(date) : undefined}
          />
        </div>

        <ContentFields
          state={state}
          zones={zones}
          zonesHint={
            zones.length > 0
              ? `Les zones sont traduites d’après la fiche de ${athlete?.name ?? 'l’athlète'}.`
              : 'Cet athlète n’a pas encore de zones : les cibles en zone resteront sans FC ni allure.'
          }
        />

        {formError && <Alert tone="error">{formError}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}

        {workout && (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setCopying(!copying)} aria-expanded={copying} disabled={busy}>
                Copier vers…
              </Button>
              <Button variant="secondary" onClick={addToLibrary} busy={saveTemplate.isPending}>
                Ajouter à la bibliothèque
              </Button>
            </div>
            {copying && (
              <CopyForm
                source={state.content()}
                athletes={athletes}
                defaultAthleteId={athleteId}
                existing={existing}
                onDone={(message) => {
                  setCopying(false)
                  setNotice(message)
                }}
              />
            )}
            <FitExport workout={{ ...state.content(), scheduled_on: date }} zones={zones} />
          </div>
        )}
      </form>
    </Modal>
  )
}

function CopyForm({
  source,
  athletes,
  defaultAthleteId,
  existing,
  onDone,
}: {
  source: WorkoutContent
  athletes: AthleteOption[]
  defaultAthleteId: string
  existing: Workout[]
  onDone: (message: string) => void
}) {
  const [athleteId, setAthleteId] = useState(defaultAthleteId)
  const [date, setDate] = useState('')
  const create = useCreateWorkouts()

  const copy = async () => {
    if (!isIsoDate(date)) return
    await create.mutateAsync([copyWorkout(source, { athleteId, date }, existing)])
    const name = athletes.find((a) => a.id === athleteId)?.name ?? ''
    onDone(`Séance copiée au ${formatLongDay(date).toLowerCase()}${athleteId === defaultAthleteId ? '' : ` pour ${name}`}.`)
  }

  return (
    <div className="space-y-3 rounded-xl bg-slate-50 p-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        {athletes.length > 1 && (
          <SelectField label="Pour" value={athleteId} onChange={(event) => setAthleteId(event.target.value)}>
            {athletes.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </SelectField>
        )}
        <TextField label="Le" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        <Button onClick={copy} busy={create.isPending} disabled={!isIsoDate(date)}>
          Copier
        </Button>
      </div>
      {create.isError && <Alert tone="error">{errorMessage(create.error)}</Alert>}
    </div>
  )
}

/** Création ou modification d'une séance type de la bibliothèque. */
export function TemplateEditor({ template, onClose }: { template?: WorkoutTemplate; onClose: () => void }) {
  const state = useContentState(template ?? EMPTY_CONTENT)
  const save = useSaveTemplate()
  const [formError, setFormError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const content = state.content()
    const problem = checkContent(content)
    setFormError(problem)
    if (problem) return
    try {
      await save.mutateAsync({ id: template?.id, values: content })
      onClose()
    } catch (error) {
      setFormError(errorMessage(error))
    }
  }

  return (
    <Modal
      wide
      title={template ? 'Modifier la séance type' : 'Nouvelle séance type'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="template-form" busy={save.isPending}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form id="template-form" onSubmit={submit} className="space-y-4" noValidate>
        <ContentFields
          state={state}
          zones={[]}
          zonesHint="Les zones (Z1 à Z5) seront traduites en FC et en allure pour chaque athlète, une fois la séance planifiée."
        />
        {formError && <Alert tone="error">{formError}</Alert>}
      </form>
    </Modal>
  )
}

