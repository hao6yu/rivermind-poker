create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create or replace function private.multiplayer_snapshot_is_redacted(snapshot jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select
    jsonb_typeof(snapshot) = 'object'
    and coalesce(snapshot->>'roomCode', '') = ''
    and not jsonb_path_exists(snapshot, '$.**.userId ? (@.type() == "string")')
    and not jsonb_path_exists(snapshot, '$.**.deck[*]')
    and not jsonb_path_exists(snapshot, '$.**.holeCards[*]');
$$;

revoke execute on function private.multiplayer_snapshot_is_redacted(jsonb)
  from public, anon, authenticated;
grant execute on function private.multiplayer_snapshot_is_redacted(jsonb)
  to service_role;

create table public.multiplayer_rooms (
  id uuid primary key,
  host_player_id text check (
    host_player_id is null or char_length(host_player_id) between 1 and 128
  ),
  status text not null default 'lobby' check (
    status in ('lobby', 'playing', 'between-hands', 'paused', 'complete')
  ),
  seat_count smallint not null check (seat_count in (2, 3, 6)),
  starting_stack_chips integer not null check (starting_stack_chips > 0),
  small_blind_chips integer not null check (small_blind_chips > 0),
  big_blind_chips integer not null check (big_blind_chips >= small_blind_chips),
  hand_target text not null check (hand_target in ('5', '10', 'open')),
  turn_seconds smallint not null check (turn_seconds in (30, 45, 60)),
  ai_difficulty text not null check (ai_difficulty in ('friendly', 'club', 'sharp', 'elite', 'nemesis')),
  hand_number integer not null default 0 check (hand_number >= 0),
  state_version bigint not null default 0 check (state_version >= 0),
  public_snapshot jsonb not null default '{}'::jsonb check (
    octet_length(public_snapshot::text) <= 1000000
    and private.multiplayer_snapshot_is_redacted(public_snapshot)
  ),
  turn_deadline_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint multiplayer_rooms_blinds_fit_stack check (starting_stack_chips >= big_blind_chips),
  constraint multiplayer_rooms_expiry_after_creation check (expires_at > created_at)
);

create table public.multiplayer_seats (
  room_id uuid not null references public.multiplayer_rooms (id) on delete cascade,
  seat_index smallint not null,
  player_id text not null check (char_length(player_id) between 1 and 128),
  occupant_kind text not null check (occupant_kind in ('human', 'ai')),
  ai_profile_id text check (ai_profile_id is null or char_length(ai_profile_id) between 1 and 128),
  display_name text not null check (char_length(trim(display_name)) between 2 and 18),
  ready boolean not null default false,
  connection_state text not null default 'online' check (connection_state in ('online', 'offline')),
  control_state text not null check (control_state in ('human', 'ai')),
  missed_turns smallint not null default 0 check (missed_turns between 0 and 32767),
  stack_chips integer check (stack_chips is null or stack_chips >= 0),
  joined_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (room_id, seat_index),
  unique (room_id, player_id),
  constraint multiplayer_seats_ai_profile_shape check (
    (occupant_kind = 'human' and ai_profile_id is null)
    or (occupant_kind = 'ai' and ai_profile_id is not null)
  )
);

create table public.multiplayer_actions (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.multiplayer_rooms (id) on delete cascade,
  state_version bigint not null check (state_version > 0),
  action_sequence smallint not null check (action_sequence > 0),
  hand_number integer not null check (hand_number > 0),
  player_id text not null check (char_length(player_id) between 1 and 128),
  street text not null check (street in ('preflop', 'flop', 'turn', 'river', 'complete')),
  action_type text not null check (action_type in ('fold', 'check', 'call', 'raise')),
  amount integer not null check (amount >= 0),
  pot_after integer not null check (pot_after >= 0),
  created_at timestamptz not null default now(),
  unique (room_id, state_version, action_sequence)
);

create table private.multiplayer_room_members (
  room_id uuid not null references public.multiplayer_rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  player_id text not null check (char_length(player_id) between 1 and 128),
  joined_at timestamptz not null,
  primary key (room_id, user_id),
  unique (room_id, player_id)
);

create table private.multiplayer_room_secrets (
  room_id uuid primary key references public.multiplayer_rooms (id) on delete cascade,
  room_code_hash text not null unique check (room_code_hash ~ '^[0-9a-f]{64}$'),
  code_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint multiplayer_room_secrets_expiry check (code_expires_at > created_at)
);

create table private.multiplayer_game_states (
  room_id uuid primary key references public.multiplayer_rooms (id) on delete cascade,
  state_version bigint not null check (state_version >= 0),
  canonical_state jsonb not null check (
    jsonb_typeof(canonical_state) = 'object'
    and octet_length(canonical_state::text) <= 4000000
  ),
  updated_at timestamptz not null default now()
);

comment on table public.multiplayer_rooms is
  'Member-readable private-table lifecycle and fully redacted public snapshot. Never stores room codes or hidden cards.';
comment on table public.multiplayer_seats is
  'Member-readable canonical seats without human Supabase user IDs.';
comment on table public.multiplayer_actions is
  'Public poker actions only. No cards, deck, equity estimates, or AI private reasoning.';
comment on table private.multiplayer_room_members is
  'Server-managed room membership and anonymous user ownership. Not exposed through the Data API.';
comment on table private.multiplayer_room_secrets is
  'SHA-256 room-code locators. Plaintext six-digit room codes are never persisted.';
comment on table private.multiplayer_game_states is
  'Canonical coordinator state containing the deck and all private cards. Service role only.';

create index multiplayer_rooms_active_updated_idx
  on public.multiplayer_rooms (updated_at desc)
  where status <> 'complete';
create index multiplayer_rooms_expiry_idx
  on public.multiplayer_rooms (expires_at);
create index multiplayer_seats_room_kind_idx
  on public.multiplayer_seats (room_id, occupant_kind);
create index multiplayer_actions_room_hand_idx
  on public.multiplayer_actions (room_id, hand_number, state_version, action_sequence);
create index multiplayer_room_members_user_idx
  on private.multiplayer_room_members (user_id, room_id);
create index multiplayer_room_secrets_expiry_idx
  on private.multiplayer_room_secrets (code_expires_at);

alter table public.multiplayer_rooms enable row level security;
alter table public.multiplayer_seats enable row level security;
alter table public.multiplayer_actions enable row level security;
alter table private.multiplayer_room_members enable row level security;
alter table private.multiplayer_room_secrets enable row level security;
alter table private.multiplayer_game_states enable row level security;

revoke all on table
  public.multiplayer_rooms,
  public.multiplayer_seats,
  public.multiplayer_actions
from public, anon, authenticated;
revoke all on sequence public.multiplayer_actions_id_seq from public, anon, authenticated;

grant select on table
  public.multiplayer_rooms,
  public.multiplayer_seats,
  public.multiplayer_actions
to authenticated;
grant select, insert, update, delete on table
  public.multiplayer_rooms,
  public.multiplayer_seats,
  public.multiplayer_actions
to service_role;
grant usage, select on sequence public.multiplayer_actions_id_seq to service_role;

revoke all on table
  private.multiplayer_room_members,
  private.multiplayer_room_secrets,
  private.multiplayer_game_states
from public, anon, authenticated;
grant select, insert, update, delete on table
  private.multiplayer_room_members,
  private.multiplayer_room_secrets,
  private.multiplayer_game_states
to service_role;

create or replace function private.is_multiplayer_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.multiplayer_room_members as member
    where member.room_id = target_room_id
      and member.user_id = (select auth.uid())
  );
