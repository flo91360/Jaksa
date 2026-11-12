import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { createCoach, createCoachWithAthlete, createDb, createInvitation, createUser, expectPgError, queryAs } from './helpers.ts'

const PERMISSION_DENIED = '42501'
const CHECK_VIOLATION = '23514'

let db: PGlite

beforeAll(async () => {
  db = await createDb()
})

/** Date PostgreSQL → AAAA-MM-JJ. */
const iso = (rows: { scheduled_on: string }[]) => rows.map((row) => row.scheduled_on)

async function flexibleWorkout(coachId: string, athleteId: string, date = '2026-11-12', title = '10 × 400 m'): Promise<string> {
  const rows = await queryAs<{ id: string }>(
    db,
    coachId,
    `insert into public.workouts (athlete_id, scheduled_on, title, flexible) values ($1, $2, $3, true) returning id`,
    [athleteId, date, title],
  )
  return rows[0].id
}

const stateOf = async (workoutId: string) =>
  (
    await db.query<{ scheduled_on: string; placed: boolean; flexible: boolean; position: number }>(
      `select scheduled_on::text, placed_at is not null as placed, flexible, position from public.workouts where id = $1`,
      [workoutId],
    )
  ).rows[0]

describe('mode de coaching', () => {
  it('est strict par défaut ; le coach le change, et l’athlète le lit', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    expect(await queryAs(db, athleteId, 'select mode from public.coach_links')).toEqual([{ mode: 'strict' }])
    await queryAs(db, coachId, `update public.coach_athletes set mode = 'flexible' where athlete_id = $1`, [athleteId])
    expect(await queryAs(db, athleteId, 'select mode from public.coach_links')).toEqual([{ mode: 'flexible' }])
  })

  it('refuse un mode inconnu, et le changement par l’athlète ou par un autre coach', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const autreCoach = await createCoach(db, 'Autre Coach')
    await expectPgError(
      queryAs(db, coachId, `update public.coach_athletes set mode = 'libre' where athlete_id = $1`, [athleteId]),
      CHECK_VIOLATION,
    )
    await queryAs(db, athleteId, `update public.coach_athletes set mode = 'flexible' where athlete_id = $1`, [athleteId])
    await queryAs(db, autreCoach, `update public.coach_athletes set mode = 'flexible' where athlete_id = $1`, [athleteId])
    const { rows } = await db.query('select mode from public.coach_athletes where athlete_id = $1', [athleteId])
    expect(rows).toEqual([{ mode: 'strict' }])
  })
})

