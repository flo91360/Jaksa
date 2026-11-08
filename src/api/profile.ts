import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/auth-context.ts'
import type { Profile } from '../lib/database.types.ts'
import { supabase } from '../lib/supabase.ts'

export const profileKey = (userId: string | undefined) => ['profile', userId] as const

/** Profil (nom, rôle) de l'utilisateur connecté. */
export function useMyProfile() {
  const { session } = useAuth()
  const userId = session?.user.id
  return useQuery({
    queryKey: profileKey(userId),
    enabled: userId !== undefined,
    queryFn: async (): Promise<Profile> => {
      if (!userId) throw new Error('Aucun utilisateur connecté')
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
      if (error) throw error
      return data
    },
  })
}

export function useUpdateMyName() {
  const queryClient = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async (fullName: string): Promise<Profile> => {
      if (!session) throw new Error('Aucun utilisateur connecté')
      const { data, error } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim() })
        .eq('id', session.user.id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(profileKey(profile.id), profile)
      void queryClient.invalidateQueries({ queryKey: ['coach-links'] })
    },
  })
}
