import { Link, useParams } from 'react-router'
import { useAthleteProfile } from '../api/athletes.ts'
import { useExchangeNames } from '../api/names.ts'
import { useWorkout } from '../api/planning.ts'
import { useMyProfile } from '../api/profile.ts'
import { useUserId } from '../auth/auth-context.ts'
import { WorkoutExchanges } from '../components/exchanges/WorkoutExchanges.tsx'
import { Alert, Card, EmptyState, LoadingBlock, PageHeader } from '../components/ui.tsx'
import { FitExport, WorkoutView } from '../components/workout/WorkoutView.tsx'
import { formatLongDay } from '../domain/calendar.ts'
import { errorMessage } from '../lib/errors.ts'

/** Une séance, son retour et ses commentaires (lien des e-mails, pour le coach comme pour l'athlète). */
export function WorkoutPage() {
  const { workoutId = '' } = useParams()
  const meId = useUserId()
  const me = useMyProfile()
  const role = me.data?.role
  const workout = useWorkout(workoutId)
  const profile = useAthleteProfile(workout.data?.athlete_id ?? '')
  const names = useExchangeNames(role)

  if (workout.isPending || me.isPending) return <LoadingBlock />
  if (workout.isError) return <Alert tone="error">{errorMessage(workout.error)}</Alert>
  const back =
    role === 'coach'
      ? { to: workout.data ? `/athletes/${workout.data.athlete_id}?date=${workout.data.scheduled_on}` : '/planning', label: 'Planning' }
      : { to: '/aujourdhui', label: 'Aujourd’hui' }
  if (!workout.data || !role) {
    return (
      <>
        <PageHeader title="Séance introuvable" back={back} />
        <EmptyState title="Cette séance a été supprimée, ou elle ne te concerne pas." />
      </>
    )
  }

  const w = workout.data
  const zones = profile.data?.zones ?? []
  const athleteName = names[w.athlete_id]

  return (
    <>
      <PageHeader
        back={back}
        title={w.title}
        subtitle={[formatLongDay(w.scheduled_on), role === 'coach' ? athleteName : null].filter(Boolean).join(' · ')}
      />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card title="Retour et commentaires" className="lg:order-2">
          <WorkoutExchanges workout={w} zones={zones} role={role} meId={meId} names={names} />
        </Card>
        <Card title="La séance prévue" className="lg:order-1">
          <div className="space-y-3">
            <WorkoutView workout={w} zones={zones} />
            {role === 'athlete' && <FitExport workout={w} zones={zones} />}
            {role === 'coach' && (
              <Link
                to={`/athletes/${w.athlete_id}?date=${w.scheduled_on}`}
                className="inline-flex text-sm font-medium text-emerald-800 underline"
              >
                Modifier dans le planning de {athleteName || 'l’athlète'}
              </Link>
            )}
          </div>
        </Card>
      </div>
    </>
  )
}
