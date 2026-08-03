# RiverMind Poker

RiverMind Poker is a Texas Hold'em learning app for iOS and Android. It combines deterministic heads-up and multiway poker engines, range-aware local opponents, live pot-odds feedback, and server-side AI hand reviews.

The current product direction is defined in the [Phase 1 scope](docs/PHASE_1_SCOPE.md), [Phase 2 scope](docs/PHASE_2_SCOPE.md), [product framework](docs/PRODUCT_FRAMEWORK.md), and [Learn MVP design](docs/LEARN_MVP_DESIGN.md). Phase 1 is intentionally a focused solo-learning beta: learn one concept, practice it heads-up, receive a verified review, and revisit the hand later. Phase 2 adds tested 3–6 player AI tables before the next beta build.

## Current status

- Modern Expo/React Native shell with light, dark, and system appearance modes.
- Device-aware English, Simplified Chinese, and Traditional Chinese UI with a persistent in-app language override.
- Flat deep-emerald poker surfaces with modern rounded-rectangle geometry across live and replay tables.
- First-run beta guidance plus an always-available Beta & Privacy summary and feedback link.
- Simple Learn and Play navigation with resumable 3- and 6-player Sit & Go options and unfinished private-table paths kept hidden.
- Progress-aware Home quick links for the next lesson, Quick Play, a fresh scenario drill, and hand rankings.
- Deterministic heads-up engine with replayable action history.
- Deterministic 2–6 seat engine with correct positions, action order, betting, all-ins, main and side pots, showdowns, and odd-chip settlement.
- Local 3–6 player decision layer with five behaviorally distinct opponent identities, weighted public-action ranges, profile-specific sizing and traps, and hidden-card fairness tests.
- Custom 2-, 3-, and 6-player AI sessions with responsive seats, complete hand results, replay, history, feedback, and privacy-safe Supabase sync.
- Resumable 3- and 6-player Sit & Go tournaments with rotating dealer/blinds, escalating blind levels, eliminations, and independent local public-state checkpoints.
- Tournament-aware local decisions with explicit 10 BB push-or-fold ranges, selective 11–15 BB re-shoves, and bounded public-stack pressure near Championship qualification bubbles.
- A UTC Daily Challenge with the same three-player table and Club AI conditions for every player, coaching locked off, public-only resume checkpoints, personal bests, attempts, and streaks.
- A five-stop RiverMind Championship journey with 3- and 6-player qualifying events, fixed Friendly-to-Sharp difficulty, locked coaching, best finishes, attempts, unlocks, a public-only saved run, and six device-local achievements.
- Cryptographically shuffled live deals and explicitly redacted decision views so an AI seat or coach can never inspect another seat's hole cards or the undealt deck.
- Beginner-readable turns with persistent action-and-amount badges, dealer/blind markers, a latest-action feed, and stack-aware hand results.
- Local live coaching that recommends a legal action and exact bet/raise target without consuming an OpenAI review.
- Free local post-hand grading that compares every hero choice with the shared preflop/postflop baseline, identifies the most useful review spot, and keeps an AI explanation explicitly optional.
- Shared preflop strategy for local opponents and live Coach decisions, using the acting player's cards plus public position, table size, stack depth, and prior action only.
- Custom sessions with exact 40/100/200 BB stacks, hand targets, progress, and session summaries.
- Local opponent driven by equity, pot odds, board texture, pressure, and mixed bluffs.
- Measurable Friendly, Club, and Sharp opponent profiles with repeatable behavior simulations.
- Device-local opponent memory that gradually learns public preflop, pressure-response, aggression, and position tendencies across heads-up and multiway practice, with bounded difficulty-aware adjustments and an in-app reset.
- Authenticated Supabase Edge Function for verified OpenAI coaching.
- Server-enforced limit of 20 AI review requests per user per UTC day, with aggregate latency and failure metrics.
- Bounded transient retries plus clear loading, retry, daily-limit, and deterministic fallback states.
- Durable, owner-scoped practice sessions, completed hands, and coach reviews.
- Offline write queue with automatic retry when Supabase becomes reachable again.
- Saved Hand History available from the table and Profile.
- Six-part fundamentals path with real card examples plus four quick-reference cheat sheets, including an interactive 169-hand preflop explorer.
- Repeatable percentage trainer and hand-decision quiz that explain every alternative after answering, with saved best scores.
- Fresh six-spot scenario sessions generated from fourteen validated templates, plus focused five-spot preflop, betting, and odds packs recommended from reviewed weaknesses.
- Hand-ranking examples with suit-aware cards and clearly scoped seven-card category probabilities.
- Local-first learning completion synchronized to owner-scoped Supabase progress.
- Saved progress metrics plus an owner-authorized delete-history control.
- Deterministic unit tests plus end-to-end persistence and coach-quota access verifiers.
- Compact table layouts, safe-area-aware sheets, and screen-reader labels for the primary beta journey.
- Repeatable mobile-secret and expanded cross-user RLS release gates.
- Reproducible universal iPhone/iPad EAS profiles, private beta support, and App Store Connect identity for TestFlight preparation.

