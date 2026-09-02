# Phase 18 — Multiway Learning Loop (Release 1.2)

## Outcome

Release 1.1 made the table bigger: 9-max local AI games, 9-seat private
tables, and a rebuilt game UI. The learning loop on top of that table is still
built for two players. Every graded decision the app shows today comes from
`gradeHeadsUpHand`, whose hand walker assumes `game.button === 'hero' ? 'BTN/SB' : 'BB'`
and a single opponent — so a hero decision in a 9-hand orbit, which is what 1.1
just shipped and what most private tables run, reaches the learner either
ungraded or graded against the wrong shape of spot.

Phase 18 makes the coaching brain match the table:

> Every hand you play — solo, at a 9-max AI table, or in a private table with
> friends — gets reviewed the same way, and you can replay the decision you
> got wrong instead of just reading about it.

This is a single-release theme. It should not ship alongside new table sizes,
new events, or new social surfaces.

## Why this is the highest-leverage next step

- The maths is already paid for. `src/domain/poker/equity.ts` exposes both
  `estimateHeadsUpEquity` and `estimateFieldEquity`, and
  `src/domain/poker/decisionGrading.ts` already carries `position` and
  `playersBehind` per decision and already calls `estimateFieldEquity`. What
  is missing is a multiway hand walker, not a model.
- The review surface already exists. `HandReplayModal`, `SessionHistoryModal`,
  `handHistoryEvidenceController`, and the `session.reviewHands` entry point
  are all in place for heads-up; multiway review is an extension of a surface
  users already have a gesture for.
- Private tables have no review at all. Coaching is deliberately disabled when
  friends are seated (the create screen says so), which is correct for
  etiquette but means the friend-table experience currently ends at a chip
  ledger. Post-hand review is the only place coaching can live there.
- The stats model is too thin to answer "am I improving."
  `PlayStatistics` is `{ hands, tables, wins, splits, bySource, coverage }`.
  There is no spot, position, street, or per-100-hands aggregate anywhere, so
  the app cannot tell a player which part of their game moved.
- Nothing in the product lets a player try the other line. There is no
  sampled-continuation, do-over, or counterfactual code in `src/domain/poker`.
  Reading "you should fold" is the weakest possible feedback loop; playing the
  spot again against a run-out is the strongest one the domain allows.

## Entry conditions

- 1.1.0 approved on both stores and the 1.1 review build not being rebuilt
  (this phase must not require touching the 1.1 binary).
- Phase 17 consent and event contract landed, or explicitly deferred. Track A
  success measures depend on it; the feature work does not.
- Decision D1 below resolved (private-table visibility), because Track A
  assumes private tables are visible to real users in 1.2.
- `multiplayer-room-v4` remains the only lane clients route to. Canonical
  `multiplayer-room` stays frozen.

## Product principles

- **Review is not a second product.** Grading must appear inside the flow that
  already ended the hand — session summary → review hands → the specific
  decision — never as a separate screen to discover.
- **Deterministic, local, offline.** Grading and do-overs run on-device from
  the stored game state. No server round-trip per review, no worker changes.
- **Explain the inputs, not the authority.** Every grade names the facts that
  produced it (position, players behind, stack depth, street, price to call).
  A grade without visible inputs is a verdict, and players distrust verdicts.
- **Sampled truth, labelled as sampled.** A do-over shows a distribution over
  N runs, never a single run-out presented as "what would have happened."
- **Etiquette wins over coaching.** In private tables, hero-only review, always
  off mid-hand, never revealing an opponent's hole cards that the hand archive
  did not already expose.
- **Multiway means the seat, not the button.** Position labels come from the
  real seat map at N players, never from a heads-up `BTN/SB` shortcut.

## Included work

### Track A — Multiway review (core of the release)

**A1. Multiway hand walker and grading (required).**
- New `gradeMultiwayHand(game): HandDecisionReport` alongside the existing
  heads-up grader, sharing `DecisionComparison` / `HandDecisionReport` so
  `HandReplayModal` does not fork.
