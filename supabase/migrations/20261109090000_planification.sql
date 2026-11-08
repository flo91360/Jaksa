-- =============================================================================
-- Rob1Coach 0.2.0 — planification : séances planifiées, bibliothèque de
-- séances types du coach, courses et objectifs de l'athlète.
--
-- Mêmes principes que le socle : RLS sur chaque table, droits d'écriture
-- limités colonne par colonne, fonctions à search_path vide.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Contenu d'une séance : tableau (40 éléments au plus) d'étapes et de blocs
-- répétés. Voir src/domain/workouts.ts pour la description complète.
--
--   étape : { type: 'step', kind, duration, target, note }
--     kind     : warmup | active | recovery | rest | cooldown
--     duration : { type: 'time', seconds } | { type: 'distance', meters } | { type: 'open' }
--     target   : { type: 'none' } | { type: 'zone', zone }
--              | { type: 'pace', fast, slow }  (secondes par km)
--              | { type: 'hr', min, max }      (battements par minute)
--   bloc  : { type: 'repeat', count, steps: [étape, …] } (pas de bloc dans un bloc)
-- -----------------------------------------------------------------------------
create function public.workout_step_is_valid(s jsonb) returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d jsonb := s -> 'duration';
  t jsonb := s -> 'target';
begin
  if jsonb_typeof(s) is distinct from 'object'
     or s ->> 'type' is distinct from 'step'
     or coalesce(s ->> 'kind', '') not in ('warmup', 'active', 'recovery', 'rest', 'cooldown')
     or (s ? 'note' and (jsonb_typeof(s -> 'note') <> 'string' or char_length(s ->> 'note') > 200))
     or jsonb_typeof(d) is distinct from 'object'
     or jsonb_typeof(t) is distinct from 'object'
  then
    return false;
  end if;

  case d ->> 'type'
    when 'time' then
      if d -> 'seconds' is null or not public.jsonb_int_between(d -> 'seconds', 1, 86400) then return false; end if;
    when 'distance' then
      if d -> 'meters' is null or not public.jsonb_int_between(d -> 'meters', 1, 500000) then return false; end if;
    when 'open' then
      null;
    else
      return false;
  end case;

  case t ->> 'type'
    when 'none' then
      null;
    when 'zone' then
      if t -> 'zone' is null or not public.jsonb_int_between(t -> 'zone', 1, 7) then return false; end if;
    when 'pace' then
      if t -> 'fast' is null or t -> 'slow' is null
         or not public.jsonb_int_between(t -> 'fast', 60, 1800)
         or not public.jsonb_int_between(t -> 'slow', 60, 1800)
         or (t ->> 'fast')::integer > (t ->> 'slow')::integer
      then
        return false;
      end if;
    when 'hr' then
      if t -> 'min' is null or t -> 'max' is null
         or not public.jsonb_int_between(t -> 'min', 30, 250)
         or not public.jsonb_int_between(t -> 'max', 30, 250)
         or (t ->> 'min')::integer > (t ->> 'max')::integer
      then
        return false;
      end if;
    else
      return false;
  end case;

  return true;
end;
$$;

create function public.workout_steps_are_valid(items jsonb) returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  inner_step jsonb;
begin
  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 40 then
    return false;
  end if;

  for item in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(item) = 'object' and item ->> 'type' = 'repeat' then
      if item -> 'count' is null
         or not public.jsonb_int_between(item -> 'count', 1, 99)
         or jsonb_typeof(item -> 'steps') is distinct from 'array'
         or jsonb_array_length(item -> 'steps') not between 1 and 10
      then
        return false;
      end if;
      for inner_step in select value from jsonb_array_elements(item -> 'steps') loop
        if not public.workout_step_is_valid(inner_step) then
          return false;
        end if;
      end loop;
    elsif not public.workout_step_is_valid(item) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Séances planifiées
