# AI difficulty ladder: opponent range model and EV-priced aggression

Date: 2026-09-05 (revised the same day after external review)
Status: design approved, revised per review, implementation staged
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

The heads-up results against Club are outside the noise band. The six-max bands all cross
zero: three negative point estimates are jointly suggestive, not individually established.

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
- Elite and Nemesis differ by decimals (raise bias 0.108 vs 0.112, temperature 6.5 vs 6.8).

## 2. Decisions taken

1. All five tiers may change behavior.
2. Success bar: monotonic ladder in duplicate-deal self-play on held-out seeds, Elite and
   Nemesis each beat Club by at least 20 BB/100 heads-up with the lower 2 SE bound above
   zero, positive point estimates at 6-max, and the existing table-dynamics bands still hold.
3. Friendly and Club change for strength calibration only. The beginner and intermediate
   leak library, tilt, line intent, learning rates, and timing changes are slice 2.
4. Opponent model: weighted 1,326-combo range built from the AI's own authored preflop
   tables and narrowed per street by public actions.
5. Opponent memory shifts which hands continue (a mass shift within each class), never a
   uniform multiplier, and the same adjusted response table drives both range narrowing
   and fold prediction.
6. Value and bluff EV use equity against the hands that actually continue against the
   chosen size, not overall equity minus a strength constant.
7. Difficulty is decision quality. No tier is required to be more aggressive than the tier
   below it; Nemesis multiway tuning equals Elite's, and the EV selector decides how often
   to bluff.
8. Overbets are the last stage, with their own authored response row, and only after
   ordinary sizing is calibrated.
9. Coaching, grading, and the range explorer stay on the neutral uniform baseline.
10. Daily Challenge version bumps from 2 to 3.
11. Delivery is staged and measured: each stage ends with a ladder run so the effect of
    that stage alone is known.

## 3. Goals, non-goals, success criteria

Goals: make each tier above Friendly genuinely stronger through hand-reading and priced
aggression; separate Elite and Nemesis by features; measure the ladder honestly.

Non-goals: solver-accurate play; per-opponent statistics UI; coaching changes; new settings.

The benchmark uses two disjoint seed sets. Tuning iterates on the tuning seeds. Claims are
made on the evaluation seeds, which no tuning step may look at.

Success criteria, on the evaluation seeds, recorded in `docs/AI_LADDER_QA.md`:

- Heads-up, 3,000 hands per pair: Elite vs Club and Nemesis vs Club each at least +20
  BB/100 with the lower 2 SE bound above 0.
- Heads-up adjacent pairs, 3,000 hands: positive point estimate. This does not prove each
  step; proving a 10 BB/100 step at 2 SE needs roughly 30,000 hands per pair. One long
  confirmation run (12,000 hands per adjacent pair) is made once before release and its
  bands are reported as they are.
- 6-max, 1,200 hands per pair, three seats per tier: Sharp, Elite, Nemesis each positive
  against Club (point estimate).
- Regression rows reported, no threshold: 6-max per personality style; heads-up with
  adaptation memory enabled against memory disabled on the same deals; the fixed-policy
  rows already in `aiBenchmark.test.ts`.
- Existing dynamics tests pass unchanged: walk rate, showdown share, multiway flop share,
  big-blind defend floor, personality distinctness, chip conservation, legality.
- Six-player and nine-player production-depth Nemesis decisions stay under 1,000 ms.

## 4. Architecture

```
FairDecisionState (own cards + public history)
        │
        ▼
opponentRange.ts ── buildOpponentRange(line, viewerCards, board, profile, classifier) ──► ComboRange
        │                                                                                    │
        │  responseTable(profile): authored rows shifted by memory                          │
        ▼                                                                                    ▼
equity.ts / multiwayEquity.ts ── sample from ComboRange ──► equity vs range
        │                        sample from continuingRange(size) ──► equity when called, per size
        ▼
postflopStrategy.ts (candidates) ──► foldEquity(candidate) from the same response table
        │
        ├─ Club, Sharp: selectPostflopAction (heuristic + fold-equity pricing term)
        └─ Elite, Nemesis: EV selector with calledEquityBySize (heads-up and multiway)
```