- Walk all seats: seat → position mapping for 3/6/9 players, per-street action
  order, correct `playersBehind`, hero-relative action context, and
  fold/all-in/uncalled-contributor handling.
- Reuse `estimateFieldEquity` for post-flop lines and the existing preflop
  range path; keep the grade buckets and `focusDecisionSequence` contract.
- Heads-up stays on `gradeHeadsUpHand`. Selection by seat count, not by guess.
- Fail-before/fail-after fixtures: a 9-max hand where hero is UTG with players
  behind must not receive a `BTN/SB` position or `playersBehind: 1`.

**A2. Decision do-overs (required).**
- From any graded hero decision, re-run the spot from that street with the
  alternative legal action, then a sampled continuation to showdown.
- Present as a distribution: win / tie / loss rate and chip range across N
  runs, with N and the seed surfaced in the UI.
- Cap the work per interaction so it never blocks the UI thread on a low-end
  device; budget is an exit gate, measured, not asserted.
- Original line remains visible beside the sampled line. The do-over is a
  teaching device, not a scoreboard.

**A3. Spot-level progress (required).**
- Extend `PlayStatistics` with a versioned per-spot aggregate: position,
  street, and spot family (facing-open, 3-bet, blind-protection, short-stack,
  big-pot), each with hands seen and net chips per 100 hands.
- Chip-based denominators only. This is a play-money app; the label must not
  imply big blinds of real risk.
- Progress screen shows movement between two windows, with a minimum-hands
  floor under each number so a 4-hand spot cannot claim improvement.

**A4. Multiway coach copy (should, can drop).**
- Narrative variants that reference multiway inputs (players behind, squeeze
  spots, ICM-free chip leverage) instead of heads-up phrasing.
- Reuse the existing localization catalog and parity test.
- If A4 slips, ship A1–A3 with factual, input-only copy — never with heads-up
  copy describing a 9-handed spot.

**A5. Private-table review (should, cut first if A1 slips).**
- Hero-only post-session review at private tables, built on the existing hand
  archive path and the existing `Review hands` affordance on the standings
  sheet.
- Mid-hand coaching stays off. Review opens after the session ends.
- Show hero's own cards and public board/action history only.

### Track B — Correctness and trust fixes carried out of 1.1

Each item is small and independently shippable. All are verified findings, not
speculation.

- **B1. Reproduce and root-cause a session that never awaited the creator.**
  Observed on Android against the deployed v4 worker, first room of the night,
  9 seats, 8 AI filled, creator readied up and started normally: **ten hands at
  a 45-second action clock completed in under a minute**, and the creator
  settled "3rd place, 2,000 chips, net change 0". A worker that must wait for a
  human cannot play ten hands in sixty seconds, and a creator posting blinds
  across ten hands at nine-max is unlikely to land on exactly zero. Two later
  sessions, same steps, behaved correctly — the creator was dealt K-3 offsuit
  and the worker visibly held "Your turn" for ten-plus seconds waiting on
  input. So the anomaly is that a session ran to completion without ever
  awaiting the creator's action, not that a room started while the creator was
  unseated. What this is **not**: the client cannot start a table with an
  unready creator. `canStartMultiplayerSnapshot` requires every human seat to be
  `ready && online` in the server snapshot, and `viewerReady` reads that same
  snapshot rather than an optimistic local flag. An earlier draft of this item
  claimed the lobby showed "Waiting for players" while Start was enabled — that
  string is an unconditional static row (`MultiplayerFlowModal.tsx:1746`) and is
  not a state report, so it was never evidence.
  Required next step is a repro, not a fix: script a fresh room, then per hand
  record hero hole cards, hero action prompts, wall time per hand, and the seat
  `participation` value from the hand archive, compared against the control
  session that behaved correctly. If it reproduces, the severity is a host
  silently excluded from their own table, which is a trust bug on a surface that
  ships live in 1.1. If it does not reproduce in about ten scripted attempts,
  downgrade it to an investigation note and move on.
