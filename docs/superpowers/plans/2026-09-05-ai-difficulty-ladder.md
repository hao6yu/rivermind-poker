# AI Difficulty Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every AI tier above Friendly a genuinely stronger poker player by modeling the opponent's range from public actions and pricing aggression by fold equity, then prove the ladder is monotonic with a duplicate-deal benchmark.

**Architecture:** A new pure domain module `opponentRange.ts` turns an opponent's public line into 1,326 weighted hole-card combos using the same authored preflop tables the AI plays and an authored per-street continue table. Equity samplers draw from that range, the postflop plan records fold equity per bet size, the heuristic selector prices bluffs from it instead of flat per-tier bonuses, and the EV selector (now also heads-up for Elite and Nemesis) consumes the same numbers. A benchmark module plays duplicate deals tier against tier and is the merge gate.

**Tech Stack:** TypeScript 5.9, vitest 4, pnpm, Expo/React Native (two screen files touched). Pure domain code under `src/domain/poker/`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-05-ai-difficulty-ladder-design.md`

## Global Constraints

- Node 22 is required and the login shell defaults to Node 16. Prefix every tooling command with `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && `.
- Run single test files with `npx vitest run <path>`; the whole suite with `pnpm test`; types with `pnpm typecheck`.
- Domain files under `src/domain/poker/` import siblings with the explicit `.ts` extension in some files and without in others; match the style of the file you edit. Tests import without the extension.
- The AI may consume only the branded fair decision state (`FairHeadsUpDecisionState`, `FairMultiwayDecisionState`) plus its own hole cards. Never read another seat's `holeCards` or the `deck`.
- All randomness flows through the caller-supplied `RandomSource`; never call `Math.random` in domain code.
- Only the acting seat's cards and public information decide an action. Every new decision input must pass the existing "hidden cards changed, decision unchanged" tests.
- Friendly keeps uniform-random equity (`rangeBlend` 0) and its current gentleness knobs. Coaching, grading, and the range explorer keep the neutral uniform baseline.
- Commit after each task with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. The working tree already holds unrelated uncommitted changes; stage only the files named in the task.
- Existing dynamics tests must keep passing: big-blind defend floor, walk rate, showdown share, multiway flop share, personality distinctness, chip conservation, legality. If a heads-up pin in `ai.test.ts` moves, re-pin it and record the reason in `docs/AI_LADDER_QA.md`.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/domain/poker/aiLadderBenchmark.ts` (new) | Duplicate-deal heads-up and 6-max tier-vs-tier runner; returns net BB/100 with 2 SE band |
| `src/domain/poker/__tests__/aiLadder.test.ts` (new) | Cheap structural test always; full corpus behind `RUN_AI_BENCHMARK=1` |
| `src/domain/poker/aiProfiles.ts` | Adds ladder fields to `AiStrategyProfile`; single source for per-tier range and pricing knobs |
| `src/domain/poker/multiwayAiProfiles.ts` | Fixes the Nemesis-softer-than-Elite tuning inversion |
| `src/domain/poker/opponentRange.ts` (new) | Combo range: preflop weights from tables, postflop narrowing, memory prior, sampling, fold share, range strength |
| `src/domain/poker/__tests__/opponentRange.test.ts` (new) | Unit tests for the range module |
| `src/domain/poker/postflopStrategy.ts` | Exports the draw detector; records `foldEquity` per candidate; accepts extra sizes; priced bluff term replaces flat bonuses |
| `src/domain/poker/equity.ts` | `estimateEquityAgainstRange` |
| `src/domain/poker/multiwayEquity.ts` | Optional `ranges` and `rangeBlend`; exports the generic human range id |
| `src/domain/poker/postflopEv.ts` | Uses `candidate.foldEquity`; shared EV selector core; heads-up adapter |
| `src/domain/poker/sessionExploitRead.ts` (new) | Nemesis per-session public counters and their bounded scales |
| `src/domain/poker/ai.ts` | Heads-up integration: range, blended equity, priced plan, EV selector by tier, identity and session read options |
| `src/domain/poker/multiwayAi.ts` | Multiway integration: one range per live opponent, product fold equity, overbet candidate, session read |
| `src/domain/poker/multiwaySession.ts` | `decideSessionAiAction` gains `sessionRead` |
| `src/domain/poker/engine.ts` | `villainName` option; `formatAction` reads the name |
| `src/features/table/gameplayPresentation.ts` | `formatLatestAction` reads the name |
| `src/features/table/PokerTableScreen.tsx` | Villain roster identity; session read ref; passes both to the AI |
| `src/features/table/MultiwayPokerTableScreen.tsx` | Session read ref; passes it through |
| `src/domain/poker/dailyChallenge.ts` | `DAILY_CHALLENGE_VERSION` 2 → 3 |
| `docs/AI_LADDER_QA.md` (new) | Baseline numbers, every tuning step, re-pins and reasons |
| `docs/AI_DIFFICULTY_PRESETS.md` | Updated tier table and benchmark section |
| `package.json` | `eval:ai:ladder` script |

---

### Task 1: Ladder benchmark module, opt-in gate, and baseline record

**Files:**
- Create: `src/domain/poker/aiLadderBenchmark.ts`
- Create: `src/domain/poker/__tests__/aiLadder.test.ts`
- Create: `docs/AI_LADDER_QA.md`
- Modify: `package.json` (scripts block, next to `eval:ai:strength`)

**Interfaces:**
- Consumes: `createHand`, `applyAction` from `engine.ts`; `decideAiAction` from `ai.ts`; `createMultiwayHand`, `applyMultiwayAction` from `multiway.ts`; `decideMultiwayAiAction` from `multiwayAi.ts`; `multiwayAiIdentityForName` from `multiwayAiProfiles.ts`; `createFairHeadsUpDecisionState`, `createFairMultiwayDecisionState` from `fairness.ts`; `seededRandom` from `cards.ts`.
- Produces:
  ```ts
  export interface LadderMatchupResult {
    matchup: string; higher: AiDifficulty; lower: AiDifficulty; hands: number;
    netBbForHigher: number; bbPer100: number; plusMinusPer100: number; showdownPct: number;
    postflopRaiseStyles: { higher: Record<string, number>; lower: Record<string, number> };
  }
  export const DEFAULT_LADDER_PAIRS: ReadonlyArray<readonly [AiDifficulty, AiDifficulty]>;
  export function runHeadsUpLadder(pairs, deals: number, seed: number): LadderMatchupResult[];
  export function runSixMaxLadder(pairs, deals: number, seed: number): LadderMatchupResult[];
  ```

- [ ] **Step 1: Write the failing structural test**

Create `src/domain/poker/__tests__/aiLadder.test.ts`:

```ts
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LADDER_PAIRS,
  runHeadsUpLadder,
  runSixMaxLadder,
} from '../aiLadderBenchmark';

describe('AI ladder benchmark structure', () => {
  it('plays duplicate deals heads-up and reports a symmetric result shape', () => {
    const [result] = runHeadsUpLadder([['club', 'friendly']], 4, 11);
    expect(result).toBeDefined();
    expect(result!.hands).toBe(8);
    expect(result!.matchup).toBe('club vs friendly');
    expect(Number.isFinite(result!.bbPer100)).toBe(true);
    expect(result!.plusMinusPer100).toBeGreaterThanOrEqual(0);
    expect(result!.showdownPct).toBeGreaterThanOrEqual(0);
    expect(result!.showdownPct).toBeLessThanOrEqual(100);
  });

  it('cancels card luck: a tier against itself nets exactly zero', () => {
    const [result] = runHeadsUpLadder([['club', 'club']], 6, 23);
    expect(result!.netBbForHigher).toBeCloseTo(0, 6);
    const [sixMax] = runSixMaxLadder([['club', 'club']], 2, 23);
    expect(sixMax!.netBbForHigher).toBeCloseTo(0, 6);
  });

  it('plays 6-max with three seats per tier and conserves hands', () => {
    const [result] = runSixMaxLadder([['sharp', 'club']], 2, 31);
    expect(result!.hands).toBe(4);
    expect(result!.matchup).toBe('sharp vs club');
  });
});

// Opt-in merge gate for the difficulty ladder. Slow: production sample depth.
describe.skipIf(process.env.RUN_AI_BENCHMARK !== '1')('AI ladder benchmark corpus', () => {
  it('reports every pair heads-up and six-max', () => {
    const huDeals = Number(process.env.LADDER_HU_DEALS ?? 1_500);
    const mwDeals = Number(process.env.LADDER_MW_DEALS ?? 600);
    const rows = [
      ...runHeadsUpLadder(DEFAULT_LADDER_PAIRS, huDeals, 777_001),
      ...runSixMaxLadder(DEFAULT_LADDER_PAIRS, mwDeals, 424_242),
    ];
    console.log('AI_LADDER', JSON.stringify(rows));
    if (process.env.AI_BENCHMARK_OUTPUT) {
      writeFileSync(process.env.AI_BENCHMARK_OUTPUT, JSON.stringify(rows, null, 2));
    }
    expect(rows.length).toBe(DEFAULT_LADDER_PAIRS.length * 2);
  }, 3_600_000);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/aiLadder.test.ts`
Expected: FAIL, cannot resolve `../aiLadderBenchmark`.

- [ ] **Step 3: Write the benchmark module**

Create `src/domain/poker/aiLadderBenchmark.ts`:

```ts
import type { AiDifficulty } from './aiProfiles.ts';
import { decideAiAction } from './ai.ts';
import { seededRandom, type RandomSource } from './cards.ts';
import { applyAction, createHand } from './engine.ts';
import { createFairHeadsUpDecisionState, createFairMultiwayDecisionState } from './fairness.ts';
import { applyMultiwayAction, createMultiwayHand, type TablePlayerConfig } from './multiway.ts';
import { decideMultiwayAiAction } from './multiwayAi.ts';
import { multiwayAiIdentityForName } from './multiwayAiProfiles.ts';
import type { PlayerId } from './types.ts';

export interface LadderMatchupResult {
  matchup: string;
  higher: AiDifficulty;
  lower: AiDifficulty;
  hands: number;
  netBbForHigher: number;
  bbPer100: number;
  /** Half-width of the 2-standard-error band, in BB per 100 hands of the higher tier. */
  plusMinusPer100: number;
  showdownPct: number;
  postflopRaiseStyles: { higher: Record<string, number>; lower: Record<string, number> };
}

export const DEFAULT_LADDER_PAIRS: ReadonlyArray<readonly [AiDifficulty, AiDifficulty]> = [
  ['club', 'friendly'],
  ['sharp', 'club'],
  ['elite', 'sharp'],
  ['nemesis', 'elite'],
  ['elite', 'club'],
  ['nemesis', 'club'],
];

const STARTING_STACK = 1_000;
const SIX_MAX_SEATS = 6;

function summarize(
  higher: AiDifficulty,
  lower: AiDifficulty,
  perDeal: number[],
  handsPlayed: number,
  higherSeatHands: number,
  showdowns: number,
  styles: LadderMatchupResult['postflopRaiseStyles'],
): LadderMatchupResult {
  const n = perDeal.length;
  const total = perDeal.reduce((sum, value) => sum + value, 0);
  const mean = n === 0 ? 0 : total / n;
  const variance = n < 2 ? 0 : perDeal.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1);
  const standardError = Math.sqrt(variance / Math.max(1, n));
  const seatHandsPerDeal = higherSeatHands / Math.max(1, n);
  return {
    matchup: `${higher} vs ${lower}`,
    higher,
    lower,
    hands: handsPlayed,
    netBbForHigher: Math.round(total * 10) / 10,
    bbPer100: Math.round((total / Math.max(1, higherSeatHands)) * 100 * 10) / 10,
    plusMinusPer100: Math.round((2 * standardError / seatHandsPerDeal) * 100 * 10) / 10,
    showdownPct: Math.round((showdowns / Math.max(1, handsPlayed)) * 1_000) / 10,
    postflopRaiseStyles: styles,
  };
}

function bump(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function playHeadsUpDeal(
  seed: number,
  dealIndex: number,
  tiers: Record<PlayerId, AiDifficulty>,
  styles: Record<PlayerId, Record<string, number>>,
): { delta: Record<PlayerId, number>; showdown: boolean } {
  let state = createHand({
    button: dealIndex % 2 === 0 ? 'hero' : 'villain',
    random: seededRandom(seed),
  });
  const rng: Record<PlayerId, RandomSource> = {
    hero: seededRandom(seed * 7 + 1),
    villain: seededRandom(seed * 11 + 3),
  };
  for (let step = 0; step < 60 && state.street !== 'complete'; step += 1) {
    const actor = state.toAct;
    if (!actor) throw new Error('A live ladder hand has no player to act.');
    const decision = decideAiAction(
      createFairHeadsUpDecisionState(state, actor),
      actor,
      rng[actor],
      tiers[actor],
    );
    if (decision.action.type === 'raise' && state.street !== 'preflop') bump(styles[actor], decision.style);
    state = applyAction(state, actor, decision.action);
  }
  if (state.street !== 'complete') throw new Error(`Ladder deal ${dealIndex} did not finish.`);
  return {
    delta: {
      hero: (state.players.hero.stack - STARTING_STACK) / state.bigBlind,
      villain: (state.players.villain.stack - STARTING_STACK) / state.bigBlind,
    },
    showdown: state.outcome?.showdown ?? false,
  };
}

/**
 * Duplicate deals: each seeded deal is played twice with the tiers swapped, so
 * card luck and seat order cancel and only the decision policy differs.
 */
export function runHeadsUpLadder(
  pairs: ReadonlyArray<readonly [AiDifficulty, AiDifficulty]>,
  deals: number,
  seed: number,
): LadderMatchupResult[] {
  return pairs.map(([higher, lower]) => {
    const perDeal: number[] = [];
    let showdowns = 0;
    const higherStyles: Record<string, number> = {};
    const lowerStyles: Record<string, number> = {};
    for (let deal = 0; deal < deals; deal += 1) {
      const dealSeed = seed + deal * 131;
      const first = playHeadsUpDeal(dealSeed, deal, { hero: higher, villain: lower }, { hero: higherStyles, villain: lowerStyles });
      const second = playHeadsUpDeal(dealSeed, deal, { hero: lower, villain: higher }, { hero: lowerStyles, villain: higherStyles });
      perDeal.push(first.delta.hero + second.delta.villain);
      showdowns += Number(first.showdown) + Number(second.showdown);
    }
    return summarize(higher, lower, perDeal, deals * 2, deals * 2, showdowns, { higher: higherStyles, lower: lowerStyles });
  });
}

function sixMaxPlayers(): TablePlayerConfig[] {
  return Array.from({ length: SIX_MAX_SEATS }, (_, seat) => ({
    id: `p${seat}`,
    name: `Seat ${seat}`,
    seat,
    stack: STARTING_STACK,
  }));
}

function playSixMaxDeal(
  seed: number,
  dealIndex: number,
  tiers: readonly AiDifficulty[],
  higher: AiDifficulty,
  styles: LadderMatchupResult['postflopRaiseStyles'],
): { higherDeltaBb: number; showdown: boolean } {
  const identity = multiwayAiIdentityForName('Kai');
  if (!identity) throw new Error('The balanced benchmark identity is missing from the roster.');
  const players = sixMaxPlayers();
  const identities = Object.fromEntries(players.map((player) => [player.id, identity]));
  let state = createMultiwayHand({ players, buttonSeat: dealIndex % SIX_MAX_SEATS, random: seededRandom(seed) });
  const rng = players.map((_, seat) => seededRandom(seed * 13 + seat * 7 + 1));
  for (let step = 0; step < 240 && state.street !== 'complete'; step += 1) {
    const actor = state.toAct;
    if (!actor) throw new Error('A live ladder table has no player to act.');
    const seat = state.players[actor]?.seat;
    if (seat === undefined) throw new Error(`Seat for ${actor} is missing.`);
    const decision = decideMultiwayAiAction(createFairMultiwayDecisionState(state, actor), actor, {
      difficulty: tiers[seat],
      identity,
      identities,
      random: rng[seat],
    });
    if (decision.action.type === 'raise' && state.street !== 'preflop') {
      bump(tiers[seat] === higher ? styles.higher : styles.lower, decision.style);
    }
    state = applyMultiwayAction(state, actor, decision.action);
  }
  if (state.street !== 'complete') throw new Error(`Ladder table deal ${dealIndex} did not finish.`);
  const higherDeltaBb = players.reduce((sum, player) => (
    tiers[player.seat] === higher
      ? sum + ((state.players[player.id]?.stack ?? STARTING_STACK) - STARTING_STACK) / state.bigBlind
      : sum
  ), 0);
  return { higherDeltaBb, showdown: Boolean(state.outcome?.showdown) };
}

/**
 * Six seats, alternating tiers, same balanced personality in every seat. Each
 * deal is played twice with the pattern flipped so each seat hosts each tier once.
 */
export function runSixMaxLadder(
  pairs: ReadonlyArray<readonly [AiDifficulty, AiDifficulty]>,
  deals: number,
  seed: number,
): LadderMatchupResult[] {
  return pairs.map(([higher, lower]) => {
    const patternA = Array.from({ length: SIX_MAX_SEATS }, (_, seat) => (seat % 2 === 0 ? higher : lower));
    const patternB = Array.from({ length: SIX_MAX_SEATS }, (_, seat) => (seat % 2 === 0 ? lower : higher));
    const perDeal: number[] = [];
    let showdowns = 0;
    const styles = { higher: {} as Record<string, number>, lower: {} as Record<string, number> };
    for (let deal = 0; deal < deals; deal += 1) {
      const dealSeed = seed + deal * 211;
      const first = playSixMaxDeal(dealSeed, deal, patternA, higher, styles);
      const second = playSixMaxDeal(dealSeed, deal, patternB, higher, styles);
      perDeal.push(first.higherDeltaBb + second.higherDeltaBb);
      showdowns += Number(first.showdown) + Number(second.showdown);
    }
    // Each deal gives the higher tier SIX_MAX_SEATS seat-hands across the two games.
    return summarize(higher, lower, perDeal, deals * 2, deals * SIX_MAX_SEATS, showdowns, styles);
  });
}
```

