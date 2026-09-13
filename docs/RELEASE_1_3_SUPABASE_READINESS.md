# v1.3 Supabase readiness — September 13, 2026

**Update at 20:58 UTC: the account-deletion/avatar deployment gap is closed.** `delete-account` version 2 and `avatar-cleanup` version 1 are deployed, 12 hosted smoke checks passed, and an actual cron invocation returned HTTP 200 with zero failures. The cleanup job is active daily at 08:37 UTC. Details: `docs/RELEASE_1_3_SUPABASE_DEPLOYMENT.md`.

The original read-only inspection below checked the live **RiverMind Poker** project (`jdrecupvpsjfzkmngmiz`) at approximately 20:39–20:42 UTC. Its historical findings and evidence are preserved; the later explicitly authorized deployment closed the gap it identified. Push notifications remain enabled and operating.

## Push notifications — operational

- Project status: `ACTIVE_HEALTHY`.
- `notifications-register` and `notifications-dispatch` are deployed and active, both at version 2.
- Rollout: `enabled = true`, `production_enabled = true`, no restricted test audience.
- The notification cron is active every five minutes. Its last 24 hours contain 288 successful runs. The retained six hours of HTTP responses contain 72 HTTP 200 responses and no timeout; recent dispatcher bodies report zero claims rather than an error.
- Both required Vault entries exist. Their values were not retrieved or printed.
- Eight provider handoffs are recorded in the last seven days, including two on September 10. The two failures are from September 7's setup period (`DeviceNotRegistered` and `receipt_error`); there are no newer recorded failures or unfinished deliveries older than 24 hours. Provider handoff does not establish banner visibility on a device.
- Three registrations currently have delivery permission and at least one category enabled. These counts may include the owner's QA installations.
- Content contains 24 enabled tips and 12 enabled play reminders. There is **no release-announcement campaign**. A v1.3 campaign must be authored and enabled explicitly after the applicable store release is available.
- Notification client grants remain absent, consistent with service-only tables. All repository migration versions, including notification fixes and additional locales, are present in hosted migration history.

The quiet cadence is intentional: opt-in is required, registration activity must be at least 72 hours old, delivery occurs during the recipient's local 18:00 hour, and cooldown/content/frequency limits also apply. See `docs/PUSH_NOTIFICATIONS.md`.

## Original deployment gap — closed by the subsequent deployment

The hosted `delete-account` function is still **version 1**, last updated August 16. Inspection of its deployed source confirms it directly calls `admin.auth.admin.deleteUser(userId, false)` and does not enumerate or remove avatar objects first.

The repository's current `supabase/functions/delete-account/index.ts` and handler implement Storage API enumeration/removal before deleting the account. That implementation is not present in the hosted function.

The hosted function inventory also lacks **`avatar-cleanup`**. Supabase cron currently lists only multiplayer cleanup and notifications; it has no avatar sweep. The README requires this worker for dashboard/Admin-API deletions and a daily safety-net trigger. No external scheduler was inspected, but the required hosted worker is absent regardless.

Required closure:

1. Deploy the reviewed current `delete-account` implementation and `avatar-cleanup` worker.
2. Configure the authenticated, server-only scheduled avatar sweep described in the README.
3. Run a controlled hosted smoke with disposable accounts and avatars: in-app deletion cleans its files; an out-of-band deletion is covered by the sweep; unauthorized callers are rejected.

A read-only storage check found one avatar object and no object whose owner-folder UUID was absent from Auth. This is deployment drift, not evidence of an existing orphaned-file incident. The actual hosted deletion behavior with uploaded avatars was not exercised here.

Deployment/runbook reference: `README.md`, "Operational runbook (out-of-band deletions)." Keep the existing separate legacy and v4 multiplayer deployment lanes intact when closing this gate.

## Other observations

- The live advisor still flags the unset search path on `private.avatar_object_owned`. It is an existing hardening item; the inspected function is not SECURITY DEFINER. [Supabase remediation](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).
- "RLS enabled, no policy" notices on notification/private tables reflect their service-only design; no notification-table grants to mobile roles were found. Guest-access notices are consistent with this app's anonymous identity model. Mobile roles have no usage privilege on the cron schema. These observations do not constitute a complete security audit.
- The A2 pause/resume, completion/rematch, rebuy, and recovery checks remain open. The previously reported missing local Docker/Supabase test environment is separate from the hosted project's current healthy status; this inspection did not rerun that local harness.

The account-deletion/avatar deployment gate identified here is now closed. The other v1.3 release checks remain open. Push itself is not blocked.
