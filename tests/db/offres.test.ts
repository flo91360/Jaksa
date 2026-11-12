import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { PLANS } from '../../src/domain/plans.ts'
import { createCoach, createDb, createInvitation, createUser, expectPgError, queryAs } from './helpers.ts'

const PERMISSION_DENIED = '42501'
const PLAN_FULL = 'RC007'

let db: PGlite

beforeAll(async () => {
  db = await createDb()
})

/** Compte créé depuis le formulaire « Créer mon espace coach ». */
async function signUpCoach(email: string, extra: Record<string, string> = {}): Promise<string> {
  const { rows } = await db.query<{ id: string }>('insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id', [
    email,
    JSON.stringify({ full_name: 'Nouveau Coach', account_type: 'coach', terms_version: '2026-11-12', ...extra }),
  ])
  return rows[0].id
}

async function addAthlete(coachId: string): Promise<string> {
  return createUser(db, { invitationToken: await createInvitation(db, coachId) })
}

const activeCount = async (coachId: string) =>
  (await db.query<{ n: number }>(`select count(*)::int as n from public.coach_athletes where coach_id = $1 and status = 'active'`, [coachId])).rows[0].n

describe('offres : mêmes limites dans la base et dans le site', () => {
  it.each(Object.values(PLANS))('$code', async (plan) => {
    const { rows } = await db.query<{ n: number | null }>('select public.plan_athlete_limit($1) as n', [plan.code])
    expect(rows[0].n).toBe(plan.athleteLimit)
  })
})

describe('inscription d’un coach', () => {
  it('crée un compte coach avec l’offre Découverte', async () => {
    const coachId = await signUpCoach('nouveau-coach@exemple.fr')
    const { rows } = await db.query('select role, full_name from public.profiles where id = $1', [coachId])
    expect(rows).toEqual([{ role: 'coach', full_name: 'Nouveau Coach' }])
    expect(await queryAs(db, coachId, 'select plan from public.coach_subscriptions')).toEqual([{ plan: 'decouverte' }])
    // Il peut inviter tout de suite.
    expect(await createInvitation(db, coachId, 'Léa')).toMatch(/^[0-9a-f]{64}$/)
  })

  it('ignore un jeton d’invitation : un coach ne rejoint pas un autre coach en s’inscrivant', async () => {
    const autre = await createCoach(db)
    const token = await createInvitation(db, autre)
    const coachId = await signUpCoach('coach-avec-jeton@exemple.fr', { invitation_token: token })
    const { rows } = await db.query('select 1 from public.coach_athletes where athlete_id = $1', [coachId])
    expect(rows).toHaveLength(0)
  })

  it('un compte athlète reste athlète, quoi qu’il envoie ensuite', async () => {
    const athleteId = await createUser(db)
    await expectPgError(queryAs(db, athleteId, `update public.profiles set role = 'coach' where id = $1`, [athleteId]), PERMISSION_DENIED)
    await expectPgError(
      queryAs(db, athleteId, `insert into public.coach_subscriptions (coach_id, plan) values ($1, 'fondateur')`, [athleteId]),
      PERMISSION_DENIED,
    )
  })

  it('un compte passé coach à la main reçoit aussi son offre', async () => {
    const coachId = await createCoach(db)
    const { rows } = await db.query('select plan from public.coach_subscriptions where coach_id = $1', [coachId])
    expect(rows).toEqual([{ plan: 'decouverte' }])
  })
})

describe('limite d’athlètes', () => {
  it('refuse le 4e athlète en Découverte, et le dit avant l’inscription', async () => {
    const coachId = await signUpCoach('complet@exemple.fr')
    for (let i = 0; i < 3; i += 1) await addAthlete(coachId)
    expect(await activeCount(coachId)).toBe(3)

    const token = await createInvitation(db, coachId, 'Quatrième')
    expect(await queryAs(db, null, 'select status from public.get_invitation($1)', [token])).toEqual([{ status: 'full' }])

    // Inscription avec ce lien : le compte est créé, sans rattachement.
    const quatrieme = await createUser(db, { invitationToken: token })
    expect(await activeCount(coachId)).toBe(3)
    // Compte existant qui accepte le lien : refus explicite.
    await expectPgError(queryAs(db, quatrieme, 'select public.accept_invitation($1)', [token]), PLAN_FULL)
  })

  it('archiver un athlète libère une place ; le réactiver quand tout est pris est refusé', async () => {
    const coachId = await signUpCoach('archive@exemple.fr')
    const premier = await addAthlete(coachId)
    await addAthlete(coachId)
    await addAthlete(coachId)

    await queryAs(db, coachId, `update public.coach_athletes set status = 'archived' where athlete_id = $1`, [premier])
    const token = await createInvitation(db, coachId)
    expect(await queryAs(db, null, 'select status from public.get_invitation($1)', [token])).toEqual([{ status: 'valid' }])
    await createUser(db, { invitationToken: token })
    expect(await activeCount(coachId)).toBe(3)

    await expectPgError(
      queryAs(db, coachId, `update public.coach_athletes set status = 'active' where athlete_id = $1`, [premier]),
      PLAN_FULL,
    )
  })

  it('une offre supérieure ouvre des places ; un coach fondateur n’a pas de limite', async () => {
    const coachId = await signUpCoach('grandit@exemple.fr')
    for (let i = 0; i < 3; i += 1) await addAthlete(coachId)
    await db.query(`select public.set_coach_plan('GRANDIT@exemple.fr', 'solo')`)
    await addAthlete(coachId)
    expect(await activeCount(coachId)).toBe(4)

    await db.query(`select public.set_coach_plan('grandit@exemple.fr', 'fondateur')`)
    for (let i = 0; i < 8; i += 1) await addAthlete(coachId)
    expect(await activeCount(coachId)).toBe(12)
  })
})

describe('offre : qui lit, qui écrit', () => {
  it('le coach lit la sienne, pas celle des autres ; un athlète n’en voit aucune', async () => {
    const coachId = await signUpCoach('lecture@exemple.fr')
    await signUpCoach('voisin@exemple.fr')
    const athleteId = await addAthlete(coachId)
    expect(await queryAs(db, coachId, 'select coach_id from public.coach_subscriptions')).toEqual([{ coach_id: coachId }])
    expect(await queryAs(db, athleteId, 'select coach_id from public.coach_subscriptions')).toEqual([])
    await expectPgError(queryAs(db, null, 'select * from public.coach_subscriptions'), PERMISSION_DENIED)
  })

  it('personne ne change son offre depuis le site', async () => {
    const coachId = await signUpCoach('triche@exemple.fr')
    await expectPgError(queryAs(db, coachId, `update public.coach_subscriptions set plan = 'fondateur'`), PERMISSION_DENIED)
    await expectPgError(queryAs(db, coachId, `select public.set_coach_plan('triche@exemple.fr', 'fondateur')`), PERMISSION_DENIED)
    await expectPgError(queryAs(db, coachId, 'delete from public.coach_subscriptions'), PERMISSION_DENIED)
  })

  it('set_coach_plan refuse un e-mail inconnu ou une offre inconnue', async () => {
    await signUpCoach('offre-inconnue@exemple.fr')
    await expect(db.query(`select public.set_coach_plan('personne@exemple.fr', 'solo')`)).rejects.toThrow(/Aucun coach/)
    await expectPgError(db.query(`select public.set_coach_plan('offre-inconnue@exemple.fr', 'platine')`), '23514')
  })
})
