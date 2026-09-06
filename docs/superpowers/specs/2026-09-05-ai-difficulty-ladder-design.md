# AI difficulty ladder: opponent range model and EV-priced aggression

Date: 2026-09-05
Status: design approved in conversation, spec awaiting review
Slice: 1 of 2 (strength calibration). Slice 2 (human feel) is out of scope here.

## 1. Problem and evidence

Five difficulty tiers share one decision pipeline. Above Club, a tier differs mainly by
equity sample count, a wider or narrower preflop band, and flat per-tier constants that
raise aggression and bluff frequency. None of those is hand-reading skill.

Measured 2026-09-05 with duplicate deals (same deal, tiers swapped), production sample
depth, empty opponent memory, both tiers using the balanced personality:

| Heads-up, 3,000 hands | Net for higher tier, BB/100 | 2 SE band |
| --- | ---: | ---: |
| Nemesis vs Friendly | −17.5 | ±39 |
| Nemesis vs Club | −65.3 | ±47 |
| Elite vs Club | −72.1 | ±48 |

| 6-max, 1,200 hands, 3 seats per tier | Net for higher tier, BB/100 seat-hands | 2 SE band |
| --- | ---: | ---: |
| Sharp vs Club | −19.2 | ±26 |
| Elite vs Club | −17.8 | ±30 |
| Nemesis vs Club | −24.2 | ±30 |

Attribution over 1,500 heads-up hands: Elite made 231 postflop bluffs to Club's 37 and lost
2,422 BB gross in hands where it bluffed, more than its entire net deficit. Value-bet counts
were similar. The top tiers donate through bluffs that a plain bluff-catcher calls down.

Root causes in code:

- `estimateHeadsUpEquity` samples the opponent's hand uniformly at every tier. Multiway
  range-weights AI seats from public actions but models the human as a fixed neutral range
  (`GENERIC_HUMAN_RANGE`) that opponent memory never touches.
- `selectPostflopAction` gives Elite and Nemesis a flat bluff bonus of about +0.245 (Club
  −0.04) at a temperature that makes bluff candidates roughly six times as likely.
- The EV selector in `postflopEv.ts` runs only for multiway Elite and Nemesis; heads-up
  Elite and Nemesis use the Club heuristic selector.
- Elite and Nemesis differ by decimals (raise bias 0.108 vs 0.112, temperature 6.5 vs
  6.8). In `MULTIWAY_DIFFICULTY_TUNING` Nemesis is softer than Elite on aggression, bluff
  scale, and call tolerance.

## 2. Decisions taken

1. All five tiers may change behavior.
2. Success bar: monotonic ladder in duplicate-deal self-play (no tier loses to a lower
   tier beyond noise), Elite and Nemesis each beat Club by at least 20 BB/100 heads-up,
   positive at 6-max, and the existing table-dynamics bands still hold.
3. Friendly and Club change for strength calibration only. The beginner and intermediate
   leak library, tilt, line intent, learning rates, and timing changes are slice 2.
4. Opponent model: weighted 1,326-combo range built from the AI's own authored preflop
   tables and narrowed per street by public actions.
5. Opponent memory feeds the human's range model as a bounded prior when memory is supplied.
6. Coaching, grading, and the range explorer stay on the neutral uniform baseline.
7. Daily Challenge version bumps from 2 to 3.

## 3. Goals, non-goals, success criteria

Goals: make each tier above Friendly genuinely stronger through hand-reading and priced
aggression; separate Elite and Nemesis by features; measure the ladder.

Non-goals: solver-accurate play; per-opponent statistics UI; coaching changes; new settings.

Success criteria are the opt-in ladder run results recorded in `docs/AI_LADDER_QA.md`:

- Heads-up: Elite vs Club ≥ +20 BB/100 and Nemesis vs Club ≥ +20 BB/100 at 3,000 hands,
  lower bound of the 2 SE band above 0.
- Heads-up adjacent pairs: no pair's upper 2 SE bound below 0 at 3,000 hands.
- 6-max: Sharp, Elite, Nemesis each positive against Club at 1,200 hands (point estimate).
- Existing dynamics tests pass unchanged: walk rate, showdown share, multiway flop share,
  big-blind defend floor, personality distinctness, chip conservation, legality.
- Six-player production-depth decision stays under 1,000 ms (existing test).

## 4. Architecture

