import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { expect } from 'vitest'

const root = join(import.meta.dirname, '..', '..')
const migrationsDir = join(root, 'supabase', 'migrations')

/** Base PostgreSQL neuve, avec la cale Supabase et toutes les migrations. */
export async function createDb(): Promise<PGlite> {
  const db = await PGlite.create()
  await db.exec(readFileSync(join(import.meta.dirname, 'supabase-shim.sql'), 'utf8'))
  const migrations = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
  for (const name of migrations) {
    await db.exec(readFileSync(join(migrationsDir, name), 'utf8'))
  }
  return db
}

let emailCounter = 0

/** Crée un compte comme le ferait Supabase Auth à l'inscription. */
export async function createUser(
  db: PGlite,
  options: { fullName?: string; email?: string; invitationToken?: string; role?: 'coach' | 'athlete' } = {},
): Promise<string> {
  emailCounter += 1
  const email = options.email ?? `personne${emailCounter}@exemple.fr`
  const metadata: Record<string, string> = {}
  if (options.fullName !== undefined) metadata.full_name = options.fullName
  if (options.invitationToken !== undefined) metadata.invitation_token = options.invitationToken
  const { rows } = await db.query<{ id: string }>(
    'insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id',
    [email, JSON.stringify(metadata)],
  )
  const id = rows[0].id
  if (options.role === 'coach') {
    await db.query(`update public.profiles set role = 'coach' where id = $1`, [id])
  }
  return id
}

export async function createCoach(db: PGlite, fullName = 'Coach Rob'): Promise<string> {
  return createUser(db, { fullName, role: 'coach' })
}

/**
 * Exécute fn dans une transaction avec les droits d'un utilisateur connecté
 * (rôle authenticated + jeton JWT), ou d'un visiteur anonyme si userId est null.
 */
export async function asUser<T>(
  db: PGlite,
  userId: string | null,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    if (userId === null) {
      await tx.exec('set local role anon')
    } else {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: userId, role: 'authenticated' }),
      ])
      await tx.exec('set local role authenticated')
    }
    return fn(tx)
  })
}

/** Raccourci : requête unique avec les droits de userId. */
export async function queryAs<R = Record<string, unknown>>(
  db: PGlite,
  userId: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<R[]> {
  return asUser(db, userId, async (tx) => (await tx.query<R>(sql, params)).rows)
}

/** Vérifie qu'une promesse échoue avec le code SQLSTATE attendu. */
export async function expectPgError(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ code })
}

/** Crée une invitation pour un coach et renvoie son jeton. */
export async function createInvitation(db: PGlite, coachId: string, athleteName = ''): Promise<string> {
  const rows = await queryAs<{ token: string }>(
    db,
    coachId,
    'insert into public.invitations (athlete_name) values ($1) returning token',
    [athleteName],
  )
  return rows[0].token
}

/** Coach + athlète déjà rattaché par invitation. */
export async function createCoachWithAthlete(db: PGlite): Promise<{ coachId: string; athleteId: string }> {
  const coachId = await createCoach(db)
  const token = await createInvitation(db, coachId, 'Léa')
  const athleteId = await createUser(db, { fullName: 'Léa Martin', invitationToken: token })
  return { coachId, athleteId }
}
