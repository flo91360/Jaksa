import { useState } from 'react'
import { type ZoneDraft, draftsToZones, zoneToDraft } from '../domain/drafts.ts'
import {
  type HrZone,
  MAX_ZONES,
  type Physiology,
  ZONE_METHODS,
  type ZoneErrors,
  type ZoneField,
  type ZoneMethod,
  computeZones,
  emptyZone,
  hasZoneErrors,
  missingForMethod,
} from '../domain/zones.ts'
import { errorMessage } from '../lib/errors.ts'
import { Alert, Button, SavedHint, SelectField } from './ui.tsx'
import { zoneBadgeClass } from './zoneColors.ts'

const COLUMNS: { field: ZoneField; label: string; placeholder: string; inputMode: 'text' | 'numeric' }[] = [
  { field: 'hr_min', label: 'FC min', placeholder: '130', inputMode: 'numeric' },
  { field: 'hr_max', label: 'FC max', placeholder: '145', inputMode: 'numeric' },
  { field: 'pace_fast', label: 'Allure rapide', placeholder: '5:40', inputMode: 'text' },
  { field: 'pace_slow', label: 'Allure lente', placeholder: '6:20', inputMode: 'text' },
]

const GRID = 'md:grid-cols-[2.75rem_minmax(8rem,1fr)_5.5rem_5.5rem_6.5rem_6.5rem_2.75rem]'

type Props = {
  zones: HrZone[]
  physiology: Physiology
  onSave: (zones: HrZone[]) => Promise<unknown>
}

/**
 * Zones FC du coach : calcul automatique à partir de la physiologie, puis
 * saisie des allures correspondantes (le coach les déduit de la FC).
 */