```
FairDecisionState (own cards + public history)
        │
        ▼
opponentRange.ts ── buildOpponentRange(state, opponentId, profile) ──► ComboRange
        │                                                                 │
        │  profile = { archetype, tier, memory? }                         │
        ▼                                                                 ▼
equity.ts / multiwayEquity.ts ── sample hands from ComboRange ──► equity vs range
        │
        ▼
postflopStrategy.ts (candidates) ──► foldEquity(candidate, ComboRange) ──► priced bluffs
        │
        ├─ Club, Sharp: selectPostflopAction (heuristic + fold-equity term)
        └─ Elite, Nemesis: selectAdvancedPostflopAction (EV, HU and multiway)
```

New module: `src/domain/poker/opponentRange.ts`. Modified: `equity.ts`, `multiwayEquity.ts`,
`postflopStrategy.ts`, `postflopEv.ts`, `ai.ts`, `multiwayAi.ts`, `aiProfiles.ts`,
`multiwayAiProfiles.ts`, `dailyChallenge.ts`. New benchmark: `aiLadderBenchmark.ts` plus an
opt-in test and `pnpm eval:ai:ladder`. New doc: `docs/AI_LADDER_QA.md`.

## 5. Component design

### 5.1 `opponentRange.ts`

```ts
export interface ComboRange {
  /** 1,326 entries, one per unordered deck-index pair (i < j); weight 0 for combos blocked by known cards. */
  weights: Float64Array;
  /** Sum of weights, for sampling and share calculations. */
  total: number;
}

export interface RangeModelProfile {
  archetype: PreflopArchetype;      // roster style for AI seats, 'balanced' for the human
  tier: AiDifficulty;                // table tier for AI seats, 'club' for the human
  memory?: OpponentMemory;           // human only, when the caller already supplies it
  memoryStrength: number;            // 0..1.3, the tier's adaptationStrength
  bluffAllowance: number;            // floor scale from identity.bluffFrequency
}

export function buildOpponentRange(
  state: FairHeadsUpDecisionState | FairMultiwayDecisionState,
  opponentId: string,
  viewerCards: readonly Card[],
  profile: RangeModelProfile,
): ComboRange;

export function sampleFromRange(range: ComboRange, excluded: ReadonlySet<string>, random: RandomSource): [Card, Card];

export function foldShare(range: ComboRange, board: readonly Card[], street: Street, sizeBucket: SizeBucket): number;
```

Preflop weights: walk the opponent's preflop actions in history. For each action, resolve
the same table `buildPreflopPlan` would use for that seat: `rfiTable`, `limpedTable`,
`defenseTable(seat, raiserBucket)`, `vsThreeBetTable`, `vsFourBetTable`, using
`seatEquivalent` for short-handed remaps. Apply `applyOpenSizeScale`, `applyOvercallAdjustment`,
`applyShortStack`, `applyArchetype`, `applyTier` exactly as the plan builder does. Population
bands are included (this models an opponent). A raise multiplies each combo by the band's raise
leg, a call by the call leg, a check in the big blind by the residual check mass. Hands absent
from the table receive the floor. A big blind that never acted voluntarily keeps a uniform
range. Repeated raises compound (open then 4-bet uses the RFI raise leg then the vs-3-bet table
raise leg).

Postflop narrowing: on each completed street with at least one opponent action, classify every
combo on that board into one of {premium, strong, marginal-pair, draw, weak-draw, air} using
`evaluateBest` and the draw detector already in `postflopStrategy.ts`. Multiply weights by the
authored continue probability for the observed action and size bucket:

| Class | bet/raise small (≤½ pot) | bet/raise large (>½ pot) | call | check |
| --- | ---: | ---: | ---: | ---: |
| premium | 0.80 | 0.85 | 0.95 | 0.20 |
| strong | 0.70 | 0.65 | 0.90 | 0.35 |
| marginal pair | 0.40 | 0.25 | 0.70 | 0.65 |
| draw | 0.50 | 0.40 | 0.75 | 0.50 |
| weak draw | 0.30 | 0.20 | 0.45 | 0.70 |
| air | 0.15 | 0.12 | 0.10 | 0.85 |

These are initial values and a tuning knob. A per-combo floor of `0.02 × bluffAllowance` is
applied after each multiplication so no combo reaches zero. Facing a check-raise or a
raise-over-bet, use the large bucket. Only opponents still in the hand are modeled.

Memory prior (human seat only, when `memory` is supplied): scale the wide-band weights by
`1 + (voluntaryPreflopRate − 0.42) / 0.25 × 0.5 × memoryStrength × confidence`, scale the
raise-leg share by the same form on `preflopRaiseRate` against 0.22, and scale the postflop
call probabilities by the same form on `callFacingRate` against 0.42. Each scale is clamped to
[0.6, 1.6]. Confidence is `describeOpponentRead(memory).confidence`. Without memory the prior
is 1.

