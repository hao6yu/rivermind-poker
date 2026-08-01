create table public.learning_progress (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  activity_id text not null check (char_length(activity_id) between 1 and 80),
  activity_type text not null check (
    activity_type in ('lesson', 'percentage_drill', 'hand_quiz')
  ),
  status text not null default 'started' check (status in ('started', 'completed')),
  best_score smallint check (best_score between 0 and 100),
  attempts integer not null default 0 check (attempts >= 0),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, activity_id),
  constraint learning_progress_completion_consistent check (
    (status = 'started' and completed_at is null)
    or (status = 'completed' and completed_at is not null)
  )
);

comment on table public.learning_progress is
  'Owner-scoped completion and best scores for RiverMind lessons and learning drills.';

create index learning_progress_user_recent_idx
  on public.learning_progress (user_id, updated_at desc);

alter table public.learning_progress enable row level security;

revoke all on table public.learning_progress from anon;
grant select, insert, update, delete on table public.learning_progress to authenticated;
grant select, insert, update, delete on table public.learning_progress to service_role;

create policy "Users can read their own learning progress"
  on public.learning_progress
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own learning progress"
  on public.learning_progress
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own learning progress"
  on public.learning_progress
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own learning progress"
  on public.learning_progress
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
