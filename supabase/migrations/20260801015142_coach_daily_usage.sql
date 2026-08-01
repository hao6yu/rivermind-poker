create table public.coach_daily_usage (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  usage_date date not null default ((now() at time zone 'utc')::date),
  request_count smallint not null default 0 check (request_count between 0 and 20),
  success_count smallint not null default 0 check (success_count between 0 and request_count),
  failure_count smallint not null default 0 check (failure_count between 0 and request_count),
  total_latency_ms bigint not null default 0 check (total_latency_ms >= 0),
  last_latency_ms integer check (last_latency_ms between 0 and 120000),
  last_error_code text check (last_error_code is null or char_length(last_error_code) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date),
  constraint coach_daily_usage_recorded_requests_check
    check (success_count + failure_count <= request_count)
);

comment on table public.coach_daily_usage is
  'Owner-readable daily AI coach request quota and aggregate reliability metrics. Writes are restricted to bounded RPC functions.';

alter table public.coach_daily_usage enable row level security;

revoke all on table public.coach_daily_usage from public, anon, authenticated;
grant select on table public.coach_daily_usage to authenticated;
grant select, insert, update, delete on table public.coach_daily_usage to service_role;

create policy "Users can read their own coach usage"
  on public.coach_daily_usage
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.claim_coach_review_slot()
returns table (
  allowed boolean,
  request_count integer,
  remaining integer,
  resets_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_usage_date date := (now() at time zone 'utc')::date;
  v_usage public.coach_daily_usage%rowtype;
  v_allowed boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  insert into public.coach_daily_usage (user_id, usage_date, request_count)
  values (v_user_id, v_usage_date, 1)
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
      where user_id = v_user_id and usage_date = v_usage_date;
  end if;

  return query
  select
    v_allowed,
    v_usage.request_count::integer,
    greatest(20 - v_usage.request_count, 0)::integer,
    ((v_usage_date + 1)::timestamp at time zone 'utc');
end;
$$;

create or replace function public.record_coach_review_result(
  p_succeeded boolean,
  p_latency_ms integer,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_usage_date date := (now() at time zone 'utc')::date;
  v_updated boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
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
  where user_id = v_user_id
    and usage_date = v_usage_date
    and success_count + failure_count < request_count;

  v_updated := found;
  return v_updated;
end;
$$;

revoke all on function public.claim_coach_review_slot() from public, anon;
revoke all on function public.record_coach_review_result(boolean, integer, text) from public, anon;
grant execute on function public.claim_coach_review_slot() to authenticated, service_role;
grant execute on function public.record_coach_review_result(boolean, integer, text) to authenticated, service_role;
