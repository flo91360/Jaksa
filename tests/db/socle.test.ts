import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  asUser,
  createCoach,
  createCoachWithAthlete,
  createDb,
  createInvitation,
  createUser,
  expectPgError,
  queryAs,
} from './helpers.ts'

// Erreur PostgreSQL « permission denied » (droits GRANT) et violation de RLS.
const PERMISSION_DENIED = '42501'
const CHECK_VIOLATION = '23514'

let db: PGlite

beforeAll(async () => {
  db = await createDb()
})

const fiveZones = [
  { zone: 1, name: 'Récupération', hr_min: 100, hr_max: 129, pace_slow: 420, pace_fast: 380 },
  { zone: 2, name: 'Endurance fondamentale', hr_min: 130, hr_max: 145, pace_slow: 379, pace_fast: 340 },
  { zone: 3, name: 'Endurance active', hr_min: 146, hr_max: 160, pace_slow: 339, pace_fast: 300 },
  { zone: 4, name: 'Seuil', hr_min: 161, hr_max: 173, pace_slow: 299, pace_fast: 270 },
  { zone: 5, name: 'VMA', hr_min: 174, hr_max: 190, pace_slow: null, pace_fast: null },
]

describe('inscription', () => {
  it('crée le profil (rôle athlète) et la fiche athlète', async () => {
    const id = await createUser(db, { fullName: '  Paul Durand  ', email: 'paul@exemple.fr' })
    const { rows } = await db.query<{ role: string; full_name: string; email: string }>(
      'select role, full_name, email from public.profiles where id = $1',
      [id],
    )
    expect(rows).toEqual([{ role: 'athlete', full_name: 'Paul Durand', email: 'paul@exemple.fr' }])
    const fiche = await db.query('select zones from public.athlete_profiles where athlete_id = $1', [id])
    expect(fiche.rows).toEqual([{ zones: [] }])
  })

  it("rattache l'athlète au coach quand il s'inscrit avec un lien d'invitation", async () => {
    const coachId = await createCoach(db)
    const token = await createInvitation(db, coachId, 'Léa')
    const athleteId = await createUser(db, { fullName: 'Léa Martin', invitationToken: token })

    const links = await db.query('select coach_id, athlete_id, status from public.coach_athletes where athlete_id = $1', [
      athleteId,
    ])
    expect(links.rows).toEqual([{ coach_id: coachId, athlete_id: athleteId, status: 'active' }])
    const invitation = await db.query<{ accepted_by: string; accepted_at: Date | null }>(
      'select accepted_by, accepted_at from public.invitations where token = $1',
      [token],
    )
    expect(invitation.rows[0].accepted_by).toBe(athleteId)
    expect(invitation.rows[0].accepted_at).not.toBeNull()
    const notes = await db.query('select body from public.coach_private_notes where athlete_id = $1', [athleteId])
    expect(notes.rows).toEqual([{ body: '' }])
  })

  it("crée quand même le compte si le jeton d'invitation est invalide", async () => {
    const id = await createUser(db, { fullName: 'Sans Coach', invitationToken: 'jeton-inconnu' })
    const profile = await db.query('select id from public.profiles where id = $1', [id])
    expect(profile.rows).toHaveLength(1)
    const links = await db.query('select 1 from public.coach_athletes where athlete_id = $1', [id])
    expect(links.rows).toHaveLength(0)
  })

  it("répercute un changement d'e-mail sur le profil", async () => {
    const id = await createUser(db, { email: 'ancien@exemple.fr' })
    await db.query(`update auth.users set email = 'nouveau@exemple.fr' where id = $1`, [id])
    const { rows } = await db.query('select email from public.profiles where id = $1', [id])
    expect(rows).toEqual([{ email: 'nouveau@exemple.fr' }])
  })
})

