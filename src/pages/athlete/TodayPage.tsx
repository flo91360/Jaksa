import { useState } from 'react'
import { Link } from 'react-router'
import { useAthleteProfile, useMyCoaches } from '../../api/athletes.ts'
import { useMyProfile } from '../../api/profile.ts'
import { useUserId } from '../../auth/auth-context.ts'
import { ZoneTable } from '../../components/ZoneTable.tsx'
import { Alert, Card, EmptyState, LoadingBlock, PageHeader } from '../../components/ui.tsx'
import { errorMessage } from '../../lib/errors.ts'
import { firstName } from '../../lib/format.ts'

const todayFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

export function TodayPage() {
  const athleteId = useUserId()
  const me = useMyProfile()
  const coaches = useMyCoaches(athleteId)
  const profile = useAthleteProfile(athleteId)
  const [today] = useState(() => todayFormatter.format(new Date()))
  const name = firstName(me.data?.full_name ?? '')

  return (
    <>
      <PageHeader title={name ? `Bonjour ${name}` : 'Bonjour'} subtitle={today.charAt(0).toUpperCase() + today.slice(1)} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Ta séance du jour">
          <EmptyState title="Rien de prévu pour l’instant">
            Les séances planifiées par ton coach s’afficheront ici (prochaine version de Rob1Coach).
          </EmptyState>
        </Card>

        <div className="space-y-6">
          <Card title="Ton coach">
            {coaches.isPending && <LoadingBlock />}
            {coaches.isError && <Alert tone="error">{errorMessage(coaches.error)}</Alert>}
            {coaches.data?.length === 0 && (
              <Alert tone="warning">
                Tu n’es rattaché à aucun coach. Ouvre le lien d’invitation qu’il t’a envoyé, ou demande-lui-en un
                nouveau.
              </Alert>
            )}
            <ul className="space-y-2">
              {coaches.data?.map((coach) => (
                <li key={coach.coach_id}>
                  <p className="font-semibold text-slate-900">{coach.coach_name || 'Ton coach'}</p>
                  <p className="text-sm text-slate-500">{coach.coach_email}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card
            title="Tes zones d’entraînement"
            actions={
              <Link to="/mon-profil" className="text-sm font-medium text-emerald-800 hover:underline">
                Mon profil
              </Link>
            }
          >
            {profile.isPending ? <LoadingBlock /> : <ZoneTable zones={profile.data?.zones ?? []} />}
          </Card>
        </div>
      </div>
    </>
  )
}
