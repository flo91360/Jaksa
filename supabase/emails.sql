-- =============================================================================
-- Rob1Coach — activation des e-mails (à exécuter UNE fois, après la migration
-- 20261110090000_echanges.sql). Ce n'est pas une migration : ce fichier
-- contient des secrets à remplir, il ne doit pas être enregistré une fois rempli.
--
-- Avant de l'exécuter, remplacer les trois valeurs entre crochets :
--   [CLE_API_BREVO]   : Brevo → SMTP & API → onglet « API Keys » → Generate (xkeysib-…)
--   [ADRESSE_EXPEDITEUR] : une adresse validée dans Brevo → Senders (ex. coach@mondomaine.fr)
--   [ADRESSE_DU_SITE] : l'adresse du site, sans « / » final (ex. https://rob1coach.fr)
--
-- Voir docs/DEPLOIEMENT.md, étape 7.
-- =============================================================================

-- 1. Extensions de Supabase : appels HTTP (pg_net) et tâches planifiées (pg_cron).
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- 2. Secrets, chiffrés dans Supabase Vault (jamais visibles par le site).
select vault.create_secret('[CLE_API_BREVO]', 'brevo_api_key');
select vault.create_secret('[ADRESSE_EXPEDITEUR]', 'email_sender');
select vault.create_secret('[ADRESSE_DU_SITE]', 'site_url');

-- 3. Tâches planifiées (heures en UTC : 17 h UTC = 18 h l'hiver, 19 h l'été à Paris).
--    Séance du lendemain, chaque soir :
select cron.schedule('rob1coach-seance-du-lendemain', '0 17 * * *', 'select public.enqueue_tomorrow_workouts()');
--    Envoi des e-mails en attente, toutes les 10 minutes :
select cron.schedule('rob1coach-envoi-emails', '*/10 * * * *', 'select public.send_email_outbox()');

-- -----------------------------------------------------------------------------
-- Pour vérifier (à lancer à part, plus tard) :
--   select * from cron.job_run_details order by start_time desc limit 10;   -- exécutions
--   select status, kind, created_at from public.email_outbox order by id desc limit 20;
--   select status_code, content from net._http_response order by id desc limit 5;  -- réponses de Brevo
--
-- Pour changer un secret :
--   select vault.update_secret((select id from vault.secrets where name = 'site_url'), 'https://nouvelle-adresse.fr');
--
-- Pour tout arrêter :
--   select cron.unschedule('rob1coach-seance-du-lendemain');
--   select cron.unschedule('rob1coach-envoi-emails');
-- -----------------------------------------------------------------------------
