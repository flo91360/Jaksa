import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AthleteProfile, AthleteProfileUpdate, CoachLink, LinkStatus, Profile } from '../lib/database.types.ts'
import { supabase } from '../lib/supabase.ts'

const athleteProfileKey = (athleteId: string) => ['athlete-profile', athleteId] as const
const privateNoteKey = (athleteId: string) => ['private-note', athleteId] as const

/** Athlètes d'un coach (actifs et archivés), triés par nom. */
export function useCoachAthletes(coachId: string) {
  return useQuery({
    queryKey: ['coach-links', 'coach', coachId],
    queryFn: async (): Promise<CoachLink[]> => {
      const { data, error } = await supabase
        .from('coach_links')
        .select('*')
        .eq('coach_id', coachId)
        .order('athlete_name')
      if (error) throw error
      return data
    },
  })
}

/** Coachs d'un athlète. */
export function useMyCoaches(athleteId: string) {
  return useQuery({
    queryKey: ['coach-links', 'athlete', athleteId],
    queryFn: async (): Promise<CoachLink[]> => {
      const { data, error } = await supabase
        .from('coach_links')
        .select('*')
        .eq('athlete_id', athleteId)
        .eq('status', 'active')
      if (error) throw error
      return data
    },
  })
}

/** Lien coach ↔ athlète vu par le coach (null si l'athlète n'est pas le sien). */
export function useCoachLink(coachId: string, athleteId: string) {
  return useQuery({
    queryKey: ['coach-links', 'coach', coachId, athleteId],
    queryFn: async (): Promise<CoachLink | null> => {
      const { data, error } = await supabase
        .from('coach_links')
        .select('*')
        .eq('coach_id', coachId)
        .eq('athlete_id', athleteId)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useSetAthleteStatus(coachId: string, athleteId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (status: LinkStatus) => {
      const { error } = await supabase
        .from('coach_athletes')
        .update({ status })
        .eq('coach_id', coachId)
        .eq('athlete_id', athleteId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coach-links'] }),
  })
}

/** Fiche (infos, physiologie, zones) d'un athlète. */
export function useAthleteProfile(athleteId: string) {
  return useQuery({
    queryKey: athleteProfileKey(athleteId),
    queryFn: async (): Promise<AthleteProfile | null> => {
      const { data, error } = await supabase
        .from('athlete_profiles')
        .select('*')
        .eq('athlete_id', athleteId)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useUpdateAthleteProfile(athleteId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (patch: AthleteProfileUpdate): Promise<AthleteProfile> => {
      const { data, error } = await supabase
        .from('athlete_profiles')
        .update(patch)
        .eq('athlete_id', athleteId)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (profile) => queryClient.setQueryData(athleteProfileKey(athleteId), profile),
  })
}

/** Fiches de plusieurs athlètes (zones pour le calendrier « tous mes athlètes »). */
export function useAthleteProfiles(athleteIds: string[]) {
  const ids = [...athleteIds].sort()
  return useQuery({
    queryKey: ['athlete-profiles', ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<AthleteProfile[]> => {
      const { data, error } = await supabase.from('athlete_profiles').select('*').in('athlete_id', ids)
      if (error) throw error
      return data
    },
  })
}

/** Profil (nom, e-mail) d'un athlète vu par son coach. */
export function useAthleteIdentity(athleteId: string) {
  return useQuery({
    queryKey: ['profile', athleteId],
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', athleteId).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function usePrivateNote(coachId: string, athleteId: string) {
  return useQuery({
    queryKey: privateNoteKey(athleteId),
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase
        .from('coach_private_notes')
        .select('body')
        .eq('coach_id', coachId)
        .eq('athlete_id', athleteId)
        .maybeSingle()
      if (error) throw error
      return data?.body ?? ''
    },
  })
}

export function useSavePrivateNote(coachId: string, athleteId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: string): Promise<string> => {
      const { data, error } = await supabase
        .from('coach_private_notes')
        .update({ body })
        .eq('coach_id', coachId)
        .eq('athlete_id', athleteId)
        .select('body')
        .single()
      if (error) throw error
      return data.body
    },
    onSuccess: (body) => queryClient.setQueryData(privateNoteKey(athleteId), body),
  })
}
