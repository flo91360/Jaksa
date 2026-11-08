-- =============================================================================
-- Rob1Coach 0.3.0 — les échanges et les retours :
--   * retour de séance de l'athlète (faite ou non, durée, distance, D+, RPE,
--     douleurs), avec la mention « vu par le coach » ;
--   * fil de commentaires sur chaque séance ;
--   * messagerie coach ↔ athlète (temps réel via Supabase Realtime) ;
--   * file d'attente des e-mails (séance du lendemain, nouveaux retours et
--     messages). L'envoi lui-même s'active à part : supabase/emails.sql.
--
-- Mêmes principes que les versions précédentes : RLS sur chaque table, droits
-- d'écriture limités colonne par colonne, fonctions à search_path vide.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Douleurs signalées : tableau (6 au plus) de { location, side, intensity }.
--   location  : voir PAIN_LOCATIONS dans src/domain/feedback.ts
--   side      : left | right | both | none
--   intensity : 1 à 10 (échelle visuelle analogique)
-- -----------------------------------------------------------------------------
create function public.pain_is_valid(items jsonb) returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
begin
  if items is null or jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 6 then
    return false;
  end if;
  for item in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(item) is distinct from 'object'
       or coalesce(item ->> 'location', '') not in (
         'foot', 'ankle', 'achilles', 'calf', 'shin', 'knee', 'quadriceps',
         'hamstring', 'hip', 'glute', 'lower_back', 'other'
       )
       or coalesce(item ->> 'side', '') not in ('left', 'right', 'both', 'none')
       or item -> 'intensity' is null
       or not public.jsonb_int_between(item -> 'intensity', 1, 10)
    then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Préférence d'e-mails (désactivable par chacun dans « Mon compte »)
-- -----------------------------------------------------------------------------
alter table public.profiles add column email_notifications boolean not null default true;

grant update (email_notifications) on public.profiles to authenticated;

-- -----------------------------------------------------------------------------
-- Retour de séance : un par séance, saisi par l'athlète
-- -----------------------------------------------------------------------------
create table public.workout_feedback (
  workout_id uuid primary key references public.workouts (id) on delete cascade,
  -- Recopié depuis la séance par le déclencheur (sert à la RLS).
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('done', 'partial', 'skipped')),
  duration_s integer check (duration_s between 1 and 172800),
  distance_m integer check (distance_m between 0 and 1000000),
  elevation_gain_m integer check (elevation_gain_m between 0 and 30000),
  rpe smallint check (rpe between 1 and 10),
  pain jsonb not null default '[]'::jsonb check (public.pain_is_valid(pain)),
  -- Mis à jour par mark_workout_seen ; remis à vide quand l'athlète modifie son retour.
  coach_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workout_feedback_athlete_idx on public.workout_feedback (athlete_id);

create function public.workout_feedback_before_write() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    select w.athlete_id into new.athlete_id from public.workouts w where w.id = new.workout_id;
    new.coach_seen_at := null;
  else
    new.athlete_id := old.athlete_id;
    new.updated_at := now();
    -- L'athlète a changé son retour : le coach doit le revoir.
    if (select auth.uid()) = old.athlete_id
       and (new.status, new.duration_s, new.distance_m, new.elevation_gain_m, new.rpe, new.pain)
           is distinct from
           (old.status, old.duration_s, old.distance_m, old.elevation_gain_m, old.rpe, old.pain)
    then
      new.coach_seen_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger workout_feedback_before_write before insert or update on public.workout_feedback
for each row execute function public.workout_feedback_before_write();

-- -----------------------------------------------------------------------------
-- Commentaires d'une séance (l'athlète et son coach)
-- -----------------------------------------------------------------------------
create table public.workout_comments (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  -- Lu par l'autre partie (« vu par le coach » sur les commentaires de l'athlète).
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index workout_comments_workout_idx on public.workout_comments (workout_id, created_at);
create index workout_comments_athlete_idx on public.workout_comments (athlete_id);

