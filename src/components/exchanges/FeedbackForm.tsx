import { type FormEvent, useState } from 'react'
import { useAddComment, useDeleteFeedback, useSaveFeedback } from '../../api/exchanges.ts'
import {
  FEEDBACK_STATUS,
  type FeedbackDraft,
  type FeedbackErrors,
  type FeedbackStatus,
  MAX_PAINS,
  PAIN_LOCATIONS,
  PAIN_SIDES,
  type Pain,
  type PainLocation,
  type PainSide,
  RPE_LABELS,
  draftToFeedback,
  feedbackToDraft,
} from '../../domain/feedback.ts'
import { cleanBody, COMMENT_MAX } from '../../domain/messages.ts'
import type { WorkoutTotals } from '../../domain/workouts.ts'
import type { WorkoutFeedback } from '../../lib/database.types.ts'
import { errorMessage } from '../../lib/errors.ts'
import { Alert, Button, Modal, SelectField, TextAreaField, TextField } from '../ui.tsx'

const STATUSES = Object.keys(FEEDBACK_STATUS) as FeedbackStatus[]

/** Saisie du retour de séance par l'athlète. */
export function FeedbackForm({
  workoutId,
  title,
  feedback,
  planned,
  onClose,
}: {
  workoutId: string
  title: string
  feedback: WorkoutFeedback | null
  planned?: WorkoutTotals
  onClose: () => void
}) {
  const [draft, setDraft] = useState<FeedbackDraft>(() => feedbackToDraft(feedback, planned))
  const [errors, setErrors] = useState<FeedbackErrors>({})
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const save = useSaveFeedback()
  const remove = useDeleteFeedback()
  const comment = useAddComment()
  const set = (patch: Partial<FeedbackDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const skipped = draft.status === 'skipped'

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const result = draftToFeedback(draft)
    setErrors(result.errors)
    if (!result.feedback) return
    try {
      await save.mutateAsync({ exists: feedback !== null, values: { workout_id: workoutId, ...result.feedback } })
      const body = cleanBody(note, COMMENT_MAX)
      if (body) await comment.mutateAsync({ workoutId, body })
      onClose()
    } catch (error) {
      setFormError(errorMessage(error))
    }
  }

  const deleteFeedback = async () => {
    if (!window.confirm('Effacer ton retour sur cette séance ?')) return
    try {
      await remove.mutateAsync(workoutId)
      onClose()
    } catch (error) {
      setFormError(errorMessage(error))
    }
  }

  return (
    <Modal
      title={`Ton retour · ${title}`}
      onClose={onClose}
      footer={
        <>
          {feedback && (
            <Button variant="danger" className="mr-auto" onClick={deleteFeedback} busy={remove.isPending}>
              Effacer
            </Button>
          )}
          <Button variant="ghost" className="hidden sm:inline-flex" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="feedback-form" busy={save.isPending || comment.isPending}>
            Envoyer à mon coach
          </Button>
        </>
      }
    >
      <form id="feedback-form" onSubmit={submit} className="space-y-5" noValidate>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-700">La séance</legend>
          <div className="grid grid-cols-3 gap-2">
            {STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                aria-pressed={draft.status === status}
                onClick={() => set({ status })}
                className={`min-h-11 rounded-xl border px-2 text-sm font-semibold ${draft.status === status ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
              >
                {FEEDBACK_STATUS[status].label}
              </button>
            ))}
          </div>
        </fieldset>

        {!skipped && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <TextField
                label="Heures"
                inputMode="numeric"
                value={draft.hours}
                onChange={(event) => set({ hours: event.target.value })}
                placeholder="0"
              />
              <TextField
                label="Minutes"
                inputMode="numeric"
                value={draft.minutes}
                onChange={(event) => set({ minutes: event.target.value })}
                placeholder="45"
              />
              <TextField
                label="Distance (km)"
                inputMode="decimal"
                value={draft.km}
                onChange={(event) => set({ km: event.target.value })}
                placeholder="10,5"
                error={errors.km}
              />
              <TextField
                label="D+ (m)"
                inputMode="numeric"
                value={draft.elevation}
                onChange={(event) => set({ elevation: event.target.value })}
                placeholder="0"
                error={errors.elevation}
              />
            </div>
            {errors.duration && <p className="-mt-3 text-xs font-medium text-red-700">{errors.duration}</p>}

            <fieldset>
              <legend className="mb-1 text-sm font-medium text-slate-700">Ressenti (RPE)</legend>
              <p className="mb-2 text-xs text-slate-500">1 : très facile · 10 : effort maximal</p>
              <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={draft.rpe === value}
                    aria-label={`${value} : ${RPE_LABELS[value]}`}
                    onClick={() => set({ rpe: draft.rpe === value ? null : value })}
                    className={`min-h-11 rounded-lg border text-sm font-bold ${draft.rpe === value ? rpeSelected(value) : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <p className="mt-1 h-5 text-sm text-slate-600" aria-live="polite">
                {draft.rpe ? RPE_LABELS[draft.rpe] : ''}
              </p>
              {errors.rpe && <p className="text-xs font-medium text-red-700">{errors.rpe}</p>}
            </fieldset>
          </>
        )}

        <PainEditor pain={draft.pain} onChange={(pain) => set({ pain })} error={errors.pain} />

        <TextAreaField
          label="Un mot pour ton coach (facultatif)"
          value={note}
          maxLength={COMMENT_MAX}
          placeholder="Sensations, conditions, ce qui a coincé…"
          onChange={(event) => setNote(event.target.value)}
        />

        {formError && <Alert tone="error">{formError}</Alert>}
      </form>
    </Modal>
  )
}

function rpeSelected(value: number): string {
  if (value <= 3) return 'border-emerald-600 bg-emerald-600 text-white'
  if (value <= 6) return 'border-amber-500 bg-amber-500 text-white'
  if (value <= 8) return 'border-orange-600 bg-orange-600 text-white'
  return 'border-red-700 bg-red-700 text-white'
}

/** Douleurs : où, de quel côté, et avec quelle intensité (1 à 10). */
function PainEditor({ pain, onChange, error }: { pain: Pain[]; onChange: (pain: Pain[]) => void; error?: string }) {
  const update = (index: number, patch: Partial<Pain>) => onChange(pain.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  return (
    <fieldset className="space-y-3 rounded-xl border border-slate-200 p-3">
      <legend className="px-1 text-sm font-medium text-slate-700">Douleur</legend>
      {pain.length === 0 && <p className="text-sm text-slate-600">Aucune douleur signalée.</p>}
      {pain.map((item, index) => (
        <div key={index} className="space-y-2 rounded-lg bg-slate-50 p-2">
          <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
            <SelectField
              label="Où"
              value={item.location}
              onChange={(event) => update(index, { location: event.target.value as PainLocation })}
            >
              {(Object.keys(PAIN_LOCATIONS) as PainLocation[]).map((key) => (
                <option key={key} value={key}>
                  {PAIN_LOCATIONS[key]}
                </option>
              ))}
            </SelectField>
            <SelectField label="Côté" value={item.side} onChange={(event) => update(index, { side: event.target.value as PainSide })}>
              {(Object.keys(PAIN_SIDES) as PainSide[]).map((key) => (
                <option key={key} value={key}>
                  {PAIN_SIDES[key] || '—'}
                </option>
              ))}
            </SelectField>
            <button
              type="button"
              onClick={() => onChange(pain.filter((_, i) => i !== index))}
              aria-label="Retirer cette douleur"
              className="inline-flex size-11 items-center justify-center rounded-xl text-xl text-slate-500 hover:bg-slate-200"
            >
              ×
            </button>
          </div>
          <label className="block text-sm text-slate-700">
            <span className="flex justify-between">
              <span>Intensité</span>
              <strong>{item.intensity}/10</strong>
            </span>
            <input
              type="range"
              min={1}
              max={10}
              value={item.intensity}
              onChange={(event) => update(index, { intensity: Number(event.target.value) })}
              className="mt-1 w-full accent-red-600"
            />
            <span className="flex justify-between text-xs text-slate-500">
              <span>gêne légère</span>
              <span>insupportable</span>
            </span>
          </label>
        </div>
      ))}
      {error && <p className="text-xs font-medium text-red-700">{error}</p>}
      {pain.length < MAX_PAINS && (
        <Button
          variant="secondary"
          onClick={() => onChange([...pain, { location: 'knee', side: 'left', intensity: 3 }])}
        >
          + Signaler une douleur
        </Button>
      )}
    </fieldset>
  )
}