Card removal: any combo containing a viewer card or a board card has weight 0. When several
opponents are sampled in one simulation, sample sequentially and reject combos that collide
with already-sampled cards (bounded retries, then fall back to any unblocked combo).

Cost: one evaluator pass over 1,326 combos per opponent per street, cached per decision;
cumulative weights built once per opponent; binary search per sample.

### 5.2 Equity against the range

`estimateHeadsUpEquity` gains an optional `opponentRange` parameter and a `rangeBlend` in
[0, 1]: with probability `rangeBlend` the opponent hand is drawn from the range, otherwise
uniformly. `estimateMultiwayEquity` replaces `sampleRangeHand` with the same blended draw per
opponent. Blend per tier lives in the profile tables (see 5.4). `inferMultiwayRangeStrength`
stays as a fallback for callers that pass no range (grading, explorer).

### 5.3 Priced aggression

`buildPostflopPlan` accepts an optional `foldShareBySize` map (size bucket → fold share, from
5.1). Each aggressive candidate records `foldEquity`. Break-even fold rate for a bluff of
fraction f is `f / (1 + f)`.

Heuristic selector (`selectPostflopAction`, Friendly, Club and Sharp): remove the positive
`difficultyRaiseBias` values and the flat bluff bonus block for Sharp, Elite and Nemesis, and
the per-size `sizingPressure` term. Friendly keeps its negative raise bias, its bluff penalty,
and its call bonus, since those are its gentleness knobs and Friendly moves only if the ladder
still needs it. Add for bluff and draw candidates
`score += bluffPricingScale × (foldEquity − breakEven)` with `bluffPricingScale` a profile
field (initial Club 0.6, Sharp 0.9, Friendly 0). Keep `difficultyFoldBias`, temperature, and
`mistakePenalty`.

EV selector (`postflopEv.ts`, Elite and Nemesis, heads-up and multiway): replace
`estimatedAllFoldProbability` with the product of per-opponent `foldEquity` from the ranges;
replace `averageOpponentRangeStrength` in `calledEquity` with equity against the range
conditioned on continuing (approximate as equity against the range after applying the
continue probabilities for that size). `ai.ts` routes Elite and Nemesis postflop through
`selectAdvancedPostflopAction`, which needs a heads-up-shaped input; add an adapter that builds
the same `AdvancedPostflopSelectionInput` from `GameState`.

### 5.4 Tier profile fields

Add to `AiStrategyProfile` and `MultiwayDifficultyTuning`:

| Tier | rangeBlend | narrowingStrength | memoryStrength | bluffPricingScale | evSelector | sessionRead | overbetCandidate |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| Friendly | 0.0 | 0.0 | 0.35 | 0.0 | no | no | no |
| Club | 0.4 | 0.5 | 0.70 | 0.6 | no | no | no |
| Sharp | 0.7 | 0.8 | 1.00 | 0.9 | no | no | no |
| Elite | 1.0 | 1.0 | 1.15 | n/a | yes | no | no |
| Nemesis | 1.0 | 1.0 | 1.30 | n/a | yes | yes | yes |

`narrowingStrength` interpolates each continue probability toward 1 (no narrowing) so a weaker
tier reads hands more coarsely. The `facingBluffBase`/`openBluffBase` family of fields is used
only by `selectAiActionForEquity`, a fallback path that is unreachable in production; those
fields and that path are left untouched.

Multiway tuning fix: set Nemesis `aggressionScale ≥ 1.22`, `bluffScale ≥ 1.30`,
`callTolerance ≤ −0.002`, `sizingScale ≥ 1.15`. A unit test asserts the table is monotonic
from Club upward.

### 5.5 Nemesis features

Session read: a `SessionExploitRead` object owned by the table screen for the life of a
session and passed through decision options. It counts, for the human only and from public
actions: fold to continuation bet, fold to 3-bet, river call when facing a bet. Each rate uses
the same smoothed-rate form as `opponentMemory.ts` with a 12-hand ramp. Nemesis scales its
continuation-bet frequency, 3-bet frequency, and river value-bet thinness by these rates within
[0.7, 1.4]. Nothing is persisted.

Overbet candidate: in `aggressiveCandidates`, when the acting tier has `overbetCandidate` and
the modeled human range's share of premium-or-strong combos on the river is below 0.25, add a
1.25-pot and a 1.5-pot candidate to `sizeChoices` for that decision. They compete on EV like
any other size.

### 5.6 Heads-up villain identity

