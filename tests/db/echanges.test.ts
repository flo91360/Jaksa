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

async function planWorkout(coachId: string, athleteId: string, date = '2026-11-10', title = 'Footing') {
  const rows = await queryAs<{ id: string }>(
    db,
    coachId,
    `insert into public.workouts (athlete_id, scheduled_on, title) values ($1, $2, $3) returning id`,
    [athleteId, date, title],
  )
  return rows[0].id
}

async function addAthlete(coachId: string, fullName: string) {
  const token = await createInvitation(db, coachId)
  return createUser(db, { fullName, invitationToken: token })
}

/** Coach, athlète et une séance planifiée. */
async function setup() {
  const { coachId, athleteId } = await createCoachWithAthlete(db)
  const workoutId = await planWorkout(coachId, athleteId)
  return { coachId, athleteId, workoutId }
}

const giveFeedback = (athleteId: string, workoutId: string, extra = '') =>
  queryAs<{ athlete_id: string }>(
    db,
    athleteId,
    `insert into public.workout_feedback (workout_id, status, duration_s, distance_m, elevation_gain_m, rpe, pain)
     values ($1, 'done', 3600, 12000, 150, 6, $2) ${extra} returning athlete_id`,
    [workoutId, JSON.stringify([{ location: 'knee', side: 'left', intensity: 3 }])],
  )

const outbox = (recipientId: string) =>
  db
    .query<{ kind: string; status: string; payload: Record<string, unknown> }>(
      'select kind, status, payload from public.email_outbox where recipient_id = $1 order by id',
      [recipientId],
    )
    .then((r) => r.rows)

