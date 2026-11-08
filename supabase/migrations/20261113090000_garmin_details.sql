-- =============================================================================
-- Rob1Coach 0.5.0 — détail des activités Garmin.
--
-- La fonction garmin-sync lit le fichier .FIT d'origine des activités récentes
-- et en garde, ici, une version allégée (au plus 1 800 points par série) :
-- FC, vitesse, altitude, distance, cadence, puissance, tracé GPS, tours, et
-- les chiffres d'ensemble calculés par la montre. Le format est décrit dans
-- supabase/functions/_shared/garmin-detail.ts (ActivityDetail).
--
-- Seule la fonction (rôle service) écrit ; l'athlète et son coach lisent.
-- =============================================================================

create table public.garmin_activity_details (
  activity_id uuid primary key references public.garmin_activities (id) on delete cascade,
  -- Recopié de l'activité par le déclencheur : sert à la sécurité ligne par ligne.
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  -- ok : détail lu ; no_file : Garmin n'a pas de fichier ; unreadable : fichier illisible.
  status text not null check (status in ('ok', 'no_file', 'unreadable')),
  data jsonb check (
    (status = 'ok') = (data is not null)
    and (data is null or (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 2000000))
  ),
  fetched_at timestamptz not null default now()
);

create index garmin_activity_details_athlete_idx on public.garmin_activity_details (athlete_id);

-- L'athlète du détail est toujours celui de l'activité.
create function public.garmin_activity_details_before_write() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select a.athlete_id into new.athlete_id from public.garmin_activities a where a.id = new.activity_id;
  if new.athlete_id is null then
    raise exception 'Activité inconnue' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger garmin_activity_details_before_write before insert or update on public.garmin_activity_details
for each row execute function public.garmin_activity_details_before_write();

alter table public.garmin_activity_details enable row level security;

create policy "garmin_activity_details : l'athlète et son coach lisent"
on public.garmin_activity_details for select to authenticated
using (athlete_id = (select auth.uid()) or public.is_coach_of(athlete_id));

revoke all on table public.garmin_activity_details from anon, authenticated;
grant select on table public.garmin_activity_details to authenticated;

revoke execute on function public.garmin_activity_details_before_write() from public, anon, authenticated;

-- Journal de l'import automatique : nombre de détails lus à chaque passage.
alter table public.garmin_sync_runs add column details integer not null default 0 check (details >= 0);
