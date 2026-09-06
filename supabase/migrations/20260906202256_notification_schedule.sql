-- Installed with rollout disabled; deploy notifications-dispatch before enabling.
-- Configure these two Vault entries through the Supabase dashboard first:
--   notification_dispatch_url: https://<project>.supabase.co/functions/v1/notifications-dispatch
--   notification_dispatch_key: the project's server-only sb_secret_... API key
-- No key is stored in this file or in cron.job. A disabled rollout makes each
-- tick return before reading secrets or making a network request.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.notification_schedule_tick()
returns bigint language plpgsql security invoker set search_path = '' as $$
declare endpoint text; api_key text; request_id bigint;
begin
  if not exists(select 1 from public.notification_rollout where enabled) then
    return null;
  end if;
  select decrypted_secret into endpoint from vault.decrypted_secrets where name='notification_dispatch_url';
  select decrypted_secret into api_key from vault.decrypted_secrets where name='notification_dispatch_key';
  if endpoint is null or api_key is null then return null; end if;
  select net.http_post(
    url := endpoint,
    headers := jsonb_build_object('Content-Type','application/json','apikey',api_key),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) into request_id;
  return request_id;
end $$;
revoke all on function public.notification_schedule_tick() from public,anon,authenticated,service_role;

-- Updating the named job is idempotent. Only postgres executes the tick.
select cron.schedule('rivermind-notifications','*/5 * * * *',
  'select public.notification_schedule_tick();');
