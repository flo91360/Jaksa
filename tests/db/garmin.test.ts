import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { createCoach, createCoachWithAthlete, createDb, createInvitation, createUser, expectPgError, queryAs } from './helpers.ts'

const PERMISSION_DENIED = '42501'
const CHECK_VIOLATION = '23514'
const FOREIGN_KEY = '23503'

let db: PGlite
let garminId = 1000

beforeAll(async () => {
  db = await createDb()
})

async function planWorkout(coachId: string, athleteId: string, date = '2026-11-10') {
  const rows = await queryAs<{ id: string }>(
    db,
    coachId,
    `insert into public.workouts (athlete_id, scheduled_on, title) values ($1, $2, 'Footing') returning id`,
    [athleteId, date],
  )
  return rows[0].id
}

async function setup() {
  const { coachId, athleteId } = await createCoachWithAthlete(db)
  const workoutId = await planWorkout(coachId, athleteId)
  return { coachId, athleteId, workoutId }
}

/** Import d'une activité, comme le fait le site (upsert sur l'identifiant Garmin). */
const importActivity = (userId: string, workoutId: string | null, extra: { id?: number; duration?: number } = {}) => {
  const id = extra.id ?? ++garminId
  return queryAs<{ id: string; athlete_id: string; garmin_activity_id: string }>(
    db,
    userId,
    `insert into public.garmin_activities
       (garmin_activity_id, workout_id, start_time, local_date, activity_type, name,
        duration_s, distance_m, elevation_gain_m, avg_hr, max_hr)
     values ($1, $2, '2026-11-10T07:02:00Z', '2026-11-10', 'running', 'Course à pied', $3, 10200, 85, 146, 171)
     on conflict (athlete_id, garmin_activity_id) do update set
       garmin_activity_id = excluded.garmin_activity_id,
       workout_id = excluded.workout_id,
       duration_s = excluded.duration_s
     returning id, athlete_id, garmin_activity_id`,
    [id, workoutId, extra.duration ?? 3125],
  )
}

