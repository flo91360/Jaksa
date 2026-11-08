import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  createCoach,
  createCoachWithAthlete,
  createDb,
  createInvitation,
  createUser,
  expectPgError,
  queryAs,
} from './helpers.ts'

const PERMISSION_DENIED = '42501'
const CHECK_VIOLATION = '23514'

let db: PGlite

beforeAll(async () => {
  db = await createDb()
})

const intervals = [
  { type: 'step', kind: 'warmup', duration: { type: 'time', seconds: 1200 }, target: { type: 'zone', zone: 2 }, note: '' },
  {
    type: 'repeat',
    count: 10,
    steps: [
      { type: 'step', kind: 'active', duration: { type: 'distance', meters: 400 }, target: { type: 'zone', zone: 5 }, note: '' },
      { type: 'step', kind: 'recovery', duration: { type: 'time', seconds: 90 }, target: { type: 'none' }, note: 'trot' },
    ],
  },
  { type: 'step', kind: 'cooldown', duration: { type: 'open' }, target: { type: 'pace', fast: 330, slow: 360 }, note: '' },
]

/** Séance planifiée par coachId pour athleteId ; renvoie son id. */
async function planWorkout(coachId: string, athleteId: string, date = '2026-11-10', steps: unknown = intervals) {
  const rows = await queryAs<{ id: string }>(
    db,
    coachId,
    `insert into public.workouts (athlete_id, scheduled_on, title, steps)
     values ($1, $2, '10 × 400 m', $3) returning id`,
    [athleteId, date, JSON.stringify(steps)],
  )
  return rows[0].id
}

/** Deuxième athlète du même coach. */
async function addAthlete(coachId: string, fullName: string) {
  const token = await createInvitation(db, coachId)
  return createUser(db, { fullName, invitationToken: token })
}

describe('séances planifiées', () => {
  it("le coach planifie pour son athlète, qui la voit", async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const id = await planWorkout(coachId, athleteId)

    const seen = await queryAs<{ id: string; coach_id: string; steps: unknown[] }>(
      db,
      athleteId,
      'select id, coach_id, steps from public.workouts',
    )
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({ id, coach_id: coachId })
    expect(seen[0].steps).toEqual(intervals)
  })

  it("un athlète ne voit pas les séances d'un autre athlète du même coach", async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const other = await addAthlete(coachId, 'Paul Autre')
    await planWorkout(coachId, other)
    const seen = await queryAs(db, athleteId, 'select * from public.workouts where athlete_id = $1', [other])
    expect(seen).toHaveLength(0)
  })

  it("un autre coach ne voit, ne modifie ni ne supprime rien", async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const id = await planWorkout(coachId, athleteId)
    const stranger = await createCoach(db, 'Coach Inconnu')

    expect(await queryAs(db, stranger, 'select * from public.workouts where id = $1', [id])).toHaveLength(0)
    expect(
      await queryAs(db, stranger, `update public.workouts set title = 'Piraté' where id = $1 returning id`, [id]),
    ).toHaveLength(0)
    expect(await queryAs(db, stranger, 'delete from public.workouts where id = $1 returning id', [id])).toHaveLength(0)
  })

  it('un coach ne planifie pas pour un athlète qui n’est pas le sien', async () => {
    const { athleteId } = await createCoachWithAthlete(db)
    const stranger = await createCoach(db, 'Coach Inconnu')
    await expectPgError(planWorkout(stranger, athleteId), PERMISSION_DENIED)
  })

  it("l'athlète ne crée, ne modifie ni ne supprime de séance", async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const id = await planWorkout(coachId, athleteId)
    await expectPgError(planWorkout(athleteId, athleteId), PERMISSION_DENIED)
    expect(
      await queryAs(db, athleteId, `update public.workouts set title = 'Repos' where id = $1 returning id`, [id]),
    ).toHaveLength(0)
    expect(await queryAs(db, athleteId, 'delete from public.workouts where id = $1 returning id', [id])).toHaveLength(0)
  })

  it('le coach déplace et supprime une séance', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const id = await planWorkout(coachId, athleteId)
    const moved = await queryAs<{ scheduled_on: Date; position: number }>(
      db,
      coachId,
      `update public.workouts set scheduled_on = '2026-11-12', position = 1 where id = $1
       returning scheduled_on, position`,
      [id],
    )
    expect(moved).toHaveLength(1)
    expect(moved[0].position).toBe(1)
    expect(await queryAs(db, coachId, 'delete from public.workouts where id = $1 returning id', [id])).toHaveLength(1)
  })

  it("une séance ne change pas d'athlète ni de coach (on la copie)", async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const other = await addAthlete(coachId, 'Paul Autre')
    const id = await planWorkout(coachId, athleteId)
    await expectPgError(
      queryAs(db, coachId, 'update public.workouts set athlete_id = $2 where id = $1', [id, other]),
      PERMISSION_DENIED,
    )
    await expectPgError(
      queryAs(db, coachId, 'update public.workouts set coach_id = $2 where id = $1', [id, other]),
      PERMISSION_DENIED,
    )
  })

  it('le coach_id est toujours celui du coach connecté', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const otherCoach = await createCoach(db, 'Coach B')
    await expectPgError(
      queryAs(
        db,
        coachId,
        `insert into public.workouts (coach_id, athlete_id, scheduled_on, title) values ($1, $2, '2026-11-10', 'X')`,
        [otherCoach, athleteId],
      ),
      PERMISSION_DENIED,
    )
  })

  it('rejette un contenu de séance invalide', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const step = intervals[0]
    const bad: unknown[] = [
      { not: 'an array' },
      [{ ...step, kind: 'sprint' }],
      [{ ...step, duration: { type: 'time', seconds: 0 } }],
      [{ ...step, duration: { type: 'distance' } }],
      [{ ...step, target: { type: 'zone', zone: 8 } }],
      [{ ...step, target: { type: 'pace', fast: 360, slow: 330 } }],
      [{ ...step, target: { type: 'hr', min: 170, max: 150 } }],
      [{ ...step, note: 'x'.repeat(201) }],
      [{ type: 'repeat', count: 0, steps: [step] }],
      [{ type: 'repeat', count: 3, steps: [] }],
      [{ type: 'repeat', count: 3, steps: [{ type: 'repeat', count: 2, steps: [step] }] }],
      Array.from({ length: 41 }, () => step),
    ]
    for (const steps of bad) {
      await expectPgError(planWorkout(coachId, athleteId, '2026-11-10', steps), CHECK_VIOLATION)
    }
    // Séance sans étapes (consigne libre) : acceptée.
    await planWorkout(coachId, athleteId, '2026-11-10', [])
  })

  it('refuse un titre vide', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    await expectPgError(
      queryAs(
        db,
        coachId,
        `insert into public.workouts (athlete_id, scheduled_on, title) values ($1, '2026-11-10', '   ')`,
        [athleteId],
      ),
      CHECK_VIOLATION,
    )
  })

  it('les visiteurs n’y ont pas accès', async () => {
    await expectPgError(queryAs(db, null, 'select * from public.workouts'), PERMISSION_DENIED)
  })
})

