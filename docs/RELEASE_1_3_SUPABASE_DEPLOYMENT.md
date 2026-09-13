# v1.3 account-deletion/avatar backend deployment — September 13, 2026

Project: **RiverMind Poker** (`jdrecupvpsjfzkmngmiz`). Explicitly authorized in the v1.3 review task. Deployed source is the reviewed implementation at `b53116ce5f7f6dae3c85b781a59ab8b997da784c`; no application/function source changes were needed.

## Deployed and verified

| Function | Hosted version | Authentication | Verification |
| --- | --- | --- | --- |
| `delete-account` | 2 | Gateway JWT verification plus verified-user context | Uploaded avatar removal runs before Auth deletion; caller identity determines the account, even when a different target is supplied in the request. |
| `avatar-cleanup` | 1 | Server secret in `apikey`, verified by `withSupabase({ auth: 'secret' })`; gateway JWT verification off | Missing credentials, public keys, and signed-in mobile users are refused. The authenticated sweep removes orphaned avatars and retains live-owner avatars. |

Every deployed source/dependency file was retrieved and compared with the local reviewed source: all match. Other Edge Functions and push rollout settings were not deployed or changed.

## Validation

- **32 focused unit tests passed** across account deletion and avatar cleanup; backend TypeScript check passed.
- **12 hosted smoke checks passed**, using three disposable anonymous accounts and three small PNG fixtures. These covered authorization, confirmation, actual avatar upload/download, account/file removal, injected-target isolation, out-of-band deletion cleanup, live-owner preservation, repeat-sweep idempotency, and fixture cleanup.
- The out-of-band case used an admin-uploaded object in the disposable user's folder, then removed the account through the Auth Admin API. This exercises an orphan without bypassing Storage's ownership constraints or deleting Storage metadata through SQL.
- All test accounts and files were removed. No real account was deleted.
- The post-deployment security advisor contains the same existing notices as the pre-deployment inspection. The existing avatar search-path warning remains a separate hardening item.

Evidence, prior deployment backup, and the credential-redacting smoke script are saved under `artifacts/reviews/v1.3/supabase-deployment/`. The script loads credentials into memory through the authenticated CLI; no key/token values are logged or saved.

## Scheduled sweep

The `rivermind-avatar-cleanup` cron job runs as `postgres`, with endpoint and key resolved from Vault entries `avatar_cleanup_url` and `avatar_cleanup_key`. The key was copied inside the database from the existing project-server-key Vault entry; its plaintext was not returned. If that underlying project key is rotated, refresh both scheduler key entries.

The actual verification cron run succeeded at **20:58 UTC on September 13**. Its HTTP request returned **200** with `{"cleaned":0,"failed":0}` and no timeout. The job was then set to **08:37 UTC daily** (`37 8 * * *`) and verified active. Both pre-existing cron schedules and production notification rollout remain unchanged.

The final database check confirms zero smoke accounts, one original avatar object remaining, and zero orphaned avatars. The account-deletion/avatar deployment gate is closed.

The integration follows Supabase's [Cron, pg_net, and Vault scheduling pattern](https://supabase.com/docs/guides/functions/schedule-functions). Credentials are absent from the job's SQL command. This is hosted operational configuration; it does not add a database schema migration.

## Operational recovery

Disable `rivermind-avatar-cleanup` through Supabase Cron if a future sweep fails or requires investigation. Diagnose the Edge Function/HTTP result before re-enabling. Account deletion fails closed when avatar removal fails, allowing the user to retry. The previous hosted account-deletion source is retained in the evidence folder for rollback if needed.