describe('activités Garmin', () => {
  it("l'athlète importe ses activités, son coach les lit", async () => {
    const { coachId, athleteId, workoutId } = await setup()
    const [row] = await importActivity(athleteId, workoutId)
    expect(row.athlete_id).toBe(athleteId)

    const seen = await queryAs<{ workout_id: string; avg_hr: number }>(
      db,
      coachId,
      'select workout_id, avg_hr from public.garmin_activities where id = $1',
      [row.id],
    )
    expect(seen).toEqual([{ workout_id: workoutId, avg_hr: 146 }])
  })

  it('un nouvel import met à jour la même activité au lieu de la dupliquer', async () => {
    const { athleteId, workoutId } = await setup()
    const [first] = await importActivity(athleteId, workoutId, { id: 777001 })
    const [second] = await importActivity(athleteId, workoutId, { id: 777001, duration: 3200 })
    expect(second.id).toBe(first.id)
    const rows = await queryAs<{ duration_s: number }>(
      db,
      athleteId,
      'select duration_s from public.garmin_activities where garmin_activity_id = 777001',
    )
    expect(rows).toEqual([{ duration_s: 3200 }])
  })

  it("ni un autre athlète, ni un autre coach, ni un visiteur ne les lisent", async () => {
    const { coachId, athleteId, workoutId } = await setup()
    await importActivity(athleteId, workoutId)
    const other = await createUser(db, { fullName: 'Paul Autre', invitationToken: await createInvitation(db, coachId) })
    const stranger = await createCoach(db, 'Coach Inconnu')
    const sql = 'select id from public.garmin_activities where athlete_id = $1'
    expect(await queryAs(db, other, sql, [athleteId])).toEqual([])
    expect(await queryAs(db, stranger, sql, [athleteId])).toEqual([])
    await expectPgError(queryAs(db, null, sql, [athleteId]), PERMISSION_DENIED)
  })

  it("le coach n'importe ni ne modifie les activités de son athlète", async () => {
    const { coachId, athleteId, workoutId } = await setup()
    const [row] = await importActivity(athleteId, workoutId)
    // Inséré au nom du coach : la ligne lui appartiendrait, pas à l'athlète.
    const [own] = await importActivity(coachId, null)
    expect(own.athlete_id).toBe(coachId)
    const updated = await queryAs(db, coachId, 'update public.garmin_activities set workout_id = null where id = $1 returning id', [
      row.id,
    ])
    expect(updated).toEqual([])
    const deleted = await queryAs(db, coachId, 'delete from public.garmin_activities where id = $1 returning id', [row.id])
    expect(deleted).toEqual([])
  })

  it("une activité ne se rattache pas à la séance d'un autre athlète", async () => {
    const { coachId, athleteId } = await setup()
    const other = await createUser(db, { fullName: 'Paul Autre', invitationToken: await createInvitation(db, coachId) })
    const othersWorkout = await planWorkout(coachId, other)
    await expectPgError(importActivity(athleteId, othersWorkout), FOREIGN_KEY)
  })

  it("une activité ne change pas d'athlète, et l'athlète ne fixe pas l'athlète à l'import", async () => {
    const { athleteId, workoutId } = await setup()
    const [row] = await importActivity(athleteId, workoutId)
    const other = await createUser(db, { fullName: 'Zoé Ailleurs' })
    await expectPgError(
      queryAs(db, athleteId, 'update public.garmin_activities set athlete_id = $1 where id = $2', [other, row.id]),
      PERMISSION_DENIED,
    )
    await expectPgError(
      queryAs(
        db,
        athleteId,
        `insert into public.garmin_activities (athlete_id, garmin_activity_id, start_time, local_date)
         values ($1, 5, now(), current_date)`,
        [other],
      ),
      PERMISSION_DENIED,
    )
  })

  it("l'athlète supprime ses activités ; supprimer la séance garde l'activité, sans rattachement", async () => {
    const { coachId, athleteId, workoutId } = await setup()
    const [row] = await importActivity(athleteId, workoutId)
    await queryAs(db, coachId, 'delete from public.workouts where id = $1', [workoutId])
    const kept = await queryAs<{ workout_id: string | null }>(
      db,
      athleteId,
      'select workout_id from public.garmin_activities where id = $1',
      [row.id],
    )
    expect(kept).toEqual([{ workout_id: null }])
    const deleted = await queryAs(db, athleteId, 'delete from public.garmin_activities where id = $1 returning id', [row.id])
    expect(deleted).toHaveLength(1)
  })

  it('les valeurs aberrantes sont refusées', async () => {
    const { athleteId } = await setup()
    await expectPgError(
      queryAs(
        db,
        athleteId,
        `insert into public.garmin_activities (garmin_activity_id, start_time, local_date, avg_hr)
         values (99, now(), current_date, 400)`,
      ),
      CHECK_VIOLATION,
    )
  })
})

describe('journal de l’import automatique', () => {
  const logRun = (athleteId: string | null, ranAt = 'now()') =>
    db.query(
      `insert into public.garmin_sync_runs (athlete_id, ran_at, status, imported, linked) values ($1, ${ranAt}, 'ok', 3, 2)`,
      [athleteId],
    )

  it("l'athlète lit ses passages ; ni son coach, ni un autre athlète, ni un visiteur", async () => {
    const { coachId, athleteId } = await setup()
    await logRun(athleteId)
    const other = await createUser(db, { fullName: 'Paul Autre', invitationToken: await createInvitation(db, coachId) })
    const sql = 'select imported, linked from public.garmin_sync_runs where athlete_id = $1'
    expect(await queryAs(db, athleteId, sql, [athleteId])).toEqual([{ imported: 3, linked: 2 }])
    expect(await queryAs(db, coachId, sql, [athleteId])).toEqual([])
    expect(await queryAs(db, other, sql, [athleteId])).toEqual([])
    await expectPgError(queryAs(db, null, sql, [athleteId]), PERMISSION_DENIED)
  })

  it("personne n'écrit dans le journal depuis le site", async () => {
    const { athleteId } = await setup()
    await expectPgError(
      queryAs(db, athleteId, `insert into public.garmin_sync_runs (athlete_id, status) values ($1, 'ok')`, [athleteId]),
      PERMISSION_DENIED,
    )
  })

  it('ne garde qu’un mois de journal', async () => {
    const { athleteId } = await setup()
    await logRun(athleteId, "now() - interval '40 days'")
    await logRun(athleteId)
    const { rows } = await db.query<{ old: number }>(
      `select count(*)::int as old from public.garmin_sync_runs where ran_at < now() - interval '31 days'`,
    )
    expect(rows[0].old).toBe(0)
  })
})
