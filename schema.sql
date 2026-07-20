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

-- ---------- Memoria de avisos a Beatriz ----------------------------------
-- Memoria compartida de coordinación de limpiezas con Beatriz.
-- Aditiva e idempotente: no modifica reservas ni calendarios externos.

create table if not exists public.beatriz_notification_batches (
  id uuid primary key,
  mode text not null check (mode in ('individual', 'grouped')),
  reservation_ids text[] not null check (cardinality(reservation_ids) > 0),
  status text not null default 'opened'
    check (status in ('opened', 'confirmed', 'not_confirmed')),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.beatriz_notifications (
  reservation_id text primary key
    check (reservation_id ~ '^rsv_[a-f0-9]{32}$'),
  checkin_date date not null,
  checkout_date date not null,
  status text not null default 'pending'
    check (status in ('pending', 'opened', 'confirmed', 'needs_update', 'removed', 'finished')),
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  opened_at timestamptz,
  confirmed_at timestamptz,
  last_batch_id uuid references public.beatriz_notification_batches(id),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beatriz_notifications_dates_chk check (checkout_date > checkin_date)
);

create table if not exists public.beatriz_notification_events (
  id uuid primary key,
  reservation_id text references public.beatriz_notifications(reservation_id),
  batch_id uuid references public.beatriz_notification_batches(id),
  event_type text not null
    check (event_type in (
      'created', 'dates_changed', 'opened', 'confirmed',
      'kept_pending', 'confirmation_corrected', 'removed',
      'finished', 'restored'
    )),
  previous_status text,
  next_status text,
  checkin_date date,
  checkout_date date,
  created_at timestamptz not null default now()
);

create index if not exists beatriz_notifications_active_status_idx
  on public.beatriz_notifications (is_active, status, checkin_date);
create index if not exists beatriz_notification_batches_opened_idx
  on public.beatriz_notification_batches (opened_at desc);
create index if not exists beatriz_notification_events_reservation_idx
  on public.beatriz_notification_events (reservation_id, created_at desc);

create or replace function public.beatriz_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists beatriz_notifications_updated_at_trg on public.beatriz_notifications;
create trigger beatriz_notifications_updated_at_trg
  before update on public.beatriz_notifications
  for each row execute function public.beatriz_set_updated_at();

drop trigger if exists beatriz_notification_batches_updated_at_trg on public.beatriz_notification_batches;
create trigger beatriz_notification_batches_updated_at_trg
  before update on public.beatriz_notification_batches
  for each row execute function public.beatriz_set_updated_at();

alter table public.beatriz_notification_batches enable row level security;
alter table public.beatriz_notifications enable row level security;
alter table public.beatriz_notification_events enable row level security;

drop policy if exists "public read" on public.beatriz_notification_batches;
drop policy if exists "public write" on public.beatriz_notification_batches;
drop policy if exists "public read" on public.beatriz_notifications;
drop policy if exists "public write" on public.beatriz_notifications;
drop policy if exists "public read" on public.beatriz_notification_events;
drop policy if exists "public write" on public.beatriz_notification_events;

create policy "public read" on public.beatriz_notification_batches
  for select using (true);
create policy "public write" on public.beatriz_notification_batches
  for all using (true) with check (true);
create policy "public read" on public.beatriz_notifications
  for select using (true);
create policy "public write" on public.beatriz_notifications
  for all using (true) with check (true);
create policy "public read" on public.beatriz_notification_events
  for select using (true);
create policy "public write" on public.beatriz_notification_events
  for all using (true) with check (true);

grant select, insert, update on public.beatriz_notification_batches to anon, authenticated;
grant select, insert, update on public.beatriz_notifications to anon, authenticated;
grant select, insert on public.beatriz_notification_events to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'beatriz_notifications'
  ) then
    alter publication supabase_realtime add table public.beatriz_notifications;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'beatriz_notification_batches'
  ) then
    alter publication supabase_realtime add table public.beatriz_notification_batches;
  end if;
end $$;

-- ---------- Memoria de avisos a Rodrigo ----------------------------------
-- Memoria independiente para la coordinación de conserjería.