describe('séances à faire dans la semaine', () => {
  it('une séance souple est rangée au lundi de sa semaine, « à placer »', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const id = await flexibleWorkout(coachId, athleteId, '2026-11-12')
    expect(await stateOf(id)).toMatchObject({ scheduled_on: '2026-11-09', placed: false, flexible: true })
  })

  it('l’athlète choisit son jour dans la semaine, le change, puis le retire', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const id = await flexibleWorkout(coachId, athleteId)
    await queryAs(db, athleteId, `select public.place_flexible_workout($1, '2026-11-13')`, [id])
    expect(await stateOf(id)).toMatchObject({ scheduled_on: '2026-11-13', placed: true })
    await queryAs(db, athleteId, `select public.place_flexible_workout($1, '2026-11-15')`, [id])
    expect(await stateOf(id)).toMatchObject({ scheduled_on: '2026-11-15', placed: true })
    await queryAs(db, athleteId, `select public.place_flexible_workout($1, null)`, [id])
    expect(await stateOf(id)).toMatchObject({ scheduled_on: '2026-11-09', placed: false })
  })

  it('la séance placée passe après celles déjà prévues ce jour-là', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    await queryAs(db, coachId, `insert into public.workouts (athlete_id, scheduled_on, title, position) values ($1, '2026-11-13', 'Footing', 0)`, [athleteId])
    const id = await flexibleWorkout(coachId, athleteId)
    await queryAs(db, athleteId, `select public.place_flexible_workout($1, '2026-11-13')`, [id])
    expect(await stateOf(id)).toMatchObject({ position: 1 })
  })

  it('refuse un jour hors de la semaine', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const id = await flexibleWorkout(coachId, athleteId)
    await expectPgError(queryAs(db, athleteId, `select public.place_flexible_workout($1, '2026-11-16')`, [id]), CHECK_VIOLATION)
    await expectPgError(queryAs(db, athleteId, `select public.place_flexible_workout($1, '2026-11-08')`, [id]), CHECK_VIOLATION)
  })

  it('l’athlète ne déplace ni une séance à jour fixe, ni la séance d’un autre', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const voisin = await createUser(db, { invitationToken: await createInvitation(db, coachId) })
    const [{ id: fixe }] = await queryAs<{ id: string }>(
      db,
      coachId,
      `insert into public.workouts (athlete_id, scheduled_on, title) values ($1, '2026-11-12', 'Sortie longue') returning id`,
      [athleteId],
    )
    const souple = await flexibleWorkout(coachId, athleteId)
    await expectPgError(queryAs(db, athleteId, `select public.place_flexible_workout($1, '2026-11-13')`, [fixe]), PERMISSION_DENIED)
    await expectPgError(queryAs(db, voisin, `select public.place_flexible_workout($1, '2026-11-13')`, [souple]), PERMISSION_DENIED)
    await expectPgError(queryAs(db, null, `select public.place_flexible_workout($1, '2026-11-13')`, [souple]), PERMISSION_DENIED)
    // Et toujours pas d'écriture directe sur la séance.
    await queryAs(db, athleteId, `update public.workouts set scheduled_on = '2026-11-13' where id = $1`, [souple])
    expect(await stateOf(souple)).toMatchObject({ scheduled_on: '2026-11-09', placed: false })
    await expectPgError(queryAs(db, coachId, `update public.workouts set placed_at = now() where id = $1`, [souple]), PERMISSION_DENIED)
  })

  it('le coach garde la main : autre semaine ou jour fixe, le choix de l’athlète est oublié', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const id = await flexibleWorkout(coachId, athleteId)
    await queryAs(db, athleteId, `select public.place_flexible_workout($1, '2026-11-13')`, [id])

    await queryAs(db, coachId, `update public.workouts set scheduled_on = '2026-11-19' where id = $1`, [id])
    expect(await stateOf(id)).toMatchObject({ scheduled_on: '2026-11-16', placed: false, flexible: true })

    await queryAs(db, athleteId, `select public.place_flexible_workout($1, '2026-11-18')`, [id])
    await queryAs(db, coachId, `update public.workouts set flexible = false where id = $1`, [id])
    expect(await stateOf(id)).toMatchObject({ scheduled_on: '2026-11-18', placed: false, flexible: false })
  })

  it('modifier le contenu d’une séance placée ne touche pas au jour choisi', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const id = await flexibleWorkout(coachId, athleteId)
    await queryAs(db, athleteId, `select public.place_flexible_workout($1, '2026-11-14')`, [id])
    await queryAs(db, coachId, `update public.workouts set title = '12 × 400 m' where id = $1`, [id])
    expect(await stateOf(id)).toMatchObject({ scheduled_on: '2026-11-14', placed: true })
  })

  it('l’e-mail « séance de demain » ignore une séance souple pas encore placée', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const id = await flexibleWorkout(coachId, athleteId, '2027-03-03')
    // Rangée au lundi 1er mars 2027 : rien à annoncer pour ce jour-là.
    await db.query(`select public.enqueue_tomorrow_workouts('2027-03-01')`)
    const pending = async () =>
      (await db.query(`select 1 from public.email_outbox where recipient_id = $1 and kind = 'workout_tomorrow'`, [athleteId])).rows
    expect(await pending()).toHaveLength(0)
    await queryAs(db, athleteId, `select public.place_flexible_workout($1, '2027-03-04')`, [id])
    await db.query(`select public.enqueue_tomorrow_workouts('2027-03-04')`)
    expect(await pending()).toHaveLength(1)
  })
})

