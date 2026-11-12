import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ConsentCheckbox } from '../components/Consent.tsx'
import { Alert, AuthLayout, Button, TextField } from '../components/ui.tsx'
import { PLANS, formatPlanLimit } from '../domain/plans.ts'
import { errorMessage } from '../lib/errors.ts'
import { TERMS_VERSION } from '../lib/site.ts'
import { appUrl, supabase } from '../lib/supabase.ts'
import { MIN_PASSWORD_LENGTH } from './PasswordPages.tsx'

/** Un coach crée son espace : compte coach, offre Découverte, prêt à inviter ses athlètes. */
export function CoachSignupPage() {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existing, setExisting] = useState(false)
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setExisting(false)
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Mot de passe : au moins ${MIN_PASSWORD_LENGTH} caractères.`)
      return
    }
    if (!consent) {
      setError('Coche la case pour donner ton accord.')
      return
    }
    setBusy(true)
    setError(null)
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // Lu par la base à la création du compte : rôle coach et offre de départ.
        data: { full_name: fullName.trim(), account_type: 'coach', terms_version: TERMS_VERSION },
        emailRedirectTo: appUrl('/'),
      },
    })
    setBusy(false)
    if (signUpError) {
      if (signUpError.code === 'user_already_exists' || signUpError.code === 'email_exists') setExisting(true)
      else setError(errorMessage(signUpError))
      return
    }
    // Avec la confirmation d'e-mail, Supabase ne dit pas si l'adresse existe déjà,
    // mais renvoie alors un utilisateur sans identité.
    if (data.user && data.user.identities?.length === 0) {
      setExisting(true)
      return
    }
    if (data.session) navigate('/athletes', { replace: true })
    else setConfirmationSentTo(email.trim())
  }

  if (confirmationSentTo) {
    return (
      <AuthLayout title="Vérifie ta boîte mail">
        <Alert tone="success">
          Ton espace coach est créé. Un e-mail de confirmation a été envoyé à <strong>{confirmationSentTo}</strong> :
          clique sur le lien qu’il contient pour te connecter.
        </Alert>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Créer mon espace coach"
      subtitle={`Gratuit ${formatPlanLimit(PLANS.decouverte).toLowerCase()}, sans carte bancaire. Tes athlètes te rejoignent ensuite par un lien d’invitation.`}
    >
      <form onSubmit={submit} className="space-y-4">
        <TextField
          label="Prénom et nom"
          autoComplete="name"
          required
          maxLength={120}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          hint="C’est le nom que verront tes athlètes."
        />
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
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          hint={`${MIN_PASSWORD_LENGTH} caractères minimum`}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        <ConsentCheckbox role="coach" checked={consent} onChange={setConsent} />
        {existing && (
          <Alert tone="warning">
            Un compte existe déjà avec cet e-mail.{' '}
            <Link to="/connexion" className="font-medium underline">
              Connecte-toi
            </Link>
            . Un compte athlète ne peut pas devenir coach : utilise une autre adresse pour ton espace coach.
          </Alert>
        )}
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" busy={busy} className="w-full">
          Créer mon espace coach
        </Button>
        <div className="space-y-1 text-center text-sm text-slate-600">
          <p>
            Déjà un compte ?{' '}
            <Link to="/connexion" className="font-medium text-emerald-800 hover:underline">
              Se connecter
            </Link>
          </p>
          <p>Tu es athlète ? Demande un lien d’invitation à ton coach.</p>
        </div>
      </form>
    </AuthLayout>
  )
}