`PokerTableScreen` assigns the villain a roster identity for the session (`multiwayAiIdentityAt`
with the table tier). `decideAiAction` accepts an optional identity and passes its archetype and
slow-play frequency into the preflop plan and postflop selection the way `multiwayAi.ts` does.
`createHand` accepts a villain name, `formatLatestAction` in `gameplayPresentation.ts` and
`formatAction` in `engine.ts` read the name from state instead of the literals "Mara" and
"RiverMind".

## 6. Data flow per decision

Heads-up: `decideAiAction` builds the human's `ComboRange` once from the fair state (profile:
balanced, Club, memory if supplied), estimates equity with the tier's blend, builds the postflop
plan with `foldShareBySize`, then selects via the heuristic or EV selector by tier.

Multiway: `decideMultiwayAiAction` builds one `ComboRange` per live opponent (AI seats from
roster archetype and table tier, human from balanced Club plus memory), estimates equity, and
proceeds as above. The `identities` map already declares which seats are AI.

## 7. Fairness and determinism

The range builder accepts only the branded fair decision states, so hidden cards and the deck
are not reachable by type. Existing tests that mutate hidden cards and assert an unchanged
decision are extended to assert unchanged ranges and fold equities. A new test asserts two
opponents with identical public lines and different hidden cards produce identical ranges.

All randomness flows through the caller's `RandomSource`. Seeded replays remain identical.
`DAILY_CHALLENGE_VERSION` moves from 2 to 3 because seeded Daily outcomes change for everyone.

## 8. Benchmark and tuning

`src/domain/poker/aiLadderBenchmark.ts` exposes `runHeadsUpLadder(pairs, deals, seed)` and
`runSixMaxLadder(pairs, deals, seed)`. Both play duplicate deals at production depth with empty
memory and the balanced personality, and return net BB/100, 2 SE band, showdown rate, and
postflop role counts per tier. The opt-in test `aiLadder.test.ts` is gated by
`RUN_AI_BENCHMARK=1` and wired as `pnpm eval:ai:ladder`. Default corpus: 3,000 heads-up hands
and 1,200 six-max hands per pair; adjacent pairs plus each tier against Club.

Tuning order: Elite and Nemesis vs Club heads-up to ≥ +20 BB/100, then 6-max positive, then
Sharp between Club and Elite, then adjacent pairs non-inverted, then Friendly and Club only if a
step is still inverted. Knobs in order of preference: `bluffPricingScale`, `narrowingStrength`,
continue-probability table, `rangeBlend`. Each step is recorded in `docs/AI_LADDER_QA.md` with
before and after numbers.

CI does not assert win rates. CI pins: table selection per public line, blocker removal,
narrowing monotonicity (a river bluff's fold equity falls as the range strengthens), Elite
postflop bluff count against Club within a ratio band on a fixed 200-hand seed, multiway tuning
monotonicity, and all existing dynamics bands.

## 9. Testing

Unit: `opponentRange.test.ts` (table selection, compounding raises, blocker removal,
narrowing, floors, memory scaling clamps, sampling distribution matches weights). `postflopEv`
and `postflopStrategy` tests for fold equity and the removed bonuses. Profile-table monotonicity
tests. Fairness extensions per section 7. Latency test extended to Nemesis six-player at
production depth under 1,000 ms.

Acceptance: opt-in ladder run per section 8. Existing heads-up pins in `ai.test.ts` that move
are re-pinned with the reason recorded in the QA doc, as PR #49 did.

## 10. Player-facing changes and migration

No new settings, no copy changes. Elite and Nemesis become noticeably harder heads-up and at
Championship tables; Sharp reads hands more than Club. The heads-up action feed shows the
villain's roster name. Daily Challenge version bump resets day-to-day comparison once.
Championship checkpoints are unaffected in format.

## 11. Risks and mitigations

- Latency at 9-max Nemesis: eight ranges per decision. Mitigation: cache per street, cap
  narrowing passes to streets with actions, measure in the extended latency test.
- Over-confident ranges make the AI fold too much to aggression. Mitigation: floors, the
  `narrowingStrength` interpolation, and the big-blind defend floor test.
- Dynamics bands drift (walks, showdowns) as bluffs are priced. Mitigation: bands are gates;
  tune `bluffPricingScale` before touching ranges.
- Championship difficulty spike surprises current players. Mitigation: record before/after
  Sharp-proxy Final win rates from `eval:championship-ai` in the QA doc; the target is "harder
  but still completed by the Sharp proxy at a nonzero rate".
- Memory prior over-fits a short session. Mitigation: confidence ramp and [0.6, 1.6] clamps.

## 12. Out of scope (slice 2)

Per-hand line intent across streets, tier leak library, per-identity tilt and mood,
per-identity learning rates and tempo, removal of the heads-up action-dependent delay,
coaching on range-based equity.
