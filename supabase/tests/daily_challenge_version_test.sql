begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(5);

select has_table('public', 'daily_challenge_results', 'Daily Challenge results table exists');

select is(
  (
    select array_agg(attribute.attname order by key_column.ordinality)::text
    from pg_constraint as constraint_row
    cross join unnest(constraint_row.conkey) with ordinality as key_column(attnum, ordinality)
    join pg_attribute as attribute
      on attribute.attrelid = constraint_row.conrelid
      and attribute.attnum = key_column.attnum
    where constraint_row.conrelid = 'public.daily_challenge_results'::regclass
      and constraint_row.contype = 'p'
  ),
  '{user_id,challenge_date,challenge_version}',
  'Daily Challenge identity includes gameplay version'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.daily_challenge_results'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ~ 'challenge_version >= 1'
  ),
  'positive future Daily Challenge versions are accepted'
);

insert into auth.users (id, is_anonymous)
values ('33333333-3333-4333-8333-333333333333', true);

insert into public.daily_challenge_results (
  user_id,
  challenge_date,
  challenge_version,
  best_score,
  best_place,
  best_hands,
  attempts,
  completed_at
)
values
  ('33333333-3333-4333-8333-333333333333', '2026-08-14', 1, 70, 2, 12, 1, now()),
  ('33333333-3333-4333-8333-333333333333', '2026-08-14', 2, 100, 1, 10, 1, now());

select is(
  (
    select count(*)
    from public.daily_challenge_results
    where user_id = '33333333-3333-4333-8333-333333333333'
      and challenge_date = '2026-08-14'
  ),
  2::bigint,
  'two gameplay versions on one UTC date remain separate'
);

select throws_ok(
  $$
    insert into public.daily_challenge_results (
      user_id, challenge_date, challenge_version, best_score, best_place,
      best_hands, attempts, completed_at
    ) values (
      '33333333-3333-4333-8333-333333333333', '2026-08-14', 2,
      100, 1, 8, 1, now()
    )
  $$,
  '23505',
  null,
  'one personal best exists per owner, date, and gameplay version'
);

select * from finish();
rollback;
