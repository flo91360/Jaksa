import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'
import { useCoachAthletes } from '../../api/athletes.ts'
import { useCreateInvitation, useInvitations, useRevokeInvitation } from '../../api/invitations.ts'
import { useUserId } from '../../auth/auth-context.ts'
import { InvitationLink } from '../../components/InvitationLink.tsx'
import { pendingInvitations } from '../../domain/invitations.ts'
import { Alert, Button, Card, EmptyState, LoadingBlock, PageHeader, TextField } from '../../components/ui.tsx'
import type { CoachLink, Invitation } from '../../lib/database.types.ts'
import { errorMessage } from '../../lib/errors.ts'
import { formatDate, formatShortDate } from '../../lib/format.ts'

export function AthletesPage() {
  const coachId = useUserId()
  const athletes = useCoachAthletes(coachId)
  const invitations = useInvitations(coachId)
  const [inviting, setInviting] = useState(false)

  const active = athletes.data?.filter((link) => link.status === 'active') ?? []
  const archived = athletes.data?.filter((link) => link.status === 'archived') ?? []
  const pending = pendingInvitations(invitations.data ?? [])

  return (
    <>
      <PageHeader
        title="Mes athlètes"
        subtitle={athletes.data ? `${active.length} athlète${active.length > 1 ? 's' : ''} suivi${active.length > 1 ? 's' : ''}` : undefined}
        actions={!inviting && <Button onClick={() => setInviting(true)}>Inviter un athlète</Button>}
      />

      <div className="space-y-6">
        {inviting && <InviteCard coachId={coachId} onClose={() => setInviting(false)} />}

        {athletes.isPending && <LoadingBlock />}
        {athletes.isError && <Alert tone="error">{errorMessage(athletes.error)}</Alert>}
        {athletes.data && active.length === 0 && (
          <EmptyState title="Aucun athlète pour l’instant">
            Crée un lien d’invitation et envoie-le par SMS ou WhatsApp : l’athlète crée son compte en un clic et
            apparaît ici.
          </EmptyState>
        )}
        {active.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {active.map((link) => (
              <AthleteItem key={link.athlete_id} link={link} />
            ))}
          </ul>
        )}

        {pending.length > 0 && (
          <Card title="Invitations en attente" description="Chaque lien ne sert qu’une fois et expire au bout de 14 jours.">
            <ul className="divide-y divide-slate-100">
              {pending.map((invitation) => (
                <PendingInvitation key={invitation.id} coachId={coachId} invitation={invitation} />
              ))}
            </ul>
          </Card>
        )}

        {archived.length > 0 && (
          <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <summary className="cursor-pointer font-semibold text-slate-900">
              Athlètes archivés ({archived.length})
            </summary>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {archived.map((link) => (
                <AthleteItem key={link.athlete_id} link={link} />
              ))}
            </ul>
          </details>
        )}
      </div>
    </>
  )
}

function AthleteItem({ link }: { link: CoachLink }) {
  const name = link.athlete_name || link.athlete_email
  return (
    <li>
      <Link
        to={`/athletes/${link.athlete_id}`}
        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-800">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-slate-900">{name}</span>
          <span className="block truncate text-sm text-slate-500">Suivi depuis le {formatDate(link.linked_at)}</span>
        </span>
        <span aria-hidden="true" className="text-slate-400">
          →
        </span>
      </Link>
    </li>
  )
}

function InviteCard({ coachId, onClose }: { coachId: string; onClose: () => void }) {
  const create = useCreateInvitation(coachId)
  const [athleteName, setAthleteName] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    create.mutate(athleteName)
  }

  return (
    <Card
      title="Inviter un athlète"
      description="Un lien personnel à envoyer à l’athlète : il crée son compte et rejoint ta liste."
      actions={
        <Button variant="ghost" onClick={onClose}>
          Fermer
        </Button>
      }
    >
      {create.data ? (
        <div className="space-y-4">
          <Alert tone="success">
            Lien créé{create.data.athlete_name ? ` pour ${create.data.athlete_name}` : ''} : envoie-le par SMS, WhatsApp
            ou e-mail.
          </Alert>
          <InvitationLink token={create.data.token} athleteName={create.data.athlete_name} />
          <Button
            variant="ghost"
            onClick={() => {
              create.reset()
              setAthleteName('')
            }}
          >
            Inviter quelqu’un d’autre
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <TextField
              label="Prénom de l’athlète (facultatif)"
              value={athleteName}
              maxLength={120}
              onChange={(event) => setAthleteName(event.target.value)}
              placeholder="Léa"
            />
          </div>
          <Button type="submit" busy={create.isPending}>
            Créer le lien
          </Button>
        </form>
      )}
      {create.isError && (
        <div className="mt-3">
          <Alert tone="error">{errorMessage(create.error)}</Alert>
        </div>
      )}
    </Card>
  )
}

function PendingInvitation({ coachId, invitation }: { coachId: string; invitation: Invitation }) {
  const revoke = useRevokeInvitation(coachId)
  const [showLink, setShowLink] = useState(false)

  return (
    <li className="space-y-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-slate-900">{invitation.athlete_name || 'Invitation sans prénom'}</p>
          <p className="text-sm text-slate-500">
            Créée le {formatShortDate(invitation.created_at)} · expire le {formatShortDate(invitation.expires_at)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setShowLink(!showLink)} aria-expanded={showLink}>
            {showLink ? 'Masquer' : 'Voir le lien'}
          </Button>
          <Button
            variant="danger"
            busy={revoke.isPending}
            onClick={() => {
              if (window.confirm('Annuler cette invitation ? Le lien ne fonctionnera plus.')) revoke.mutate(invitation.id)
            }}
          >
            Annuler
          </Button>
        </div>
      </div>
      {showLink && <InvitationLink token={invitation.token} athleteName={invitation.athlete_name} />}
      {revoke.isError && <Alert tone="error">{errorMessage(revoke.error)}</Alert>}
    </li>
  )
}