## Why this architecture

- **React Native + Expo** gives us one TypeScript codebase and fast device testing.
- **The poker engine is local and deterministic.** Rules, payouts, hand strength, and legal actions never depend on an LLM.
- **Coaching facts are verified before the model sees them.** Each hero decision captures an immutable snapshot of the board, pot, wager, stacks, contributions, call amount, and legal actions. The Edge Function validates that state and independently recomputes hand rank, board texture, possible categories, draws, pot odds, and SPR with the shared poker analyzer.
- **Local opponents use Monte Carlo equity, pot odds, board texture, position, players behind, stack-to-pot ratio, public-action ranges, mixed-frequency bluffs, and a bounded read of the player's prior public choices.** Hidden cards from other seats are never inputs. Memory stays on the device, adapts cautiously as evidence accumulates, and can be reset from Profile.
- **OpenAI explains the verified analysis; it does not calculate poker rules.** The mobile app calls an authenticated Supabase Edge Function; the OpenAI key is never bundled into the app.

## Run the mobile app

Prerequisites: Node.js 22.19 or newer, pnpm, and Expo Go or an iOS/Android simulator.

```bash
pnpm install
pnpm start
```

Keep only the two `EXPO_PUBLIC_SUPABASE_*` values from `.env.example` in the mobile app's root `.env` or `.env.local`. The OpenAI key belongs in Supabase Edge Function secrets, never in a root env file that Expo loads.

The app remains playable and all Learn content remains available without Supabase. Completed hands and learning progress wait locally and sync after connectivity returns.

## Prepare the iOS beta

The iOS build supports iPhone and iPad on iOS 15.1 or newer. Complete the dedicated iPad layout and device pass before widening tablet distribution. The Android package and launcher assets are configured, with Android distribution following its own device pass.

```bash
pnpm release:check
pnpm eas:config:ios
pnpm build:ios:testflight
pnpm submit:ios:testflight
```

The one-time Expo project link, safe EAS environment variables, App Store identity, tester instructions, and rollback process are documented in [the TestFlight beta runbook](docs/TESTFLIGHT_BETA.md). Private beta support and privacy questions go to `hyu@ims.dev`.

## Run Supabase locally

Docker (or a compatible container runtime) is required by the Supabase local stack.

```bash
supabase start
supabase functions serve poker-coach --env-file supabase/functions/.env.local
```