create function public.workout_comments_before_insert() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select w.athlete_id into new.athlete_id from public.workouts w where w.id = new.workout_id;
  new.read_at := null;
  new.created_at := now();
  return new;
end;
$$;

create trigger workout_comments_before_insert before insert on public.workout_comments
for each row execute function public.workout_comments_before_insert();

-- -----------------------------------------------------------------------------
-- Messagerie coach ↔ athlète
-- -----------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles (id) on delete cascade,
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id in (coach_id, athlete_id))
);

create index messages_conversation_idx on public.messages (coach_id, athlete_id, created_at);
create index messages_athlete_idx on public.messages (athlete_id);

create function public.messages_before_insert() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.read_at := null;
  new.created_at := now();
  return new;
end;
$$;

create trigger messages_before_insert before insert on public.messages
for each row execute function public.messages_before_insert();

-- -----------------------------------------------------------------------------
-- Vue : activité de chaque séance (retour + commentaires), pour le calendrier
-- et la liste « À voir » du coach. La RLS des tables s'applique.
-- -----------------------------------------------------------------------------
create view public.workout_activity
with (security_invoker = true)
as
select
  w.id as workout_id,
  w.athlete_id,
  w.coach_id,
  w.scheduled_on,
  w.kind,
  w.title,
  f.status,
  f.duration_s,
  f.distance_m,
  f.elevation_gain_m,
  f.rpe,
  coalesce(f.pain, '[]'::jsonb) as pain,
  f.updated_at as feedback_at,
  f.coach_seen_at,
  (f.workout_id is not null and f.coach_seen_at is null) as unseen_feedback,
  coalesce(c.comment_count, 0)::integer as comment_count,
  coalesce(c.unread_comments, 0)::integer as unread_comments,
  c.last_comment_at
from public.workouts w
left join public.workout_feedback f on f.workout_id = w.id
left join lateral (
  select
    count(*) as comment_count,
    count(*) filter (where wc.author_id <> (select auth.uid()) and wc.read_at is null) as unread_comments,
    max(wc.created_at) as last_comment_at
  from public.workout_comments wc
  where wc.workout_id = w.id
) c on true;

-- -----------------------------------------------------------------------------
-- Vue : une conversation par lien coach ↔ athlète, avec le dernier message
-- et le nombre de messages non lus par l'utilisateur connecté.
-- -----------------------------------------------------------------------------
create view public.conversations
with (security_invoker = true)
as
select
  ca.coach_id,
  ca.athlete_id,
  ca.status,
  coach.full_name as coach_name,
  athlete.full_name as athlete_name,
  athlete.email as athlete_email,
  last.body as last_body,
  last.sender_id as last_sender_id,
  last.created_at as last_message_at,
  coalesce(unread.n, 0)::integer as unread_count
from public.coach_athletes ca
join public.profiles coach on coach.id = ca.coach_id
join public.profiles athlete on athlete.id = ca.athlete_id
left join lateral (
  select left(m.body, 140) as body, m.sender_id, m.created_at
  from public.messages m
  where m.coach_id = ca.coach_id and m.athlete_id = ca.athlete_id
  order by m.created_at desc
  limit 1
) last on true
left join lateral (
  select count(*) as n
  from public.messages m
  where m.coach_id = ca.coach_id and m.athlete_id = ca.athlete_id
    and m.sender_id <> (select auth.uid()) and m.read_at is null
) unread on true;

-- -----------------------------------------------------------------------------
-- Fonctions appelées par l'application
-- -----------------------------------------------------------------------------

-- Ouverture d'une séance : marque comme lus les commentaires de l'autre partie
-- et, pour le coach, le retour de l'athlète (« vu par le coach »).
create function public.mark_workout_seen(p_workout uuid) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_athlete uuid;
begin
  select w.athlete_id into v_athlete from public.workouts w where w.id = p_workout;
  if v_athlete is null or not (v_athlete = v_me or public.is_coach_of(v_athlete)) then
    return;
  end if;

  update public.workout_comments
  set read_at = now()
  where workout_id = p_workout and author_id <> v_me and read_at is null;

  if public.is_coach_of(v_athlete) then
    update public.workout_feedback
    set coach_seen_at = now()
    where workout_id = p_workout and coach_seen_at is null;
  end if;
