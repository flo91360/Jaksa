import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Invitation, InvitationStatus } from '../lib/database.types.ts'
import { supabase } from '../lib/supabase.ts'

const invitationsKey = (coachId: string) => ['invitations', coachId] as const

export type InvitationPreview = { coach_name: string; athlete_name: string; status: InvitationStatus }

/** Invitations d'un coach, les plus récentes d'abord. */
export function useInvitations(coachId: string) {
  return useQuery({
    queryKey: invitationsKey(coachId),
    queryFn: async (): Promise<Invitation[]> => {
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useCreateInvitation(coachId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (athleteName: string): Promise<Invitation> => {
      const { data, error } = await supabase
        .from('invitations')
        .insert({ athlete_name: athleteName.trim() })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invitationsKey(coachId) }),
  })
}

export function useRevokeInvitation(coachId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await supabase
        .from('invitations')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', invitationId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invitationsKey(coachId) }),
  })
}

/** Aperçu public d'une invitation (accessible sans compte). */
export function useInvitationPreview(token: string) {
  return useQuery({
    queryKey: ['invitation-preview', token],
    queryFn: async (): Promise<InvitationPreview | null> => {
      const { data, error } = await supabase.rpc('get_invitation', { p_token: token })
      if (error) throw error
      return data[0] ?? null
    },
    retry: false,
  })
}

export function useAcceptInvitation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (token: string): Promise<string> => {
      const { data, error } = await supabase.rpc('accept_invitation', { p_token: token })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coach-links'] }),
  })
}
