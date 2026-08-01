drop function public.claim_coach_review_slot();
drop function public.record_coach_review_result(boolean, integer, text);

create function public.claim_coach_review_slot(p_user_id uuid)
returns table (
  allowed boolean,
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
  v_allowed boolean;
begin
  if p_user_id is null then
    raise exception 'A user id is required.' using errcode = '22023';
  end if;

  insert into public.coach_daily_usage (user_id, usage_date, request_count)
  values (p_user_id, v_usage_date, 1)
  on conflict (user_id, usage_date) do update
    set request_count = public.coach_daily_usage.request_count + 1,
        updated_at = now()
    where public.coach_daily_usage.request_count < 20
  returning * into v_usage;

  v_allowed := found;
  if not v_allowed then
    select *
      into strict v_usage
      from public.coach_daily_usage
      where user_id = p_user_id and usage_date = v_usage_date;
  end if;

  return query
  select
    v_allowed,
    v_usage.request_count::integer,
    greatest(20 - v_usage.request_count, 0)::integer,
    ((v_usage_date + 1)::timestamp at time zone 'utc');
end;
$$;

create function public.record_coach_review_result(
  p_user_id uuid,
  p_succeeded boolean,
  p_latency_ms integer,
  p_error_code text default null
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_usage_date date := (now() at time zone 'utc')::date;
  v_updated boolean;
begin
  if p_user_id is null then
    raise exception 'A user id is required.' using errcode = '22023';
  end if;
  if p_latency_ms < 0 or p_latency_ms > 120000 then
    raise exception 'Latency is outside the supported range.' using errcode = '22023';
  end if;

  update public.coach_daily_usage
  set success_count = success_count + case when p_succeeded then 1 else 0 end,
      failure_count = failure_count + case when p_succeeded then 0 else 1 end,
      total_latency_ms = total_latency_ms + p_latency_ms,
      last_latency_ms = p_latency_ms,
      last_error_code = case
        when p_succeeded then null
        else coalesce(nullif(left(trim(p_error_code), 64), ''), 'unknown')
      end,
      updated_at = now()
  where user_id = p_user_id
    and usage_date = v_usage_date
    and success_count + failure_count < request_count;

  v_updated := found;
  return v_updated;
end;
$$;

comment on function public.claim_coach_review_slot(uuid) is
  'Atomically claims one daily AI review request for a server-authenticated user. Server-only.';
comment on function public.record_coach_review_result(uuid, boolean, integer, text) is
  'Records aggregate AI coach reliability metrics after a claimed request. Server-only.';

revoke all on function public.claim_coach_review_slot(uuid) from public, anon, authenticated;
revoke all on function public.record_coach_review_result(uuid, boolean, integer, text) from public, anon, authenticated;
grant execute on function public.claim_coach_review_slot(uuid) to service_role;
grant execute on function public.record_coach_review_result(uuid, boolean, integer, text) to service_role;
