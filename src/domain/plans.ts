/**
 * Offres des coachs : le nombre d'athlètes actifs qu'un coach peut suivre.
 * Les mêmes limites sont dans la base (plan_athlete_limit, migration 20261118090000) :
 * tests/db/offres.test.ts vérifie que les deux disent la même chose.
 */

export type PlanCode = 'decouverte' | 'solo' | 'pro' | 'club' | 'fondateur'

export type Plan = {
  code: PlanCode
  name: string
  /** Athlètes actifs au plus ; null : sans limite. */
  athleteLimit: number | null
  /** Prix mensuel en euros ; 0 : gratuit ; null : pas encore annoncé. */
  monthlyPrice: number | null
  /** Proposée sur la page publique des offres. */
  listed: boolean
  summary: string
}

export const PLANS: Record<PlanCode, Plan> = {
  decouverte: {
    code: 'decouverte',
    name: 'Découverte',
    athleteLimit: 3,
    monthlyPrice: 0,
    listed: true,
    summary: 'Pour démarrer, ou pour entraîner quelques proches. Toutes les fonctions, sans limite de durée.',
  },
  solo: {
    code: 'solo',
    name: 'Solo',
    athleteLimit: 10,
    monthlyPrice: null,
    listed: true,
    summary: 'Pour le coach indépendant qui suit un petit groupe.',
  },
  pro: {
    code: 'pro',
    name: 'Pro',
    athleteLimit: 30,
    monthlyPrice: null,
    listed: true,
    summary: 'Pour le coach dont c’est l’activité principale.',
  },
  club: {
    code: 'club',
    name: 'Club',
    athleteLimit: 100,
    monthlyPrice: null,
    listed: true,
    summary: 'Pour un club ou une structure de coaching.',
  },
  fondateur: {
    code: 'fondateur',
    name: 'Fondateur',
    athleteLimit: null,
    monthlyPrice: 0,
    listed: false,
    summary: 'Coachs présents depuis le début : aucune limite.',
  },
}

/** Offre de départ d'un nouveau coach. */
export const DEFAULT_PLAN: PlanCode = 'decouverte'

export const LISTED_PLANS: Plan[] = Object.values(PLANS).filter((plan) => plan.listed)

export function planOf(code: string | null | undefined): Plan {
  return code && code in PLANS ? PLANS[code as PlanCode] : PLANS[DEFAULT_PLAN]
}

export type PlanUsage = {
  plan: Plan
  active: number
  /** Places restantes ; null : sans limite. */
  remaining: number | null
  full: boolean
  /** Dernière place, ou déjà complet : le moment de parler de l'offre suivante. */
  nearLimit: boolean
}

/** Où en est un coach par rapport à son offre. */
export function planUsage(code: string | null | undefined, activeAthletes: number): PlanUsage {
  const plan = planOf(code)
  if (plan.athleteLimit === null) return { plan, active: activeAthletes, remaining: null, full: false, nearLimit: false }
  const remaining = Math.max(0, plan.athleteLimit - activeAthletes)
  return { plan, active: activeAthletes, remaining, full: remaining === 0, nearLimit: remaining <= 1 }
}

/** Première offre proposée qui accueille plus d'athlètes que l'offre actuelle. */
export function nextPlan(code: string | null | undefined): Plan | null {
  const current = planOf(code)
  if (current.athleteLimit === null) return null
  const limit = current.athleteLimit
  return (
    LISTED_PLANS.filter((plan) => plan.athleteLimit !== null && plan.athleteLimit > limit).sort(
      (a, b) => (a.athleteLimit ?? 0) - (b.athleteLimit ?? 0),
    )[0] ?? null
  )
}

/** « Gratuit », « 9 € / mois », ou « Tarif annoncé prochainement ». */
export function formatPlanPrice(plan: Plan): string {
  if (plan.monthlyPrice === null) return 'Tarif annoncé prochainement'
  if (plan.monthlyPrice === 0) return 'Gratuit'
  return `${String(plan.monthlyPrice).replace('.', ',')} € / mois`
}

/** « Jusqu'à 3 athlètes » ou « Athlètes illimités ». */
export function formatPlanLimit(plan: Plan): string {
  return plan.athleteLimit === null ? 'Athlètes illimités' : `Jusqu’à ${plan.athleteLimit} athlètes`
}

/** « 2 athlètes sur 3 » (ou « 12 athlètes » sans limite). */
export function formatUsage(usage: PlanUsage): string {
  const athletes = `${usage.active} athlète${usage.active > 1 ? 's' : ''}`
  return usage.plan.athleteLimit === null ? athletes : `${athletes} sur ${usage.plan.athleteLimit}`
}
