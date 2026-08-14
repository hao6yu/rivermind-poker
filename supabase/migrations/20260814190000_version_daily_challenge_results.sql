alter table public.daily_challenge_results
  drop constraint daily_challenge_results_pkey,
  drop constraint daily_challenge_results_challenge_version_check;

alter table public.daily_challenge_results
  add constraint daily_challenge_results_challenge_version_check
    check (challenge_version >= 1),
  add constraint daily_challenge_results_pkey
    primary key (user_id, challenge_date, challenge_version);

comment on table public.daily_challenge_results is
  'Owner-scoped personal best and attempt count for each versioned RiverMind UTC Daily Challenge.';

comment on column public.daily_challenge_results.challenge_version is
  'Gameplay contract version; different versions on the same UTC date remain separate events.';
