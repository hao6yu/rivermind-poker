create table public.beta_feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category text not null check (category in ('gameplay', 'coach', 'ui', 'bug', 'other')),
  message text not null check (char_length(trim(message)) between 3 and 2000),
  screen text not null check (char_length(screen) between 1 and 64),
  hand_client_id text check (hand_client_id is null or char_length(hand_client_id) between 1 and 180),
  app_version text not null check (char_length(app_version) between 1 and 32),
  build_number text check (build_number is null or char_length(build_number) between 1 and 32),
  platform text not null check (platform in ('ios', 'android', 'web', 'unknown')),
  diagnostic_version smallint not null default 1 check (diagnostic_version = 1),
  diagnostics jsonb not null default '{}'::jsonb check (
    jsonb_typeof(diagnostics) = 'object'
    and octet_length(diagnostics::text) <= 12000
  ),
  status text not null default 'new' check (status in ('new', 'reviewed', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.beta_feedback is
  'Private RiverMind beta reports with bounded, user-approved diagnostic context. Mobile clients can insert only.';
comment on column public.beta_feedback.diagnostics is
  'Bounded app diagnostics. Hand context is included only when the tester explicitly enables it.';

create index beta_feedback_user_created_idx
  on public.beta_feedback (user_id, created_at desc);
create index beta_feedback_status_created_idx
  on public.beta_feedback (status, created_at desc);

alter table public.beta_feedback enable row level security;

revoke all on table public.beta_feedback from public, anon, authenticated;
revoke all on sequence public.beta_feedback_id_seq from public, anon, authenticated;

grant insert on table public.beta_feedback to authenticated;
grant usage, select on sequence public.beta_feedback_id_seq to authenticated;
grant select, insert, update, delete on table public.beta_feedback to service_role;
grant usage, select on sequence public.beta_feedback_id_seq to service_role;

create policy "Users can submit their own beta feedback"
  on public.beta_feedback
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);