Local startup applies the committed migrations in `supabase/migrations`. To deploy them to a linked hosted development project, preview before applying:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --dry-run
supabase db push
```

The coach defaults to `OPENAI_REASONING_EFFORT=medium`. The repeatable comparison
corpus can be run against the hosted function with:

```bash
pnpm eval:coach --effort=medium
```

Run only the targeted deterministic-analysis regressions with:

```bash
pnpm eval:coach --effort=medium --ids=T03,T04,R01,R02,R06
```

Compare all three local opponent profiles across the same 120 seeded hands with:

```bash
pnpm eval:ai
```

Run the repeatable 3-player and 6-player multiway decision benchmark with:

```bash
pnpm eval:multiway-ai
```

The measured parameters and fixed benchmark are documented in [AI difficulty presets](docs/AI_DIFFICULTY_PRESETS.md).
Scenario content, partial-credit rules, and UX boundaries are documented in [Scenario training](docs/SCENARIO_TRAINING.md).

Set the hosted `OPENAI_REASONING_EFFORT` secret to the same value before running
the evaluator. Raw results are written to the ignored `.eval-results/` directory.

Anonymous sign-in is enabled in `supabase/config.toml` for the learning MVP. For a hosted project:

1. Create or link a Supabase project.
2. Enable anonymous sign-ins in Auth settings.
3. Add `OPENAI_API_KEY` and `OPENAI_MODEL` in Edge Function Secrets.
4. Deploy `poker-coach` with JWT verification enabled.
5. Put only the project URL and publishable key in the app's root `.env` or `.env.local`.

For local Edge Function development, keep `OPENAI_API_KEY` and `OPENAI_MODEL` in the ignored `supabase/functions/.env.local`, following `supabase/functions/.env.example`.

The current implementation follows Supabase's authenticated Edge Function and secret-management guidance. The proxy retries one genuine transient OpenAI failure, does not retry billing/auth/configuration failures, and records only safe aggregate error codes. Verified poker facts remain available without an OpenAI response.

## Persistence and privacy

The public schema contains seven tables:

- `practice_sessions` stores one owner-scoped AI practice session.
- `practice_hands` stores a completed, replayable hand.
- `hand_reviews` stores deterministic analysis and the bounded AI explanation.
- `learning_progress` stores lesson completion, drill attempts, and best scores.
- `coach_daily_usage` stores owner-readable, server-managed daily request and reliability totals.
- `beta_feedback` accepts private, insert-only tester reports with bounded diagnostic context.
- `daily_challenge_results` stores one owner-scoped personal best and attempt count per UTC event date.

Every table has Row Level Security and explicit Data API grants. Owner-scoped records check `auth.uid()`; beta feedback permits only owner-authenticated inserts and exposes no mobile read, update, or delete access. Anonymous Supabase users use the `authenticated` database role but remain isolated by their unique user ID.

Before a hand enters local or hosted persistence, RiverMind removes the undealt deck. Opponent cards are stored only when they were legitimately revealed at showdown. Daily Challenge checkpoints contain only public tournament state, and hosted Daily records contain only a personal score, placement, hand count, attempts, and timestamps. Championship statistics and achievements are derived from the same device-local event results; its public-only checkpoint never stores cards or the undealt deck. A separate device-local opponent profile stores aggregate action counts and position tendencies, never cards or full hand state; it is not synced to Supabase and can be reset from Profile. OpenAI and Supabase secret/service-role keys never enter the mobile bundle.

## Validate

```bash
pnpm test
pnpm typecheck
pnpm verify:release-config
pnpm release:check
pnpm verify:mobile-secrets
pnpm verify:rls
pnpm verify:coach-quota
```

`verify:mobile-secrets` rejects raw OpenAI/Supabase server credentials, tracked local env files, or server-only environment names in mobile source. Pass iOS and Android export directories as arguments to scan production bundles too.

`verify:rls` uses only the publishable client configuration from the ignored root `.env`. It creates two temporary anonymous users, verifies unauthenticated and cross-user CRUD isolation, ownership forgery protection, and server-only quota writes, then removes the database test rows when finished.

`verify:coach-quota` proves mobile clients can read only their own quota row and cannot call the server-only quota functions or mutate counters directly.

## Project layout

- `src/domain/poker` — deterministic rules, tournament intelligence, analysis, privacy redaction, replay, and tests.
- `src/domain/learning` — stable lesson, trainer, and scenario content with recommendations, scoring, and tests.
- `src/features` — mobile screens and reusable poker UI.
- `src/localization` — typed message catalogs, gameplay and Championship copy helpers, device-locale resolution, and the persisted language provider.
- `src/services` — Supabase auth, coaching, durable history, beta diagnostics, and offline retry.
- `src/types/database.ts` — generated types for the hosted database schema.
- `supabase/migrations` — reviewable schema, grants, indexes, and RLS policies.
- `supabase/functions/poker-coach` — authenticated server-side coaching proxy.
- `docs` — product scope, architecture contracts, model evaluations, the [beta privacy notice](docs/PRIVACY.md), and the [release checklist](docs/BETA_RELEASE_CHECKLIST.md).
- `docs/TESTFLIGHT_BETA.md` — the universal iPhone/iPad build, submission, tester, evidence, and rollback runbook.
- `docs/PR24_GAMEPLAY_CLARITY_QA.md` — PR 24's gameplay-comprehension and learning-feedback simulator pass.
- `docs/PR25_RANDOMIZED_LEARNING_QA.md` — PR 25's randomized-training, Home, and card-reference simulator pass.
- `docs/PR26_ADAPTIVE_OPPONENT_QA.md` — PR 26's public-action memory, bounded-adaptation, and iPhone simulator evidence.
- `docs/PR27_SIT_AND_GO_FAIRNESS_QA.md` — PR 27's Sit & Go, secure-deal, information-boundary, rotation, resume, and simulator evidence.
- `docs/PR28_DAILY_CHALLENGE_QA.md` — PR 28's event rules, deterministic boundary, persistence security, and simulator evidence.
- `docs/PR30_SIX_PLAYER_SIT_AND_GO_QA.md` — PR 30's six-player tournament, independent checkpoints, rotation, resume, and simulator evidence.
- `docs/PR31_CHAMPIONSHIP_PROGRESSION_QA.md` — PR 31's five-event Championship progression, public-only resume, locked-coach play, and simulator evidence.
- `docs/PR32_CHAMPIONSHIP_RECORD_QA.md` — PR 32's derived Championship statistics, local achievements, navigation, and simulator evidence.
- `docs/PR33_PREFLOP_RANGES_QA.md` — PR 33's shared preflop strategy, interactive range explorer, fairness checks, and iPhone simulator evidence.
- `docs/PR34_POSTFLOP_DECISIONS_QA.md` — PR 34's shared postflop line and sizing model, public-state fairness, and simulator evidence.
- `docs/PR35_DECISION_GRADING_QA.md` — PR 35's free post-hand grading, relative line comparison, privacy boundary, varied-hand evaluation, and iPhone simulator evidence.
- `docs/PR36_SESSION_LEARNING_QA.md` — PR 36's aggregate decision learning loop, targeted-practice routing, and compact iPhone simulator evidence.
- `docs/PR37_TARGETED_PRACTICE_QA.md` — PR 37's targeted practice packs, randomized spots, and compact iPhone simulator evidence.
- `docs/PR39_GAMEPLAY_REVIEW_CLARITY_QA.md` — PR 39's six-player table geometry, action trail, whole-run summary, replay correction, and iPhone simulator evidence.
- `docs/PR40_STRATEGY_COHERENCE_QA.md` — PR 40's weighted range model, production opponent identities, coaching consistency, shuffle review, and release evidence.

## Roadmap toward a genuinely strong opponent

The current bot is an honest first milestone, not a claim of solver-level play. Persistent, bounded public-action adaptation and an explainable position/stack-aware preflop foundation are now implemented. The next strength upgrades are:

1. Train or import a heads-up CFR strategy abstraction.
2. Add bet-size selection across several actions instead of one suggested size.
3. Add expected-value comparisons to the scenario coaching feedback.
4. Add private friend tables with Supabase Realtime after the solo engine is stable.

This project is intended for learning and play with friends, not real-money wagering.
