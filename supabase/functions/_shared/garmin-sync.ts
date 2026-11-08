// Import automatique (fonction garmin-sync), sans dépendance : testé par tests/functions/garmin-sync.test.ts.
//
// Appelée toutes les 15 minutes par une tâche pg_cron (installée par .github/scripts/deploiement-supabase.sh).
// Le niveau « Personal » de Garmin ne prévient pas quand une activité est synchronisée : on va donc la chercher.
import { type Fetch, fetchGarminActivities, sameEmail } from './garmin-api.ts'
import { type GarminActivityValues, type MatchWorkout, planImport } from './garmin-match.ts'

/** Jours relus à chaque passage (aujourd'hui compris, plus le lendemain en UTC pour les sorties du soir). */
export const SYNC_DAYS = 14
/** Écart minimal entre deux lectures chez Garmin, quel que soit le nombre d'appels. */
export const MIN_INTERVAL_MS = 5 * 60 * 1000

export type SyncStatus =
  | 'ok'
  | 'not_configured'
  | 'unknown_athlete'
  | 'too_soon'
  | 'garmin_key_rejected'
  | 'garmin_unavailable'
  | 'save_failed'

/** Accès à la base, fourni par la fonction (client Supabase « service ») ou par les tests. */
export type SyncDb = {
  /** Identifiant du profil dont l'adresse est `email`, s'il existe. */
  findAthlete(email: string): Promise<string | null>
  /** Heure du dernier passage enregistré (ISO), s'il y en a un. */
  lastRun(): Promise<string | null>
  workouts(athleteId: string, from: string, to: string): Promise<MatchWorkout[]>
  existingLinks(athleteId: string, garminIds: number[]): Promise<Map<number, string | null>>
  save(athleteId: string, rows: (GarminActivityValues & { workout_id: string | null })[]): Promise<void>
  log(entry: { athlete_id: string | null; status: SyncStatus; imported: number; linked: number }): Promise<void>
}

export type SyncResult = { status: SyncStatus; imported: number; linked: number }

const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10)

export async function runSync({
  apiKey,
  allowedEmail,
  now,
  fetchImpl,
  db,
}: {
  apiKey: string | undefined
  allowedEmail: string | undefined
  now: number
  fetchImpl: Fetch
  db: SyncDb
}): Promise<SyncResult> {
  const none = { imported: 0, linked: 0 }
  if (!apiKey?.trim() || !allowedEmail?.trim()) return { status: 'not_configured', ...none }

  const last = await db.lastRun()
  if (last && now - Date.parse(last) < MIN_INTERVAL_MS) return { status: 'too_soon', ...none }

  const athleteId = await db.findAthlete(allowedEmail.trim())
  if (!athleteId) {
    await db.log({ athlete_id: null, status: 'unknown_athlete', ...none })
    return { status: 'unknown_athlete', ...none }
  }

  const range = { from: isoDay(now - (SYNC_DAYS - 1) * 86_400_000), to: isoDay(now + 86_400_000) }
  const fetched = await fetchGarminActivities(apiKey, range, fetchImpl)
  if ('error' in fetched) {
    await db.log({ athlete_id: athleteId, status: fetched.error, ...none })
    return { status: fetched.error, ...none }
  }

  let result: SyncResult = { status: 'ok', ...none }
  if (fetched.activities.length > 0) {
    try {
      const [workouts, existing] = await Promise.all([
        db.workouts(athleteId, range.from, range.to),
        db.existingLinks(
          athleteId,
          fetched.activities.map((a) => a.activityId),
        ),
      ])
      const rows = planImport(fetched.activities, workouts, existing)
      if (rows.length > 0) await db.save(athleteId, rows)
      result = { status: 'ok', imported: rows.length, linked: rows.filter((r) => r.workout_id).length }
    } catch {
      result = { status: 'save_failed', ...none }
    }
  }
  await db.log({ athlete_id: athleteId, ...result })
  return result
}

export { sameEmail }
