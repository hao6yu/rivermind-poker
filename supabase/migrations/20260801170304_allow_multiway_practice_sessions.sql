alter table public.practice_sessions
  drop constraint if exists practice_sessions_mode_check;

alter table public.practice_sessions
  add constraint practice_sessions_mode_check
  check (mode in ('heads_up', 'multiway'));

comment on table public.practice_sessions is
  'Owner-scoped RiverMind heads-up and local multiway AI practice sessions.';
