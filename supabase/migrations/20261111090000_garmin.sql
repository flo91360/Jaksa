-- =============================================================================
-- Rob1Coach 0.4.0 (test perso) — activités importées depuis Garmin Connect.
--
-- Pour l'instant, une seule personne importe ses activités, avec sa clé
-- d'API personnelle Garmin (niveau « Personal », lecture seule). La fonction
-- Supabase garmin-import lit les activités chez Garmin, et le site les
-- enregistre ici au nom de l'athlète, rattachées à la séance prévue.
--
-- Mêmes principes que les versions précédentes : RLS, droits d'écriture
-- limités colonne par colonne, fonctions à search_path vide.
-- =============================================================================

create table public.garmin_activities (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- Identifiant de l'activité chez Garmin (unique pour un athlète).
  garmin_activity_id bigint not null check (garmin_activity_id > 0),
  -- Séance prévue à laquelle l'activité est rattachée (aucune si rien ne correspond).
  workout_id uuid references public.workouts (id) on delete set null,
  start_time timestamptz not null,
  -- Jour de l'activité à l'heure locale de la montre (sert au rattachement).
  local_date date not null,
  -- Type d'activité Garmin (running, trail_running, cycling…).
  activity_type text not null default '' check (char_length(activity_type) <= 60),
  name text not null default '' check (char_length(name) <= 200),
  duration_s integer check (duration_s between 1 and 172800),
  moving_s integer check (moving_s between 1 and 172800),
  distance_m integer check (distance_m between 0 and 1000000),
  elevation_gain_m integer check (elevation_gain_m between 0 and 30000),
  avg_hr smallint check (avg_hr between 20 and 250),
  max_hr smallint check (max_hr between 20 and 250),
  calories integer check (calories between 0 and 30000),
  imported_at timestamptz not null default now(),
  unique (athlete_id, garmin_activity_id)
);

create index garmin_activities_athlete_date_idx on public.garmin_activities (athlete_id, local_date);
create index garmin_activities_workout_idx on public.garmin_activities (workout_id);

-- Une activité ne se rattache qu'à une séance du même athlète, et ne change pas d'athlète.
create function public.garmin_activities_before_write() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.athlete_id := old.athlete_id;
    new.imported_at := now();
  end if;
  if new.workout_id is not null and not exists (
    select 1 from public.workouts w where w.id = new.workout_id and w.athlete_id = new.athlete_id
  ) then
    raise exception 'Séance inconnue pour cet athlète' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger garmin_activities_before_write before insert or update on public.garmin_activities
for each row execute function public.garmin_activities_before_write();

-- =============================================================================
-- Sécurité ligne par ligne (RLS) : l'athlète gère les siennes, son coach les lit
-- =============================================================================
alter table public.garmin_activities enable row level security;

create policy "garmin_activities : l'athlète et son coach lisent"
on public.garmin_activities for select to authenticated
using (athlete_id = (select auth.uid()) or public.is_coach_of(athlete_id));

create policy "garmin_activities : l'athlète importe les siennes"
on public.garmin_activities for insert to authenticated
with check (athlete_id = (select auth.uid()));

create policy "garmin_activities : l'athlète met à jour les siennes"
on public.garmin_activities for update to authenticated
using (athlete_id = (select auth.uid()))
with check (athlete_id = (select auth.uid()));

create policy "garmin_activities : l'athlète supprime les siennes"
on public.garmin_activities for delete to authenticated
using (athlete_id = (select auth.uid()));

-- =============================================================================
-- Droits
-- =============================================================================
revoke all on table public.garmin_activities from anon, authenticated;

grant select, delete on table public.garmin_activities to authenticated;
grant insert (
  garmin_activity_id, workout_id, start_time, local_date, activity_type, name,
  duration_s, moving_s, distance_m, elevation_gain_m, avg_hr, max_hr, calories
) on public.garmin_activities to authenticated;
-- garmin_activity_id figure aussi dans les droits de mise à jour : l'import du site
-- (« upsert ») réécrit toutes les colonnes envoyées, y compris celle du conflit.
grant update (
  garmin_activity_id, workout_id, start_time, local_date, activity_type, name,
  duration_s, moving_s, distance_m, elevation_gain_m, avg_hr, max_hr, calories
) on public.garmin_activities to authenticated;

revoke execute on function public.garmin_activities_before_write() from public, anon, authenticated;
