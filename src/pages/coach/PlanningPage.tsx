import { Link } from 'react-router'
import { useAthleteProfiles, useCoachAthletes } from '../../api/athletes.ts'
import { useUserId } from '../../auth/auth-context.ts'
import { PlanningBoard } from '../../components/calendar/PlanningBoard.tsx'
import { CoachInbox } from '../../components/exchanges/CoachInbox.tsx'
import { Alert, EmptyState, LoadingBlock, PageHeader } from '../../components/ui.tsx'
import type { AthleteOption } from '../../components/workout/WorkoutEditor.tsx'
import { errorMessage } from '../../lib/errors.ts'

/** Calendrier « tous mes athlètes » (athlètes actifs). */
export function PlanningPage() {
  const coachId = useUserId()
  const links = useCoachAthletes(coachId)
  const active = (links.data ?? []).filter((link) => link.status === 'active')
  const profiles = useAthleteProfiles(active.map((link) => link.athlete_id))

  if (links.isPending || (active.length > 0 && profiles.isPending)) return <LoadingBlock />
  if (links.isError || profiles.isError) return <Alert tone="error">{errorMessage(links.error ?? profiles.error)}</Alert>

  const athletes: AthleteOption[] = active.map((link) => ({
    id: link.athlete_id,
    name: link.athlete_name || link.athlete_email,
    zones: profiles.data?.find((p) => p.athlete_id === link.athlete_id)?.zones ?? [],
    mode: link.mode,
  }))

  return (
    <>
      <PageHeader
        title="Planning"
        subtitle={athletes.length > 0 ? `Tous mes athlètes (${athletes.length})` : undefined}
      />
      {athletes.length === 0 ? (
        <EmptyState title="Aucun athlète à planifier">
          Invite tes athlètes depuis la page{' '}
          <Link to="/athletes" className="font-medium text-emerald-800 underline">
            Athlètes
          </Link>{' '}
          : leurs séances apparaîtront ici.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          <CoachInbox coachId={coachId} names={Object.fromEntries(athletes.map((a) => [a.id, a.name]))} />
          <PlanningBoard athletes={athletes} multi />
        </div>
      )}
    </>
  )
}
