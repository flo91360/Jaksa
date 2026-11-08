import { type DragEvent, type ReactNode, useState } from 'react'
import { Link } from 'react-router'
import {
  type CalendarView,
  type IsoDate,
  formatShortDay,
  isSameMonth,
  monthWeeks,
  weekDays,
} from '../../domain/calendar.ts'
import { activityFigures, garminSportLabel } from '../../domain/garmin.ts'
import { groupByDate } from '../../domain/planning.ts'
import { formatTotals, workoutTotals } from '../../domain/workouts.ts'
import type { HrZone } from '../../domain/zones.ts'
import type { GarminActivity, Race, Workout, WorkoutActivity } from '../../lib/database.types.ts'
import { firstName } from '../../lib/format.ts'
import { PriorityBadge } from '../RaceEditor.tsx'
import { ActivityBadges } from '../exchanges/ActivityBadges.tsx'
import { KIND_STYLES } from '../workout/kindStyles.ts'

export type CalendarAthlete = { id: string; name: string; zones: HrZone[] }

type Props = {
  view: CalendarView
  anchor: IsoDate
  today: IsoDate
  athletes: CalendarAthlete[]
  workouts: Workout[]
  races: Race[]
  /** Retours et commentaires, par séance (absent tant que la base n'est pas à jour). */
  activity?: Map<string, WorkoutActivity>
  /** Activités Garmin sans séance prévue (sorties libres). */
  freeActivities?: GarminActivity[]
  /** Séances qui ont une activité de la montre (⌚ sur la carte). */
  watched?: Set<string>
  /** Vue « tous mes athlètes » : une ligne par athlète, noms affichés. */
  multi: boolean
  onOpenWorkout: (workout: Workout) => void
  onCreate: (athleteId: string | null, date: IsoDate) => void
  onOpenRace: (race: Race) => void
  /** Glisser-déposer : déplacement, ou copie (touche Alt/Ctrl, ou autre athlète). */
  onDrop: (workout: Workout, target: { athleteId: string; date: IsoDate }, copy: boolean) => void
  /** Clic sur un jour de la vue mois. */
  onShowWeek: (date: IsoDate) => void
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const DRAG_TYPE = 'application/x-rob1coach-workout'

export function PlanningCalendar(props: Props) {
  const [dragOver, setDragOver] = useState<string | null>(null)
  const byDay = groupByDate(props.workouts, (w) => w.scheduled_on)
  const racesByDay = groupByDate(props.races, (r) => r.race_on)
  const freeByDay = groupByDate(props.freeActivities ?? [], (a) => a.local_date)
  const athletesById = new Map(props.athletes.map((a) => [a.id, a]))

  /** Propriétés d'une case qui accepte le dépôt d'une séance. */
  const dropZone = (key: string, date: IsoDate, athleteId: string | null) => ({
    onDragOver: (event: DragEvent) => {
      if (!event.dataTransfer.types.includes(DRAG_TYPE)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = event.altKey || event.ctrlKey || event.metaKey ? 'copy' : 'move'
      if (dragOver !== key) setDragOver(key)
    },
    onDragLeave: (event: DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(null)
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault()
      setDragOver(null)
      const id = event.dataTransfer.getData(DRAG_TYPE)
      const workout = props.workouts.find((w) => w.id === id)
      if (!workout) return
      const targetAthlete = athleteId ?? workout.athlete_id
      const copy = event.altKey || event.ctrlKey || event.metaKey || targetAthlete !== workout.athlete_id
      if (!copy && workout.scheduled_on === date) return
      props.onDrop(workout, { athleteId: targetAthlete, date }, copy)
    },
    'data-drop-active': dragOver === key || undefined,
  })

  const card = (workout: Workout, options: { compact?: boolean; showName?: boolean } = {}) => (
    <WorkoutCard
      key={workout.id}
      workout={workout}
      athlete={athletesById.get(workout.athlete_id)}
      activity={props.activity?.get(workout.id)}
      watched={props.watched?.has(workout.id) ?? false}
      compact={options.compact}
      showName={options.showName}
      onOpen={() => props.onOpenWorkout(workout)}
    />
  )

  const raceChips = (date: IsoDate, athleteId: string | null, compact = false) =>
    (racesByDay.get(date) ?? [])
      .filter((race) => athleteId === null || race.athlete_id === athleteId)
      .map((race) => (
        <button
          key={race.id}
          type="button"
          onClick={() => props.onOpenRace(race)}
          className="flex w-full items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-1.5 py-1 text-left text-xs font-semibold text-rose-900 hover:bg-rose-100"
        >
          <PriorityBadge priority={race.priority} />
          <span className="min-w-0 truncate">
            {props.multi && !compact ? `${firstName(athletesById.get(race.athlete_id)?.name ?? '')} · ` : ''}
            {race.name}
          </span>
        </button>
      ))

  /** Courses et sorties libres d'un jour (d'un athlète, ou de tous). */
  const dayExtras = (date: IsoDate, athleteId: string | null, compact = false) => [
    ...raceChips(date, athleteId, compact),
    ...(freeByDay.get(date) ?? [])
      .filter((a) => athleteId === null || a.athlete_id === athleteId)
      .map((a) => (
        <FreeActivityChip
          key={a.id}
          activity={a}
          athleteName={props.multi && !compact ? firstName(athletesById.get(a.athlete_id)?.name ?? '') : ''}
        />
      )),
  ]

  if (props.view === 'month') {
    const weeks = monthWeeks(props.anchor)
    return (
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold text-slate-500">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="py-2">
              {label}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} className="grid grid-cols-7 border-b border-slate-100 last:border-b-0">
            {week.map((date) => {
              const items = byDay.get(date) ?? []
              const inMonth = isSameMonth(date, props.anchor)
              return (
                <div
                  key={date}
                  {...dropZone(`m-${date}`, date, null)}
                  className={`group min-h-20 min-w-0 space-y-1 border-r border-slate-100 p-1 last:border-r-0 data-drop-active:bg-emerald-50 sm:min-h-28 sm:p-1.5 ${inMonth ? '' : 'bg-slate-50/70'}`}
                >
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => props.onShowWeek(date)}
                      aria-label={`Voir la semaine du ${date}`}
                      className={`inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold ${date === props.today ? 'bg-emerald-700 text-white' : inMonth ? 'text-slate-800 hover:bg-slate-100' : 'text-slate-400'}`}
                    >
                      {Number(date.slice(8))}
                    </button>
                    <AddButton
                      label={`Ajouter une séance le ${date}`}
                      className="hidden sm:inline-flex sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                      onClick={() => props.onCreate(props.multi ? null : (props.athletes[0]?.id ?? null), date)}
                    />
                  </div>
                  {dayExtras(date, null, true)}
                  {/* Téléphone : pastilles ; ordinateur : titres. */}
                  <div className="flex flex-wrap gap-1 sm:hidden">
                    {items.map((workout) => (
                      <button
                        key={workout.id}
                        type="button"
                        onClick={() => props.onOpenWorkout(workout)}
                        aria-label={workout.title}
                        className={`size-3 rounded-full ${KIND_STYLES[workout.kind].dot} ${props.activity?.get(workout.id)?.status ? 'ring-2 ring-emerald-300' : ''}`}
                      />
                    ))}
                  </div>
                  <div className="hidden space-y-1 sm:block">
                    {items.slice(0, props.multi ? 4 : 3).map((workout) => card(workout, { compact: true, showName: props.multi }))}
                    {items.length > (props.multi ? 4 : 3) && (
                      <button
                        type="button"
                        onClick={() => props.onShowWeek(date)}
                        className="w-full text-left text-xs font-medium text-emerald-800 hover:underline"
                      >
                        + {items.length - (props.multi ? 4 : 3)} autre{items.length - (props.multi ? 4 : 3) > 1 ? 's' : ''}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    )
  }

  const days = weekDays(props.anchor)

  if (!props.multi) {
    const athleteId = props.athletes[0]?.id ?? null
    return (
      <div className="grid gap-2 md:grid-cols-7">
        {days.map((date) => (
          <DayColumn
            key={date}
            date={date}
            today={props.today}
            dropProps={dropZone(`w-${date}`, date, athleteId)}
            onAdd={() => props.onCreate(athleteId, date)}
          >
            {dayExtras(date, athleteId)}
            {(byDay.get(date) ?? []).map((workout) => card(workout))}
          </DayColumn>
        ))}
      </div>
    )
  }

  return (
    <>
      {/* Ordinateur : une ligne par athlète. */}
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
        <div className="grid min-w-[56rem] grid-cols-[9rem_repeat(7,minmax(0,1fr))]">
          <div className="border-b border-slate-200 bg-slate-50" />
          {days.map((date) => (
            <div
              key={date}
              className={`border-b border-l border-slate-200 px-2 py-2 text-center text-xs font-semibold ${date === props.today ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-600'}`}
            >
              {formatShortDay(date)}
            </div>
          ))}
          {props.athletes.map((athlete) => (
            <AthleteRow key={athlete.id}>
              <div className="flex items-start border-b border-slate-100 px-3 py-2">
                <span className="truncate text-sm font-semibold text-slate-900" title={athlete.name}>
                  {athlete.name}
                </span>
              </div>
              {days.map((date) => {
                const items = (byDay.get(date) ?? []).filter((w) => w.athlete_id === athlete.id)
                return (
                  <div
                    key={date}
                    {...dropZone(`${athlete.id}-${date}`, date, athlete.id)}
                    className={`group min-h-20 space-y-1 border-b border-l border-slate-100 p-1.5 data-drop-active:bg-emerald-50 ${date === props.today ? 'bg-emerald-50/40' : ''}`}
                  >
                    {dayExtras(date, athlete.id, true)}
                    {items.map((workout) => card(workout, { compact: true }))}
                    <AddButton
                      label={`Ajouter une séance pour ${athlete.name} le ${date}`}
                      className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                      onClick={() => props.onCreate(athlete.id, date)}
                    />
                  </div>
                )
              })}
            </AthleteRow>
          ))}
        </div>
      </div>

      {/* Téléphone : jour par jour, avec le prénom de l'athlète. */}
      <div className="space-y-2 md:hidden">
        {days.map((date) => (
          <DayColumn key={date} date={date} today={props.today} dropProps={{}} onAdd={() => props.onCreate(null, date)}>
            {dayExtras(date, null)}
            {(byDay.get(date) ?? []).map((workout) => card(workout, { showName: true }))}
          </DayColumn>
        ))}
      </div>
    </>
  )
}

function AthleteRow({ children }: { children: ReactNode }) {
  return <div className="contents">{children}</div>
}

function DayColumn({
  date,
  today,
  dropProps,
  onAdd,
  children,
}: {
  date: IsoDate
  today: IsoDate
  dropProps: object
  onAdd: () => void
  children: ReactNode
}) {
  const isToday = date === today
  return (
    <section
      {...dropProps}
      aria-label={date}
      className={`flex min-w-0 flex-col gap-1.5 rounded-2xl border bg-white p-2 shadow-sm data-drop-active:border-emerald-400 data-drop-active:bg-emerald-50 md:min-h-48 ${isToday ? 'border-emerald-300' : 'border-slate-200'}`}
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <h3 className={`text-sm font-semibold capitalize ${isToday ? 'text-emerald-800' : 'text-slate-700'}`}>
          {formatShortDay(date)}
          {isToday && <span className="ml-1.5 text-xs font-medium normal-case">· aujourd’hui</span>}
        </h3>
        <AddButton label={`Ajouter une séance le ${date}`} onClick={onAdd} />
      </div>
      {children}
    </section>
  )
}

function AddButton({ label, onClick, className = '' }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title="Ajouter une séance"
      className={`inline-flex size-8 items-center justify-center rounded-lg text-lg text-emerald-800 hover:bg-emerald-50 ${className}`}
    >
      +
    </button>
  )
}

function WorkoutCard({
  workout,
  athlete,
  activity,
  watched,
  compact = false,
  showName = false,
  onOpen,
}: {
  workout: Workout
  athlete?: CalendarAthlete
  activity?: WorkoutActivity
  watched: boolean
  compact?: boolean
  showName?: boolean
  onOpen: () => void
}) {
  const totals = formatTotals(workoutTotals(workout.steps, athlete?.zones ?? []))
  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, workout.id)
        event.dataTransfer.effectAllowed = 'copyMove'
      }}
      onClick={onOpen}
      className={`block w-full min-w-0 cursor-grab rounded-lg border border-l-4 border-slate-200 bg-white text-left shadow-xs hover:border-slate-300 hover:shadow active:cursor-grabbing ${KIND_STYLES[workout.kind].card} ${compact ? 'px-1.5 py-1' : 'px-2.5 py-2'}`}
    >
      {showName && athlete && (
        <span className="block truncate text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
          {compact ? firstName(athlete.name) : athlete.name}
        </span>
      )}
      <span className={`block truncate font-medium text-slate-900 ${compact ? 'text-xs' : 'text-sm'}`}>{workout.title}</span>
      {totals && <span className={`block truncate text-slate-500 ${compact ? 'text-[11px]' : 'text-xs'}`}>{totals}</span>}
      <span className="flex flex-wrap items-center gap-1">
        {watched && (
          <span
            className={`mt-0.5 rounded bg-sky-100 font-bold text-sky-800 ${compact ? 'px-1 text-[10px]' : 'px-1.5 text-[11px]'}`}
            title="Activité de la montre : courbes et tours"
          >
            ⌚
          </span>
        )}
        <ActivityBadges activity={activity} compact={compact} />
      </span>
    </button>
  )
}

/** Sortie Garmin sans séance prévue : chiffres au survol, détail (courbes, tours) au clic. */
function FreeActivityChip({ activity, athleteName }: { activity: GarminActivity; athleteName: string }) {
  const figures = activityFigures(activity)
  const short = figures
    .filter(([label]) => label === 'Durée' || label === 'Distance')
    .map(([, value]) => value)
    .join(' · ')
  const detail = figures.map(([label, value]) => `${label} ${value}`).join(' · ')
  const title = `Sortie libre (Garmin) : ${activity.name || garminSportLabel(activity.activity_type)}${detail ? ` — ${detail}` : ''}`
  return (
    <Link
      to={`/activite/${activity.id}`}
      title={title}
      aria-label={title}
      className="block w-full min-w-0 rounded-lg border border-dashed border-sky-300 bg-sky-50 px-1.5 py-1 text-xs text-sky-950 hover:border-sky-400 hover:bg-sky-100"
    >
      <span className="block truncate font-semibold">
        ⌚ {athleteName ? `${athleteName} · ` : ''}
        Sortie libre
      </span>
      <span className="block truncate text-[11px] text-sky-800">
        {[garminSportLabel(activity.activity_type), short].filter(Boolean).join(' · ')}
      </span>
    </Link>
  )
}
