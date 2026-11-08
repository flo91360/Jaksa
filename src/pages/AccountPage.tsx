import { type FormEvent, useState } from 'react'
import { useMyProfile, useUpdateEmailNotifications, useUpdateMyName } from '../api/profile.ts'
import { GarminAttribution, GarminImportButton } from '../components/garmin/Garmin.tsx'
import { Alert, Button, Card, LoadingBlock, PageHeader, SavedHint, TextField } from '../components/ui.tsx'
import type { Profile } from '../lib/database.types.ts'
import { errorMessage } from '../lib/errors.ts'
import { supabase } from '../lib/supabase.ts'
import { NewPasswordForm } from './PasswordPages.tsx'

export function AccountPage() {
  const profile = useMyProfile()

  return (
    <>
      <PageHeader title="Mon compte" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Identité">
          {profile.isPending && <LoadingBlock />}
          {profile.isError && <Alert tone="error">{errorMessage(profile.error)}</Alert>}
          {profile.data && <NameForm profile={profile.data} />}
        </Card>
        <Card title="Mot de passe">
          <NewPasswordForm submitLabel="Changer le mot de passe" />
        </Card>
        {profile.data && profile.data.email_notifications !== undefined && (
          <Card title="E-mails" className="lg:col-span-2">
            <EmailPreference profile={profile.data} />
          </Card>
        )}
        {profile.data?.role === 'athlete' && (
          <Card
            title="Montre Garmin (essai)"
            description="Importe tes activités des 14 derniers jours : durée, distance, allure, FC et D+ s’affichent sous la séance prévue le même jour, pour toi et ton coach. L’import se fait aussi tout seul toutes les 15 minutes ; ce bouton sert à ne pas attendre. Pour l’instant, réservé à un compte de test."
            actions={<GarminAttribution />}
            className="lg:col-span-2"
          >
            <GarminImportButton athleteId={profile.data.id} />
          </Card>
        )}
        <Card title="Session" className="lg:col-span-2">
          <Button variant="secondary" onClick={() => void supabase.auth.signOut()}>
            Se déconnecter
          </Button>
        </Card>
      </div>
    </>
  )
}

function NameForm({ profile }: { profile: Profile }) {
  const update = useUpdateMyName()
  const [fullName, setFullName] = useState(profile.full_name)
  const [dirty, setDirty] = useState(false)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    update.mutate(fullName, { onSuccess: () => setDirty(false) })
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <TextField
        label="Prénom et nom"
        autoComplete="name"
        required
        maxLength={120}
        value={fullName}
        onChange={(event) => {
          setFullName(event.target.value)
          setDirty(true)
        }}
      />
      <TextField label="E-mail" value={profile.email} readOnly disabled hint="Pour le changer, contacte ton coach." />
      <p className="text-sm text-slate-600">
        Rôle : <strong>{profile.role === 'coach' ? 'coach' : 'athlète'}</strong>
      </p>
      {update.isError && <Alert tone="error">{errorMessage(update.error)}</Alert>}
      <div className="flex items-center justify-end gap-3">
        <SavedHint show={update.isSuccess && !dirty} />
        <Button type="submit" busy={update.isPending} disabled={!dirty}>
          Enregistrer
        </Button>
      </div>
    </form>
  )
}

function EmailPreference({ profile }: { profile: Profile }) {
  const update = useUpdateEmailNotifications()
  const coach = profile.role === 'coach'
  return (
    <div className="space-y-3">
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-5 accent-emerald-700"
          checked={profile.email_notifications}
          disabled={update.isPending}
          onChange={(event) => update.mutate(event.target.checked)}
        />
        <span className="text-sm text-slate-800">
          <span className="block font-medium">Recevoir les e-mails de Rob1Coach</span>
          <span className="text-slate-600">
            {coach
              ? 'Un e-mail quand un athlète fait son retour, commente une séance ou t’écrit (regroupés, et seulement si tu ne les as pas déjà lus sur le site).'
              : 'Ta séance du lendemain, chaque soir, et un e-mail quand ton coach t’écrit ou commente une séance.'}{' '}
            Les e-mails ne contiennent que des liens, jamais tes données de santé.
          </span>
        </span>
      </label>
      {update.isError && <Alert tone="error">{errorMessage(update.error)}</Alert>}
    </div>
  )
}
