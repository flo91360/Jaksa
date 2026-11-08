import { useState } from 'react'
import {
  STEP_KINDS,
  WORKOUT_KINDS,
  type WorkoutItem,
  type WorkoutKind,
  type WorkoutStep,
  describeTargetValues,
  formatStepDuration,
  formatTotals,
  resolveTarget,
  workoutTotals,
} from '../../domain/workouts.ts'
import type { HrZone } from '../../domain/zones.ts'
import { Button } from '../ui.tsx'
import { zoneBadgeClass } from '../zoneColors.ts'
import { downloadFit } from './fitDownload.ts'
import { KIND_STYLES } from './kindStyles.ts'

type ViewableWorkout = { title: string; kind: WorkoutKind; description: string; steps: WorkoutItem[] }

/** Détail d'une séance, cibles traduites en FC et en allure (vue de l'athlète, aperçu du coach). */
export function WorkoutView({ workout, zones }: { workout: ViewableWorkout; zones: HrZone[] }) {
  const totals = formatTotals(workoutTotals(workout.steps, zones))
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <span className={`size-2.5 rounded-full ${KIND_STYLES[workout.kind].dot}`} aria-hidden="true" />
          {WORKOUT_KINDS[workout.kind]}
        </span>
        {totals && <span>Estimation : {totals}</span>}
      </div>
      {workout.description.trim() && (
        <p className="text-sm whitespace-pre-line text-slate-800">{workout.description}</p>
      )}
      {workout.steps.length > 0 && (
        <ol className="space-y-2">
          {workout.steps.map((item, index) =>
            item.type === 'step' ? (
              <li key={index}>
                <StepLine step={item} zones={zones} />
              </li>
            ) : (
              <li key={index} className="rounded-xl border-2 border-slate-200 p-2">
                <p className="px-1 pb-1 text-sm font-bold text-slate-900">{item.count} fois</p>
                <ol className="space-y-1.5">
                  {item.steps.map((step, stepIndex) => (
                    <li key={stepIndex}>
                      <StepLine step={step} zones={zones} />
                    </li>
                  ))}
                </ol>
              </li>
            ),
          )}
        </ol>
      )}
    </div>
  )
}

function StepLine({ step, zones }: { step: WorkoutStep; zones: HrZone[] }) {
  const resolved = resolveTarget(step.target, zones)
  const values = step.target.type === 'zone' ? describeTargetValues(resolved) : ''
  return (
    <div className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-2">
      {step.target.type === 'zone' ? (
        <span
          className={`mt-0.5 inline-flex h-7 min-w-9 shrink-0 items-center justify-center rounded-md text-xs font-bold ${zoneBadgeClass(step.target.zone)}`}
        >
          Z{step.target.zone}
        </span>
      ) : (
        <span className="mt-0.5 inline-flex h-7 min-w-9 shrink-0 items-center justify-center rounded-md bg-slate-200 text-xs font-bold text-slate-600">
          {step.target.type === 'pace' ? '/km' : step.target.type === 'hr' ? '♥' : '—'}
        </span>
      )}
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-slate-900">
          {formatStepDuration(step.duration)} · {STEP_KINDS[step.kind].toLowerCase()}
          {step.target.type !== 'none' && step.target.type !== 'zone' && (
            <span className="font-normal text-slate-700"> · {resolved.label}</span>
          )}
        </p>
        {values && <p className="text-slate-700">{values}</p>}
        {step.note && <p className="text-slate-500 italic">{step.note}</p>}
      </div>
    </div>
  )
}

/** Export .FIT, en attendant l'envoi automatique par Garmin (0.4.0). */
export function FitExport({
  workout,
  zones,
}: {
  workout: { title: string; kind: WorkoutKind; steps: WorkoutItem[]; scheduled_on: string }
  zones: HrZone[]
}) {
  const [help, setHelp] = useState(false)
  if (workout.steps.length === 0 || (workout.kind !== 'run' && workout.kind !== 'trail')) return null
  const usesZones = workout.steps.some((item) =>
    item.type === 'step' ? item.target.type === 'zone' : item.steps.some((s) => s.target.type === 'zone'),
  )
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => downloadFit(workout, zones, 'pace')}>
          Montre : fichier .FIT{usesZones ? ' (allures)' : ''}
        </Button>
        {usesZones && (
          <Button variant="ghost" onClick={() => downloadFit(workout, zones, 'hr')}>
            .FIT avec cibles en FC
          </Button>
        )}
        <button
          type="button"
          className="min-h-11 text-sm font-medium text-emerald-800 hover:underline"
          aria-expanded={help}
          onClick={() => setHelp(!help)}
        >
          Comment faire ?
        </button>
      </div>
      {help && (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>Télécharge le fichier sur un ordinateur.</li>
          <li>Branche ta montre Garmin en USB : elle apparaît comme une clé.</li>
          <li>
            Copie le fichier dans le dossier <code className="rounded bg-slate-100 px-1">GARMIN/NewFiles</code>.
          </li>
          <li>Débranche la montre : la séance est dans Entraînement → Entraînements.</li>
        </ol>
      )}
    </div>
  )
}