describe('volume de la semaine', () => {
  it('le coach fixe une fourchette, l’athlète la lit, les autres non', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const voisin = await createUser(db, { invitationToken: await createInvitation(db, coachId) })
    const autreCoach = await createCoach(db, 'Autre Coach')
    await queryAs(
      db,
      coachId,
      `insert into public.weekly_targets (athlete_id, week_start, km_min, km_max, note) values ($1, '2026-11-09', 35, 45, 'Semaine de reprise')`,
      [athleteId],
    )
    const lu = await queryAs<{ km_min: string; km_max: string }>(db, athleteId, 'select km_min, km_max from public.weekly_targets')
    expect(lu.map((row) => [Number(row.km_min), Number(row.km_max)])).toEqual([[35, 45]])
    expect(await queryAs(db, voisin, 'select 1 from public.weekly_targets')).toHaveLength(0)
    expect(await queryAs(db, autreCoach, 'select 1 from public.weekly_targets')).toHaveLength(0)

    await queryAs(db, coachId, `update public.weekly_targets set km_max = 50 where athlete_id = $1`, [athleteId])
    const { rows } = await db.query<{ km_max: string }>('select km_max from public.weekly_targets where athlete_id = $1', [athleteId])
    expect(Number(rows[0].km_max)).toBe(50)
  })

  it('refuse une semaine qui ne commence pas un lundi, et une fourchette à l’envers', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    await expectPgError(
      queryAs(db, coachId, `insert into public.weekly_targets (athlete_id, week_start, km_min, km_max) values ($1, '2026-11-10', 35, 45)`, [athleteId]),
      CHECK_VIOLATION,
    )
    await expectPgError(
      queryAs(db, coachId, `insert into public.weekly_targets (athlete_id, week_start, km_min, km_max) values ($1, '2026-11-09', 50, 45)`, [athleteId]),
      CHECK_VIOLATION,
    )
  })

  it('l’athlète ne fixe ni ne modifie son volume ; un coach ne fixe rien pour l’athlète d’un autre', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const autreCoach = await createCoach(db, 'Autre Coach')
    await queryAs(db, coachId, `insert into public.weekly_targets (athlete_id, week_start, km_min, km_max) values ($1, '2026-11-16', 30, 40)`, [athleteId])
    await expectPgError(
      queryAs(db, athleteId, `insert into public.weekly_targets (athlete_id, week_start, km_min, km_max) values ($1, '2026-11-23', 10, 20)`, [athleteId]),
      PERMISSION_DENIED,
    )
    await queryAs(db, athleteId, `update public.weekly_targets set km_min = 0 where athlete_id = $1`, [athleteId])
    await queryAs(db, athleteId, `delete from public.weekly_targets where athlete_id = $1`, [athleteId])
    const { rows } = await db.query<{ km_min: string }>('select km_min from public.weekly_targets where athlete_id = $1', [athleteId])
    expect(rows.map((row) => Number(row.km_min))).toEqual([30])
    await expectPgError(
      queryAs(db, autreCoach, `insert into public.weekly_targets (athlete_id, week_start, km_min, km_max) values ($1, '2026-11-23', 10, 20)`, [athleteId]),
      PERMISSION_DENIED,
    )
  })
})

describe('sorties déclarées par l’athlète', () => {
  it('l’athlète déclare, modifie et supprime ses sorties ; son coach les lit seulement', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const voisin = await createUser(db, { invitationToken: await createInvitation(db, coachId) })
    const [{ id }] = await queryAs<{ id: string }>(
      db,
      athleteId,
      `insert into public.athlete_runs (run_on, distance_m, duration_s, note) values ('2026-11-11', 8200, 2700, 'Footing') returning id`,
    )
    expect(await queryAs(db, coachId, 'select distance_m from public.athlete_runs where athlete_id = $1', [athleteId])).toEqual([{ distance_m: 8200 }])
    expect(await queryAs(db, voisin, 'select 1 from public.athlete_runs')).toHaveLength(0)

    await queryAs(db, coachId, 'update public.athlete_runs set distance_m = 1000 where id = $1', [id])
    await queryAs(db, coachId, 'delete from public.athlete_runs where id = $1', [id])
    await expectPgError(
      queryAs(db, coachId, `insert into public.athlete_runs (athlete_id, run_on, distance_m) values ($1, '2026-11-12', 5000)`, [athleteId]),
      PERMISSION_DENIED,
    )
    expect(await queryAs(db, athleteId, 'select distance_m from public.athlete_runs')).toEqual([{ distance_m: 8200 }])

    await queryAs(db, athleteId, 'update public.athlete_runs set distance_m = 9000 where id = $1', [id])
    await queryAs(db, athleteId, 'delete from public.athlete_runs where id = $1', [id])
    expect(await queryAs(db, athleteId, 'select 1 from public.athlete_runs')).toHaveLength(0)
  })

  it('refuse une distance invraisemblable, et un visiteur', async () => {
    const athleteId = await createUser(db)
    await expectPgError(queryAs(db, athleteId, `insert into public.athlete_runs (run_on, distance_m) values ('2026-11-11', 5)`), CHECK_VIOLATION)
    await expectPgError(queryAs(db, null, 'select * from public.athlete_runs'), PERMISSION_DENIED)
    await expectPgError(queryAs(db, null, 'select * from public.weekly_targets'), PERMISSION_DENIED)
  })
})

describe('après le départ de l’athlète', () => {
  it('le coach ne voit plus ni volume ni sorties', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    await queryAs(db, coachId, `insert into public.weekly_targets (athlete_id, week_start, km_min, km_max) values ($1, '2026-11-09', 35, 45)`, [athleteId])
    await queryAs(db, athleteId, `insert into public.athlete_runs (run_on, distance_m) values ('2026-11-11', 8200)`)
    await queryAs(db, athleteId, 'select public.leave_coach($1)', [coachId])
    expect(await queryAs(db, coachId, 'select 1 from public.weekly_targets')).toHaveLength(0)
    expect(await queryAs(db, coachId, 'select 1 from public.athlete_runs')).toHaveLength(0)
    expect(iso(await queryAs(db, coachId, 'select scheduled_on::text from public.workouts'))).toEqual([])
  })
})
