import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { asUser, createCoach, createCoachWithAthlete, createDb, createInvitation, createUser, expectPgError, queryAs } from './helpers.ts'

const PERMISSION_DENIED = '42501'
const CHECK_VIOLATION = '23514'

let db: PGlite

beforeAll(async () => {
  db = await createDb()
})

/** Une séance planifiée par le coach, avec le retour de l'athlète et un message de chacun. */
async function fillHistory(coachId: string, athleteId: string): Promise<string> {
  const [{ id: workoutId }] = await queryAs<{ id: string }>(
    db,
    coachId,
    `insert into public.workouts (athlete_id, scheduled_on, title) values ($1, '2026-11-10', 'Footing') returning id`,
    [athleteId],
  )
  await queryAs(db, athleteId, `insert into public.workout_feedback (workout_id, status, rpe) values ($1, 'done', 5)`, [workoutId])
  await queryAs(db, athleteId, `insert into public.workout_comments (workout_id, body) values ($1, 'Bonnes sensations')`, [workoutId])
  await queryAs(db, coachId, `insert into public.messages (coach_id, athlete_id, body) values ($1, $2, 'Bravo')`, [coachId, athleteId])
  await queryAs(db, athleteId, `insert into public.races (athlete_id, race_on, name) values ($1, '2027-04-04', 'Marathon')`, [athleteId])
  return workoutId
}