end;
$$;

-- Ouverture d'une conversation : marque comme lus les messages reçus.
create function public.mark_conversation_read(p_coach uuid, p_athlete uuid) returns void
language sql
security definer
set search_path = ''
as $$
  update public.messages
  set read_at = now()
  where coach_id = p_coach
    and athlete_id = p_athlete
    and (select auth.uid()) in (p_coach, p_athlete)
    and sender_id <> (select auth.uid())
    and read_at is null;
$$;

-- =============================================================================
-- File d'attente des e-mails
--
-- Les déclencheurs y ajoutent une ligne par événement. Toutes les 10 minutes,
-- send_email_outbox() (activée par supabase/emails.sql) regroupe les lignes en
-- attente par destinataire, en un seul e-mail. Ce qui a déjà été lu dans le
-- site entre-temps n'est pas envoyé. Les e-mails ne contiennent aucune donnée
-- de santé ni le texte des messages : seulement un lien vers le site.
-- =============================================================================
create table public.email_outbox (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('workout_tomorrow', 'feedback', 'comment', 'message')),
  payload jsonb not null default '{}'::jsonb,
  -- Évite les doublons (séance du lendemain : un e-mail par athlète et par jour).
  dedup_key text unique,
  status text not null default 'pending' check (status in ('pending', 'sent', 'skipped')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create index email_outbox_pending_idx on public.email_outbox (recipient_id) where status = 'pending';

alter table public.email_outbox enable row level security;
-- Aucune règle RLS ni aucun droit : seules les fonctions ci-dessous y accèdent.

create function public.wants_emails(p_user uuid) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.email_notifications and p.email <> '' from public.profiles p where p.id = p_user), false);
$$;

