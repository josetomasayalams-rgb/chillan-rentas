-- =====================================================================
--  Operaciones · Departamento Chillán — esquema Supabase
--  Plataforma complementaria al calendario de reservas para coordinar
--  las operaciones de arriendo del departamento (rental periods +
--  tareas generadas al check-out).
--
--  Pegar en: Supabase → SQL Editor → New query → Run.
--  Idempotente: se puede correr varias veces sin error.
--  No toca la tabla `reservations` existente.
-- =====================================================================

-- Defensa: garantiza gen_random_uuid() también en PG < 13 o instancias sin
-- pgcrypto precargado. Supabase lo trae por default, pero el script queda
-- portable y autoexplicativo.
create extension if not exists pgcrypto;

-- ---------- Arriendos (períodos en que el depto se entrega a terceros) ----
create table if not exists rentals (
  id              uuid primary key default gen_random_uuid(),
  source          text not null,
  reference       text,                                -- código reserva Airbnb, etc. (opcional)
  guest_name      text,                                -- nombre del huesped (opcional)
  checkin_date    date not null,
  checkout_date   date not null,
  notes           text,
  status          text not null default 'scheduled',
  created_at      timestamptz default now(),
  constraint rentals_dates_chk   check (checkout_date >= checkin_date),
  constraint rentals_status_chk  check (status   in ('scheduled','in_progress','completed','cancelled')),
  constraint rentals_source_chk  check (source   in ('airbnb','booking','direct','other','arriendo'))
);

create index if not exists rentals_dates_idx  on rentals (checkin_date, checkout_date);
create index if not exists rentals_status_idx on rentals (status);

-- Migración idempotente: si la tabla ya existe con un CHECK viejo,
-- actualizarlo para incluir 'arriendo' como fuente válida.
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'rentals_source_chk' and table_name = 'rentals'
  ) then
    alter table rentals drop constraint rentals_source_chk;
  end if;
end $$;
alter table rentals
  add constraint rentals_source_chk check (source in ('airbnb','booking','direct','other','arriendo'));

-- ---------- Tareas (una por rental, generada al crear/editar el rental) ----
-- Regla de dominio: existe a lo sumo una tarea por rental. Cuando se
-- regenera, el cliente hace UPDATE o DELETE+INSERT dentro de una tx; nunca
-- quedan dos filas activas.
create table if not exists cleanings (
  id              uuid primary key default gen_random_uuid(),
  rental_id       uuid not null references rentals(id) on delete cascade,  -- borrar rental borra la cleaning
  scheduled_date  date not null,                       -- = rentals.checkout_date al crear
  scheduled_time  time not null default '12:00',       -- check-out a las 12:00
  status          text not null default 'pending',
  confirmed_at    timestamptz,
  done_at         timestamptz,
  created_at      timestamptz default now(),
  constraint cleanings_status_chk check (status in ('pending','confirmed','done','cancelled'))
);

-- Query dominante: "cleanings activos (pending/confirmed) ordenados por fecha".
-- El índice compuesto sirve filtro + orden sin sort. El individual se conserva
-- para queries de admin tipo "historial por mes".
create index if not exists cleanings_status_date_idx  on cleanings (status, scheduled_date);
create index if not exists cleanings_rental_idx       on cleanings (rental_id);

-- Trigger: setea confirmed_at / done_at automáticamente al transicionar de
-- estado, y los limpia si se retrocede a 'pending'. Defensa en profundidad:
-- aunque el cliente mande timestamps correctos, una UPDATE manual desde la
-- consola de Supabase también queda consistente.
create or replace function cleanings_set_timestamps() returns trigger as $$
begin
  if new.status = 'confirmed' and (old.status is null or old.status <> 'confirmed') then
    new.confirmed_at := coalesce(new.confirmed_at, now());
  elsif new.status = 'pending' and old.status in ('confirmed','done') then
    new.confirmed_at := null;
    new.done_at      := null;
  end if;
  if new.status = 'done' and (old.status is null or old.status <> 'done') then
    new.done_at := coalesce(new.done_at, now());
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists cleanings_timestamps_trg on cleanings;
create trigger cleanings_timestamps_trg
  before update on cleanings
  for each row execute function cleanings_set_timestamps();

-- ---------- Comentarios del equipo (opcional) ----------------------------
create table if not exists cleaning_comments (
  id              uuid primary key default gen_random_uuid(),
  cleaning_id     uuid not null references cleanings(id) on delete cascade,
  author          text not null,
  body            text not null,
  created_at      timestamptz default now(),
  constraint cc_author_chk check (author in ('equipo','admin'))
);

-- Migración idempotente: actualizar CHECK viejo si existe (renombra el author).
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'cc_author_chk' and table_name = 'cleaning_comments'
  ) then
    alter table cleaning_comments drop constraint cc_author_chk;
  end if;
end $$;
alter table cleaning_comments
  add constraint cc_author_chk check (author in ('equipo','admin'));

-- Query típica: "comentarios de esta tarea, en orden cronológico".
create index if not exists cleaning_comments_cleaning_created_idx
  on cleaning_comments (cleaning_id, created_at);

-- ---------- RLS (mismo modelo abierto que `reservations`) -----------------
alter table rentals           enable row level security;
alter table cleanings         enable row level security;
alter table cleaning_comments enable row level security;

drop policy if exists "public read"  on rentals;
drop policy if exists "public write" on rentals;
drop policy if exists "public read"  on cleanings;
drop policy if exists "public write" on cleanings;
drop policy if exists "public read"  on cleaning_comments;
drop policy if exists "public write" on cleaning_comments;

create policy "public read"  on rentals           for select using (true);
create policy "public write" on rentals           for all using (true) with check (true);
create policy "public read"  on cleanings         for select using (true);
create policy "public write" on cleanings         for all using (true) with check (true);
create policy "public read"  on cleaning_comments for select using (true);
create policy "public write" on cleaning_comments for all using (true) with check (true);

-- ---------- Realtime ------------------------------------------------------
-- Solo agregar si la tabla no está ya en la publicación (idempotencia).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rentals'
  ) then
    alter publication supabase_realtime add table rentals;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cleanings'
  ) then
    alter publication supabase_realtime add table cleanings;
  end if;
end $$;
