import { useUserId } from '../auth/auth-context.ts'
import type { UserRole } from '../lib/database.types.ts'
import { useCoachAthletes, useMyCoaches } from './athletes.ts'
import { useMyProfile } from './profile.ts'

/** Noms du coach et des athlètes visibles par l'utilisateur, par identifiant. */
export function useExchangeNames(role: UserRole | undefined): Record<string, string> {
  const meId = useUserId()
  const me = useMyProfile()
  const coaches = useMyCoaches(meId)
  const athletes = useCoachAthletes(meId)
  const names: Record<string, string> = {}
  if (me.data) names[me.data.id] = me.data.full_name
  if (role === 'athlete') for (const c of coaches.data ?? []) names[c.coach_id] = c.coach_name
  if (role === 'coach') for (const a of athletes.data ?? []) names[a.athlete_id] = a.athlete_name || a.athlete_email
  return names
}