export function ZoneEditor({ zones, physiology, onSave }: Props) {
  const [drafts, setDrafts] = useState<ZoneDraft[]>(() => zones.map(zoneToDraft))
  const [errors, setErrors] = useState<ZoneErrors>({})
  const [method, setMethod] = useState<ZoneMethod>('pct_hr_reserve')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const missing = missingForMethod(method, physiology)

  const change = (next: ZoneDraft[]) => {
    setDrafts(next)
    setDirty(true)
    setSaved(false)
  }

  const updateField = (index: number, field: ZoneField, value: string) => {
    change(drafts.map((draft, i) => (i === index ? { ...draft, [field]: value } : draft)))
  }

  const generate = () => {
    const current = draftsToZones(drafts).zones
    if (
      drafts.length > 0 &&
      !window.confirm('Recalculer les FC des zones ? Les noms et les allures déjà saisis sont conservés.')
    ) {
      return
    }
    change(computeZones(method, physiology, current).map(zoneToDraft))
    setErrors({})
  }

  const save = async () => {
    const result = draftsToZones(drafts)
    setErrors(result.errors)
    if (hasZoneErrors(result.errors)) return
    setSaving(true)
    setSaveError(null)
    try {
      await onSave(result.zones)
      setDrafts(result.zones.map(zoneToDraft))
      setDirty(false)
      setSaved(true)
    } catch (error) {
      setSaveError(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <SelectField
            label="Méthode de calcul des FC"
            value={method}
            onChange={(event) => setMethod(event.target.value as ZoneMethod)}
            hint={missing.length > 0 ? `À renseigner d'abord : ${missing.join(', ')}` : ZONE_METHODS[method].description}
          >
            {(Object.keys(ZONE_METHODS) as ZoneMethod[]).map((key) => (
              <option key={key} value={key}>
                {ZONE_METHODS[key].label}
              </option>
            ))}
          </SelectField>
        </div>
        <Button variant="secondary" onClick={generate} disabled={missing.length > 0} className="sm:mb-5">
          Calculer les zones FC
        </Button>
      </div>

      {drafts.length > 0 && (
        <div className="space-y-3">
          <div className={`hidden gap-2 px-1 text-xs font-medium tracking-wide text-slate-500 uppercase md:grid ${GRID}`}>
            <span>Zone</span>
            <span>Nom</span>
            {COLUMNS.map((column) => (
              <span key={column.field}>{column.label}</span>
            ))}
            <span className="sr-only">Supprimer</span>
          </div>
          {drafts.map((draft, index) => (
            <ZoneRow
              key={index}
              index={index}
              draft={draft}
              errors={errors[index] ?? {}}
              onChange={(field, value) => updateField(index, field, value)}
              onRemove={() => change(drafts.filter((_, i) => i !== index))}
            />
          ))}
        </div>
      )}

      {drafts.length === 0 && (
        <p className="text-sm text-slate-600">
          Aucune zone pour l’instant : calcule-les à partir de la physiologie, ou ajoute-les une par une.
        </p>
      )}

      {saveError && <Alert tone="error">{saveError}</Alert>}
      {hasZoneErrors(errors) && <Alert tone="error">Corrige les champs en rouge avant d’enregistrer.</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          onClick={() => change([...drafts, zoneToDraft(emptyZone(drafts.length + 1))])}
          disabled={drafts.length >= MAX_ZONES}
        >
          + Ajouter une zone
        </Button>
        <div className="flex-1" />
        <SavedHint show={saved && !dirty} />
        <Button onClick={save} busy={saving} disabled={!dirty}>
          Enregistrer les zones
        </Button>
      </div>
      <p className="text-xs text-slate-500">
        Allures en minutes:secondes au kilomètre (ex. 5:40). En trail, elles peuvent rester vides : seule la FC compte.
      </p>
    </div>
  )
}

function ZoneRow({
  index,
  draft,
  errors,
  onChange,
  onRemove,
}: {
  index: number
  draft: ZoneDraft
  errors: Partial<Record<ZoneField, string>>
  onChange: (field: ZoneField, value: string) => void
  onRemove: () => void
}) {
  const zoneNumber = index + 1
  return (
    <fieldset className={`grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3 md:items-start md:border-0 md:p-1 ${GRID}`}>
      <legend className="sr-only">Zone {zoneNumber}</legend>
      {/* Sur mobile, pastille et nom partagent la première ligne ; sur ordinateur, chacun sa colonne. */}
      <div className="col-span-2 flex items-start gap-2 md:contents">
        <span
          className={`inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${zoneBadgeClass(zoneNumber)}`}
          aria-hidden="true"
        >
          Z{zoneNumber}
        </span>
        <ZoneInput
          label={`Nom de la zone ${zoneNumber}`}
          value={draft.name}
          error={errors.name}
          onChange={(value) => onChange('name', value)}
          placeholder="Endurance fondamentale"
          className="flex-1"
        />
      </div>
      {COLUMNS.map((column) => (
        <ZoneInput
          key={column.field}
          label={column.label}
          visibleLabel={column.label}
          value={draft[column.field]}
          error={errors[column.field]}
          inputMode={column.inputMode}
          placeholder={column.placeholder}
          onChange={(value) => onChange(column.field, value)}
        />
      ))}
      <button
        type="button"
        onClick={onRemove}
        className="col-span-2 inline-flex min-h-11 items-center justify-center rounded-lg text-sm text-slate-500 hover:bg-red-50 hover:text-red-700 md:col-span-1"
        aria-label={`Supprimer la zone ${zoneNumber}`}
      >
        <span aria-hidden="true" className="hidden md:inline">
          ✕
        </span>
        <span className="md:hidden">Supprimer la zone</span>
      </button>
    </fieldset>
  )
}

function ZoneInput({
  label,
  visibleLabel,
  value,
  error,
  onChange,
  placeholder,
  inputMode = 'text',
  className = '',
}: {
  label: string
  visibleLabel?: string
  value: string
  error?: string
  onChange: (value: string) => void
  placeholder: string
  inputMode?: 'text' | 'numeric'
  className?: string
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className={visibleLabel ? 'mb-1 block text-xs font-medium text-slate-500 md:sr-only' : 'sr-only'}>
        {visibleLabel ?? label}
      </span>
      {visibleLabel && <span className="sr-only">{label}</span>}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode={inputMode}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        className={`block min-h-11 w-full rounded-lg border bg-white px-2.5 py-2 text-base shadow-sm placeholder:text-slate-300 focus:outline-2 focus:outline-emerald-600 sm:text-sm ${error ? 'border-red-400' : 'border-slate-300'}`}
      />
      {error && <span className="mt-1 block text-xs font-medium text-red-700">{error}</span>}
    </label>
  )
}
