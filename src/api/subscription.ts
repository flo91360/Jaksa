import { useQuery } from '@tanstack/react-query'
import { type PlanUsage, planUsage } from '../domain/plans.ts'
import { supabase } from '../lib/supabase.ts'
import { isMissingRelation } from './exchanges.ts'
import { useCoachAthletes } from './athletes.ts'

/** Offre du coach connecté (« fondateur » tant que la base ne connaît pas encore les offres). */
export function useMyPlan(coachId: string) {
  return useQuery({
    queryKey: ['coach-subscription', coachId],
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.from('coach_subscriptions').select('plan').eq('coach_id', coachId).maybeSingle()
      if (error) {
        if (isMissingRelation(error)) return 'fondateur'
        throw error
      }
      return data?.plan ?? 'decouverte'
    },
  })
}

/** Où en est le coach par rapport à son offre (rien tant que les deux lectures ne sont pas finies). */
export function usePlanUsage(coachId: string): PlanUsage | undefined {
  const plan = useMyPlan(coachId)
  const athletes = useCoachAthletes(coachId)
  if (!plan.data || !athletes.data) return undefined
  return planUsage(plan.data, athletes.data.filter((link) => link.status === 'active').length)
}
