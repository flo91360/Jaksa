-- =============================================================================
-- Rob1Coach 0.7.0 — comptes et RGPD : accord explicite, départ d'un coach,
-- suppression du compte, journal des erreurs du site.
--
-- Mêmes principes que les versions précédentes : RLS, droits limités,
-- fonctions SECURITY DEFINER à search_path vide.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Accord explicite (conditions d'utilisation et politique de confidentialité).
-- La FC, les blessures et les douleurs sont des données de santé : l'accord
-- est demandé à l'inscription, et aux comptes existants à leur prochaine visite.
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column terms_version text check (char_length(terms_version) between 1 and 20),
  add column terms_accepted_at timestamptz;

comment on column public.profiles.terms_version is
  'Version des conditions acceptées (src/lib/site.ts) ; vide tant que la personne n''a pas donné son accord.';

-- Version envoyée par le site : une date AAAA-MM-JJ.
create function public.terms_version_is_valid(p_version text) returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_version is not null and p_version ~ '^\d{4}-\d{2}-\d{2}$';
$$;

create function public.accept_terms(p_version text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Connexion requise' using errcode = 'RC006';
  end if;
  if not public.terms_version_is_valid(p_version) then
    raise exception 'Version des conditions invalide' using errcode = '23514';
  end if;
  update public.profiles
  set terms_version = p_version, terms_accepted_at = now()
  where id = (select auth.uid());
end;
$$;

-- Inscription : l'accord coché dans le formulaire part dans les métadonnées.
create or replace function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := nullif(trim(new.raw_user_meta_data ->> 'invitation_token'), '');
  v_terms text := nullif(trim(new.raw_user_meta_data ->> 'terms_version'), '');
begin
  if not public.terms_version_is_valid(v_terms) then
    v_terms := null;
  end if;

  insert into public.profiles (id, full_name, email, terms_version, terms_accepted_at)
  values (
    new.id,
    coalesce(left(trim(new.raw_user_meta_data ->> 'full_name'), 120), ''),
    coalesce(new.email, ''),
    v_terms,
    case when v_terms is null then null else now() end
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

-- -----------------------------------------------------------------------------
-- Retrait de l'accord vis-à-vis d'un coach : l'athlète quitte son coach.
-- Le coach ne voit plus rien de l'athlète (toutes les règles RLS passent par
-- coach_athletes) ; l'athlète garde ses séances, ses retours et ses messages.
-- -----------------------------------------------------------------------------
create function public.leave_coach(p_coach uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = 'RC006';
  end if;
  delete from public.coach_private_notes where coach_id = p_coach and athlete_id = v_me;
  delete from public.coach_athletes where coach_id = p_coach and athlete_id = v_me;
end;
$$;

-- -----------------------------------------------------------------------------
-- Suppression du compte par son titulaire. Tout ce qui lui est rattaché part
-- avec lui (clés étrangères ON DELETE CASCADE depuis auth.users → profiles).
-- Pour un coach : ses séances types, ses notes, ses invitations et les séances
-- qu'il a planifiées ; les activités de montre de ses athlètes sont conservées.
-- -----------------------------------------------------------------------------
create function public.delete_my_account() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'Connexion requise' using errcode = 'RC006';
  end if;
  delete from auth.users where id = v_me;
end;
$$;

-- -----------------------------------------------------------------------------
-- Journal des erreurs du site : une page qui plante chez un athlète laisse une
-- trace ici, sans outil de mesure externe. Lisible seulement depuis le tableau
-- de bord Supabase (aucun droit pour anon ni authenticated).
-- -----------------------------------------------------------------------------
create table public.client_errors (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  app_version text not null default '' check (char_length(app_version) <= 20),
  path text not null default '' check (char_length(path) <= 300),
  message text not null check (char_length(message) <= 500),
  stack text not null default '' check (char_length(stack) <= 4000),
  user_agent text not null default '' check (char_length(user_agent) <= 300)
);

create index client_errors_occurred_idx on public.client_errors (occurred_at desc);
create index client_errors_user_idx on public.client_errors (user_id);

alter table public.client_errors enable row level security;

-- Au plus 20 erreurs par personne et par heure ; le journal garde 30 jours.
create function public.report_client_error(
  p_message text,
  p_stack text default '',
  p_path text default '',
  p_version text default '',
  p_user_agent text default ''
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null or coalesce(trim(p_message), '') = '' then
    return;
  end if;
  if (
    select count(*) from public.client_errors e
    where e.user_id = v_me and e.occurred_at > now() - interval '1 hour'
  ) >= 20 then
    return;
  end if;
  delete from public.client_errors where occurred_at < now() - interval '30 days';
  insert into public.client_errors (user_id, app_version, path, message, stack, user_agent)
  values (
    v_me,
    left(coalesce(p_version, ''), 20),
    left(coalesce(p_path, ''), 300),
    left(trim(p_message), 500),
    left(coalesce(p_stack, ''), 4000),
    left(coalesce(p_user_agent, ''), 300)
  );
end;
$$;

-- =============================================================================
-- Droits
-- =============================================================================
revoke all on table public.client_errors from anon, authenticated;

revoke execute on function
  public.accept_terms(text),
  public.leave_coach(uuid),
  public.delete_my_account(),
  public.report_client_error(text, text, text, text, text)
from public, anon;

grant execute on function
  public.accept_terms(text),
  public.leave_coach(uuid),
  public.delete_my_account(),
  public.report_client_error(text, text, text, text, text)
to authenticated;
