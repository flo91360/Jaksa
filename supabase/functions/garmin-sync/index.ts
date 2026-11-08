// Fonction Supabase (Deno) : import automatique des activités Garmin du compte de test.
// Appelée toutes les 15 minutes par pg_cron, sans session : voir supabase/config.toml (verify_jwt = false).
// N'importe qui peut donc l'appeler, mais elle ne renvoie que des compteurs, n'interroge Garmin
// qu'une fois toutes les 5 minutes au plus, et n'écrit que dans le compte de GARMIN_ATHLETE_EMAIL.
//
// Secrets (Edge Functions → Secrets) : GARMIN_PERSONAL_API_KEY et GARMIN_ATHLETE_EMAIL, comme garmin-import.
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis par Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { runSync, type SyncDb } from '../_shared/garmin-sync.ts'

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return new Response(null, { status: 405 })

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false },
  })

  const db: SyncDb = {
    async findAthlete(email) {
      const { data, error } = await supabase.from('profiles').select('id').ilike('email', email).eq('role', 'athlete').limit(1)
      if (error) throw error
      return data[0]?.id ?? null
    },
    async lastRun() {
      const { data, error } = await supabase.from('garmin_sync_runs').select('ran_at').order('ran_at', { ascending: false }).limit(1)
      if (error) throw error
      return data[0]?.ran_at ?? null
    },
    async workouts(athleteId, from, to) {
      const { data, error } = await supabase
        .from('workouts')
        .select('id, scheduled_on, kind, position')
        .eq('athlete_id', athleteId)
        .gte('scheduled_on', from)
        .lte('scheduled_on', to)
      if (error) throw error
      return data
    },
    async existingLinks(athleteId, garminIds) {
      const { data, error } = await supabase
        .from('garmin_activities')
        .select('garmin_activity_id, workout_id')
        .eq('athlete_id', athleteId)
        .in('garmin_activity_id', garminIds)
      if (error) throw error
      return new Map(data.map((row: { garmin_activity_id: number; workout_id: string | null }) => [Number(row.garmin_activity_id), row.workout_id]))
    },
    async save(athleteId, rows) {
      const { error } = await supabase
        .from('garmin_activities')
        .upsert(rows.map((row) => ({ ...row, athlete_id: athleteId })), { onConflict: 'athlete_id,garmin_activity_id' })
      if (error) throw error
    },
    async log(entry) {
      await supabase.from('garmin_sync_runs').insert(entry)
    },
  }

  try {
    const result = await runSync({
      apiKey: Deno.env.get('GARMIN_PERSONAL_API_KEY'),
      allowedEmail: Deno.env.get('GARMIN_ATHLETE_EMAIL'),
      now: Date.now(),
      fetchImpl: fetch,
      db,
    })
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } })
  } catch {
    return new Response(JSON.stringify({ status: 'error' }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
