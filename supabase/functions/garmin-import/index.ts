// Fonction Supabase (Deno) : lit chez Garmin les activités de la personne connectée.
// Déploiement et secrets : voir docs/DEPLOIEMENT.md, étape 8.
//
// Secrets (Edge Functions → Secrets) :
//   GARMIN_PERSONAL_API_KEY : la clé d'API personnelle Garmin ;
//   GARMIN_ATHLETE_EMAIL    : l'adresse du compte Rob1Coach autorisé à lire ces activités.
// SUPABASE_URL et SUPABASE_ANON_KEY sont fournis par Supabase.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleImport } from '../_shared/garmin-api.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  // Le compte connecté, vérifié par Supabase à partir de son jeton de session.
  const jwt = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '')
  const { data, error } = await supabase.auth.getUser(jwt)
  if (error || !data.user) return json(401, { error: 'not_signed_in' })

  const body = await request.json().catch(() => null)
  const result = await handleImport({
    email: data.user.email,
    body,
    apiKey: Deno.env.get('GARMIN_PERSONAL_API_KEY'),
    allowedEmail: Deno.env.get('GARMIN_ATHLETE_EMAIL'),
    fetchImpl: fetch,
  })
  return json(result.status, result.body)
})
