import type { ReactNode } from 'react'
import { useActivityDetail } from '../../api/garmin.ts'
import {
  type ActivityDetail,
  type ActivityLap,
  type PlanRow,
  type TargetVerdict,
  VERDICT_LABELS,
  comparePlan,
  detailFigures,
  formatGap,
  formatLapTime,
  formatSpeed,
  isFootSport,
  routePath,
  timeInZones,
} from '../../domain/activityDetail.ts'
import { formatDistance, formatDuration, workoutTotals } from '../../domain/workouts.ts'
import type { HrZone } from '../../domain/zones.ts'
import type { GarminActivity, Workout } from '../../lib/database.types.ts'
import { errorMessage } from '../../lib/errors.ts'
import { GarminAttribution } from '../garmin/Garmin.tsx'
import { Alert, Card, Spinner } from '../ui.tsx'
import { zoneFill } from '../zoneColors.ts'
import { ActivityCharts } from './ActivityCharts.tsx'

/**
 * Tout ce que la montre a mesuré pour une activité : chiffres, comparaison avec la séance prévue,
 * courbes, temps par zone, tours et tracé. Les courbes et les tours viennent du fichier .FIT, lu
 * par l'import automatique ; en attendant, seuls les chiffres du résumé Garmin sont affichés.
 */