describe('accord (conditions et confidentialité)', () => {
  it("enregistre l'accord donné à l'inscription", async () => {
    const { rows: before } = await db.query<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data) values ('accord@exemple.fr', '{"terms_version": "2026-11-12"}') returning id`,
    )
    const { rows } = await db.query<{ terms_version: string | null; terms_accepted_at: Date | null }>(
      'select terms_version, terms_accepted_at from public.profiles where id = $1',
      [before[0].id],
    )
    expect(rows[0].terms_version).toBe('2026-11-12')
    expect(rows[0].terms_accepted_at).not.toBeNull()
  })

  it("laisse l'accord vide sans case cochée, ou avec une version fantaisiste", async () => {
    const sans = await createUser(db)
    const { rows: faux } = await db.query<{ id: string }>(
      `insert into auth.users (email, raw_user_meta_data) values ('faux@exemple.fr', '{"terms_version": "n''importe quoi"}') returning id`,
    )
    const { rows } = await db.query<{ terms_version: string | null; terms_accepted_at: Date | null }>(
      'select terms_version, terms_accepted_at from public.profiles where id = any($1::uuid[])',
      [[sans, faux[0].id]],
    )
    expect(rows).toEqual([
      { terms_version: null, terms_accepted_at: null },
      { terms_version: null, terms_accepted_at: null },
    ])
  })

  it("un compte existant donne son accord, pour lui seul", async () => {
    const moi = await createUser(db)
    const autre = await createUser(db)
    await queryAs(db, moi, `select public.accept_terms('2026-11-12')`)
    const { rows } = await db.query<{ id: string; terms_version: string | null }>(
      'select id, terms_version from public.profiles where id = any($1::uuid[]) order by terms_version nulls last',
      [[moi, autre]],
    )
    expect(rows).toEqual([
      { id: moi, terms_version: '2026-11-12' },
      { id: autre, terms_version: null },
    ])
  })

  it("refuse une version mal formée, un visiteur, et l'écriture directe de la colonne", async () => {
    const moi = await createUser(db)
    await expectPgError(queryAs(db, moi, `select public.accept_terms('demain')`), CHECK_VIOLATION)
    await expectPgError(queryAs(db, null, `select public.accept_terms('2026-11-12')`), PERMISSION_DENIED)
    await expectPgError(
      queryAs(db, moi, `update public.profiles set terms_accepted_at = now() - interval '1 year' where id = $1`, [moi]),
      PERMISSION_DENIED,
    )
  })
})

describe('quitter son coach', () => {
  it("le coach ne voit plus rien, l'athlète garde son historique", async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const workoutId = await fillHistory(coachId, athleteId)
    await queryAs(db, coachId, `update public.coach_private_notes set body = 'Fragile du mollet' where athlete_id = $1`, [athleteId])

    await queryAs(db, athleteId, 'select public.leave_coach($1)', [coachId])

    for (const table of ['workouts', 'workout_feedback', 'workout_comments', 'races', 'athlete_profiles']) {
      expect(await queryAs(db, coachId, `select 1 from public.${table} where athlete_id = $1`, [athleteId])).toHaveLength(0)
    }
    expect(await queryAs(db, coachId, 'select 1 from public.profiles where id = $1', [athleteId])).toHaveLength(0)
    expect(await queryAs(db, coachId, 'select 1 from public.coach_private_notes where athlete_id = $1', [athleteId])).toHaveLength(0)
    const { rows: notes } = await db.query('select 1 from public.coach_private_notes where athlete_id = $1', [athleteId])
    expect(notes).toHaveLength(0)

    expect(await queryAs(db, athleteId, 'select id from public.workouts where athlete_id = $1', [athleteId])).toEqual([{ id: workoutId }])
    expect(await queryAs(db, athleteId, 'select 1 from public.workout_feedback where athlete_id = $1', [athleteId])).toHaveLength(1)

    // Le coach ne peut plus planifier ni écrire.
    await expectPgError(
      queryAs(db, coachId, `insert into public.workouts (athlete_id, scheduled_on, title) values ($1, '2026-11-20', 'Séance')`, [athleteId]),
      PERMISSION_DENIED,
    )
    await expectPgError(
      queryAs(db, coachId, `insert into public.messages (coach_id, athlete_id, body) values ($1, $2, 'Reviens')`, [coachId, athleteId]),
      PERMISSION_DENIED,
    )
  })

  it("ne touche pas au lien d'un autre athlète, et un coach ne peut pas s'en servir pour retirer un athlète à un confrère", async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const autreAthlete = await createUser(db, { invitationToken: await createInvitation(db, coachId) })
    const autreCoach = await createCoach(db, 'Autre Coach')

    await queryAs(db, autreAthlete, 'select public.leave_coach($1)', [coachId])
    await queryAs(db, autreCoach, 'select public.leave_coach($1)', [coachId])

    const { rows } = await db.query<{ athlete_id: string }>('select athlete_id from public.coach_athletes where coach_id = $1', [coachId])
    expect(rows).toEqual([{ athlete_id: athleteId }])
  })

  it('un visiteur ne peut pas appeler la fonction', async () => {
    const coachId = await createCoach(db)
    await expectPgError(queryAs(db, null, 'select public.leave_coach($1)', [coachId]), PERMISSION_DENIED)
  })
})

describe('suppression du compte', () => {
  it("efface tout ce qui appartient à l'athlète, et rien d'autre", async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const voisin = await createUser(db, { invitationToken: await createInvitation(db, coachId) })
    await fillHistory(coachId, athleteId)
    await fillHistory(coachId, voisin)
    await queryAs(
      db,
      athleteId,
      `insert into public.garmin_activities (garmin_activity_id, start_time, local_date, activity_type) values (42, now(), '2026-11-10', 'running')`,
    )

    await queryAs(db, athleteId, 'select public.delete_my_account()')

    const { rows: comptes } = await db.query('select 1 from auth.users where id = $1', [athleteId])
    expect(comptes).toHaveLength(0)
    for (const table of ['athlete_profiles', 'workouts', 'workout_feedback', 'workout_comments', 'messages', 'races', 'garmin_activities', 'coach_athletes', 'coach_private_notes']) {
      const { rows } = await db.query(`select 1 from public.${table} where athlete_id = $1`, [athleteId])
      expect({ table, rows }).toEqual({ table, rows: [] })
    }
    // Le voisin et le coach n'ont rien perdu.
    const { rows: restant } = await db.query('select 1 from public.workouts where athlete_id = $1', [voisin])
    expect(restant).toHaveLength(1)
    const { rows: coach } = await db.query('select 1 from public.profiles where id = $1', [coachId])
    expect(coach).toHaveLength(1)
  })

  it("efface le coach, ses séances types et les séances qu'il a planifiées ; ses athlètes gardent leur compte", async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    await fillHistory(coachId, athleteId)
    await queryAs(db, coachId, `insert into public.workout_templates (title) values ('10 × 400 m')`)
    await queryAs(
      db,
      athleteId,
      `insert into public.garmin_activities (garmin_activity_id, start_time, local_date, activity_type) values (43, now(), '2026-11-10', 'running')`,
    )

    await queryAs(db, coachId, 'select public.delete_my_account()')

    for (const table of ['workout_templates', 'workouts', 'invitations', 'coach_athletes', 'coach_private_notes', 'messages']) {
      const { rows } = await db.query(`select 1 from public.${table} where coach_id = $1`, [coachId])
      expect({ table, rows }).toEqual({ table, rows: [] })
    }
    const { rows: athlete } = await db.query('select 1 from public.profiles where id = $1', [athleteId])
    expect(athlete).toHaveLength(1)
    const { rows: activites } = await db.query('select 1 from public.garmin_activities where athlete_id = $1', [athleteId])
    expect(activites).toHaveLength(1)
    const { rows: courses } = await db.query('select 1 from public.races where athlete_id = $1', [athleteId])
    expect(courses).toHaveLength(1)
  })

  it('un visiteur ne peut pas appeler la fonction', async () => {
    await expectPgError(queryAs(db, null, 'select public.delete_my_account()'), PERMISSION_DENIED)
  })
})

describe('journal des erreurs du site', () => {
  it("enregistre l'erreur au nom de la personne connectée, tronquée aux limites", async () => {
    const moi = await createUser(db)
    await queryAs(db, moi, 'select public.report_client_error($1, $2, $3, $4, $5)', [
      'TypeError: x is undefined',
      'pile '.repeat(2000),
      '/aujourdhui',
      '0.7.0',
      'Mozilla/5.0',
    ])
    const { rows } = await db.query<{ message: string; path: string; app_version: string; taille: number }>(
      'select message, path, app_version, char_length(stack) as taille from public.client_errors where user_id = $1',
      [moi],
    )
    expect(rows).toEqual([{ message: 'TypeError: x is undefined', path: '/aujourdhui', app_version: '0.7.0', taille: 4000 }])
  })

  it('plafonne à 20 erreurs par personne et par heure', async () => {
    const moi = await createUser(db)
    await asUser(db, moi, async (tx) => {
      for (let i = 0; i < 25; i += 1) await tx.query('select public.report_client_error($1)', [`Erreur ${i}`])
    })
    const { rows } = await db.query<{ n: number }>('select count(*)::int as n from public.client_errors where user_id = $1', [moi])
    expect(rows[0].n).toBe(20)
  })

  it("personne ne lit ni n'écrit la table depuis le site, et un visiteur ne signale rien", async () => {
    const moi = await createUser(db)
    await queryAs(db, moi, `select public.report_client_error('Erreur')`)
    await expectPgError(queryAs(db, moi, 'select * from public.client_errors'), PERMISSION_DENIED)
    await expectPgError(queryAs(db, moi, `insert into public.client_errors (message) values ('x')`), PERMISSION_DENIED)
    await expectPgError(queryAs(db, null, `select public.report_client_error('Erreur')`), PERMISSION_DENIED)
  })

  it('oublie les erreurs de plus de 30 jours au signalement suivant', async () => {
    const moi = await createUser(db)
    await db.query(`insert into public.client_errors (user_id, message, occurred_at) values ($1, 'Vieille erreur', now() - interval '40 days')`, [moi])
    await queryAs(db, moi, `select public.report_client_error('Erreur récente')`)
    const { rows } = await db.query<{ message: string }>('select message from public.client_errors where user_id = $1', [moi])
    expect(rows).toEqual([{ message: 'Erreur récente' }])
  })
})