describe('retour de séance', () => {
  it("l'athlète fait son retour, son coach le lit", async () => {
    const { coachId, athleteId, workoutId } = await setup()
    const inserted = await giveFeedback(athleteId, workoutId)
    expect(inserted[0].athlete_id).toBe(athleteId)

    const seen = await queryAs<{ rpe: number; pain: unknown[]; coach_seen_at: Date | null }>(
      db,
      coachId,
      'select rpe, pain, coach_seen_at from public.workout_feedback where workout_id = $1',
      [workoutId],
    )
    expect(seen).toEqual([{ rpe: 6, pain: [{ location: 'knee', side: 'left', intensity: 3 }], coach_seen_at: null }])
  })

  it('ni le coach, ni un autre athlète, ni un autre coach ne font le retour à sa place', async () => {
    const { coachId, workoutId } = await setup()
    const other = await addAthlete(coachId, 'Paul Autre')
    const stranger = await createCoach(db, 'Coach Inconnu')
    await expectPgError(giveFeedback(coachId, workoutId), PERMISSION_DENIED)
    await expectPgError(giveFeedback(other, workoutId), PERMISSION_DENIED)
    await expectPgError(giveFeedback(stranger, workoutId), PERMISSION_DENIED)
  })

  it("le retour n'est visible que de l'athlète et de son coach", async () => {
    const { coachId, athleteId, workoutId } = await setup()
    await giveFeedback(athleteId, workoutId)
    const other = await addAthlete(coachId, 'Paul Autre')
    const stranger = await createCoach(db, 'Coach Inconnu')
    for (const user of [other, stranger]) {
      expect(await queryAs(db, user, 'select * from public.workout_feedback where workout_id = $1', [workoutId])).toHaveLength(0)
      expect(await queryAs(db, user, 'select * from public.workout_activity where workout_id = $1', [workoutId])).toHaveLength(0)
    }
  })

  it('le coach ne modifie pas le retour, mais le marque comme vu', async () => {
    const { coachId, athleteId, workoutId } = await setup()
    await giveFeedback(athleteId, workoutId)
    expect(
      await queryAs(db, coachId, 'update public.workout_feedback set rpe = 2 where workout_id = $1 returning rpe', [workoutId]),
    ).toHaveLength(0)
    await expectPgError(
      queryAs(db, coachId, 'update public.workout_feedback set coach_seen_at = now() where workout_id = $1', [workoutId]),
      PERMISSION_DENIED,
    )

    await queryAs(db, coachId, 'select public.mark_workout_seen($1)', [workoutId])
    const [activity] = await queryAs<{ coach_seen_at: Date | null; unseen_feedback: boolean }>(
      db,
      athleteId,
      'select coach_seen_at, unseen_feedback from public.workout_activity where workout_id = $1',
      [workoutId],
    )
    expect(activity.coach_seen_at).not.toBeNull()
    expect(activity.unseen_feedback).toBe(false)
  })

  it("l'athlète ne peut pas se marquer « vu par le coach » lui-même", async () => {
    const { athleteId, workoutId } = await setup()
    await giveFeedback(athleteId, workoutId)
    await queryAs(db, athleteId, 'select public.mark_workout_seen($1)', [workoutId])
    const [row] = await queryAs<{ coach_seen_at: Date | null }>(
      db,
      athleteId,
      'select coach_seen_at from public.workout_feedback where workout_id = $1',
      [workoutId],
    )
    expect(row.coach_seen_at).toBeNull()
  })

  it("modifier son retour efface « vu par le coach »", async () => {
    const { coachId, athleteId, workoutId } = await setup()
    await giveFeedback(athleteId, workoutId)
    await queryAs(db, coachId, 'select public.mark_workout_seen($1)', [workoutId])
    const [row] = await queryAs<{ rpe: number; coach_seen_at: Date | null }>(
      db,
      athleteId,
      'update public.workout_feedback set rpe = 8 where workout_id = $1 returning rpe, coach_seen_at',
      [workoutId],
    )
    expect(row).toEqual({ rpe: 8, coach_seen_at: null })
  })

  it('refuse les valeurs hors limites (RPE, douleur, durée)', async () => {
    const { athleteId, workoutId } = await setup()
    const insert = (rpe: number, pain: unknown, duration = 3600) =>
      queryAs(
        db,
        athleteId,
        `insert into public.workout_feedback (workout_id, status, duration_s, rpe, pain) values ($1, 'done', $2, $3, $4)`,
        [workoutId, duration, rpe, JSON.stringify(pain)],
      )
    await expectPgError(insert(11, []), CHECK_VIOLATION)
    await expectPgError(insert(5, [{ location: 'knee', side: 'left', intensity: 11 }]), CHECK_VIOLATION)
    await expectPgError(insert(5, [{ location: 'nez', side: 'left', intensity: 2 }]), CHECK_VIOLATION)
    await expectPgError(insert(5, [{ location: 'knee', side: 'haut', intensity: 2 }]), CHECK_VIOLATION)
    await expectPgError(insert(5, [], 0), CHECK_VIOLATION)
    await expectPgError(
      queryAs(db, athleteId, `insert into public.workout_feedback (workout_id, status) values ($1, 'fini')`, [workoutId]),
      CHECK_VIOLATION,
    )
  })

  it("l'athlète ne déplace pas son retour vers la séance d'un autre", async () => {
    const { coachId, athleteId, workoutId } = await setup()
    const other = await addAthlete(coachId, 'Paul Autre')
    const otherWorkout = await planWorkout(coachId, other)
    await giveFeedback(athleteId, workoutId)
    await expectPgError(
      queryAs(db, athleteId, 'update public.workout_feedback set workout_id = $2 where workout_id = $1', [workoutId, otherWorkout]),
      PERMISSION_DENIED,
    )
  })
})