New module: `src/domain/poker/opponentRange.ts`. Modified: `equity.ts`, `multiwayEquity.ts`,
`postflopStrategy.ts`, `postflopEv.ts`, `ai.ts`, `multiwayAi.ts`, `aiProfiles.ts`,
`multiwayAiProfiles.ts`, `dailyChallenge.ts`. New benchmark: `aiLadderBenchmark.ts` plus an
opt-in test and `pnpm eval:ai:ladder`. New doc: `docs/AI_LADDER_QA.md`.

## 5. Component design

### 5.1 `opponentRange.ts`

```ts
export interface ComboRange { weights: Float64Array; total: number }   // 1,326 deck-index pairs
export type ComboClass =
  | 'premium' | 'strong' | 'topPair' | 'weakPair' | 'pairPlusDraw'
  | 'draw' | 'weakDraw' | 'boardPlays' | 'air';
export type SizeBucket = 'small' | 'large' | 'overbet';   // ≤½ pot, ≤1 pot, >1 pot

export interface RangeModelProfile {
  archetype: PreflopArchetype;      // roster style for AI seats, 'balanced' for the human
  tier: AiDifficulty;                // table tier for AI seats, 'club' for the human
  rangeTightness?: number;
  bluffAllowance: number;            // floor scale from identity.bluffFrequency
  narrowingStrength: number;         // 0..1
  memory?: OpponentMemory;           // human only, when the caller already supplies it
  memoryStrength: number;            // the tier's memoryStrength
}

export function responseTable(profile: RangeModelProfile): ResponseTable;
export function buildOpponentRange(line, viewerCards, board, profile, classifier): ComboRange;
export function foldShare(range, board, bucket, table, classifier): number;
export function continuingRange(range, board, bucket, table, classifier): ComboRange;
export function strongShare(range, board, classifier): number;
export function createRangeSampler(range): RangeSampler;
```

**Preflop weights come from the tables the AI already plays.** The opponent's public line
selects the table exactly as `buildPreflopPlan` does: position, facing, raise count, open
size, callers, stack band, archetype, tier. For each of the 169 hand classes the plan's
frequency for the observed action (raise leg, call leg, or residual check) multiplies every
combo in that class. Population bands are included because this is opponent modeling.
Combos sharing a card with the viewer's hand or the board get weight zero. A relative floor
of `0.02 × bluffAllowance` applies to every multiplier so no combo reaches zero.

**Memory changes which hands act, never all hands equally.** A uniform multiplier on every
combo's action probability disappears when the range is normalized, so it would do nothing.
Instead the memory read produces two bounded shifts in [−0.5, 0.5]:

- `stickiness` from the observed call-when-facing-a-bet rate against its 0.42 baseline.
  Positive stickiness moves fold mass into call mass for the marginal classes (`topPair`,
  `weakPair`, `pairPlusDraw`, `draw`, `weakDraw`, `boardPlays`); negative moves call mass
  into fold mass. Premium, strong, and air rows do not move.
- `aggression` from the preflop raise rate against 0.22 and the postflop aggression rate
  against 0.34. Positive aggression moves call mass into raise mass (facing a bet) and check
  mass into small-bet mass (checked to) for the marginal and strong classes. Preflop, it
  moves call-leg mass into raise-leg mass within each class, so a frequent 3-bettor is
  modeled as 3-betting hands it would otherwise flat.
- `wide` from the voluntary-entry rate against 0.42 scales each class's preflop continue
  leg by `wide^(1 − continueMass)`, so edge hands move and premiums do not.

Each shift is `clamp(((rate − baseline) / 0.25) × 0.5 × memoryStrength × confidence, −0.5, 0.5)`
with confidence the 20-hand ramp from `describeOpponentRead`. `responseTable(profile)`
returns the authored rows with these shifts applied. Both range narrowing and fold prediction
read that one table, so they cannot disagree.

**Classification is relative to the board.** For each combo on a board:

- `boardPlays`: the board already makes a pair or better and the combo does not improve the
  made-hand category (a hand whose only contribution is a kicker on a paired board, or any
  hand on a board that is itself a straight, flush, or two pair).
- `premium`: straight or better using at least one hole card.
- `strong`: two pair or trips using a hole card, or a pocket pair above the board.
- `topPair`: a pair with the highest board card, no strong draw.
- `weakPair`: any other pair (middle, bottom, or a pocket pair below the top card), no strong draw.
- `pairPlusDraw`: any pair together with a flush draw or open-ended straight draw.
- `draw`: flush draw or open-ended straight draw, no pair.
- `weakDraw`: gutshot only.
- `air`: none of the above.

