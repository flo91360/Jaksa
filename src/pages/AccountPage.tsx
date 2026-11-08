import { type FormEvent, useState } from 'react'
import { useMyProfile, useUpdateMyName } from '../api/profile.ts'
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