describe('bibliothèque de séances types', () => {
  it('le coach crée, lit, modifie et supprime ses séances types', async () => {
    const coachId = await createCoach(db)
    const [created] = await queryAs<{ id: string }>(
      db,
      coachId,
      `insert into public.workout_templates (title, steps) values ('VMA courte', $1) returning id`,
      [JSON.stringify(intervals)],
    )
    const updated = await queryAs(
      db,
      coachId,
      `update public.workout_templates set title = 'VMA 10 × 400' where id = $1 returning title`,
      [created.id],
    )
    expect(updated).toEqual([{ title: 'VMA 10 × 400' }])
    expect(
      await queryAs(db, coachId, 'delete from public.workout_templates where id = $1 returning id', [created.id]),
    ).toHaveLength(1)
  })

  it("ni l'athlète ni un autre coach ne les voient", async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    await queryAs(db, coachId, `insert into public.workout_templates (title) values ('Secret du coach')`)
    const stranger = await createCoach(db, 'Coach Inconnu')
    expect(await queryAs(db, athleteId, 'select * from public.workout_templates')).toHaveLength(0)
    expect(await queryAs(db, stranger, 'select * from public.workout_templates')).toHaveLength(0)
  })

  it("un athlète ne peut pas en créer", async () => {
    const athleteId = await createUser(db)
    await expectPgError(
      queryAs(db, athleteId, `insert into public.workout_templates (title) values ('X')`),
      PERMISSION_DENIED,
    )
  })
})

describe('courses et objectifs', () => {
  const addRace = (userId: string, athleteId: string, name = 'Marathon de Paris', priority = 'A') =>
    queryAs<{ id: string; created_by: string }>(
      db,
      userId,
      `insert into public.races (athlete_id, race_on, name, priority, distance_km, elevation_gain_m)
       values ($1, '2027-04-11', $2, $3, 42.195, 120) returning id, created_by`,
      [athleteId, name, priority],
    )

  it("l'athlète et son coach ajoutent et voient les courses", async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const [byCoach] = await addRace(coachId, athleteId)
    const [byAthlete] = await addRace(athleteId, athleteId, 'Semi de Boulogne', 'B')
    expect(byCoach.created_by).toBe(coachId)
    expect(byAthlete.created_by).toBe(athleteId)

    const seenByAthlete = await queryAs(db, athleteId, 'select id from public.races')
    const seenByCoach = await queryAs(db, coachId, 'select id from public.races where athlete_id = $1', [athleteId])
    expect(seenByAthlete).toHaveLength(2)
    expect(seenByCoach).toHaveLength(2)

    const renamed = await queryAs(
      db,
      athleteId,
      `update public.races set priority = 'C' where id = $1 returning priority`,
      [byCoach.id],
    )
    expect(renamed).toEqual([{ priority: 'C' }])
  })

  it("un autre athlète ou coach n'y a pas accès", async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const [race] = await addRace(coachId, athleteId)
    const other = await addAthlete(coachId, 'Paul Autre')
    const stranger = await createCoach(db, 'Coach Inconnu')

    expect(await queryAs(db, other, 'select * from public.races where id = $1', [race.id])).toHaveLength(0)
    expect(await queryAs(db, stranger, 'select * from public.races where id = $1', [race.id])).toHaveLength(0)
    expect(await queryAs(db, stranger, 'delete from public.races where id = $1 returning id', [race.id])).toHaveLength(0)
    await expectPgError(addRace(other, athleteId), PERMISSION_DENIED)
    await expectPgError(addRace(stranger, athleteId), PERMISSION_DENIED)
  })

  it('refuse une priorité inconnue', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    await expectPgError(addRace(coachId, athleteId, 'Trail', 'D'), CHECK_VIOLATION)
  })

  it("une course ne change pas d'athlète", async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const other = await addAthlete(coachId, 'Paul Autre')
    const [race] = await addRace(coachId, athleteId)
    await expectPgError(
      queryAs(db, coachId, 'update public.races set athlete_id = $2 where id = $1', [race.id, other]),
      PERMISSION_DENIED,
    )
  })
})
