alter table public.multiplayer_rooms
  add column session_number integer not null default 1 check (session_number > 0),
  add column completion_reason text check (
    completion_reason is null
    or completion_reason in ('hand-limit', 'last-player-standing')
  );

alter table public.multiplayer_actions
  add column session_number integer not null default 1 check (session_number > 0);

drop index public.multiplayer_actions_room_hand_idx;
create index multiplayer_actions_room_session_hand_idx
  on public.multiplayer_actions (
    room_id, session_number, hand_number, state_version, action_sequence
  );

-- Keep the rolling-deploy v1 transition RPC safe after a rematch: older Edge
-- instances omit session_number, so the database authoritatively derives it.
create or replace function private.multiplayer_action_assign_session_number()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  select room.session_number into new.session_number
  from public.multiplayer_rooms as room
  where room.id = new.room_id;
  if new.session_number is null then
    raise exception using errcode = 'P0002', message = 'Multiplayer room was not found.';
  end if;
  return new;
end;
$$;

revoke execute on function private.multiplayer_action_assign_session_number()
  from public, anon, authenticated;
grant execute on function private.multiplayer_action_assign_session_number()
  to service_role;

create trigger multiplayer_actions_assign_session_number
before insert on public.multiplayer_actions
for each row execute function private.multiplayer_action_assign_session_number();

-- A displayed invite remains valid for the room lifecycle. The room is still
-- undiscoverable without its hash, and cleanup deletes the secret with it.
create or replace function private.multiplayer_code_match_room_expiry()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  select room.expires_at into new.code_expires_at
  from public.multiplayer_rooms as room
  where room.id = new.room_id;
  if new.code_expires_at is null then
    raise exception using errcode = 'P0002', message = 'Multiplayer room was not found.';
  end if;
  return new;
end;
$$;

revoke execute on function private.multiplayer_code_match_room_expiry()
  from public, anon, authenticated;
grant execute on function private.multiplayer_code_match_room_expiry()
  to service_role;

create trigger multiplayer_room_secrets_match_room_expiry
before insert or update of code_expires_at on private.multiplayer_room_secrets
for each row execute function private.multiplayer_code_match_room_expiry();

update private.multiplayer_room_secrets as secret
set code_expires_at = room.expires_at
from public.multiplayer_rooms as room
where room.id = secret.room_id
  and secret.code_expires_at is distinct from room.expires_at;

update private.multiplayer_game_states
set canonical_state = canonical_state
  || jsonb_build_object(
    'sessionNumber', coalesce((canonical_state->>'sessionNumber')::integer, 1),
    'completionReason', canonical_state->'completionReason'
  )
where not (canonical_state ? 'sessionNumber')
   or not (canonical_state ? 'completionReason');

update public.multiplayer_rooms
set public_snapshot = public_snapshot
  || jsonb_build_object(
    'sessionNumber', coalesce((public_snapshot->>'sessionNumber')::integer, 1),
    'completionReason', public_snapshot->'completionReason'
  )
where not (public_snapshot ? 'sessionNumber')
   or not (public_snapshot ? 'completionReason');

