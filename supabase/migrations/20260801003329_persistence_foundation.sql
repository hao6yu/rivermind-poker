create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id text not null check (char_length(client_id) between 1 and 128),
  mode text not null default 'heads_up' check (mode in ('heads_up')),
  ai_difficulty text not null default 'club' check (ai_difficulty in ('friendly', 'club', 'sharp')),
  coach_enabled boolean not null default true,
  started_at timestamptz not null default now(),
  last_played_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint practice_sessions_user_client_key unique (user_id, client_id),
  constraint practice_sessions_id_user_key unique (id, user_id),
  constraint practice_sessions_valid_end check (ended_at is null or ended_at >= started_at)
);

create table public.practice_hands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null,
  client_id text not null check (char_length(client_id) between 1 and 180),
  hand_number integer not null check (hand_number > 0),
  outcome_winner text not null check (outcome_winner in ('hero', 'villain', 'tie')),
  showdown boolean not null,
  pot_won integer not null check (pot_won >= 0),
  game_state jsonb not null check (jsonb_typeof(game_state) = 'object'),
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint practice_hands_session_owner_fk
    foreign key (session_id, user_id)
    references public.practice_sessions (id, user_id)
    on delete cascade,
  constraint practice_hands_user_client_key unique (user_id, client_id),
  constraint practice_hands_session_number_key unique (session_id, hand_number),
  constraint practice_hands_id_user_key unique (id, user_id)
);

create table public.hand_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  hand_id uuid not null unique,
  analysis_version integer not null default 1 check (analysis_version = 1),
  hand_grade text not null check (hand_grade in ('strong', 'close', 'mistake')),
  focus_area text not null check (
    focus_area in ('none', 'preflop', 'value-betting', 'bluffing', 'calling', 'bet-sizing', 'pot-odds', 'draws')
  ),
  focus_decision_sequence integer not null check (focus_decision_sequence between 0 and 40),
  review jsonb not null check (jsonb_typeof(review) = 'object'),
  verified_analysis jsonb not null check (jsonb_typeof(verified_analysis) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hand_reviews_hand_owner_fk
    foreign key (hand_id, user_id)
    references public.practice_hands (id, user_id)
    on delete cascade
);

comment on table public.practice_sessions is
  'Owner-scoped RiverMind heads-up practice sessions.';
comment on table public.practice_hands is
  'Completed practice hands. game_state must omit the deck and any opponent cards not revealed at showdown.';
comment on table public.hand_reviews is
  'Verified deterministic analysis and bounded AI explanations for completed practice hands.';

create index practice_sessions_user_recent_idx
  on public.practice_sessions (user_id, last_played_at desc);
create index practice_hands_user_recent_idx
  on public.practice_hands (user_id, completed_at desc);
create index hand_reviews_user_recent_idx
  on public.hand_reviews (user_id, created_at desc);

alter table public.practice_sessions enable row level security;
alter table public.practice_hands enable row level security;
alter table public.hand_reviews enable row level security;

revoke all on table public.practice_sessions, public.practice_hands, public.hand_reviews from anon;
grant select, insert, update, delete on table
  public.practice_sessions,
  public.practice_hands,
  public.hand_reviews
to authenticated;
grant select, insert, update, delete on table
  public.practice_sessions,
  public.practice_hands,
  public.hand_reviews
to service_role;

create policy "Users can read their own practice sessions"
  on public.practice_sessions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own practice sessions"
  on public.practice_sessions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own practice sessions"
  on public.practice_sessions
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own practice sessions"
  on public.practice_sessions
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can read their own practice hands"
  on public.practice_hands
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own practice hands"
  on public.practice_hands
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own practice hands"
  on public.practice_hands
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own practice hands"
  on public.practice_hands
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can read their own hand reviews"
  on public.hand_reviews
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own hand reviews"
  on public.hand_reviews
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own hand reviews"
  on public.hand_reviews
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own hand reviews"
  on public.hand_reviews
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
