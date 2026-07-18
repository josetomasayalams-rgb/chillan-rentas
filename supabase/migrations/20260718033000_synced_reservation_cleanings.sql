-- Permite una tarea de aseo automática por reserva sincronizada.
-- Las reservas externas siguen siendo de solo lectura; sólo se persiste su ID
-- público opaco y la fecha de salida necesaria para Operaciones.

alter table public.cleanings
  add column if not exists reservation_id text;

alter table public.cleanings
  alter column rental_id drop not null;

do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'cleanings'
      and constraint_name = 'cleanings_target_chk'
  ) then
    alter table public.cleanings drop constraint cleanings_target_chk;
  end if;

  if exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'cleanings'
      and constraint_name = 'cleanings_reservation_id_chk'
  ) then
    alter table public.cleanings drop constraint cleanings_reservation_id_chk;
  end if;
end $$;

alter table public.cleanings
  add constraint cleanings_target_chk
    check (num_nonnulls(rental_id, reservation_id) = 1),
  add constraint cleanings_reservation_id_chk
    check (reservation_id is null or reservation_id ~ '^rsv_[a-f0-9]{32}$');

create unique index if not exists cleanings_reservation_id_uidx
  on public.cleanings (reservation_id)
  where reservation_id is not null;
