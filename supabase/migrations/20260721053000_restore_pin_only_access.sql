-- Acceso temporal solicitado para Operaciones: el PIN 0000 protege la entrada
-- y 2407 conserva las acciones de administrador. El control por correo se
-- incorporará después en Cloudflare; hasta entonces el cliente usa el rol anon.

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
  row_id := coalesce(
    after_row ->> 'id', before_row ->> 'id',
    after_row ->> 'reservation_id', before_row ->> 'reservation_id',
    'unknown'
  );
  insert into public.calendar_change_log (
    table_name, record_id, operation, actor_email, before_data, after_data
  ) values (
    tg_table_name,
    row_id,
    tg_op,
    lower(coalesce(
      nullif(auth.jwt() ->> 'email', ''),
      nullif(auth.role(), ''),
      'pin-user'
    )),
    before_row,
    after_row
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Registra coordinaciones enviadas antes o fuera de la plataforma. Toda la
-- transición se ejecuta en una sentencia para no dejar notificaciones, lotes
-- y eventos en estados parciales si una escritura falla.
create or replace function public.register_prior_notifications(
  p_recipient text,
  p_reservation_ids text[]
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recipient_key text := lower(trim(p_recipient));
  notifications_table text;
  batches_table text;
  events_table text;
  changed_at timestamptz := now();
  updated_count integer := 0;
begin
  if recipient_key = 'beatriz' then
    notifications_table := 'beatriz_notifications';
    batches_table := 'beatriz_notification_batches';
    events_table := 'beatriz_notification_events';
  elsif recipient_key = 'rodrigo' then
    notifications_table := 'rodrigo_notifications';
    batches_table := 'rodrigo_notification_batches';
    events_table := 'rodrigo_notification_events';
  else
    raise exception 'Destinatario no permitido: %', coalesce(p_recipient, '<null>')
      using errcode = '22023';
  end if;

  execute format($statement$
    with candidates as materialized (
      select
        notification.reservation_id,
        notification.status as previous_status,
        notification.checkin_date,
        notification.checkout_date,
        notification.last_batch_id
      from public.%1$I as notification
      where notification.reservation_id = any($1)
        and (
          (
            notification.is_active = true
            and notification.status in ('pending', 'needs_update')
          )
          or (
            notification.is_active = false
            and notification.status = 'removed'
            and notification.confirmed_at is not null
          )
        )
      for update
    ),
    closed_batches as (
      update public.%2$I as batch
      set
        status = 'not_confirmed',
        resolved_at = $2,
        updated_at = $2
      from (
        select distinct candidate.last_batch_id
        from candidates as candidate
        where candidate.last_batch_id is not null
      ) as referenced
      where batch.id = referenced.last_batch_id
        and batch.status = 'opened'
      returning batch.id
    ),
    updated_notifications as (
      update public.%1$I as notification
      set
        status = 'confirmed',
        confirmed_at = $2,
        updated_at = $2,
        last_batch_id = null
      from candidates as candidate
      where notification.reservation_id = candidate.reservation_id
      returning
        notification.reservation_id,
        notification.checkin_date,
        notification.checkout_date
    ),
    inserted_events as (
      insert into public.%3$I (
        id,
        reservation_id,
        batch_id,
        event_type,
        previous_status,
        next_status,
        checkin_date,
        checkout_date,
        created_at
      )
      select
        gen_random_uuid(),
        updated.reservation_id,
        null,
        'confirmed',
        candidate.previous_status,
        'confirmed',
        updated.checkin_date,
        updated.checkout_date,
        $2
      from updated_notifications as updated
      join candidates as candidate using (reservation_id)
      returning id
    )
    select count(*)::integer
    from updated_notifications
  $statement$, notifications_table, batches_table, events_table)
  using p_reservation_ids, changed_at
  into updated_count;

  return updated_count;
end;
$$;

revoke all on function public.register_prior_notifications(text, text[]) from public, anon, authenticated;
grant execute on function public.register_prior_notifications(text, text[]) to anon, authenticated;
revoke all on function public.log_calendar_change() from public, anon, authenticated;

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
    execute format('drop policy if exists "public read" on public.%I', table_name);
    execute format('drop policy if exists "public write" on public.%I', table_name);
    execute format('drop policy if exists "calendar admins read" on public.%I', table_name);
    execute format('drop policy if exists "calendar admins insert" on public.%I', table_name);
    execute format('drop policy if exists "calendar admins update" on public.%I', table_name);
    execute format('drop policy if exists "calendar admins delete" on public.%I', table_name);
    execute format('drop policy if exists "pin users read" on public.%I', table_name);
    execute format('drop policy if exists "pin users write" on public.%I', table_name);
    execute format('drop policy if exists "pin users insert" on public.%I', table_name);
    execute format('drop policy if exists "pin users update" on public.%I', table_name);

    -- La interfaz nunca borra filas directamente: arriendos y limpiezas usan
    -- deleted_at, mientras comentarios y eventos son históricos aditivos.
    execute format('revoke all on public.%I from anon, authenticated', table_name);

    execute format(
      'create policy "pin users read" on public.%I for select to anon, authenticated using (true)',
      table_name
    );
    execute format(
      'create policy "pin users insert" on public.%I for insert to anon, authenticated with check (true)',
      table_name
    );

    if table_name in (
      'cleaning_comments',
      'beatriz_notification_events',
      'rodrigo_notification_events'
    ) then
      execute format('grant select, insert on public.%I to anon, authenticated', table_name);
    else
      execute format(
        'create policy "pin users update" on public.%I for update to anon, authenticated using (true) with check (true)',
        table_name
      );
      execute format('grant select, insert, update on public.%I to anon, authenticated', table_name);
    end if;
  end loop;
end;
$$;

do $$
begin
  if to_regclass('public.calendar_change_log_id_seq') is not null then
    execute 'revoke all on sequence public.calendar_change_log_id_seq from anon, authenticated';
  end if;
end;
$$;
