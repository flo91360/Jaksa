import type { WorkoutKind } from '../../domain/workouts.ts'

/** Couleur par type de séance (bordure des cartes, pastilles du mois). */
export const KIND_STYLES: Record<WorkoutKind, { card: string; dot: string }> = {
  run: { card: 'border-l-emerald-500', dot: 'bg-emerald-500' },
  trail: { card: 'border-l-amber-600', dot: 'bg-amber-600' },
  strength: { card: 'border-l-violet-500', dot: 'bg-violet-500' },
  cross: { card: 'border-l-sky-500', dot: 'bg-sky-500' },
  rest: { card: 'border-l-slate-300', dot: 'bg-slate-300' },
}
