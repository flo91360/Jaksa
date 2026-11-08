import { useState } from 'react'
import { formatPace, parsePace } from '../../domain/pace.ts'
import {
  LIMITS,
  STEP_KINDS,
  STEP_PRESETS,
  type StepDuration,
  type StepKind,
  type StepTarget,
  type WorkoutItem,
  type WorkoutStep,
  describeTargetValues,
  distanceInput,
  durationInput,
  parseDistance,
  parseDuration,
  resolveTarget,
  stepError,
} from '../../domain/workouts.ts'
import type { HrZone } from '../../domain/zones.ts'
import { zoneBadgeClass } from '../zoneColors.ts'
import { type EditableItem, type Keyed, toEditable, withUid } from './editable.ts'

/**
 * Constructeur de séances : étapes (échauffement, effort, récupération,
 * retour au calme) et blocs répétés. Chaque cible en zone est traduite en FC
 * et en allure d'après les zones de l'athlète.
 */

const stepKey = (step: Keyed<WorkoutStep>, fallback: string) => step.uid ?? fallback

const KIND_ACCENTS: Record<StepKind, string> = {
  warmup: 'border-l-sky-400',
  active: 'border-l-orange-500',
  recovery: 'border-l-emerald-400',
  rest: 'border-l-slate-300',
  cooldown: 'border-l-sky-300',
}

const SMALL_FIELD =
  'block min-h-11 rounded-lg border bg-white px-2.5 py-2 text-base text-slate-900 focus:outline-2 focus:outline-emerald-600 sm:text-sm'

type Props = {
  items: EditableItem[]
  onChange: (items: EditableItem[]) => void
  zones: HrZone[]
}

