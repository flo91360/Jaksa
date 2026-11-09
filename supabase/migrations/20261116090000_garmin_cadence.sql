-- Cadence moyenne et max du résumé Garmin (pas/min en course et en marche, tr/min à vélo),
-- pour l'afficher partout où s'affiche une activité, même sans fichier .FIT.
alter table public.garmin_activities
  add column avg_cadence smallint check (avg_cadence between 1 and 400),
  add column max_cadence smallint check (max_cadence between 1 and 400);

grant insert (avg_cadence, max_cadence) on public.garmin_activities to authenticated;
grant update (avg_cadence, max_cadence) on public.garmin_activities to authenticated;
