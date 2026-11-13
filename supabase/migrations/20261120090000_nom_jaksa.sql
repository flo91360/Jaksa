-- =============================================================================
-- Jaksa 0.10.0 — la plateforme change de nom : Rob1Coach devient Jaksa.
-- Les e-mails envoyés (objet, pied de page, nom de l'expéditeur) portent le
-- nouveau nom. Les deux fonctions sont reprises à l'identique de
-- 20261110090000_echanges.sql, seul le nom affiché change.
-- =============================================================================

create or replace function public.prepare_email_digests(p_site_url text, p_delay interval default interval '3 minutes')
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
      else cardinality(v_ids) || ' nouveautés sur Jaksa'
    end;
    html := '<div style="font-family:system-ui,sans-serif;font-size:16px;color:#0f172a">'
      || '<p>Bonjour ' || public.email_escape(split_part(trim(r.full_name), ' ', 1)) || ',</p>'
      || '<ul style="padding-left:20px">' || array_to_string(v_lines, '') || '</ul>'
      || '<p style="color:#64748b;font-size:13px">Jaksa · <a href="' || public.email_escape(v_site) || '/compte">'
      || 'Ne plus recevoir ces e-mails</a></p></div>';
    item_ids := v_ids;
    return next;
  end loop;
end;
$$;

create or replace function public.send_email_outbox() returns integer
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
        'sender', jsonb_build_object('name', 'Jaksa', 'email', v_sender),
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
