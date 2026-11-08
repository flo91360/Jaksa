import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types.ts'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/** Faux si les variables VITE_SUPABASE_* manquent (l'application affiche alors une aide). */
export const isSupabaseConfigured = Boolean(url && key)

export const supabase = createClient<Database>(url || 'http://localhost:54321', key || 'cle-manquante', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'rob1coach-auth',
  },
})

/** Adresse publique d'une page de l'application (liens d'invitation, e-mails). */
export function appUrl(path: string): string {
  return new URL(path, window.location.origin).toString()
}