- **B2. Icon-only controls need real labels.** Icon glyphs currently reach the
  accessibility tree as private-use codepoints (`\uf4ac`, `\uf5de`, `\uf133`)
  with no `content-desc`, so TalkBack announces garbage across the table
  screen. This contradicts the documented screen-reader claim and poisons
  every selector-based UI test.
- **B3. Showdown copy agreement.** `multiplayer.result.showdownHand` renders
  "Hao win the showdown with Pair of 7." Audit the whole `{{players}} win`
  family for singular/plural agreement.
- **B4. Crash reporting.** There is no crash or error-reporting SDK in the
  app. On a Play Store population the B1 class of bug is undiagnosable from
  the outside; that is why B1 needed a manual emulator session to find.
  Contingent on decision D2.
- **B5. Route selection safety.** Keep the capability-4 client pinned to
  `multiplayer-room-v4` and add a regression test that a request carrying the
  capability-4 header against legacy `multiplayer-room` is refused with 426 —
  so the lane rule is enforced by a test rather than by memory.
- **B6. Make private-table visibility structural instead of accidental
  (required — the shipping state is now confirmed).** The owner's TestFlight
  1.1 screenshot shows the "Play together" band with `Create table` and `Join
  with code`, so the release build does expose friend tables: the flag is set in
  the EAS environment those builds came from, almost certainly left over from
  the local testing period when it was introduced. The feature ships. What ships
  with it is a landmine:
  - A headline feature is switched on by an environment variable that, by its
    author's account, is no longer used and exists for local testing. The next
    person who tidies the EAS environment — or anyone who builds a release from
    another environment or a fresh checkout — silently removes friend tables. No
    build failure, no test failure, no crash. The only symptom is one missing
    card on one screen.
  - The same flag also gates the flow modal (`AppShell.tsx:2062`), the
    invite-link handler (`:732`), and mid-session resume (`:709`). A build that
    loses the flag also silently breaks invite links and resume, which is what
    makes a friend-table session work at all.
  - No CI step or release check asserts that the built artifact renders the
    entry. This entire investigation happened because the shipping
    configuration was unknowable from inside the repository.
  Work required: delete the flag and its dead branches so the entry, modal,
  link handling, and resume are always compiled in, or drive visibility from a
  real capability probe; keep any dev-only switch out of code paths that gate
  shipped surfaces; and add a build-artifact assertion that the private-table
  entry is present in release builds, so removal becomes a build failure instead
  of a silent product regression. Then verify create, join-by-code, invite link,
  resume-after-kill, and seat lifecycle on both platforms against
  `multiplayer-room-v4` — the worker, migrations, and capability-4 protocol are
  already deployed and were verified end-to-end from Android.
- **B7. CI and device evidence.** CI runs only `pnpm typecheck` and `pnpm
  test`. Add the Android artifact gate (target SDK and 16 KB page size), one
  Android smoke flow, and the B1/B5 regression tests. Retire the
  English-string dependence in Maestro flows: the existing ~93 selectors are
  all `text:` matches on English copy, which breaks on every wording change
  and cannot run against the Chinese locale at all.
- **B8. Copy that promises what a build cannot reach.** `home.allGamesDescription`
  reads "Friends, tournaments, custom tables, and training" and is *not* gated
  by the preview flag, so a build with friend tables compiled out still
  advertises them on Home. Either B6 ships the capability or this string stops
  naming it. Add a check that no shipped string references a compiled-out
  surface.

### Track C — Opponent legibility (delight, only if A ships clean)

- **C1. Table-specific reads.** The opponent profile sheet already works on
  device ("Dex · AI · Pressure · plays more hands, attacks capped ranges").
  Extend it with what this table actually did — hands seen, fold-to-3-bet,
  showdown frequency — so the persona becomes evidence instead of a label.
- **C2. Join friction.** Verify the invite link and `rivermind://` deep link on
  Android. Currently unverified on any platform.

