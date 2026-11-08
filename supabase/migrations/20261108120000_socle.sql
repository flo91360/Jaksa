-- =============================================================================
-- Rob1Coach — socle : comptes, rôles, lien coach ↔ athlète, invitations,
-- fiche athlète (physiologie, zones FC / allures) et notes privées du coach.
--
-- Principes de sécurité :
--   * toutes les tables du schéma public ont la RLS activée ;
--   * un coach ne voit que ses athlètes, un athlète que ses propres données
--     (et le profil de son coach) ;
--   * les droits d'écriture sont limités colonne par colonne (GRANT) ;
--   * les opérations sensibles passent par des fonctions SECURITY DEFINER
--     avec search_path vide.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Types
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('coach', 'athlete');

-- -----------------------------------------------------------------------------
-- Utilitaires
-- -----------------------------------------------------------------------------
create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Vrai si v est absent, null JSON, ou un entier compris entre lo et hi.
create function public.jsonb_int_between(v jsonb, lo integer, hi integer) returns boolean
language sql
immutable
set search_path = ''
as $$
  select v is null
      or jsonb_typeof(v) = 'null'
      or (
        jsonb_typeof(v) = 'number'
        and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric)
        and (v #>> '{}')::numeric between lo and hi
      );
$$;

-- Zones d'un athlète : tableau (7 zones au plus) d'objets
--   { zone, name, hr_min, hr_max, pace_slow, pace_fast }
-- zone : numéro 1..n dans l'ordre ; FC en battements/min ; allures en
-- secondes par km (pace_fast = allure la plus rapide, donc la plus petite).
create function public.zones_are_valid(z jsonb) returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  n integer := 0;
begin
  if z is null or jsonb_typeof(z) <> 'array' or jsonb_array_length(z) > 7 then
    return false;
  end if;

  for item in select value from jsonb_array_elements(z) loop
    n := n + 1;
    if jsonb_typeof(item) <> 'object'
       or coalesce(item ->> 'zone', '') <> n::text
       or jsonb_typeof(item -> 'name') is distinct from 'string'
       or char_length(item ->> 'name') > 60
       or not public.jsonb_int_between(item -> 'hr_min', 30, 250)
       or not public.jsonb_int_between(item -> 'hr_max', 30, 250)
       or not public.jsonb_int_between(item -> 'pace_slow', 60, 1800)
       or not public.jsonb_int_between(item -> 'pace_fast', 60, 1800)
    then
      return false;
    end if;

    if (item ->> 'hr_min')::integer > (item ->> 'hr_max')::integer
       or (item ->> 'pace_fast')::integer > (item ->> 'pace_slow')::integer
    then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Profils : un par compte Supabase Auth
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'athlete',
  full_name text not null default '' check (char_length(full_name) <= 120),
  email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Un profil par compte. Le rôle coach est attribué à la main (voir docs/DEPLOIEMENT.md).';

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Lien coach ↔ athlète
-- -----------------------------------------------------------------------------
create table public.coach_athletes (
  coach_id uuid not null references public.profiles (id) on delete cascade,
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (coach_id, athlete_id),
  check (coach_id <> athlete_id)
);

create index coach_athletes_athlete_id_idx on public.coach_athletes (athlete_id);

create trigger coach_athletes_updated_at before update on public.coach_athletes
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Invitations (lien à usage unique envoyé par le coach)
-- -----------------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- 2 UUID v4 = 244 bits aléatoires (générateur cryptographique de PostgreSQL).
  token text not null unique
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  athlete_name text not null default '' check (char_length(athlete_name) <= 120),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index invitations_coach_id_idx on public.invitations (coach_id);

-- -----------------------------------------------------------------------------
-- Fiche athlète
-- -----------------------------------------------------------------------------
create table public.athlete_profiles (
  athlete_id uuid primary key references public.profiles (id) on delete cascade,

  -- Informations partagées : modifiables par l'athlète et par son coach.
  birth_year smallint check (birth_year between 1900 and 2100),
  goals text not null default '' check (char_length(goals) <= 5000),
  injuries text not null default '' check (char_length(injuries) <= 5000),
  availability text not null default '' check (char_length(availability) <= 5000),

  -- Physiologie et zones : modifiables par le coach uniquement.
  hr_max smallint check (hr_max between 100 and 240),
  hr_rest smallint check (hr_rest between 25 and 120),
  hr_threshold smallint check (hr_threshold between 80 and 230),
  vma_kmh numeric(4, 1) check (vma_kmh between 5 and 30),
  zones jsonb not null default '[]'::jsonb check (public.zones_are_valid(zones)),
  zones_updated_at timestamptz,

  updated_at timestamptz not null default now(),

  check (hr_rest is null or hr_max is null or hr_rest < hr_max),
  check (hr_threshold is null or hr_max is null or hr_threshold <= hr_max)
);