export function StepBuilder({ items, onChange, zones }: Props) {
  const zoneCount = Math.max(5, zones.length)

  const replace = (index: number, item: EditableItem) => onChange(items.map((it, i) => (i === index ? item : it)))
  const remove = (index: number) => onChange(items.filter((_, i) => i !== index))
  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= items.length) return
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  const add = (item: WorkoutItem) => onChange([...items, ...toEditable([item])])

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-600">
          Pas encore d’étape : ajoute un échauffement, un bloc répété… ou laisse la consigne libre.
        </p>
      )}

      <ol className="space-y-3">
        {items.map((item, index) => (
          <li key={item.uid}>
            {item.type === 'step' ? (
              <StepRow
                step={item}
                zones={zones}
                zoneCount={zoneCount}
                onChange={(step) => replace(index, { ...step, uid: item.uid })}
                controls={<RowControls index={index} count={items.length} onMove={move} onRemove={remove} />}
              />
            ) : (
              <div className="rounded-xl border-2 border-slate-300 bg-slate-50 p-3">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    Répéter
                    <input
                      type="number"
                      min={1}
                      max={LIMITS.repeatCount}
                      inputMode="numeric"
                      value={item.count}
                      onChange={(event) =>
                        replace(index, {
                          ...item,
                          count: Math.min(LIMITS.repeatCount, Math.max(1, Math.round(Number(event.target.value) || 1))),
                        })
                      }
                      className={`${SMALL_FIELD} w-20 border-slate-300`}
                    />
                    fois
                  </label>
                  <span className="flex-1" />
                  <RowControls index={index} count={items.length} onMove={move} onRemove={remove} />
                </div>
                <ol className="space-y-2">
                  {item.steps.map((step, stepIndex) => (
                    <li key={stepKey(step, `${item.uid}-${stepIndex}`)}>
                      <StepRow
                        step={step}
                        zones={zones}
                        zoneCount={zoneCount}
                        onChange={(next) =>
                          replace(index, { ...item, steps: item.steps.map((s, i) => (i === stepIndex ? next : s)) })
                        }
                        controls={
                          <RowControls
                            index={stepIndex}
                            count={item.steps.length}
                            onMove={(i, delta) => {
                              const target = i + delta
                              if (target < 0 || target >= item.steps.length) return
                              const steps = [...item.steps]
                              ;[steps[i], steps[target]] = [steps[target], steps[i]]
                              replace(index, { ...item, steps })
                            }}
                            onRemove={(i) =>
                              item.steps.length === 1
                                ? remove(index)
                                : replace(index, { ...item, steps: item.steps.filter((_, j) => j !== i) })
                            }
                          />
                        }
                      />
                    </li>
                  ))}
                </ol>
                {item.steps.length < LIMITS.repeatSteps && (
                  <button
                    type="button"
                    onClick={() => replace(index, { ...item, steps: [...item.steps, withUid(STEP_PRESETS.recovery())] })}
                    className="mt-2 min-h-11 text-sm font-medium text-emerald-800 hover:underline"
                  >
                    + Étape dans le bloc
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>

      {items.length < LIMITS.items && (
        <div className="flex flex-wrap gap-2">
          <AddButton onClick={() => add(STEP_PRESETS.warmup())}>Échauffement</AddButton>
          <AddButton onClick={() => add(STEP_PRESETS.repeat())}>Bloc répété</AddButton>
          <AddButton onClick={() => add(STEP_PRESETS.active())}>Effort</AddButton>
          <AddButton onClick={() => add(STEP_PRESETS.recovery())}>Récupération</AddButton>
          <AddButton onClick={() => add(STEP_PRESETS.cooldown())}>Retour au calme</AddButton>
        </div>
      )}
    </div>
  )
}

function AddButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center rounded-xl border border-dashed border-emerald-400 bg-emerald-50 px-3 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
    >
      + {children}
    </button>
  )
}

function RowControls({
  index,
  count,
  onMove,
  onRemove,
}: {
  index: number
  count: number
  onMove: (index: number, delta: number) => void
  onRemove: (index: number) => void
}) {
  const base = 'inline-flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200 disabled:opacity-30'
  return (
    <span className="flex shrink-0 items-center">
      <button type="button" className={base} disabled={index === 0} onClick={() => onMove(index, -1)} aria-label="Monter">
        ↑
      </button>
      <button
        type="button"
        className={base}
        disabled={index === count - 1}
        onClick={() => onMove(index, 1)}
        aria-label="Descendre"
      >
        ↓
      </button>
      <button type="button" className={`${base} hover:text-red-700`} onClick={() => onRemove(index)} aria-label="Supprimer">
        ✕
      </button>
    </span>
  )
}

function StepRow({
  step,
  zones,
  zoneCount,
  onChange,
  controls,
}: {
  step: WorkoutStep
  zones: HrZone[]
  zoneCount: number
  onChange: (step: WorkoutStep) => void
  controls: React.ReactNode
}) {
  const resolved = resolveTarget(step.target, zones)
  const values = step.target.type === 'zone' ? describeTargetValues(resolved) : ''
  const error = stepError(step)

  return (
    <div className={`rounded-xl border border-l-4 border-slate-200 bg-white p-3 ${KIND_ACCENTS[step.kind]}`}>
      <div className="flex flex-wrap items-start gap-2">
        <select
          aria-label="Type d’étape"
          value={step.kind}
          onChange={(event) => onChange({ ...step, kind: event.target.value as StepKind })}
          className={`${SMALL_FIELD} min-w-0 flex-1 border-slate-300 font-medium sm:w-52 sm:flex-none`}
        >
          {(Object.keys(STEP_KINDS) as StepKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {STEP_KINDS[kind]}
            </option>
          ))}
        </select>
        {controls}
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <DurationInput duration={step.duration} onChange={(duration) => onChange({ ...step, duration })} />
        <TargetInput
          target={step.target}
          zoneCount={zoneCount}
          zones={zones}
          onChange={(target) => onChange({ ...step, target })}
        />
      </div>

      {values && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-700">
          {step.target.type === 'zone' && (
            <span className={`rounded-md px-1.5 py-0.5 text-xs font-bold ${zoneBadgeClass(step.target.zone)}`}>
              Z{step.target.zone}
            </span>
          )}
          {values}
        </p>
      )}
      {step.target.type === 'zone' && !values && (
        <p className="mt-2 text-xs text-amber-800">Zone sans FC ni allure dans la fiche de l’athlète.</p>
      )}

      <input
        aria-label="Consigne de l’étape"
        value={step.note}
        maxLength={LIMITS.note}
        onChange={(event) => onChange({ ...step, note: event.target.value })}
        placeholder="Consigne (facultatif) : en côte, relâché…"
        className={`${SMALL_FIELD} mt-2 w-full border-slate-200`}
      />
      {error && <p className="mt-1 text-xs font-medium text-red-700">{error}</p>}
    </div>
  )
}

function DurationInput({ duration, onChange }: { duration: StepDuration; onChange: (d: StepDuration) => void }) {
  const format = (d: StepDuration) =>
    d.type === 'time' ? durationInput(d.seconds) : d.type === 'distance' ? distanceInput(d.meters) : ''
  const [text, setText] = useState(() => format(duration))
  const [invalid, setInvalid] = useState(false)

  const changeType = (type: StepDuration['type']) => {
    const next: StepDuration =
      type === 'time' ? { type, seconds: 600 } : type === 'distance' ? { type, meters: 1000 } : { type: 'open' }
    setText(format(next))
    setInvalid(false)
    onChange(next)
  }

  const changeText = (value: string) => {
    setText(value)
    if (duration.type === 'open') return
    const parsed = duration.type === 'time' ? parseDuration(value) : parseDistance(value)
    setInvalid(parsed === null)
    if (parsed === null) return
    onChange(duration.type === 'time' ? { type: 'time', seconds: parsed } : { type: 'distance', meters: parsed })
  }

  return (
    <div className="flex min-w-0 gap-2">
      <select
        aria-label="Durée ou distance"
        value={duration.type}
        onChange={(event) => changeType(event.target.value as StepDuration['type'])}
        className={`${SMALL_FIELD} w-28 shrink-0 border-slate-300`}
      >
        <option value="time">Durée</option>
        <option value="distance">Distance</option>
        <option value="open">Libre</option>
      </select>
      {duration.type !== 'open' && (
        <input
          aria-label={duration.type === 'time' ? 'Durée (min, min:s ou h:min:s)' : 'Distance (m ou km)'}
          aria-invalid={invalid || undefined}
          value={text}
          onChange={(event) => changeText(event.target.value)}
          onBlur={() => {
            setText(format(duration))
            setInvalid(false)
          }}
          placeholder={duration.type === 'time' ? '15 ou 1:30' : '400 m ou 2 km'}
          className={`${SMALL_FIELD} min-w-0 flex-1 ${invalid ? 'border-red-400' : 'border-slate-300'}`}
        />
      )}
    </div>
  )
}

function TargetInput({
  target,
  zones,
  zoneCount,
  onChange,
}: {
  target: StepTarget
  zones: HrZone[]
  zoneCount: number
  onChange: (t: StepTarget) => void
}) {
  const changeType = (type: StepTarget['type']) => {
    switch (type) {
      case 'none':
        return onChange({ type })
      case 'zone':
        return onChange({ type, zone: 2 })
      case 'pace':
        return onChange({ type, fast: 300, slow: 315 })
      case 'hr':
        return onChange({ type, min: 140, max: 150 })
    }
  }

  return (
    <div className="flex min-w-0 gap-2">
      <select
        aria-label="Type de cible"
        value={target.type}
        onChange={(event) => changeType(event.target.value as StepTarget['type'])}
        className={`${SMALL_FIELD} w-28 shrink-0 border-slate-300`}
      >
        <option value="zone">Zone</option>
        <option value="pace">Allure</option>
        <option value="hr">FC</option>
        <option value="none">Sans cible</option>
      </select>
      {target.type === 'zone' && (
        <select
          aria-label="Zone"
          value={target.zone}
          onChange={(event) => onChange({ type: 'zone', zone: Number(event.target.value) })}
          className={`${SMALL_FIELD} min-w-0 flex-1 border-slate-300`}
        >
          {Array.from({ length: zoneCount }, (_, i) => i + 1).map((zone) => (
            <option key={zone} value={zone}>
              Z{zone}
              {zones.find((z) => z.zone === zone)?.name ? ` · ${zones.find((z) => z.zone === zone)?.name}` : ''}
            </option>
          ))}
        </select>
      )}
      {target.type === 'pace' && (
        <RangeInputs
          labels={['Allure rapide', 'Allure lente']}
          values={[target.fast, target.slow]}
          format={formatPace}
          parse={parsePace}
          suffix="/km"
          onChange={([fast, slow]) => onChange({ type: 'pace', fast, slow })}
        />
      )}
      {target.type === 'hr' && (
        <RangeInputs
          labels={['FC basse', 'FC haute']}
          values={[target.min, target.max]}
          format={String}
          parse={(text) => (/^\d{2,3}$/.test(text.trim()) ? Number(text.trim()) : null)}
          suffix="bpm"
          onChange={([min, max]) => onChange({ type: 'hr', min, max })}
        />
      )}
    </div>
  )
}

function RangeInputs({
  labels,
  values,
  format,
  parse,
  suffix,
  onChange,
}: {
  labels: [string, string]
  values: [number, number]
  format: (value: number) => string
  parse: (text: string) => number | null
  suffix: string
  onChange: (values: [number, number]) => void
}) {
  const [texts, setTexts] = useState(() => values.map(format))
  const [invalid, setInvalid] = useState([false, false])

  const change = (index: 0 | 1, text: string) => {
    const nextTexts = [...texts]
    nextTexts[index] = text
    setTexts(nextTexts)
    const parsed = parse(text)
    const nextInvalid = [...invalid]
    nextInvalid[index] = parsed === null
    setInvalid(nextInvalid)
    if (parsed === null) return
    const next: [number, number] = [...values]
    next[index] = parsed
    onChange(next)
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      {([0, 1] as const).map((index) => (
        <input
          key={index}
          aria-label={labels[index]}
          aria-invalid={invalid[index] || undefined}
          inputMode={suffix === 'bpm' ? 'numeric' : 'text'}
          value={texts[index]}
          onChange={(event) => change(index, event.target.value)}
          onBlur={() => {
            setTexts(values.map(format))
            setInvalid([false, false])
          }}
          className={`${SMALL_FIELD} min-w-0 flex-1 text-center ${invalid[index] ? 'border-red-400' : 'border-slate-300'}`}
        />
      ))}
      <span className="shrink-0 text-xs text-slate-500">{suffix}</span>
    </div>
  )
}
