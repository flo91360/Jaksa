import { type FormEvent, useState } from 'react'
import { type PhysiologyDraft, draftToPhysiology, parseIntegerField, physiologyToDraft } from '../domain/drafts.ts'
import type { Physiology } from '../domain/zones.ts'
import type { AthleteProfile, AthleteProfileUpdate } from '../lib/database.types.ts'
import { errorMessage } from '../lib/errors.ts'
import { Alert, Button, SavedHint, TextAreaField, TextField } from './ui.tsx'

type SaveFn = (patch: AthleteProfileUpdate) => Promise<unknown>

function useSaveState() {
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<unknown>) => {
    setSaving(true)
    setError(null)
    try {
      await action()
      setDirty(false)
      setSaved(true)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }
  const touch = () => {
    setDirty(true)
    setSaved(false)
  }
  return { dirty, saving, saved, error, run, touch }
}

/** Objectifs, blessures, disponibilités : renseignés par l'athlète ou son coach. */
export function AthleteInfoForm({ profile, onSave }: { profile: AthleteProfile; onSave: SaveFn }) {
  const [birthYear, setBirthYear] = useState(profile.birth_year === null ? '' : String(profile.birth_year))
  const [goals, setGoals] = useState(profile.goals)
  const [injuries, setInjuries] = useState(profile.injuries)
  const [availability, setAvailability] = useState(profile.availability)
  const [birthYearError, setBirthYearError] = useState<string>()
  const state = useSaveState()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const parsed = parseIntegerField(birthYear)
    const year = parsed.value
    const currentYear = new Date().getFullYear()
    if (parsed.error || (year !== null && (year < 1900 || year > currentYear))) {
      setBirthYearError(`Année entre 1900 et ${currentYear}`)
      return
    }
    setBirthYearError(undefined)
    await state.run(() =>
      onSave({ birth_year: year, goals: goals.trim(), injuries: injuries.trim(), availability: availability.trim() }),
    )
  }

  const edit = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value)
    state.touch()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <TextAreaField
        label="Objectifs"
        value={goals}
        onChange={(event) => edit(setGoals)(event.target.value)}
        placeholder="Ex. Marathon de Paris en avril, moins de 3 h 30"
        maxLength={5000}
      />
      <TextAreaField
        label="Blessures, reprise, contraintes de santé"
        value={injuries}
        onChange={(event) => edit(setInjuries)(event.target.value)}
        placeholder="Ex. Reprise après une tendinite d’Achille (octobre)"
        maxLength={5000}
      />
      <TextAreaField
        label="Disponibilités"
        value={availability}
        onChange={(event) => edit(setAvailability)(event.target.value)}
        placeholder="Ex. Mardi et jeudi soir, sortie longue le dimanche"
        maxLength={5000}
      />
      <TextField
        label="Année de naissance"
        value={birthYear}
        onChange={(event) => edit(setBirthYear)(event.target.value)}
        inputMode="numeric"
        placeholder="1990"
        error={birthYearError}
        className="max-w-40"
      />
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <div className="flex items-center justify-end gap-3">
        <SavedHint show={state.saved && !state.dirty} />
        <Button type="submit" busy={state.saving} disabled={!state.dirty}>
          Enregistrer
        </Button>
      </div>
    </form>
  )
}

const PHYSIOLOGY_FIELDS: { key: keyof Physiology; label: string; placeholder: string; hint: string }[] = [
  { key: 'hr_max', label: 'FC max', placeholder: '190', hint: 'bpm' },
  { key: 'hr_rest', label: 'FC repos', placeholder: '50', hint: 'bpm' },
  { key: 'hr_threshold', label: 'FC seuil', placeholder: '172', hint: 'bpm, seuil anaérobie' },
  { key: 'vma_kmh', label: 'VMA', placeholder: '16,5', hint: 'km/h, facultatif' },
]

/** FC max, repos, seuil et VMA : réservé au coach. */
export function PhysiologyForm({ profile, onSave }: { profile: AthleteProfile; onSave: SaveFn }) {
  const [draft, setDraft] = useState<PhysiologyDraft>(() => physiologyToDraft(profile))
  const [errors, setErrors] = useState<Partial<Record<keyof Physiology, string>>>({})
  const state = useSaveState()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const result = draftToPhysiology(draft)
    setErrors(result.errors)
    if (Object.keys(result.errors).length > 0) return
    await state.run(() => onSave(result.physiology))
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {PHYSIOLOGY_FIELDS.map((field) => (
          <TextField
            key={field.key}
            label={field.label}
            value={draft[field.key]}
            onChange={(event) => {
              setDraft({ ...draft, [field.key]: event.target.value })
              state.touch()
            }}
            inputMode={field.key === 'vma_kmh' ? 'decimal' : 'numeric'}
            placeholder={field.placeholder}
            hint={field.hint}
            error={errors[field.key]}
          />
        ))}
      </div>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <div className="flex items-center justify-end gap-3">
        <SavedHint show={state.saved && !state.dirty} />
        <Button type="submit" busy={state.saving} disabled={!state.dirty}>
          Enregistrer
        </Button>
      </div>
    </form>
  )
}

/** Notes du coach, jamais visibles par l'athlète. */
export function PrivateNoteForm({ body, onSave }: { body: string; onSave: (body: string) => Promise<unknown> }) {
  const [value, setValue] = useState(body)
  const state = useSaveState()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await state.run(() => onSave(value))
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <TextAreaField
        label="Notes privées"
        hideLabel
        rows={4}
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          state.touch()
        }}
        placeholder="Ressenti, points de vigilance, historique…"
        maxLength={20000}
      />
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <div className="flex items-center justify-end gap-3">
        <SavedHint show={state.saved && !state.dirty} />
        <Button type="submit" busy={state.saving} disabled={!state.dirty}>
          Enregistrer
        </Button>
      </div>
    </form>
  )
}