describe('commentaires de séance', () => {
  const comment = (userId: string, workoutId: string, body = 'Jambes lourdes') =>
    queryAs<{ id: string; athlete_id: string; author_id: string }>(
      db,
      userId,
      'insert into public.workout_comments (workout_id, body) values ($1, $2) returning id, athlete_id, author_id',
      [workoutId, body],
    )

  it("l'athlète et son coach échangent sous la séance", async () => {
    const { coachId, athleteId, workoutId } = await setup()
    const [mine] = await comment(athleteId, workoutId)
    expect(mine).toMatchObject({ athlete_id: athleteId, author_id: athleteId })
    await comment(coachId, workoutId, 'Ralentis un peu demain')
    for (const user of [athleteId, coachId]) {
      expect(await queryAs(db, user, 'select * from public.workout_comments where workout_id = $1', [workoutId])).toHaveLength(2)
    }
  })

  it("un autre athlète ou un autre coach ne lit ni n'écrit", async () => {
    const { coachId, athleteId, workoutId } = await setup()
    await comment(athleteId, workoutId)
    const other = await addAthlete(coachId, 'Paul Autre')
    const stranger = await createCoach(db, 'Coach Inconnu')
    for (const user of [other, stranger]) {
      expect(await queryAs(db, user, 'select * from public.workout_comments where workout_id = $1', [workoutId])).toHaveLength(0)
      await expectPgError(comment(user, workoutId), PERMISSION_DENIED)
    }
  })

  it("personne ne signe à la place d'un autre ni ne modifie un commentaire", async () => {
    const { coachId, athleteId, workoutId } = await setup()
    await expectPgError(
      queryAs(db, athleteId, 'insert into public.workout_comments (workout_id, author_id, body) values ($1, $2, $3)', [
        workoutId,
        coachId,
        'Faux',
      ]),
      PERMISSION_DENIED,
    )
    const [c] = await comment(athleteId, workoutId)
    await expectPgError(
      queryAs(db, athleteId, `update public.workout_comments set body = 'Modifié' where id = $1`, [c.id]),
      PERMISSION_DENIED,
    )
    // Chacun supprime les siens seulement.
    expect(await queryAs(db, coachId, 'delete from public.workout_comments where id = $1 returning id', [c.id])).toHaveLength(0)
    expect(await queryAs(db, athleteId, 'delete from public.workout_comments where id = $1 returning id', [c.id])).toHaveLength(1)
  })

  it('« vu par le coach » : le coach ouvre la séance', async () => {
    const { coachId, athleteId, workoutId } = await setup()
    await comment(athleteId, workoutId)
    const unread = async (user: string) =>
      (
        await queryAs<{ unread_comments: number }>(
          db,
          user,
          'select unread_comments from public.workout_activity where workout_id = $1',
          [workoutId],
        )
      )[0].unread_comments
    expect(await unread(coachId)).toBe(1)
    expect(await unread(athleteId)).toBe(0)

    // Un étranger qui appelle la fonction ne change rien.
    const stranger = await createCoach(db, 'Coach Inconnu')
    await queryAs(db, stranger, 'select public.mark_workout_seen($1)', [workoutId])
    expect(await unread(coachId)).toBe(1)

    await queryAs(db, coachId, 'select public.mark_workout_seen($1)', [workoutId])
    expect(await unread(coachId)).toBe(0)
    const [row] = await queryAs<{ read_at: Date | null }>(
      db,
      athleteId,
      'select read_at from public.workout_comments where workout_id = $1',
      [workoutId],
    )
    expect(row.read_at).not.toBeNull()
  })

  it('refuse un commentaire vide', async () => {
    const { athleteId, workoutId } = await setup()
    await expectPgError(comment(athleteId, workoutId, '   '), CHECK_VIOLATION)
  })
})

