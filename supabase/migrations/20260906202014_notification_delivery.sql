-- All delivery tables are service-only. The authenticated Edge endpoint binds
-- the caller's verified identity; mobile clients never receive tokens/history.
create table public.notification_recipients (
  user_id uuid primary key references auth.users(id) on delete cascade,
  installation_id uuid not null,
  expo_token text not null unique check (expo_token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'),
  platform text not null check (platform in ('ios', 'android')),
  locale text not null check (locale in ('en', 'zh-Hans', 'zh-Hant')),
  timezone text not null,
  app_version text not null check (app_version ~ '^\d+\.\d+\.\d+$'),
  tips boolean not null default false,
  quick_play boolean not null default false,
  releases boolean not null default false,
  permission_granted boolean not null default false,
  consent_version text not null,
  last_active_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_content (
  id text primary key,
  kind text not null check (kind in ('tip', 'quick_play', 'release')),
  copy jsonb not null,
  target text not null check (target in ('learn', 'play', 'whats_new')),
  release_version text check (release_version ~ '^\d+\.\d+\.\d+$'),
  platforms text[] not null default array['ios','android'] check (platforms <@ array['ios','android'] and cardinality(platforms)>0),
  enabled boolean not null default false,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  check ((kind = 'release') = (release_version is not null)),
  check ((kind = 'release' and target = 'whats_new') or (kind = 'tip' and target = 'learn') or (kind = 'quick_play' and target = 'play'))
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_id text not null references public.notification_content(id),
  installation_id uuid not null,
  release_version text,
  status text not null default 'claimed' check (status in ('claimed','sending','accepted','handed_off','failed','unknown','skipped')),
  created_at timestamptz not null default now(),
  attempted_at timestamptz,
  token_fingerprint text,
  receipt_id text,
  receipt_checked_at timestamptz,
  error_code text,
  unique (user_id, content_id)
);
create index notification_deliveries_user_time on public.notification_deliveries(user_id, created_at desc);
create index notification_deliveries_receipts on public.notification_deliveries(created_at) where status = 'accepted';
create unique index notification_deliveries_release_once on public.notification_deliveries(user_id,release_version) where release_version is not null;
create index notification_recipients_active on public.notification_recipients(last_active_at) where permission_granted;

-- Explicit, initially empty test audience. Production sending needs an
-- operator-controlled rollout switch; no migration enables a campaign.
create table public.notification_rollout (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  production_enabled boolean not null default false,
  test_user_ids uuid[] not null default '{}'
);
insert into public.notification_rollout(singleton) values (true);

alter table public.notification_recipients enable row level security;
alter table public.notification_content enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_rollout enable row level security;
revoke all on public.notification_recipients, public.notification_content, public.notification_deliveries, public.notification_rollout from anon, authenticated;
grant all on public.notification_recipients, public.notification_content, public.notification_deliveries, public.notification_rollout to service_role;

create or replace function public.register_notification_device(p_user_id uuid, p_device jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from pg_timezone_names where name = p_device->>'timezone') then
    raise exception 'Invalid timezone';
  end if;
  insert into public.notification_recipients(user_id, installation_id, expo_token, platform, locale, timezone, app_version,
    tips, quick_play, releases, permission_granted, consent_version)
  values (p_user_id, (p_device->>'installationId')::uuid, p_device->>'token', p_device->>'platform', p_device->>'locale',
    p_device->>'timezone', p_device->>'appVersion', (p_device->>'tips')::boolean, (p_device->>'quickPlay')::boolean,
    (p_device->>'releases')::boolean, (p_device->>'permissionGranted')::boolean, p_device->>'consentVersion')
  on conflict(user_id) do update set installation_id = excluded.installation_id, expo_token = excluded.expo_token,
    platform = excluded.platform, locale = excluded.locale, timezone = excluded.timezone, app_version = excluded.app_version,
    tips = excluded.tips, quick_play = excluded.quick_play, releases = excluded.releases,
    permission_granted = excluded.permission_granted, consent_version = excluded.consent_version,
    last_active_at = now(), updated_at = now();
end $$;

-- A dedicated disable route works without permission or fetching a new token.
-- A stale installation must not disable the user's newer active device.
create or replace function public.disable_notification_device(p_user_id uuid, p_installation_id uuid)
returns void language sql security invoker set search_path = '' as $$
  update public.notification_recipients set permission_granted = false, updated_at = now()
  where user_id = p_user_id and installation_id = p_installation_id;
$$;

create or replace function public.claim_notification_batch(p_limit integer default 50)
returns setof uuid language plpgsql security invoker set search_path = '' as $$
declare r public.notification_recipients; c public.notification_content; delivery_id uuid; last_kind text;
begin
  for r in
    select n.* from public.notification_recipients n
    cross join public.notification_rollout rollout
    where rollout.enabled and (rollout.production_enabled or n.user_id = any(rollout.test_user_ids))
      and n.permission_granted and (n.tips or n.quick_play or n.releases)
      and n.last_active_at <= now() - interval '72 hours'
      and n.last_active_at >= now() - interval '90 days'
      and extract(hour from now() at time zone n.timezone) = 18
      and not exists(select 1 from public.notification_deliveries d where d.user_id=n.user_id and d.created_at>now()-interval '72 hours')
      and (select count(*) from public.notification_deliveries d where d.user_id=n.user_id and d.created_at>now()-interval '7 days')<2
      and (select count(*) from public.notification_deliveries d where d.user_id=n.user_id and d.created_at>=n.last_active_at)<2
      and exists(select 1 from public.notification_content m where m.enabled and m.starts_at<=now()
        and (m.expires_at is null or m.expires_at>now()) and m.copy ? n.locale and n.platform=any(m.platforms)
        and ((m.kind='tip' and n.tips) or (m.kind='quick_play' and n.quick_play)
          or (m.kind='release' and n.releases and string_to_array(n.app_version,'.')::int[]<string_to_array(m.release_version,'.')::int[]))
        and not exists(select 1 from public.notification_deliveries d where d.user_id=n.user_id and (d.content_id=m.id or d.release_version=m.release_version)))
    order by n.last_active_at limit least(greatest(p_limit, 1), 100)
    for update of n skip locked
  loop
    -- Rechecked under a per-user lock: simultaneous workers cannot select two
    -- messages for this person. Claims count too, including crashed workers.
    if exists (select 1 from public.notification_deliveries d where d.user_id = r.user_id and d.created_at > now() - interval '72 hours')
      or (select count(*) from public.notification_deliveries d where d.user_id = r.user_id and d.created_at > now() - interval '7 days') >= 2
      or (select count(*) from public.notification_deliveries d where d.user_id = r.user_id and d.created_at >= r.last_active_at) >= 2 then
      continue;
    end if;
    select m.kind into last_kind from public.notification_deliveries d join public.notification_content m on m.id = d.content_id
      where d.user_id = r.user_id order by d.created_at desc limit 1;
    select m.* into c from public.notification_content m
    where m.enabled and m.starts_at <= now() and (m.expires_at is null or m.expires_at > now())
      and m.copy ? r.locale and r.platform=any(m.platforms)
      and ((m.kind = 'tip' and r.tips) or (m.kind = 'quick_play' and r.quick_play)
        or (m.kind = 'release' and r.releases and string_to_array(r.app_version,'.')::int[] < string_to_array(m.release_version,'.')::int[]))
      and not exists(select 1 from public.notification_deliveries d where d.user_id = r.user_id and (d.content_id = m.id or d.release_version=m.release_version))
    order by (m.kind = 'release') desc, (m.kind = coalesce(last_kind,'')), md5(r.user_id::text || ':' || m.id)
    limit 1;
    if found then
      insert into public.notification_deliveries(user_id,content_id,installation_id,release_version)
      values(r.user_id,c.id,r.installation_id,c.release_version) returning id into delivery_id;
      return next delivery_id;
    end if;
  end loop;
end $$;

-- Consume the attempt BEFORE contacting Expo. A timeout/crash never makes it
-- eligible to send again. Recheck activity/preferences just before dispatch.
create or replace function public.begin_notification_send(p_delivery_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare d public.notification_deliveries; r public.notification_recipients; c public.notification_content;
begin
  select * into d from public.notification_deliveries where id = p_delivery_id;
  if not found then return null; end if;
  select * into r from public.notification_recipients where user_id = d.user_id for update;
  select * into d from public.notification_deliveries where id = p_delivery_id for update;
  if d.status <> 'claimed' then return null; end if;
  select * into c from public.notification_content where id = d.content_id;
  if r.user_id is null or not r.permission_granted or r.installation_id <> d.installation_id
    or r.last_active_at > now() - interval '72 hours' or not c.enabled
    or extract(hour from now() at time zone r.timezone) <> 18
    or c.starts_at > now() or (c.expires_at is not null and c.expires_at <= now())
    or not r.platform=any(c.platforms)
    or coalesce(length(c.copy->r.locale->>'title'),0)=0
    or coalesce(length(c.copy->r.locale->>'body'),0)=0
    or not ((c.kind='tip' and r.tips) or (c.kind='quick_play' and r.quick_play)
      or (c.kind='release' and r.releases and string_to_array(r.app_version,'.')::int[] < string_to_array(c.release_version,'.')::int[]))
    or not exists(select 1 from public.notification_rollout s where s.enabled and (s.production_enabled or r.user_id=any(s.test_user_ids))) then
    update public.notification_deliveries set status='skipped' where id=d.id;
    return null;
  end if;
  update public.notification_deliveries set status='sending', attempted_at=now(), token_fingerprint=md5(r.expo_token) where id=d.id;
  return jsonb_build_object('id',d.id,'to',r.expo_token,'messageId',c.id,'title',c.copy->r.locale->>'title',
    'body',c.copy->r.locale->>'body','target',c.target,'releaseVersion',c.release_version);
end $$;

create or replace function public.invalidate_notification_device(p_delivery_id uuid)
returns void language sql security invoker set search_path = '' as $$
  update public.notification_recipients r set permission_granted=false,updated_at=now()
  from public.notification_deliveries d where d.id=p_delivery_id and r.user_id=d.user_id
    and r.installation_id=d.installation_id and md5(r.expo_token)=d.token_fingerprint;
$$;

revoke execute on function public.register_notification_device(uuid,jsonb), public.disable_notification_device(uuid,uuid),
  public.claim_notification_batch(integer), public.begin_notification_send(uuid),public.invalidate_notification_device(uuid) from public, anon, authenticated;
grant execute on function public.register_notification_device(uuid,jsonb), public.disable_notification_device(uuid,uuid),
  public.claim_notification_batch(integer), public.begin_notification_send(uuid),public.invalidate_notification_device(uuid) to service_role;

-- Curated starter pool. Stable IDs retain delivery history across copy edits.
insert into public.notification_content(id,kind,target,copy,enabled) values ('tip.position','tip','learn','{"en":{"title":"A quick poker tip","body":"Acting later gives you more information. Watch how position changes your next decision."},"zh-Hans":{"title":"扑克小贴士","body":"后行动能获得更多信息。试着观察位置如何影响你的下一步决定。"},"zh-Hant":{"title":"撲克小提示","body":"後行動能獲得更多資訊。試著觀察位置如何影響你的下一步決定。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('tip.starting-hands','tip','learn','{"en":{"title":"A quick poker tip","body":"You can fold before the flop. Choosing stronger starting hands makes later decisions easier."},"zh-Hans":{"title":"扑克小贴士","body":"翻牌前可以选择弃牌。选择更强的起手牌，能让后续决策更容易。"},"zh-Hant":{"title":"撲克小提示","body":"翻牌前可以選擇棄牌。選擇更強的起手牌，能讓後續決策更容易。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('tip.pot-odds','tip','learn','{"en":{"title":"A quick poker tip","body":"Before calling, compare the price of the call with the pot you could win."},"zh-Hans":{"title":"扑克小贴士","body":"跟注前，先比较跟注成本与你可能赢得的底池。"},"zh-Hant":{"title":"撲克小提示","body":"跟注前，先比較跟注成本與你可能贏得的底池。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('tip.ranges','tip','learn','{"en":{"title":"A quick poker tip","body":"Think about several hands your opponent could hold, rather than guessing one exact hand."},"zh-Hans":{"title":"扑克小贴士","body":"思考对手可能持有的一组手牌，而不是只猜某一手牌。"},"zh-Hant":{"title":"撲克小提示","body":"思考對手可能持有的一組手牌，而不是只猜某一手牌。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('tip.board-texture','tip','learn','{"en":{"title":"A quick poker tip","body":"Connected cards and matching suits create more possible draws. Read the board before acting."},"zh-Hans":{"title":"扑克小贴士","body":"相连的牌和同花色牌会带来更多听牌可能。行动前先观察牌面。"},"zh-Hant":{"title":"撲克小提示","body":"相連的牌與同花色牌會帶來更多聽牌可能。行動前先觀察牌面。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('tip.value','tip','learn','{"en":{"title":"A quick poker tip","body":"Before a value bet, ask: which weaker hands might call?"},"zh-Hans":{"title":"扑克小贴士","body":"价值下注前，问问自己：哪些更弱的手牌可能跟注？"},"zh-Hant":{"title":"撲克小提示","body":"價值下注前，問問自己：哪些更弱的手牌可能跟注？"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('tip.bluff','tip','learn','{"en":{"title":"A quick poker tip","body":"Before a bluff, ask: which stronger hands might fold?"},"zh-Hans":{"title":"扑克小贴士","body":"诈唬前，问问自己：哪些更强的手牌可能弃牌？"},"zh-Hant":{"title":"撲克小提示","body":"詐唬前，問問自己：哪些更強的手牌可能棄牌？"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('tip.effective-stack','tip','learn','{"en":{"title":"A quick poker tip","body":"The smaller stack limits how many chips two players can put at risk against each other."},"zh-Hans":{"title":"扑克小贴士","body":"两人对抗时，较小的筹码量决定双方最多能投入多少筹码。"},"zh-Hant":{"title":"撲克小提示","body":"兩人對抗時，較小的籌碼量決定雙方最多能投入多少籌碼。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('tip.plan','tip','learn','{"en":{"title":"A quick poker tip","body":"Before betting the flop, consider what you would do on a few different turn cards."},"zh-Hans":{"title":"扑克小贴士","body":"在翻牌下注前，想一想几种不同转牌出现时你会怎么做。"},"zh-Hant":{"title":"撲克小提示","body":"在翻牌下注前，想一想幾種不同轉牌出現時你會怎麼做。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('tip.check','tip','learn','{"en":{"title":"A quick poker tip","body":"Checking can keep weaker hands involved and control the pot. It is a useful option."},"zh-Hans":{"title":"扑克小贴士","body":"过牌可以让较弱的手牌继续参与，也能控制底池。它是一个有用的选择。"},"zh-Hant":{"title":"撲克小提示","body":"過牌可以讓較弱的手牌繼續參與，也能控制底池。它是一個有用的選擇。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('tip.review','tip','learn','{"en":{"title":"A quick poker tip","body":"Review one close decision. What information did you have when you acted?"},"zh-Hans":{"title":"扑克小贴士","body":"复盘一个难以取舍的决定：当时你掌握了哪些信息？"},"zh-Hant":{"title":"撲克小提示","body":"複盤一個難以取捨的決定：當時你掌握了哪些資訊？"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('tip.results','tip','learn','{"en":{"title":"A quick poker tip","body":"A good decision can lose a hand. Review the reasoning as well as the result."},"zh-Hans":{"title":"扑克小贴士","body":"好的决定也可能输掉一手牌。复盘时，既看结果，也看思路。"},"zh-Hant":{"title":"撲克小提示","body":"好的決定也可能輸掉一手牌。複盤時，既看結果，也看思路。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('tip.multiway','tip','learn','{"en":{"title":"A quick poker tip","body":"More players in the pot means more possible strong hands. Reconsider thin value bets."},"zh-Hans":{"title":"扑克小贴士","body":"底池中的玩家越多，出现强牌的可能性也越多。重新评估薄价值下注。"},"zh-Hant":{"title":"撲克小提示","body":"底池中的玩家越多，出現強牌的可能性也越多。重新評估薄價值下注。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('tip.river','tip','learn','{"en":{"title":"A quick poker tip","body":"There are no more cards after the river. Separate your value bets from your bluffs."},"zh-Hans":{"title":"扑克小贴士","body":"河牌之后不会再发公共牌。分清你的价值下注与诈唬。"},"zh-Hant":{"title":"撲克小提示","body":"河牌之後不會再發公共牌。分清你的價值下注與詐唬。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('tip.outs','tip','learn','{"en":{"title":"A quick poker tip","body":"Count the cards that improve your hand, then check whether they might also help your opponent."},"zh-Hans":{"title":"扑克小贴士","body":"数一数哪些牌能改善你的手牌，再想想它们是否也可能帮助对手。"},"zh-Hant":{"title":"撲克小提示","body":"數一數哪些牌能改善你的手牌，再想想它們是否也可能幫助對手。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('tip.bet-size','tip','learn','{"en":{"title":"A quick poker tip","body":"A larger bet gives the caller a worse price. Consider what your sizing asks them to do."},"zh-Hans":{"title":"扑克小贴士","body":"更大的下注会让跟注价格更高。想一想你的下注尺度会如何影响对手。"},"zh-Hant":{"title":"撲克小提示","body":"更大的下注會讓跟注價格更高。想一想你的下注尺度會如何影響對手。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('tip.observe','tip','learn','{"en":{"title":"A quick poker tip","body":"Notice how often an opponent calls, raises, or folds. Patterns take several hands to emerge."},"zh-Hans":{"title":"扑克小贴士","body":"留意对手跟注、加注和弃牌的频率。多观察几手，模式才会逐渐显现。"},"zh-Hant":{"title":"撲克小提示","body":"留意對手跟注、加注和棄牌的頻率。多觀察幾手，模式才會逐漸顯現。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('tip.kicker','tip','learn','{"en":{"title":"A quick poker tip","body":"When both players make the same pair, the remaining cards can decide the winner."},"zh-Hans":{"title":"扑克小贴士","body":"双方拿到相同对子时，其余的牌可能决定胜负。"},"zh-Hant":{"title":"撲克小提示","body":"雙方拿到相同對子時，其餘的牌可能決定勝負。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('tip.board-plays','tip','learn','{"en":{"title":"A quick poker tip","body":"Your best five-card hand can use both, one, or neither of your hole cards."},"zh-Hans":{"title":"扑克小贴士","body":"你的最佳五张牌组合可以使用两张、一张，甚至不使用任何底牌。"},"zh-Hant":{"title":"撲克小提示","body":"你的最佳五張牌組合可以使用兩張、一張，甚至不使用任何底牌。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('tip.fold','tip','learn','{"en":{"title":"A quick poker tip","body":"Chips already in the pot are committed. Base your next choice on the decision ahead."},"zh-Hans":{"title":"扑克小贴士","body":"已经投入底池的筹码无法收回。下一步应根据眼前的局面决定。"},"zh-Hant":{"title":"撲克小提示","body":"已經投入底池的籌碼無法收回。下一步應根據眼前的局面決定。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('tip.short-stack','tip','learn','{"en":{"title":"A quick poker tip","body":"Stack depth changes your options. Check your chips in big blinds before choosing a line."},"zh-Hans":{"title":"扑克小贴士","body":"筹码深度会改变你的选择。决定打法前，先看看自己还有多少个大盲。"},"zh-Hant":{"title":"撲克小提示","body":"籌碼深度會改變你的選擇。決定打法前，先看看自己還有多少個大盲。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('tip.draws','tip','learn','{"en":{"title":"A quick poker tip","body":"A draw has potential, but it is not a made hand yet. Consider both its price and its chances."},"zh-Hans":{"title":"扑克小贴士","body":"听牌有潜力，但还没有成牌。既要考虑成本，也要考虑完成的机会。"},"zh-Hant":{"title":"撲克小提示","body":"聽牌有潛力，但還沒有成牌。既要考慮成本，也要考慮完成的機會。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('tip.one-focus','tip','learn','{"en":{"title":"A quick poker tip","body":"Pick one skill for your next practice: position, hand selection, or bet sizing."},"zh-Hans":{"title":"扑克小贴士","body":"下一次练习只选一个重点：位置、起手牌选择，或下注尺度。"},"zh-Hant":{"title":"撲克小提示","body":"下一次練習只選一個重點：位置、起手牌選擇，或下注尺度。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('tip.pause','tip','learn','{"en":{"title":"A quick poker tip","body":"Take a breath before a close decision. A short pause can help you notice the details."},"zh-Hans":{"title":"扑克小贴士","body":"遇到难以取舍的决定时，先深呼吸。短暂停顿能帮你留意细节。"},"zh-Hant":{"title":"撲克小提示","body":"遇到難以取捨的決定時，先深呼吸。短暫停頓能幫你留意細節。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('quick_play.few-minutes','quick_play','play','{"en":{"title":"A few hands?","body":"Got a few minutes? A couple of practice hands are ready when you are."},"zh-Hans":{"title":"来玩几手？","body":"有几分钟空闲吗？随时来练习几手牌。"},"zh-Hant":{"title":"來玩幾手？","body":"有幾分鐘空閒嗎？隨時來練習幾手牌。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('quick_play.next-decision','quick_play','play','{"en":{"title":"A few hands?","body":"One table, a fresh hand, and a new decision. Drop in for a quick practice."},"zh-Hans":{"title":"来玩几手？","body":"一张牌桌，一手新牌，一个新决定。来一场快速练习吧。"},"zh-Hant":{"title":"來玩幾手？","body":"一張牌桌，一手新牌，一個新決定。來一場快速練習吧。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('quick_play.warm-up','quick_play','play','{"en":{"title":"A few hands?","body":"Warm up your poker thinking with a short practice session."},"zh-Hans":{"title":"来玩几手？","body":"用一小段练习，给你的扑克思路热热身。"},"zh-Hant":{"title":"來玩幾手？","body":"用一小段練習，給你的撲克思路熱熱身。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('quick_play.try-position','quick_play','play','{"en":{"title":"A few hands?","body":"Want to practice playing in position? Take a seat for a few hands."},"zh-Hans":{"title":"来玩几手？","body":"想练习有位置时的打法吗？入座试几手吧。"},"zh-Hant":{"title":"來玩幾手？","body":"想練習有位置時的打法嗎？入座試幾手吧。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('quick_play.small-session','quick_play','play','{"en":{"title":"A few hands?","body":"A short session is enough to practice one useful skill. Choose your focus today."},"zh-Hans":{"title":"来玩几手？","body":"一小段对局就能练习一个实用技巧。选一个今天的重点吧。"},"zh-Hant":{"title":"來玩幾手？","body":"一小段對局就能練習一個實用技巧。選一個今天的重點吧。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('quick_play.read-board','quick_play','play','{"en":{"title":"A few hands?","body":"A new board brings new choices. Try reading a few in quick play."},"zh-Hans":{"title":"来玩几手？","body":"新的牌面带来新的选择。来快速对局中观察几手吧。"},"zh-Hant":{"title":"來玩幾手？","body":"新的牌面帶來新的選擇。來快速對局中觀察幾手吧。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('quick_play.friendly-table','quick_play','play','{"en":{"title":"A few hands?","body":"In the mood for poker practice? Your next table is a tap away."},"zh-Hans":{"title":"来玩几手？","body":"想练习扑克吗？轻点一下，进入下一张牌桌。"},"zh-Hant":{"title":"來玩幾手？","body":"想練習撲克嗎？輕點一下，進入下一張牌桌。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('quick_play.take-time','quick_play','play','{"en":{"title":"A few hands?","body":"Play a few hands at your own pace. There is time to think through each choice."},"zh-Hans":{"title":"来玩几手？","body":"按自己的节奏玩几手牌，慢慢想清楚每个选择。"},"zh-Hant":{"title":"來玩幾手？","body":"按自己的節奏玩幾手牌，慢慢想清楚每個選擇。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('quick_play.apply-tip','quick_play','play','{"en":{"title":"A few hands?","body":"Put one poker idea into practice with a couple of quick hands."},"zh-Hans":{"title":"来玩几手？","body":"用几手快速对局，把一个扑克思路付诸实践。"},"zh-Hant":{"title":"來玩幾手？","body":"用幾手快速對局，把一個撲克思路付諸實踐。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('quick_play.review-hand','quick_play','play','{"en":{"title":"A few hands?","body":"Play a short session, then revisit the decision that made you think."},"zh-Hans":{"title":"来玩几手？","body":"玩一小段对局，再回头看看最让你思考的那个决定。"},"zh-Hant":{"title":"來玩幾手？","body":"玩一小段對局，再回頭看看最讓你思考的那個決定。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('quick_play.fresh-cards','quick_play','play','{"en":{"title":"A few hands?","body":"Fresh cards are ready whenever you feel like a little practice."},"zh-Hans":{"title":"来玩几手？","body":"想小练一下时，随时都有新牌等你。"},"zh-Hant":{"title":"來玩幾手？","body":"想小練一下時，隨時都有新牌等你。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
insert into public.notification_content(id,kind,target,copy,enabled) values ('quick_play.choose-challenge','quick_play','play','{"en":{"title":"A few hands?","body":"Choose a comfortable difficulty and enjoy a few practice hands."},"zh-Hans":{"title":"来玩几手？","body":"选择适合自己的难度，轻松练习几手牌。"},"zh-Hant":{"title":"來玩幾手？","body":"選擇適合自己的難度，輕鬆練習幾手牌。"}}'::jsonb,true) on conflict(id) do update set copy=excluded.copy;
