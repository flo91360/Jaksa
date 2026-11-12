-- =============================================================================
-- Rob1Coach 0.9.0 — deux modes de coaching, choisis par le coach pour chaque athlète.
--
--   strict   : le coach fixe les jours et les séances (fonctionnement d'origine).
--   flexible : « souple ». Le coach donne un volume hebdomadaire (fourchette de
--              kilomètres) et des séances à faire dans la semaine ; l'athlète
--              choisit ses jours. Son suivi montre les séances faites, celles
--              qui restent et les kilomètres restants.
--
-- Mêmes principes que les versions précédentes : RLS, droits limités colonne
-- par colonne, fonctions SECURITY DEFINER à search_path vide.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Mode de coaching, par lien coach ↔ athlète
-- -----------------------------------------------------------------------------
alter table public.coach_athletes
  add column mode text not null default 'strict' check (mode in ('strict', 'flexible'));

grant update (mode) on public.coach_athletes to authenticated;

-- La vue des liens expose le mode (nouvelle colonne en fin de liste).
create or replace view public.coach_links
with (security_invoker = true)
as
select
  ca.coach_id,
  ca.athlete_id,
  ca.status,
  ca.created_at as linked_at,
  coach.full_name as coach_name,
  coach.email as coach_email,
  athlete.full_name as athlete_name,
  athlete.email as athlete_email,
  ca.mode
from public.coach_athletes ca
join public.profiles coach on coach.id = ca.coach_id
join public.profiles athlete on athlete.id = ca.athlete_id;

-- -----------------------------------------------------------------------------
-- Séances « à faire dans la semaine »
--   flexible  : le jour est choisi par l'athlète. Tant qu'il n'a pas choisi,
--               scheduled_on est le lundi de la semaine concernée.
--   placed_at : moment où l'athlète a choisi son jour (vide : pas encore placé).
-- -----------------------------------------------------------------------------
alter table public.workouts
  add column flexible boolean not null default false,
  add column placed_at timestamptz;

grant insert (flexible) on public.workouts to authenticated;
grant update (flexible) on public.workouts to authenticated;

create index workouts_flexible_idx on public.workouts (athlete_id, scheduled_on) where flexible;

-- Lundi de la semaine d'une date (sans passer par les fuseaux horaires).
create function public.monday_of(p_day date) returns date
language sql
immutable
set search_path = ''
as $$
  select p_day - (extract(isodow from p_day)::integer - 1);
$$;

-- Une séance souple pas encore placée est rangée au lundi de sa semaine.
-- Le coach garde la main : s'il déplace une séance souple vers une autre semaine,
-- ou la repasse en séance à jour fixe, le choix de l'athlète est oublié.
create function public.workouts_keep_placement() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.flexible then
    new.placed_at := null;
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.placed_at is not null
     and public.monday_of(new.scheduled_on) <> public.monday_of(old.scheduled_on)
  then
    new.placed_at := null;
  end if;
  if new.placed_at is null then
    new.scheduled_on := public.monday_of(new.scheduled_on);
  end if;
  return new;
end;
$$;

create trigger workouts_keep_placement before insert or update on public.workouts
for each row execute function public.workouts_keep_placement();

-- L'athlète choisit (ou change) le jour d'une séance souple, dans sa semaine.
-- p_day vide : la séance redevient « à placer ».
create function public.place_flexible_workout(p_workout uuid, p_day date) returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_workout public.workouts%rowtype;
  v_monday date;
  v_position smallint;
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = 'RC006';
  end if;

  select * into v_workout from public.workouts w
  where w.id = p_workout and w.athlete_id = v_me and w.flexible
  for update;
  if not found then
    raise exception 'Séance introuvable, ou dont le jour est fixé par le coach' using errcode = '42501';
  end if;

  v_monday := public.monday_of(v_workout.scheduled_on);

  if p_day is null then
    update public.workouts set scheduled_on = v_monday, placed_at = null where id = p_workout;
    return v_monday;
  end if;

  if p_day < v_monday or p_day > v_monday + 6 then
    raise exception 'Le jour doit rester dans la semaine prévue par le coach' using errcode = '23514';
  end if;

  -- Après les séances déjà prévues ce jour-là.
  select least(100, coalesce(max(w.position) + 1, 0))::smallint into v_position
  from public.workouts w
  where w.athlete_id = v_me and w.scheduled_on = p_day and w.id <> p_workout
    and (not w.flexible or w.placed_at is not null);

  update public.workouts
  set scheduled_on = p_day, position = v_position, placed_at = now()
  where id = p_workout;
  return p_day;
end;
$$;

-- -----------------------------------------------------------------------------
-- Volume de la semaine : une fourchette de kilomètres par athlète et par semaine
-- -----------------------------------------------------------------------------
create table public.weekly_targets (
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  -- Lundi de la semaine.
  week_start date not null check (extract(isodow from week_start) = 1),
  coach_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  km_min numeric(5, 1) not null check (km_min >= 0 and km_min <= 500),
  km_max numeric(5, 1) not null check (km_max > 0 and km_max <= 500),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (athlete_id, week_start),
  check (km_min <= km_max)
);

create trigger weekly_targets_updated_at before update on public.weekly_targets
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Sorties déclarées par l'athlète (sans montre reliée) : elles comptent dans
-- les kilomètres de la semaine.
-- -----------------------------------------------------------------------------
create table public.athlete_runs (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  run_on date not null,
  distance_m integer not null check (distance_m between 100 and 1000000),
  duration_s integer check (duration_s between 1 and 172800),
  elevation_gain_m integer check (elevation_gain_m between 0 and 30000),
  note text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);

create index athlete_runs_athlete_date_idx on public.athlete_runs (athlete_id, run_on);

-- -----------------------------------------------------------------------------
-- E-mail « ta séance de demain » : une séance souple que l'athlète n'a pas
-- encore placée n'est pas « demain », même si elle est rangée au lundi.
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_tomorrow_workouts(p_day date default null) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Europe/Paris')::date + 1);
  r record;
  v_count integer := 0;
begin
  for r in
    select
      w.athlete_id,
      jsonb_agg(jsonb_build_object('id', w.id, 'title', w.title, 'kind', w.kind) order by w.position) as workouts
    from public.workouts w
    join public.coach_athletes ca on ca.coach_id = w.coach_id and ca.athlete_id = w.athlete_id and ca.status = 'active'
    where w.scheduled_on = v_day and w.kind <> 'rest'
      and (not w.flexible or w.placed_at is not null)
    group by w.athlete_id
  loop
    perform public.enqueue_email(
      r.athlete_id,
      'workout_tomorrow',
      jsonb_build_object('date', v_day, 'workouts', r.workouts),
      'tomorrow:' || r.athlete_id || ':' || v_day
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- =============================================================================
-- Sécurité ligne par ligne (RLS)
-- =============================================================================
alter table public.weekly_targets enable row level security;
alter table public.athlete_runs enable row level security;

-- weekly_targets : le coach fixe le volume, l'athlète le lit ----------------------
create policy "weekly_targets : l'athlète et son coach lisent"
on public.weekly_targets for select to authenticated
using (athlete_id = (select auth.uid()) or public.is_coach_of(athlete_id));

create policy "weekly_targets : le coach fixe le volume"
on public.weekly_targets for insert to authenticated
with check (coach_id = (select auth.uid()) and public.is_coach_of(athlete_id));

create policy "weekly_targets : le coach modifie"
on public.weekly_targets for update to authenticated
using (public.is_coach_of(athlete_id))
with check (public.is_coach_of(athlete_id));

create policy "weekly_targets : le coach supprime"
on public.weekly_targets for delete to authenticated
using (public.is_coach_of(athlete_id));

-- athlete_runs : l'athlète déclare ses sorties, son coach les lit ------------------
create policy "athlete_runs : l'athlète et son coach lisent"
on public.athlete_runs for select to authenticated
using (athlete_id = (select auth.uid()) or public.is_coach_of(athlete_id));

create policy "athlete_runs : l'athlète déclare les siennes"
on public.athlete_runs for insert to authenticated
with check (athlete_id = (select auth.uid()));

create policy "athlete_runs : l'athlète modifie les siennes"
on public.athlete_runs for update to authenticated
using (athlete_id = (select auth.uid()))
with check (athlete_id = (select auth.uid()));

create policy "athlete_runs : l'athlète supprime les siennes"
on public.athlete_runs for delete to authenticated
using (athlete_id = (select auth.uid()));

-- =============================================================================
-- Droits
-- =============================================================================
revoke all on table public.weekly_targets, public.athlete_runs from anon, authenticated;

grant select, delete on table public.weekly_targets, public.athlete_runs to authenticated;
grant insert (athlete_id, week_start, km_min, km_max, note) on public.weekly_targets to authenticated;
grant update (km_min, km_max, note) on public.weekly_targets to authenticated;
grant insert (run_on, distance_m, duration_s, elevation_gain_m, note) on public.athlete_runs to authenticated;
grant update (run_on, distance_m, duration_s, elevation_gain_m, note) on public.athlete_runs to authenticated;

grant select on table public.coach_links to authenticated;

revoke execute on function public.workouts_keep_placement() from public, anon, authenticated;
revoke execute on function public.place_flexible_workout(uuid, date) from public, anon;
grant execute on function public.place_flexible_workout(uuid, date) to authenticated;