describe('messagerie', () => {
  const send = (userId: string, coachId: string, athleteId: string, body = 'Salut !') =>
    queryAs<{ id: string; sender_id: string }>(
      db,
      userId,
      'insert into public.messages (coach_id, athlete_id, body) values ($1, $2, $3) returning id, sender_id',
      [coachId, athleteId, body],
    )

  it('le coach et son athlète échangent', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    expect((await send(coachId, coachId, athleteId))[0].sender_id).toBe(coachId)
    expect((await send(athleteId, coachId, athleteId, 'Merci coach'))[0].sender_id).toBe(athleteId)
    for (const user of [coachId, athleteId]) {
      expect(await queryAs(db, user, 'select * from public.messages')).toHaveLength(2)
    }
  })

  it("personne n'écrit dans une conversation qui n'est pas la sienne", async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const other = await addAthlete(coachId, 'Paul Autre')
    const stranger = await createCoach(db, 'Coach Inconnu')
    await expectPgError(send(other, coachId, athleteId), PERMISSION_DENIED)
    await expectPgError(send(stranger, coachId, athleteId), PERMISSION_DENIED)
    await expectPgError(send(stranger, stranger, athleteId), PERMISSION_DENIED)
    await expectPgError(send(athleteId, stranger, athleteId), PERMISSION_DENIED)
  })

  it('les autres athlètes et coachs ne lisent pas la conversation', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    await send(coachId, coachId, athleteId, 'Comment va le genou ?')
    const other = await addAthlete(coachId, 'Paul Autre')
    const stranger = await createCoach(db, 'Coach Inconnu')
    for (const user of [other, stranger]) {
      expect(await queryAs(db, user, 'select * from public.messages where athlete_id = $1', [athleteId])).toHaveLength(0)
      expect(await queryAs(db, user, 'select * from public.conversations where athlete_id = $1', [athleteId])).toHaveLength(0)
    }
  })

  it("un message ne se modifie pas et ne se supprime pas ; l'expéditeur est imposé", async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const [m] = await send(coachId, coachId, athleteId)
    await expectPgError(queryAs(db, coachId, `update public.messages set body = 'X' where id = $1`, [m.id]), PERMISSION_DENIED)
    await expectPgError(queryAs(db, athleteId, `update public.messages set read_at = now() where id = $1`, [m.id]), PERMISSION_DENIED)
    await expectPgError(queryAs(db, coachId, 'delete from public.messages where id = $1', [m.id]), PERMISSION_DENIED)
    await expectPgError(
      queryAs(db, athleteId, 'insert into public.messages (coach_id, athlete_id, sender_id, body) values ($1, $2, $1, $3)', [
        coachId,
        athleteId,
        'Usurpé',
      ]),
      PERMISSION_DENIED,
    )
  })

  it('non lus : comptés pour le destinataire, remis à zéro quand il ouvre la conversation', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    await send(athleteId, coachId, athleteId, 'Une question')
    await send(athleteId, coachId, athleteId, 'Et une autre')
    const summary = async (user: string) =>
      (
        await queryAs<{ unread_count: number; last_body: string }>(
          db,
          user,
          'select unread_count, last_body from public.conversations where coach_id = $1 and athlete_id = $2',
          [coachId, athleteId],
        )
      )[0]
    expect(await summary(coachId)).toEqual({ unread_count: 2, last_body: 'Et une autre' })
    expect((await summary(athleteId)).unread_count).toBe(0)

    // L'athlète « ouvre » : ses propres messages restent non lus pour le coach.
    await queryAs(db, athleteId, 'select public.mark_conversation_read($1, $2)', [coachId, athleteId])
    expect((await summary(coachId)).unread_count).toBe(2)
    await queryAs(db, coachId, 'select public.mark_conversation_read($1, $2)', [coachId, athleteId])
    expect((await summary(coachId)).unread_count).toBe(0)
  })

  it('un visiteur ne lit rien et ne peut appeler aucune fonction', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    await expectPgError(queryAs(db, null, 'select * from public.messages'), PERMISSION_DENIED)
    await expectPgError(queryAs(db, null, 'select * from public.workout_feedback'), PERMISSION_DENIED)
    await expectPgError(
      queryAs(db, null, 'select public.mark_conversation_read($1, $2)', [coachId, athleteId]),
      PERMISSION_DENIED,
    )
  })
})

