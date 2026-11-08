import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../auth/auth-context.ts'
import { Alert, AuthLayout, Button, FullPageSpinner, TextField } from '../components/ui.tsx'
import { errorMessage } from '../lib/errors.ts'
import { appUrl, supabase } from '../lib/supabase.ts'

export const MIN_PASSWORD_LENGTH = 8

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: appUrl('/nouveau-mot-de-passe'),
    })
    setBusy(false)
    if (resetError) setError(errorMessage(resetError))
    else setSent(true)
  }

  return (
    <AuthLayout title="Mot de passe oublié" subtitle="Tu vas recevoir un lien pour en choisir un nouveau.">
      {sent ? (
        <Alert tone="success">
          Si un compte existe pour <strong>{email}</strong>, un e-mail vient d’être envoyé. Pense à regarder dans les
          indésirables.
        </Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <TextField
            label="E-mail"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" busy={busy} className="w-full">
            Envoyer le lien
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm">
        <Link to="/connexion" className="font-medium text-emerald-800 hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </AuthLayout>
  )
}

/** Choix d'un nouveau mot de passe (après le lien reçu par e-mail). */
export function ResetPasswordPage() {
  const { session, initializing, endPasswordRecovery } = useAuth()
  const navigate = useNavigate()

  if (initializing) return <FullPageSpinner />

  if (!session) {
    return (
      <AuthLayout title="Lien expiré">
        <Alert tone="warning">Ce lien n’est plus valable. Demande un nouvel e-mail de réinitialisation.</Alert>
        <p className="mt-6 text-center text-sm">
          <Link to="/mot-de-passe-oublie" className="font-medium text-emerald-800 hover:underline">
            Recevoir un nouveau lien
          </Link>
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Nouveau mot de passe">
      <NewPasswordForm
        submitLabel="Enregistrer et continuer"
        onDone={() => {
          endPasswordRecovery()
          navigate('/', { replace: true })
        }}
      />
    </AuthLayout>
  )
}

export function NewPasswordForm({ submitLabel, onDone }: { submitLabel: string; onDone?: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setDone(false)
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Au moins ${MIN_PASSWORD_LENGTH} caractères.`)
      return
    }
    if (password !== confirmation) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }
    setBusy(true)
    setError(null)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (updateError) {
      setError(errorMessage(updateError))
      return
    }
    setPassword('')
    setConfirmation('')
    setDone(true)
    onDone?.()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <TextField
        label="Nouveau mot de passe"
        type="password"
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        hint={`${MIN_PASSWORD_LENGTH} caractères minimum`}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <TextField
        label="Confirmation"
        type="password"
        autoComplete="new-password"
        required
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
      />
      {error && <Alert tone="error">{error}</Alert>}
      {done && <Alert tone="success">Mot de passe modifié.</Alert>}
      <Button type="submit" busy={busy}>
        {submitLabel}
      </Button>
    </form>
  )
}
