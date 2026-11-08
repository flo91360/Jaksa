import { type FormEvent, useState } from 'react'
import { useDeleteRace, useSaveRace } from '../api/planning.ts'
import { type IsoDate, formatLongDay, formatRelativeDays, isIsoDate } from '../domain/calendar.ts'
import { RACE_PRIORITIES, type RacePriority, formatRaceDetails } from '../domain/planning.ts'
import type { Race } from '../lib/database.types.ts'
import { errorMessage } from '../lib/errors.ts'
import { Alert, Button, Modal, SelectField, TextAreaField, TextField } from './ui.tsx'

const PRIORITY_BADGES: Record<RacePriority, string> = {
  A: 'bg-rose-600 text-white',
  B: 'bg-amber-400 text-amber-950',
  C: 'bg-slate-200 text-slate-800',
}

export function PriorityBadge({ priority }: { priority: RacePriority }) {
  return (
    <span
      className={`inline-flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ${PRIORITY_BADGES[priority]}`}
      title={RACE_PRIORITIES[priority].description}
    >
      {priority}
    </span>
  )
}

function parseOptionalNumber(text: string): number | null | undefined {
  const value = text.trim().replace(',', '.')
  if (value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

/** Ajout ou modification d'une course (coach ou athlète). */
export function RaceEditor({
  athleteId,
  race,
  defaultDate,
  onClose,
}: {
  athleteId: string
  race?: Race
  defaultDate?: IsoDate
  onClose: () => void
}) {
  const [name, setName] = useState(race?.name ?? '')
  const [date, setDate] = useState(race?.race_on ?? defaultDate ?? '')
  const [priority, setPriority] = useState<RacePriority>(race?.priority ?? 'B')
  const [distance, setDistance] = useState(race?.distance_km === null || !race ? '' : String(race.distance_km).replace('.', ','))
  const [elevation, setElevation] = useState(race?.elevation_gain_m === null || !race ? '' : String(race.elevation_gain_m))
  const [notes, setNotes] = useState(race?.notes ?? '')
  const [formError, setFormError] = useState<string | null>(null)
  const save = useSaveRace()
  const remove = useDeleteRace()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const distance_km = parseOptionalNumber(distance)
    const elevation_gain_m = parseOptionalNumber(elevation)
    let problem: string | null = null
    if (!name.trim()) problem = 'Indique le nom de la course.'
    else if (!isIsoDate(date)) problem = 'Choisis la date de la course.'
    else if (distance_km === undefined || (distance_km !== null && (distance_km <= 0 || distance_km > 1000))) {
      problem = 'Distance entre 0 et 1 000 km.'
    } else if (
      elevation_gain_m === undefined ||
      (elevation_gain_m !== null && (!Number.isInteger(elevation_gain_m) || elevation_gain_m < 0 || elevation_gain_m > 30000))
    ) {
      problem = 'Dénivelé positif : un nombre entier de mètres.'
    }
    setFormError(problem)
    if (problem) return
    const values = {
      name: name.trim(),
      race_on: date,
      priority,
      distance_km: distance_km ?? null,
      elevation_gain_m: elevation_gain_m ?? null,
      notes: notes.trim(),
    }
    try {
      await save.mutateAsync(race ? { id: race.id, patch: values } : { values: { ...values, athlete_id: athleteId } })
      onClose()
    } catch (error) {
      setFormError(errorMessage(error))
    }
  }

  const deleteRace = async () => {
    if (!race || !window.confirm(`Supprimer « ${race.name} » ?`)) return
    try {
      await remove.mutateAsync(race.id)
      onClose()
    } catch (error) {
      setFormError(errorMessage(error))
    }
  }

  return (
    <Modal
      title={race ? 'Modifier la course' : 'Nouvelle course'}
      onClose={onClose}
      footer={
        <>
          {race && (
            <Button variant="danger" className="mr-auto" onClick={deleteRace} busy={remove.isPending}>
              Supprimer
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" form="race-form" busy={save.isPending}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form id="race-form" onSubmit={submit} className="space-y-4" noValidate>
        <TextField
          label="Course ou objectif"
          value={name}
          maxLength={120}
          placeholder="Marathon de Paris"
          onChange={(event) => setName(event.target.value)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            hint={isIsoDate(date) ? formatLongDay(date) : undefined}
          />
          <SelectField
            label="Priorité"
            value={priority}
            onChange={(event) => setPriority(event.target.value as RacePriority)}
            hint={RACE_PRIORITIES[priority].description}
          >
            {(Object.keys(RACE_PRIORITIES) as RacePriority[]).map((key) => (
              <option key={key} value={key}>
                {key} · {RACE_PRIORITIES[key].description}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Distance (km)"
            inputMode="decimal"
            value={distance}
            placeholder="42,195"
            onChange={(event) => setDistance(event.target.value)}
          />
          <TextField
            label="Dénivelé positif (m)"
            inputMode="numeric"
            value={elevation}
            placeholder="0"
            onChange={(event) => setElevation(event.target.value)}
          />
        </div>
        <TextAreaField
          label="Notes"
          value={notes}
          maxLength={2000}
          placeholder="Objectif de temps, ravitaillements…"
          onChange={(event) => setNotes(event.target.value)}
        />
        {formError && <Alert tone="error">{formError}</Alert>}
      </form>
    </Modal>
  )
}

/** Liste des courses à venir, avec ajout et modification. */
export function RaceList({ races, today, onEdit }: { races: Race[]; today: IsoDate; onEdit: (race: Race) => void }) {
  if (races.length === 0) return <p className="text-sm text-slate-600">Aucune course prévue.</p>
  return (
    <ul className="divide-y divide-slate-100">
      {races.map((race) => (
        <li key={race.id}>
          <button
            type="button"
            onClick={() => onEdit(race)}
            className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-slate-50"
          >
            <PriorityBadge priority={race.priority} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-slate-900">{race.name}</span>
              <span className="block text-sm text-slate-600">
                {[formatLongDay(race.race_on), formatRaceDetails(race)].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className="shrink-0 text-xs font-medium text-slate-500">{formatRelativeDays(today, race.race_on)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