create table if not exists public.rodrigo_notification_batches (
  id uuid primary key,
  mode text not null check (mode in ('individual', 'grouped')),
  reservation_ids text[] not null check (cardinality(reservation_ids) > 0),
  status text not null default 'opened'
    check (status in ('opened', 'confirmed', 'not_confirmed')),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rodrigo_notifications (
  reservation_id text primary key check (reservation_id ~ '^rsv_[a-f0-9]{32}$'),
  checkin_date date not null,
  checkout_date date not null,
  status text not null default 'pending'
    check (status in ('pending', 'opened', 'confirmed', 'needs_update', 'removed', 'finished')),
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  opened_at timestamptz,
  confirmed_at timestamptz,
  last_batch_id uuid references public.rodrigo_notification_batches(id),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rodrigo_notifications_dates_chk check (checkout_date > checkin_date)
);

create table if not exists public.rodrigo_notification_events (
  id uuid primary key,
  reservation_id text references public.rodrigo_notifications(reservation_id),
  batch_id uuid references public.rodrigo_notification_batches(id),
  event_type text not null check (event_type in (
    'created', 'dates_changed', 'opened', 'confirmed', 'kept_pending',
    'confirmation_corrected', 'removed', 'finished', 'restored'
  )),
  previous_status text,
  next_status text,
  checkin_date date,
  checkout_date date,
  created_at timestamptz not null default now()
);

create index if not exists rodrigo_notifications_active_status_idx
  on public.rodrigo_notifications (is_active, status, checkin_date);
create index if not exists rodrigo_notification_batches_opened_idx
  on public.rodrigo_notification_batches (opened_at desc);
create index if not exists rodrigo_notification_events_reservation_idx
  on public.rodrigo_notification_events (reservation_id, created_at desc);

create or replace function public.rodrigo_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists rodrigo_notifications_updated_at_trg on public.rodrigo_notifications;
create trigger rodrigo_notifications_updated_at_trg
  before update on public.rodrigo_notifications
  for each row execute function public.rodrigo_set_updated_at();
drop trigger if exists rodrigo_notification_batches_updated_at_trg on public.rodrigo_notification_batches;
create trigger rodrigo_notification_batches_updated_at_trg
  before update on public.rodrigo_notification_batches
  for each row execute function public.rodrigo_set_updated_at();

alter table public.rodrigo_notification_batches enable row level security;
alter table public.rodrigo_notifications enable row level security;
alter table public.rodrigo_notification_events enable row level security;

drop policy if exists "public read" on public.rodrigo_notification_batches;
drop policy if exists "public write" on public.rodrigo_notification_batches;
drop policy if exists "public read" on public.rodrigo_notifications;
drop policy if exists "public write" on public.rodrigo_notifications;
drop policy if exists "public read" on public.rodrigo_notification_events;
drop policy if exists "public write" on public.rodrigo_notification_events;
create policy "public read" on public.rodrigo_notification_batches for select using (true);
create policy "public write" on public.rodrigo_notification_batches for all using (true) with check (true);
create policy "public read" on public.rodrigo_notifications for select using (true);
create policy "public write" on public.rodrigo_notifications for all using (true) with check (true);
create policy "public read" on public.rodrigo_notification_events for select using (true);
create policy "public write" on public.rodrigo_notification_events for all using (true) with check (true);

grant select, insert, update on public.rodrigo_notification_batches to anon, authenticated;
grant select, insert, update on public.rodrigo_notifications to anon, authenticated;
grant select, insert on public.rodrigo_notification_events to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rodrigo_notifications'
  ) then
    alter publication supabase_realtime add table public.rodrigo_notifications;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rodrigo_notification_batches'
  ) then
    alter publication supabase_realtime add table public.rodrigo_notification_batches;
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
  rental_id       uuid references rentals(id) on delete cascade,
  reservation_id  text,
  scheduled_date  date not null,                       -- = rentals.checkout_date al crear
  scheduled_time  time not null default '12:00',       -- check-out a las 12:00
  status          text not null default 'pending',
  confirmed_at    timestamptz,
  done_at         timestamptz,
  created_at      timestamptz default now(),
  constraint cleanings_status_chk check (status in ('pending','confirmed','done','cancelled')),
  constraint cleanings_target_chk check (num_nonnulls(rental_id, reservation_id) = 1),
  constraint cleanings_reservation_id_chk
    check (reservation_id is null or reservation_id ~ '^rsv_[a-f0-9]{32}$')
);

-- Migración idempotente para instalaciones existentes: una limpieza puede
-- pertenecer a una reserva manual o a una reserva sincronizada, nunca a ambas.
alter table cleanings add column if not exists reservation_id text;
alter table cleanings alter column rental_id drop not null;

do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public' and table_name = 'cleanings'
      and constraint_name = 'cleanings_target_chk'
  ) then
    alter table cleanings drop constraint cleanings_target_chk;
  end if;
  if exists (
    select 1 from information_schema.table_constraints
    where constraint_schema = 'public' and table_name = 'cleanings'
      and constraint_name = 'cleanings_reservation_id_chk'
  ) then
    alter table cleanings drop constraint cleanings_reservation_id_chk;
  end if;
end $$;

alter table cleanings
  add constraint cleanings_target_chk
    check (num_nonnulls(rental_id, reservation_id) = 1),
  add constraint cleanings_reservation_id_chk
    check (reservation_id is null or reservation_id ~ '^rsv_[a-f0-9]{32}$');

-- Query dominante: "cleanings activos (pending/confirmed) ordenados por fecha".
-- El índice compuesto sirve filtro + orden sin sort. El individual se conserva
-- para queries de admin tipo "historial por mes".
create index if not exists cleanings_status_date_idx  on cleanings (status, scheduled_date);
create index if not exists cleanings_rental_idx       on cleanings (rental_id);
create unique index if not exists cleanings_reservation_id_uidx
  on cleanings (reservation_id) where reservation_id is not null;

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

