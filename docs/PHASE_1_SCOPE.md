# RiverMind Poker — Phase 1 scope

## Product outcome

Phase 1 delivers a polished solo-learning beta for iOS and Android. A player should be able to learn one concept, practice it heads-up against a credible AI opponent, receive factually verified coaching, and see progress persist across app launches.

The phase is successful when RiverMind feels like a focused poker study companion rather than a collection of unfinished poker modes.

## Target player

- Knows little or some Texas Hold'em and wants guided practice.
- Prefers short sessions of roughly 5–15 minutes.
- Wants to understand decisions, percentages, and recurring mistakes.
- Plays with practice chips only; no real-money wagering is involved.

## Core journey

1. Open RiverMind and see one recommended next activity.
2. Learn or refresh a single concept.
3. Play a heads-up practice session with coaching on or off.
4. Finish a hand and request a verified review.
5. Replay the key decision and understand the better choice.
6. Return later and continue from saved history and learning focus.

## In scope

### 1. Simple product shell

- Keep the three primary destinations: Home, Learn, and Play.
- Home presents one recommended activity plus Quick Play.
- Light, dark, and system appearance modes remain supported.
- Remove, hide, or clearly mark interactions that are not available in Phase 1.
- Add a short first-run explanation of practice chips, coaching, and privacy.

### 2. Learn MVP

- A concise Texas Hold'em fundamentals path covering:
  - hand rankings;
  - position and blinds;
  - legal actions and betting order;
  - starting-hand selection;
  - outs, equity, and pot odds;
  - value betting and bluffing basics.
- Cheat sheets for hand rankings, positions, common percentages, and a starter preflop chart.
- Percentage trainer with repeatable outs, equity, and pot-odds questions.
- Hand quiz that shows the answer and explanation after a decision.
- Completion state for lessons and drills stored per user.

### 3. Heads-up AI practice

- Heads-up No-Limit Texas Hold'em with 100 BB starting stacks and practice chips.
- Correct blinds, betting, all-ins, unmatched-chip refunds, showdown, and split-pot handling.
- A balanced baseline opponent that uses equity, pot odds, board texture, value ranges, pressure, and mixed bluffs.
- Three understandable difficulty presets derived from tested strategy parameters:
  - Friendly — clearer mistakes and lower pressure;
  - Club — balanced default;
  - Sharp — tighter errors and more effective pressure.
- Coach toggle available before and during a practice session.
- Local gameplay continues when coaching or network access is unavailable.

Phase 1 deliberately supports two players only. Unsupported 3-, 6-, and 9-player choices should not appear actionable.

### 4. Verified coaching

- Live decision details show estimated equity, required equity, call price, and the limits of the estimate.
- Post-hand review is generated through an authenticated Supabase Edge Function.
- Poker facts are recomputed deterministically before reaching the language model.
- Reviews show verified hand strength, legal actions, pot odds, draw outs, hit chance, SPR, and sizing bounds.
- Each reviewed hand receives a process-based grade: Strong, Close, or Focus spot.
- Each review identifies one key decision and one bounded practice focus.
- Coaching never exposes an OpenAI key to the mobile app.
- Add a reasonable per-user review quota and a friendly quota/error state before beta distribution.

### 5. History, replay, and progress

- Persist practice sessions, completed hands, deterministic analysis, and coach reviews in Supabase.
- Preserve the existing step-by-step replay, including hidden-card privacy on non-showdown hands.
- Connect Profile → Hand History to saved hands.
- Connect Profile → Progress and Statistics to:
  - hands played and reviewed;
  - Strong, Close, and Focus-spot counts;
  - recurring practice areas;
  - recent lesson and drill completion.
- Home uses saved progress to recommend one next lesson, drill, or practice focus.
- Allow a player to delete their saved learning history.

### 6. Authentication and data safety

