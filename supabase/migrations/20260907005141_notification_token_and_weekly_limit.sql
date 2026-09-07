-- Preserve the exact provider-issued token when sending. Prefix normalization
-- is only an internal deduplication key; it must never rewrite an Expo address.
-- Existing delivery fingerprints/history remain valid. Three claims per rolling
-- seven days is a shared cap across tips, play reminders, and release news.
create unique index notification_recipients_canonical_token
  on public.notification_recipients(replace(expo_token,'ExponentPushToken[','ExpoPushToken['));

create or replace function public.register_notification_device(p_user_id uuid, p_device jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare canonical_token text := replace(p_device->>'token','ExponentPushToken[','ExpoPushToken[');
begin
  if not exists (select 1 from pg_timezone_names where name = p_device->>'timezone') then
    raise exception 'Invalid timezone';
  end if;
  -- An iOS reinstall can retain its push address but receive a new guest ID.
  -- Retire that address's previous registration; delivery history stays intact.
  delete from public.notification_recipients where replace(expo_token,'ExponentPushToken[','ExpoPushToken[')=canonical_token and user_id<>p_user_id;
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
      and not exists(select 1 from public.notification_deliveries d where (d.user_id=n.user_id or d.token_fingerprint=md5(replace(n.expo_token,'ExponentPushToken[','ExpoPushToken['))) and d.created_at>now()-interval '72 hours')
      and (select count(*) from public.notification_deliveries d where (d.user_id=n.user_id or d.token_fingerprint=md5(replace(n.expo_token,'ExponentPushToken[','ExpoPushToken['))) and d.created_at>now()-interval '7 days')<3
      and (select count(*) from public.notification_deliveries d where (d.user_id=n.user_id or d.token_fingerprint=md5(replace(n.expo_token,'ExponentPushToken[','ExpoPushToken['))) and d.created_at>=n.last_active_at)<2
      and exists(select 1 from public.notification_content m where m.enabled and m.starts_at<=now()
        and (m.expires_at is null or m.expires_at>now()) and m.copy ? n.locale and n.platform=any(m.platforms)
        and ((m.kind='tip' and n.tips) or (m.kind='quick_play' and n.quick_play)
          or (m.kind='release' and n.releases and string_to_array(n.app_version,'.')::int[]<string_to_array(m.release_version,'.')::int[]))
        and not exists(select 1 from public.notification_deliveries d where (d.user_id=n.user_id or d.token_fingerprint=md5(replace(n.expo_token,'ExponentPushToken[','ExpoPushToken['))) and (d.content_id=m.id or d.release_version=m.release_version)))
    order by n.last_active_at limit least(greatest(p_limit, 1), 100)
    for update of n skip locked
  loop
    -- Rechecked under a per-user lock: simultaneous workers cannot select two
    -- messages for this person. Claims count too, including crashed workers.
    if exists (select 1 from public.notification_deliveries d where (d.user_id = r.user_id or d.token_fingerprint=md5(replace(r.expo_token,'ExponentPushToken[','ExpoPushToken['))) and d.created_at > now() - interval '72 hours')
      or (select count(*) from public.notification_deliveries d where (d.user_id = r.user_id or d.token_fingerprint=md5(replace(r.expo_token,'ExponentPushToken[','ExpoPushToken['))) and d.created_at > now() - interval '7 days') >= 3
      or (select count(*) from public.notification_deliveries d where (d.user_id = r.user_id or d.token_fingerprint=md5(replace(r.expo_token,'ExponentPushToken[','ExpoPushToken['))) and d.created_at >= r.last_active_at) >= 2 then
      continue;
    end if;
    select m.kind into last_kind from public.notification_deliveries d join public.notification_content m on m.id = d.content_id
      where (d.user_id = r.user_id or d.token_fingerprint=md5(replace(r.expo_token,'ExponentPushToken[','ExpoPushToken['))) order by d.created_at desc limit 1;
    select m.* into c from public.notification_content m
    where m.enabled and m.starts_at <= now() and (m.expires_at is null or m.expires_at > now())
      and m.copy ? r.locale and r.platform=any(m.platforms)
      and ((m.kind = 'tip' and r.tips) or (m.kind = 'quick_play' and r.quick_play)
        or (m.kind = 'release' and r.releases and string_to_array(r.app_version,'.')::int[] < string_to_array(m.release_version,'.')::int[]))
      and not exists(select 1 from public.notification_deliveries d where (d.user_id = r.user_id or d.token_fingerprint=md5(replace(r.expo_token,'ExponentPushToken[','ExpoPushToken['))) and (d.content_id = m.id or d.release_version=m.release_version))
    order by (m.kind = 'release') desc, (m.kind = coalesce(last_kind,'')), md5(r.user_id::text || ':' || m.id)
    limit 1;
    if found then
      insert into public.notification_deliveries(user_id,content_id,installation_id,release_version,token_fingerprint)
      values(r.user_id,c.id,r.installation_id,c.release_version,md5(replace(r.expo_token,'ExponentPushToken[','ExpoPushToken['))) returning id into delivery_id;
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
    or d.token_fingerprint is distinct from md5(replace(r.expo_token,'ExponentPushToken[','ExpoPushToken['))
    or not r.platform=any(c.platforms)
    or coalesce(length(c.copy->r.locale->>'title'),0)=0
    or coalesce(length(c.copy->r.locale->>'body'),0)=0
    or not ((c.kind='tip' and r.tips) or (c.kind='quick_play' and r.quick_play)
      or (c.kind='release' and r.releases and string_to_array(r.app_version,'.')::int[] < string_to_array(c.release_version,'.')::int[]))
    or not exists(select 1 from public.notification_rollout s where s.enabled and (s.production_enabled or r.user_id=any(s.test_user_ids))) then
    update public.notification_deliveries set status='skipped' where id=d.id;
    return null;
  end if;
  update public.notification_deliveries set status='sending', attempted_at=now(), token_fingerprint=md5(replace(r.expo_token,'ExponentPushToken[','ExpoPushToken[')) where id=d.id;
  return jsonb_build_object('id',d.id,'to',r.expo_token,'messageId',c.id,'title',c.copy->r.locale->>'title',
    'body',c.copy->r.locale->>'body','target',c.target,'releaseVersion',c.release_version);
end $$;

create or replace function public.invalidate_notification_device(p_delivery_id uuid)
returns void language sql security invoker set search_path = '' as $$
  update public.notification_recipients r set permission_granted=false,updated_at=now()
  from public.notification_deliveries d where d.id=p_delivery_id and r.user_id=d.user_id
    and r.installation_id=d.installation_id and md5(replace(r.expo_token,'ExponentPushToken[','ExpoPushToken['))=d.token_fingerprint;
$$;

revoke execute on function public.register_notification_device(uuid,jsonb), public.disable_notification_device(uuid,uuid),
  public.claim_notification_batch(integer), public.begin_notification_send(uuid),public.invalidate_notification_device(uuid) from public, anon, authenticated;
grant execute on function public.register_notification_device(uuid,jsonb), public.disable_notification_device(uuid,uuid),
  public.claim_notification_batch(integer), public.begin_notification_send(uuid),public.invalidate_notification_device(uuid) to service_role;
