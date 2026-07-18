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
