-- =============================================================================
-- Rob1Coach 0.8.0 — plateforme multi-coachs : un coach crée son espace tout
-- seul, et son offre fixe le nombre d'athlètes qu'il peut suivre.
--
-- Offres (les mêmes que dans src/domain/plans.ts, vérifié par tests/db/offres.test.ts) :
--   decouverte  3 athlètes   offre de départ de tout nouveau coach
--   solo       10 athlètes
--   pro        30 athlètes
--   club      100 athlètes
--   fondateur  sans limite   coachs présents avant la 0.8.0
-- Seuls les athlètes actifs comptent : archiver un athlète libère une place.
-- =============================================================================

create function public.plan_athlete_limit(p_plan text) returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_plan
    when 'decouverte' then 3
    when 'solo' then 10
    when 'pro' then 30
    when 'club' then 100
    else null -- fondateur : sans limite
  end;
$$;

-- -----------------------------------------------------------------------------
-- Offre de chaque coach. Le site la lit, mais ne l'écrit jamais : elle change
-- par set_coach_plan (tableau de bord Supabase) et, plus tard, par le paiement.
-- -----------------------------------------------------------------------------
create table public.coach_subscriptions (
  coach_id uuid primary key references public.profiles (id) on delete cascade,
  plan text not null default 'decouverte' check (plan in ('decouverte', 'solo', 'pro', 'club', 'fondateur')),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger coach_subscriptions_updated_at before update on public.coach_subscriptions
for each row execute function public.set_updated_at();

-- Les coachs déjà là gardent tout, sans limite.
insert into public.coach_subscriptions (coach_id, plan)
select p.id, 'fondateur' from public.profiles p where p.role = 'coach';

alter table public.coach_subscriptions enable row level security;

create policy "coach_subscriptions : le coach lit la sienne"
on public.coach_subscriptions for select to authenticated
using (coach_id = (select auth.uid()));

revoke all on table public.coach_subscriptions from anon, authenticated;
grant select on table public.coach_subscriptions to authenticated;

-- Nombre d'athlètes qu'un coach peut suivre (null : sans limite).
create function public.coach_athlete_limit(p_coach uuid) returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select public.plan_athlete_limit(
    coalesce((select s.plan from public.coach_subscriptions s where s.coach_id = p_coach), 'decouverte')
  );
$$;

-- Reste-t-il une place chez ce coach ?
create function public.coach_has_room(p_coach uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.coach_athlete_limit(p_coach) is null
      or (
        select count(*) from public.coach_athletes ca
        where ca.coach_id = p_coach and ca.status = 'active'
      ) < public.coach_athlete_limit(p_coach);
$$;

-- -----------------------------------------------------------------------------
-- La limite s'applique à chaque athlète qui devient actif : invitation acceptée
-- ou athlète archivé que le coach réactive. Code d'erreur RC007.
-- -----------------------------------------------------------------------------
create function public.coach_athletes_check_limit() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active'
     and (tg_op = 'INSERT' or old.status is distinct from 'active')
     and not public.coach_has_room(new.coach_id)
  then
    raise exception 'Offre du coach complète' using errcode = 'RC007';
  end if;
  return new;
end;
$$;

create trigger coach_athletes_check_limit before insert or update of status on public.coach_athletes
for each row execute function public.coach_athletes_check_limit();

-- Aperçu d'une invitation : « full » quand le coach n'a plus de place, pour le
-- dire à l'athlète avant qu'il crée son compte.
create or replace function public.get_invitation(p_token text)
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
      when not public.coach_has_room(i.coach_id) then 'full'
      else 'valid'
    end
  from public.invitations i
  join public.profiles p on p.id = i.coach_id
  where i.token = p_token;
$$;

-- -----------------------------------------------------------------------------
-- Inscription d'un coach : le formulaire « Créer mon espace coach » envoie
-- account_type = 'coach'. Le compte reçoit le rôle coach et l'offre Découverte.
-- Un compte existant ne change jamais de rôle.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := nullif(trim(new.raw_user_meta_data ->> 'invitation_token'), '');
  v_terms text := nullif(trim(new.raw_user_meta_data ->> 'terms_version'), '');
  v_coach boolean := coalesce(new.raw_user_meta_data ->> 'account_type', '') = 'coach';
begin
  if not public.terms_version_is_valid(v_terms) then
    v_terms := null;
  end if;

  insert into public.profiles (id, role, full_name, email, terms_version, terms_accepted_at)
  values (
    new.id,
    case when v_coach then 'coach'::public.user_role else 'athlete'::public.user_role end,
    coalesce(left(trim(new.raw_user_meta_data ->> 'full_name'), 120), ''),
    coalesce(new.email, ''),
    v_terms,
    case when v_terms is null then null else now() end
  );

  insert into public.athlete_profiles (athlete_id) values (new.id);

  if v_coach then
    insert into public.coach_subscriptions (coach_id) values (new.id);
    return new;
  end if;

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

-- Un compte passé coach à la main (docs/DEPLOIEMENT.md, étape 2) reçoit aussi son offre.
create function public.profiles_ensure_subscription() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'coach' then
    insert into public.coach_subscriptions (coach_id) values (new.id) on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger profiles_ensure_subscription after update of role on public.profiles
for each row execute function public.profiles_ensure_subscription();

-- -----------------------------------------------------------------------------
-- Changer l'offre d'un coach, depuis le SQL Editor de Supabase :
--   select public.set_coach_plan('coach@exemple.fr', 'solo');
-- -----------------------------------------------------------------------------
create function public.set_coach_plan(p_email text, p_plan text) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coach uuid;
begin
  select p.id into v_coach from public.profiles p
  where lower(p.email) = lower(trim(p_email)) and p.role = 'coach';
  if v_coach is null then
    raise exception 'Aucun coach avec cet e-mail';
  end if;
  insert into public.coach_subscriptions (coach_id, plan) values (v_coach, p_plan)
  on conflict (coach_id) do update set plan = excluded.plan, started_at = now();
  return format('%s : offre %s', p_email, p_plan);
end;
$$;

-- =============================================================================
-- Droits
-- =============================================================================
revoke execute on function
  public.coach_athletes_check_limit(),
  public.profiles_ensure_subscription(),
  public.set_coach_plan(text, text)
from public, anon, authenticated;

revoke execute on function public.coach_athlete_limit(uuid), public.coach_has_room(uuid) from public, anon, authenticated;
