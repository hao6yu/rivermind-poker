# Optional push notifications

Notifications are opt-in from **Profile → Notifications**. Tips, play reminders,
and release announcements have separate switches, preselected on first setup.
Preselection is a local draft; saving enabled categories is
the consent action and the only place that may request OS permission. There is
no permission prompt on first launch. English, Simplified Chinese, and Traditional
Chinese are supported; internal preview languages use English notification copy.
Previously saved choices, including all-off, are preserved when reopening settings
or updating the app. Dismissing first setup without saving does not subscribe.

This feature does not synchronize Championship progress, add achievements, or
create leaderboards. It uses the existing anonymous Supabase identity without a
new sign-in screen.

## Delivery behavior

- At least 72 hours since the last successful foreground registration.
- Delivery is eligible during the user's local 18:00 hour, with a one-hour TTL.
- At least 72 hours between claims, at most three claims in a rolling seven days
  across all categories combined,
  and at most two claims since the last app activity. A return resets the idle
  pause but does not reset the weekly cap or content history.
- Accounts inactive for more than 90 days are excluded.
- The latest registered installation is the one active device for an account.
- Foreground notifications never show banners, play sounds, or set badges.
- Taps wait until the app is at Home with onboarding, invitations, notices, and
  game flows finished. Tips open Learn; reminders open Play. Release messages
  open the platform store for a newer version, otherwise the in-app What's New.
- Saving all switches off disables server delivery without requesting a token.
  Offline changes remain visibly pending and retry on foreground. OS settings
  can stop display immediately. A request already handed to a provider cannot
  be recalled.

## Preventing repeats

The initial pool contains 24 tips and 12 play invitations, each translated into
all three production locales. Stable semantic IDs identify messages independently
of their translation. Per-user deterministic shuffling chooses only unseen IDs;
tip/play categories alternate when both have eligible content. Exhausting the
pool pauses that category. There is no automatic reset or recycling.

Recipient row locks and unique account/content and push-address/content keys prevent overlapping
workers from selecting duplicate messages. A second unique key on
`(user_id, release_version)` prevents duplicate announcements for the same version.
Each attempt is marked `sending` before the Expo HTTP request. Crashes, timeouts,
429s, and ambiguous responses are never retried for these optional messages.
All claims count toward frequency limits, including skipped or failed attempts.
The provider-issued Expo token is stored and sent verbatim. Prefix normalization
is limited to internal uniqueness and fingerprints; it must never change the
address passed to Expo. Existing delivery history remains intact across this fix.

This provides at most one application submission per message per account. Expo
and the OS providers do not guarantee exactly-once delivery. A shared collapse ID
and Android tag reduce duplicate/stale banners, but cannot guarantee that a
provider will never display a duplicate. Receipt success means provider handoff,
not proof the person received or read a notification. Expired receipts become
`unknown`, without resending.

Identity is currently anonymous. An iOS reinstall can retain its Expo push token.
Registering that token retires its previous guest registration, and a server-only
fingerprint keeps the existing cooldown and content suppression for that address.
This transfers no gameplay or account data. A new guest identity AND a new push
address have new history; cross-device identity deduplication requires the future
account/progress synchronization work. Account deletion removes its linked
notification history. Hardware tracking is not introduced here.

## Updating the pool and announcing the next release

Edit `config/notification-content.json`. Keep an existing ID when correcting or
translating its meaning. Add a new ID only for a genuinely new message. The
generator validates all production locales and escapes SQL literals:

```sh
supabase migration new notification_content_update
node scripts/notification-content-sql.mjs >> supabase/migrations/<generated-file>.sql
```

Review and deploy the new migration. Its upserts update translations without
clearing history or re-enabling an intentionally disabled item. New content can
be sent to installed compatible app versions without another mobile release.
Turning off an old item's `enabled` field retains its deduplication history.

Release announcements are explicit `notification_content` rows with:

- `kind = 'release'`, `target = 'whats_new'`, and the released semantic version;
- copy for each production locale, with nonempty `title` and `body`;
- `platforms` containing only the stores where that version is publicly available;
- reviewed `starts_at`, `expires_at`, and `enabled` values.

Only older installed versions qualify. Set a short expiry for release campaigns.
No release announcement is seeded automatically by an app version change.

## Infrastructure and rollout

- Firebase project: **RiverMind**, `rivermind-961f9`, Spark plan.
- Android application: `dev.isw.rivermindpoker`.
- Expo project: `@iswtech/rivermind-poker`.
- Supabase project: **RiverMind Poker**, `jdrecupvpsjfzkmngmiz`.
- `notifications-register`: verified user authentication; owner comes from the
  authenticated context, never from a request field.
