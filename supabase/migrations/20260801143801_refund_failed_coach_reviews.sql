alter table public.coach_daily_usage
  add column refunded_failure_count integer not null default 0
  constraint coach_daily_usage_refunded_failure_count_check
  check (refunded_failure_count >= 0);

comment on column public.coach_daily_usage.refunded_failure_count is
  'Failed or timed-out coach attempts returned to the user daily allowance.';

create function public.release_coach_review_slot(
  p_user_id uuid,
  p_latency_ms integer,
  p_error_code text default null
)
returns table (
  released boolean,
  request_count integer,
  remaining integer,
  resets_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_usage_date date := (now() at time zone 'utc')::date;
  v_usage public.coach_daily_usage%rowtype;
  v_released boolean;
begin
  if p_user_id is null then
    raise exception 'A user id is required.' using errcode = '22023';
  end if;
  if p_latency_ms < 0 or p_latency_ms > 120000 then
    raise exception 'Latency is outside the supported range.' using errcode = '22023';
  end if;

  update public.coach_daily_usage as usage
  set request_count = usage.request_count - 1,
      refunded_failure_count = usage.refunded_failure_count + 1,
      total_latency_ms = usage.total_latency_ms + p_latency_ms,
      last_latency_ms = p_latency_ms,
      last_error_code = coalesce(nullif(left(trim(p_error_code), 64), ''), 'unknown'),
      updated_at = now()
  where usage.user_id = p_user_id
    and usage.usage_date = v_usage_date
    and usage.request_count > usage.success_count + usage.failure_count
  returning usage.* into v_usage;

  v_released := found;
  if not v_released then
    select *
      into strict v_usage
      from public.coach_daily_usage
      where user_id = p_user_id and usage_date = v_usage_date;
  end if;

  return query
  select
    v_released,
    v_usage.request_count::integer,
    greatest(20 - v_usage.request_count, 0)::integer,
    ((v_usage_date + 1)::timestamp at time zone 'utc');
end;
$$;

comment on function public.release_coach_review_slot(uuid, integer, text) is
  'Refunds one failed AI coach claim while retaining aggregate failure diagnostics. Server-only.';

revoke all on function public.release_coach_review_slot(uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.release_coach_review_slot(uuid, integer, text)
  to service_role;
