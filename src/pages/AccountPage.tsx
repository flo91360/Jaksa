import { type FormEvent, useState } from 'react'
import { downloadJson, exportAccountData, useDeleteAccount, useLeaveCoach } from '../api/account.ts'
import { useMyCoaches } from '../api/athletes.ts'
import { usePlanUsage } from '../api/subscription.ts'
import { UpgradeHint, UsageBar } from '../components/PlanCard.tsx'
import { useMyProfile, useUpdateEmailNotifications, useUpdateMyName } from '../api/profile.ts'
import { ThemeChoice } from '../components/ThemeToggle.tsx'
import { GarminAttribution, GarminImportButton } from '../components/garmin/Garmin.tsx'
import { Alert, Button, Card, LegalLinks, LoadingBlock, Modal, PageHeader, SavedHint, TextField } from '../components/ui.tsx'
import { DELETE_CONFIRMATION, confirmsDeletion, exportFileName } from '../domain/account.ts'
import { todayIso } from '../domain/calendar.ts'
import type { Profile } from '../lib/database.types.ts'
import { errorMessage } from '../lib/errors.ts'
import { APP_VERSION, SITE } from '../lib/site.ts'
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
        <Card title="Apparence" description="« Système » suit le réglage clair ou sombre du téléphone ou de l’ordinateur." className="lg:col-span-2">
          <ThemeChoice />
        </Card>
        {profile.data?.role === 'coach' && <MyPlan coachId={profile.data.id} />}
        {profile.data?.role === 'athlete' && (
          <Card
            title="Mon coach"
            description="Ton coach voit ta fiche, tes séances, tes retours et les activités de ta montre. Tu peux retirer cet accès à tout moment."
            className="lg:col-span-2"
          >
            <MyCoaches athleteId={profile.data.id} />
          </Card>
        )}
        {profile.data && (
          <Card
            title="Mes données"
            description="Tout ce que le site enregistre à ton sujet t’appartient : tu peux l’emporter ou l’effacer."
            className="lg:col-span-2"
          >
            <MyData profile={profile.data} />
          </Card>
        )}
        <Card title="Session" className="lg:col-span-2">
          <Button variant="secondary" onClick={() => void supabase.auth.signOut()}>
            Se déconnecter
          </Button>
        </Card>
      </div>
      <footer className="mt-8 space-y-2 text-center">
        <LegalLinks />
        <p className="text-xs text-slate-500">
          {SITE.name}
          {APP_VERSION && ` · version ${APP_VERSION}`}
          {SITE.contactEmail && (
            <>
              {' · '}
              <a href={`mailto:${SITE.contactEmail}`} className="hover:underline">
                {SITE.contactEmail}
              </a>
            </>
          )}
        </p>
      </footer>
    </>
  )
}

/** Offre du coach : places prises, et comment en obtenir d'autres. */
function MyPlan({ coachId }: { coachId: string }) {
  const usage = usePlanUsage(coachId)
  if (!usage) return null
  return (
    <Card
      title="Mon offre"
      description="Seuls les athlètes actifs comptent : archiver un athlète libère sa place. C’est gratuit pour tes athlètes, toujours."
      className="lg:col-span-2"
    >
      <div className="space-y-3">
        <UsageBar usage={usage} />
        <p className="text-sm text-slate-600">{usage.plan.summary}</p>
        {usage.plan.athleteLimit !== null && (
          <p className="text-sm text-slate-600">
            <UpgradeHint usage={usage} />
          </p>
        )}
      </div>
    </Card>
  )
}

