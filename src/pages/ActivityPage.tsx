import { useParams } from 'react-router'
import { useAthleteProfile } from '../api/athletes.ts'
import { useGarminActivity } from '../api/garmin.ts'
import { useExchangeNames } from '../api/names.ts'
import { useMyProfile } from '../api/profile.ts'
import { ActivityDetailView } from '../components/activity/ActivityDetailView.tsx'
import { Alert, EmptyState, LoadingBlock, PageHeader } from '../components/ui.tsx'
import { formatLongDay } from '../domain/calendar.ts'
import { garminSportLabel } from '../domain/garmin.ts'
import { formatTime } from '../domain/messages.ts'
import { errorMessage } from '../lib/errors.ts'

/** Une activité Garmin sans séance prévue (sortie libre) : chiffres, courbes, zones, tours. */
export function ActivityPage() {
  const { activityId = '' } = useParams()
  const me = useMyProfile()
  const role = me.data?.role
  const activity = useGarminActivity(activityId)
  const profile = useAthleteProfile(activity.data?.athlete_id ?? '')
  const names = useExchangeNames(role)

  if (activity.isPending || me.isPending) return <LoadingBlock />
  if (activity.isError) return <Alert tone="error">{errorMessage(activity.error)}</Alert>
  const a = activity.data
  const back =
    role === 'coach'
      ? { to: a ? `/athletes/${a.athlete_id}?date=${a.local_date}` : '/planning', label: 'Planning' }
      : { to: '/aujourdhui', label: 'Aujourd’hui' }
  if (!a) {
    return (
      <>
        <PageHeader title="Activité introuvable" back={back} />
        <EmptyState title="Cette activité a été supprimée, ou elle ne te concerne pas." />
      </>
    )
  }

  return (
    <>
      <PageHeader
        back={back}
        title={a.name || garminSportLabel(a.activity_type)}
        subtitle={[
          `⌚ Sortie libre · ${formatLongDay(a.local_date)} à ${formatTime(a.start_time)}`,
          role === 'coach' ? names[a.athlete_id] : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      />
      <ActivityDetailView activity={a} zones={profile.data?.zones ?? []} />
    </>
  )
}
