import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'
import { Alert, AuthLayout, Button, TextField } from '../components/ui.tsx'
import { errorMessage } from '../lib/errors.ts'
import { supabase } from '../lib/supabase.ts'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    // En cas de succès, la session change et PublicOnly redirige.
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (signInError) setError(errorMessage(signInError))
    setBusy(false)
  }

  return (
    <AuthLayout title="Connexion" subtitle="Planification et suivi de l’entraînement.">
      <form onSubmit={submit} className="space-y-4">
        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <TextField
          label="Mot de passe"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" busy={busy} className="w-full">
          Se connecter
        </Button>
        <div className="flex flex-col gap-2 text-center text-sm text-slate-600">
          <Link to="/mot-de-passe-oublie" className="font-medium text-emerald-800 hover:underline">
            Mot de passe oublié ?
          </Link>
          <p>Pas encore de compte ? Demande un lien d’invitation à ton coach.</p>
        </div>
      </form>
    </AuthLayout>
  )
}
