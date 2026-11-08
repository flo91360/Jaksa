import { Link, useParams } from 'react-router'
import { useAthleteProfile } from '../api/athletes.ts'
import { useWorkoutGarminActivity } from '../api/garmin.ts'
import { useExchangeNames } from '../api/names.ts'
import { useWorkout } from '../api/planning.ts'
import { useMyProfile } from '../api/profile.ts'
import { useUserId } from '../auth/auth-context.ts'
import { ActivityDetailView } from '../components/activity/ActivityDetailView.tsx'
import { WorkoutExchanges } from '../components/exchanges/WorkoutExchanges.tsx'
import { Alert, Card, EmptyState, LoadingBlock, PageHeader } from '../components/ui.tsx'
import { FitExport, WorkoutView } from '../components/workout/WorkoutView.tsx'
import { formatLongDay } from '../domain/calendar.ts'
import { errorMessage } from '../lib/errors.ts'

/**
 * Une séance : ce qu'a mesuré la montre (chiffres, prévu / réalisé, courbes, zones, tours), le retour
 * de l'athlète et les commentaires. Ouverte au clic sur une séance faite dans le planning du coach,
 * et par les liens des e-mails.
 */
export function WorkoutPage() {
  const { workoutId = '' } = useParams()
  const meId = useUserId()
  const me = useMyProfile()
  const role = me.data?.role
  const workout = useWorkout(workoutId)
  const profile = useAthleteProfile(workout.data?.athlete_id ?? '')
  const names = useExchangeNames(role)
  const garmin = useWorkoutGarminActivity(workoutId)

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

  const exchanges = (
    <Card title="Retour et commentaires">
      <WorkoutExchanges workout={w} zones={zones} role={role} meId={meId} names={names} />
    </Card>
  )
  const planned = (
    <Card title="La séance prévue">
      <div className="space-y-3">
        <WorkoutView workout={w} zones={zones} />
        {role === 'athlete' && <FitExport workout={w} zones={zones} />}
        {role === 'coach' && (
          <Link
            to={`/athletes/${w.athlete_id}?date=${w.scheduled_on}&modifier=${w.id}`}
            className="inline-flex text-sm font-medium text-emerald-800 underline"
          >
            Modifier la séance dans le planning de {athleteName || 'l’athlète'}
          </Link>
        )}
      </div>
    </Card>
  )

  return (
    <>
      <PageHeader
        back={back}
        title={w.title}
        subtitle={[formatLongDay(w.scheduled_on), role === 'coach' ? athleteName : null].filter(Boolean).join(' · ')}
      />
      {garmin.data ? (
        <div className="space-y-6">
          <ActivityDetailView activity={garmin.data} zones={zones} workout={w} aside={exchanges} />
          {planned}
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
          <div className="lg:order-2">{exchanges}</div>
          <div className="lg:order-1">{planned}</div>
        </div>
      )}
    </>
  )
}