Classification is computed once per board per decision and shared across every opponent
range, which keeps a nine-seat Nemesis decision inside the latency budget.

**Authored response rows (initial values, a tuning knob).** Facing a bet, columns are
fold / call / raise for the small, large, and overbet buckets:

| Class | small | large | overbet |
| --- | --- | --- | --- |
| premium | 0.02 / 0.58 / 0.40 | 0.03 / 0.67 / 0.30 | 0.04 / 0.66 / 0.30 |
| strong | 0.06 / 0.72 / 0.22 | 0.12 / 0.73 / 0.15 | 0.18 / 0.70 / 0.12 |
| topPair | 0.18 / 0.70 / 0.12 | 0.32 / 0.60 / 0.08 | 0.48 / 0.48 / 0.04 |
| weakPair | 0.42 / 0.54 / 0.04 | 0.64 / 0.34 / 0.02 | 0.80 / 0.19 / 0.01 |
| pairPlusDraw | 0.08 / 0.62 / 0.30 | 0.15 / 0.62 / 0.23 | 0.25 / 0.60 / 0.15 |
| draw | 0.20 / 0.62 / 0.18 | 0.35 / 0.52 / 0.13 | 0.50 / 0.42 / 0.08 |
| weakDraw | 0.55 / 0.40 / 0.05 | 0.75 / 0.22 / 0.03 | 0.88 / 0.11 / 0.01 |
| boardPlays | 0.50 / 0.47 / 0.03 | 0.70 / 0.28 / 0.02 | 0.85 / 0.14 / 0.01 |
| air | 0.88 / 0.08 / 0.04 | 0.94 / 0.04 / 0.02 | 0.97 / 0.02 / 0.01 |

Checked to, columns are bet small / bet large / check (the model never predicts a
spontaneous overbet; overbets by an opponent are read through the facing-bet table):

| Class | bet small | bet large | check |
| --- | ---: | ---: | ---: |
| premium | 0.45 | 0.35 | 0.20 |
| strong | 0.40 | 0.25 | 0.35 |
| topPair | 0.38 | 0.12 | 0.50 |
| weakPair | 0.22 | 0.03 | 0.75 |
| pairPlusDraw | 0.38 | 0.22 | 0.40 |
| draw | 0.30 | 0.20 | 0.50 |
| weakDraw | 0.22 | 0.08 | 0.70 |
| boardPlays | 0.12 | 0.03 | 0.85 |
| air | 0.10 | 0.05 | 0.85 |

A raise over a bet reads as the large bucket unless its increment exceeds the pot, in which
case overbet. `narrowingStrength` interpolates each probability toward 1 so weaker tiers read
hands more coarsely. The overbet column exists from the start so an opponent's overbets are
read correctly; the AI offers its own overbets only in the final stage (5.5).

### 5.2 Equity against the range

`estimateHeadsUpEquity` gains a range-aware sibling, `estimateEquityAgainstRange`, with a
`rangeBlend` in [0, 1]: with probability `rangeBlend` the opponent hand is drawn from the
range, otherwise uniformly. `estimateMultiwayEquity` accepts `ranges` and `rangeBlend` and
draws each opponent the same way. Blend per tier lives in the profile table (5.4).

### 5.3 Priced aggression

**Fold equity.** `buildPostflopPlan` accepts `foldShareBySize` (small, large, overbet), the
probability that every live opponent folds, computed from `foldShare` over each opponent's
range with the same response table used for narrowing. Each aggressive candidate records
`foldEquity` for its bucket. Break-even fold rate for a bluff of fraction f is `f / (1 + f)`.

**Heuristic selector (Friendly, Club, Sharp).** The flat per-tier raise bias, bluff bonus, and
sizing-pressure terms are removed for Sharp, Elite, and Nemesis. Friendly keeps its negative
raise bias, bluff penalty, and call bonus. For bluff and draw candidates with a `foldEquity`,
`score += bluffPricingScale × (foldEquity − breakEven)`. Without a range the bluff candidate
keeps Club's historical −0.04.

**Equity when called.** For each size bucket, `continuingRange` multiplies each combo's weight
by its call-plus-raise probability from the response table; equity against that range, drawn
with the existing samplers at about 40 percent of the tier's sample count, is
`calledEquityBySize`. Multiway uses `estimateMultiwayEquity` with every live opponent's
continuing range at blend 1. This is what the EV selector uses for the called branch of a bet
or raise, replacing the former "overall equity minus a range-strength constant".

