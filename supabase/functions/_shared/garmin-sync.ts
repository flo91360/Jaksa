// Import automatique (fonction garmin-sync), sans dépendance : testé par tests/functions/garmin-sync.test.ts.
//
// Appelée toutes les 15 minutes par une tâche pg_cron (installée par .github/scripts/deploiement-supabase.sh).
// Le niveau « Personal » de Garmin ne prévient pas quand une activité est synchronisée : on va donc la chercher.
import { type Fetch, fetchActivityFile, fetchGarminActivities, sameEmail } from './garmin-api.ts'
import { type ActivityDetail, buildDetail, type DecodeFit, extractFit } from './garmin-detail.ts'
import { type GarminActivityValues, type MatchWorkout, planImport } from './garmin-match.ts'

/** Jours relus à chaque passage (aujourd'hui compris, plus le lendemain en UTC pour les sorties du soir). */
export const SYNC_DAYS = 14
/** Écart minimal entre deux lectures chez Garmin, quel que soit le nombre d'appels. */
export const MIN_INTERVAL_MS = 5 * 60 * 1000
/**
 * Fichiers .FIT lus au plus par passage : le décodage coûte du temps de calcul, limité à 2 s par appel
 * sur l'offre gratuite de Supabase. Avec un passage tous les quarts d'heure, cela suffit largement.
 */
export const MAX_DETAILS_PER_RUN = 2
/** Un .FIT illisible ou introuvable est redemandé au plus toutes les 6 heures. */
export const DETAIL_RETRY_MS = 6 * 60 * 60 * 1000

export type DetailStatus = 'ok' | 'no_file' | 'unreadable'

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
  /**
   * Activités de l'athlète parties depuis `since` (ISO) sans détail enregistré, ou dont le dernier essai
   * a échoué avant `retryBefore` (ISO) : les plus récentes d'abord, `limit` au plus.
   */
  pendingDetails(athleteId: string, since: string, retryBefore: string, limit: number): Promise<{ id: string; garmin_activity_id: number }[]>
  saveDetail(row: { activity_id: string; status: DetailStatus; data: ActivityDetail | null }): Promise<void>
  log(entry: { athlete_id: string | null; status: SyncStatus; imported: number; linked: number; details: number }): Promise<void>
}

export type SyncResult = { status: SyncStatus; imported: number; linked: number; details: number }

const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10)

export async function runSync({
  apiKey,
  allowedEmail,
  now,
  fetchImpl,
  db,
  decodeFit,
}: {
  apiKey: string | undefined
  allowedEmail: string | undefined
  now: number
  fetchImpl: Fetch
  db: SyncDb
  /** Décodeur .FIT (SDK Garmin). Sans lui, seuls les résumés sont importés. */
  decodeFit?: DecodeFit
}): Promise<SyncResult> {
  const none = { imported: 0, linked: 0, details: 0 }
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
        // La veille du premier jour aussi : une séance peut être faite avec un jour de retard.
        db.workouts(athleteId, new Date(Date.parse(`${range.from}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10), range.to),
        db.existingLinks(
          athleteId,
          fetched.activities.map((a) => a.activityId),
        ),
      ])
      const rows = planImport(fetched.activities, workouts, existing)
      if (rows.length > 0) await db.save(athleteId, rows)
      result = { status: 'ok', imported: rows.length, linked: rows.filter((r) => r.workout_id).length, details: 0 }
    } catch {
      result = { status: 'save_failed', ...none }
    }
  }
  if (result.status === 'ok' && decodeFit) {
    try {
      result.details = await importDetails({ athleteId, token: fetched.token, since: range.from, now, fetchImpl, db, decodeFit })
    } catch {
      // Le détail est un plus : un échec n'empêche pas l'import des résumés, et sera retenté.
    }
  }
  await db.log({ athlete_id: athleteId, ...result })
  return result
}

/** Télécharge et enregistre le détail (.FIT) des activités qui n'en ont pas encore. Renvoie le nombre de détails lus. */
async function importDetails({
  athleteId,
  token,
  since,
  now,
  fetchImpl,
  db,
  decodeFit,
}: {
  athleteId: string
  token: string
  since: string
  now: number
  fetchImpl: Fetch
  db: SyncDb
  decodeFit: DecodeFit
}): Promise<number> {
  const pending = await db.pendingDetails(
    athleteId,
    `${since}T00:00:00Z`,
    new Date(now - DETAIL_RETRY_MS).toISOString(),
    MAX_DETAILS_PER_RUN,
  )
  let done = 0
  for (const activity of pending) {
    const file = await fetchActivityFile(token, activity.garmin_activity_id, fetchImpl)
    // Garmin indisponible ou clé refusée : on s'arrête là, sans rien noter, pour réessayer au prochain passage.
    if ('error' in file && file.error !== 'not_found') break
    let detail: ActivityDetail | null = null
    if ('bytes' in file) {
      const fit = await extractFit(file.bytes)
      let messages = null
      try {
        messages = fit ? decodeFit(fit) : null
      } catch {
        messages = null
      }
      detail = messages ? buildDetail(messages) : null
    }
    const status: DetailStatus = detail ? 'ok' : 'bytes' in file ? 'unreadable' : 'no_file'
    await db.saveDetail({ activity_id: activity.id, status, data: detail })
    if (detail) done++
  }
  return done
}

export { sameEmail }