-- Operations integrity hardening. Apply after the family calendar auth migration.
create table if not exists public.calendar_admins (
  email text primary key check (email = lower(email)),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.calendar_admins (email, active)
values
  ('josetomasayalams@gmail.com', true),
  ('scamussotomayor@gmail.com', true)
on conflict (email) do update set active = excluded.active;

alter table public.calendar_admins enable row level security;
revoke all on public.calendar_admins from anon, authenticated;

create or replace function public.is_calendar_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.calendar_admins
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and active = true
  );
$$;
revoke all on function public.is_calendar_admin() from public, anon;
grant execute on function public.is_calendar_admin() to authenticated;

alter table public.rentals add column if not exists deleted_at timestamptz;
alter table public.cleanings add column if not exists deleted_at timestamptz;

create index if not exists rentals_active_dates_idx
  on public.rentals (checkin_date, checkout_date)
  where deleted_at is null;

drop index if exists public.cleanings_reservation_id_uidx;
create unique index cleanings_reservation_id_uidx
  on public.cleanings (reservation_id)
  where reservation_id is not null and deleted_at is null;

create unique index if not exists cleanings_rental_id_active_uidx
  on public.cleanings (rental_id)
  where rental_id is not null and deleted_at is null;

alter table public.rentals drop constraint if exists rentals_dates_chk;
alter table public.rentals
  add constraint rentals_dates_chk check (checkout_date > checkin_date);

create table if not exists public.calendar_change_log (
  id bigint generated by default as identity primary key,
  table_name text not null,
  record_id text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  actor_email text not null,
  before_data jsonb,
  after_data jsonb,
  changed_at timestamptz not null default now()
);

alter table public.calendar_change_log enable row level security;
revoke all on public.calendar_change_log from anon, authenticated;

create or replace function public.log_calendar_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  before_row jsonb;
  after_row jsonb;
  row_id text;
begin
  before_row := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  after_row := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  row_id := coalesce(after_row ->> 'id', before_row ->> 'id', 'unknown');
  insert into public.calendar_change_log (
    table_name, record_id, operation, actor_email, before_data, after_data
  ) values (
    tg_table_name,
    row_id,
    tg_op,
    lower(coalesce(auth.jwt() ->> 'email', current_user, 'system')),
    before_row,
    after_row
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.log_calendar_change() from public, anon, authenticated;

create or replace function public.protect_calendar_change_log()
returns trigger
language plpgsql
as $$
begin
  raise exception 'calendar_change_log is append-only';
end;
$$;
revoke all on function public.protect_calendar_change_log() from public, anon, authenticated;

drop trigger if exists calendar_change_log_no_update on public.calendar_change_log;
create trigger calendar_change_log_no_update
  before update on public.calendar_change_log
  for each row execute function public.protect_calendar_change_log();

drop trigger if exists calendar_change_log_no_delete on public.calendar_change_log;
create trigger calendar_change_log_no_delete
  before delete on public.calendar_change_log
  for each row execute function public.protect_calendar_change_log();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'rentals',
    'cleanings',
    'cleaning_comments',
    'beatriz_notification_batches',
    'beatriz_notifications',
    'beatriz_notification_events',
    'rodrigo_notification_batches',
    'rodrigo_notifications',
    'rodrigo_notification_events'
  ]
  loop
    execute format('drop trigger if exists %I_change_log_trg on public.%I', table_name, table_name);
    execute format(
      'create trigger %I_change_log_trg after insert or update or delete on public.%I for each row execute function public.log_calendar_change()',
      table_name,
      table_name
    );

    execute format('drop policy if exists "public read" on public.%I', table_name);
    execute format('drop policy if exists "public write" on public.%I', table_name);
    execute format('drop policy if exists "calendar admins read" on public.%I', table_name);
    execute format('drop policy if exists "calendar admins insert" on public.%I', table_name);
    execute format('drop policy if exists "calendar admins update" on public.%I', table_name);
    execute format('drop policy if exists "calendar admins delete" on public.%I', table_name);

    execute format(
      'create policy "calendar admins read" on public.%I for select to authenticated using (public.is_calendar_admin())',
      table_name
    );
    execute format(
      'create policy "calendar admins insert" on public.%I for insert to authenticated with check (public.is_calendar_admin())',
      table_name
    );
    execute format(
      'create policy "calendar admins update" on public.%I for update to authenticated using (public.is_calendar_admin()) with check (public.is_calendar_admin())',
      table_name
    );
    execute format(
      'create policy "calendar admins delete" on public.%I for delete to authenticated using (public.is_calendar_admin())',
      table_name
    );

    execute format('revoke all on public.%I from anon', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
  end loop;
end;
$$;


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