describe('invitations', () => {
  it('seul un coach peut créer une invitation', async () => {
    const athleteId = await createUser(db)
    await expectPgError(
      queryAs(db, athleteId, `insert into public.invitations (athlete_name) values ('X')`),
      PERMISSION_DENIED,
    )
  })

  it('le jeton est long, aléatoire et unique', async () => {
    const coachId = await createCoach(db)
    const a = await createInvitation(db, coachId)
    const b = await createInvitation(db, coachId)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
  })

  it("un coach ne voit pas les invitations d'un autre coach", async () => {
    const coachA = await createCoach(db, 'Coach A')
    const coachB = await createCoach(db, 'Coach B')
    await createInvitation(db, coachA, 'Pour A')
    const seenByB = await queryAs(db, coachB, 'select * from public.invitations')
    expect(seenByB).toHaveLength(0)
    const seenByA = await queryAs<{ athlete_name: string }>(db, coachA, 'select athlete_name from public.invitations')
    expect(seenByA.map((row) => row.athlete_name)).toEqual(['Pour A'])
  })

  it('un coach ne peut pas créer une invitation au nom d’un autre coach', async () => {
    const coachA = await createCoach(db, 'Coach A')
    const coachB = await createCoach(db, 'Coach B')
    await expectPgError(
      queryAs(db, coachA, 'insert into public.invitations (coach_id, athlete_name) values ($1, $2)', [coachB, 'X']),
      PERMISSION_DENIED,
    )
  })

  it("l'aperçu public donne le nom du coach et l'état de l'invitation", async () => {
    const coachId = await createCoach(db, 'Robin Coach')
    const token = await createInvitation(db, coachId, 'Léa')
    const preview = await queryAs(db, null, 'select * from public.get_invitation($1)', [token])
    expect(preview).toEqual([{ coach_name: 'Robin Coach', athlete_name: 'Léa', status: 'valid' }])

    const unknown = await queryAs(db, null, 'select * from public.get_invitation($1)', ['inconnu'])
    expect(unknown).toEqual([])

    await queryAs(db, coachId, 'update public.invitations set revoked_at = now() where token = $1', [token])
    const revoked = await queryAs<{ status: string }>(db, null, 'select status from public.get_invitation($1)', [token])
    expect(revoked).toEqual([{ status: 'revoked' }])
  })

  it("un athlète déjà inscrit accepte l'invitation (et peut la rejouer)", async () => {
    const coachId = await createCoach(db)
    const token = await createInvitation(db, coachId)
    const athleteId = await createUser(db, { fullName: 'Déjà Inscrit' })

    const first = await queryAs<{ coach: string }>(db, athleteId, 'select public.accept_invitation($1) as coach', [token])
    expect(first).toEqual([{ coach: coachId }])
    const again = await queryAs<{ coach: string }>(db, athleteId, 'select public.accept_invitation($1) as coach', [token])
    expect(again).toEqual([{ coach: coachId }])

    const links = await db.query('select 1 from public.coach_athletes where coach_id = $1 and athlete_id = $2', [
      coachId,
      athleteId,
    ])
    expect(links.rows).toHaveLength(1)
  })

  it("refuse une invitation déjà utilisée, annulée, expirée ou inconnue", async () => {
    const coachId = await createCoach(db)
    const used = await createInvitation(db, coachId)
    await createUser(db, { invitationToken: used })
    const intruder = await createUser(db)
    await expectPgError(queryAs(db, intruder, 'select public.accept_invitation($1)', [used]), 'RC003')

    const revoked = await createInvitation(db, coachId)
    await queryAs(db, coachId, 'update public.invitations set revoked_at = now() where token = $1', [revoked])
    await expectPgError(queryAs(db, intruder, 'select public.accept_invitation($1)', [revoked]), 'RC002')

    const expired = await createInvitation(db, coachId)
    await db.query(`update public.invitations set expires_at = now() - interval '1 day' where token = $1`, [expired])
    await expectPgError(queryAs(db, intruder, 'select public.accept_invitation($1)', [expired]), 'RC004')

    await expectPgError(queryAs(db, intruder, 'select public.accept_invitation($1)', ['inconnu']), 'RC001')
  })

  it("refuse qu'un compte coach rejoigne un coach", async () => {
    const coachA = await createCoach(db, 'Coach A')
    const coachB = await createCoach(db, 'Coach B')
    const token = await createInvitation(db, coachA)
    await expectPgError(queryAs(db, coachB, 'select public.accept_invitation($1)', [token]), 'RC005')
    await expectPgError(queryAs(db, coachA, 'select public.accept_invitation($1)', [token]), 'RC005')
  })

  it("un visiteur anonyme ne peut pas accepter d'invitation", async () => {
    const coachId = await createCoach(db)
    const token = await createInvitation(db, coachId)
    await expectPgError(queryAs(db, null, 'select public.accept_invitation($1)', [token]), PERMISSION_DENIED)
  })

  it('le coach annule ou supprime ses invitations, pas celles des autres', async () => {
    const coachA = await createCoach(db, 'Coach A')
    const coachB = await createCoach(db, 'Coach B')
    const token = await createInvitation(db, coachA)
    const updatedByB = await queryAs(
      db,
      coachB,
      'update public.invitations set revoked_at = now() where token = $1 returning id',
      [token],
    )
    expect(updatedByB).toHaveLength(0)
    const deletedByB = await queryAs(db, coachB, 'delete from public.invitations where token = $1 returning id', [token])
    expect(deletedByB).toHaveLength(0)
    const deletedByA = await queryAs(db, coachA, 'delete from public.invitations where token = $1 returning id', [token])
    expect(deletedByA).toHaveLength(1)
  })

  it("le coach ne peut pas modifier le jeton ni la date d'expiration", async () => {
    const coachId = await createCoach(db)
    const token = await createInvitation(db, coachId)
    await expectPgError(
      queryAs(db, coachId, `update public.invitations set expires_at = now() + interval '1 year' where token = $1`, [
        token,
      ]),
      PERMISSION_DENIED,
    )
    await expectPgError(
      queryAs(db, coachId, `update public.invitations set token = 'choisi' where token = $1`, [token]),
      PERMISSION_DENIED,
    )
  })
})

