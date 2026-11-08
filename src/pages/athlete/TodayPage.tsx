import { useState } from 'react'
import { Link } from 'react-router'
import { useAthleteProfile, useMyCoaches } from '../../api/athletes.ts'
import { useUpcomingRaces, useWorkouts } from '../../api/planning.ts'
import { useMyProfile } from '../../api/profile.ts'
import { useUserId } from '../../auth/auth-context.ts'
import { PriorityBadge } from '../../components/RaceEditor.tsx'
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
                  </article>
                ))}
              </div>
            )}
          </Card>

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
