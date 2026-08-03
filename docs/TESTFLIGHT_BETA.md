# RiverMind iOS beta delivery

This runbook prepares RiverMind internal TestFlight builds. It does not publish the app to the public App Store.

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

## App Store Connect beta copy

Use the following copy in **TestFlight → Test Information** so a tester understands the product before opening it.

### Beta description

RiverMind is a play-chip Texas Hold’em learning app for people who want to understand poker decisions without risking real money. Learn the rules and common percentages, practice against local AI opponents, receive legal-action and bet-size coaching during a hand, and review your decisions afterward. RiverMind grades the decision process rather than whether a lucky card won the pot.

The beta includes heads-up and 3–6 player AI tables, Sit & Go tournaments, a five-event Championship, a Daily Challenge, lessons, cheat sheets, randomized scenarios, targeted practice packs, saved hand replay, and optional server-generated AI explanations.

### What to test

1. Start with **Quick Play** and confirm the turn banner, latest action, pot, stacks, dealer/blind markers, and legal controls make the hand easy to follow.
2. Turn **Coach** on and off. With Coach on, verify the suggested action and exact bet or raise amount are understandable and always legal.
3. Finish a hand, open **Review hand**, compare your action with RiverMind’s baseline, and use **Practice this spot** to launch the matching five-spot practice pack.
4. Try a 3-player or 6-player AI table and a Sit & Go. Check seat layout, action order, dealer/small-blind/big-blind rotation, eliminations, and resumed games.
5. Open **Learn** and try a lesson, cheat sheet, percentage trainer, hand quiz, general Scenario Training, and a focused practice pack. Every answer should explain all alternatives.
6. Try the Daily Challenge and RiverMind Championship. Coaching is intentionally unavailable in competitive modes.
7. Optionally request an AI explanation after a heads-up hand. Normal play, local coaching, learning content, and free post-hand grading should still work if that request fails.
8. Submit **Beta feedback** from Profile or an error state. Include the device, screen, and steps that caused the problem; attach hand details only when useful.

Please test on both iPhone and iPad, in light and dark appearance. Report clipped content, controls hidden by a status bar or home indicator, hard-to-follow turns, incorrect poker rules or payouts, stuck games, missing saved progress, and explanations that do not match the visible cards or action.

RiverMind uses play chips only. It does not support deposits, withdrawals, prizes, or real-money gambling.

## Tester notes and current limitations

- The beta supports 2-, 3-, and 6-player practice against local AI, resumable 3- and 6-player Sit & Go tournaments, a five-event local Championship journey, a UTC Daily Challenge with comparable cards and coaching locked off, learning tools, hand history, and optional live coaching. Server-generated post-hand AI reviews remain heads-up only for this release.
- Championship best finishes, attempts, unlocks, statistics, achievements, and its public-only saved run stay on this device. Global rankings wait for server-authoritative play and anti-tamper controls.
- Daily Challenge results are private personal bests. A public leaderboard waits for server-authoritative play and anti-tamper controls.
- The iOS build supports iPhone and iPad; Android distribution, private friend tables, public multiplayer, larger tournaments, real-money play, durable sign-in, and complete anonymous-account deletion are not yet available.
- Removing the app can remove access to anonymous progress stored in Supabase.
- Private feedback and privacy questions go to `hyu@ims.dev`.

## Rollback and evidence

Record the distributed commit SHA, EAS build URL, App Store Connect build number, release-gate output, and tester group. If a candidate is faulty, stop external testing for that build in App Store Connect and restore the last known-good build to the tester group; do not reuse a build number.
