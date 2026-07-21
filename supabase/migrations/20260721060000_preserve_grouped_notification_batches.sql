-- Evita cerrar un lote agrupado cuando solo una de sus reservas se registra
-- como aviso previo y todavía queda otra esperando confirmación de envío.

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
        -- Un registro parcial no debe cerrar el lote compartido mientras otra
        -- reserva siga esperando la confirmación de ese WhatsApp agrupado.
        and not exists (
          select 1
          from public.%1$I as sibling
          where sibling.last_batch_id = batch.id
            and sibling.status = 'opened'
        )
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
