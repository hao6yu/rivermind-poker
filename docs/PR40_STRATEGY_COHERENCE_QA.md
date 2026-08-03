# PR 40 — Strategy coherence and distinct opponents

## Purpose

Make RiverMind's local opponents behave like their advertised identities while keeping every decision private-information safe, responsive, and consistent with live coaching and final hand grading.

## Engine changes

- Applied each opponent's range tightness, aggression, call tolerance, bluff frequency, sizing preference, and slow-play frequency to the production preflop and postflop paths.
- Added raiser position, prior raise count, callers after the raise, and limper count to preflop decisions.
- Replaced first-acceptable range sampling with weighted candidate-combination sampling.
- Reused the exact live range-equity estimate in post-hand grading when it is available.
- Corrected the multiway simulation identity mapping to match the real table: Mara, Theo, Nova, June, and Sol.
- Added dynamic action pacing so routine unopened preflop actions move faster while raised pots and later streets retain a readable pause.

## Shuffle review

- Every hand creates a fresh 52-card deck and applies a Fisher–Yates permutation to a copy.
- Production practice and tournament deals inject native cryptographic entropy from `expo-crypto`.
- Daily Challenge and tests deliberately inject seeded randomness so the same challenge or test can be reproduced.
- The engine deals all hole cards and board cards from one shuffled deck, removes burn cards before each street, and never reinserts a card.

New shuffle tests verify 52 unique cards, non-mutation, deterministic injected entropy, permutation integrity, and 500 varied duplicate-free generated decks.

## Validation

- `pnpm release:check`
  - release configuration passed
  - Expo dependency compatibility passed
  - TypeScript passed
  - 38 test files / 222 tests passed
  - iOS production export passed
  - Android production export passed
  - tracked-source and export secret scan passed
- A 120-hand six-player Club corpus verifies production-path personality separation:
  - Nova raises more often than Theo.
  - June calls more often than Theo when actually facing a wager.
  - Theo folds more often than June.
- Production decisions remain unchanged when any hidden opponent cards are replaced.

## Simulator note

The Expo bundle launched successfully in Apple Device Hub on the iOS 27 RiverMind iPhone SE simulator and rendered the compact Home layout without an error overlay. Device Hub did not expose embedded simulator taps to the available automation layer, so interaction and pacing claims come from production-path simulations and unit coverage rather than a claimed automated tap-through.

No known rules, privacy, persistence, export, or layout blocker remains in this PR.