create or replace function private.multiplayer_archive_is_redacted(
  viewer_player_id text,
  hand jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  action jsonb;
  hole_cards jsonb;
  player record;
  showdown boolean;
begin
  if viewer_player_id is null
    or char_length(viewer_player_id) not between 1 and 128
    or jsonb_typeof(hand) is distinct from 'object'
    or octet_length(hand::text) > 1000000 then
    return false;
  end if;
  if hand->>'street' is distinct from 'complete'
    or jsonb_typeof(hand->'outcome') is distinct from 'object'
    or jsonb_typeof(hand->'players') is distinct from 'object'
    or jsonb_typeof(hand->'deck') is distinct from 'array'
    or jsonb_typeof(hand->'pending') is distinct from 'array'
    or hand->'toAct' is distinct from 'null'::jsonb
    or jsonb_typeof(hand->'history') is distinct from 'array'
    or jsonb_path_exists(hand, '$.**.userId ? (@.type() == "string")')
    or jsonb_path_exists(hand, '$.**.roomCode ? (@.type() == "string")') then
    return false;
  end if;
  if not (hand->'players' ? viewer_player_id)
    or jsonb_array_length(hand->'deck') <> 0
    or jsonb_array_length(hand->'pending') <> 0 then
    return false;
  end if;

  showdown := coalesce(hand#>>'{outcome,showdown}', 'false') = 'true';
  for player in select * from jsonb_each(hand->'players')
  loop
    if jsonb_typeof(player.value) is distinct from 'object' then return false; end if;
    hole_cards := player.value->'holeCards';
    if jsonb_typeof(hole_cards) is distinct from 'array'
      or jsonb_typeof(player.value->'folded') is distinct from 'boolean' then
      return false;
    end if;
    if jsonb_array_length(hole_cards) not in (0, 2)
      or (
        player.key <> viewer_player_id
        and jsonb_array_length(hole_cards) > 0
        and (not showdown or coalesce(player.value->>'folded', 'false') = 'true')
      ) then
      return false;
    end if;
  end loop;

  for action in select value from jsonb_array_elements(hand->'history')
  loop
    if jsonb_typeof(action) is distinct from 'object'
      or action->>'playerId' is null
      or (action->>'playerId' <> viewer_player_id and action ? 'decisionContext') then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke execute on function private.multiplayer_archive_is_redacted(text, jsonb)
  from public, anon, authenticated;
grant execute on function private.multiplayer_archive_is_redacted(text, jsonb)
  to service_role;

create table private.multiplayer_hand_archives (
  id bigint generated always as identity primary key,
  room_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  viewer_player_id text not null check (char_length(viewer_player_id) between 1 and 128),
  session_number integer not null check (session_number > 0),
  hand_number integer not null check (hand_number > 0),
  completed_at timestamptz not null,
  completion_reason text check (
    completion_reason is null
    or completion_reason in ('hand-limit', 'last-player-standing')
  ),
  redacted_hand jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, room_id, session_number, hand_number),
  constraint multiplayer_hand_archives_redacted check (
    private.multiplayer_archive_is_redacted(viewer_player_id, redacted_hand)
  )
);

comment on table private.multiplayer_hand_archives is
  'Viewer-specific completed hands. Contains no deck, folded opponent cards, room code, or other users'' decision context.';

create index multiplayer_hand_archives_user_recent_idx
  on private.multiplayer_hand_archives (user_id, completed_at desc);
create index multiplayer_hand_archives_room_session_idx
  on private.multiplayer_hand_archives (room_id, session_number, hand_number);
create index multiplayer_hand_archives_completed_at_idx
  on private.multiplayer_hand_archives (completed_at);

alter table private.multiplayer_hand_archives enable row level security;
revoke all on table private.multiplayer_hand_archives from public, anon, authenticated;
revoke all on sequence private.multiplayer_hand_archives_id_seq from public, anon, authenticated;
grant select, insert, update, delete on table private.multiplayer_hand_archives to service_role;
grant usage, select on sequence private.multiplayer_hand_archives_id_seq to service_role;

create table private.multiplayer_request_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  operation text not null check (operation in ('create', 'join')),
  bucket_start timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, operation, bucket_start)
);

create index multiplayer_request_limits_bucket_start_idx
  on private.multiplayer_request_limits (bucket_start);

alter table private.multiplayer_request_limits enable row level security;
revoke all on table private.multiplayer_request_limits from public, anon, authenticated;
grant select, insert, update, delete on table private.multiplayer_request_limits to service_role;

