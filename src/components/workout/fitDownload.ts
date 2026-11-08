import { type ZoneTargetMode, encodeWorkoutFit, fitFileName } from '../../domain/fit.ts'
import type { WorkoutItem, WorkoutKind } from '../../domain/workouts.ts'
import type { HrZone } from '../../domain/zones.ts'

/** Télécharge la séance en fichier .FIT. */
export function downloadFit(
  workout: { title: string; kind: WorkoutKind; steps: WorkoutItem[]; scheduled_on: string },
  zones: HrZone[],
  mode: ZoneTargetMode,
) {
  const bytes = encodeWorkoutFit(workout, zones, { mode })
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.ant.fit' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fitFileName(workout.scheduled_on, workout.title)
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
