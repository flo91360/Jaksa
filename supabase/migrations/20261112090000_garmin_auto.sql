-- =============================================================================
-- Rob1Coach 0.4.1 — import Garmin automatique.
--
-- La fonction garmin-sync, appelée toutes les 15 minutes par pg_cron, note ici
-- chacun de ses passages. Ce journal sert :
--   * à ne pas interroger Garmin plus d'une fois toutes les 5 minutes ;
--   * à afficher à l'athlète l'heure du dernier import automatique.
-- La tâche pg_cron elle-même est installée par le déploiement automatique
-- (.github/scripts/deploiement-supabase.sh), qui connaît l'adresse du projet.
-- =============================================================================

create table public.garmin_sync_runs (
  id bigint generated always as identity primary key,
  -- Compte importé (aucun si l'adresse de GARMIN_ATHLETE_EMAIL ne correspond à aucun athlète).
  athlete_id uuid references public.profiles (id) on delete cascade,
  ran_at timestamptz not null default now(),
  status text not null check (status in (
    'ok', 'unknown_athlete', 'garmin_key_rejected', 'garmin_unavailable', 'save_failed'
  )),
  imported integer not null default 0 check (imported >= 0),
  linked integer not null default 0 check (linked >= 0)
);

create index garmin_sync_runs_ran_at_idx on public.garmin_sync_runs (ran_at desc);
create index garmin_sync_runs_athlete_idx on public.garmin_sync_runs (athlete_id, ran_at desc);

alter table public.garmin_sync_runs enable row level security;

-- Seule la fonction (rôle service) écrit ; l'athlète lit ses propres passages.
create policy "garmin_sync_runs : l'athlète lit les siens"
on public.garmin_sync_runs for select to authenticated
using (athlete_id = (select auth.uid()));

revoke all on table public.garmin_sync_runs from anon, authenticated;
grant select on table public.garmin_sync_runs to authenticated;

-- Garder un mois de journal (environ 3 000 lignes) : nettoyé à chaque passage.
create function public.garmin_sync_runs_prune() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.garmin_sync_runs where ran_at < now() - interval '31 days';
  return null;
end;
$$;

create trigger garmin_sync_runs_prune after insert on public.garmin_sync_runs
for each statement execute function public.garmin_sync_runs_prune();

revoke execute on function public.garmin_sync_runs_prune() from public, anon, authenticated;