- [ ] **Step 4: Run the structural tests**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/aiLadder.test.ts`
Expected: 3 passed, 1 skipped.

- [ ] **Step 5: Add the pnpm script**

In `package.json`, directly after the `"eval:ai:strength"` line add:

```json
    "eval:ai:ladder": "RUN_AI_BENCHMARK=1 vitest run src/domain/poker/__tests__/aiLadder.test.ts --disableConsoleIntercept",
```

- [ ] **Step 6: Record the baseline**

Run (about 25 minutes): `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && AI_BENCHMARK_OUTPUT=/tmp/ladder-baseline.json pnpm eval:ai:ladder`

Create `docs/AI_LADDER_QA.md`:

```markdown
# AI difficulty ladder QA

Spec: docs/superpowers/specs/2026-09-05-ai-difficulty-ladder-design.md

Method: `pnpm eval:ai:ladder`. Duplicate deals, production sample depth, empty opponent
memory, balanced personality in every seat. Heads-up 3,000 hands per pair (1,500 deals x 2),
six-max 1,200 hands per pair (600 deals x 2, three seats per tier). Positive numbers mean the
higher tier won chips. `±` is the 2-standard-error half-width in BB per 100.

## Baseline before this slice (commit <fill with git rev-parse --short HEAD>)

Paste the `AI_LADDER` JSON rows as a table with columns: matchup, hands, bbPer100,
plusMinusPer100, showdownPct, higher-tier bluff count, lower-tier bluff count.

Spike measurement from 2026-09-05 for reference (different seeds): heads-up Elite vs Club
−72.1 ±48, Nemesis vs Club −65.3 ±47, Nemesis vs Friendly −17.5 ±39; six-max Sharp vs Club
−19.2 ±26, Elite vs Club −17.8 ±30, Nemesis vs Club −24.2 ±30.

## Tuning steps

One subsection per knob change, in order: what changed, why, the new ladder rows.

## Re-pinned tests

One line per changed expectation: test name, old value, new value, reason.
```

Replace the `<fill ...>` marker with the actual short commit hash and paste the actual table.

- [ ] **Step 7: Commit**

```bash
git add src/domain/poker/aiLadderBenchmark.ts src/domain/poker/__tests__/aiLadder.test.ts docs/AI_LADDER_QA.md package.json
git commit -m "test: add duplicate-deal AI ladder benchmark and record baseline

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Ladder fields on the tier profiles and the multiway tuning fix

**Files:**
- Modify: `src/domain/poker/aiProfiles.ts`
- Modify: `src/domain/poker/multiwayAiProfiles.ts` (the `MULTIWAY_DIFFICULTY_TUNING` table)
- Modify: `src/domain/poker/ai.ts:20-26` and `src/domain/poker/multiwayAi.ts:63-69` (delete the duplicated `adaptationStrength` records)
- Test: `src/domain/poker/__tests__/ai.test.ts`, `src/domain/poker/__tests__/multiwayAi.test.ts`

**Interfaces:**
- Produces on `AiStrategyProfile`:
  ```ts
  rangeBlend: number;          // 0..1 share of equity samples drawn from the modeled range
  narrowingStrength: number;   // 0..1, interpolates postflop continue probabilities toward 1
  memoryStrength: number;      // replaces the adaptationStrength maps (0.35, 0.7, 1, 1.15, 1.3)
  bluffPricingScale: number;   // heuristic selector weight on (foldEquity - breakEven)
  evSelector: boolean;         // Elite and Nemesis: EV selector heads-up and multiway
  sessionRead: boolean;        // Nemesis only
  overbetCandidate: boolean;   // Nemesis only
  ```

- [ ] **Step 1: Write the failing tests**

Append to the `describe('AI difficulty profiles', ...)` block in `src/domain/poker/__tests__/ai.test.ts`:

```ts
  it('defines a monotonic hand-reading ladder in the profile table', () => {
    const order = ['friendly', 'club', 'sharp', 'elite', 'nemesis'] as const;
    const profiles = order.map((tier) => AI_STRATEGY_PROFILES[tier]);
    expect(profiles.map((profile) => profile.rangeBlend)).toEqual([0, 0.4, 0.7, 1, 1]);
    expect(profiles.map((profile) => profile.narrowingStrength)).toEqual([0, 0.5, 0.8, 1, 1]);
    expect(profiles.map((profile) => profile.memoryStrength)).toEqual([0.35, 0.7, 1, 1.15, 1.3]);
    expect(profiles.map((profile) => profile.bluffPricingScale)).toEqual([0, 0.6, 0.9, 0, 0]);
    expect(profiles.map((profile) => profile.evSelector)).toEqual([false, false, false, true, true]);
    expect(profiles.map((profile) => profile.sessionRead)).toEqual([false, false, false, false, true]);
    expect(profiles.map((profile) => profile.overbetCandidate)).toEqual([false, false, false, false, true]);
  });
```

Append to `describe('multiway AI identities and decisions', ...)` in `src/domain/poker/__tests__/multiwayAi.test.ts` (import `MULTIWAY_DIFFICULTY_TUNING` from `'../multiwayAiProfiles'`):

```ts
  it('never tunes a higher tier softer than the tier below it from Club upward', () => {
    const order = ['club', 'sharp', 'elite', 'nemesis'] as const;
    for (let index = 1; index < order.length; index += 1) {
      const lower = MULTIWAY_DIFFICULTY_TUNING[order[index - 1]!];
      const higher = MULTIWAY_DIFFICULTY_TUNING[order[index]!];
      expect(higher.aggressionScale, order[index]).toBeGreaterThanOrEqual(lower.aggressionScale);
      expect(higher.bluffScale, order[index]).toBeGreaterThanOrEqual(lower.bluffScale);
      expect(higher.sizingScale, order[index]).toBeGreaterThanOrEqual(lower.sizingScale);
      expect(higher.callTolerance, order[index]).toBeLessThanOrEqual(lower.callTolerance);
      expect(higher.equitySamples, order[index]).toBeGreaterThan(lower.equitySamples);
    }
  });
```

- [ ] **Step 2: Run both tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/ai.test.ts src/domain/poker/__tests__/multiwayAi.test.ts -t "monotonic|softer"`
Expected: both FAIL (missing fields; Nemesis `aggressionScale` 1.18 < Elite 1.22).

- [ ] **Step 3: Add the fields**

In `src/domain/poker/aiProfiles.ts`, extend the interface after `bluffPotFraction: number;`:

```ts
  /** Share of equity samples drawn from the modeled opponent range (0 = uniform random). */
  rangeBlend: number;
  /** 0 = no postflop narrowing; 1 = full authored continue probabilities. */
  narrowingStrength: number;
  /** Weight applied to the bounded public-action adaptation and the memory range prior. */
  memoryStrength: number;
  /** Heuristic selector weight on (fold equity − break-even fold rate) for bluffs and draws. */
  bluffPricingScale: number;
  /** Select postflop actions by bounded EV instead of the heuristic scorer. */
  evSelector: boolean;
  /** Use the per-session public exploit read. */
  sessionRead: boolean;
  /** Offer 1.25x and 1.5x pot river bets against a capped modeled range. */
  overbetCandidate: boolean;
```

Add to each profile literal (values per tier):

```ts
    // friendly
    rangeBlend: 0, narrowingStrength: 0, memoryStrength: 0.35, bluffPricingScale: 0,
    evSelector: false, sessionRead: false, overbetCandidate: false,
    // club
    rangeBlend: 0.4, narrowingStrength: 0.5, memoryStrength: 0.7, bluffPricingScale: 0.6,
    evSelector: false, sessionRead: false, overbetCandidate: false,
    // sharp
    rangeBlend: 0.7, narrowingStrength: 0.8, memoryStrength: 1, bluffPricingScale: 0.9,
    evSelector: false, sessionRead: false, overbetCandidate: false,
    // elite
    rangeBlend: 1, narrowingStrength: 1, memoryStrength: 1.15, bluffPricingScale: 0,
    evSelector: true, sessionRead: false, overbetCandidate: false,
    // nemesis
    rangeBlend: 1, narrowingStrength: 1, memoryStrength: 1.3, bluffPricingScale: 0,
    evSelector: true, sessionRead: true, overbetCandidate: true,
```

In `src/domain/poker/multiwayAiProfiles.ts`, change the `nemesis` tuning literal to:

```ts
  nemesis: {
    difficulty: 'nemesis',
    equitySamples: 560,
    aggressionScale: 1.24,
    bluffScale: 1.32,
    sizingScale: 1.16,
    callTolerance: -0.004,
    riskPremium: 0.019,
  },
```

In `src/domain/poker/ai.ts` delete the `adaptationStrength` record (lines 20 to 26) and replace its use in `decideAiAction` with `profile.memoryStrength`. In `src/domain/poker/multiwayAi.ts` delete the `adaptationStrength` record (lines 63 to 69), import `aiStrategyProfile` from `'./aiProfiles.ts'`, and replace `adaptationStrength[difficulty]` with `aiStrategyProfile(difficulty).memoryStrength`.

- [ ] **Step 4: Run the two test files and typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/ai.test.ts src/domain/poker/__tests__/multiwayAi.test.ts && pnpm typecheck`
Expected: all pass, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/domain/poker/aiProfiles.ts src/domain/poker/multiwayAiProfiles.ts src/domain/poker/ai.ts src/domain/poker/multiwayAi.ts src/domain/poker/__tests__/ai.test.ts src/domain/poker/__tests__/multiwayAi.test.ts
git commit -m "feat(ai): add ladder fields to tier profiles and fix Nemesis multiway tuning inversion

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Opponent range module, preflop weights from the authored tables

**Files:**
- Create: `src/domain/poker/opponentRange.ts`
- Create: `src/domain/poker/__tests__/opponentRange.test.ts`

**Interfaces:**
- Consumes: `buildPreflopPlan`, `classifyPreflopHand`, `preflopGridCards`, `PreflopFacing`, `PreflopRangeInput` from `preflopStrategy.ts`; `HAND_CLASS_KEYS`, `PreflopArchetype` from `preflopRanges.ts`; `createDeck`, `cardKey` from `cards.ts`; `TablePosition` from `multiway.ts`; `AiDifficulty` from `aiProfiles.ts`.
- Produces:
  ```ts
  export const COMBO_COUNT = 1326;
  export const COMBOS: ReadonlyArray<readonly [Card, Card]>;   // deck-index pairs i < j
  export interface ComboRange { weights: Float64Array; total: number }
  export interface PublicPreflopAction {
    type: 'raise' | 'call' | 'check'; facing: PreflopFacing; raiseCount: number; raiseSizeBb?: number;
    raiserPosition?: TablePosition; callersAfterRaise: number; limperCount: number; canCheck: boolean;
  }
  export interface RangeModelProfile {
    archetype: PreflopArchetype; tier: AiDifficulty; rangeTightness?: number; bluffAllowance: number;
    narrowingStrength: number; memory?: OpponentMemory; memoryStrength: number;
  }
  export function uniformRange(blocked: readonly Card[]): ComboRange;
  export function applyPreflopActions(range: ComboRange, actions: readonly PublicPreflopAction[],
    spot: { position: TablePosition; playerCount: number; effectiveStackBb: number }, profile: RangeModelProfile): ComboRange;
  export function comboShare(range: ComboRange, predicate: (combo: readonly [Card, Card]) => boolean): number;
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/domain/poker/__tests__/opponentRange.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  COMBOS,
  COMBO_COUNT,
  applyPreflopActions,
  comboShare,
  uniformRange,
  type RangeModelProfile,
} from '../opponentRange';
import { classifyPreflopHand } from '../preflopStrategy';
import type { Card } from '../types';

const club: RangeModelProfile = {
  archetype: 'balanced', tier: 'club', bluffAllowance: 1, narrowingStrength: 1, memoryStrength: 0,
};

function isClass(keys: readonly string[]): (combo: readonly [Card, Card]) => boolean {
  const set = new Set(keys);
  return (combo) => set.has(classifyPreflopHand(combo).key);
}

describe('opponent range: combos and blockers', () => {
  it('enumerates 1,326 distinct unordered combos', () => {
    expect(COMBOS.length).toBe(COMBO_COUNT);
    const seen = new Set(COMBOS.map(([a, b]) => `${a.rank}${a.suit}|${b.rank}${b.suit}`));
    expect(seen.size).toBe(COMBO_COUNT);
  });

  it('gives blocked combos zero weight and everything else equal weight', () => {
    const range = uniformRange([{ rank: 14, suit: 'spades' }, { rank: 13, suit: 'spades' }]);
    const blocked = COMBOS.filter(([a, b]) => [a, b].some((c) => c.suit === 'spades' && (c.rank === 14 || c.rank === 13)));
    expect(blocked.length).toBe(51 + 50);
    blocked.forEach(([a, b]) => {
      const index = COMBOS.findIndex(([x, y]) => x === a && y === b);
      expect(range.weights[index]).toBe(0);
    });
    expect(range.total).toBeCloseTo(COMBO_COUNT - 101, 6);
  });
});

describe('opponent range: preflop weights from the authored tables', () => {
  it('weights a button opener by the RFI raise leg, so AA dominates 72o', () => {
    const range = applyPreflopActions(uniformRange([]), [
      { type: 'raise', facing: 'unopened', raiseCount: 0, callersAfterRaise: 0, limperCount: 0, canCheck: false },
    ], { position: 'BTN', playerCount: 6, effectiveStackBb: 100 }, club);
    expect(comboShare(range, isClass(['AA']))).toBeGreaterThan(comboShare(range, isClass(['72o'])) * 20);
    // Floor: junk is never exactly zero, the model can never be certain.
    expect(comboShare(range, isClass(['72o']))).toBeGreaterThan(0);
  });

  it('weights a big-blind caller by the defense call leg, not the raise leg', () => {
    const range = applyPreflopActions(uniformRange([]), [
      { type: 'call', facing: 'raised', raiseCount: 1, raiseSizeBb: 2.5, raiserPosition: 'BTN', callersAfterRaise: 0, limperCount: 0, canCheck: false },
    ], { position: 'BB', playerCount: 6, effectiveStackBb: 100 }, club);
    // Premiums mostly 3-bet, so after a flat call AA carries less weight than a middling suited connector.
    expect(comboShare(range, isClass(['AA']))).toBeLessThan(comboShare(range, isClass(['87s'])));
  });

  it('compounds repeated raises: an open then a 4-bet is far tighter than an open alone', () => {
    const open = applyPreflopActions(uniformRange([]), [
      { type: 'raise', facing: 'unopened', raiseCount: 0, callersAfterRaise: 0, limperCount: 0, canCheck: false },
    ], { position: 'CO', playerCount: 6, effectiveStackBb: 100 }, club);
    const fourBet = applyPreflopActions(open, [
      { type: 'raise', facing: 'raised', raiseCount: 2, raiseSizeBb: 9, raiserPosition: 'BTN', callersAfterRaise: 0, limperCount: 0, canCheck: false },
    ], { position: 'CO', playerCount: 6, effectiveStackBb: 100 }, club);
    const premium = isClass(['AA', 'KK', 'QQ', 'AKs', 'AKo']);
    expect(comboShare(fourBet, premium)).toBeGreaterThan(comboShare(open, premium) * 2);
  });

  it('leaves a big blind that only checked at uniform weights', () => {
    const range = applyPreflopActions(uniformRange([]), [
      { type: 'check', facing: 'unopened', raiseCount: 0, callersAfterRaise: 0, limperCount: 0, canCheck: true },
    ], { position: 'BB', playerCount: 6, effectiveStackBb: 100 }, club);
    expect(comboShare(range, isClass(['AA']))).toBeCloseTo(6 / COMBO_COUNT, 6);
  });

  it('models a patient archetype tighter than a pressure archetype on the same open', () => {
    const action = { type: 'raise' as const, facing: 'unopened' as const, raiseCount: 0, callersAfterRaise: 0, limperCount: 0, canCheck: false };
    const spot = { position: 'CO' as const, playerCount: 6, effectiveStackBb: 100 };
    const patient = applyPreflopActions(uniformRange([]), [action], spot, { ...club, archetype: 'patient' });
    const pressure = applyPreflopActions(uniformRange([]), [action], spot, { ...club, archetype: 'pressure' });
    expect(comboShare(patient, isClass(['T8s']))).toBeLessThan(comboShare(pressure, isClass(['T8s'])));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/opponentRange.test.ts`
