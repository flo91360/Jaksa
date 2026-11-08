import { type IsoDate, addDays, daysBetween, startOfWeek } from './calendar.ts'
import type { WorkoutItem, WorkoutKind } from './workouts.ts'

/** Ce qui définit une séance planifiée (sans les identifiants techniques). */
export type WorkoutContent = {
  kind: WorkoutKind
  title: string
  description: string
  steps: WorkoutItem[]
}

export type PlannedWorkoutDraft = WorkoutContent & {
  athlete_id: string
  scheduled_on: IsoDate
  position: number
}

type Placed = { athlete_id: string; scheduled_on: IsoDate; position: number }

/** Position à donner à une séance ajoutée en fin de journée. */
export function nextPosition(existing: Placed[], athleteId: string, date: IsoDate): number {
  const sameDay = existing.filter((w) => w.athlete_id === athleteId && w.scheduled_on === date)
  return sameDay.length === 0 ? 0 : Math.min(100, Math.max(...sameDay.map((w) => w.position)) + 1)
}

export function contentOf(source: WorkoutContent): WorkoutContent {
  return {
    kind: source.kind,
    title: source.title,
    description: source.description,
    steps: structuredClone(source.steps),
  }
}

/** Copie d'une séance vers un autre jour (et éventuellement un autre athlète). */
export function copyWorkout(
  source: WorkoutContent,
  target: { athleteId: string; date: IsoDate },
  existing: Placed[],
): PlannedWorkoutDraft {
  return {
    ...contentOf(source),
    athlete_id: target.athleteId,
    scheduled_on: target.date,
    position: nextPosition(existing, target.athleteId, target.date),
  }
}

/**
 * Duplique les séances de la semaine de `fromWeek` vers la semaine de
 * `toWeek`, jour pour jour. Les séances déjà présentes dans la semaine cible
 * sont conservées : les copies se placent après elles.
 */
export function duplicateWeek(
  workouts: (WorkoutContent & Placed)[],
  athleteId: string,
  fromWeek: IsoDate,
  toWeek: IsoDate,
): PlannedWorkoutDraft[] {
  const from = startOfWeek(fromWeek)
  const to = startOfWeek(toWeek)
  const offset = daysBetween(from, to)
  if (offset === 0) return []
  const end = addDays(from, 6)
  const source = workouts
    .filter((w) => w.athlete_id === athleteId && w.scheduled_on >= from && w.scheduled_on <= end)
    .sort((a, b) => a.scheduled_on.localeCompare(b.scheduled_on) || a.position - b.position)

  const placed: Placed[] = workouts.filter((w) => w.athlete_id === athleteId)
  const drafts: PlannedWorkoutDraft[] = []
  for (const workout of source) {
    const draft = copyWorkout(workout, { athleteId, date: addDays(workout.scheduled_on, offset) }, placed)
    placed.push(draft)
    drafts.push(draft)
  }
  return drafts
}

/** Regroupe des éléments datés par jour, triés par position. */
export function groupByDate<T extends object>(items: T[], dateOf: (item: T) => IsoDate): Map<IsoDate, T[]> {
  const positionOf = (item: T) => ('position' in item && typeof item.position === 'number' ? item.position : 0)
  const map = new Map<IsoDate, T[]>()
  for (const item of items) {
    const date = dateOf(item)
    const list = map.get(date)
    if (list) list.push(item)
    else map.set(date, [item])
  }
  for (const list of map.values()) list.sort((a, b) => positionOf(a) - positionOf(b))
  return map
}

export type RacePriority = 'A' | 'B' | 'C'

const raceNumber = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 })

/** « 42,195 km · 120 m D+ ». */
export function formatRaceDetails(race: { distance_km: number | null; elevation_gain_m: number | null }): string {
  return [
    race.distance_km === null ? '' : `${raceNumber.format(race.distance_km)} km`,
    race.elevation_gain_m === null ? '' : `${raceNumber.format(race.elevation_gain_m)} m D+`,
  ]
    .filter(Boolean)
    .join(' · ')
}

export const RACE_PRIORITIES: Record<RacePriority, { label: string; description: string }> = {
  A: { label: 'A', description: 'Objectif principal de la saison' },
  B: { label: 'B', description: 'Course importante, préparée' },
  C: { label: 'C', description: 'Course de préparation' },
}

/** Prochaine course (aujourd'hui compris), en privilégiant la date la plus proche. */
export function nextRace<T extends { race_on: IsoDate }>(races: T[], today: IsoDate): T | null {
  return races.filter((race) => race.race_on >= today).sort((a, b) => a.race_on.localeCompare(b.race_on))[0] ?? null
}
