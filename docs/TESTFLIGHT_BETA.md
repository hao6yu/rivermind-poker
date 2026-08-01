# RiverMind iOS beta delivery

This runbook prepares the first RiverMind internal TestFlight build. It does not publish the app to the public App Store.

## Fixed beta identity

| Field | Value |
| --- | --- |
| On-device name | RiverMind |
| App Store Connect name | RiverMind Poker Trainer |
| App Store Connect Apple ID | `6797011715` |
| Bundle identifier | `dev.isw.rivermindpoker` |
| Apple team | `F9XW9FCX92` — ISW TECHNOLOGIES LLC |
| Version | `1.0.0` |
| Minimum iOS | iOS 15.1 |
| Devices | iPhone and iPad |
| Support | `hyu@ims.dev` |

The Android package remains reserved as `dev.isw.rivermindpoker`, with Android distribution deferred until its device pass is complete. The universal iOS build includes iPad so the dedicated tablet pass can run through TestFlight.

## One-time Expo setup

EAS uses an Expo account separately from the Apple account. From a clean checkout:

```bash
pnpm install --frozen-lockfile
pnpm dlx eas-cli@21.4.0 login
pnpm dlx eas-cli@21.4.0 init
```

`eas init` creates or links the Expo project and adds its public `extra.eas.projectId` to the app configuration. Commit that generated project ID; it is not a secret.

Configure the two mobile-safe Supabase values for the EAS `production` environment through the Expo dashboard or `eas env:create`:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Never add the OpenAI key, Supabase service-role key, or another server credential to an EAS mobile environment.

## Validate the candidate

```bash
pnpm release:check
pnpm eas:config:ios
```

The release gate runs the configuration verifier, Expo dependency check, TypeScript, tests, iOS and Android production exports, and source/bundle secret scans. Hosted RLS, quota, and coach evaluations remain separate live-environment gates in [BETA_RELEASE_CHECKLIST.md](BETA_RELEASE_CHECKLIST.md).

## Build and submit

Use the simulator profile for an unsigned UI check:

```bash
pnpm build:ios:simulator
```

Create the signed App Store build and upload the latest successful artifact to TestFlight:

```bash
pnpm build:ios:testflight
pnpm submit:ios:testflight
```

EAS manages the developer-facing iOS build number remotely and increments it for each production build. The user-facing version remains explicit in `app.json`.

## Tester notes

- The beta supports 2-, 3-, and 6-player play against local AI, learning tools, hand history, and optional live coaching. Server-generated post-hand AI reviews remain heads-up only for this release.
- The iOS build supports iPhone and iPad; Android distribution, private friend tables, public multiplayer, tournaments, real-money play, durable sign-in, and complete anonymous-account deletion are not yet available.
- Removing the app can remove access to anonymous progress stored in Supabase.
- Private feedback and privacy questions go to `hyu@ims.dev`.

## Rollback and evidence

Record the distributed commit SHA, EAS build URL, App Store Connect build number, release-gate output, and tester group. If a candidate is faulty, stop external testing for that build in App Store Connect and restore the last known-good build to the tester group; do not reuse a build number.