create function public.enqueue_email(p_recipient uuid, p_kind text, p_payload jsonb, p_dedup text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient is null or not public.wants_emails(p_recipient) then
    return;
  end if;
  insert into public.email_outbox (recipient_id, kind, payload, dedup_key)
  values (p_recipient, p_kind, p_payload, p_dedup)
  on conflict (dedup_key) do nothing;
end;
$$;

-- Nouveau retour de séance → le coach qui l'a planifiée.
create function public.workout_feedback_notify() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  w record;
begin
  select wo.coach_id, wo.title, wo.scheduled_on, wo.athlete_id into w
  from public.workouts wo where wo.id = new.workout_id;
  perform public.enqueue_email(
    w.coach_id,
    'feedback',
    jsonb_build_object(
      'workout_id', new.workout_id,
      'athlete_id', w.athlete_id,
      'title', w.title,
      'date', w.scheduled_on,
      'from_id', new.athlete_id
    )
  );
  return null;
end;
$$;

create trigger workout_feedback_notify after insert on public.workout_feedback
for each row execute function public.workout_feedback_notify();

-- Nouveau commentaire → l'autre partie.
create function public.workout_comments_notify() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  w record;
  v_recipient uuid;
begin
  select wo.coach_id, wo.title, wo.scheduled_on, wo.athlete_id into w
  from public.workouts wo where wo.id = new.workout_id;
  v_recipient := case when new.author_id = w.athlete_id then w.coach_id else w.athlete_id end;
  if v_recipient = new.author_id then
    return null;
  end if;
  perform public.enqueue_email(
    v_recipient,
    'comment',
    jsonb_build_object(
      'comment_id', new.id,
      'workout_id', new.workout_id,
      'athlete_id', w.athlete_id,
      'title', w.title,
      'date', w.scheduled_on,
      'from_id', new.author_id
    )
  );
  return null;
end;
$$;

create trigger workout_comments_notify after insert on public.workout_comments
for each row execute function public.workout_comments_notify();

-- Nouveau message → le destinataire.
create function public.messages_notify() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.enqueue_email(
    case when new.sender_id = new.coach_id then new.athlete_id else new.coach_id end,
    'message',
    jsonb_build_object(
      'message_id', new.id,
      'coach_id', new.coach_id,
      'athlete_id', new.athlete_id,
      'from_id', new.sender_id
    )
  );
  return null;
end;
$$;

create trigger messages_notify after insert on public.messages
for each row execute function public.messages_notify();

-- Séance du lendemain (heure de Paris), pour chaque athlète suivi activement.
-- Appelée chaque soir par pg_cron (supabase/emails.sql). Renvoie le nombre
-- d'athlètes concernés.
create function public.enqueue_tomorrow_workouts(p_day date default null) returns integer
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

create function public.email_escape(t text) returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
$$;

-- Prépare les e-mails à envoyer : un par destinataire, qui regroupe ses
-- notifications en attente depuis au moins p_delay (le temps de les lire dans
-- le site). Les notifications déjà lues, trop anciennes (plus de 24 h) ou dont
-- l'objet a été supprimé sont écartées (status = 'skipped').
-- Ne modifie pas les lignes à envoyer : send_email_outbox les marque 'sent'.
create function public.prepare_email_digests(p_site_url text, p_delay interval default interval '3 minutes')
returns table (recipient_id uuid, to_email text, to_name text, subject text, html text, item_ids bigint[])
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_site text := rtrim(p_site_url, '/');
  r record;
  item record;
  v_lines text[];
  v_ids bigint[];
  v_subjects text[];
  v_from text;
  v_link text;
  v_line text;
begin
  -- 1. Écarter ce qui n'a plus lieu d'être envoyé.
  update public.email_outbox o
  set status = 'skipped', processed_at = now()
  where o.status = 'pending'
    and (
      o.created_at < now() - interval '24 hours'
      or not public.wants_emails(o.recipient_id)
      or (o.kind = 'message' and not exists (
            select 1 from public.messages m where m.id = (o.payload ->> 'message_id')::uuid and m.read_at is null))
      or (o.kind = 'comment' and not exists (
            select 1 from public.workout_comments c where c.id = (o.payload ->> 'comment_id')::uuid and c.read_at is null))
      or (o.kind = 'feedback' and not exists (
            select 1 from public.workout_feedback f
            where f.workout_id = (o.payload ->> 'workout_id')::uuid and f.coach_seen_at is null))
    );

  -- 2. Un e-mail par destinataire.
  for r in
    select o.recipient_id as rid, p.email, p.full_name
    from public.email_outbox o
    join public.profiles p on p.id = o.recipient_id
    where o.status = 'pending' and o.created_at <= now() - p_delay
    group by o.recipient_id, p.email, p.full_name
  loop
    v_lines := '{}';
    v_ids := '{}';
    v_subjects := '{}';
    for item in
      select o.id, o.kind, o.payload
      from public.email_outbox o
      where o.recipient_id = r.rid and o.status = 'pending' and o.created_at <= now() - p_delay
      order by o.created_at
    loop
      select nullif(trim(p.full_name), '') into v_from from public.profiles p where p.id = (item.payload ->> 'from_id')::uuid;
      v_from := coalesce(v_from, 'Ton coach');
      case item.kind
        when 'workout_tomorrow' then
          v_link := v_site || '/aujourdhui';
          v_line := 'Demain : ' || (
            select string_agg('« ' || public.email_escape(x ->> 'title') || ' »', ', ')
            from jsonb_array_elements(item.payload -> 'workouts') x
          );
          v_subjects := v_subjects || ('Demain : ' || (
            select string_agg(x ->> 'title', ', ') from jsonb_array_elements(item.payload -> 'workouts') x
          ));
        when 'feedback' then
          v_link := v_site || '/seance/' || (item.payload ->> 'workout_id');
          v_line := public.email_escape(v_from) || ' a fait son retour sur « ' || public.email_escape(item.payload ->> 'title') || ' »';
          v_subjects := v_subjects || ('Nouveau retour de ' || v_from);
        when 'comment' then
          v_link := v_site || '/seance/' || (item.payload ->> 'workout_id');
          v_line := public.email_escape(v_from) || ' a commenté « ' || public.email_escape(item.payload ->> 'title') || ' »';
          v_subjects := v_subjects || ('Nouveau commentaire de ' || v_from);
        else
          v_link := v_site || '/messages' || case
            when (item.payload ->> 'from_id') = (item.payload ->> 'athlete_id')
            then '?athlete=' || (item.payload ->> 'athlete_id') else '' end;
          v_line := 'Nouveau message de ' || public.email_escape(v_from);
          v_subjects := v_subjects || ('Nouveau message de ' || v_from);
      end case;
      v_lines := v_lines || ('<li style="margin:0 0 8px"><a href="' || public.email_escape(v_link) || '">' || v_line || '</a></li>');
      v_ids := v_ids || item.id;
    end loop;

    recipient_id := r.rid;
    to_email := r.email;
    to_name := r.full_name;
    subject := case
      when cardinality(v_ids) = 1 then v_subjects[1]
      else cardinality(v_ids) || ' nouveautés sur Rob1Coach'
    end;
    html := '<div style="font-family:system-ui,sans-serif;font-size:16px;color:#0f172a">'
      || '<p>Bonjour ' || public.email_escape(split_part(trim(r.full_name), ' ', 1)) || ',</p>'
      || '<ul style="padding-left:20px">' || array_to_string(v_lines, '') || '</ul>'
      || '<p style="color:#64748b;font-size:13px">Rob1Coach · <a href="' || public.email_escape(v_site) || '/compte">'
      || 'Ne plus recevoir ces e-mails</a></p></div>';
    item_ids := v_ids;
    return next;
  end loop;
end;
$$;

-- Marque des notifications comme envoyées (appelée par send_email_outbox).
create function public.mark_emails_sent(p_ids bigint[]) returns void
language sql
security definer
set search_path = ''
as $$
  update public.email_outbox set status = 'sent', processed_at = now() where id = any (p_ids);
  delete from public.email_outbox where processed_at < now() - interval '30 days';
$$;

-- Envoi par l'API de Brevo, via l'extension pg_net de Supabase. La clé et les
-- adresses sont dans Supabase Vault (voir supabase/emails.sql). Sans clé, ne
-- fait rien. Les appels à net et vault ne sont résolus qu'à l'exécution.
create function public.send_email_outbox() returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_sender text;
  v_site text;
  d record;
  v_count integer := 0;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'brevo_api_key';
  select decrypted_secret into v_sender from vault.decrypted_secrets where name = 'email_sender';
  select decrypted_secret into v_site from vault.decrypted_secrets where name = 'site_url';
  if v_key is null or v_sender is null or v_site is null then
    raise warning 'E-mails non configurés : voir supabase/emails.sql';
    return 0;
  end if;

  for d in select * from public.prepare_email_digests(v_site) loop
    perform net.http_post(
      url := 'https://api.brevo.com/v3/smtp/email',
      headers := jsonb_build_object('api-key', v_key, 'content-type', 'application/json', 'accept', 'application/json'),
      body := jsonb_build_object(
        'sender', jsonb_build_object('name', 'Rob1Coach', 'email', v_sender),
        'to', jsonb_build_array(jsonb_build_object('email', d.to_email, 'name', coalesce(nullif(d.to_name, ''), d.to_email))),
        'subject', d.subject,
        'htmlContent', d.html
      )
    );
    perform public.mark_emails_sent(d.item_ids);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- =============================================================================
-- Sécurité ligne par ligne (RLS)
-- =============================================================================
alter table public.workout_feedback enable row level security;
alter table public.workout_comments enable row level security;
alter table public.messages enable row level security;

-- workout_feedback : l'athlète écrit, son coach lit ----------------------------
create policy "workout_feedback : l'athlète et son coach lisent"
on public.workout_feedback for select to authenticated
using (athlete_id = (select auth.uid()) or public.is_coach_of(athlete_id));

create policy "workout_feedback : l'athlète fait son retour"
on public.workout_feedback for insert to authenticated
with check (athlete_id = (select auth.uid()));

create policy "workout_feedback : l'athlète modifie son retour"
on public.workout_feedback for update to authenticated
using (athlete_id = (select auth.uid()))
with check (athlete_id = (select auth.uid()));

create policy "workout_feedback : l'athlète supprime son retour"
on public.workout_feedback for delete to authenticated
using (athlete_id = (select auth.uid()));

-- workout_comments : l'athlète et son coach ------------------------------------
create policy "workout_comments : l'athlète et son coach lisent"
on public.workout_comments for select to authenticated
using (athlete_id = (select auth.uid()) or public.is_coach_of(athlete_id));

create policy "workout_comments : l'athlète et son coach écrivent"
on public.workout_comments for insert to authenticated
with check (
  author_id = (select auth.uid())
  and (athlete_id = (select auth.uid()) or public.is_coach_of(athlete_id))
);

create policy "workout_comments : chacun supprime les siens"
on public.workout_comments for delete to authenticated
using (author_id = (select auth.uid()));

-- messages : les deux parties d'un lien coach ↔ athlète ------------------------
create policy "messages : les deux parties lisent"
on public.messages for select to authenticated
using (coach_id = (select auth.uid()) or athlete_id = (select auth.uid()));

create policy "messages : les deux parties écrivent"
on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and (
    (coach_id = (select auth.uid()) and public.is_coach_of(athlete_id))
    or (athlete_id = (select auth.uid()) and public.is_my_coach(coach_id))
  )
);