**EV selector (Elite and Nemesis, heads-up and multiway).** `estimatePostflopCandidateEv`
uses `candidate.foldEquity` for the all-fold branch and `calledEquityBySize` for the called
branch. A shared `selectPostflopActionByEv` core serves both `selectAdvancedPostflopAction`
(multiway) and a heads-up adapter that builds the EV context from `GameState`.

### 5.4 Tier profile fields

Added to `AiStrategyProfile`; `MultiwayDifficultyTuning` reads the same fields via
`aiStrategyProfile`:

| Tier | rangeBlend | narrowingStrength | memoryStrength | bluffPricingScale | evSelector | sessionRead | overbetCandidate |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| Friendly | 0.0 | 0.0 | 0.35 | 0.0 | no | no | no |
| Club | 0.4 | 0.5 | 0.70 | 0.6 | no | no | no |
| Sharp | 0.7 | 0.8 | 1.00 | 0.9 | no | no | no |
| Elite | 1.0 | 1.0 | 1.15 | n/a | yes | no | no |
| Nemesis | 1.0 | 1.0 | 1.30 | n/a | yes | yes | yes (final stage) |

`memoryStrength` replaces the duplicated `adaptationStrength` records in `ai.ts` and
`multiwayAi.ts`. A profile test asserts monotonicity of the quality knobs only: equity
samples, `rangeBlend`, `narrowingStrength`, `memoryStrength`. No test asserts aggression,
bluff, or sizing order between tiers above Friendly. Friendly's gentleness (fewer bluffs,
smaller bets than Club) is a designed property of that tier and may stay pinned.

Multiway tuning: Nemesis takes Elite's `aggressionScale` 1.22, `bluffScale` 1.3,
`sizingScale` 1.15, and `callTolerance` −0.002, keeping its own `equitySamples` 560 and
`riskPremium` 0.019. The tiers then differ in how they read and price, not in how often they
are told to bet.

The `facingBluffBase`/`openBluffBase` family of fields is used only by
`selectAiActionForEquity`, a fallback path unreachable in production; left untouched.

### 5.5 Nemesis features

**Session read.** A `SessionExploitRead` object owned by the table screen for the life of a
session and passed through decision options. It counts, for the human only and from public
actions: fold to the preflop raiser's flop bet, fold to a re-raise after opening, and call
when facing a river bet. Each rate uses a smoothed prior and a 12-hand confidence ramp.
Nemesis scales continuation-bet pressure, re-raise frequency, and river value-bet frequency by
these rates within [0.7, 1.4]. Nothing is persisted.

**Overbets (final stage only).** When every live opponent's modeled range has a premium-plus-
strong share below 0.25 on the river, `aggressiveCandidates` adds 1.25-pot and 1.5-pot
candidates. They are priced through the overbet column of the response table for fold equity
and equity when called, and compete on EV like any other size. Delivered only after ordinary
sizing has passed the ladder gate.

### 5.6 Heads-up villain identity

`PokerTableScreen` assigns the villain a roster identity for the session. `decideAiAction`
accepts an optional identity and passes archetype, range tightness, and slow-play frequency
into the plan and selection as `multiwayAi.ts` does. `createHand` accepts a villain name,
`createNextHand` carries it, and `formatAction` / `formatLatestAction` read the name from
state instead of the literals "RiverMind" and "Mara".

## 6. Data flow per decision

Heads-up: `decideAiAction` builds the human's `ComboRange` once (profile: balanced, Club,
memory if supplied), estimates equity with the tier's blend, computes fold shares and, when a
bet is legal, equity when called per bucket, builds the plan, and selects via the heuristic or
EV selector by tier.

Multiway: `decideMultiwayAiAction` builds one `ComboRange` per live opponent (AI seats from
roster archetype and roster level, human from balanced Club plus memory), estimates equity,
multiplies fold shares across opponents, estimates equity when called against all continuing
ranges, and proceeds as above.

## 7. Fairness and determinism

The range builder accepts only the branded fair decision states, so hidden cards and the deck
are not reachable by type. Existing tests that mutate hidden cards and assert an unchanged
decision are extended to every tier. All randomness flows through the caller's
`RandomSource`; seeded replays remain identical. `DAILY_CHALLENGE_VERSION` moves from 2 to 3.