describe('visibilité des profils', () => {
  it("le coach voit ses athlètes, pas ceux d'un autre coach", async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const other = await createCoachWithAthlete(db)

    const visible = await queryAs<{ id: string }>(db, coachId, 'select id from public.profiles')
    const ids = visible.map((row) => row.id)
    expect(ids).toContain(coachId)
    expect(ids).toContain(athleteId)
    expect(ids).not.toContain(other.athleteId)
    expect(ids).not.toContain(other.coachId)
  })

  it("l'athlète voit son profil et celui de son coach, pas les autres athlètes", async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const token = await createInvitation(db, coachId)
    const teammate = await createUser(db, { invitationToken: token })

    const visible = await queryAs<{ id: string }>(db, athleteId, 'select id from public.profiles order by id')
    expect(visible.map((row) => row.id).sort()).toEqual([athleteId, coachId].sort())
    const fiches = await queryAs(db, athleteId, 'select athlete_id from public.athlete_profiles where athlete_id = $1', [
      teammate,
    ])
    expect(fiches).toHaveLength(0)
  })

  it('la vue coach_links montre le lien aux deux parties uniquement', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const outsider = await createUser(db)

    const forCoach = await queryAs(db, coachId, 'select athlete_id, athlete_name, coach_name from public.coach_links')
    expect(forCoach).toEqual([{ athlete_id: athleteId, athlete_name: 'Léa Martin', coach_name: 'Coach Rob' }])
    const forAthlete = await queryAs(db, athleteId, 'select coach_id, coach_name from public.coach_links')
    expect(forAthlete).toEqual([{ coach_id: coachId, coach_name: 'Coach Rob' }])
    const forOutsider = await queryAs(db, outsider, 'select * from public.coach_links')
    expect(forOutsider).toHaveLength(0)
  })

  it('un visiteur anonyme ne lit rien', async () => {
    await createCoachWithAthlete(db)
    await expectPgError(queryAs(db, null, 'select * from public.profiles'), PERMISSION_DENIED)
    await expectPgError(queryAs(db, null, 'select * from public.athlete_profiles'), PERMISSION_DENIED)
    await expectPgError(queryAs(db, null, 'select * from public.coach_links'), PERMISSION_DENIED)
  })

  it('personne ne peut changer son propre rôle', async () => {
    const athleteId = await createUser(db, { fullName: 'Ambitieux' })
    await expectPgError(
      queryAs(db, athleteId, `update public.profiles set role = 'coach' where id = $1`, [athleteId]),
      PERMISSION_DENIED,
    )
    const renamed = await queryAs(
      db,
      athleteId,
      `update public.profiles set full_name = 'Nouveau Nom' where id = $1 returning full_name`,
      [athleteId],
    )
    expect(renamed).toEqual([{ full_name: 'Nouveau Nom' }])
  })

  it("on ne peut pas renommer quelqu'un d'autre", async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const renamed = await queryAs(
      db,
      coachId,
      `update public.profiles set full_name = 'Piraté' where id = $1 returning id`,
      [athleteId],
    )
    expect(renamed).toHaveLength(0)
  })
})

