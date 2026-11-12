import { describe, expect, it } from 'vitest'
import { LISTED_PLANS, PLANS, formatPlanLimit, formatPlanPrice, formatUsage, nextPlan, planOf, planUsage } from './plans.ts'

describe('offres', () => {
  it('propose les offres publiques par taille croissante, sans l’offre fondateur', () => {
    expect(LISTED_PLANS.map((plan) => plan.code)).toEqual(['decouverte', 'solo', 'pro', 'club'])
    const limits = LISTED_PLANS.map((plan) => plan.athleteLimit ?? Infinity)
    expect([...limits].sort((a, b) => a - b)).toEqual(limits)
  })

  it('retombe sur l’offre de départ pour un code inconnu ou absent', () => {
    expect(planOf('inconnue').code).toBe('decouverte')
    expect(planOf(null).code).toBe('decouverte')
    expect(planOf('pro').code).toBe('pro')
  })
})

describe('planUsage', () => {
  it('compte les places restantes', () => {
    expect(planUsage('decouverte', 1)).toMatchObject({ remaining: 2, full: false, nearLimit: false })
    expect(planUsage('decouverte', 2)).toMatchObject({ remaining: 1, full: false, nearLimit: true })
    expect(planUsage('decouverte', 3)).toMatchObject({ remaining: 0, full: true, nearLimit: true })
  })

  it('ne descend pas sous zéro si le coach dépasse déjà (offre réduite après coup)', () => {
    expect(planUsage('decouverte', 5)).toMatchObject({ remaining: 0, full: true })
  })

  it('n’a jamais de limite pour un coach fondateur', () => {
    expect(planUsage('fondateur', 250)).toMatchObject({ remaining: null, full: false, nearLimit: false })
  })
})

describe('nextPlan', () => {
  it('donne l’offre juste au-dessus', () => {
    expect(nextPlan('decouverte')?.code).toBe('solo')
    expect(nextPlan('solo')?.code).toBe('pro')
    expect(nextPlan('club')).toBeNull()
    expect(nextPlan('fondateur')).toBeNull()
  })
})

describe('affichage', () => {
  it('formate le prix, la limite et l’usage', () => {
    expect(formatPlanPrice(PLANS.decouverte)).toBe('Gratuit')
    expect(formatPlanPrice(PLANS.solo)).toBe('Tarif annoncé prochainement')
    expect(formatPlanPrice({ ...PLANS.solo, monthlyPrice: 9 })).toBe('9 € / mois')
    expect(formatPlanPrice({ ...PLANS.solo, monthlyPrice: 9.5 })).toBe('9,5 € / mois')
    expect(formatPlanLimit(PLANS.decouverte)).toBe('Jusqu’à 3 athlètes')
    expect(formatPlanLimit(PLANS.fondateur)).toBe('Athlètes illimités')
    expect(formatUsage(planUsage('decouverte', 1))).toBe('1 athlète sur 3')
    expect(formatUsage(planUsage('fondateur', 12))).toBe('12 athlètes')
  })
})