Explicitly out of scope: new seat counts, new tournament events, real-money or
coin economies, ranked ladders, account migration away from anonymous auth,
new locales, a bet-sizing rework, and any server-side game-rule change.

## Decision points (owner input required before build)

- **D1 — Resolved with a confirmed answer.** `EXPO_PUBLIC_MULTIPLAYER_PREVIEW`
  is set in the environment the 1.1 release builds came from: the owner's
  TestFlight 1.1 build shows `Create table` and `Join with code` under "Play
  together". Friend tables ship in 1.1, so this is not a 1.1 blocker. It is a
  1.2 hardening item — see B6.
- **D2 — Crash reporting.** Which SDK, and does it survive the Phase 17
  privacy posture and the "no behavioural telemetry without consent" line?
- **D3 — Chips per 100 hands naming.** Spot-level progress needs a unit that
  reads as play-money. Choose wording before A3 UI work starts.
- **D4 — Do-over cost ceiling.** N runs per do-over, and whether the player can
  opt into a slower, higher-N view. Affects A2 budget and the low-end gate.
- **D5 — Phase 17 ordering.** Ship instrumentation with or before 1.2, or
  accept that Hand Lab impact will be measured by hand.

## Success measures

- Share of completed multiway sessions where the player opens review hands.
- Graded-decision coverage: hero decisions with a grade, in multiway sessions,
  as a percentage of all hero decisions. This is the release's headline number.
- Do-over rate: reviewed decisions where the player tried the other line.
- Repeat: players who open review in one session and return to review later.
- Spot progress: share of players with at least one spot past its minimum-hands
  floor whose rating moves in the direction the review told them to work on.
- Private tables: sessions completed after starting, and creator-excluded
  starts (B1) driven to zero.
- Crash-free sessions after B4, reported by app version and platform.

## Exit gates

- Android and iOS release builds pass the artifact gate; Play requires target
  SDK 36 and 16 KB alignment on 64-bit ABIs.
- Device matrix before any "works on Android" claim: 9-max multiway review,
  360 and 320 dp widths, large-font/text-scale, TalkBack with B2 labels,
  rotation on a portrait-locked table, and a low-end-profile 9-seat session.
- The grading work is proven with paired fail-before/fail-after evidence, and
  a heads-up regression suite proving existing grades did not shift.
- A 9-max hand reviewed on device shows correct seat position, correct players
  behind, and no heads-up copy.
- A do-over shows a distribution with N and seed visible, and its sampled
  outcome never renders as a past-tense fact.
- CI green with the added Android smoke and artifact gate.
- Every `{{players}}`-family string checked in both shipped locales.

## Rough cut

| Slice | Estimate | Ships in 1.2? |
| --- | --- | --- |
| A1 multiway grading | 4–6 d | Required |
| A2 do-overs | 5–7 d | Required |
| A3 spot progress | 3–4 d | Required |
| A4 multiway copy | 2–3 d | Should |
| A5 private-table review | 3–4 d | Should, cut first |
| B1 seat integrity | 1–2 d + repro | Required |
| B2 a11y labels | 1–2 d | Required |
| B3 copy agreement | 0.5 d | Required |
| B4 crash reporting | 1–2 d + D2 | Should |
| B5 lane regression test | 0.5 d | Required |
| B6 structural visibility + artifact assert | 1 d + both-platform QA | Required |
| B7 CI and selectors | 3–4 d | Should |
| B8 copy/capability parity | 0.5 d | Required |
| C1 opponent reads | 3–4 d | Stretch |
| C2 join deep link | 1–2 d | Stretch |

Minimum credible 1.2 is **A1 + A2 + A3 + B6** plus B1, B2, B3, B5, B8. Friend
tables already live in 1.1, so 1.2 gets one coherent sentence: the app can
finally teach the multiway game it is already shipping — and the switch that
decides whether friend tables exist stops being a forgotten environment
variable.
