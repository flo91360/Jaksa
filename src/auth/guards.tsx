import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useMyProfile } from '../api/profile.ts'
import { Alert, AuthLayout, Button, FullPageSpinner } from '../components/ui.tsx'
import type { UserRole } from '../lib/database.types.ts'
import { LandingPage } from '../pages/public/LandingPage.tsx'
import { errorMessage } from '../lib/errors.ts'
import { supabase } from '../lib/supabase.ts'
import { useAuth } from './auth-context.ts'

/** Réservé aux personnes connectées ; sinon redirige vers la connexion. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, initializing } = useAuth()
  const location = useLocation()
  if (initializing) return <FullPageSpinner />
  if (!session) return <Navigate to="/connexion" replace state={{ from: location.pathname }} />
  return children
}

/** Réservé à un rôle (coach ou athlète) ; sinon renvoie vers l'accueil. */
export function RequireRole({ role, children }: { role: UserRole; children: ReactNode }) {
  const profile = useMyProfile()
  if (profile.isPending) return <FullPageSpinner />
  if (profile.isError) return <ProfileError error={profile.error} />
  if (profile.data.role !== role) return <Navigate to="/" replace />
  return children
}

/** Pages de connexion : inutiles si l'on est déjà connecté. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const { session, initializing } = useAuth()
  const location = useLocation()
  if (initializing) return <FullPageSpinner />
  if (session) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from ?? '/'} replace />
  }
  return children
}

/** Adresse racine : la présentation du site pour un visiteur, son espace pour une personne connectée. */
export function HomeOrLanding() {
  const { session, initializing } = useAuth()
  if (initializing) return <FullPageSpinner />
  return session ? <HomeRedirect /> : <LandingPage />
}

/** Accueil : le coach va vers son planning, l'athlète vers sa journée. */
function HomeRedirect() {
  const profile = useMyProfile()
  if (profile.isPending) return <FullPageSpinner />
  if (profile.isError) return <ProfileError error={profile.error} />
  return <Navigate to={profile.data.role === 'coach' ? '/planning' : '/aujourdhui'} replace />
}

function ProfileError({ error }: { error: Error }) {
  return (
    <AuthLayout title="Profil indisponible">
      <div className="space-y-4">
        <Alert tone="error">{errorMessage(error)}</Alert>
        <div className="flex gap-2">
          <Button onClick={() => window.location.reload()}>Réessayer</Button>
          <Button variant="secondary" onClick={() => void supabase.auth.signOut()}>
            Se déconnecter
          </Button>
        </div>
      </div>
    </AuthLayout>
  )
}