describe('lien coach ↔ athlète', () => {
  it("le coach archive un athlète ; l'athlète ne peut pas changer le statut", async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const archived = await queryAs(
      db,
      coachId,
      `update public.coach_athletes set status = 'archived' where athlete_id = $1 returning status`,
      [athleteId],
    )
    expect(archived).toEqual([{ status: 'archived' }])
    const byAthlete = await queryAs(
      db,
      athleteId,
      `update public.coach_athletes set status = 'active' where athlete_id = $1 returning status`,
      [athleteId],
    )
    expect(byAthlete).toHaveLength(0)
  })

  it("personne ne crée de lien directement (seulement par invitation)", async () => {
    const coachId = await createCoach(db)
    const athleteId = await createUser(db)
    await expectPgError(
      queryAs(db, coachId, 'insert into public.coach_athletes (coach_id, athlete_id) values ($1, $2)', [
        coachId,
        athleteId,
      ]),
      PERMISSION_DENIED,
    )
    await expectPgError(
      queryAs(db, coachId, 'update public.coach_athletes set athlete_id = $1 where coach_id = $2', [athleteId, coachId]),
      PERMISSION_DENIED,
    )
  })
})

describe('fiche athlète', () => {
  it('le coach enregistre la physiologie et les zones, avec historique', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const updated = await queryAs<{ hr_max: number; zones_updated_at: Date | null }>(
      db,
      coachId,
      `update public.athlete_profiles
         set hr_max = 190, hr_rest = 48, hr_threshold = 172, vma_kmh = 16.5, zones = $2
       where athlete_id = $1
       returning hr_max, zones_updated_at`,
      [athleteId, JSON.stringify(fiveZones)],
    )
    expect(updated).toHaveLength(1)
    expect(updated[0].hr_max).toBe(190)
    expect(updated[0].zones_updated_at).not.toBeNull()

    const history = await queryAs<{ hr_max: number; recorded_by: string; zones: unknown[] }>(
      db,
      athleteId,
      'select hr_max, recorded_by, zones from public.athlete_metrics_history where athlete_id = $1',
      [athleteId],
    )
    expect(history).toHaveLength(1)
    expect(history[0]).toMatchObject({ hr_max: 190, recorded_by: coachId })
    expect(history[0].zones).toHaveLength(5)
  })

  it("l'athlète complète ses infos mais ne touche ni à la physiologie ni aux zones", async () => {
    const { athleteId } = await createCoachWithAthlete(db)
    const ok = await queryAs(
      db,
      athleteId,
      `update public.athlete_profiles set goals = 'Marathon en 3h30', availability = 'Mardi, jeudi, dimanche'
       where athlete_id = $1 returning goals`,
      [athleteId],
    )
    expect(ok).toEqual([{ goals: 'Marathon en 3h30' }])

    await expectPgError(
      queryAs(db, athleteId, 'update public.athlete_profiles set hr_max = 200 where athlete_id = $1', [athleteId]),
      PERMISSION_DENIED,
    )
    await expectPgError(
      queryAs(db, athleteId, 'update public.athlete_profiles set zones = $2 where athlete_id = $1', [
        athleteId,
        JSON.stringify(fiveZones),
      ]),
      PERMISSION_DENIED,
    )
    // Aucune ligne d'historique pour une simple mise à jour des infos.
    const history = await db.query('select 1 from public.athlete_metrics_history where athlete_id = $1', [athleteId])
    expect(history.rows).toHaveLength(0)
  })

  it("un autre coach ne peut ni lire ni modifier la fiche", async () => {
    const { athleteId } = await createCoachWithAthlete(db)
    const stranger = await createCoach(db, 'Coach Inconnu')
    const read = await queryAs(db, stranger, 'select * from public.athlete_profiles where athlete_id = $1', [athleteId])
    expect(read).toHaveLength(0)
    const write = await queryAs(
      db,
      stranger,
      'update public.athlete_profiles set hr_max = 150 where athlete_id = $1 returning athlete_id',
      [athleteId],
    )
    expect(write).toHaveLength(0)
  })

  it('rejette des zones incohérentes', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const setZones = (zones: unknown) =>
      queryAs(db, coachId, 'update public.athlete_profiles set zones = $2 where athlete_id = $1', [
        athleteId,
        JSON.stringify(zones),
      ])

    await expectPgError(setZones([{ ...fiveZones[0], zone: 2 }]), CHECK_VIOLATION)
    await expectPgError(setZones([{ ...fiveZones[0], hr_min: 150, hr_max: 140 }]), CHECK_VIOLATION)
    await expectPgError(setZones([{ ...fiveZones[0], pace_slow: 300, pace_fast: 330 }]), CHECK_VIOLATION)
    await expectPgError(setZones([{ ...fiveZones[0], hr_max: 129.5 }]), CHECK_VIOLATION)
    await expectPgError(setZones([{ ...fiveZones[0], name: 'x'.repeat(61) }]), CHECK_VIOLATION)
    await expectPgError(
      setZones(Array.from({ length: 8 }, (_, i) => ({ ...fiveZones[0], zone: i + 1 }))),
      CHECK_VIOLATION,
    )
    await expectPgError(setZones({ zone: 1 }), CHECK_VIOLATION)
    // Zone sans FC ni allure : acceptée (à compléter plus tard).
    await setZones([{ zone: 1, name: 'Footing', hr_min: null, hr_max: null, pace_slow: null, pace_fast: null }])
  })

  it('rejette une physiologie incohérente', async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    await expectPgError(
      queryAs(db, coachId, 'update public.athlete_profiles set hr_max = 150, hr_rest = 160 where athlete_id = $1', [
        athleteId,
      ]),
      CHECK_VIOLATION,
    )
    await expectPgError(
      queryAs(db, coachId, 'update public.athlete_profiles set hr_max = 260 where athlete_id = $1', [athleteId]),
      CHECK_VIOLATION,
    )
  })
})