describe('e-mails', () => {
  it("la file d'attente n'est accessible à personne depuis le site", async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    for (const user of [coachId, athleteId]) {
      await expectPgError(queryAs(db, user, 'select * from public.email_outbox'), PERMISSION_DENIED)
      await expectPgError(queryAs(db, user, `select * from public.prepare_email_digests('https://x.fr')`), PERMISSION_DENIED)
      await expectPgError(queryAs(db, user, 'select public.send_email_outbox()'), PERMISSION_DENIED)
      await expectPgError(queryAs(db, user, 'select public.enqueue_tomorrow_workouts()'), PERMISSION_DENIED)
    }
  })

  it('nouveau retour, commentaire ou message : une notification pour le destinataire', async () => {
    const { coachId, athleteId, workoutId } = await setup()
    await giveFeedback(athleteId, workoutId)
    await queryAs(db, athleteId, 'insert into public.workout_comments (workout_id, body) values ($1, $2)', [workoutId, 'Dur !'])
    await queryAs(db, coachId, 'insert into public.messages (coach_id, athlete_id, body) values ($1, $2, $3)', [
      coachId,
      athleteId,
      'Bravo',
    ])
    expect((await outbox(coachId)).map((o) => o.kind)).toEqual(['feedback', 'comment'])
    expect((await outbox(athleteId)).map((o) => o.kind)).toEqual(['message'])
  })

  it("rien pour qui a désactivé les e-mails, et chacun ne change que sa préférence", async () => {
    const { coachId, athleteId, workoutId } = await setup()
    await queryAs(db, coachId, 'update public.profiles set email_notifications = false where id = $1', [coachId])
    expect(
      await queryAs(db, coachId, 'update public.profiles set email_notifications = false where id = $1 returning id', [athleteId]),
    ).toHaveLength(0)
    await giveFeedback(athleteId, workoutId)
    expect(await outbox(coachId)).toEqual([])
  })

  it('séance du lendemain : un e-mail par athlète actif, sans doublon', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    await planWorkout(coachId, athleteId, '2027-03-02', 'Fractionné')
    await planWorkout(coachId, athleteId, '2027-03-02', 'Gainage')
    const archived = await addAthlete(coachId, 'Paul Archivé')
    await planWorkout(coachId, archived, '2027-03-02', 'Footing')
    await queryAs(db, coachId, `update public.coach_athletes set status = 'archived' where athlete_id = $1`, [archived])

    await db.query(`select public.enqueue_tomorrow_workouts('2027-03-02')`)
    await db.query(`select public.enqueue_tomorrow_workouts('2027-03-02')`)
    const rows = await outbox(athleteId)
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('workout_tomorrow')
    expect((rows[0].payload.workouts as { title: string }[]).map((w) => w.title)).toEqual(['Fractionné', 'Gainage'])
    expect(await outbox(archived)).toEqual([])
  })

  it('regroupe les notifications en un e-mail et écarte ce qui a déjà été lu', async () => {
    const coachId = await createCoach(db, 'Coach <Rob>')
    const token = await createInvitation(db, coachId)
    const athleteId = await createUser(db, { fullName: 'Léa Martin', invitationToken: token })
    const workoutId = await planWorkout(coachId, athleteId, '2026-11-12', '10 × 400 m')
    const message = (body: string) =>
      queryAs<{ id: string }>(db, coachId, 'insert into public.messages (coach_id, athlete_id, body) values ($1, $2, $3) returning id', [
        coachId,
        athleteId,
        body,
      ])
    await message('Premier')
    await message('Second')
    await queryAs(db, coachId, 'insert into public.workout_comments (workout_id, body) values ($1, $2)', [workoutId, 'Top'])

    const digests = () =>
      db
        .query<{ recipient_id: string; subject: string; html: string; item_ids: number[] }>(
          `select * from public.prepare_email_digests('https://rob1coach.fr/', interval '0 seconds')
           where recipient_id = $1`,
          [athleteId],
        )
        .then((r) => r.rows)

    const [digest] = await digests()
    expect(digest.subject).toBe('3 nouveautés sur Jaksa')
    expect(digest.item_ids).toHaveLength(3)
    expect(digest.html).toContain('Bonjour Léa')
    expect(digest.html).toContain(`https://rob1coach.fr/seance/${workoutId}`)
    // Noms échappés, et jamais le texte des messages.
    expect(digest.html).toContain('Coach &lt;Rob&gt;')
    expect(digest.html).not.toContain('Premier')

    // L'athlète lit la conversation et la séance dans le site : plus rien à envoyer.
    await queryAs(db, athleteId, 'select public.mark_conversation_read($1, $2)', [coachId, athleteId])
    await queryAs(db, athleteId, 'select public.mark_workout_seen($1)', [workoutId])
    expect(await digests()).toEqual([])
    expect((await outbox(athleteId)).map((o) => o.status)).toEqual(['skipped', 'skipped', 'skipped'])
  })

  it('une notification envoyée ne repart pas', async () => {
    const { coachId, athleteId, workoutId } = await setup()
    await giveFeedback(athleteId, workoutId)
    const { rows } = await db.query<{ subject: string; item_ids: number[] }>(
      `select subject, item_ids from public.prepare_email_digests('https://x.fr', interval '0 seconds') where recipient_id = $1`,
      [coachId],
    )
    expect(rows[0].subject).toBe('Nouveau retour de Léa Martin')
    await db.query('select public.mark_emails_sent($1)', [rows[0].item_ids])
    const again = await db.query(
      `select * from public.prepare_email_digests('https://x.fr', interval '0 seconds') where recipient_id = $1`,
      [coachId],
    )
    expect(again.rows).toEqual([])
  })
})