$$;

create or replace function private.can_receive_multiplayer_topic(topic_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if topic_name !~ '^room:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return false;
  end if;

  return exists (
    select 1
    from private.multiplayer_room_members as member
    where member.room_id = split_part(topic_name, ':', 2)::uuid
      and member.user_id = (select auth.uid())
  );
end;
$$;

revoke execute on function private.is_multiplayer_room_member(uuid)
  from public, anon, authenticated;
revoke execute on function private.can_receive_multiplayer_topic(text)
  from public, anon, authenticated;
grant execute on function private.is_multiplayer_room_member(uuid)
  to authenticated, service_role;
grant execute on function private.can_receive_multiplayer_topic(text)
  to authenticated, service_role;

create policy "Room members can read multiplayer rooms"
  on public.multiplayer_rooms
  for select
  to authenticated
  using (private.is_multiplayer_room_member(id));

create policy "Room members can read multiplayer seats"
  on public.multiplayer_seats
  for select
  to authenticated
  using (private.is_multiplayer_room_member(room_id));

create policy "Room members can read multiplayer actions"
  on public.multiplayer_actions
  for select
  to authenticated
  using (private.is_multiplayer_room_member(room_id));

create policy "Room members can receive multiplayer broadcasts"
  on realtime.messages
  for select
  to authenticated
  using (private.can_receive_multiplayer_topic((select realtime.topic())));

create or replace function public.multiplayer_create_room(
  p_room_id uuid,
  p_room_code_hash text,
  p_host_user_id uuid,
  p_host_player_id text,
  p_host_display_name text,
  p_host_seat smallint,
  p_config jsonb,
  p_canonical_state jsonb,
  p_public_snapshot jsonb,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_room public.multiplayer_rooms;
  joined_at timestamptz := to_timestamp((p_canonical_state->>'createdAtMs')::double precision / 1000.0);
begin
  if p_host_seat < 0 or p_host_seat >= (p_config->>'seatCount')::smallint then
    raise exception using errcode = '22023', message = 'Host seat is outside the room.';
  end if;

  insert into public.multiplayer_rooms (
    id,
    host_player_id,
    status,
    seat_count,
    starting_stack_chips,
    small_blind_chips,
    big_blind_chips,
    hand_target,
    turn_seconds,
    ai_difficulty,
    state_version,
    public_snapshot,
    expires_at
  ) values (
    p_room_id,
    p_host_player_id,
    'lobby',
    (p_config->>'seatCount')::smallint,
    (p_config->>'startingStackChips')::integer,
    (p_config->>'smallBlindChips')::integer,
    (p_config->>'bigBlindChips')::integer,
    p_config->>'handTarget',
    (p_config->>'turnSeconds')::smallint,
    p_config->>'aiDifficulty',
    0,
    p_public_snapshot,
    p_expires_at
  ) returning * into created_room;

  insert into public.multiplayer_seats (
    room_id,
    seat_index,
    player_id,
    occupant_kind,
    display_name,
    ready,
    connection_state,
    control_state,
    missed_turns,
    stack_chips,
    joined_at
  ) values (
    p_room_id,
    p_host_seat,
    p_host_player_id,
    'human',
    trim(p_host_display_name),
    false,
    'online',
    'human',
    0,
    (p_config->>'startingStackChips')::integer,
    joined_at
  );

  insert into private.multiplayer_room_members (room_id, user_id, player_id, joined_at)
  values (p_room_id, p_host_user_id, p_host_player_id, joined_at);

  insert into private.multiplayer_room_secrets (room_id, room_code_hash, code_expires_at)
  values (p_room_id, p_room_code_hash, least(p_expires_at, now() + interval '30 minutes'));

  insert into private.multiplayer_game_states (room_id, state_version, canonical_state)
  values (p_room_id, 0, p_canonical_state);

  return to_jsonb(created_room);
end;
$$;

create or replace function public.multiplayer_load_private_room(p_room_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select state.canonical_state
  from private.multiplayer_game_states as state
  join public.multiplayer_rooms as room on room.id = state.room_id
  where state.room_id = p_room_id
    and room.expires_at > now();
$$;

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
    and room.expires_at > now()
    and room.status = 'lobby';
$$;

create or replace function public.multiplayer_commit_transition(
  p_room_id uuid,
  p_expected_version bigint,
  p_canonical_state jsonb,
  p_public_snapshot jsonb,
  p_public_actions jsonb,
  p_public_transition jsonb
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  action jsonb;
  action_index integer := 0;
  current_version bigint;
  new_version bigint := (p_canonical_state->>'version')::bigint;
  room_hand_number integer := coalesce((p_canonical_state->'hand'->>'handNumber')::integer, 0);
  room_status text := p_canonical_state->>'status';
  seat jsonb;
  seat_stack integer;
begin
  if jsonb_typeof(p_public_actions) <> 'array' then
    raise exception using errcode = '22023', message = 'Public actions must be a JSON array.';
  end if;
  if new_version <> p_expected_version + 1 then
    raise exception using errcode = '22023', message = 'Canonical state version is not the next expected version.';
  end if;

  select room.state_version
    into current_version
    from public.multiplayer_rooms as room
    where room.id = p_room_id
    for update;

  if current_version is null then
    raise exception using errcode = 'P0002', message = 'Multiplayer room was not found.';
  end if;
  if current_version <> p_expected_version then
    raise exception using errcode = '40001', message = 'Multiplayer room version is stale.';
  end if;

  update public.multiplayer_rooms
    set host_player_id = nullif(p_canonical_state->>'hostPlayerId', ''),
        status = room_status,
        hand_number = room_hand_number,
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
      room_id,
      seat_index,
      player_id,
      occupant_kind,
      ai_profile_id,
      display_name,
      ready,
      connection_state,
      control_state,
      missed_turns,
      stack_chips,
      joined_at,
      updated_at
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
      room_id,
      state_version,
      action_sequence,
      hand_number,
      player_id,
      street,
      action_type,
      amount,
      pot_after
    ) values (
      p_room_id,
      new_version,
      action_index,
      room_hand_number,
      action->>'playerId',
      action->>'street',
      action->>'type',
      (action->>'amount')::integer,
      (action->>'potAfter')::integer
    );
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

revoke execute on function public.multiplayer_create_room(
  uuid, text, uuid, text, text, smallint, jsonb, jsonb, jsonb, timestamptz
) from public, anon, authenticated;
revoke execute on function public.multiplayer_load_private_room(uuid)
  from public, anon, authenticated;
revoke execute on function public.multiplayer_load_joinable_room(text)
  from public, anon, authenticated;
revoke execute on function public.multiplayer_commit_transition(
  uuid, bigint, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.multiplayer_create_room(
  uuid, text, uuid, text, text, smallint, jsonb, jsonb, jsonb, timestamptz
) to service_role;
grant execute on function public.multiplayer_load_private_room(uuid)
  to service_role;
grant execute on function public.multiplayer_load_joinable_room(text)
  to service_role;
grant execute on function public.multiplayer_commit_transition(
  uuid, bigint, jsonb, jsonb, jsonb, jsonb
) to service_role;
