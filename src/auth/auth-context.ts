import type { Session } from '@supabase/supabase-js'
import { createContext, useContext } from 'react'

export type AuthContextValue = {
  session: Session | null
  /** Vrai tant que la session enregistrée n'a pas été relue. */
  initializing: boolean
  /** Vrai après un clic sur le lien « mot de passe oublié » reçu par e-mail. */
  passwordRecovery: boolean
  endPasswordRecovery: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth doit être utilisé dans <AuthProvider>')
  return value
}

/** Identifiant de l'utilisateur connecté (les pages protégées garantissent sa présence). */
export function useUserId(): string {
  const { session } = useAuth()
  if (!session) throw new Error('Aucun utilisateur connecté')
  return session.user.id
}
