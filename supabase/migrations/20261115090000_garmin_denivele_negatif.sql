-- Dénivelé négatif du résumé Garmin, pour que D+ et D− viennent de la même source.
-- (Le D− du .FIT n'est pas corrigé par Garmin : mêlé au D+ corrigé du résumé, il donnait
-- par exemple 17 m de D+ pour 186 m de D− sur une sortie à plat.)
alter table public.garmin_activities
  add column elevation_loss_m integer check (elevation_loss_m between 0 and 30000);

grant insert (elevation_loss_m) on public.garmin_activities to authenticated;
grant update (elevation_loss_m) on public.garmin_activities to authenticated;