create or replace function public.multiplayer_claim_request_slot(
  p_user_id uuid,
  p_operation text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  claimed_count integer;
  request_now timestamptz := clock_timestamp();
  current_bucket timestamptz;
begin
  if p_operation not in ('create', 'join')
    or p_limit < 1 or p_limit > 1000
    or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception using errcode = '22023', message = 'Invalid multiplayer request limit.';
  end if;

  current_bucket := to_timestamp(
    floor(extract(epoch from request_now) / p_window_seconds) * p_window_seconds
  );

  insert into private.multiplayer_request_limits (
    user_id,
    operation,
    bucket_start,
    request_count,
    updated_at
  ) values (
    p_user_id,
    p_operation,
    current_bucket,
    1,
    request_now
  )
  on conflict (user_id, operation, bucket_start)
  do update
    set request_count = private.multiplayer_request_limits.request_count + 1,
        updated_at = request_now
    where private.multiplayer_request_limits.request_count < p_limit
  returning request_count into claimed_count;

  return claimed_count is not null and claimed_count <= p_limit;
end;
$$;

revoke execute on function public.multiplayer_claim_request_slot(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.multiplayer_claim_request_slot(uuid, text, integer, integer)
  to service_role;

create or replace function public.multiplayer_load_resumable_room(p_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select state.canonical_state
  from private.multiplayer_room_members as member
  join public.multiplayer_rooms as room on room.id = member.room_id
  join public.multiplayer_seats as seat
    on seat.room_id = member.room_id and seat.player_id = member.player_id
  join private.multiplayer_game_states as state on state.room_id = member.room_id
  where member.user_id = p_user_id
    and room.expires_at > now()
    -- Active-game leave writes this pair as an explicit tombstone. Offline
    -- human seats and online AI-takeover seats remain recoverable/reclaimable.
    and not (seat.connection_state = 'offline' and seat.control_state = 'ai')
  order by room.updated_at desc
  limit 1;
$$;

create or replace function public.multiplayer_load_hand_archives(
  p_user_id uuid,
  p_room_id uuid default null,
  p_session_number integer default null,
  p_limit integer default 50
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'completedAtMs', floor(extract(epoch from archive.completed_at) * 1000),
      'completionReason', archive.completion_reason,
      'hand', archive.redacted_hand,
      'roomId', archive.room_id,
      'sessionNumber', archive.session_number,
      'viewerPlayerId', archive.viewer_player_id
    ) order by archive.completed_at asc, archive.hand_number asc
  ), '[]'::jsonb)
  from (
    select *
    from private.multiplayer_hand_archives as candidate
    where candidate.user_id = p_user_id
      and (p_room_id is null or candidate.room_id = p_room_id)
      and (p_session_number is null or candidate.session_number = p_session_number)
    order by candidate.completed_at desc, candidate.id desc
    limit least(greatest(p_limit, 1), 100)
  ) as archive;
$$;

create or replace function public.multiplayer_delete_hand_archives(p_user_id uuid)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from private.multiplayer_hand_archives
  where user_id = p_user_id;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke execute on function public.multiplayer_load_resumable_room(uuid)
  from public, anon, authenticated;
revoke execute on function public.multiplayer_load_hand_archives(uuid, uuid, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.multiplayer_delete_hand_archives(uuid)
  from public, anon, authenticated;
grant execute on function public.multiplayer_load_resumable_room(uuid) to service_role;
grant execute on function public.multiplayer_load_hand_archives(uuid, uuid, integer, integer) to service_role;
grant execute on function public.multiplayer_delete_hand_archives(uuid) to service_role;

-- A valid, unexpired code may resolve a non-lobby room so the Edge Function
-- can distinguish "already started" from an invalid/expired invite without
-- exposing room existence to callers who do not possess that code.
create or replace function public.multiplayer_load_joinable_room(p_room_code_hash text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'roomId', room.id,
    'canonicalState', state.canonical_state
  )
  from private.multiplayer_room_secrets as secret
  join public.multiplayer_rooms as room on room.id = secret.room_id
  join private.multiplayer_game_states as state on state.room_id = room.id
  where secret.room_code_hash = p_room_code_hash
    and secret.code_expires_at > now()
    and room.expires_at > now();
$$;

revoke execute on function public.multiplayer_load_joinable_room(text)
  from public, anon, authenticated;
grant execute on function public.multiplayer_load_joinable_room(text) to service_role;

create or replace function public.multiplayer_commit_transition_v2(
  p_room_id uuid,
  p_expected_version bigint,
  p_canonical_state jsonb,
  p_public_snapshot jsonb,
  p_public_actions jsonb,
  p_public_transition jsonb,
  p_hand_archives jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  action jsonb;
  action_index integer := 0;
  archive jsonb;
  archive_user_id uuid;
  current_session_number integer;
  current_version bigint;
  new_version bigint := (p_canonical_state->>'version')::bigint;
  room_hand_number integer := coalesce((p_canonical_state->'hand'->>'handNumber')::integer, 0);
  room_session_number integer := (p_canonical_state->>'sessionNumber')::integer;
  room_status text := p_canonical_state->>'status';
  seat jsonb;
  seat_stack integer;
begin
  if jsonb_typeof(p_public_actions) <> 'array'
    or jsonb_typeof(p_hand_archives) <> 'array'
    or jsonb_array_length(p_hand_archives) > 6 then
    raise exception using errcode = '22023', message = 'Invalid multiplayer transition collections.';
  end if;
  if new_version <> p_expected_version + 1 then
    raise exception using errcode = '22023', message = 'Canonical state version is not the next expected version.';
  end if;
  if room_session_number is null or room_session_number < 1 then
    raise exception using errcode = '22023', message = 'Canonical session number is invalid.';
  end if;

  select room.state_version, room.session_number
  into current_version, current_session_number
  from public.multiplayer_rooms as room
  where room.id = p_room_id
  for update;

  if current_version is null then
    raise exception using errcode = 'P0002', message = 'Multiplayer room was not found.';
  end if;
  if current_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'Multiplayer room version is stale.';
  end if;
  if room_session_number < current_session_number
    or room_session_number > current_session_number + 1 then
    raise exception using errcode = '22023', message = 'Canonical session number is stale or invalid.';
  end if;

  update public.multiplayer_rooms
  set host_player_id = nullif(p_canonical_state->>'hostPlayerId', ''),
      status = room_status,
      hand_number = room_hand_number,
      session_number = room_session_number,
      completion_reason = nullif(p_canonical_state->>'completionReason', ''),
      state_version = new_version,
      public_snapshot = p_public_snapshot,
      turn_deadline_at = case
        when p_canonical_state->>'turnDeadlineAtMs' is null then null
        else to_timestamp((p_canonical_state->>'turnDeadlineAtMs')::double precision / 1000.0)
      end,
      updated_at = now()
  where id = p_room_id;

  update private.multiplayer_game_states
  set state_version = new_version,
      canonical_state = p_canonical_state,
      updated_at = now()
  where room_id = p_room_id;

  delete from public.multiplayer_seats where room_id = p_room_id;
  delete from private.multiplayer_room_members where room_id = p_room_id;

  for seat in select value from jsonb_array_elements(p_canonical_state->'seats')
  loop
    seat_stack := coalesce(
      (p_canonical_state->'hand'->'players'->(seat->>'playerId')->>'stack')::integer,
      (p_canonical_state->'config'->>'startingStackChips')::integer
    );

    insert into public.multiplayer_seats (
      room_id, seat_index, player_id, occupant_kind, ai_profile_id,
      display_name, ready, connection_state, control_state, missed_turns,
      stack_chips, joined_at, updated_at
    ) values (
      p_room_id,
      (seat->>'seat')::smallint,
      seat->>'playerId',
      seat->>'kind',
      nullif(seat->>'aiProfileId', ''),
      seat->>'displayName',
      (seat->>'ready')::boolean,
      seat->>'connection',
      seat->>'control',
      (seat->>'missedTurns')::smallint,
      seat_stack,
      to_timestamp((seat->>'joinedAtMs')::double precision / 1000.0),
      now()
    );

    if seat->>'kind' = 'human' and seat->>'userId' is not null then
      insert into private.multiplayer_room_members (room_id, user_id, player_id, joined_at)
      values (
        p_room_id,
        (seat->>'userId')::uuid,
        seat->>'playerId',
        to_timestamp((seat->>'joinedAtMs')::double precision / 1000.0)
      );
    end if;
  end loop;

  for action in select value from jsonb_array_elements(p_public_actions)
  loop
    action_index := action_index + 1;
    insert into public.multiplayer_actions (
      room_id, state_version, action_sequence, session_number, hand_number,
      player_id, street, action_type, amount, pot_after
    ) values (
      p_room_id,
      new_version,
      action_index,
      room_session_number,
      room_hand_number,
      action->>'playerId',
      action->>'street',
      action->>'type',
      (action->>'amount')::integer,
      (action->>'potAfter')::integer
    );
  end loop;

  for archive in select value from jsonb_array_elements(p_hand_archives)
  loop
    archive_user_id := (archive->>'userId')::uuid;
    if archive->>'roomId' <> p_room_id::text
      or (archive->>'sessionNumber')::integer <> room_session_number
      or (archive->'hand'->>'handNumber')::integer <> room_hand_number
      or coalesce(archive->>'completionReason', '')
        <> coalesce(p_canonical_state->>'completionReason', '')
      or not exists (
        select 1
        from private.multiplayer_room_members as member
        where member.room_id = p_room_id
          and member.user_id = archive_user_id
          and member.player_id = archive->>'viewerPlayerId'
      )
      or not private.multiplayer_archive_is_redacted(
        archive->>'viewerPlayerId', archive->'hand'
      ) then
      raise exception using errcode = '22023', message = 'Invalid multiplayer hand archive.';
    end if;

    insert into private.multiplayer_hand_archives (
      room_id, user_id, viewer_player_id, session_number, hand_number,
      completed_at, completion_reason, redacted_hand
    ) values (
      p_room_id,
      archive_user_id,
      archive->>'viewerPlayerId',
      (archive->>'sessionNumber')::integer,
      (archive->'hand'->>'handNumber')::integer,
      to_timestamp((archive->>'completedAtMs')::double precision / 1000.0),
      nullif(archive->>'completionReason', ''),
      archive->'hand'
    )
    on conflict (user_id, room_id, session_number, hand_number)
    do nothing;
  end loop;

  perform realtime.send(
    p_public_transition #- '{transition,actorUserId}',
    'transition',
    'room:' || p_room_id::text,
    true
  );

  return new_version;
end;
$$;

revoke execute on function public.multiplayer_commit_transition_v2(
  uuid, bigint, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.multiplayer_commit_transition_v2(
  uuid, bigint, jsonb, jsonb, jsonb, jsonb, jsonb
) to service_role;

create or replace function private.cleanup_multiplayer_data(p_batch_size integer default 500)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  deleted_archives integer := 0;
  deleted_limits integer := 0;
  deleted_rooms integer := 0;
begin
  if p_batch_size < 1 or p_batch_size > 10000 then
    raise exception using errcode = '22023', message = 'Invalid multiplayer cleanup batch size.';
  end if;

  with expired as (
    select id from public.multiplayer_rooms
    where expires_at <= now()
    order by expires_at
    limit p_batch_size
    for update skip locked
  )
  delete from public.multiplayer_rooms as room
  using expired
  where room.id = expired.id;
  get diagnostics deleted_rooms = row_count;

  with expired as (
    select id from private.multiplayer_hand_archives
    where completed_at < now() - interval '90 days'
    order by completed_at
    limit p_batch_size
    for update skip locked
  )
  delete from private.multiplayer_hand_archives as archive
  using expired
  where archive.id = expired.id;
  get diagnostics deleted_archives = row_count;

  with expired as (
    select user_id, operation, bucket_start
    from private.multiplayer_request_limits
    where bucket_start < now() - interval '1 day'
    order by bucket_start
    limit p_batch_size
    for update skip locked
  )
  delete from private.multiplayer_request_limits as request_limit
  using expired
  where request_limit.user_id = expired.user_id
    and request_limit.operation = expired.operation
    and request_limit.bucket_start = expired.bucket_start;
  get diagnostics deleted_limits = row_count;

  return jsonb_build_object(
    'deletedArchives', deleted_archives,
    'deletedLimits', deleted_limits,
    'deletedRooms', deleted_rooms
  );
end;
$$;

revoke execute on function private.cleanup_multiplayer_data(integer)
  from public, anon, authenticated;
grant execute on function private.cleanup_multiplayer_data(integer) to service_role;

create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  if not exists (
    select 1 from cron.job where jobname = 'rivermind-multiplayer-cleanup'
  ) then
    perform cron.schedule(
      'rivermind-multiplayer-cleanup',
      '17 * * * *',
      $job$select private.cleanup_multiplayer_data(1000);$job$
    );
  end if;
end;
$$;