/** Coachs de l'athlète, avec le retrait de l'accès (droit de retirer son accord). */
function MyCoaches({ athleteId }: { athleteId: string }) {
  const coaches = useMyCoaches(athleteId)
  const leave = useLeaveCoach()
  if (coaches.isPending) return <LoadingBlock />
  if (coaches.isError) return <Alert tone="error">{errorMessage(coaches.error)}</Alert>
  if (coaches.data.length === 0) {
    return <p className="text-sm text-slate-600">Tu n’es rattaché à aucun coach : personne d’autre que toi ne voit tes données.</p>
  }
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-slate-100">
        {coaches.data.map((coach) => (
          <li key={coach.coach_id} className="flex flex-wrap items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
            <span className="min-w-0">
              <span className="block truncate font-medium text-slate-900">{coach.coach_name || 'Ton coach'}</span>
              <span className="block truncate text-sm text-slate-500">{coach.coach_email}</span>
            </span>
            <Button
              variant="danger"
              busy={leave.isPending && leave.variables === coach.coach_id}
              onClick={() => {
                if (
                  window.confirm(
                    `Quitter ${coach.coach_name || 'ce coach'} ? Il ne verra plus ta fiche, tes séances ni tes activités, et ne pourra plus t’écrire. Tu gardes tout ton historique. Pour le rejoindre à nouveau, il devra t’envoyer une invitation.`,
                  )
                ) {
                  leave.mutate(coach.coach_id)
                }
              }}
            >
              Quitter ce coach
            </Button>
          </li>
        ))}
      </ul>
      {leave.isError && <Alert tone="error">{errorMessage(leave.error)}</Alert>}
    </div>
  )
}

/** Export de toutes ses données et suppression du compte. */
function MyData({ profile }: { profile: Profile }) {
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exported, setExported] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const download = async () => {
    setExporting(true)
    setExportError(null)
    setExported(false)
    try {
      const content = await exportAccountData(profile.id, profile.role)
      downloadJson(exportFileName(profile.full_name, todayIso()), content)
      setExported(true)
    } catch (error) {
      setExportError(errorMessage(error))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" busy={exporting} onClick={() => void download()}>
          Télécharger mes données
        </Button>
        <Button variant="danger" onClick={() => setDeleting(true)}>
          Supprimer mon compte
        </Button>
      </div>
      <p className="text-sm text-slate-600">
        Le téléchargement est un fichier JSON :{' '}
        {profile.role === 'coach'
          ? 'ton profil, tes séances types, les séances que tu as planifiées, tes notes et tes messages.'
          : 'ton profil, ta fiche, tes séances, tes retours, tes messages et les activités de ta montre.'}
      </p>
      {exported && <Alert tone="success">Fichier prêt : regarde dans tes téléchargements.</Alert>}
      {exportError && <Alert tone="error">{exportError}</Alert>}
      {deleting && <DeleteAccountDialog profile={profile} onClose={() => setDeleting(false)} />}
    </div>
  )
}

function DeleteAccountDialog({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const remove = useDeleteAccount()
  const [confirmation, setConfirmation] = useState('')
  return (
    <Modal
      title="Supprimer mon compte"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="danger"
            busy={remove.isPending}
            disabled={!confirmsDeletion(confirmation)}
            // La session se ferme : retour à l'accueil public.
            onClick={() => remove.mutate(undefined, { onSuccess: () => window.location.assign('/') })}
          >
            Supprimer définitivement
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Alert tone="warning">
          {profile.role === 'coach'
            ? 'Ton compte, tes séances types, tes notes, tes messages et toutes les séances que tu as planifiées pour tes athlètes seront effacés tout de suite. Tes athlètes gardent leur compte et les activités de leur montre.'
            : 'Ton compte, ta fiche, tes séances, tes retours, tes messages et les activités de ta montre seront effacés tout de suite. Ton coach ne verra plus rien de toi.'}{' '}
          C’est définitif : pense à télécharger tes données avant.
        </Alert>
        <TextField
          label={`Pour confirmer, écris ${DELETE_CONFIRMATION}`}
          value={confirmation}
          autoComplete="off"
          autoCapitalize="characters"
          onChange={(event) => setConfirmation(event.target.value)}
        />
        {remove.isError && <Alert tone="error">{errorMessage(remove.error)}</Alert>}
      </div>
    </Modal>
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
