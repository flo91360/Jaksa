import { useState } from 'react'
import { Link } from 'react-router'
import { useAthleteProfile, useMyCoaches } from '../../api/athletes.ts'
import { isMissingRelation, useWorkoutActivity } from '../../api/exchanges.ts'
import { useExchangeNames } from '../../api/names.ts'
import { useUpcomingRaces, useWorkouts } from '../../api/planning.ts'
import { useMyProfile } from '../../api/profile.ts'
import { useUserId } from '../../auth/auth-context.ts'
import { PriorityBadge } from '../../components/RaceEditor.tsx'
import { WorkoutExchanges } from '../../components/exchanges/WorkoutExchanges.tsx'
import { RecentGarminCard } from '../../components/garmin/Garmin.tsx'
import { FEEDBACK_STATUS } from '../../domain/feedback.ts'
import { Alert, Card, EmptyState, LoadingBlock, PageHeader } from '../../components/ui.tsx'
import { FitExport, WorkoutView } from '../../components/workout/WorkoutView.tsx'
import { KIND_STYLES } from '../../components/workout/kindStyles.ts'
import { addDays, formatLongDay, formatRelativeDays, todayIso } from '../../domain/calendar.ts'
import { formatRaceDetails, groupByDate } from '../../domain/planning.ts'
import { formatTotals, workoutTotals } from '../../domain/workouts.ts'
import type { HrZone } from '../../domain/zones.ts'
import type { Workout } from '../../lib/database.types.ts'
import { errorMessage } from '../../lib/errors.ts'
import { firstName } from '../../lib/format.ts'