- `notifications-dispatch`: server secret in the `apikey` header. Mobile tokens
  and publishable API keys cannot call it.
- All four notification tables and delivery RPCs are service-only. RLS is enabled
  and access is revoked from both `anon` and `authenticated`.
- The named Supabase cron job runs every five minutes. A disabled rollout returns
  before making HTTP requests. Vault stores `notification_dispatch_url` and
  `notification_dispatch_key`; secrets are not embedded in the job definition.
- Each invocation claims at most ten recipients. This initial capacity is about
  120 recipients per local-hour window. Increase throughput with bounded worker
  concurrency when audience size requires it, retaining locks and uniqueness.

EAS Android credentials contain the dedicated `rivermind-push-sender` FCM v1
service account with only the Firebase Cloud Messaging API Admin role. EAS iOS
credentials contain the RiverMind APNs key, and the app identifier has Push
Notifications enabled. Both preview and App Store provisioning profiles have
been refreshed for that capability.
Keep private credentials out of the repository and mobile builds.
`google-services.json` is the public Android
application configuration, not a server service-account credential. A fresh
native build is required for the notification module, APNs entitlement, and FCM
configuration; Expo Go is not a push-delivery test environment.

Optional Expo push security uses `EXPO_ACCESS_TOKEN` only in Edge Function secrets.
If enabled in Expo, configure the matching token before sending.

The deployment starts with `enabled = false`, `production_enabled = false`, and an
empty `test_user_ids` array in `notification_rollout`. To test, put only the
owner's test account in that array and enable the outer switch. Keep production
disabled. Validate permission, token registration, background delivery, tap
routing, opt-out, receipt status, and repeated scheduler invocation on a physical
phone before enabling production. Never clear delivery history to force retries.

Stop scheduled sending by setting `notification_rollout.enabled = false`.
Inspect status/error counts in `notification_deliveries` and job failures in
`cron.job_run_details`. Do not log tokens, notification payloads, or credentials.

## Validation and current setup

CI at `66c12674` passed 2,375 unit/component tests (five existing opt-in skips),
171 localization tests, and 20 multiplayer HTTP integration tests. After revising
defaults, the weekly cap, and token preservation, all 41 focused notification
tests passed locally. Both TypeScript checks, iOS/Android Expo
exports, Android APK inspection, and mobile secret scans passed. The local
Postgres harness passed 26 checks, including eight concurrent workers, full pool
exhaustion, release deduplication, consent changes, device changes, role isolation,
anonymous reinstalls with retained push addresses, exact provider-token preservation,
the three-claim weekly boundary and its expiry, and account-deletion cascades.
CI runs that harness against fresh migrations:

```sh
supabase start
pnpm test:notifications-integration
```

`NOTIFICATION_TEST_WORKDIR` can target another explicitly local Supabase project.
The harness uses fake tokens and never calls Expo. Missing prerequisites fail
the run. Supabase's notification-table “RLS enabled, no policy” informational
notices are intentional for service-only access. Existing avatar search-path and
unrelated anonymous-access warnings were not changed by this feature.

Backend schema, both functions, and the disabled schedule are deployed. A disposable
live test account verified registration ownership, token-table access denial,
dispatcher secret authentication, zero claims while disabled, and opt-out. That
test account was deleted after the checks. FCM v1 and APNs credentials are
configured in EAS. Google's FCM `validate_only` request returned HTTP 200 without
delivering a notification. A local signed iPhone build, version 1.2.0 (3), passed
signature verification and contains the production APNs entitlement and the
owner's registered device. Physical-device delivery verification remains required
before production activation; Android has credential/API validation but no
physical-device delivery result yet.
The privacy policy source includes optional notification processing and controls;
publish that source with the release and update store privacy disclosures.

## Pricing and references

[Expo Push Service is free](https://docs.expo.dev/push-notifications/faq/), including
for Expo free accounts. EAS Build quotas and Apple Developer membership are
separate. This setup does not require a Firebase paid plan.

- [Expo notification setup](https://docs.expo.dev/push-notifications/push-notifications-setup/)
- [FCM credentials for Expo](https://docs.expo.dev/push-notifications/fcm-credentials/)
- [Tickets, receipts, limits, and delivery behavior](https://docs.expo.dev/push-notifications/sending-notifications/)
- [Supabase scheduling with Cron and Vault](https://supabase.com/docs/guides/functions/schedule-functions)