describe('notes privées du coach', () => {
  it("le coach les lit et les modifie ; l'athlète ne les voit jamais", async () => {
    const { coachId, athleteId } = await createCoachWithAthlete(db)
    const saved = await queryAs(
      db,
      coachId,
      `update public.coach_private_notes set body = 'Genou fragile, surveiller le volume'
       where athlete_id = $1 returning body`,
      [athleteId],
    )
    expect(saved).toEqual([{ body: 'Genou fragile, surveiller le volume' }])
    const seenByAthlete = await queryAs(db, athleteId, 'select * from public.coach_private_notes')
    expect(seenByAthlete).toHaveLength(0)
  })

  it("un autre coach n'y a pas accès", async () => {
    const { athleteId } = await createCoachWithAthlete(db)
    const stranger = await createCoach(db, 'Coach Inconnu')
    const read = await queryAs(db, stranger, 'select * from public.coach_private_notes where athlete_id = $1', [
      athleteId,
    ])
    expect(read).toHaveLength(0)
  })
})

describe('fonctions internes', () => {
  it('ne sont pas appelables depuis l’application', async () => {
    const coachId = await createCoach(db)
    const token = await createInvitation(db, coachId)
    const athleteId = await createUser(db)
    await expectPgError(
      queryAs(db, athleteId, 'select public.link_invitation($1, $2)', [token, athleteId]),
      PERMISSION_DENIED,
    )
    await expectPgError(
      asUser(db, null, (tx) => tx.query('select public.is_coach_of($1)', [athleteId])),
      PERMISSION_DENIED,
    )
  })
})
