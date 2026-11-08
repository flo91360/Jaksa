import { Link } from 'react-router'
import { Alert, AuthLayout } from '../components/ui.tsx'

export function NotFoundPage() {
  return (
    <AuthLayout title="Page introuvable">
      <p className="text-sm text-slate-600">Cette adresse ne correspond à aucune page.</p>
      <p className="mt-6 text-center text-sm">
        <Link to="/" className="font-medium text-emerald-800 hover:underline">
          Retour à l’accueil
        </Link>
      </p>
    </AuthLayout>
  )
}

/** Affiché quand le site est déployé sans les variables VITE_SUPABASE_*. */
export function ConfigMissingPage() {
  return (
    <AuthLayout title="Configuration incomplète">
      <Alert tone="warning">
        Les variables <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> ne sont pas
        définies. Voir <code>docs/DEPLOIEMENT.md</code> dans le dépôt.
      </Alert>
    </AuthLayout>
  )
}
