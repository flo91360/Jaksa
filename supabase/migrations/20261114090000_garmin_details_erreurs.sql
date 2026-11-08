-- =============================================================================
-- Rob1Coach 0.5.1 — raison des échecs de lecture des fichiers .FIT.
--
-- Quand Garmin ne fournit pas le fichier d'une activité (« HTTP 403 », réponse
-- qui n'est pas une archive .FIT…), la fonction garmin-sync note pourquoi :
-- sur l'activité (garmin_activity_details.error) et dans le journal du passage
-- (garmin_sync_runs.detail_error). Sert au diagnostic, sans donnée de santé.
-- =============================================================================

alter table public.garmin_activity_details
  add column error text check (char_length(error) <= 300);

alter table public.garmin_sync_runs
  add column detail_error text check (char_length(detail_error) <= 300);
