import { Link } from 'react-router'
import { isMissingRelation } from '../../api/exchanges.ts'
import { GarminImportError, useGarminImport, useLastGarminSync, useRecentGarminActivities } from '../../api/garmin.ts'
import { todayIso } from '../../domain/calendar.ts'
import { activityFigures, garminSportLabel } from '../../domain/garmin.ts'
import { formatDayLabel, formatTime, localDay } from '../../domain/messages.ts'
import type { GarminActivity } from '../../lib/database.types.ts'
import { errorMessage } from '../../lib/errors.ts'
import { Alert, Button, Card } from '../ui.tsx'

/** Mention exigée par Garmin à côté de ses données. */
export function GarminAttribution() {
  return <span className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Garmin Connect</span>
}

/** Chiffres mesurés par la montre pour une séance (vu par l'athlète et par son coach). */
export function GarminActivityCard({ activity }: { activity: GarminActivity }) {
  const figures = activityFigures(activity)
  return (
    <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-3" aria-label="Activité mesurée par la montre">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-sky-900 uppercase">⌚ Mesuré par la montre</p>
          <p className="truncate font-semibold text-slate-900">{activity.name || garminSportLabel(activity.activity_type)}</p>
          <p className="text-xs text-slate-600">
            {formatDayLabel(localDay(activity.start_time), todayIso())} à {formatTime(activity.start_time)}
          </p>
        </div>
        <GarminAttribution />
      </div>
      {figures.length > 0 && (
        <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
          {figures.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11px] text-slate-500">{label}</dt>
              <dd className="text-sm font-semibold whitespace-nowrap text-slate-900 tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

/** Bouton d'import à la demande des activités Garmin (14 derniers jours). */
export function GarminImportButton({ athleteId }: { athleteId: string }) {
  const garminImport = useGarminImport(athleteId)
  const result = garminImport.data
  return (
    <div className="space-y-2">
      <Button variant="secondary" busy={garminImport.isPending} onClick={() => garminImport.mutate()}>
        Importer mes activités Garmin
      </Button>
      {result && (
        <p className="text-sm text-slate-600" role="status">
          {result.imported === 0
            ? 'Aucune activité sur les 14 derniers jours.'
            : `${result.imported} activité${result.imported > 1 ? 's' : ''} sur les 14 derniers jours, dont ${result.linked} rattachée${result.linked > 1 ? 's' : ''} à tes séances.`}
        </p>
      )}
      {garminImport.isError && (
        <Alert tone="error">
          {garminImport.error instanceof GarminImportError ? garminImport.error.message : errorMessage(garminImport.error)}
        </Alert>
      )}
    </div>
  )
}

/** Accueil de l'athlète : ses dernières activités Garmin, visible dès qu'il en a importé. */
export function RecentGarminCard({ athleteId }: { athleteId: string }) {
  const recent = useRecentGarminActivities(athleteId)
  if (isMissingRelation(recent.error) || !recent.data || recent.data.length === 0) return null
  return (
    <Card title="Ta montre" actions={<GarminAttribution />}>
      <ul className="mb-3 divide-y divide-slate-100">
        {recent.data.map((activity) => (
          <li key={activity.id} className="py-2 first:pt-0">
            <RecentActivity activity={activity} />
          </li>
        ))}
      </ul>
      <LastSync athleteId={athleteId} />
      <GarminImportButton athleteId={athleteId} />
    </Card>
  )
}

function RecentActivity({ activity }: { activity: GarminActivity }) {
  const summary = activityFigures(activity)
    .filter(([label]) => label === 'Durée' || label === 'Distance' || label === 'FC moy.')
    .map(([, value]) => value)
    .join(' · ')
  const content = (
    <>
      <span className="block truncate font-medium text-slate-900">{activity.name || garminSportLabel(activity.activity_type)}</span>
      <span className="block text-xs text-slate-500">
        {formatDayLabel(localDay(activity.start_time), todayIso())}
        {summary ? ` · ${summary}` : ''}
        {activity.workout_id ? '' : ' · pas de séance prévue ce jour-là'}
      </span>
    </>
  )
  return activity.workout_id ? (
    <Link to={`/seance/${activity.workout_id}`} className="block hover:bg-slate-50">
      {content}
    </Link>
  ) : (
    content
  )
}

/** « Import automatique toutes les 15 minutes, dernier à 18:45 », ou le problème rencontré. */
function LastSync({ athleteId }: { athleteId: string }) {
  const last = useLastGarminSync(athleteId)
  if (isMissingRelation(last.error) || !last.data) return null
  const when = `${formatDayLabel(localDay(last.data.ran_at), todayIso()).toLowerCase()} à ${formatTime(last.data.ran_at)}`
  if (last.data.status === 'garmin_key_rejected') {
    return (
      <div className="mb-3">
        <Alert tone="warning">
          L’import automatique est arrêté depuis {when} : Garmin refuse la clé, elle a sans doute expiré. Crée-en une
          nouvelle dans Garmin Connect et remplace-la dans Supabase.
        </Alert>
      </div>
    )
  }
  return (
    <p className="mb-3 text-xs text-slate-500">
      Import automatique toutes les 15 minutes · dernier passage {when}
      {last.data.status === 'ok' ? '' : ' (Garmin ne répondait pas, nouvel essai au prochain passage)'}
    </p>
  )
}