-- -----------------------------------------------------------------------------
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  coach_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  scheduled_on date not null,
  -- Ordre des séances d'une même journée (biquotidien).
  position smallint not null default 0 check (position between 0 and 100),
  kind text not null default 'run' check (kind in ('run', 'trail', 'strength', 'cross', 'rest')),
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 5000),
  steps jsonb not null default '[]'::jsonb check (public.workout_steps_are_valid(steps)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workouts_athlete_date_idx on public.workouts (athlete_id, scheduled_on);
create index workouts_coach_date_idx on public.workouts (coach_id, scheduled_on);

create trigger workouts_updated_at before update on public.workouts
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Bibliothèque de séances types (propre à chaque coach)
-- -----------------------------------------------------------------------------
create table public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null default 'run' check (kind in ('run', 'trail', 'strength', 'cross', 'rest')),
  title text not null check (char_length(trim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 5000),
  steps jsonb not null default '[]'::jsonb check (public.workout_steps_are_valid(steps)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workout_templates_coach_idx on public.workout_templates (coach_id);

create trigger workout_templates_updated_at before update on public.workout_templates
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Courses et objectifs (priorité A, B ou C)
-- -----------------------------------------------------------------------------
create table public.races (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  race_on date not null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  priority text not null default 'B' check (priority in ('A', 'B', 'C')),
  distance_km numeric(6, 2) check (distance_km > 0 and distance_km <= 1000),
  elevation_gain_m integer check (elevation_gain_m between 0 and 30000),
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index races_athlete_date_idx on public.races (athlete_id, race_on);

create trigger races_updated_at before update on public.races
for each row execute function public.set_updated_at();

-- =============================================================================
-- Sécurité ligne par ligne (RLS)
-- =============================================================================
alter table public.workouts enable row level security;
alter table public.workout_templates enable row level security;
alter table public.races enable row level security;

-- workouts : l'athlète lit les siennes, son coach planifie ---------------------
create policy "workouts : l'athlète et son coach lisent"
on public.workouts for select to authenticated
using (athlete_id = (select auth.uid()) or public.is_coach_of(athlete_id));

create policy "workouts : le coach planifie pour ses athlètes"
on public.workouts for insert to authenticated
with check (coach_id = (select auth.uid()) and public.is_coach_of(athlete_id));

create policy "workouts : le coach modifie"
on public.workouts for update to authenticated
using (public.is_coach_of(athlete_id))
with check (public.is_coach_of(athlete_id));

create policy "workouts : le coach supprime"
on public.workouts for delete to authenticated
using (public.is_coach_of(athlete_id));

-- workout_templates : le coach seulement ---------------------------------------
create policy "workout_templates : le coach lit les siennes"
on public.workout_templates for select to authenticated
using (coach_id = (select auth.uid()));

create policy "workout_templates : seul un coach en crée"
on public.workout_templates for insert to authenticated
with check (coach_id = (select auth.uid()) and public.my_role() = 'coach');

create policy "workout_templates : le coach modifie les siennes"
on public.workout_templates for update to authenticated
using (coach_id = (select auth.uid()))
with check (coach_id = (select auth.uid()));

create policy "workout_templates : le coach supprime les siennes"
on public.workout_templates for delete to authenticated
using (coach_id = (select auth.uid()));

-- races : l'athlète et son coach, en lecture comme en écriture -----------------
create policy "races : l'athlète et son coach lisent"
on public.races for select to authenticated
using (athlete_id = (select auth.uid()) or public.is_coach_of(athlete_id));

create policy "races : l'athlète et son coach ajoutent"
on public.races for insert to authenticated
with check (
  (athlete_id = (select auth.uid()) or public.is_coach_of(athlete_id))
  and created_by = (select auth.uid())
);

create policy "races : l'athlète et son coach modifient"
on public.races for update to authenticated
using (athlete_id = (select auth.uid()) or public.is_coach_of(athlete_id))
with check (athlete_id = (select auth.uid()) or public.is_coach_of(athlete_id));

create policy "races : l'athlète et son coach suppriment"
on public.races for delete to authenticated
using (athlete_id = (select auth.uid()) or public.is_coach_of(athlete_id));

-- =============================================================================
-- Droits
-- =============================================================================
revoke all on table public.workouts, public.workout_templates, public.races from anon, authenticated;

grant select, delete on table public.workouts, public.workout_templates, public.races to authenticated;

-- athlete_id n'est pas modifiable : copier une séance vers un autre athlète
-- crée une nouvelle séance.
grant insert (athlete_id, scheduled_on, position, kind, title, description, steps)
  on public.workouts to authenticated;
grant update (scheduled_on, position, kind, title, description, steps)
  on public.workouts to authenticated;

grant insert (kind, title, description, steps) on public.workout_templates to authenticated;
grant update (kind, title, description, steps) on public.workout_templates to authenticated;

grant insert (athlete_id, race_on, name, priority, distance_km, elevation_gain_m, notes)
  on public.races to authenticated;
grant update (race_on, name, priority, distance_km, elevation_gain_m, notes)
  on public.races to authenticated;

-- Les validateurs restent exécutables par authenticated : PostgreSQL les
-- appelle avec les droits de l'utilisateur lors des contrôles CHECK.