-- Historique de la physiologie et des zones (progression dans le temps).
create table public.athlete_metrics_history (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  recorded_at timestamptz not null default now(),
  recorded_by uuid references public.profiles (id) on delete set null,
  hr_max smallint,
  hr_rest smallint,
  hr_threshold smallint,
  vma_kmh numeric(4, 1),
  zones jsonb not null
);

create index athlete_metrics_history_athlete_idx
  on public.athlete_metrics_history (athlete_id, recorded_at desc);

-- -----------------------------------------------------------------------------
-- Notes privées du coach sur un athlète (jamais visibles par l'athlète)
-- -----------------------------------------------------------------------------
create table public.coach_private_notes (
  coach_id uuid not null references public.profiles (id) on delete cascade,
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '' check (char_length(body) <= 20000),
  updated_at timestamptz not null default now(),
  primary key (coach_id, athlete_id)
);

create trigger coach_private_notes_updated_at before update on public.coach_private_notes
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Fonctions d'aide aux règles RLS (SECURITY DEFINER : elles lisent
-- coach_athletes sans repasser par sa propre RLS).
-- -----------------------------------------------------------------------------

-- L'utilisateur connecté est-il coach de cet athlète ?
create function public.is_coach_of(p_athlete uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.coach_athletes ca
    where ca.coach_id = (select auth.uid())
      and ca.athlete_id = p_athlete
  );
$$;

-- Cette personne est-elle coach de l'utilisateur connecté ?
create function public.is_my_coach(p_coach uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.coach_athletes ca
    where ca.athlete_id = (select auth.uid())
      and ca.coach_id = p_coach
  );
$$;

-- Rôle de l'utilisateur connecté.
create function public.my_role() returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid());
$$;

-- -----------------------------------------------------------------------------
-- Invitations : rattachement d'un athlète à un coach
-- -----------------------------------------------------------------------------

-- Fonction interne (non exposée) : lie p_athlete au coach de l'invitation.
-- Codes d'erreur renvoyés à l'application :
--   RC001 introuvable · RC002 annulée · RC003 déjà utilisée · RC004 expirée
--   RC005 compte coach · RC006 connexion requise
create function public.link_invitation(p_token text, p_athlete uuid) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations%rowtype;
begin
  select * into v_inv
  from public.invitations
  where token = p_token
  for update;

  if not found then
    raise exception 'Invitation introuvable' using errcode = 'RC001';
  end if;

  if v_inv.revoked_at is not null then
    raise exception 'Invitation annulée par le coach' using errcode = 'RC002';
  end if;

  if v_inv.accepted_at is not null then
    -- Rejouer la même invitation avec le même compte ne change rien.
    if v_inv.accepted_by = p_athlete then
      return v_inv.coach_id;
    end if;
    raise exception 'Invitation déjà utilisée' using errcode = 'RC003';
  end if;

  if v_inv.expires_at < now() then
    raise exception 'Invitation expirée' using errcode = 'RC004';
  end if;

  if v_inv.coach_id = p_athlete
     or (select p.role from public.profiles p where p.id = p_athlete) = 'coach'
  then
    raise exception 'Un compte coach ne peut pas rejoindre un coach' using errcode = 'RC005';
  end if;

  insert into public.coach_athletes (coach_id, athlete_id)
  values (v_inv.coach_id, p_athlete)
  on conflict (coach_id, athlete_id) do update set status = 'active';

  insert into public.coach_private_notes (coach_id, athlete_id)
  values (v_inv.coach_id, p_athlete)
  on conflict do nothing;

  update public.invitations
  set accepted_by = p_athlete, accepted_at = now()
  where id = v_inv.id;

  return v_inv.coach_id;
end;
$$;