Expected: FAIL, cannot resolve `../opponentRange`.

- [ ] **Step 3: Write the module (preflop half)**

Create `src/domain/poker/opponentRange.ts`:

```ts
import type { AiDifficulty } from './aiProfiles.ts';
import { cardKey, createDeck } from './cards.ts';
import type { TablePosition } from './multiway.ts';
import type { OpponentMemory } from './opponentMemory.ts';
import { HAND_CLASS_KEYS, type PreflopArchetype } from './preflopRanges.ts';
import {
  buildPreflopPlan,
  classifyPreflopHand,
  preflopGridCards,
  type PreflopFacing,
} from './preflopStrategy.ts';
import type { Card, Rank } from './types.ts';

export const COMBO_COUNT = 1_326;

const DECK: readonly Card[] = createDeck();

/** Every unordered two-card combination, indexed by deck position pairs (i < j). */
export const COMBOS: ReadonlyArray<readonly [Card, Card]> = (() => {
  const combos: Array<readonly [Card, Card]> = [];
  for (let first = 0; first < DECK.length; first += 1) {
    for (let second = first + 1; second < DECK.length; second += 1) {
      combos.push([DECK[first]!, DECK[second]!]);
    }
  }
  return combos;
})();

const COMBO_CLASS_KEY: readonly string[] = COMBOS.map((combo) => classifyPreflopHand(combo).key);

const COMBO_INDICES_BY_CLASS: ReadonlyMap<string, readonly number[]> = (() => {
  const map = new Map<string, number[]>();
  COMBO_CLASS_KEY.forEach((key, index) => {
    const bucket = map.get(key) ?? [];
    bucket.push(index);
    map.set(key, bucket);
  });
  return map;
})();

const RANK_BY_LABEL: Record<string, Rank> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, T: 10, J: 11, Q: 12, K: 13, A: 14,
};

function gridCardsForKey(key: string): readonly [Card, Card] {
  const high = RANK_BY_LABEL[key[0]!]!;
  const low = RANK_BY_LABEL[key[1]!]!;
  if (key.length === 2) return preflopGridCards(high, low);
  return key.endsWith('s') ? preflopGridCards(high, low) : preflopGridCards(low, high);
}

export interface ComboRange {
  weights: Float64Array;
  total: number;
}

export interface PublicPreflopAction {
  type: 'raise' | 'call' | 'check';
  facing: PreflopFacing;
  raiseCount: number;
  raiseSizeBb?: number;
  raiserPosition?: TablePosition;
  callersAfterRaise: number;
  limperCount: number;
  canCheck: boolean;
}

export interface RangeModelSpot {
  position: TablePosition;
  playerCount: number;
  effectiveStackBb: number;
}

export interface RangeModelProfile {
  archetype: PreflopArchetype;
  tier: AiDifficulty;
  rangeTightness?: number;
  /** Scales the never-zero floor; a bluff-heavy identity keeps more junk alive. */
  bluffAllowance: number;
  /** 0 = ignore postflop actions, 1 = full authored continue probabilities. */
  narrowingStrength: number;
  memory?: OpponentMemory;
  memoryStrength: number;
}

/** Relative floor: no public action can push a combo below this share of its prior weight. */
export const RANGE_FLOOR = 0.02;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function finalize(weights: Float64Array): ComboRange {
  let total = 0;
  for (let index = 0; index < weights.length; index += 1) total += weights[index]!;
  return { weights, total };
}

export function uniformRange(blocked: readonly Card[]): ComboRange {
  const blockedKeys = new Set(blocked.map(cardKey));
  const weights = new Float64Array(COMBO_COUNT);
  COMBOS.forEach(([first, second], index) => {
    weights[index] = blockedKeys.has(cardKey(first)) || blockedKeys.has(cardKey(second)) ? 0 : 1;
  });
  return finalize(weights);
}

export function comboShare(
  range: ComboRange,
  predicate: (combo: readonly [Card, Card]) => boolean,
): number {
  if (range.total <= 0) return 0;
  let matched = 0;
  COMBOS.forEach((combo, index) => {
    if (predicate(combo)) matched += range.weights[index]!;
  });
  return matched / range.total;
}

/**
 * Multiplies every combo in a hand class by the authored frequency of the observed
 * preflop action for that class, resolved through the same plan builder the AI
 * uses for its own decisions. Memory scales are applied by the caller through
 * `memoryLegScale`.
 */
export function applyPreflopActions(
  range: ComboRange,
  actions: readonly PublicPreflopAction[],
  spot: RangeModelSpot,
  profile: RangeModelProfile,
): ComboRange {
  const weights = new Float64Array(range.weights);
  const floor = RANGE_FLOOR * clamp(profile.bluffAllowance, 0.25, 2);
  const scales = memoryLegScale(profile);
  for (const action of actions) {
    for (const key of HAND_CLASS_KEYS) {
      const plan = buildPreflopPlan({
        archetype: profile.archetype,
        canCheck: action.canCheck,
        cards: gridCardsForKey(key),
        callersAfterRaise: action.callersAfterRaise,
        effectiveStackBb: spot.effectiveStackBb,
        facing: action.facing,
        limperCount: action.limperCount,
        playerCount: spot.playerCount,
        position: spot.position,
        rangeTightness: profile.rangeTightness,
        raiseCount: action.raiseCount,
        raiseSizeBb: action.raiseSizeBb,
        raiserPosition: action.raiserPosition,
        strategyTier: profile.tier,
      });
      const continueMass = plan.frequencies.raise + plan.frequencies.call + plan.frequencies.check;
      const rawLeg = action.type === 'raise'
        ? plan.frequencies.raise * scales.raise
        : action.type === 'call'
          ? plan.frequencies.call
          : plan.frequencies.check;
      // Edge hands (low continue mass) are what a loose or tight player changes;
      // premiums (continue mass near 1) are entered by everyone.
      const leg = clamp(rawLeg * Math.pow(scales.wide, 1 - clamp(continueMass, 0, 1)), 0, 1);
      const multiplier = Math.max(leg, floor);
      for (const index of COMBO_INDICES_BY_CLASS.get(key) ?? []) weights[index] = weights[index]! * multiplier;
    }
  }
  return finalize(weights);
}

export interface MemoryLegScales {
  wide: number;
  raise: number;
  call: number;
}

function smoothedRate(successes: number, opportunities: number, prior: number, priorWeight: number): number {
  return (successes + prior * priorWeight) / Math.max(1, opportunities + priorWeight);
}

/** Bounded scales from the public memory read; all 1 without memory. */
export function memoryLegScale(profile: RangeModelProfile): MemoryLegScales {
  const memory = profile.memory;
  if (!memory || profile.memoryStrength <= 0) return { wide: 1, raise: 1, call: 1 };
  const confidence = clamp(memory.handsObserved / 20, 0, 1);
  const strength = clamp(profile.memoryStrength, 0, 1.3) * confidence;
  const voluntary = smoothedRate(memory.voluntaryPreflopHands, memory.preflopOpportunities, 0.42, 8);
  const raiseRate = smoothedRate(memory.preflopRaises, memory.preflopOpportunities, 0.22, 9);
  const callRate = smoothedRate(memory.callsFacingBet, memory.facedBetOpportunities, 0.42, 8);
  const scale = (rate: number, baseline: number) => clamp(1 + ((rate - baseline) / 0.25) * 0.5 * strength, 0.6, 1.6);
  return {
    wide: scale(voluntary, 0.42),
    raise: scale(raiseRate, 0.22),
    call: scale(callRate, 0.42),
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/opponentRange.test.ts`
Expected: all pass. If the "BB caller" test fails because premiums 3-bet less than expected in `BB_VS_LATE`, compare `AA` against `87s` share directly from the table (`raise 0.7 call 0.3` versus `raise 0.04 call 0.88`) and keep the assertion; the table already makes the call leg smaller for AA.

- [ ] **Step 5: Commit**