- Anonymous sign-in remains the zero-friction default.
- Every saved record is owned by `auth.uid()` and protected by Row Level Security.
- Define an upgrade path from anonymous access to a durable sign-in before broader release.
- Store only cards legitimately known to the player; unrevealed opponent cards are never sent to coaching or history.
- Keep OpenAI and Supabase secret/service-role keys server-side and out of Git.
- Run security advisors and explicit cross-user RLS tests before beta distribution.

### 7. Beta readiness

- Automated tests cover the deterministic engine, analysis, replay, and review contracts.
- Add integration coverage for persistence and RLS ownership.
- Maintain a repeatable hosted coaching regression corpus.
- Provide an internal iOS and Android build with clear setup and feedback instructions.
- Add basic privacy, terms, and responsible-use copy suitable for a play-chip learning app.
- Document known limitations honestly; do not claim solver-perfect or professional-level GTO play.

## Explicitly out of scope

- Real-money wagering, deposits, prizes, or cash-equivalent chips.
- Private friend tables or public multiplayer.
- Server-authoritative dealing and anti-cheat systems.
- Multiway 3-, 6-, or 9-player gameplay.
- Sit & Go, daily events, championships, or World Series-style tournaments.
- Social profiles, chat, friends, leaderboards, and public rankings.
- Solver-grade CFR/GTO guarantees or a claim of superhuman play.
- Subscriptions, advertising, or other monetization.
- Desktop or web release as a supported Phase 1 product.

These are candidates for later phases after the solo learning loop is proven.

## Delivery milestones

### Milestone 0 — Trusted foundation (complete)

- Expo/React Native product shell with light and dark modes.
- Deterministic heads-up engine and baseline opponent.
- Authenticated Supabase coaching proxy.
- Verified poker-analysis contract and strict structured reviews.
- Coach Details, in-session history, mistake aggregation, and hand replay.

### Milestone 1 — Durable learning data

- Supabase schema, migrations, generated TypeScript types, and RLS.
- Automatic session, hand, analysis, and review persistence.
- Saved Hand History and Progress screens.
- Delete-history control and offline-safe write retry.

### Milestone 2 — Learn loop

- Fundamentals lessons and cheat sheets.
- Percentage trainer and hand quiz.
- Saved completion state and recommendations tied to practice focus.

### Milestone 3 — Practice depth

- Friendly, Club, and Sharp AI presets.
- Scenario training for common preflop, draw, value, and bluff-catching spots.
- Coaching quota, retry states, and performance tuning.

### Milestone 4 — Beta hardening

- Persistence/RLS integration tests and security review.
- Accessibility and small-device layout pass.
- Internal iOS/Android distribution, feedback loop, privacy copy, and release checklist.

## Phase 1 acceptance criteria

- A new player can complete the core journey without encountering a dead or misleading primary action.
- Twenty consecutive automated practice hands complete without an illegal action, chip-conservation failure, or replay mismatch.
- Every displayed poker fact comes from the deterministic analyzer; hosted coaching regressions pass the factual-discipline contract.
- A reviewed hand can be reopened after an app restart and replayed at the coach's focus decision.
- Cross-user attempts to read, update, or delete another player's saved records fail under RLS.
- Normal gameplay works without an OpenAI request; coaching failures never lose the hand history.
- No secret or service-role credential is present in the mobile bundle, repository, or logs.
- Hosted review latency is measured and visible; the beta target is p50 under 8 seconds and p90 under 15 seconds.
- TypeScript, unit tests, mobile production bundling, and secret scanning pass before a beta build.

## Design rules

- Keep one obvious primary action per screen.
- Reveal advanced detail progressively instead of placing all poker math on the table.
- Use plain poker language, define unfamiliar terms, and show percentages with context.
- Grade the decision process, never whether the player happened to win the hand.
- Prefer honest uncertainty over false solver precision.
- Wireframe and review any new primary screen before implementation.

## Phase 1 decisions still to finalize

- Durable sign-in method offered after anonymous use: Apple, email magic link, or both.
- Exact lesson content and starter preflop ranges.
- Difficulty names and the measured behavioral differences between presets.
- Coaching quota per user and the expected monthly API budget.
- Internal beta group, feedback channel, and minimum supported OS versions.