-- Accepter une invitation avec le compte connecté. Renvoie l'id du coach.
create function public.accept_invitation(p_token text) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Connexion requise' using errcode = 'RC006';
  end if;
  return public.link_invitation(p_token, (select auth.uid()));
end;
$$;

-- Aperçu public d'une invitation (page d'inscription). Ne révèle que le nom
-- du coach et le prénom prévu ; le jeton (244 bits) ne se devine pas.
create function public.get_invitation(p_token text)
returns table (coach_name text, athlete_name text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.full_name,
    i.athlete_name,
    case
      when i.revoked_at is not null then 'revoked'
      when i.accepted_at is not null then 'accepted'
      when i.expires_at < now() then 'expired'
      else 'valid'
    end
  from public.invitations i
  join public.profiles p on p.id = i.coach_id
  where i.token = p_token;
$$;

-- -----------------------------------------------------------------------------
-- Création automatique du profil à l'inscription
-- -----------------------------------------------------------------------------
create function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := nullif(trim(new.raw_user_meta_data ->> 'invitation_token'), '');
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(left(trim(new.raw_user_meta_data ->> 'full_name'), 120), ''),
    coalesce(new.email, '')
  );

  insert into public.athlete_profiles (athlete_id) values (new.id);

  -- Inscription depuis un lien d'invitation : rattachement immédiat au coach.
  -- Une invitation invalide ne doit pas empêcher la création du compte :
  -- l'application le signale ensuite (aucun coach rattaché).
  if v_token is not null then
    begin
      perform public.link_invitation(v_token, new.id);
    exception when others then
      raise warning 'Invitation non appliquée pour %: %', new.id, sqlerrm;
    end;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create function public.handle_user_email_change() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.handle_user_email_change();

-- -----------------------------------------------------------------------------
-- Fiche athlète : garde-fous et historique
-- -----------------------------------------------------------------------------
create function public.athlete_profiles_before_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- L'athlète modifie sa propre fiche : la physiologie et les zones restent
  -- du ressort du coach.
  if (select auth.uid()) = old.athlete_id
     and (new.hr_max, new.hr_rest, new.hr_threshold, new.vma_kmh, new.zones)
         is distinct from
         (old.hr_max, old.hr_rest, old.hr_threshold, old.vma_kmh, old.zones)
  then
    raise exception 'Seul le coach peut modifier la physiologie et les zones'
      using errcode = '42501';
  end if;

  if new.zones is distinct from old.zones then
    new.zones_updated_at := now();
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger athlete_profiles_before_update before update on public.athlete_profiles
for each row execute function public.athlete_profiles_before_update();

create function public.athlete_profiles_record_history() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.athlete_metrics_history
    (athlete_id, recorded_by, hr_max, hr_rest, hr_threshold, vma_kmh, zones)
  values
    (new.athlete_id, (select auth.uid()), new.hr_max, new.hr_rest, new.hr_threshold,
     new.vma_kmh, new.zones);
  return new;
end;
$$;

create trigger athlete_profiles_record_history after update on public.athlete_profiles
for each row
when (
  (new.hr_max, new.hr_rest, new.hr_threshold, new.vma_kmh, new.zones)
  is distinct from
  (old.hr_max, old.hr_rest, old.hr_threshold, old.vma_kmh, old.zones)
)
execute function public.athlete_profiles_record_history();

-- -----------------------------------------------------------------------------
-- Vue : liens coach ↔ athlète avec les noms (RLS des tables appliquée).
-- -----------------------------------------------------------------------------
create view public.coach_links
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
  athlete.email as athlete_email
from public.coach_athletes ca
join public.profiles coach on coach.id = ca.coach_id
join public.profiles athlete on athlete.id = ca.athlete_id;

-- =============================================================================
-- Sécurité ligne par ligne (RLS)
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.coach_athletes enable row level security;
alter table public.invitations enable row level security;
alter table public.athlete_profiles enable row level security;
alter table public.athlete_metrics_history enable row level security;
alter table public.coach_private_notes enable row level security;

-- profiles --------------------------------------------------------------------
create policy "profiles : soi, ses athlètes, ses coachs"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or public.is_coach_of(id)
  or public.is_my_coach(id)
);

create policy "profiles : chacun modifie le sien"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- coach_athletes --------------------------------------------------------------
create policy "coach_athletes : les deux parties lisent le lien"
on public.coach_athletes for select to authenticated
using (coach_id = (select auth.uid()) or athlete_id = (select auth.uid()));