```bash
git add src/domain/poker/opponentRange.ts src/domain/poker/__tests__/opponentRange.test.ts
git commit -m "feat(ai): opponent combo range from the authored preflop tables

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Postflop narrowing, fold share, and range strength

**Files:**
- Modify: `src/domain/poker/postflopStrategy.ts:87` (export `drawLabelOnBoard`)
- Modify: `src/domain/poker/opponentRange.ts`
- Test: `src/domain/poker/__tests__/opponentRange.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ComboClass = 'premium' | 'strong' | 'marginal' | 'draw' | 'weakDraw' | 'air';
  export type SizeBucket = 'small' | 'large';
  export interface PublicPostflopAction { board: readonly Card[]; type: 'raise' | 'call' | 'check'; sizeBucket: SizeBucket; facingBet: boolean }
  export class BoardClassifier { classify(comboIndex: number, board: readonly Card[]): ComboClass }  // cached per board
  export function createBoardClassifier(): BoardClassifier;
  export function applyPostflopActions(range, actions: readonly PublicPostflopAction[], profile, classifier): ComboRange;
  export function foldShare(range, board, sizeBucket, classifier): number;
  export function continueRangeStrength(range, board, sizeBucket, classifier): number;   // 0..1 strength of the part that continues
  export function strongShare(range, board, classifier): number;   // share of premium+strong combos
  export function sizeBucketFor(betFraction: number): SizeBucket;  // <= 0.5 small, else large
  ```

- [ ] **Step 1: Export the draw detector**

In `src/domain/poker/postflopStrategy.ts` change line 87 from `function drawLabelOnBoard(` to `export function drawLabelOnBoard(`.

- [ ] **Step 2: Write the failing tests**

Append to `src/domain/poker/__tests__/opponentRange.test.ts` (extend the import list with `applyPostflopActions, createBoardClassifier, foldShare, strongShare, continueRangeStrength, sizeBucketFor`):

```ts
describe('opponent range: postflop narrowing', () => {
  const board: Card[] = [
    { rank: 13, suit: 'hearts' }, { rank: 8, suit: 'clubs' }, { rank: 3, suit: 'diamonds' },
  ];
  const classifier = createBoardClassifier();

  it('buckets bet sizes at half pot', () => {
    expect(sizeBucketFor(0.33)).toBe('small');
    expect(sizeBucketFor(0.5)).toBe('small');
    expect(sizeBucketFor(0.51)).toBe('large');
  });

  it('a large bet raises the share of strong hands; a check lowers it', () => {
    const prior = uniformRange([]);
    const bet = applyPostflopActions(prior, [{ board, type: 'raise', sizeBucket: 'large', facingBet: false }], club, classifier);
    const check = applyPostflopActions(prior, [{ board, type: 'check', sizeBucket: 'small', facingBet: false }], club, classifier);
    expect(strongShare(bet, board, classifier)).toBeGreaterThan(strongShare(prior, board, classifier));
    expect(strongShare(check, board, classifier)).toBeLessThan(strongShare(prior, board, classifier));
  });

  it('narrowing strength 0 leaves the range untouched', () => {
    const prior = uniformRange([]);
    const untouched = applyPostflopActions(prior, [{ board, type: 'raise', sizeBucket: 'large', facingBet: false }], { ...club, narrowingStrength: 0 }, classifier);
    expect(Array.from(untouched.weights)).toEqual(Array.from(prior.weights));
  });

  it('keeps every unblocked combo above zero after several aggressive actions', () => {
    let range = uniformRange([]);
    for (let street = 0; street < 3; street += 1) {
      range = applyPostflopActions(range, [{ board, type: 'raise', sizeBucket: 'large', facingBet: true }], club, classifier);
    }
    expect(Math.min(...Array.from(range.weights))).toBeGreaterThan(0);
  });

  it('fold share falls as the modeled range strengthens', () => {
    const prior = uniformRange([]);
    const strong = applyPostflopActions(prior, [{ board, type: 'raise', sizeBucket: 'large', facingBet: false }], club, classifier);
    expect(foldShare(strong, board, 'large', classifier)).toBeLessThan(foldShare(prior, board, 'large', classifier));
    expect(foldShare(prior, board, 'large', classifier)).toBeGreaterThan(foldShare(prior, board, 'small', classifier));
  });

  it('the continuing part of a range is stronger than the whole range', () => {
    const prior = uniformRange([]);
    const whole = continueRangeStrength(prior, board, 'small', classifier);
    const facingLarge = continueRangeStrength(prior, board, 'large', classifier);
    expect(facingLarge).toBeGreaterThan(whole);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/opponentRange.test.ts -t "postflop"`
Expected: FAIL, exports missing.

- [ ] **Step 4: Add the postflop half**

Append to `src/domain/poker/opponentRange.ts` (add `import { evaluateBest } from './evaluator.ts';` and `import { drawLabelOnBoard } from './postflopStrategy.ts';` at the top):

```ts
export type ComboClass = 'premium' | 'strong' | 'marginal' | 'draw' | 'weakDraw' | 'air';
export type SizeBucket = 'small' | 'large';

export interface PublicPostflopAction {
  board: readonly Card[];
  type: 'raise' | 'call' | 'check';
  sizeBucket: SizeBucket;
  /** True when the action answered a live bet (call, or raise over a bet). */
  facingBet: boolean;
}

export function sizeBucketFor(betFraction: number): SizeBucket {
  return betFraction <= 0.5 ? 'small' : 'large';
}

interface FacingBetRow { fold: number; call: number; raise: number }
interface CheckedToRow { betSmall: number; betLarge: number; check: number }

/** Authored continue probabilities. Rows sum to 1. Initial values; a tuning knob. */
export const FACING_BET_TABLE: Record<ComboClass, Record<SizeBucket, FacingBetRow>> = {
  premium: { small: { fold: 0.02, call: 0.58, raise: 0.40 }, large: { fold: 0.03, call: 0.67, raise: 0.30 } },
  strong: { small: { fold: 0.06, call: 0.72, raise: 0.22 }, large: { fold: 0.12, call: 0.73, raise: 0.15 } },
  marginal: { small: { fold: 0.30, call: 0.62, raise: 0.08 }, large: { fold: 0.50, call: 0.46, raise: 0.04 } },
  draw: { small: { fold: 0.20, call: 0.62, raise: 0.18 }, large: { fold: 0.35, call: 0.52, raise: 0.13 } },
  weakDraw: { small: { fold: 0.55, call: 0.40, raise: 0.05 }, large: { fold: 0.75, call: 0.22, raise: 0.03 } },
  air: { small: { fold: 0.88, call: 0.08, raise: 0.04 }, large: { fold: 0.94, call: 0.04, raise: 0.02 } },
};

export const CHECKED_TO_TABLE: Record<ComboClass, CheckedToRow> = {
  premium: { betSmall: 0.45, betLarge: 0.35, check: 0.20 },
  strong: { betSmall: 0.40, betLarge: 0.25, check: 0.35 },
  marginal: { betSmall: 0.30, betLarge: 0.05, check: 0.65 },
  draw: { betSmall: 0.30, betLarge: 0.20, check: 0.50 },
  weakDraw: { betSmall: 0.22, betLarge: 0.08, check: 0.70 },
  air: { betSmall: 0.10, betLarge: 0.05, check: 0.85 },
};

const CLASS_STRENGTH: Record<ComboClass, number> = {
  premium: 0.9, strong: 0.7, marginal: 0.4, draw: 0.35, weakDraw: 0.2, air: 0.05,
};

function boardKey(board: readonly Card[]): string {
  return board.map(cardKey).join('|');
}

function classifyCombo(combo: readonly [Card, Card], board: readonly Card[]): ComboClass {
  const value = evaluateBest([combo[0], combo[1], ...board]);
  if (value.category >= 4) return 'premium';
  if (value.category >= 2) return 'strong';
  const draw = board.length < 5 ? drawLabelOnBoard(combo, board) : null;
  if (value.category === 1) {
    const pairRank = value.kickers[0] ?? 0;
    const boardHigh = Math.max(...board.map((card) => card.rank));
    const pocketPair = combo[0].rank === combo[1].rank;
    if (pocketPair && pairRank > boardHigh) return 'strong';
    return 'marginal';
  }
  if (draw) {
    return draw.includes('flush') || draw.includes('open-ended') ? 'draw' : 'weakDraw';
  }
  return 'air';
}

/**
 * Caches combo classification per board so every opponent range in one decision
 * pays the evaluator cost once. Create one per decision.
 */
export class BoardClassifier {
  private readonly cache = new Map<string, ComboClass[]>();

  classifyAll(board: readonly Card[]): readonly ComboClass[] {
    const key = boardKey(board);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const classes = COMBOS.map((combo) => (
      combo.some((card) => board.some((known) => cardKey(known) === cardKey(card)))
        ? 'air'
        : classifyCombo(combo, board)
    ));
    this.cache.set(key, classes);
    return classes;
  }

  classify(comboIndex: number, board: readonly Card[]): ComboClass {
    return this.classifyAll(board)[comboIndex]!;
  }
}

export function createBoardClassifier(): BoardClassifier {
  return new BoardClassifier();
}

function continueProbability(cls: ComboClass, action: PublicPostflopAction, callScale: number): number {
  if (action.facingBet) {
    const row = FACING_BET_TABLE[cls][action.sizeBucket];
    if (action.type === 'call') return clamp(row.call * callScale, 0, 1);
    if (action.type === 'raise') return row.raise;
    return row.fold;
  }
  const row = CHECKED_TO_TABLE[cls];
  if (action.type === 'raise') return action.sizeBucket === 'small' ? row.betSmall : row.betLarge;
  return row.check;
}

export function applyPostflopActions(
  range: ComboRange,
  actions: readonly PublicPostflopAction[],
  profile: RangeModelProfile,
  classifier: BoardClassifier,
): ComboRange {
  const strength = clamp(profile.narrowingStrength, 0, 1);
  if (strength === 0 || actions.length === 0) return range;
  const weights = new Float64Array(range.weights);
  const floor = RANGE_FLOOR * clamp(profile.bluffAllowance, 0.25, 2);
  const callScale = memoryLegScale(profile).call;
  for (const action of actions) {
    if (action.board.length < 3) continue;
    const classes = classifier.classifyAll(action.board);
    for (let index = 0; index < COMBO_COUNT; index += 1) {
      if (weights[index] === 0) continue;
      const probability = continueProbability(classes[index]!, action, callScale);
      const interpolated = 1 - strength * (1 - probability);
      weights[index] = weights[index]! * Math.max(interpolated, floor);
    }
  }
  return finalize(weights);
}

/** Weighted share of the range that folds to a bet of this size on this board. */
export function foldShare(
  range: ComboRange,
  board: readonly Card[],
  sizeBucket: SizeBucket,
  classifier: BoardClassifier,
): number {
  if (range.total <= 0 || board.length < 3) return 0;
  const classes = classifier.classifyAll(board);
  let folded = 0;
  for (let index = 0; index < COMBO_COUNT; index += 1) {
    const weight = range.weights[index]!;
    if (weight === 0) continue;
    folded += weight * FACING_BET_TABLE[classes[index]!][sizeBucket].fold;
  }
  return folded / range.total;
}

/** Strength (0..1) of the part of the range that calls or raises a bet of this size. */
export function continueRangeStrength(
  range: ComboRange,
  board: readonly Card[],
  sizeBucket: SizeBucket,
  classifier: BoardClassifier,
): number {
  if (range.total <= 0 || board.length < 3) return 0.2;
  const classes = classifier.classifyAll(board);
  let continuing = 0;
  let strength = 0;
  for (let index = 0; index < COMBO_COUNT; index += 1) {
    const weight = range.weights[index]!;
    if (weight === 0) continue;
    const cls = classes[index]!;
    const row = FACING_BET_TABLE[cls][sizeBucket];
    const mass = weight * (row.call + row.raise);
    continuing += mass;
    strength += mass * CLASS_STRENGTH[cls];
  }
  return continuing <= 0 ? 0.2 : strength / continuing;
}

/** Share of premium and strong combos; the capped-range signal for overbets. */
export function strongShare(range: ComboRange, board: readonly Card[], classifier: BoardClassifier): number {
  if (range.total <= 0 || board.length < 3) return 0;
  const classes = classifier.classifyAll(board);
  let strong = 0;
  for (let index = 0; index < COMBO_COUNT; index += 1) {
    const cls = classes[index]!;
    if (cls === 'premium' || cls === 'strong') strong += range.weights[index]!;
  }
  return strong / range.total;
}
```

- [ ] **Step 5: Run the tests and the postflop strategy tests**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/opponentRange.test.ts src/domain/poker/__tests__/postflopStrategy.test.ts`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/domain/poker/opponentRange.ts src/domain/poker/postflopStrategy.ts src/domain/poker/__tests__/opponentRange.test.ts
git commit -m "feat(ai): postflop range narrowing, fold share, and range strength

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Sampling from a range and equity against it

**Files:**
- Modify: `src/domain/poker/opponentRange.ts`
- Modify: `src/domain/poker/equity.ts`
- Modify: `src/domain/poker/multiwayEquity.ts`
- Test: `src/domain/poker/__tests__/opponentRange.test.ts`, `src/domain/poker/__tests__/equity.test.ts`, `src/domain/poker/__tests__/multiwayAi.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // opponentRange.ts
  export interface RangeSampler { sample(excluded: ReadonlySet<string>, random: RandomSource): readonly [Card, Card] }
  export function createRangeSampler(range: ComboRange): RangeSampler;
  // equity.ts
  export function estimateEquityAgainstRange(heroCards, board, range: ComboRange, rangeBlend: number, simulations: number, random: RandomSource): number;
  // multiwayEquity.ts
  export const GENERIC_HUMAN_RANGE_ID = 'generic-human-range';
  export interface MultiwayEquityOptions { simulations?; random?; identities?; ranges?: Partial<Record<string, ComboRange>>; rangeBlend?: number }
  ```

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/poker/__tests__/opponentRange.test.ts` (import `createRangeSampler`; import `seededRandom` from `'../cards'`):

```ts
describe('opponent range: sampling', () => {
  it('draws combos in proportion to their weights and never draws excluded cards', () => {
    const range = uniformRange([]);
    // Make AA ten times as likely as everything else.
    const heavy = { weights: new Float64Array(range.weights), total: 0 };
    COMBOS.forEach((combo, index) => {
      if (classifyPreflopHand(combo).key === 'AA') heavy.weights[index] = 10;
    });
    heavy.total = Array.from(heavy.weights).reduce((sum, value) => sum + value, 0);
    const sampler = createRangeSampler(heavy);
    const random = seededRandom(5);
    const excluded = new Set(['14-spades']);
    let aces = 0;
    for (let draw = 0; draw < 4_000; draw += 1) {
      const combo = sampler.sample(excluded, random);
      expect(combo.some((card) => card.rank === 14 && card.suit === 'spades')).toBe(false);
      if (classifyPreflopHand(combo).key === 'AA') aces += 1;
    }
    // Expected share: 3 unblocked AA combos x 10 / (3 x 10 + 1275 others) ≈ 2.3%; uniform would be 0.23%.
    expect(aces / 4_000).toBeGreaterThan(0.015);
    expect(aces / 4_000).toBeLessThan(0.035);
  });
});
```

Append to `src/domain/poker/__tests__/equity.test.ts` (imports: `estimateEquityAgainstRange` from `'../equity'`, `applyPreflopActions, uniformRange` from `'../opponentRange'`, `seededRandom` from `'../cards'`):

```ts
describe('equity against a modeled range', () => {
  const hero = [{ rank: 10 as const, suit: 'hearts' as const }, { rank: 10 as const, suit: 'clubs' as const }];

  it('equals uniform equity when the blend is zero', () => {
    const range = uniformRange(hero);
    const withRange = estimateEquityAgainstRange(hero, [], range, 0, 400, seededRandom(3));
    const uniform = estimateHeadsUpEquity(hero, [], 400, seededRandom(3));
    expect(withRange).toBeCloseTo(uniform, 6);
  });

  it('rates pocket tens lower against a 4-bet range than against a random hand', () => {
    const opener = applyPreflopActions(uniformRange(hero), [
      { type: 'raise', facing: 'unopened', raiseCount: 0, callersAfterRaise: 0, limperCount: 0, canCheck: false },
      { type: 'raise', facing: 'raised', raiseCount: 2, raiseSizeBb: 9, raiserPosition: 'BB', callersAfterRaise: 0, limperCount: 0, canCheck: false },
    ], { position: 'BTN/SB', playerCount: 2, effectiveStackBb: 100 }, {
      archetype: 'balanced', tier: 'club', bluffAllowance: 1, narrowingStrength: 1, memoryStrength: 0,
    });
    const versusRange = estimateEquityAgainstRange(hero, [], opener, 1, 1_200, seededRandom(9));
    const versusRandom = estimateHeadsUpEquity(hero, [], 1_200, seededRandom(9));
    expect(versusRange).toBeLessThan(versusRandom - 0.1);
  });
});
```

Append to the multiway decisions describe in `src/domain/poker/__tests__/multiwayAi.test.ts` (imports: `estimateMultiwayEquity, GENERIC_HUMAN_RANGE_ID` from `'../multiwayEquity'`, `applyPostflopActions, createBoardClassifier, uniformRange` from `'../opponentRange'`):

```ts
  it('lowers multiway equity when a supplied opponent range is strong', () => {
    const state = stateCheckedToAi();
    const view = createFairMultiwayDecisionState(state, 'ai-1');
    const classifier = createBoardClassifier();
    const strongHero = applyPostflopActions(uniformRange([...view.players['ai-1']!.holeCards, ...view.board]), [
      { board: view.board, type: 'raise', sizeBucket: 'large', facingBet: false },
      { board: view.board, type: 'raise', sizeBucket: 'large', facingBet: true },
    ], { archetype: 'balanced', tier: 'club', bluffAllowance: 1, narrowingStrength: 1, memoryStrength: 0 }, classifier);
    const base = estimateMultiwayEquity(view, 'ai-1', { simulations: 600, random: seededRandom(41) });
    const modeled = estimateMultiwayEquity(view, 'ai-1', {
      simulations: 600, random: seededRandom(41), ranges: { hero: strongHero }, rangeBlend: 1,
    });
    expect(modeled).toBeLessThan(base);
    expect(GENERIC_HUMAN_RANGE_ID).toBe('generic-human-range');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/opponentRange.test.ts src/domain/poker/__tests__/equity.test.ts src/domain/poker/__tests__/multiwayAi.test.ts -t "sampling|modeled range|supplied opponent range"`
Expected: FAIL on missing exports.

- [ ] **Step 3: Add the sampler**

Append to `src/domain/poker/opponentRange.ts` (add `type RandomSource` to the cards import):

```ts
export interface RangeSampler {
  sample(excluded: ReadonlySet<string>, random: RandomSource): readonly [Card, Card];
}

/** Cumulative-weight sampler with rejection of combos that collide with excluded cards. */
export function createRangeSampler(range: ComboRange): RangeSampler {
  const cumulative = new Float64Array(COMBO_COUNT);
  let running = 0;
  for (let index = 0; index < COMBO_COUNT; index += 1) {
    running += range.weights[index]!;
    cumulative[index] = running;
  }
  const total = running;
  const collides = (combo: readonly [Card, Card], excluded: ReadonlySet<string>) => (
    excluded.has(cardKey(combo[0])) || excluded.has(cardKey(combo[1]))
  );
  const draw = (random: RandomSource): number => {
    const target = random() * total;
    let low = 0;
    let high = COMBO_COUNT - 1;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (cumulative[mid]! < target) low = mid + 1;
      else high = mid;
    }
    return low;
  };
  return {
    sample(excluded, random) {
      if (total <= 0) throw new Error('Cannot sample from an empty range.');
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const combo = COMBOS[draw(random)]!;
        if (range.weights[COMBOS.indexOf(combo)]! > 0 && !collides(combo, excluded)) return combo;
      }
      // Rare: walk forward from a random start to the first live, non-colliding combo.
      const start = draw(random);
      for (let offset = 0; offset < COMBO_COUNT; offset += 1) {
        const index = (start + offset) % COMBO_COUNT;
        const combo = COMBOS[index]!;
        if (range.weights[index]! > 0 && !collides(combo, excluded)) return combo;
      }
      throw new Error('No live combo remains after excluding known cards.');
    },
  };
}
```

Replace `range.weights[COMBOS.indexOf(combo)]` with a captured index: rewrite the loop as `const index = draw(random); const combo = COMBOS[index]!; if (range.weights[index]! > 0 && ...)`.

- [ ] **Step 4: Add `estimateEquityAgainstRange`**

Append to `src/domain/poker/equity.ts` (imports: `cardKey` from `'./cards'`; `createRangeSampler, type ComboRange` from `'./opponentRange'`):

```ts
/**
 * Equity where the single opponent's hand is drawn from a modeled public-action
 * range with probability `rangeBlend`, and uniformly otherwise. Blend 0 reproduces
 * `estimateHeadsUpEquity` exactly for the same random source.
 */
export function estimateEquityAgainstRange(
  heroCards: readonly Card[],
  board: readonly Card[],
  range: ComboRange,
  rangeBlend: number,
  simulations = 180,
  random: RandomSource = Math.random,
): number {
  if (heroCards.length !== 2) throw new Error('Equity requires two hole cards.');
  if (board.length > 5) throw new Error('The board cannot contain more than five cards.');
  const blend = Math.max(0, Math.min(1, rangeBlend));
  if (blend === 0) return estimateHeadsUpEquity(heroCards, board, simulations, random);
  const sampler = createRangeSampler(range);
  const known = new Set([...heroCards, ...board].map(cardKey));
  const available = withoutCards(createDeck(), [...heroCards, ...board]);
  const runoutCount = 5 - board.length;
  let score = 0;
  const runs = Math.max(1, simulations);
  for (let simulation = 0; simulation < runs; simulation += 1) {
    let opponentCards: readonly Card[];
    let pool: Card[];
    if (random() < blend) {
      opponentCards = sampler.sample(known, random);
      pool = withoutCards(available, opponentCards);
    } else {
      const shuffled = shuffle(available, random);
      opponentCards = shuffled.slice(0, 2);
      pool = shuffled.slice(2);
    }
    const runout = shuffle(pool, random).slice(0, runoutCount);
    const finalBoard = [...board, ...runout];
    const heroValue = evaluateBest([...heroCards, ...finalBoard]);
    const opponentValue = evaluateBest([...opponentCards, ...finalBoard]);
    const comparison = compareHandValues(opponentValue, heroValue);
    if (comparison < 0) score += 1;
    else if (comparison === 0) score += 0.5;
  }
  return score / runs;
}
```

- [ ] **Step 5: Extend `estimateMultiwayEquity`**

In `src/domain/poker/multiwayEquity.ts`:

Export the id and add the option fields:

```ts
export const GENERIC_HUMAN_RANGE_ID = 'generic-human-range';

export interface MultiwayEquityOptions {
  simulations?: number;
  random?: RandomSource;
  identities?: Partial<Record<string, MultiwayAiIdentity>>;
  /** Modeled ranges by opponent id; opponents without one use the scalar range-strength sampler. */
  ranges?: Partial<Record<string, ComboRange>>;
  /** Probability of drawing from a supplied range instead of the legacy sampler. */
  rangeBlend?: number;
}
```

Set `id: GENERIC_HUMAN_RANGE_ID` in `GENERIC_HUMAN_RANGE`. Import `createRangeSampler, type ComboRange, type RangeSampler` from `'./opponentRange.ts'`.

Inside `estimateMultiwayEquity`, before the simulation loop:

```ts
  const blend = Math.max(0, Math.min(1, options.rangeBlend ?? 0));
  const samplers = new Map<string, RangeSampler>();
  if (blend > 0 && options.ranges) {
    for (const opponentId of opponentIds) {
      const range = options.ranges[opponentId];
      if (range && range.total > 0) samplers.set(opponentId, createRangeSampler(range));
    }
  }
```

Inside the per-opponent sampling in the loop, replace `const cards = sampleRangeHand(pool, state.board, rangeStrength, random);` with:

```ts
      const sampler = samplers.get(opponentId);
      const cards = sampler && random() < blend
        ? sampler.sample(new Set([...player.holeCards, ...state.board, ...Object.values(sampledHands).flat()].map(cardKey)), random)
        : sampleRangeHand(pool, state.board, rangeStrength, random);
```

Keep `pool = removeCards(pool, cards);` after it so the runout excludes the sampled cards.

- [ ] **Step 6: Run the three test files**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/opponentRange.test.ts src/domain/poker/__tests__/equity.test.ts src/domain/poker/__tests__/multiwayAi.test.ts`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/domain/poker/opponentRange.ts src/domain/poker/equity.ts src/domain/poker/multiwayEquity.ts src/domain/poker/__tests__/opponentRange.test.ts src/domain/poker/__tests__/equity.test.ts src/domain/poker/__tests__/multiwayAi.test.ts
git commit -m "feat(ai): sample opponent hands from modeled ranges in equity estimates

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Priced aggression in the postflop plan and heuristic selector

**Files:**
- Modify: `src/domain/poker/postflopStrategy.ts` (`PostflopStrategyInput`, `PostflopCandidate`, `aggressiveCandidates`, `selectPostflopAction`)
- Test: `src/domain/poker/__tests__/postflopStrategy.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // PostflopStrategyInput additions
  foldShareBySize?: { small: number; large: number };   // probability every live opponent folds
  extraSizeFractions?: readonly number[];               // e.g. [1.25, 1.5] overbets
  // PostflopCandidate addition
  foldEquity?: number;
  ```
- The selector reads `aiStrategyProfile(difficulty).bluffPricingScale`.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('shared postflop strategy', ...)` in `src/domain/poker/__tests__/postflopStrategy.test.ts`:

```ts
  it('records fold equity per candidate by size bucket and offers requested overbets', () => {
    const plan = buildPostflopPlan(input({
      equity: 0.2,
      foldShareBySize: { small: 0.3, large: 0.55 },
      extraSizeFractions: [1.25, 1.5],
    }));
    const small = plan.candidates.find((c) => c.action.type === 'raise' && (c.potFraction ?? 0) <= 0.5);
    const large = plan.candidates.find((c) => c.action.type === 'raise' && (c.potFraction ?? 0) > 0.5 && (c.potFraction ?? 0) <= 1);
    const overbet = plan.candidates.find((c) => c.action.type === 'raise' && (c.potFraction ?? 0) > 1.2);
    expect(small?.foldEquity).toBeCloseTo(0.3, 6);
    expect(large?.foldEquity).toBeCloseTo(0.55, 6);
    expect(overbet).toBeDefined();
    expect(overbet?.foldEquity).toBeCloseTo(0.55, 6);
  });

  it('prices bluffs: Sharp bluffs a weak range far more than a strong one, and never from a flat bonus', () => {
    const weakRange = buildPostflopPlan(input({ equity: 0.18, foldShareBySize: { small: 0.55, large: 0.7 } }));
    const strongRange = buildPostflopPlan(input({ equity: 0.18, foldShareBySize: { small: 0.1, large: 0.15 } }));
    const noRange = buildPostflopPlan(input({ equity: 0.18 }));
    const bluffs = (plan: ReturnType<typeof buildPostflopPlan>) => Array.from({ length: 2_000 }, (_, i) => (
      selectPostflopAction(plan, (i + 0.5) / 2_000, 'sharp').role === 'bluff'
    )).filter(Boolean).length;
    expect(bluffs(weakRange)).toBeGreaterThan(bluffs(strongRange) * 3);
    // Without a range there is no pricing, and Sharp no longer receives a flat bluff bonus.
    expect(bluffs(noRange)).toBeLessThan(bluffs(weakRange));
    expect(bluffs(noRange)).toBeLessThanOrEqual(bluffs(strongRange) + 40);
  });

  it('keeps Friendly gentle and unpriced', () => {
    const plan = buildPostflopPlan(input({ equity: 0.18, foldShareBySize: { small: 0.7, large: 0.8 } }));
    const bluffs = Array.from({ length: 2_000 }, (_, i) => (
      selectPostflopAction(plan, (i + 0.5) / 2_000, 'friendly').role === 'bluff'
    )).filter(Boolean).length;
    expect(bluffs).toBeLessThan(60);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/postflopStrategy.test.ts -t "fold equity|prices bluffs|Friendly gentle"`
Expected: FAIL (unknown input fields, flat bonus still present).

- [ ] **Step 3: Implement**

In `src/domain/poker/postflopStrategy.ts`:

Add to `PostflopStrategyInput` after `tournamentRiskPremium?: number;`:

```ts
  /** Probability that every live opponent folds, by bet-size bucket, from the modeled ranges. */
  foldShareBySize?: { small: number; large: number };
  /** Additional pot fractions to offer as candidates, for polarized river sizing. */
  extraSizeFractions?: readonly number[];
```

Add to `PostflopCandidate` after `potFraction?: number;`:

```ts
  /** Estimated probability that every opponent folds to this exact size; undefined without a range. */
  foldEquity?: number;
```

In `aggressiveCandidates`, inside `addCandidate` after `actualFraction` is computed, add:

```ts
    const foldEquity = input.foldShareBySize
      ? (actualFraction <= 0.5 ? input.foldShareBySize.small : input.foldShareBySize.large)
      : undefined;
```

and include `foldEquity,` in the pushed candidate object (after `potFraction: actualFraction,`).

After `sizeChoices.forEach(({ fraction, label }) => addCandidate(fraction, label));` add:

```ts
  for (const fraction of input.extraSizeFractions ?? []) {
    if (fraction > 1) addCandidate(fraction, `${Math.round(fraction * 100)}% pot`);
  }
```

Import `aiStrategyProfile` from `'./aiProfiles.ts'` at the top. In `selectPostflopAction` replace the block from `const difficultyRaiseBias = ...` through the end of the `if (candidate.action.type === 'raise') { ... }` body with:

```ts
  const profile = aiStrategyProfile(difficulty);
  const friendly = difficulty === 'friendly';
  const difficultyFoldBias = friendly ? -0.12 : 0;
  const selectionTemperature = friendly
    ? 5.7
    : difficulty === 'nemesis' ? 6.8 : difficulty === 'elite' ? 6.5 : difficulty === 'sharp' ? 6.1 : 5.8;
  // Preserve draw/implied-odds decisions on earlier streets. When no future
  // betting remains, stronger tiers make fewer calls clearly below the direct
  // price. The estimate still comes from public information, not solver EV.
  const mistakePenalty = friendly ? 0
    : difficulty === 'club' ? 0.5 : difficulty === 'sharp' ? 0.8 : difficulty === 'elite' ? 1.4 : 1.9;
  const familyCounts = candidates.reduce<Record<PlayerAction['type'], number>>((counts, candidate) => ({
    ...counts,
    [candidate.action.type]: counts[candidate.action.type] + 1,
  }), { fold: 0, check: 0, call: 0, raise: 0 });
  const weighted = candidates.map((candidate) => {
    const mistakeGap = candidate.action.type === 'call' ? Math.max(0, (plan.terminalCallDeficit ?? 0) - 0.05) : 0;
    let score = candidate.score - mistakeGap * mistakePenalty;
    if (candidate.action.type === 'raise') {
      const frequencyScale = candidate.role === 'value'
        ? adjustments.valueFrequencyScale ?? 1
        : candidate.role === 'bluff'
          ? adjustments.bluffFrequencyScale ?? 1
          : adjustments.pressureFrequencyScale ?? 1;
      score += Math.log(Math.max(0.5, frequencyScale)) * 0.18;
      score += ((adjustments.raiseSizeScale ?? 1) - 1) * (candidate.potFraction ?? 0) * 0.18;
      if (friendly) {
        // Friendly's gentleness knobs: fewer raises, smaller sizes, almost no bluffs.
        score -= 0.12 + (candidate.potFraction ?? 0) * 0.14;
        if (candidate.role === 'bluff') score -= 0.12;
      } else if (candidate.role === 'bluff' || candidate.role === 'draw') {
        if (candidate.foldEquity !== undefined) {
          // Priced: a bluff is attractive only when the modeled range folds more
          // often than the size needs to break even.
          const fraction = Math.max(0.2, candidate.potFraction ?? 0.5);
          const breakEven = fraction / (1 + fraction);
          score += profile.bluffPricingScale * (candidate.foldEquity - breakEven);
        } else if (candidate.role === 'bluff') {
          // No range available: keep Club's historical mild discount for everyone.
          score -= 0.04;
        }
      }
    }
```

Leave the remaining lines (`if (candidate.action.type === 'fold') ...`, the friendly call bonus, the weight computation, and the cursor selection) unchanged.

- [ ] **Step 4: Run the postflop strategy tests, then the heads-up and multiway AI tests**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/postflopStrategy.test.ts src/domain/poker/__tests__/ai.test.ts src/domain/poker/__tests__/multiwayAi.test.ts`
Expected: postflop tests pass. Some heads-up or multiway pins that relied on the Sharp bonus (for example "gives Sharp selective pressure that Friendly declines on a dry board") may fail because no range is supplied yet; those tests are revisited in Tasks 8 and 9 once ranges flow through the decision path. Record every failing test name now in `docs/AI_LADDER_QA.md` under "Re-pinned tests" as "pending Task 8/9".

- [ ] **Step 5: Commit**

```bash
git add src/domain/poker/postflopStrategy.ts src/domain/poker/__tests__/postflopStrategy.test.ts docs/AI_LADDER_QA.md
git commit -m "feat(ai): price bluffs by fold equity instead of flat tier bonuses

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: EV selector uses range fold equity, shared core, heads-up adapter

**Files:**
- Modify: `src/domain/poker/postflopEv.ts`
- Test: `src/domain/poker/__tests__/postflopEv.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface PostflopEvContext { ...existing; continueRangeStrengthBySize?: { small: number; large: number } }
  export function selectPostflopActionByEv(evs: PostflopCandidateEv[], mix: number, difficulty: 'elite' | 'nemesis'): PostflopCandidate;
  export function selectHeadsUpPostflopActionByEv(input: { plan: PostflopPlan; context: PostflopEvContext; mix: number; difficulty: 'elite' | 'nemesis' }): PostflopCandidate;
  ```
- `estimatePostflopCandidateEv` uses `candidate.foldEquity` when present, and `continueRangeStrengthBySize` for the called-equity discount when present.

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/poker/__tests__/postflopEv.test.ts` (import `selectHeadsUpPostflopActionByEv`, `selectPostflopActionByEv` from `'../postflopEv'`):

```ts
describe('range-informed EV', () => {
  it('uses the candidate fold equity when present instead of the size heuristic', () => {
    const bluff = { ...candidate('raise', 100), role: 'bluff' as const, potFraction: 0.5, foldEquity: 0.7 };
    const heuristic = { ...bluff, foldEquity: undefined };
    const ctx = context({ equity: 0.1 });
    expect(estimatePostflopCandidateEv(bluff, ctx).foldEquity).toBeCloseTo(0.7, 6);
    expect(estimatePostflopCandidateEv(heuristic, ctx).foldEquity).toBeLessThan(0.7);
    expect(estimatePostflopCandidateEv(bluff, ctx).expectedValue)
      .toBeGreaterThan(estimatePostflopCandidateEv(heuristic, ctx).expectedValue);
  });

  it('discounts called equity harder when the continuing range is stronger', () => {
    const value = { ...candidate('raise', 100), role: 'value' as const, potFraction: 0.75, foldEquity: 0.2 };
    const soft = estimatePostflopCandidateEv(value, context({ equity: 0.6, continueRangeStrengthBySize: { small: 0.3, large: 0.3 } }));
    const hard = estimatePostflopCandidateEv(value, context({ equity: 0.6, continueRangeStrengthBySize: { small: 0.3, large: 0.8 } }));
    expect(hard.expectedValue).toBeLessThan(soft.expectedValue);
  });

  it('selects heads-up by EV through the shared core', () => {
    const plan = buildPostflopPlan({
      bigBlind: 20,
      board: [{ rank: 14, suit: 'spades' }, { rank: 8, suit: 'hearts' }, { rank: 2, suit: 'clubs' }],
      cards: [{ rank: 14, suit: 'diamonds' }, { rank: 13, suit: 'diamonds' }],
      currentBet: 0, effectiveStack: 900, equity: 0.8, initiative: 'player',
      legal: { canFold: false, canCheck: true, canCall: false, canRaise: true, toCall: 0, minRaiseTo: 20, maxRaiseTo: 900, suggestedRaiseTo: 66 },
      opponentCount: 1, playerStreetBet: 0, playersBehind: 0, pot: 100, street: 'flop',
      foldShareBySize: { small: 0.4, large: 0.55 },
    });
    const picks = Array.from({ length: 200 }, (_, i) => selectHeadsUpPostflopActionByEv({
      plan, context: context({ equity: 0.8, currentBet: 0, pot: 100, street: 'flop' }), mix: (i + 0.5) / 200, difficulty: 'elite',
    }).action.type);
    expect(picks.filter((type) => type === 'raise').length).toBeGreaterThan(120);
    expect(typeof selectPostflopActionByEv).toBe('function');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/postflopEv.test.ts -t "range-informed"`
Expected: FAIL (missing exports and fields).

- [ ] **Step 3: Implement**

In `src/domain/poker/postflopEv.ts`:

Add to `PostflopEvContext`:

```ts
  /** Strength of the part of the modeled ranges that continues against each size bucket. */
  continueRangeStrengthBySize?: { small: number; large: number };
```

In `estimatePostflopCandidateEv`, in the raise branch replace `foldEquity = estimatedAllFoldProbability(candidate, context);` with:

```ts
    foldEquity = candidate.foldEquity !== undefined
      ? clamp(candidate.foldEquity, 0.002, 0.9)
      : estimatedAllFoldProbability(candidate, context);
    const bucketStrength = context.continueRangeStrengthBySize
      ? (sizeFraction <= 0.5 ? context.continueRangeStrengthBySize.small : context.continueRangeStrengthBySize.large)
      : context.averageOpponentRangeStrength;
```

and replace `- Math.max(0, context.averageOpponentRangeStrength - 0.16) * 0.16` in `calledEquity` with `- Math.max(0, bucketStrength - 0.16) * 0.16`.

Extract the selection loop from `selectAdvancedPostflopAction` into a shared core:

```ts
export function selectPostflopActionByEv(
  evs: PostflopCandidateEv[],
  mix: number,
  difficulty: Extract<AiDifficulty, 'elite' | 'nemesis'>,
): PostflopCandidate {
  const sorted = [...evs].sort((left, right) => right.utility - left.utility);
  const best = sorted[0];
  if (!best) throw new Error('EV selection has no candidates.');
  const temperature = difficulty === 'nemesis' ? 8.2 : 8;
  const familyCounts = sorted.reduce<Record<string, number>>((counts, item) => ({
    ...counts,
    [item.candidate.action.type]: (counts[item.candidate.action.type] ?? 0) + 1,
  }), {});
  const weights = sorted.map((item) => ({
    item,
    weight: Math.exp((item.utility - best.utility) * temperature)
      / Math.max(1, familyCounts[item.candidate.action.type] ?? 1),
  }));
  const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = clamp(mix, 0, 0.999_999) * total;
  for (const entry of weights) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.item.candidate;
  }
  return weights.at(-1)!.item.candidate;
}

export function selectHeadsUpPostflopActionByEv(input: {
  plan: PostflopPlan;
  context: PostflopEvContext;
  mix: number;
  difficulty: Extract<AiDifficulty, 'elite' | 'nemesis'>;
}): PostflopCandidate {
  const evs = input.plan.candidates.map((candidate) => estimatePostflopCandidateEv(candidate, input.context));
  return selectPostflopActionByEv(evs, input.mix, input.difficulty);
}
```

Rewrite `selectAdvancedPostflopAction` to `return selectPostflopActionByEv(advancedPostflopCandidateEvs(input), input.mix, input.difficulty);`. In `advancedPostflopCandidateEvs`, add `continueRangeStrengthBySize: input.continueRangeStrengthBySize,` to the context and add the optional field `continueRangeStrengthBySize?: { small: number; large: number }` to `AdvancedPostflopSelectionInput`.

- [ ] **Step 4: Run the EV tests**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/postflopEv.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/poker/postflopEv.ts src/domain/poker/__tests__/postflopEv.test.ts
git commit -m "feat(ai): EV selector consumes range fold equity; shared core and heads-up adapter

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Heads-up integration in `ai.ts`

**Files:**
- Modify: `src/domain/poker/opponentRange.ts` (add `rangeSpotFromHeadsUp`)
- Modify: `src/domain/poker/ai.ts`
- Test: `src/domain/poker/__tests__/ai.test.ts`, `src/domain/poker/__tests__/opponentRange.test.ts`

**Interfaces:**
- Produces in `opponentRange.ts`:
  ```ts
  export interface RangeSpotActions { spot: RangeModelSpot; preflop: PublicPreflopAction[]; postflop: PublicPostflopAction[] }
  export function rangeSpotFromHeadsUp(state: FairHeadsUpDecisionState, opponentId: PlayerId): RangeSpotActions;
  export function buildOpponentRange(actions: RangeSpotActions, viewerCards: readonly Card[], board: readonly Card[], profile: RangeModelProfile, classifier: BoardClassifier): ComboRange;
  ```
- Produces in `ai.ts`:
  ```ts
  export interface HeadsUpAiOptions { identity?: MultiwayAiIdentity; sessionRead?: SessionExploitRead }
  export function decideAiAction(state, playerId = 'villain', random = Math.random, difficulty = 'club', opponentMemory?, options: HeadsUpAiOptions = {}): AiDecision;
  ```
  `sessionRead` is typed in Task 10; until then declare `options: { identity?: MultiwayAiIdentity } = {}` and widen it in Task 10.

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/poker/__tests__/opponentRange.test.ts` (imports: `rangeSpotFromHeadsUp` from `'../opponentRange'`; `applyAction, createHand` from `'../engine'`; `createFairHeadsUpDecisionState` from `'../fairness'`):

```ts
describe('opponent range: heads-up public line', () => {
  it('reads the button open and big-blind 3-bet from history without hidden cards', () => {
    let state = createHand({ button: 'hero', random: seededRandom(77) });
    state = applyAction(state, 'hero', { type: 'raise', amount: 50 });
    state = applyAction(state, 'villain', { type: 'raise', amount: 180 });
    const view = createFairHeadsUpDecisionState(state, 'hero');
    const villainLine = rangeSpotFromHeadsUp(view, 'villain');
    expect(villainLine.spot.position).toBe('BB');
    expect(villainLine.preflop).toEqual([
      expect.objectContaining({ type: 'raise', facing: 'raised', raiseCount: 1, raiseSizeBb: 2.5, raiserPosition: 'BTN/SB' }),
    ]);
    const heroLine = rangeSpotFromHeadsUp(view, 'hero');
    expect(heroLine.spot.position).toBe('BTN/SB');
    expect(heroLine.preflop).toEqual([expect.objectContaining({ type: 'raise', facing: 'unopened', raiseCount: 0 })]);
    expect(view.players.villain.holeCards).toEqual([]);
  });
});
```

Append to `describe('AI difficulty profiles', ...)` in `src/domain/poker/__tests__/ai.test.ts`:

```ts
  it('Elite respects a 3-bettor more than Club does with the same hand', () => {
    // Villain on the button opens, hero 3-bets; villain holds a hand that flats a 3-bet
    // often against a random range but should fold more against a modeled 3-bet range.
    const trials = (difficulty: 'club' | 'elite') => Array.from({ length: 60 }, (_, index) => {
      let state = createHand({ button: 'villain', random: seededRandom(500 + index) });
      state.players.villain.holeCards = [{ rank: 9, suit: 'clubs' }, { rank: 8, suit: 'clubs' }];
      state = applyAction(state, 'villain', { type: 'raise', amount: 50 });
      state = applyAction(state, 'hero', { type: 'raise', amount: 180 });
      return decideAiAction(createFairHeadsUpDecisionState(state, 'villain'), 'villain', seededRandom(900 + index), difficulty).action.type;
    });
    const folds = (types: string[]) => types.filter((type) => type === 'fold').length;
    expect(folds(trials('elite'))).toBeGreaterThanOrEqual(folds(trials('club')));
  });

  it('keeps every decision independent of hidden cards at every tier', () => {
    for (const difficulty of ['club', 'sharp', 'elite', 'nemesis'] as const) {
      const state = stateWithOptionToBet();
      state.players.villain.holeCards = [{ rank: 14, suit: 'clubs' }, { rank: 13, suit: 'clubs' }];
      const changed = { ...state, players: { ...state.players, hero: { ...state.players.hero, holeCards: [{ rank: 8 as const, suit: 'spades' as const }, { rank: 8 as const, suit: 'diamonds' as const }] } } };
      const original = decideAiAction(createFairHeadsUpDecisionState(state, 'villain'), 'villain', seededRandom(4_411), difficulty);
      const altered = decideAiAction(createFairHeadsUpDecisionState(changed, 'villain'), 'villain', seededRandom(4_411), difficulty);
      expect(altered, difficulty).toEqual(original);
    }
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/opponentRange.test.ts src/domain/poker/__tests__/ai.test.ts -t "heads-up public line|3-bettor|every tier"`
Expected: FAIL on the missing export; the Elite test may pass or fail before integration, the hidden-cards test passes (no change yet). Proceed.

- [ ] **Step 3: Add the heads-up line reader and range builder**

Append to `src/domain/poker/opponentRange.ts` (imports: `type FairHeadsUpDecisionState` from `'./fairness.ts'`; `type PlayerId` from `'./types.ts'`; `preflopFacingFromPublicAction` from `'./preflopStrategy.ts'`):

```ts
export interface RangeSpotActions {
  spot: RangeModelSpot;
  preflop: PublicPreflopAction[];
  postflop: PublicPostflopAction[];
}

export function rangeSpotFromHeadsUp(
  state: FairHeadsUpDecisionState,
  opponentId: PlayerId,
): RangeSpotActions {
  const opponent = state.players[opponentId];
  const other = state.players[opponentId === 'hero' ? 'villain' : 'hero'];
  const position: TablePosition = state.button === opponentId ? 'BTN/SB' : 'BB';
  const preflop: PublicPreflopAction[] = [];
  const postflop: PublicPostflopAction[] = [];
  let effectiveStackBb = Math.min(
    opponent.stack + opponent.totalCommitted,
    other.stack + other.totalCommitted,
  ) / state.bigBlind;
  state.history.forEach((record, index) => {
    if (record.player !== opponentId || record.type === 'fold') return;
    const context = record.decisionContext;
    if (index === 0 || preflop.length + postflop.length === 0) {
      effectiveStackBb = Math.min(
        context.playerStackBefore + context.playerStreetBetBefore,
        context.opponentStackBefore + context.opponentStreetBetBefore,
      ) / state.bigBlind;
    }
    if (record.street === 'preflop') {
      const prefix = state.history.slice(0, index);
      const raisesBefore = prefix.filter((entry) => entry.street === 'preflop' && entry.type === 'raise');
      const lastRaiser = raisesBefore.at(-1)?.player;
      preflop.push({
        type: record.type as 'raise' | 'call' | 'check',
        facing: preflopFacingFromPublicAction(context.currentBet, state.bigBlind, prefix),
        raiseCount: raisesBefore.length,
        raiseSizeBb: context.currentBet > state.bigBlind ? context.currentBet / state.bigBlind : undefined,
        raiserPosition: lastRaiser === undefined ? undefined : state.button === lastRaiser ? 'BTN/SB' : 'BB',
        callersAfterRaise: 0,
        limperCount: prefix.filter((entry) => entry.street === 'preflop' && entry.type === 'call').length,
        canCheck: context.legalActions.canCheck,
      });
      return;
    }
    if (record.street === 'complete') return;
    const potBefore = Math.max(1, context.potBefore);
    const fraction = record.type === 'raise'
      ? (record.amount - context.currentBet) / potBefore
      : context.toCall / potBefore;
    postflop.push({
      board: context.board,
      type: record.type as 'raise' | 'call' | 'check',
      sizeBucket: record.type === 'raise' && context.currentBet > 0 ? 'large' : sizeBucketFor(fraction),
      facingBet: context.toCall > 0,
    });
  });
  return { spot: { position, playerCount: 2, effectiveStackBb }, preflop, postflop };
}

export function buildOpponentRange(
  actions: RangeSpotActions,
  viewerCards: readonly Card[],
  board: readonly Card[],
  profile: RangeModelProfile,
  classifier: BoardClassifier,
): ComboRange {
  const prior = uniformRange([...viewerCards, ...board]);
  const preflop = applyPreflopActions(prior, actions.preflop, actions.spot, profile);
  return applyPostflopActions(preflop, actions.postflop, profile, classifier);
}
```

- [ ] **Step 4: Integrate into `decideAiAction`**

In `src/domain/poker/ai.ts`:

Imports to add: `estimateEquityAgainstRange` from `'./equity'`; `buildOpponentRange, continueRangeStrength, createBoardClassifier, foldShare, rangeSpotFromHeadsUp, strongShare, type ComboRange` from `'./opponentRange'`; `selectHeadsUpPostflopActionByEv, type PostflopEvContext` from `'./postflopEv'`; `type MultiwayAiIdentity` from `'./multiwayAiProfiles'`.

Add before `decideAiAction`:

```ts
export interface HeadsUpAiOptions {
  /** Roster identity for archetype and slow-play; balanced when omitted. */
  identity?: MultiwayAiIdentity;
}
```

Change the signature to `export function decideAiAction(state, playerId: PlayerId = 'villain', random: RandomSource = Math.random, difficulty: AiDifficulty = 'club', opponentMemory?: OpponentMemory, options: HeadsUpAiOptions = {}): AiDecision`.

Replace the equity and adaptation setup at the top of the function with:

```ts
  const profile = aiStrategyProfile(difficulty);
  const player = state.players[playerId];
  const opponentId: PlayerId = playerId === 'hero' ? 'villain' : 'hero';
  const classifier = createBoardClassifier();
  const opponentRange: ComboRange | null = profile.rangeBlend > 0
    ? buildOpponentRange(rangeSpotFromHeadsUp(state, opponentId), player.holeCards, state.board, {
      archetype: 'balanced',
      tier: 'club',
      bluffAllowance: 1,
      narrowingStrength: profile.narrowingStrength,
      memory: opponentMemory,
      memoryStrength: profile.memoryStrength,
    }, classifier)
    : null;
  const equity = opponentRange
    ? estimateEquityAgainstRange(player.holeCards, state.board, opponentRange, profile.rangeBlend, profile.equitySamples, random)
    : estimateHeadsUpEquity(player.holeCards, state.board, profile.equitySamples, random);
  const adaptation = buildOpponentAdaptation(
    opponentMemory ?? createEmptyOpponentMemory(),
    profile.memoryStrength,
    state.button === 'hero' ? 'late' : 'blind',
  );
  const identity = options.identity;
```

In the preflop branch, change `archetype: 'balanced',` to `archetype: identity?.style ?? 'balanced',` and add `rangeTightness: identity?.rangeTightness,` to the `buildPreflopPlan` call. Remove the now-duplicated `const player = ...` and `const opponentId ...` lines inside the preflop and postflop branches.

In the postflop branch, replace the `buildPostflopPlan` call's trailing fields and the `selectPostflopAction` call with:

```ts
    const foldShareBySize = opponentRange
      ? {
        small: foldShare(opponentRange, state.board, 'small', classifier),
        large: foldShare(opponentRange, state.board, 'large', classifier),
      }
      : undefined;
    const capped = opponentRange !== null && strongShare(opponentRange, state.board, classifier) < 0.25;
    const plan = buildPostflopPlan({
      bigBlind: state.bigBlind,
      board: state.board,
      cards: player.holeCards,
      currentBet: state.currentBet,
      effectiveStack: Math.min(player.stack, opponent.stack),
      equity,
      initiative,
      legal,
      opponentCount: 1,
      playerStreetBet: player.streetBet,
      playersBehind: state.pending.indexOf(playerId) >= 0
        ? Math.max(0, state.pending.length - state.pending.indexOf(playerId) - 1)
        : 0,
      pot: state.pot,
      street: state.street,
      foldShareBySize,
      extraSizeFractions: profile.overbetCandidate && state.street === 'river' && capped ? [1.25, 1.5] : undefined,
    });
    const mix = random();
    const adjustments = {
      bluffFrequencyScale: adaptation.bluffFrequencyScale * (identity?.bluffFrequency ?? 1),
      callToleranceDelta: adaptation.callToleranceDelta + (identity?.callTolerance ?? 0),
      pressureFrequencyScale: adaptation.pressureFrequencyScale * (identity?.aggression ?? 1),
      raiseSizeScale: adaptation.raiseSizeScale * (identity ? Math.max(0.9, Math.min(1.12, identity.potFraction / 0.66)) : 1),
      slowPlayFrequency: identity?.slowPlayFrequency ?? 0,
      valueFrequencyScale: adaptation.valueFrequencyScale * (identity?.aggression ?? 1),
    };
    const selected = profile.evSelector && (difficulty === 'elite' || difficulty === 'nemesis')
      ? selectHeadsUpPostflopActionByEv({
        plan,
        mix,
        difficulty,
        context: {
          adaptation: { ...adaptation, ...adjustmentsToAdaptation(adaptation, adjustments) },
          averageOpponentRangeStrength: opponentRange
            ? continueRangeStrength(opponentRange, state.board, 'small', classifier)
            : 0.2,
          continueRangeStrengthBySize: opponentRange
            ? {
              small: continueRangeStrength(opponentRange, state.board, 'small', classifier),
              large: continueRangeStrength(opponentRange, state.board, 'large', classifier),
            }
            : undefined,
          currentBet: state.currentBet,
          equity,
          opponentCount: 1,
          playerStreetBet: player.streetBet,
          playersBehind: 0,
          pot: state.pot,
          street: state.street,
          tournamentRiskPremium: 0,
        } satisfies PostflopEvContext,
      })
      : selectPostflopAction(plan, mix, difficulty, adjustments);
```

Add this helper above `decideAiAction`:

```ts
/** Folds identity scales into the adaptation object the EV context expects. */
function adjustmentsToAdaptation(
  adaptation: OpponentAdaptation,
  adjustments: { bluffFrequencyScale: number; callToleranceDelta: number; pressureFrequencyScale: number; raiseSizeScale: number; valueFrequencyScale: number },
): Partial<OpponentAdaptation> {
  return {
    bluffFrequencyScale: adjustments.bluffFrequencyScale,
    callToleranceDelta: adjustments.callToleranceDelta,
    pressureFrequencyScale: adjustments.pressureFrequencyScale,
    raiseSizeScale: adjustments.raiseSizeScale,
    valueFrequencyScale: adjustments.valueFrequencyScale,
    confidence: adaptation.confidence,
    valueThresholdDelta: adaptation.valueThresholdDelta,
  };
}
```

Keep the `estimatedEquity`, `potOdds`, `style`, and `rationale` mapping as it is.

- [ ] **Step 5: Run heads-up tests, benchmark structure, and typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/ai.test.ts src/domain/poker/__tests__/opponentRange.test.ts src/domain/poker/__tests__/aiLadder.test.ts src/domain/poker/__tests__/aiBenchmark.test.ts && pnpm typecheck`
Expected: all pass. For any pin in `ai.test.ts` that now fails (candidates: "gives Sharp thinner value pressure and larger value sizing", the 40-hand blended raise-size ordering), print the new values with `PRINT_AI_METRICS=1`, confirm the direction is the intended one (Sharp still sizes larger than Friendly; Friendly still calls a loose price Club folds), re-pin, and add the line to `docs/AI_LADDER_QA.md` "Re-pinned tests". Do not re-pin any fairness or legality test; those must pass unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/domain/poker/ai.ts src/domain/poker/opponentRange.ts src/domain/poker/__tests__/ai.test.ts src/domain/poker/__tests__/opponentRange.test.ts docs/AI_LADDER_QA.md
git commit -m "feat(ai): heads-up decisions model the opponent range and price aggression

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Multiway integration in `multiwayAi.ts`

**Files:**
- Modify: `src/domain/poker/opponentRange.ts` (add `rangeSpotFromMultiway`)
- Modify: `src/domain/poker/multiwayAi.ts`
- Test: `src/domain/poker/__tests__/multiwayAi.test.ts`, `src/domain/poker/__tests__/opponentRange.test.ts`

**Interfaces:**
- Produces: `export function rangeSpotFromMultiway(state: FairMultiwayDecisionState, opponentId: string): RangeSpotActions;`
- `decideMultiwayAiAction` builds one range per live opponent when `aiStrategyProfile(difficulty).rangeBlend > 0`, passes `ranges` and `rangeBlend` to `estimateMultiwayEquity`, `foldShareBySize` (product across opponents) and `extraSizeFractions` to `buildPostflopPlan`, and `continueRangeStrengthBySize` to the EV selector.

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/poker/__tests__/opponentRange.test.ts` (imports: `rangeSpotFromMultiway`; `applyMultiwayAction, createMultiwayHand, type TablePlayerConfig` from `'../multiway'`; `createFairMultiwayDecisionState` from `'../fairness'`):

```ts
describe('opponent range: multiway public line', () => {
  function players(count: number): TablePlayerConfig[] {
    return Array.from({ length: count }, (_, seat) => ({
      id: seat === 0 ? 'hero' : `ai-${seat}`, name: `P${seat}`, seat, stack: 1_000, isHero: seat === 0,
    }));
  }

  it('reads facing, raise count, raiser position and callers from the recorded decision context', () => {
    let state = createMultiwayHand({ players: players(6), buttonSeat: 0, random: seededRandom(606) });
    const order = [...state.pending];
    state = applyMultiwayAction(state, order[0]!, { type: 'raise', amount: 50 });   // UTG opens
    state = applyMultiwayAction(state, order[1]!, { type: 'call' });                // HJ calls
    state = applyMultiwayAction(state, order[2]!, { type: 'raise', amount: 200 });  // CO 3-bets
    const view = createFairMultiwayDecisionState(state, order[3]!);
    const threeBettor = rangeSpotFromMultiway(view, order[2]!);
    expect(threeBettor.preflop).toEqual([expect.objectContaining({
      type: 'raise', facing: 'raised', raiseCount: 1, callersAfterRaise: 1, raiserPosition: state.players[order[0]!]!.position,
    })]);
    const caller = rangeSpotFromMultiway(view, order[1]!);
    expect(caller.preflop).toEqual([expect.objectContaining({ type: 'call', facing: 'raised', raiseCount: 1 })]);
    expect(threeBettor.spot.playerCount).toBe(6);
  });
});
```

Append to the multiway decisions describe in `src/domain/poker/__tests__/multiwayAi.test.ts`:

```ts
  it('keeps every tier independent of hidden cards through the range model', () => {
    for (const difficulty of ['club', 'sharp', 'elite', 'nemesis'] as const) {
      const state = stateCheckedToAi();
      state.players['ai-1']!.holeCards = [card(13, 'diamonds'), card(12, 'diamonds')];
      const changed: MultiwayHandState = {
        ...state,
        players: {
          ...state.players,
          hero: { ...state.players.hero!, holeCards: [card(14, 'hearts'), card(14, 'diamonds')] },
          'ai-2': { ...state.players['ai-2']!, holeCards: [card(8, 'clubs'), card(8, 'spades')] },
        },
      };
      const options = { difficulty, identity: multiwayAiIdentityForSeat(1), simulations: 120 };
      const original = decideMultiwayAiAction(createFairMultiwayDecisionState(state, 'ai-1'), 'ai-1', { ...options, random: seededRandom(8_801) });
      const altered = decideMultiwayAiAction(createFairMultiwayDecisionState(changed, 'ai-1'), 'ai-1', { ...options, random: seededRandom(8_801) });
      expect(altered, difficulty).toEqual(original);
    }
  });

  it('keeps a production-depth nine-player Nemesis decision responsive', () => {
    const state = createMultiwayHand({ players: players(9), buttonSeat: 0, random: seededRandom(909) });
    const startedAt = performance.now();
    const decision = decideMultiwayAiAction(createFairMultiwayDecisionState(state, 'ai-4'), 'ai-4', {
      difficulty: 'nemesis',
      random: seededRandom(9_009),
    });
    const elapsedMs = performance.now() - startedAt;
    expect(elapsedMs).toBeLessThan(1_000);
    expect(() => applyMultiwayAction(state, 'ai-4', decision.action)).not.toThrow();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/opponentRange.test.ts -t "multiway public line"`
Expected: FAIL, missing export.

- [ ] **Step 3: Add the multiway line reader**

Append to `src/domain/poker/opponentRange.ts` (import `type FairMultiwayDecisionState` from `'./fairness.ts'`):

```ts
export function rangeSpotFromMultiway(
  state: FairMultiwayDecisionState,
  opponentId: string,
): RangeSpotActions {
  const opponent = state.players[opponentId];
  if (!opponent) throw new Error(`Player ${opponentId} is missing from the hand state.`);
  const position: TablePosition = opponent.position ?? 'BB';
  const preflop: PublicPreflopAction[] = [];
  const postflop: PublicPostflopAction[] = [];
  let effectiveStackBb = (opponent.stack + opponent.totalCommitted) / state.bigBlind;
  let playerCount = state.activePlayerIds.length;
  state.history.forEach((record) => {
    if (record.playerId !== opponentId || record.type === 'fold' || record.street === 'complete') return;
    const context = record.decisionContext;
    // Hands persisted before decision contexts existed carry no public spot; skip them.
    if (!context) return;
    if (preflop.length + postflop.length === 0) {
      effectiveStackBb = context.effectiveStack / state.bigBlind;
      playerCount = context.playerCount;
    }
    if (record.street === 'preflop') {
      preflop.push({
        type: record.type as 'raise' | 'call' | 'check',
        facing: context.preflopFacing,
        raiseCount: context.preflopRaiseCount ?? (context.preflopFacing === 'raised' ? 1 : 0),
        raiseSizeBb: context.preflopFacing === 'raised' ? context.currentBet / state.bigBlind : undefined,
        raiserPosition: context.preflopRaiserPosition,
        callersAfterRaise: context.preflopCallersAfterRaise ?? 0,
        limperCount: context.limperCount,
        canCheck: context.legalActions.canCheck,
      });
      return;
    }
    const potBefore = Math.max(1, context.potBefore);
    const fraction = record.type === 'raise'
      ? (record.amount - context.currentBet) / potBefore
      : context.toCall / potBefore;
    postflop.push({
      board: context.board,
      type: record.type as 'raise' | 'call' | 'check',
      sizeBucket: record.type === 'raise' && context.currentBet > 0 ? 'large' : sizeBucketFor(fraction),
      facingBet: context.toCall > 0,
    });
  });
  return { spot: { position, playerCount, effectiveStackBb }, preflop, postflop };
}
```

- [ ] **Step 4: Integrate into `decideMultiwayAiAction`**

In `src/domain/poker/multiwayAi.ts`:

Imports to add: `aiStrategyProfile` from `'./aiProfiles.ts'` (already added in Task 2); `GENERIC_HUMAN_RANGE_ID, resolveMultiwayOpponentRangeIdentity` from `'./multiwayEquity.ts'`; `buildOpponentRange, continueRangeStrength, createBoardClassifier, foldShare, rangeSpotFromMultiway, strongShare, type ComboRange` from `'./opponentRange.ts'`.

After `const random = options.random ?? Math.random;` and before the equity estimate, add:

```ts
  const profile = aiStrategyProfile(difficulty);
  const classifier = createBoardClassifier();
  const liveOpponents = liveOpponentIds(state, playerId);
  const ranges: Partial<Record<string, ComboRange>> = {};
  if (profile.rangeBlend > 0) {
    for (const opponentId of liveOpponents) {
      const opponent = state.players[opponentId];
      if (!opponent) continue;
      const modeled = resolveMultiwayOpponentRangeIdentity(opponent, options.identities);
      const human = modeled.id === GENERIC_HUMAN_RANGE_ID;
      ranges[opponentId] = buildOpponentRange(rangeSpotFromMultiway(state, opponentId), player.holeCards, state.board, {
        archetype: human ? 'balanced' : modeled.style,
        tier: human ? 'club' : modeled.level,
        rangeTightness: human ? undefined : modeled.rangeTightness,
        bluffAllowance: human ? 1 : modeled.bluffFrequency,
        narrowingStrength: profile.narrowingStrength,
        memory: human ? options.opponentMemory : undefined,
        memoryStrength: profile.memoryStrength,
      }, classifier);
    }
  }
  const rangeList = liveOpponents.map((id) => ranges[id]).filter((range): range is ComboRange => Boolean(range));
  const allFoldShare = (bucket: 'small' | 'large') => (
    rangeList.length === liveOpponents.length && rangeList.length > 0
      ? rangeList.reduce((product, range) => product * foldShare(range, state.board, bucket, classifier), 1)
      : undefined
  );
  const meanContinueStrength = (bucket: 'small' | 'large') => (
    rangeList.length === 0
      ? undefined
      : rangeList.reduce((sum, range) => sum + continueRangeStrength(range, state.board, bucket, classifier), 0) / rangeList.length
  );
```

Change the equity call to pass the ranges:

```ts
  const estimatedEquity = estimateMultiwayEquity(state, playerId, {
    simulations: options.simulations ?? tuning.equitySamples,
    random,
    identities: options.identities,
    ranges,
    rangeBlend: profile.rangeBlend,
  });
```

In the postflop branch, add to the `buildPostflopPlan` input (only when `state.board.length >= 3`, which the branch guarantees):

```ts
      foldShareBySize: (() => {
        const small = allFoldShare('small');
        const large = allFoldShare('large');
        return small !== undefined && large !== undefined ? { small, large } : undefined;
      })(),
      extraSizeFractions: profile.overbetCandidate
        && state.street === 'river'
        && rangeList.length === liveOpponents.length
        && rangeList.every((range) => strongShare(range, state.board, classifier) < 0.25)
        ? [1.25, 1.5]
        : undefined,
```

Change the Elite/Nemesis selector condition from `difficulty === 'elite' || difficulty === 'nemesis'` to `profile.evSelector && (difficulty === 'elite' || difficulty === 'nemesis')` and add to the `selectAdvancedPostflopAction` input:

```ts
        continueRangeStrengthBySize: (() => {
          const small = meanContinueStrength('small');
          const large = meanContinueStrength('large');
          return small !== undefined && large !== undefined ? { small, large } : undefined;
        })(),
```

- [ ] **Step 5: Run the multiway tests, range tests, ladder structure, typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/multiwayAi.test.ts src/domain/poker/__tests__/opponentRange.test.ts src/domain/poker/__tests__/aiLadder.test.ts src/domain/poker/__tests__/championshipSimulation.test.ts && pnpm typecheck`
Expected: fairness, legality, chip-conservation, latency, and dynamics-band tests pass unchanged. If "gives Sharp selective pressure that Friendly declines on a dry board" or "uses an established fold read for a narrow extra multiway bluff window" fail, inspect the plan's `foldEquity` for that spot; if the modeled range genuinely does not fold enough for the bluff to be priced, re-pin the expectation to the new behavior and record it in `docs/AI_LADDER_QA.md`. If the nine-player latency test exceeds 1,000 ms, reduce evaluator work by skipping classification for combos with zero weight in `BoardClassifier.classifyAll` (pass the range weights in) before touching sample counts.

- [ ] **Step 6: Commit**

```bash
git add src/domain/poker/multiwayAi.ts src/domain/poker/opponentRange.ts src/domain/poker/__tests__/multiwayAi.test.ts src/domain/poker/__tests__/opponentRange.test.ts docs/AI_LADDER_QA.md
git commit -m "feat(ai): multiway decisions model every live opponent range

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Nemesis per-session exploit read

**Files:**
- Create: `src/domain/poker/sessionExploitRead.ts`
- Create: `src/domain/poker/__tests__/sessionExploitRead.test.ts`
- Modify: `src/domain/poker/ai.ts` (`HeadsUpAiOptions.sessionRead`, apply scales)
- Modify: `src/domain/poker/multiwayAi.ts` (`MultiwayAiDecisionOptions.sessionRead`, apply scales)
- Modify: `src/domain/poker/multiwaySession.ts` (`decideSessionAiAction` gains `sessionRead?`)

**Interfaces:**
- Produces:
  ```ts
  export interface SessionExploitRead {
    version: 1; hands: number;
    cbetOpportunities: number; cbetFolds: number;
    threeBetOpportunities: number; threeBetFolds: number;
    riverBetOpportunities: number; riverCalls: number;
  }
  export function createEmptySessionExploitRead(): SessionExploitRead;
  export function observeSessionHeadsUpHand(read: SessionExploitRead, state: GameState, heroId?: PlayerId): SessionExploitRead;
  export function observeSessionMultiwayHand(read: SessionExploitRead, state: MultiwayHandState, heroId?: string): SessionExploitRead;
  export interface SessionExploitScales { cbetScale: number; threeBetScale: number; riverValueScale: number }
  export function sessionExploitScales(read: SessionExploitRead): SessionExploitScales;   // each in [0.7, 1.4]
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/domain/poker/__tests__/sessionExploitRead.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { seededRandom } from '../cards';
import { applyAction, createHand } from '../engine';
import {
  createEmptySessionExploitRead,
  observeSessionHeadsUpHand,
  sessionExploitScales,
} from '../sessionExploitRead';

function heroFoldsToCbet() {
  // Villain (button) opens, hero calls, villain bets flop, hero folds.
  let state = createHand({ button: 'villain', random: seededRandom(1) });
  state = applyAction(state, 'villain', { type: 'raise', amount: 50 });
  state = applyAction(state, 'hero', { type: 'call' });
  state = applyAction(state, 'villain', { type: 'raise', amount: 60 });
  state = applyAction(state, 'hero', { type: 'fold' });
  return state;
}

function heroFoldsToThreeBet() {
  let state = createHand({ button: 'hero', random: seededRandom(2) });
  state = applyAction(state, 'hero', { type: 'raise', amount: 50 });
  state = applyAction(state, 'villain', { type: 'raise', amount: 180 });
  state = applyAction(state, 'hero', { type: 'fold' });
  return state;
}

describe('session exploit read', () => {
  it('starts neutral', () => {
    expect(sessionExploitScales(createEmptySessionExploitRead())).toEqual({ cbetScale: 1, threeBetScale: 1, riverValueScale: 1 });
  });

  it('counts a fold to the preflop raiser flop bet as a continuation-bet fold', () => {
    const read = observeSessionHeadsUpHand(createEmptySessionExploitRead(), heroFoldsToCbet());
    expect(read.hands).toBe(1);
    expect(read.cbetOpportunities).toBe(1);
    expect(read.cbetFolds).toBe(1);
    expect(read.threeBetOpportunities).toBe(0);
  });

  it('counts a fold to a re-raise as a 3-bet fold', () => {
    const read = observeSessionHeadsUpHand(createEmptySessionExploitRead(), heroFoldsToThreeBet());
    expect(read.threeBetOpportunities).toBe(1);
    expect(read.threeBetFolds).toBe(1);
    expect(read.cbetOpportunities).toBe(0);
  });

  it('ramps over twelve hands and stays inside [0.7, 1.4]', () => {
    let read = createEmptySessionExploitRead();
    for (let hand = 0; hand < 12; hand += 1) read = observeSessionHeadsUpHand(read, heroFoldsToCbet());
    const scales = sessionExploitScales(read);
    expect(scales.cbetScale).toBeGreaterThan(1.2);
    expect(scales.cbetScale).toBeLessThanOrEqual(1.4);
    const early = sessionExploitScales(observeSessionHeadsUpHand(createEmptySessionExploitRead(), heroFoldsToCbet()));
    expect(early.cbetScale).toBeLessThan(scales.cbetScale);
    expect(early.cbetScale).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/sessionExploitRead.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Write the module**

Create `src/domain/poker/sessionExploitRead.ts`:

```ts
import type { MultiwayHandState } from './multiway.ts';
import type { GameState, PlayerId } from './types.ts';

/**
 * Nemesis-only, per-session, public-action counters about the human. Never
 * persisted; the table screen discards it when the session ends.
 */
export interface SessionExploitRead {
  version: 1;
  hands: number;
  cbetOpportunities: number;
  cbetFolds: number;
  threeBetOpportunities: number;
  threeBetFolds: number;
  riverBetOpportunities: number;
  riverCalls: number;
}

export interface SessionExploitScales {
  /** Multiplies continuation-bet pressure frequency. */
  cbetScale: number;
  /** Multiplies re-raise (3-bet) frequency against the human's opens. */
  threeBetScale: number;
  /** Multiplies river value-bet frequency; higher when the human calls rivers often. */
  riverValueScale: number;
}

const RAMP_HANDS = 12;

export function createEmptySessionExploitRead(): SessionExploitRead {
  return {
    version: 1, hands: 0,
    cbetOpportunities: 0, cbetFolds: 0,
    threeBetOpportunities: 0, threeBetFolds: 0,
    riverBetOpportunities: 0, riverCalls: 0,
  };
}

interface PublicRecord {
  actor: string;
  type: 'fold' | 'check' | 'call' | 'raise';
  street: string;
  toCall: number;
}

function observe(read: SessionExploitRead, records: readonly PublicRecord[], heroId: string): SessionExploitRead {
  const next = { ...read, hands: read.hands + 1 };
  const preflop = records.filter((record) => record.street === 'preflop');
  const raises = preflop.filter((record) => record.type === 'raise');
  const lastPreflopRaiser = raises.at(-1)?.actor;
  // 3-bet: hero raised preflop, then faced a later preflop raise.
  const heroRaiseIndex = preflop.findIndex((record) => record.actor === heroId && record.type === 'raise');
  if (heroRaiseIndex >= 0) {
    const reraiseIndex = preflop.findIndex((record, index) => index > heroRaiseIndex && record.type === 'raise' && record.actor !== heroId);
    if (reraiseIndex >= 0) {
      const response = preflop.find((record, index) => index > reraiseIndex && record.actor === heroId);
      if (response) {
        next.threeBetOpportunities += 1;
        if (response.type === 'fold') next.threeBetFolds += 1;
      }
    }
  }
  // Continuation bet: the first flop bet comes from the preflop raiser (not hero) and hero answers it.
  const flop = records.filter((record) => record.street === 'flop');
  const firstFlopBet = flop.findIndex((record) => record.type === 'raise');
  if (firstFlopBet >= 0 && lastPreflopRaiser && lastPreflopRaiser !== heroId && flop[firstFlopBet]!.actor === lastPreflopRaiser) {
    const response = flop.find((record, index) => index > firstFlopBet && record.actor === heroId && record.toCall > 0);
    if (response) {
      next.cbetOpportunities += 1;
      if (response.type === 'fold') next.cbetFolds += 1;
    }
  }
  // River: hero faced a bet.
  const riverResponse = records.find((record) => record.street === 'river' && record.actor === heroId && record.toCall > 0);
  if (riverResponse) {
    next.riverBetOpportunities += 1;
    if (riverResponse.type === 'call') next.riverCalls += 1;
  }
  return next;
}

export function observeSessionHeadsUpHand(
  read: SessionExploitRead,
  state: GameState,
  heroId: PlayerId = 'hero',
): SessionExploitRead {
  return observe(read, state.history.map((record) => ({
    actor: record.player,
    type: record.type,
    street: record.street,
    toCall: record.decisionContext.toCall,
  })), heroId);
}

export function observeSessionMultiwayHand(
  read: SessionExploitRead,
  state: MultiwayHandState,
  heroId = 'hero',
): SessionExploitRead {
  return observe(read, state.history.map((record) => ({
    actor: record.playerId,
    type: record.type,
    street: record.street,
    toCall: record.decisionContext?.toCall ?? 0,
  })), heroId);
}

function smoothed(successes: number, opportunities: number, prior: number, priorWeight: number): number {
  return (successes + prior * priorWeight) / Math.max(1, opportunities + priorWeight);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function sessionExploitScales(read: SessionExploitRead): SessionExploitScales {
  const confidence = clamp(read.hands / RAMP_HANDS, 0, 1);
  if (confidence === 0) return { cbetScale: 1, threeBetScale: 1, riverValueScale: 1 };
  const scale = (rate: number, baseline: number) => clamp(1 + ((rate - baseline) / 0.3) * 0.4 * confidence, 0.7, 1.4);
  return {
    cbetScale: scale(smoothed(read.cbetFolds, read.cbetOpportunities, 0.45, 4), 0.45),
    threeBetScale: scale(smoothed(read.threeBetFolds, read.threeBetOpportunities, 0.55, 4), 0.55),
    riverValueScale: scale(smoothed(read.riverCalls, read.riverBetOpportunities, 0.45, 4), 0.45),
  };
}
```

- [ ] **Step 4: Wire the scales into Nemesis decisions**

`src/domain/poker/ai.ts`: add `sessionRead?: SessionExploitRead` to `HeadsUpAiOptions` (import the type and `sessionExploitScales`). After `const identity = options.identity;` add:

```ts
  const exploit = profile.sessionRead && options.sessionRead
    ? sessionExploitScales(options.sessionRead)
    : { cbetScale: 1, threeBetScale: 1, riverValueScale: 1 };
```

In the preflop branch multiply `raiseFrequencyScale` by `facing === 'raised' ? exploit.threeBetScale : 1`. In the postflop `adjustments` object multiply `pressureFrequencyScale` by `state.street === 'flop' && initiative === 'player' && state.currentBet === 0 ? exploit.cbetScale : 1` and `valueFrequencyScale` by `state.street === 'river' ? exploit.riverValueScale : 1`.

`src/domain/poker/multiwayAi.ts`: add `sessionRead?: SessionExploitRead;` to `MultiwayAiDecisionOptions`, compute `exploit` the same way after `profile`, and apply the same three multipliers in the preflop `raiseFrequencyScale` and the postflop `pressureFrequencyScale` / `valueFrequencyScale` (both in the heuristic adjustments and in the `adaptation` passed to `selectAdvancedPostflopAction`).

`src/domain/poker/multiwaySession.ts`: add a final parameter `sessionRead?: SessionExploitRead` to `decideSessionAiAction` and pass `sessionRead` in the options object.

- [ ] **Step 5: Run the new tests plus heads-up and multiway suites, typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/sessionExploitRead.test.ts src/domain/poker/__tests__/ai.test.ts src/domain/poker/__tests__/multiwayAi.test.ts src/domain/poker/__tests__/multiwaySession.test.ts && pnpm typecheck`
Expected: all pass (no behavior change without a supplied read).

- [ ] **Step 6: Commit**

```bash
git add src/domain/poker/sessionExploitRead.ts src/domain/poker/__tests__/sessionExploitRead.test.ts src/domain/poker/ai.ts src/domain/poker/multiwayAi.ts src/domain/poker/multiwaySession.ts
git commit -m "feat(ai): Nemesis per-session public exploit read

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Screens pass the session read; heads-up villain gets a roster identity

**Files:**
- Modify: `src/domain/poker/engine.ts` (`NewHandOptions.villainName`, `createHand`, `createNextHand`, `formatAction`)
- Modify: `src/features/table/gameplayPresentation.ts` (`formatLatestAction`)
- Modify: `src/features/table/PokerTableScreen.tsx`
- Modify: `src/features/table/MultiwayPokerTableScreen.tsx`
- Test: `src/domain/poker/__tests__/engine.test.ts`

**Interfaces:**
- `createHand({ villainName?: string })`; `createNextHand` carries `state.players.villain.name`; `formatAction(record, villainName = 'RiverMind')`; `formatLatestAction(action, bigBlind, villainName = 'RiverMind')`.

- [ ] **Step 1: Write the failing engine test**

Append to `src/domain/poker/__tests__/engine.test.ts` (inside its top-level describe; imports `createHand, createNextHand, formatAction`):

```ts
  it('names the villain from options and carries the name into the next hand', () => {
    const first = createHand({ villainName: 'Kai', random: seededRandom(5) });
    expect(first.players.villain.name).toBe('Kai');
    const next = createNextHand({ ...first, street: 'complete' }, seededRandom(6));
    expect(next.players.villain.name).toBe('Kai');
    const record = { ...first.history[0]!, player: 'villain' as const, type: 'check' as const };
    expect(formatAction(record, 'Kai')).toBe('Kai checked');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/engine.test.ts -t "names the villain"`
Expected: FAIL (`villainName` not an option; name is "RiverMind").

- [ ] **Step 3: Implement the engine and presentation changes**

`src/domain/poker/engine.ts`: add `villainName?: string;` to `NewHandOptions`; in `createHand` set `name: options.villainName ?? 'RiverMind',` for the villain; in `createNextHand` pass `villainName: state.players.villain.name,`; change `formatAction` to `export function formatAction(record: ActionRecord, villainName = 'RiverMind'): string { const actor = record.player === 'hero' ? 'You' : villainName; ... }`.

`src/features/table/gameplayPresentation.ts`: change `formatLatestAction(action: ActionRecord, _bigBlind: number)` to `formatLatestAction(action: ActionRecord, _bigBlind: number, villainName = 'RiverMind')` and use `villainName` instead of the literal `'Mara'`. Update any call site found by `grep -rn "formatLatestAction(" src` to pass `game.players.villain.name`.

- [ ] **Step 4: Wire the heads-up screen**

In `src/features/table/PokerTableScreen.tsx`:

Imports: `multiwayAiIdentityAt, multiwayAiRoster` from `'../../domain/poker/multiwayAiProfiles'`; `createEmptySessionExploitRead, observeSessionHeadsUpHand, type SessionExploitRead` from `'../../domain/poker/sessionExploitRead'`.

Near `const aiProfile = aiStrategyProfile(aiDifficulty);` (line 220) add:

```tsx
  const [villainIdentity] = useState(() => multiwayAiIdentityAt(
    Math.floor(secureRandom() * multiwayAiRoster(aiDifficulty).length),
    aiDifficulty,
  ));
  const sessionReadRef = useRef<SessionExploitRead>(createEmptySessionExploitRead());
```

Change `createSessionHand(config)` to accept the name: `function createSessionHand(config: PracticeSessionConfig, villainName: string)` and pass `villainName` into `createHand`. Update its call site to pass `villainIdentity.name`.

In the AI turn effect (line 592 to 599), pass the options: `decideAiAction(createFairHeadsUpDecisionState(game, 'villain'), 'villain', secureRandom, aiDifficulty, opponentMemory, { identity: villainIdentity, sessionRead: sessionReadRef.current })`. Add `villainIdentity` to that effect's dependency list.

In the hand-complete effect that calls `queueHandPersistence` (around line 549), add before it: `sessionReadRef.current = observeSessionHeadsUpHand(sessionReadRef.current, game);`.

- [ ] **Step 5: Wire the multiway screen**

In `src/features/table/MultiwayPokerTableScreen.tsx`: import `createEmptySessionExploitRead, observeSessionMultiwayHand, type SessionExploitRead` from `'../../domain/poker/sessionExploitRead'`; add `const sessionReadRef = useRef<SessionExploitRead>(createEmptySessionExploitRead());` next to the other refs near line 418; pass `dailyMode ? undefined : sessionReadRef.current` as the new last argument of `decideSessionAiAction` (line 1058 to 1066); in the effect that runs on hand completion (search for `queueMultiwayHandPersistence(` and add immediately before the call) insert `if (!dailyMode) sessionReadRef.current = observeSessionMultiwayHand(sessionReadRef.current, game);`.

- [ ] **Step 6: Run engine tests, presentation tests, typecheck, full suite**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/engine.test.ts src/features/table && pnpm typecheck && pnpm test`
Expected: all pass. There are no render tests for the two screens; typecheck is the verification for them.

- [ ] **Step 7: Commit**

```bash
git add src/domain/poker/engine.ts src/features/table/gameplayPresentation.ts src/features/table/PokerTableScreen.tsx src/features/table/MultiwayPokerTableScreen.tsx src/domain/poker/__tests__/engine.test.ts
git commit -m "feat(table): heads-up villain roster identity and Nemesis session read wiring

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Daily Challenge version bump

**Files:**
- Modify: `src/domain/poker/dailyChallenge.ts:14`
- Test: `src/domain/poker/__tests__/dailyChallenge.test.ts`

- [ ] **Step 1: Write the failing test**

Append to the top-level describe in `src/domain/poker/__tests__/dailyChallenge.test.ts` (import `DAILY_CHALLENGE_VERSION`):

```ts
  it('is on version 3 after the AI ladder change so seeded outcomes are not compared across AIs', () => {
    expect(DAILY_CHALLENGE_VERSION).toBe(3);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/dailyChallenge.test.ts`
Expected: FAIL, version is 2.

- [ ] **Step 3: Bump**

In `src/domain/poker/dailyChallenge.ts` line 14: `export const DAILY_CHALLENGE_VERSION = 3;`

- [ ] **Step 4: Run the daily tests and any fixture-pinned tests**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/dailyChallenge.test.ts src/domain/poker/__tests__/dailyChallengeProgress.test.ts src/features/shell`
Expected: pass. If a test pins a version-2 seed string or checkpoint literal, update the literal to version 3 and note it in `docs/AI_LADDER_QA.md`.

- [ ] **Step 5: Commit**

```bash
git add src/domain/poker/dailyChallenge.ts src/domain/poker/__tests__/dailyChallenge.test.ts
git commit -m "chore(daily): bump Daily Challenge version for the new AI ladder

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Tuning pass against the ladder gate

**Files:**
- Modify: `src/domain/poker/aiProfiles.ts` (ladder fields), `src/domain/poker/opponentRange.ts` (tables) as needed
- Modify: `src/domain/poker/__tests__/aiLadder.test.ts` (add the CI bluff-ratio pin)
- Modify: `docs/AI_LADDER_QA.md`, `docs/AI_DIFFICULTY_PRESETS.md`

- [ ] **Step 1: Run the ladder gate**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && AI_BENCHMARK_OUTPUT=/tmp/ladder-after-1.json pnpm eval:ai:ladder`
Paste the rows into `docs/AI_LADDER_QA.md` under "Tuning steps / Step 0: after integration, before tuning".

- [ ] **Step 2: Tune in the spec's order**

Targets: heads-up Elite vs Club and Nemesis vs Club at least +20 BB/100 with the lower 2 SE bound above 0; heads-up adjacent pairs never with an upper bound below 0; six-max Sharp, Elite, Nemesis vs Club positive point estimates. Knobs in order of preference, one change per iteration, each iteration re-run and recorded:

1. `bluffPricingScale` for Club (0.6) and Sharp (0.9), in steps of 0.15.
2. `narrowingStrength` for Club (0.5) and Sharp (0.8), in steps of 0.1.
3. `FACING_BET_TABLE` and `CHECKED_TO_TABLE` values, at most 0.05 per cell per iteration, keeping rows summing to 1.
4. `rangeBlend` for Club (0.4) and Sharp (0.7), in steps of 0.1.
5. Friendly and Club gentleness constants only if a step below Sharp is still inverted after the four knobs above.

After every iteration also run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/multiwayAi.test.ts src/domain/poker/__tests__/ai.test.ts src/domain/poker/__tests__/championshipSimulation.test.ts` and confirm the dynamics bands still pass. If a band fails, revert that iteration and try the next knob.

- [ ] **Step 3: Add the CI bluff-ratio pin**

Append to the structural describe in `src/domain/poker/__tests__/aiLadder.test.ts`:

```ts
  it('keeps Elite postflop bluffing within a bounded ratio of Club on a fixed corpus', () => {
    const [result] = runHeadsUpLadder([['elite', 'club']], 100, 5_150);
    const eliteBluffs = result!.postflopRaiseStyles.higher.bluff ?? 0;
    const clubBluffs = result!.postflopRaiseStyles.lower.bluff ?? 0;
    // Before this slice Elite bluffed about six times as often as Club and lost chips doing it.
    expect(eliteBluffs).toBeLessThanOrEqual(Math.max(8, clubBluffs * 2.5));
  }, 120_000);
```

Run it; if the measured ratio after tuning sits comfortably under 2.5 keep the bound, otherwise set the bound to the measured ratio plus 0.5 and record the value in the QA doc.

- [ ] **Step 4: Record the final numbers and update the presets doc**

In `docs/AI_LADDER_QA.md` add "Final numbers (shipped)" with the full ladder table. In `docs/AI_DIFFICULTY_PRESETS.md` replace the "Earned Championship tiers" table's "Main distinction" column with the feature list from the spec's section 5.4 table, and add a "Ladder benchmark" subsection pointing to `pnpm eval:ai:ladder` and the QA doc with the shipped heads-up and six-max numbers.

- [ ] **Step 5: Commit**

```bash
git add src/domain/poker/aiProfiles.ts src/domain/poker/opponentRange.ts src/domain/poker/__tests__/aiLadder.test.ts docs/AI_LADDER_QA.md docs/AI_DIFFICULTY_PRESETS.md
git commit -m "tune(ai): calibrate the difficulty ladder against the duplicate-deal gate

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Final verification

**Files:** none new.

- [ ] **Step 1: Full suite and typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && pnpm typecheck && pnpm test`
Expected: all green. Paste the summary line into `docs/AI_LADDER_QA.md` under "Verification".

- [ ] **Step 2: Championship calibration before and after**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && pnpm eval:championship-ai`
Record the Sharp-proxy Final and invitation win rates in the QA doc next to the pre-slice values from `docs/AI_DIFFICULTY_PRESETS.md` (21.25 percent and 12.5 percent). The target is harder but still completed by the Sharp proxy at a nonzero rate.

- [ ] **Step 3: Fairness sweep**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/fairness.test.ts src/domain/poker/__tests__/ai.test.ts src/domain/poker/__tests__/multiwayAi.test.ts -t "hidden|fair|independent"`
Expected: all pass with no re-pins in this category.

- [ ] **Step 4: Commit the QA record**

```bash
git add docs/AI_LADDER_QA.md
git commit -m "docs: record AI ladder verification results

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review against the spec

- Spec 5.1 range model: Tasks 3, 4, 8, 9. Memory prior: Task 3 (`memoryLegScale`) applied preflop and to postflop call probabilities in Task 4.
- Spec 5.2 equity against range with per-tier blend: Task 5 (samplers), Task 8 and 9 (blend from profile).
- Spec 5.3 priced aggression, heuristic and EV, heads-up EV routing: Tasks 6, 7, 8.
- Spec 5.4 tier fields and multiway tuning fix: Task 2. `bluffPricingScale` for Elite and Nemesis is 0 because they select by EV, matching "n/a" in the spec table.
- Spec 5.5 Nemesis session read and overbet candidate: Tasks 10 and 11 (read), Tasks 6, 8, 9 (overbet).
- Spec 5.6 heads-up villain identity and name: Task 11.
- Spec 7 fairness and determinism, Daily version: Tasks 8, 9, 12.
- Spec 8 benchmark, tuning order, QA doc: Tasks 1, 13.
- Spec 9 testing: each task carries its tests; latency for Nemesis six- and nine-player in Task 9.
- Spec 10 player-facing: Task 11 (name), no copy changes anywhere.
- Type consistency checked: `RangeModelProfile` fields (`archetype, tier, rangeTightness?, bluffAllowance, narrowingStrength, memory?, memoryStrength`) are used identically in Tasks 3, 4, 8, 9; `foldShareBySize` and `extraSizeFractions` names match between Tasks 6, 8, 9; `continueRangeStrengthBySize` matches between Tasks 7, 8, 9; `SessionExploitRead` and `sessionExploitScales` match between Tasks 10 and 11.
