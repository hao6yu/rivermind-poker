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
| Support | `hyu@isw.dev` |

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

Create a signed App Store build from the latest clean `master` with stable
Xcode. The command prints the exact IPA path:

```bash
pnpm build:ios:release:local
```

The command fast-forwards `master`, runs the full release gate, builds and
signs the IPA locally, and stores it under `artifacts/ios`. It does not submit
the binary to App Store Connect.

Submit only that explicit path. The wrapper deliberately has no `--latest`
mode because a local build is not the latest EAS cloud build:

```bash
pnpm submit:ios:testflight -- artifacts/ios/RiverMind-<commit>-<timestamp>.ipa
```

EAS manages the developer-facing iOS build number remotely and increments it for each production build. The user-facing version remains explicit in `app.json`.

## App Store Connect beta copy

Use the following copy in **TestFlight → Test Information** so a tester understands the product before opening it.

### Beta description

RiverMind is a friendly Texas Hold’em learning and practice app for beginners and casual players. It helps you learn the rules, understand why a poker decision is good, and practice without using real money.

You can learn hand rankings, poker terms, and common odds; play practice games against computer opponents; turn on Coach for suggested actions and bet sizes; review completed hands; and try quizzes, practice scenarios, Daily Challenges, and tournaments.

This is an early friends-and-family beta. All chips are for practice only—there are no deposits, prizes, withdrawals, or real-money gambling.

Please use the app naturally and tell me if anything is confusing, hard to find, visually broken, or gives advice that does not match the cards. Bugs, crashes, lost progress, and hard-to-follow player actions are especially useful to report. Please also tell me how it looks on iPhone or iPad, in light or dark mode.

You do not need to know poker already. Feedback from complete beginners is especially helpful.

### What to test

You do not need to test every feature or know poker already. Use the app naturally and try a few of these activities:

1. Start **Quick Play**, turn **Coach** on, and check whether it is clear whose turn it is, what each player did, and what action Coach suggests.
2. Try a 3-player or 6-player table and a Sit & Go tournament. Tell us if the cards, bets, player actions, dealer, or blinds are hard to follow.
3. Open **Play with friends**, create a private table, add RiverMind AI to open seats, and play a few hands. Check that turn timing, action bubbles, reconnecting, and final payouts are easy to follow.
4. Finish a hand, open **Review hand**, and try **Practice this spot**. Check whether the advice matches the cards and action you saw.
5. Open **Learn** and try a lesson, cheat sheet, percentage trainer, quiz, or practice scenario. The explanation after an answer should help you understand every choice.
6. Try the Daily Challenge or Championship. Coach is intentionally unavailable in these competitive modes.
7. Use both light and dark mode. If possible, try RiverMind on both an iPhone and an iPad.
8. Send **Feedback** from Profile when something is confusing or broken. Include what screen you were on and what you did just before the problem.

Please report crashes, stuck games, missing progress, hidden or clipped buttons, incorrect poker rules or payouts, advice that does not match the visible cards, and any screen that feels too technical for a beginner.

The optional server-generated AI explanation may occasionally be unavailable. Normal play, Coach, learning content, and post-hand grading should still work without it.

### App Review notes

RiverMind is an educational Texas Hold’em trainer that uses practice chips only. It does not support real-money wagering, deposits, withdrawals, purchases, prizes, cash-out, or player-to-player online gambling.

No account or sign-in is required. From the Home screen, select Quick Play and choose a table size. Coach can be enabled during practice to suggest a legal action and bet or raise amount. After completing a hand, select Review hand to see decision feedback and launch related practice.

The Learn area contains lessons, poker cheat sheets, a percentage trainer, quizzes, randomized scenarios, and focused practice packs. The Play area also includes local computer-opponent tables, private friend tables with optional AI-filled seats, Sit & Go tournaments, a Daily Challenge, and a Championship journey. Coaching is intentionally unavailable in competitive modes and private friend tables.

Suggested review path:

1. Open Quick Play with Coach enabled and complete its two-hand orbit; confirm each player receives the button once.
2. If the AI folds before you act in hand one, confirm hand two still deals. Open Review hand and Practice this spot.
3. Open Learn and try a cheat sheet, quiz, or scenario.
4. Try a 3-player or 6-player table or Sit & Go.

Core gameplay and learning features work locally. An optional server-generated AI explanation can be requested after a heads-up hand. Before the first request, RiverMind names Supabase and OpenAI, lists the data sent, and requires explicit permission. Declining leaves the deterministic review available.

RiverMind automatically creates an anonymous account; no credentials are required. Profile includes **Delete account and data**, which permanently deletes that account and associated cloud and local RiverMind data. Private tables use only product-authored preset nicknames rather than free-form user text.

The app supports both iPhone and iPad and includes light and dark appearance. No demo credentials are required.

### License agreement

Leave the custom license field blank so Apple’s standard EULA applies. Do not add custom legal terms without legal review.

## Tester notes and current limitations

- The beta supports 2-, 3-, and 6-player practice against local AI, private friend tables with optional AI-filled seats, resumable 3- and 6-player Sit & Go tournaments, a five-event local Championship journey, a UTC Daily Challenge with comparable cards and coaching locked off, learning tools, hand history, and optional live coaching. Server-generated post-hand AI reviews remain heads-up only for this release.
- Championship best finishes, attempts, unlocks, statistics, achievements, and its public-only saved run stay on this device. Global rankings wait for server-authoritative play and anti-tamper controls.
- Daily Challenge results are private personal bests. A public leaderboard waits for server-authoritative play and anti-tamper controls.
- The iOS build supports iPhone and iPad. Android distribution, public matchmaking, larger online tournaments, real-money play, durable sign-in, and cross-device multiplayer history are not yet available.
- Profile includes **Delete account and data**. Removing the app without using that control can remove the local credentials needed to delete the anonymous cloud account later.
- Private feedback and privacy questions go to `hyu@isw.dev`.

## Rollback and evidence

Record the distributed commit SHA, EAS build URL, App Store Connect build number, release-gate output, and tester group. If a candidate is faulty, stop external testing for that build in App Store Connect and restore the last known-good build to the tester group; do not reuse a build number.
