import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { type InvitationPreview, useAcceptInvitation, useInvitationPreview } from '../api/invitations.ts'
import { useMyProfile } from '../api/profile.ts'
import { useAuth } from '../auth/auth-context.ts'
import { ConsentCheckbox } from '../components/Consent.tsx'
import { Alert, AuthLayout, Button, FullPageSpinner, TextField } from '../components/ui.tsx'
import { errorMessage } from '../lib/errors.ts'
import { TERMS_VERSION } from '../lib/site.ts'
import { appUrl, supabase } from '../lib/supabase.ts'
import { MIN_PASSWORD_LENGTH } from './PasswordPages.tsx'

const STATUS_MESSAGES: Record<Exclude<InvitationPreview['status'], 'valid'>, string> = {
  accepted: 'Cette invitation a déjà été utilisée. Si c’est toi, connecte-toi simplement.',
  expired: 'Cette invitation a expiré. Demande un nouveau lien à ton coach.',
  revoked: 'Ton coach a annulé cette invitation. Demande-lui un nouveau lien.',
}

/** Arrivée d'un athlète par le lien envoyé par son coach. */
export function InvitationPage() {
  const { token = '' } = useParams()
  const { session, initializing } = useAuth()
  const preview = useInvitationPreview(token)
  // Pendant l'inscription ou la connexion depuis ce lien, la session apparaît
  // avant la fin du parcours : on garde le formulaire affiché jusqu'au bout.
  const [joining, setJoining] = useState(false)

  if (initializing || preview.isPending) return <FullPageSpinner />

  if (preview.isError) {
    return (
      <AuthLayout title="Invitation">
        <Alert tone="error">{errorMessage(preview.error)}</Alert>
      </AuthLayout>
    )
  }

  const invitation = preview.data
  if (!invitation || invitation.status !== 'valid') {
    const message =
      invitation && invitation.status !== 'valid'
        ? STATUS_MESSAGES[invitation.status]
        : 'Ce lien d’invitation n’existe pas. Vérifie qu’il est complet.'
    return (
      <AuthLayout title="Invitation indisponible">
        <Alert tone="warning">{message}</Alert>
        <p className="mt-6 text-center text-sm">
          <Link to="/connexion" className="font-medium text-emerald-800 hover:underline">
            Aller à la connexion
          </Link>
        </p>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={`${invitation.coach_name || 'Ton coach'} t’invite sur Rob1Coach`}
      subtitle="Tu y retrouveras tes séances, tes zones d’entraînement et les échanges avec ton coach."
    >
      {session && !joining ? (
        <AcceptAsCurrentUser token={token} coachName={invitation.coach_name} />
      ) : (
        <JoinForms token={token} defaultName={invitation.athlete_name} onJoinStart={() => setJoining(true)} />
      )}
    </AuthLayout>
  )
}

function AcceptAsCurrentUser({ token, coachName }: { token: string; coachName: string }) {
  const navigate = useNavigate()
  const profile = useMyProfile()
  const accept = useAcceptInvitation()

  if (profile.isPending) return <FullPageSpinner />

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-700">
        Tu es connecté en tant que <strong>{profile.data?.full_name || profile.data?.email}</strong>.
      </p>
      {accept.isError && <Alert tone="error">{errorMessage(accept.error)}</Alert>}
      <Button
        className="w-full"
        busy={accept.isPending}
        onClick={() => accept.mutate(token, { onSuccess: () => navigate('/', { replace: true }) })}
      >
        Rejoindre {coachName || 'mon coach'}
      </Button>
      <Button variant="ghost" className="w-full" onClick={() => void supabase.auth.signOut()}>
        Ce n’est pas moi : me déconnecter
      </Button>
    </div>
  )
}

function JoinForms({
  token,
  defaultName,
  onJoinStart,
}: {
  token: string
  defaultName: string
  onJoinStart: () => void
}) {
  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [notice, setNotice] = useState<string | null>(null)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="tablist">
        {(
          [
            ['signup', 'Créer mon compte'],
            ['login', 'J’ai déjà un compte'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => {
              setMode(value)
              setNotice(null)
            }}
            className={`min-h-10 rounded-lg text-sm font-semibold ${mode === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {notice && <Alert tone="info">{notice}</Alert>}
      {mode === 'signup' ? (
        <SignupForm
          token={token}
          defaultName={defaultName}
          onJoinStart={onJoinStart}
          onExistingAccount={() => {
            setMode('login')
            setNotice('Un compte existe déjà avec cet e-mail : connecte-toi pour rejoindre ton coach.')
          }}
        />
      ) : (
        <LoginAndAcceptForm token={token} onJoinStart={onJoinStart} />
      )}
    </div>
  )
}

function SignupForm({
  token,
  defaultName,
  onJoinStart,
  onExistingAccount,
}: {
  token: string
  defaultName: string
  onJoinStart: () => void
  onExistingAccount: () => void
}) {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState(defaultName)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
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
    onJoinStart()
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        // Le jeton est lu par la base à la création du compte : le rattachement
        // au coach se fait tout de suite, même si l'e-mail reste à confirmer.
        data: { full_name: fullName.trim(), invitation_token: token, terms_version: TERMS_VERSION },
        emailRedirectTo: appUrl('/'),
      },
    })
    setBusy(false)
    if (signUpError) {
      if (signUpError.code === 'user_already_exists' || signUpError.code === 'email_exists') onExistingAccount()
      else setError(errorMessage(signUpError))
      return
    }
    // Avec confirmation d'e-mail activée, Supabase ne dit pas si l'adresse existe
    // déjà, mais renvoie alors un utilisateur sans identité.
    if (data.user && data.user.identities?.length === 0) {
      onExistingAccount()
      return
    }
    if (data.session) navigate('/', { replace: true })
    else setConfirmationSentTo(email.trim())
  }

  if (confirmationSentTo) {
    return (
      <Alert tone="success">
        Compte créé ! Un e-mail de confirmation a été envoyé à <strong>{confirmationSentTo}</strong> : clique sur le
        lien qu’il contient pour te connecter.
      </Alert>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <TextField
        label="Prénom et nom"
        autoComplete="name"
        required
        maxLength={120}
        value={fullName}
        onChange={(event) => setFullName(event.target.value)}
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
      <ConsentCheckbox role="athlete" checked={consent} onChange={setConsent} />
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" busy={busy} className="w-full">
        Créer mon compte
      </Button>
      <p className="text-xs text-slate-500">
        Tes données ne sont visibles que par toi et ton coach. Tu peux les télécharger ou supprimer ton compte à tout
        moment.
      </p>
    </form>
  )
}

function LoginAndAcceptForm({ token, onJoinStart }: { token: string; onJoinStart: () => void }) {
  const navigate = useNavigate()
  const accept = useAcceptInvitation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    onJoinStart()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (signInError) {
      setBusy(false)
      setError(errorMessage(signInError))
      return
    }
    try {
      await accept.mutateAsync(token)
      navigate('/', { replace: true })
    } catch (acceptError) {
      setError(errorMessage(acceptError))
    } finally {
      setBusy(false)
    }
  }

  return (
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
        Me connecter et rejoindre
      </Button>
      <p className="text-center text-sm">
        <Link to="/mot-de-passe-oublie" className="font-medium text-emerald-800 hover:underline">
          Mot de passe oublié ?
        </Link>
      </p>
    </form>
  )
}