## 8. Benchmark

`src/domain/poker/aiLadderBenchmark.ts` exposes `runHeadsUpLadder`, `runSixMaxLadder`,
`runSixMaxStyleRows` (one row per personality, both tiers using that personality), and
`runAdaptationRows` (heads-up sequential sessions, higher tier accumulating public memory of
the lower tier, reported next to the same deals with memory off). All duplicate-deal runs use
production sample depth. Seeds:

| Corpus | Heads-up seed | Six-max seed | Use |
| --- | ---: | ---: | --- |
| tuning | 777,001 | 424,242 | every tuning iteration |
| evaluation | 9,101,113 | 5,150,517 | claims and the QA record; never used while tuning |

`pnpm eval:ai:ladder` runs the tuning corpus by default; `LADDER_CORPUS=evaluation` runs the
held-out corpus. CI does not assert win rates; it pins structure: table selection per public
line, blocker removal, board-relative classification, narrowing monotonicity, fold share falls
as the range strengthens, a memory shift changes fold prediction and range identically, Elite
postflop bluff count within a ratio band of Club on a fixed 100-deal seed, quality-knob
monotonicity, and all existing dynamics bands.

## 9. Staged delivery

Each stage ends with a tuning-corpus ladder run recorded in `docs/AI_LADDER_QA.md`, so the
effect of that stage alone is known before the next one starts.

| Stage | Content | Measured question |
| --- | --- | --- |
| 0 | Benchmark, seeds, baseline on both corpora | Where does the ladder stand |
| 1 | Profile fields, quality monotonicity, Nemesis tuning = Elite, remove flat bluff incentives | How much of the inversion was the incentives alone |
| 2 | Range module, samplers, blended equity, fold-equity pricing in the heuristic selector, heads-up and multiway integration | What hand-reading adds |
| 3 | Continuing ranges, equity when called, EV selector on both paths for Elite and Nemesis | What correct called-equity adds |
| 4 | Calibrate tiers on the tuning corpus, confirm on the evaluation corpus | Does the ladder meet the bar |
| 5 | Nemesis session read, overbets with their response column, villain roster identity | What Nemesis-only features add |
| 6 | Daily version bump, final verification, long confirmation run | Release record |

Tuning order within stage 4: `bluffPricingScale`, `narrowingStrength`, response rows (at most
0.05 per cell per iteration, rows summing to 1), `rangeBlend`, then Friendly and Club knobs
only if a step below Sharp is still inverted.

## 10. Testing

Unit: `opponentRange.test.ts` (table selection, compounding raises, blocker removal,
board-relative classification cases, narrowing, floors, memory shifts change fold prediction
and narrowing identically, sampling distribution matches weights, continuing range is stronger
than the whole range). `postflopEv` and `postflopStrategy` tests for fold equity, removed
bonuses, and called equity by size. Profile quality-knob monotonicity. Fairness at every tier.
Latency for Nemesis six- and nine-player at production depth. Acceptance per section 3.

## 11. Player-facing changes and migration

No new settings, no copy changes. Elite and Nemesis become harder heads-up and at Championship
tables; Sharp reads hands more than Club. The heads-up action feed shows the villain's roster
name. Daily Challenge version bump resets day-to-day comparison once.

## 12. Risks and mitigations

- Latency at 9-max Nemesis: eight ranges plus two extra equity estimates per decision.
  Mitigation: shared classification cache, called-equity estimates at 40 percent depth,
  latency tests at six and nine seats.
- Over-confident ranges make the AI fold too much to aggression. Mitigation: floors,
  `narrowingStrength`, the big-blind defend floor test.
- Overfitting to the benchmark seeds. Mitigation: disjoint tuning and evaluation corpora;
  claims only from the evaluation corpus.
- Dynamics bands drift as bluffs are priced. Mitigation: bands are gates; tune
  `bluffPricingScale` before touching ranges.
- Championship difficulty spike. Mitigation: record before and after Sharp-proxy Final win
  rates from `eval:championship-ai`; target is harder but still completed at a nonzero rate.

## 13. Out of scope (slice 2)

Per-hand line intent across streets, tier leak library, per-identity tilt and mood,
per-identity learning rates and tempo, removal of the heads-up action-dependent delay,
coaching on range-based equity.