/** Accueil de l'athlète : séance du jour, semaine à venir, prochaine course. */
export function TodayPage() {
  const athleteId = useUserId()
  const me = useMyProfile()
  const coaches = useMyCoaches(athleteId)
  const profile = useAthleteProfile(athleteId)
  const [today] = useState(() => todayIso())
  const workouts = useWorkouts([athleteId], today, addDays(today, 7))
  const races = useUpcomingRaces(athleteId, today)
  const names = useExchangeNames('athlete')
  const name = firstName(me.data?.full_name ?? '')
  const zones = profile.data?.zones ?? []

  const byDay = groupByDate(workouts.data ?? [], (w) => w.scheduled_on)
  const todays = byDay.get(today) ?? []
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i + 1))
  const race = races.data?.[0]

  return (
    <>
      <PageHeader title={name ? `Bonjour ${name}` : 'Bonjour'} subtitle={formatLongDay(today)} />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Card title="Ta séance du jour">
            {workouts.isPending || profile.isPending ? (
              <LoadingBlock />
            ) : workouts.isError ? (
              <Alert tone="error">{errorMessage(workouts.error)}</Alert>
            ) : todays.length === 0 ? (
              <EmptyState title="Rien de prévu aujourd’hui">Profite pour récupérer, ou regarde ta semaine.</EmptyState>
            ) : (
              <div className="divide-y divide-slate-100">
                {todays.map((workout) => (
                  <article key={workout.id} className="space-y-3 py-3 first:pt-0 last:pb-0">
                    <h3 className="text-xl font-bold text-slate-900">{workout.title}</h3>
                    <WorkoutView workout={workout} zones={zones} />
                    <FitExport workout={workout} zones={zones} />
                    <div className="border-t border-slate-100 pt-3">
                      <WorkoutExchanges workout={workout} zones={zones} role="athlete" meId={athleteId} names={names} />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Card>

          <RecentWorkouts athleteId={athleteId} today={today} />

          <Card title="Ta semaine">
            {workouts.isPending ? (
              <LoadingBlock />
            ) : (
              <ol className="divide-y divide-slate-100">
                {week.map((date) => (
                  <li key={date} className="py-2.5 first:pt-0 last:pb-0">
                    <p className="text-sm font-semibold text-slate-700">{formatLongDay(date)}</p>
                    {(byDay.get(date) ?? []).length === 0 ? (
                      <p className="text-sm text-slate-500">Repos ou rien de prévu</p>
                    ) : (
                      <ul className="mt-1 space-y-1.5">
                        {(byDay.get(date) ?? []).map((workout) => (
                          <li key={workout.id}>
                            <UpcomingWorkout workout={workout} zones={zones} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <RecentGarminCard athleteId={athleteId} />

          {race && (
            <Card title="Prochain objectif">
              <div className="flex items-start gap-3">
                <PriorityBadge priority={race.priority} />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{race.name}</p>
                  <p className="text-sm text-slate-600">
                    {[formatLongDay(race.race_on), formatRaceDetails(race)].filter(Boolean).join(' · ')}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-emerald-800">{formatRelativeDays(today, race.race_on)}</p>
                </div>
              </div>
            </Card>
          )}

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

          <p className="px-1 text-sm text-slate-600">
            Tes zones et tes courses sont dans{' '}
            <Link to="/mon-profil" className="font-medium text-emerald-800 underline">
              Mon profil
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  )
}

function UpcomingWorkout({ workout, zones }: { workout: Workout; zones: HrZone[] }) {
  const totals = formatTotals(workoutTotals(workout.steps, zones))
  return (
    <details className={`group rounded-xl border border-l-4 border-slate-200 bg-white ${KIND_STYLES[workout.kind].card}`}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-slate-900">{workout.title}</span>
          {totals && <span className="block text-xs text-slate-500">{totals}</span>}
        </span>
        <span aria-hidden="true" className="text-slate-400 transition group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="space-y-3 border-t border-slate-100 p-3">
        <WorkoutView workout={workout} zones={zones} />
        <FitExport workout={workout} zones={zones} />
      </div>
    </details>
  )
}

/** Les 7 derniers jours : séances faites ou non, et celles qui attendent un retour. */
function RecentWorkouts({ athleteId, today }: { athleteId: string; today: string }) {
  const from = addDays(today, -7)
  const to = addDays(today, -1)
  const workouts = useWorkouts([athleteId], from, to)
  const activity = useWorkoutActivity([athleteId], from, to)
  if (isMissingRelation(activity.error) || !workouts.data || !activity.data) return null
  const list = workouts.data.filter((w) => w.kind !== 'rest').reverse()
  if (list.length === 0) return null
  const missing = list.filter((w) => !activity.data.get(w.id)?.status).length
  return (
    <Card
      title="Tes dernières séances"
      description={missing > 0 ? `${missing} séance${missing > 1 ? 's' : ''} sans retour : ton coach aimerait savoir comment ça s’est passé.` : undefined}
    >
      <ul className="divide-y divide-slate-100">
        {list.map((workout) => {
          const a = activity.data.get(workout.id)
          return (
            <li key={workout.id}>
              <Link to={`/seance/${workout.id}`} className="flex min-h-12 items-center gap-3 py-2 hover:bg-slate-50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-900">{workout.title}</span>
                  <span className="block text-xs text-slate-500">{formatLongDay(workout.scheduled_on)}</span>
                </span>
                {a?.status ? (
                  <span className="shrink-0 text-right text-xs">
                    <span className="block font-semibold text-slate-700">
                      {FEEDBACK_STATUS[a.status].icon} {FEEDBACK_STATUS[a.status].short}
                      {a.rpe ? ` · RPE ${a.rpe}` : ''}
                    </span>
                    <span className={a.coach_seen_at ? 'text-emerald-700' : 'text-slate-400'}>
                      {a.coach_seen_at ? '✓ Vu par le coach' : 'Pas encore vu'}
                    </span>
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                    Faire mon retour
                  </span>
                )}
                {a && a.unread_comments > 0 && <span className="size-2 rounded-full bg-red-600" aria-label="nouveau commentaire" />}
              </Link>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
