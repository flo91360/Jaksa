import type { WorkoutItem, WorkoutStep } from '../../domain/workouts.ts'

/** Élément en cours d'édition : une clé stable pour React, retirée à l'enregistrement. */
export type EditableItem = WorkoutItem & { uid: string }

let uidCounter = 0
const nextUid = () => `item-${++uidCounter}`

export type Keyed<T> = T & { uid?: string }

export const withUid = <T extends object>(value: T): Keyed<T> => ({ ...value, uid: nextUid() })

function stripUid<T extends object>(value: Keyed<T>): T {
  const { uid: _uid, ...rest } = value
  return rest as T
}

export function toEditable(items: WorkoutItem[]): EditableItem[] {
  return structuredClone(items).map((item) =>
    item.type === 'repeat' ? { ...item, steps: item.steps.map(withUid), uid: nextUid() } : { ...item, uid: nextUid() },
  )
}

export function fromEditable(items: EditableItem[]): WorkoutItem[] {
  return items.map((item) => {
    const clean = stripUid<WorkoutItem>(item)
    return clean.type === 'repeat' ? { ...clean, steps: clean.steps.map((step) => stripUid<WorkoutStep>(step)) } : clean
  })
}