export function ActivityDetailView({
  activity,
  zones,
  workout,
  aside,
}: {
  activity: GarminActivity
  zones: HrZone[]
  workout?: Workout
  /** À côté des chiffres sur grand écran (retour de l'athlète et commentaires). */
  aside?: ReactNode
}) {
  const query = useActivityDetail(activity.id)
  const detail = query.data?.state === 'ok' ? query.data.detail : null
  const foot = isFootSport(activity.activity_type)
  const figures = detailFigures(activity, detail)

  return (
    <div className="space-y-6">
      <div className={aside ? 'grid items-start gap-6 lg:grid-cols-[3fr_2fr]' : ''}>
        <Card title="Ce qu’a mesuré la montre" actions={<GarminAttribution />}>
          <dl className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${aside ? '' : 'lg:grid-cols-6'}`}>
            {figures.map((figure) => (
              <div key={figure.label} className="rounded-xl bg-slate-50 px-3 py-2" title={figure.hint}>
                <dt className="text-xs text-slate-500">{figure.label}</dt>
                <dd className="text-lg font-semibold whitespace-nowrap text-slate-900 tabular-nums">{figure.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
        {aside}
      </div>

      {workout && workout.steps.length > 0 && (
        <PlanVsActual workout={workout} zones={zones} activity={activity} detail={detail} foot={foot} />
      )}

      {query.isPending ? (
        <div className="flex justify-center py-6 text-slate-400">
          <Spinner />
        </div>
      ) : query.isError ? (
        <Alert tone="error">{errorMessage(query.error)}</Alert>
      ) : detail ? (
        <>
          <Card title="Courbes">
            <ActivityCharts series={detail.series} foot={foot} zones={zones} laps={detail.laps} />
          </Card>
          <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
            <Card
              title="Temps par zone de FC"
              description={zones.length > 0 ? 'D’après les zones de la fiche de l’athlète.' : undefined}
            >
              <ZoneTimes detail={detail} zones={zones} />
            </Card>
            <RouteCard detail={detail} />
          </div>
          {detail.laps.length > 0 && (
            <Card title={`Tours (${detail.laps.length})`}>
              <LapTable laps={detail.laps} foot={foot} />
            </Card>
          )}
        </>
      ) : (
        <Alert tone="info">
          {query.data?.state === 'missing' ? (
            <>
              Garmin n’a pas fourni le fichier détaillé de cette activité : seuls les chiffres ci-dessus sont disponibles.
              {query.data.error && <span className="mt-1 block text-xs opacity-75">Raison : {query.data.error}</span>}
            </>
          ) : (
            'Les courbes, les zones et les tours arrivent avec le prochain import automatique (toutes les 15 minutes) pour les activités des 14 derniers jours.'
          )}
        </Alert>
      )}
    </div>
  )
}

// -----------------------------------------------------------------------------
// Prévu / réalisé
// -----------------------------------------------------------------------------

const VERDICT_CLASSES: Record<Exclude<TargetVerdict, null>, string> = {
  on: 'bg-emerald-100 text-emerald-800',
  fast: 'bg-sky-100 text-sky-800',
  slow: 'bg-amber-100 text-amber-900',
  high: 'bg-orange-100 text-orange-900',
  low: 'bg-sky-100 text-sky-800',
}

const VERDICT_ICONS: Record<Exclude<TargetVerdict, null>, string> = { on: '✓', fast: '↑', slow: '↓', high: '↑', low: '↓' }

function PlanVsActual({
  workout,
  zones,
  activity,
  detail,
  foot,
}: {
  workout: Workout
  zones: HrZone[]
  activity: GarminActivity
  detail: ActivityDetail | null
  foot: boolean
}) {
  const planned = workoutTotals(workout.steps, zones)
  const actualSeconds = activity.duration_s ?? detail?.session.elapsed_s ?? null
  const actualMeters = activity.distance_m ?? detail?.session.distance_m ?? null
  const { rows, matched } = comparePlan(workout.steps, zones, detail?.laps ?? [])
  const estimate = planned.complete ? '' : ' (estimation partielle)'

  return (
    <Card title="Prévu / réalisé">
      <div className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-80 text-sm tabular-nums">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="py-1 pr-3 font-medium" />
                <th className="py-1 pr-3 font-medium">Prévu{estimate}</th>
                <th className="py-1 pr-3 font-medium">Réalisé</th>
                <th className="py-1 font-medium">Écart</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <th className="py-1.5 pr-3 text-left font-medium text-slate-700">Durée</th>
                <td className="py-1.5 pr-3">{planned.seconds > 0 ? formatDuration(planned.seconds) : '—'}</td>
                <td className="py-1.5 pr-3 font-semibold">{actualSeconds ? formatDuration(actualSeconds) : '—'}</td>
                <td className="py-1.5 text-slate-600">{formatGap(actualSeconds, planned.seconds, 'seconds')}</td>
              </tr>
              <tr>
                <th className="py-1.5 pr-3 text-left font-medium text-slate-700">Distance</th>
                <td className="py-1.5 pr-3">{planned.meters > 0 ? formatDistance(planned.meters) : '—'}</td>
                <td className="py-1.5 pr-3 font-semibold">{actualMeters ? formatDistance(actualMeters) : '—'}</td>
                <td className="py-1.5 text-slate-600">{formatGap(actualMeters, planned.meters, 'meters')}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {matched ? (
          <div className="overflow-x-auto">
            <p className="mb-2 text-xs text-slate-500">
              La montre a suivi la séance : chaque étape prévue face au tour enregistré.
            </p>
            <table className="w-full min-w-[40rem] text-sm tabular-nums">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-1 pr-3 font-medium">Étape</th>
                  <th className="py-1 pr-3 font-medium">Prévu</th>
                  <th className="py-1 pr-3 font-medium">Cible</th>
                  <th className="py-1 pr-3 font-medium">Réalisé</th>
                  <th className="py-1 pr-3 font-medium">{foot ? 'Allure' : 'Vitesse'}</th>
                  <th className="py-1 pr-3 font-medium">FC moy.</th>
                  <th className="py-1 font-medium">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <PlanRowLine key={row.index} row={row} foot={foot} />
                ))}
              </tbody>
            </table>
          </div>
        ) : detail && detail.laps.length > 0 ? (
          <p className="text-xs text-slate-500">
            Les tours de la montre ne suivent pas les étapes de la séance (bouton tour ou kilomètre automatique) : ils sont
            détaillés plus bas.
          </p>
        ) : null}
      </div>
    </Card>
  )
}

function PlanRowLine({ row, foot }: { row: PlanRow; foot: boolean }) {
  const lap = row.lap
  const effort = row.kind === 'active'
  return (
    <tr className={effort ? 'bg-emerald-50/40' : ''}>
      <td className="py-1.5 pr-3">
        <span className={effort ? 'font-semibold text-slate-900' : 'text-slate-700'}>{row.label}</span>
        {row.repeat && <span className="ml-1 text-xs text-slate-500">{row.repeat}</span>}
      </td>
      <td className="py-1.5 pr-3 whitespace-nowrap">{row.planned}</td>
      <td className="py-1.5 pr-3 text-xs whitespace-nowrap text-slate-600">{row.target}</td>
      <td className="py-1.5 pr-3 whitespace-nowrap">
        {lap
          ? [formatLapTime(lap.duration_s), lap.distance_m ? formatDistance(lap.distance_m) : ''].filter(Boolean).join(' · ')
          : ''}
      </td>
      <td className="py-1.5 pr-3 whitespace-nowrap">{lap ? formatSpeed(lap.avg_speed, foot) : ''}</td>
      <td className="py-1.5 pr-3 whitespace-nowrap">{lap?.avg_hr ? `${lap.avg_hr} bpm` : ''}</td>
      <td className="py-1.5">
        {row.verdict && (
          <span
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap ${VERDICT_CLASSES[row.verdict]}`}
          >
            <span aria-hidden="true">{VERDICT_ICONS[row.verdict]}</span>
            {VERDICT_LABELS[row.verdict]}
          </span>
        )}
      </td>
    </tr>
  )
}

// -----------------------------------------------------------------------------
// Zones, tours, tracé
// -----------------------------------------------------------------------------

