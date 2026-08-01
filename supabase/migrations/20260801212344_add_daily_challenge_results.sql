create table public.daily_challenge_results (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  challenge_date date not null,
  challenge_version smallint not null default 1 check (challenge_version = 1),
  best_score smallint not null check (best_score in (40, 70, 100)),
  best_place smallint not null check (best_place between 1 and 3),
  best_hands integer not null check (best_hands between 1 and 500),
  attempts integer not null default 1 check (attempts >= 1),
  completed_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, challenge_date),
  constraint daily_challenge_score_matches_place check (
    (best_place = 1 and best_score = 100)
    or (best_place = 2 and best_score = 70)
    or (best_place = 3 and best_score = 40)
  )
);

comment on table public.daily_challenge_results is
  'Owner-scoped personal best and attempt count for each RiverMind UTC Daily Challenge.';
comment on column public.daily_challenge_results.best_hands is
  'Hands played by the best-scoring attempt; fewer hands breaks equal-placement ties.';

create index daily_challenge_results_user_updated_idx
  on public.daily_challenge_results (user_id, updated_at desc);

alter table public.daily_challenge_results enable row level security;

revoke all on table public.daily_challenge_results from public, anon, authenticated;
grant select, insert, update, delete on table public.daily_challenge_results to authenticated;
grant select, insert, update, delete on table public.daily_challenge_results to service_role;

create policy "Users can read their own daily challenge results"
  on public.daily_challenge_results
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own daily challenge results"
  on public.daily_challenge_results
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own daily challenge results"
  on public.daily_challenge_results
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own daily challenge results"
  on public.daily_challenge_results
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
