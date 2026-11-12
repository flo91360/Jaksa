import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/auth-context.ts'
import { type AccountExport, buildExport } from '../domain/account.ts'
import type { UserRole } from '../lib/database.types.ts'
import { APP_VERSION, TERMS_VERSION } from '../lib/site.ts'
import { supabase } from '../lib/supabase.ts'
import { profileKey } from './profile.ts'

/** Enregistre l'accord de la personne connectée pour la version en cours des conditions. */
export function useAcceptTerms() {
  const queryClient = useQueryClient()
  const { session } = useAuth()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('accept_terms', { p_version: TERMS_VERSION })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKey(session?.user.id) }),
  })
}

/** L'athlète quitte un coach : celui-ci ne voit plus rien de lui. */
export function useLeaveCoach() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (coachId: string) => {
      const { error } = await supabase.rpc('leave_coach', { p_coach: coachId })
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries(),
  })
}

/** Supprime le compte et toutes ses données, puis ferme la session. */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('delete_my_account')
      if (error) throw error
      // Le compte n'existe plus : la déconnexion locale suffit (et ne peut pas échouer côté serveur).
      await supabase.auth.signOut({ scope: 'local' })
    },
  })
}

const PAGE = 1000

type Page = { data: unknown[] | null; error: unknown }

/** Lit toutes les lignes d'une requête, par pages (PostgREST plafonne chaque réponse). */
async function readAll(page: (from: number, to: number) => PromiseLike<Page>): Promise<unknown[]> {
  const rows: unknown[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) return rows
  }
}

/**
 * Toutes les données de la personne connectée, lues avec ses propres droits (RLS) :
 * rien d'autre que ce qu'elle voit déjà dans le site.
 */
export async function exportAccountData(userId: string, role: UserRole): Promise<AccountExport> {
  const me = role === 'coach' ? 'coach_id' : 'athlete_id'
  const profile = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (profile.error) throw profile.error

  const data: Record<string, unknown> = { profil: profile.data }
  data.liens_coach_athlete = await readAll((from, to) => supabase.from('coach_links').select('*').eq(me, userId).range(from, to))
  data.seances = await readAll((from, to) =>
    supabase.from('workouts').select('*').eq(me, userId).order('scheduled_on').order('id').range(from, to),
  )
  data.messages = await readAll((from, to) =>
    supabase.from('messages').select('*').eq(me, userId).order('created_at').order('id').range(from, to),
  )

  if (role === 'coach') {
    data.seances_types = await readAll((from, to) =>
      supabase.from('workout_templates').select('*').eq('coach_id', userId).order('id').range(from, to),
    )
    data.invitations = await readAll((from, to) =>
      supabase.from('invitations').select('id, athlete_name, created_at, expires_at, accepted_at, revoked_at').eq('coach_id', userId).order('id').range(from, to),
    )
    data.notes_privees = await readAll((from, to) =>
      supabase.from('coach_private_notes').select('*').eq('coach_id', userId).order('athlete_id').range(from, to),
    )
    data.commentaires = await readAll((from, to) =>
      supabase.from('workout_comments').select('*').eq('author_id', userId).order('created_at').order('id').range(from, to),
    )
  } else {
    const fiche = await supabase.from('athlete_profiles').select('*').eq('athlete_id', userId).maybeSingle()
    if (fiche.error) throw fiche.error
    data.fiche_athlete = fiche.data
    data.historique_physiologie = await readAll((from, to) =>
      supabase.from('athlete_metrics_history').select('*').eq('athlete_id', userId).order('id').range(from, to),
    )
    data.courses = await readAll((from, to) =>
      supabase.from('races').select('*').eq('athlete_id', userId).order('race_on').order('id').range(from, to),
    )
    data.retours_de_seance = await readAll((from, to) =>
      supabase.from('workout_feedback').select('*').eq('athlete_id', userId).order('workout_id').range(from, to),
    )
    data.commentaires = await readAll((from, to) =>
      supabase.from('workout_comments').select('*').eq('athlete_id', userId).order('created_at').order('id').range(from, to),
    )
    data.activites_montre = await readAll((from, to) =>
      supabase.from('garmin_activities').select('*').eq('athlete_id', userId).order('start_time').order('id').range(from, to),
    )
    // Courbes et tracés : volumineux, lus par petites pages.
    const details: unknown[] = []
    for (let from = 0; ; from += 20) {
      const { data: rows, error } = await supabase
        .from('garmin_activity_details')
        .select('*')
        .eq('athlete_id', userId)
        .order('activity_id')
        .range(from, from + 19)
      if (error) throw error
      details.push(...rows)
      if (rows.length < 20) break
    }
    data.details_activites_montre = details
  }

  return buildExport(data, new Date(), APP_VERSION)
}

/** Propose le téléchargement d'un fichier JSON construit dans le navigateur. */
export function downloadJson(fileName: string, content: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