function ZoneTimes({ detail, zones }: { detail: ActivityDetail; zones: HrZone[] }) {
  if (!detail.series.hr) return <p className="text-sm text-slate-500">Pas de fréquence cardiaque enregistrée.</p>
  const times = timeInZones(detail.series, zones)
  if (times.length === 0) {
    return <p className="text-sm text-slate-500">Les zones de FC de l’athlète ne sont pas encore renseignées dans sa fiche.</p>
  }
  const longest = Math.max(...times.map((z) => z.seconds), 1)
  return (
    <ul className="space-y-2.5">
      {times.map((zone) => (
        <li key={zone.zone} className="grid grid-cols-[minmax(0,9rem)_1fr_7.5rem] items-center gap-3 text-sm">
          <span className="min-w-0">
            <span className="block truncate font-medium text-slate-800">
              Z{zone.zone} {zone.name}
            </span>
            <span className="block text-xs text-slate-500 tabular-nums">{zone.range} bpm</span>
          </span>
          <span className="h-3 rounded-full bg-slate-100" aria-hidden="true">
            <span
              className="block h-3 rounded-full"
              style={{
                width: `${(zone.seconds / longest) * 100}%`,
                backgroundColor: zoneFill(zone.zone),
                minWidth: zone.seconds > 0 ? 4 : 0,
              }}
            />
          </span>
          <span className="text-right whitespace-nowrap text-slate-700 tabular-nums">
            <span className="font-semibold text-slate-900">{zone.seconds > 0 ? formatDuration(zone.seconds) : '—'}</span>
            <span className="ml-1.5 inline-block w-10 text-xs text-slate-500">{Math.round(zone.share * 100)} %</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

function LapTable({ laps, foot }: { laps: ActivityLap[]; foot: boolean }) {
  const hasCadence = laps.some((l) => l.avg_cadence)
  const hasPower = laps.some((l) => l.avg_power)
  const hasAscent = laps.some((l) => l.ascent_m)
  const cumulative = laps.map((_, i) => laps.slice(0, i + 1).reduce((sum, l) => sum + (l.distance_m ?? 0), 0))
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm tabular-nums">
        <thead className="text-left text-xs text-slate-500">
          <tr>
            <th className="py-1 pr-3 font-medium">Tour</th>
            <th className="py-1 pr-3 font-medium">Durée</th>
            <th className="py-1 pr-3 font-medium">Distance</th>
            <th className="py-1 pr-3 font-medium">{foot ? 'Allure' : 'Vitesse'}</th>
            <th className="py-1 pr-3 font-medium">FC moy.</th>
            <th className="py-1 pr-3 font-medium">FC max</th>
            {hasAscent && <th className="py-1 pr-3 font-medium">D+</th>}
            {hasCadence && <th className="py-1 pr-3 font-medium">Cadence</th>}
            {hasPower && <th className="py-1 pr-3 font-medium">Puissance</th>}
            <th className="py-1 font-medium">Cumul</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {laps.map((lap, index) => {
            const effort = lap.intensity === 'active' && laps.some((l) => l.intensity && l.intensity !== 'active')
            return (
              <tr key={lap.start_s} className={effort ? 'bg-emerald-50/40 font-medium' : ''}>
                <td className="py-1.5 pr-3 text-slate-600">{index + 1}</td>
                <td className="py-1.5 pr-3">{formatLapTime(lap.duration_s)}</td>
                <td className="py-1.5 pr-3">{lap.distance_m !== null ? formatDistance(lap.distance_m) : ''}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap">{formatSpeed(lap.avg_speed, foot)}</td>
                <td className="py-1.5 pr-3">{lap.avg_hr ?? ''}</td>
                <td className="py-1.5 pr-3">{lap.max_hr ?? ''}</td>
                {hasAscent && <td className="py-1.5 pr-3">{lap.ascent_m !== null ? `${lap.ascent_m} m` : ''}</td>}
                {hasCadence && <td className="py-1.5 pr-3">{lap.avg_cadence ?? ''}</td>}
                {hasPower && <td className="py-1.5 pr-3">{lap.avg_power ? `${lap.avg_power} W` : ''}</td>}
                <td className="py-1.5 text-slate-500">{formatDistance(cumulative[index])}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const ROUTE_SIZE = 260

function RouteCard({ detail }: { detail: ActivityDetail }) {
  const route = routePath(detail.series, ROUTE_SIZE)
  if (!route) return null
  return (
    <Card title="Parcours" description="Tracé GPS, sans fond de carte.">
      <svg
        viewBox={`0 0 ${ROUTE_SIZE} ${ROUTE_SIZE}`}
        className="mx-auto block w-full max-w-72 rounded-xl bg-slate-50"
        role="img"
        aria-label="Tracé GPS de la sortie (départ en vert, arrivée en rouge)"
      >
        <path d={route.d} fill="none" className="stroke-emerald-700" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={route.start[0]} cy={route.start[1]} r={5} fill="#10b981" className="stroke-white" strokeWidth={2} />
        <circle cx={route.end[0]} cy={route.end[1]} r={5} fill="#dc2626" className="stroke-white" strokeWidth={2} />
      </svg>
    </Card>
  )
}
