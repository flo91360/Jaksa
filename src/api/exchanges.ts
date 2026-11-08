import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { IsoDate } from '../domain/calendar.ts'
import type {
  Conversation,
  Message,
  WorkoutActivity,
  WorkoutComment,
  WorkoutFeedback,
  WorkoutFeedbackInsert,
} from '../lib/database.types.ts'
import { supabase } from '../lib/supabase.ts'

/**
 * Vrai si l'erreur vient d'une table ou d'une vue absente : la migration de la
 * 0.3.0 n'est pas encore appliquée. Les écrans masquent alors ces nouveautés
 * au lieu d'afficher une erreur.
 */
export function isMissingRelation(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    (error.code === 'PGRST205' || error.code === 'PGRST202' || error.code === '42P01')
  )
}

// -----------------------------------------------------------------------------
// Activité des séances (retours + commentaires)
// -----------------------------------------------------------------------------

/** Activité des séances d'un ou plusieurs athlètes entre deux dates, par séance. */
export function useWorkoutActivity(athleteIds: string[], from: IsoDate, to: IsoDate) {
  const ids = [...athleteIds].sort()
  return useQuery({
    queryKey: ['workout-activity', ids, from, to],
    enabled: ids.length > 0,
    retry: false,
    queryFn: async (): Promise<Map<string, WorkoutActivity>> => {
      const { data, error } = await supabase
        .from('workout_activity')
        .select('*')
        .in('athlete_id', ids)
        .gte('scheduled_on', from)
        .lte('scheduled_on', to)
      if (error) throw error
      return new Map(data.map((row) => [row.workout_id, row]))
    },
  })
}

/** Coach : retours pas encore vus et commentaires non lus, du plus récent au plus ancien. */
export function useCoachInbox(coachId: string) {
  return useQuery({
    queryKey: ['workout-activity', 'inbox', coachId],
    retry: false,
    queryFn: async (): Promise<WorkoutActivity[]> => {
      const { data, error } = await supabase
        .from('workout_activity')
        .select('*')
        .eq('coach_id', coachId)
        .or('unseen_feedback.is.true,unread_comments.gt.0')
        .order('scheduled_on', { ascending: false })
        .limit(30)
      if (error) throw error
      return data
    },
  })
}

function useInvalidateActivity() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['workout-activity'] }),
      queryClient.invalidateQueries({ queryKey: ['workout-feedback'] }),
      queryClient.invalidateQueries({ queryKey: ['workout-comments'] }),
    ])
}

/** Ouverture d'une séance : commentaires lus et, pour le coach, « vu par le coach ». */
export function useMarkWorkoutSeen() {
  const invalidate = useInvalidateActivity()
  return useMutation({
    mutationFn: async (workoutId: string) => {
      const { error } = await supabase.rpc('mark_workout_seen', { p_workout: workoutId })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

// -----------------------------------------------------------------------------
// Retour de séance
// -----------------------------------------------------------------------------

export function useFeedback(workoutId: string) {
  return useQuery({
    queryKey: ['workout-feedback', workoutId],
    retry: false,
    queryFn: async (): Promise<WorkoutFeedback | null> => {
      const { data, error } = await supabase.from('workout_feedback').select('*').eq('workout_id', workoutId).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/** Enregistre le retour (création ou modification : la séance ne change jamais). */
export function useSaveFeedback() {
  const invalidate = useInvalidateActivity()
  return useMutation({
    mutationFn: async ({ exists, values }: { exists: boolean; values: WorkoutFeedbackInsert }) => {
      const { workout_id, ...patch } = values
      const query = exists
        ? supabase.from('workout_feedback').update(patch).eq('workout_id', workout_id)
        : supabase.from('workout_feedback').insert(values)
      const { data, error } = await query.select().single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
}

export function useDeleteFeedback() {
  const invalidate = useInvalidateActivity()
  return useMutation({
    mutationFn: async (workoutId: string) => {
      const { error } = await supabase.from('workout_feedback').delete().eq('workout_id', workoutId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

// -----------------------------------------------------------------------------
// Commentaires de séance
// -----------------------------------------------------------------------------

export function useComments(workoutId: string) {
  return useQuery({
    queryKey: ['workout-comments', workoutId],
    retry: false,
    queryFn: async (): Promise<WorkoutComment[]> => {
      const { data, error } = await supabase
        .from('workout_comments')
        .select('*')
        .eq('workout_id', workoutId)
        .order('created_at')
      if (error) throw error
      return data
    },
  })
}

export function useAddComment() {
  const invalidate = useInvalidateActivity()
  return useMutation({
    mutationFn: async ({ workoutId, body }: { workoutId: string; body: string }) => {
      const { data, error } = await supabase
        .from('workout_comments')
        .insert({ workout_id: workoutId, body })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
}

export function useDeleteComment() {
  const invalidate = useInvalidateActivity()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('workout_comments').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

// -----------------------------------------------------------------------------
// Messagerie
// -----------------------------------------------------------------------------

/** Conversations de l'utilisateur connecté (une par lien coach ↔ athlète). */
export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    retry: false,
    queryFn: async (): Promise<Conversation[]> => {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .order('athlete_name')
      if (error) throw error
      return data
    },
  })
}

export function useMessages(coachId: string, athleteId: string) {
  return useQuery({
    queryKey: ['messages', coachId, athleteId],
    retry: false,
    queryFn: async (): Promise<Message[]> => {
      // Les 200 derniers messages, remis dans l'ordre chronologique.
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('coach_id', coachId)
        .eq('athlete_id', athleteId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data.reverse()
    },
  })
}

export function useSendMessage(coachId: string, athleteId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: string): Promise<Message> => {
      const { data, error } = await supabase
        .from('messages')
        .insert({ coach_id: coachId, athlete_id: athleteId, body })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (message) => {
      queryClient.setQueryData<Message[]>(['messages', coachId, athleteId], (list) =>
        list && !list.some((m) => m.id === message.id) ? [...list, message] : list,
      )
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })
}

export function useMarkConversationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ coachId, athleteId }: { coachId: string; athleteId: string }) => {
      const { error } = await supabase.rpc('mark_conversation_read', { p_coach: coachId, p_athlete: athleteId })
      if (error) throw error
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['conversations'] }),
        queryClient.invalidateQueries({ queryKey: ['unread-messages'] }),
      ]),
  })
}

/** Nombre de messages reçus non lus (pastille du menu). */
export function useUnreadMessageCount(userId: string | undefined) {
  return useQuery({
    queryKey: ['unread-messages', userId],
    enabled: userId !== undefined,
    retry: false,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .neq('sender_id', userId ?? '')
        .is('read_at', null)
      if (error) throw error
      return count ?? 0
    },
  })
}

/**
 * Temps réel : à chaque nouveau message, commentaire ou retour visible par
 * l'utilisateur (la RLS filtre), les données concernées sont rechargées.
 */
export function useRealtimeExchanges(userId: string | undefined) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!userId) return
    const refresh = (keys: string[][]) => {
      for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey })
    }
    const channel = supabase
      .channel(`echanges-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () =>
        refresh([['messages'], ['conversations'], ['unread-messages']]),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_comments' }, () =>
        refresh([['workout-comments'], ['workout-activity']]),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'workout_feedback' }, () =>
        refresh([['workout-feedback'], ['workout-activity']]),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, queryClient])
}