create policy "coach_athletes : le coach change le statut"
on public.coach_athletes for update to authenticated
using (coach_id = (select auth.uid()))
with check (coach_id = (select auth.uid()));

-- invitations -----------------------------------------------------------------
create policy "invitations : le coach lit les siennes"
on public.invitations for select to authenticated
using (coach_id = (select auth.uid()));

create policy "invitations : seul un coach en crée"
on public.invitations for insert to authenticated
with check (coach_id = (select auth.uid()) and public.my_role() = 'coach');

create policy "invitations : le coach annule les siennes"
on public.invitations for update to authenticated
using (coach_id = (select auth.uid()))
with check (coach_id = (select auth.uid()));

create policy "invitations : le coach supprime les siennes"
on public.invitations for delete to authenticated
using (coach_id = (select auth.uid()));

-- athlete_profiles ------------------------------------------------------------
create policy "athlete_profiles : l'athlète et son coach lisent"
on public.athlete_profiles for select to authenticated
using (athlete_id = (select auth.uid()) or public.is_coach_of(athlete_id));

create policy "athlete_profiles : l'athlète et son coach modifient"
on public.athlete_profiles for update to authenticated
using (athlete_id = (select auth.uid()) or public.is_coach_of(athlete_id))
with check (athlete_id = (select auth.uid()) or public.is_coach_of(athlete_id));

-- athlete_metrics_history -----------------------------------------------------
create policy "athlete_metrics_history : l'athlète et son coach lisent"
on public.athlete_metrics_history for select to authenticated
using (athlete_id = (select auth.uid()) or public.is_coach_of(athlete_id));

-- coach_private_notes ---------------------------------------------------------
create policy "coach_private_notes : le coach seulement"
on public.coach_private_notes for select to authenticated
using (coach_id = (select auth.uid()) and public.is_coach_of(athlete_id));

create policy "coach_private_notes : le coach modifie"
on public.coach_private_notes for update to authenticated
using (coach_id = (select auth.uid()) and public.is_coach_of(athlete_id))
with check (coach_id = (select auth.uid()) and public.is_coach_of(athlete_id));

-- =============================================================================
-- Droits (Supabase accorde tout par défaut à anon et authenticated : on
-- resserre, la RLS restant la protection principale).
-- =============================================================================
revoke all on table
  public.profiles,
  public.coach_athletes,
  public.invitations,
  public.athlete_profiles,
  public.athlete_metrics_history,
  public.coach_private_notes,
  public.coach_links
from anon, authenticated;

grant select on table
  public.profiles,
  public.coach_athletes,
  public.invitations,
  public.athlete_profiles,
  public.athlete_metrics_history,
  public.coach_private_notes,
  public.coach_links
to authenticated;

grant update (full_name) on public.profiles to authenticated;
grant update (status) on public.coach_athletes to authenticated;
grant insert (athlete_name) on public.invitations to authenticated;
grant update (revoked_at) on public.invitations to authenticated;
grant delete on public.invitations to authenticated;
grant update (birth_year, goals, injuries, availability,
              hr_max, hr_rest, hr_threshold, vma_kmh, zones)
  on public.athlete_profiles to authenticated;
grant update (body) on public.coach_private_notes to authenticated;

-- Accès au schéma (déjà accordé par Supabase, explicite ici au cas où
-- l'exposition automatique des nouvelles tables serait désactivée).
grant usage on schema public to anon, authenticated;

-- Fonctions : PostgreSQL et Supabase les rendent exécutables par tous.
revoke execute on function
  public.set_updated_at(),
  public.link_invitation(text, uuid),
  public.handle_new_user(),
  public.handle_user_email_change(),
  public.athlete_profiles_before_update(),
  public.athlete_profiles_record_history()
from public, anon, authenticated;

revoke execute on function
  public.is_coach_of(uuid),
  public.is_my_coach(uuid),
  public.my_role(),
  public.accept_invitation(text)
from public, anon;

grant execute on function
  public.is_coach_of(uuid),
  public.is_my_coach(uuid),
  public.my_role(),
  public.accept_invitation(text)
to authenticated;

grant execute on function public.get_invitation(text) to anon, authenticated;