-- =============================================================================
-- Droits
-- =============================================================================
revoke all on table
  public.workout_feedback,
  public.workout_comments,
  public.messages,
  public.email_outbox,
  public.workout_activity,
  public.conversations
from anon, authenticated;

grant select, delete on table public.workout_feedback to authenticated;
grant insert (workout_id, status, duration_s, distance_m, elevation_gain_m, rpe, pain)
  on public.workout_feedback to authenticated;
grant update (status, duration_s, distance_m, elevation_gain_m, rpe, pain)
  on public.workout_feedback to authenticated;

grant select, delete on table public.workout_comments to authenticated;
grant insert (workout_id, body) on public.workout_comments to authenticated;

grant select on table public.messages to authenticated;
grant insert (coach_id, athlete_id, body) on public.messages to authenticated;

grant select on table public.workout_activity, public.conversations to authenticated;

-- Fonctions internes : pas exposées à l'application.
revoke execute on function
  public.workout_feedback_before_write(),
  public.workout_comments_before_insert(),
  public.messages_before_insert(),
  public.workout_feedback_notify(),
  public.workout_comments_notify(),
  public.messages_notify(),
  public.wants_emails(uuid),
  public.enqueue_email(uuid, text, jsonb, text),
  public.enqueue_tomorrow_workouts(date),
  public.prepare_email_digests(text, interval),
  public.mark_emails_sent(bigint[]),
  public.send_email_outbox()
from public, anon, authenticated;

revoke execute on function
  public.mark_workout_seen(uuid),
  public.mark_conversation_read(uuid, uuid)
from public, anon;

grant execute on function
  public.mark_workout_seen(uuid),
  public.mark_conversation_read(uuid, uuid)
to authenticated;

-- =============================================================================
-- Temps réel : Supabase Realtime diffuse les nouveaux messages et commentaires
-- (chacun ne reçoit que ce que la RLS l'autorise à lire).
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.messages, public.workout_comments, public.workout_feedback;
  end if;
end;
$$;
