# AI Difficulty Ladder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every AI tier above Friendly a genuinely stronger poker player by modeling the opponent's range from public actions and pricing aggression by fold equity and equity-when-called, then prove the ladder is monotonic with a duplicate-deal benchmark on held-out seeds.

**Architecture:** A new pure domain module `opponentRange.ts` turns an opponent's public line into 1,326 weighted hole-card combos using the authored preflop tables the AI already plays and an authored, memory-shifted response table. Equity samplers draw from that range and from its continuing sub-range per bet size; the postflop plan records fold equity per candidate; the heuristic selector prices bluffs from it instead of flat per-tier bonuses; the EV selector (now also heads-up) uses fold equity and equity-when-called. A benchmark module plays duplicate deals tier against tier on disjoint tuning and evaluation seeds. Delivery is staged and each stage is measured.

**Tech Stack:** TypeScript 5.9, vitest 4, pnpm, Expo/React Native (two screen files touched). Pure domain code under `src/domain/poker/`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-05-ai-difficulty-ladder-design.md`

## Global Constraints

- Node 22 is required and the login shell defaults to Node 16. Prefix every tooling command with `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && `.
- Run single test files with `npx vitest run <path>`; the whole suite with `pnpm test`; types with `pnpm typecheck`.
- Domain files under `src/domain/poker/` import siblings with the explicit `.ts` extension in some files and without in others; match the style of the file you edit. Tests import without the extension.
- The AI may consume only the branded fair decision state (`FairHeadsUpDecisionState`, `FairMultiwayDecisionState`) plus its own hole cards. Never read another seat's `holeCards` or the `deck`.
- All randomness flows through the caller-supplied `RandomSource`; never call `Math.random` in domain code.
- Friendly keeps uniform-random equity (`rangeBlend` 0) and its current gentleness knobs. Coaching, grading, and the range explorer keep the neutral uniform baseline.
- No test may assert that a higher tier raises, bluffs, or sizes more than a lower tier. Monotonicity tests cover quality knobs only.
- Tuning iterations use the tuning seeds only. The evaluation seeds are run at the end of each stage for the record and never while adjusting a knob.
- Commit after each task with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. The working tree already holds unrelated uncommitted changes; stage only the files named in the task.
- Existing dynamics tests must keep passing: big-blind defend floor, walk rate, showdown share, multiway flop share, personality distinctness, chip conservation, legality. If a heads-up or multiway behavior pin moves, re-pin it and record the reason in `docs/AI_LADDER_QA.md`. Never re-pin a fairness, legality, or chip-conservation test.
- Every stage ends with `pnpm eval:ai:ladder` on the tuning corpus and a recorded entry in `docs/AI_LADDER_QA.md` before the next stage starts.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/domain/poker/aiLadderBenchmark.ts` (new) | Duplicate-deal heads-up, six-max, per-style, and adaptation runners; disjoint seed corpora |
| `src/domain/poker/__tests__/aiLadder.test.ts` (new) | Cheap structural tests always; full corpus behind `RUN_AI_BENCHMARK=1` |
| `src/domain/poker/aiProfiles.ts` | Ladder fields on `AiStrategyProfile`; the single source of per-tier knobs |
| `src/domain/poker/multiwayAiProfiles.ts` | Nemesis tuning set equal to Elite |
| `src/domain/poker/opponentRange.ts` (new) | Combo range: preflop weights, board-relative classification, memory-shifted response table, narrowing, fold share, continuing range, sampling |
| `src/domain/poker/__tests__/opponentRange.test.ts` (new) | Unit tests for the range module |
| `src/domain/poker/postflopStrategy.ts` | Exports the draw detector; `foldEquity` per candidate; extra sizes; priced bluff term; flat bonuses removed |
| `src/domain/poker/equity.ts` | `estimateEquityAgainstRange` |
| `src/domain/poker/multiwayEquity.ts` | `ranges` and `rangeBlend` options; exported generic human range id |
| `src/domain/poker/postflopEv.ts` | Uses `foldEquity` and `calledEquityBySize`; shared EV core; heads-up adapter |
| `src/domain/poker/sessionExploitRead.ts` (new) | Nemesis per-session public counters and bounded scales |
| `src/domain/poker/ai.ts` | Heads-up integration |
| `src/domain/poker/multiwayAi.ts` | Multiway integration |
| `src/domain/poker/multiwaySession.ts` | `decideSessionAiAction` gains `sessionRead` |
| `src/domain/poker/engine.ts` | `villainName` option; `formatAction` reads the name |
| `src/features/table/gameplayPresentation.ts` | `formatLatestAction` reads the name |
| `src/features/table/PokerTableScreen.tsx` | Villain roster identity; session read ref |
| `src/features/table/MultiwayPokerTableScreen.tsx` | Session read ref |
| `src/domain/poker/dailyChallenge.ts` | `DAILY_CHALLENGE_VERSION` 2 → 3 |
| `docs/AI_LADDER_QA.md` (new) | Baseline, every stage's numbers, re-pins and reasons |
| `docs/AI_DIFFICULTY_PRESETS.md` | Updated tier table and benchmark section |
| `package.json` | `eval:ai:ladder` script |

## Stage map

| Stage | Tasks | Ends with |
| --- | --- | --- |
| 0 Benchmark and baseline | 1 | Baseline rows on both corpora |
| 1 Remove flat incentives | 2, 3 | Ladder run: effect of incentives alone |
| 2 Ranges | 4, 5, 6, 7, 8 | Ladder run: effect of hand-reading |
| 3 Equity when called | 9, 10 | Ladder run: effect of correct called equity |
| 4 Calibrate | 11 | Ladder meets the bar on evaluation seeds |
| 5 Nemesis features | 12, 13, 14 | Ladder run: effect of Nemesis-only features |
| 6 Release record | 15, 16 | Full suite, championship calibration, long run |

---

## Stage 0: Benchmark and baseline

### Task 1: Ladder benchmark module, opt-in gate, seeds, and baseline record

**Files:**
- Create: `src/domain/poker/aiLadderBenchmark.ts`
- Create: `src/domain/poker/__tests__/aiLadder.test.ts`
- Create: `docs/AI_LADDER_QA.md`
- Modify: `package.json` (scripts block, after `"eval:ai:strength"`)

**Interfaces:**
- Consumes: `createHand`, `applyAction` (`engine.ts`); `decideAiAction` (`ai.ts`); `createMultiwayHand`, `applyMultiwayAction`, `TablePlayerConfig` (`multiway.ts`); `decideMultiwayAiAction` (`multiwayAi.ts`); `multiwayAiIdentityForName`, `MULTIWAY_AI_IDENTITIES` (`multiwayAiProfiles.ts`); `createFairHeadsUpDecisionState`, `createFairMultiwayDecisionState` (`fairness.ts`); `seededRandom` (`cards.ts`); `applyOpponentObservation`, `createEmptyOpponentMemory`, `observePublicHeadsUpHand` (`opponentMemory.ts`).
- Produces:
  ```ts
  export const LADDER_SEEDS: { tuning: { headsUp: 777_001; sixMax: 424_242 }; evaluation: { headsUp: 9_101_113; sixMax: 5_150_517 } };
  export const DEFAULT_LADDER_PAIRS: ReadonlyArray<readonly [AiDifficulty, AiDifficulty]>;
  export interface LadderMatchupResult { matchup; higher; lower; hands; netBbForHigher; bbPer100; plusMinusPer100; showdownPct; postflopRaiseStyles: { higher: Record<string, number>; lower: Record<string, number> } }
  export interface AdaptationRowResult { matchup; hands; netBbMemoryOff; netBbMemoryOn; adaptationGainBbPer100 }
  export function runHeadsUpLadder(pairs, deals, seed): LadderMatchupResult[];
  export function runSixMaxLadder(pairs, deals, seed, styleName?: string): LadderMatchupResult[];
  export function runSixMaxStyleRows(pairs, deals, seed): LadderMatchupResult[];   // one row per personality style
  export function runAdaptationRows(pairs, hands, seed): AdaptationRowResult[];
  ```

- [ ] **Step 1: Write the failing structural tests**

Create `src/domain/poker/__tests__/aiLadder.test.ts`:

```ts
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LADDER_PAIRS,
  LADDER_SEEDS,
  runAdaptationRows,
  runHeadsUpLadder,
  runSixMaxLadder,
  runSixMaxStyleRows,
} from '../aiLadderBenchmark';

describe('AI ladder benchmark structure', () => {
  it('plays duplicate deals heads-up and reports a symmetric result shape', () => {
    const [result] = runHeadsUpLadder([['club', 'friendly']], 4, 11);
    expect(result!.hands).toBe(8);
    expect(result!.matchup).toBe('club vs friendly');
    expect(Number.isFinite(result!.bbPer100)).toBe(true);
    expect(result!.plusMinusPer100).toBeGreaterThanOrEqual(0);
    expect(result!.showdownPct).toBeGreaterThanOrEqual(0);
    expect(result!.showdownPct).toBeLessThanOrEqual(100);
  });

  it('cancels card luck: a tier against itself nets exactly zero', () => {
    expect(runHeadsUpLadder([['club', 'club']], 6, 23)[0]!.netBbForHigher).toBeCloseTo(0, 6);
    expect(runSixMaxLadder([['club', 'club']], 2, 23)[0]!.netBbForHigher).toBeCloseTo(0, 6);
  });

  it('plays 6-max with three seats per tier, per personality style', () => {
    const rows = runSixMaxStyleRows([['sharp', 'club']], 1, 31);
    expect(rows.map((row) => row.matchup)).toEqual([
      'sharp vs club [balanced]', 'sharp vs club [patient]', 'sharp vs club [pressure]',
      'sharp vs club [sticky]', 'sharp vs club [deceptive]',
    ]);
    expect(rows[0]!.hands).toBe(2);
  });

  it('reports adaptation as memory-on minus memory-off on identical deals', () => {
    const [row] = runAdaptationRows([['sharp', 'club']], 6, 41);
    expect(row!.hands).toBe(6);
    expect(Number.isFinite(row!.adaptationGainBbPer100)).toBe(true);
  });

  it('keeps the tuning and evaluation corpora disjoint', () => {
    expect(LADDER_SEEDS.tuning.headsUp).not.toBe(LADDER_SEEDS.evaluation.headsUp);
    expect(LADDER_SEEDS.tuning.sixMax).not.toBe(LADDER_SEEDS.evaluation.sixMax);
  });
});

// Opt-in ladder gate. Slow: production sample depth.
describe.skipIf(process.env.RUN_AI_BENCHMARK !== '1')('AI ladder benchmark corpus', () => {
  it('reports every pair heads-up, six-max, per style, and with adaptation', () => {
    const corpus = process.env.LADDER_CORPUS === 'evaluation' ? LADDER_SEEDS.evaluation : LADDER_SEEDS.tuning;
    const huDeals = Number(process.env.LADDER_HU_DEALS ?? 1_500);
    const mwDeals = Number(process.env.LADDER_MW_DEALS ?? 600);
    const styleDeals = Number(process.env.LADDER_STYLE_DEALS ?? 150);
    const adaptHands = Number(process.env.LADDER_ADAPT_HANDS ?? 600);
    const topPairs = DEFAULT_LADDER_PAIRS.filter(([, lower]) => lower === 'club');
    const rows = {
      corpus: process.env.LADDER_CORPUS === 'evaluation' ? 'evaluation' : 'tuning',
      headsUp: runHeadsUpLadder(DEFAULT_LADDER_PAIRS, huDeals, corpus.headsUp),
      sixMax: runSixMaxLadder(DEFAULT_LADDER_PAIRS, mwDeals, corpus.sixMax),
      sixMaxStyles: runSixMaxStyleRows(topPairs, styleDeals, corpus.sixMax + 1),
      adaptation: runAdaptationRows(topPairs, adaptHands, corpus.headsUp + 1),
    };
    console.log('AI_LADDER', JSON.stringify(rows));
    if (process.env.AI_BENCHMARK_OUTPUT) writeFileSync(process.env.AI_BENCHMARK_OUTPUT, JSON.stringify(rows, null, 2));
    expect(rows.headsUp.length).toBe(DEFAULT_LADDER_PAIRS.length);
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
import {
  MULTIWAY_AI_IDENTITIES,
  multiwayAiIdentityForName,
  type MultiwayAiIdentity,
  type MultiwayAiStyle,
} from './multiwayAiProfiles.ts';
import {
  applyOpponentObservation,
  createEmptyOpponentMemory,
  observePublicHeadsUpHand,
  type OpponentMemory,
} from './opponentMemory.ts';
import type { GameState, PlayerId } from './types.ts';

export const LADDER_SEEDS = {
  tuning: { headsUp: 777_001, sixMax: 424_242 },
  evaluation: { headsUp: 9_101_113, sixMax: 5_150_517 },
} as const;

export const DEFAULT_LADDER_PAIRS: ReadonlyArray<readonly [AiDifficulty, AiDifficulty]> = [
  ['club', 'friendly'],
  ['sharp', 'club'],
  ['elite', 'sharp'],
  ['nemesis', 'elite'],
  ['elite', 'club'],
  ['nemesis', 'club'],
];

export interface LadderMatchupResult {
  matchup: string;
  higher: AiDifficulty;
  lower: AiDifficulty;
  hands: number;
  netBbForHigher: number;
  bbPer100: number;
  /** Half-width of the 2-standard-error band, BB per 100 hands of the higher tier. */
  plusMinusPer100: number;
  showdownPct: number;
  postflopRaiseStyles: { higher: Record<string, number>; lower: Record<string, number> };
}

export interface AdaptationRowResult {
  matchup: string;
  hands: number;
  netBbMemoryOff: number;
  netBbMemoryOn: number;
  adaptationGainBbPer100: number;
}

const STARTING_STACK = 1_000;
const SIX_MAX_SEATS = 6;
const STYLE_ORDER: readonly MultiwayAiStyle[] = ['balanced', 'patient', 'pressure', 'sticky', 'deceptive'];

function bump(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function summarize(
  matchup: string,
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
    matchup,
    higher,
    lower,
    hands: handsPlayed,
    netBbForHigher: Math.round(total * 10) / 10,
    bbPer100: Math.round((total / Math.max(1, higherSeatHands)) * 1_000) / 10,
    plusMinusPer100: Math.round((2 * standardError / seatHandsPerDeal) * 1_000) / 10,
    showdownPct: Math.round((showdowns / Math.max(1, handsPlayed)) * 1_000) / 10,
    postflopRaiseStyles: styles,
  };
}

interface HeadsUpDealOutcome { delta: Record<PlayerId, number>; showdown: boolean; state: GameState }

function playHeadsUpDeal(
  seed: number,
  dealIndex: number,
  tiers: Record<PlayerId, AiDifficulty>,
  styles: Record<PlayerId, Record<string, number>>,
  memory: Partial<Record<PlayerId, OpponentMemory>> = {},
): HeadsUpDealOutcome {
  let state = createHand({ button: dealIndex % 2 === 0 ? 'hero' : 'villain', random: seededRandom(seed) });
  const rng: Record<PlayerId, RandomSource> = { hero: seededRandom(seed * 7 + 1), villain: seededRandom(seed * 11 + 3) };
  for (let step = 0; step < 60 && state.street !== 'complete'; step += 1) {
    const actor = state.toAct;
    if (!actor) throw new Error('A live ladder hand has no player to act.');
    const decision = decideAiAction(createFairHeadsUpDecisionState(state, actor), actor, rng[actor], tiers[actor], memory[actor]);
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
    state,
  };
}

/** Duplicate deals: each seeded deal is played twice with the tiers swapped. */
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
    return summarize(`${higher} vs ${lower}`, higher, lower, perDeal, deals * 2, deals * 2, showdowns, { higher: higherStyles, lower: lowerStyles });
  });
}

/**
 * Sequential heads-up session on identical deals, higher tier in the villain seat,
 * run twice: without memory and with memory accumulated from the lower tier's public
 * actions. The difference isolates what adaptation is worth; card luck is identical.
 */
export function runAdaptationRows(
  pairs: ReadonlyArray<readonly [AiDifficulty, AiDifficulty]>,
  hands: number,
  seed: number,
): AdaptationRowResult[] {
  return pairs.map(([higher, lower]) => {
    const play = (withMemory: boolean): number => {
      let memory = createEmptyOpponentMemory();
      let net = 0;
      const styles = { hero: {} as Record<string, number>, villain: {} as Record<string, number> };
      for (let hand = 0; hand < hands; hand += 1) {
        const outcome = playHeadsUpDeal(seed + hand * 131, hand, { hero: lower, villain: higher }, styles, withMemory ? { villain: memory } : {});
        net += outcome.delta.villain;
        if (withMemory) memory = applyOpponentObservation(memory, observePublicHeadsUpHand(outcome.state), '2026-01-01T00:00:00.000Z');
      }
      return net;
    };
    const off = play(false);
    const on = play(true);
    return {
      matchup: `${higher} vs ${lower}`,
      hands,
      netBbMemoryOff: Math.round(off * 10) / 10,
      netBbMemoryOn: Math.round(on * 10) / 10,
      adaptationGainBbPer100: Math.round(((on - off) / hands) * 1_000) / 10,
    };
  });
}

function sixMaxPlayers(): TablePlayerConfig[] {
  return Array.from({ length: SIX_MAX_SEATS }, (_, seat) => ({ id: `p${seat}`, name: `Seat ${seat}`, seat, stack: STARTING_STACK }));
}

function identityForStyle(style: MultiwayAiStyle): MultiwayAiIdentity {
  const identity = MULTIWAY_AI_IDENTITIES.find((candidate) => candidate.style === style && candidate.level === 'club');
  if (!identity) throw new Error(`No club-level ${style} identity exists in the roster.`);
  return identity;
}

function playSixMaxDeal(
  seed: number,
  dealIndex: number,
  tiers: readonly AiDifficulty[],
  higher: AiDifficulty,
  identity: MultiwayAiIdentity,
  styles: LadderMatchupResult['postflopRaiseStyles'],
): { higherDeltaBb: number; showdown: boolean } {
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
      difficulty: tiers[seat], identity, identities, random: rng[seat],
    });
    if (decision.action.type === 'raise' && state.street !== 'preflop') bump(tiers[seat] === higher ? styles.higher : styles.lower, decision.style);
    state = applyMultiwayAction(state, actor, decision.action);
  }
  if (state.street !== 'complete') throw new Error(`Ladder table deal ${dealIndex} did not finish.`);
  const higherDeltaBb = players.reduce((sum, player) => (
    tiers[player.seat] === higher ? sum + ((state.players[player.id]?.stack ?? STARTING_STACK) - STARTING_STACK) / state.bigBlind : sum
  ), 0);
  return { higherDeltaBb, showdown: Boolean(state.outcome?.showdown) };
}

/** Six seats, alternating tiers, one personality in every seat, pattern flipped per deal. */
export function runSixMaxLadder(
  pairs: ReadonlyArray<readonly [AiDifficulty, AiDifficulty]>,
  deals: number,
  seed: number,
  styleName?: string,
): LadderMatchupResult[] {
  const identity = styleName
    ? identityForStyle(styleName as MultiwayAiStyle)
    : multiwayAiIdentityForName('Kai');
  if (!identity) throw new Error('The balanced benchmark identity is missing from the roster.');
  return pairs.map(([higher, lower]) => {
    const patternA = Array.from({ length: SIX_MAX_SEATS }, (_, seat) => (seat % 2 === 0 ? higher : lower));
    const patternB = Array.from({ length: SIX_MAX_SEATS }, (_, seat) => (seat % 2 === 0 ? lower : higher));
    const perDeal: number[] = [];
    let showdowns = 0;
    const styles = { higher: {} as Record<string, number>, lower: {} as Record<string, number> };
    for (let deal = 0; deal < deals; deal += 1) {
      const dealSeed = seed + deal * 211;
      const first = playSixMaxDeal(dealSeed, deal, patternA, higher, identity, styles);
      const second = playSixMaxDeal(dealSeed, deal, patternB, higher, identity, styles);
      perDeal.push(first.higherDeltaBb + second.higherDeltaBb);
      showdowns += Number(first.showdown) + Number(second.showdown);
    }
    const label = styleName ? `${higher} vs ${lower} [${styleName}]` : `${higher} vs ${lower}`;
    return summarize(label, higher, lower, perDeal, deals * 2, deals * SIX_MAX_SEATS, showdowns, styles);
  });
}

export function runSixMaxStyleRows(
  pairs: ReadonlyArray<readonly [AiDifficulty, AiDifficulty]>,
  deals: number,
  seed: number,
): LadderMatchupResult[] {
  return pairs.flatMap(([higher, lower]) => STYLE_ORDER.map((style) => runSixMaxLadder([[higher, lower]], deals, seed, style)[0]!));
}
```

- [ ] **Step 4: Run the structural tests**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/aiLadder.test.ts`
Expected: 5 passed, 1 skipped. The style-row test expects the order balanced, patient, pressure, sticky, deceptive; `identityForStyle` picks the club-level roster member of each style (Kai, Iris, Dex, Lena, Amir).

- [ ] **Step 5: Add the pnpm script**

In `package.json`, after the `"eval:ai:strength"` line:

```json
    "eval:ai:ladder": "RUN_AI_BENCHMARK=1 vitest run src/domain/poker/__tests__/aiLadder.test.ts --disableConsoleIntercept",
```

- [ ] **Step 6: Record the baseline on both corpora**

Run (each about 30 minutes):
`source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && AI_BENCHMARK_OUTPUT=/tmp/ladder-baseline-tuning.json pnpm eval:ai:ladder`
`source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && LADDER_CORPUS=evaluation AI_BENCHMARK_OUTPUT=/tmp/ladder-baseline-evaluation.json pnpm eval:ai:ladder`

Create `docs/AI_LADDER_QA.md` with this skeleton and fill every table from the two JSON files:

```markdown
# AI difficulty ladder QA

Spec: docs/superpowers/specs/2026-09-05-ai-difficulty-ladder-design.md

Method: `pnpm eval:ai:ladder` (tuning corpus) and `LADDER_CORPUS=evaluation pnpm eval:ai:ladder`
(held-out corpus). Duplicate deals at production sample depth. Positive numbers mean the higher
tier won chips; `±` is the 2-standard-error half-width in BB per 100. Adaptation rows are
sequential sessions, not duplicate deals, and report memory-on minus memory-off on identical deals.

## Stage 0: baseline (commit <short hash>)

### Tuning corpus
| matchup | hands | bbPer100 | ± | showdown % | higher bluffs | lower bluffs |
(heads-up rows, then six-max rows, then six-max style rows)

| adaptation matchup | hands | memory off BB | memory on BB | gain BB/100 |

### Evaluation corpus
(same tables)

Reference spike numbers from 2026-09-05 (other seeds): heads-up Elite vs Club −72.1 ±48,
Nemesis vs Club −65.3 ±47, Nemesis vs Friendly −17.5 ±39; six-max Sharp vs Club −19.2 ±26,
Elite vs Club −17.8 ±30, Nemesis vs Club −24.2 ±30 (all six-max bands cross zero).

## Stage 1: flat incentives removed
## Stage 2: ranges
## Stage 3: equity when called
## Stage 4: calibration (one subsection per knob change)
## Stage 5: Nemesis features
## Stage 6: release record

## Re-pinned tests
One line per changed expectation: test name, old value, new value, reason.
```

Replace `<short hash>` with `git rev-parse --short HEAD`.

- [ ] **Step 7: Commit**

```bash
git add src/domain/poker/aiLadderBenchmark.ts src/domain/poker/__tests__/aiLadder.test.ts docs/AI_LADDER_QA.md package.json
git commit -m "test: add duplicate-deal AI ladder benchmark with held-out seeds and record baseline

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Stage 1: Remove flat incentives

### Task 2: Ladder fields on the tier profiles, quality-only monotonicity, Nemesis tuning equals Elite

**Files:**
- Modify: `src/domain/poker/aiProfiles.ts`
- Modify: `src/domain/poker/multiwayAiProfiles.ts` (the `nemesis` entry of `MULTIWAY_DIFFICULTY_TUNING`)
- Modify: `src/domain/poker/ai.ts:20-26` and `src/domain/poker/multiwayAi.ts:63-69` (delete the duplicated `adaptationStrength` records)
- Test: `src/domain/poker/__tests__/ai.test.ts`, `src/domain/poker/__tests__/multiwayAi.test.ts`

**Interfaces:**
- Produces on `AiStrategyProfile`:
  ```ts
  rangeBlend: number;          // 0..1 share of equity samples drawn from the modeled range
  narrowingStrength: number;   // 0..1, interpolates response probabilities toward 1
  memoryStrength: number;      // replaces the adaptationStrength maps (0.35, 0.7, 1, 1.15, 1.3)
  bluffPricingScale: number;   // heuristic selector weight on (foldEquity − breakEven)
  evSelector: boolean;         // Elite and Nemesis
  sessionRead: boolean;        // Nemesis only
  overbetCandidate: boolean;   // Nemesis only; offered only from Task 14
  ```

- [ ] **Step 1: Write the failing tests**

Append to `describe('AI difficulty profiles', ...)` in `src/domain/poker/__tests__/ai.test.ts`:

```ts
  it('defines a monotonic hand-reading ladder in the profile table (quality knobs only)', () => {
    const order = ['friendly', 'club', 'sharp', 'elite', 'nemesis'] as const;
    const profiles = order.map((tier) => AI_STRATEGY_PROFILES[tier]);
    expect(profiles.map((profile) => profile.rangeBlend)).toEqual([0, 0.4, 0.7, 1, 1]);
    expect(profiles.map((profile) => profile.narrowingStrength)).toEqual([0, 0.5, 0.8, 1, 1]);
    expect(profiles.map((profile) => profile.memoryStrength)).toEqual([0.35, 0.7, 1, 1.15, 1.3]);
    expect(profiles.map((profile) => profile.bluffPricingScale)).toEqual([0, 0.6, 0.9, 0, 0]);
    expect(profiles.map((profile) => profile.evSelector)).toEqual([false, false, false, true, true]);
    expect(profiles.map((profile) => profile.sessionRead)).toEqual([false, false, false, false, true]);
    expect(profiles.map((profile) => profile.overbetCandidate)).toEqual([false, false, false, false, true]);
    for (let index = 1; index < profiles.length; index += 1) {
      expect(profiles[index]!.equitySamples).toBeGreaterThan(profiles[index - 1]!.equitySamples);
    }
  });
```

Append to `describe('multiway AI identities and decisions', ...)` in `src/domain/poker/__tests__/multiwayAi.test.ts` (import `MULTIWAY_DIFFICULTY_TUNING` from `'../multiwayAiProfiles'`):

```ts
  it('gives Nemesis the same aggression, bluff, sizing and call tuning as Elite; only depth differs', () => {
    const elite = MULTIWAY_DIFFICULTY_TUNING.elite;
    const nemesis = MULTIWAY_DIFFICULTY_TUNING.nemesis;
    expect(nemesis.aggressionScale).toBe(elite.aggressionScale);
    expect(nemesis.bluffScale).toBe(elite.bluffScale);
    expect(nemesis.sizingScale).toBe(elite.sizingScale);
    expect(nemesis.callTolerance).toBe(elite.callTolerance);
    expect(nemesis.equitySamples).toBeGreaterThan(elite.equitySamples);
  });
```

- [ ] **Step 2: Run both tests to verify they fail**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/ai.test.ts src/domain/poker/__tests__/multiwayAi.test.ts -t "quality knobs|same aggression"`
Expected: both FAIL.

- [ ] **Step 3: Add the fields and align the tuning**

In `src/domain/poker/aiProfiles.ts`, extend the interface after `bluffPotFraction: number;`:

```ts
  /** Share of equity samples drawn from the modeled opponent range (0 = uniform random). */
  rangeBlend: number;
  /** 0 = ignore postflop actions, 1 = full authored response probabilities. */
  narrowingStrength: number;
  /** Weight of the bounded public-action adaptation and the memory range shifts. */
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

Add to each profile literal:

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

In `src/domain/poker/multiwayAiProfiles.ts`, set the `nemesis` tuning to:

```ts
  nemesis: {
    difficulty: 'nemesis',
    equitySamples: 560,
    aggressionScale: 1.22,
    bluffScale: 1.3,
    sizingScale: 1.15,
    callTolerance: -0.002,
    riskPremium: 0.019,
  },
```

In `src/domain/poker/ai.ts` delete the `adaptationStrength` record and use `profile.memoryStrength` in `decideAiAction`. In `src/domain/poker/multiwayAi.ts` delete the `adaptationStrength` record, import `aiStrategyProfile` from `'./aiProfiles.ts'`, and use `aiStrategyProfile(difficulty).memoryStrength`.

- [ ] **Step 4: Run both test files and typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/ai.test.ts src/domain/poker/__tests__/multiwayAi.test.ts && pnpm typecheck`
Expected: pass, clean.

- [ ] **Step 5: Commit**

```bash
git add src/domain/poker/aiProfiles.ts src/domain/poker/multiwayAiProfiles.ts src/domain/poker/ai.ts src/domain/poker/multiwayAi.ts src/domain/poker/__tests__/ai.test.ts src/domain/poker/__tests__/multiwayAi.test.ts
git commit -m "feat(ai): ladder fields on tier profiles; Nemesis tuning equals Elite

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 3: Remove the flat bluff incentives and measure

**Files:**
- Modify: `src/domain/poker/postflopStrategy.ts` (`selectPostflopAction`)
- Test: `src/domain/poker/__tests__/postflopStrategy.test.ts`
- Modify: `docs/AI_LADDER_QA.md`

**Interfaces:** none new. After this task, for Sharp, Elite, and Nemesis the selector has no positive raise bias, no flat bluff bonus, and no sizing-pressure term. Friendly keeps its negative bias, bluff penalty, size penalty, and call bonus. Every non-Friendly tier keeps Club's −0.04 bluff discount.

- [ ] **Step 1: Write the failing test**

Append inside `describe('shared postflop strategy', ...)` in `src/domain/poker/__tests__/postflopStrategy.test.ts`:

```ts
  it('gives Sharp, Elite and Nemesis no flat bluff or raise incentive over Club', () => {
    const plan = buildPostflopPlan(input({ equity: 0.18 }));
    const raises = (difficulty: 'club' | 'sharp' | 'elite' | 'nemesis') => Array.from({ length: 4_000 }, (_, i) => (
      selectPostflopAction(plan, (i + 0.5) / 4_000, difficulty).action.type === 'raise'
    )).filter(Boolean).length;
    const club = raises('club');
    for (const tier of ['sharp', 'elite', 'nemesis'] as const) {
      // Only the temperature differs now; the raise share must stay within a few percent of Club.
      expect(Math.abs(raises(tier) - club), tier).toBeLessThan(4_000 * 0.05);
    }
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/postflopStrategy.test.ts -t "no flat bluff"`
Expected: FAIL (Sharp and above raise far more than Club).

- [ ] **Step 3: Strip the incentives**

In `selectPostflopAction`, replace everything from `const difficultyRaiseBias = ...` through the end of the `if (candidate.action.type === 'raise') { ... }` body with:

```ts
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
      } else if (candidate.role === 'bluff') {
        // No tier receives a flat bluff bonus. Pricing by fold equity arrives with the range model.
        score -= 0.04;
      }
    }
```

Leave the fold-bias line, the Friendly call bonus, the weight computation, and the cursor loop unchanged.

- [ ] **Step 4: Run the strategy, heads-up, and multiway suites**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/postflopStrategy.test.ts src/domain/poker/__tests__/ai.test.ts src/domain/poker/__tests__/multiwayAi.test.ts src/domain/poker/__tests__/championshipSimulation.test.ts`
Expected: the new test passes. Pins that encoded the Sharp bonus may fail, for example "gives Sharp selective pressure that Friendly declines on a dry board" and the busted-draw bluff bracket. For each: print the new value, confirm the direction is sane (Sharp still bluffs at least as often as Friendly), re-pin, and add a line to `docs/AI_LADDER_QA.md` "Re-pinned tests" with old and new values and "flat incentive removed" as the reason. Dynamics bands must pass unchanged.

- [ ] **Step 5: Measure the stage**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && AI_BENCHMARK_OUTPUT=/tmp/ladder-stage1.json pnpm eval:ai:ladder`
Fill "Stage 1: flat incentives removed" in `docs/AI_LADDER_QA.md` with the tuning-corpus tables and one sentence answering: how much of the Stage 0 inversion did the incentives alone account for?

- [ ] **Step 6: Commit**

```bash
git add src/domain/poker/postflopStrategy.ts src/domain/poker/__tests__/postflopStrategy.test.ts src/domain/poker/__tests__/ai.test.ts src/domain/poker/__tests__/multiwayAi.test.ts docs/AI_LADDER_QA.md
git commit -m "feat(ai): remove flat per-tier bluff and raise incentives; record stage 1 ladder

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Stage 2: Ranges

### Task 4: Opponent range module, combos, blockers, memory shifts, preflop weights

**Files:**
- Create: `src/domain/poker/opponentRange.ts`
- Create: `src/domain/poker/__tests__/opponentRange.test.ts`

**Interfaces:**
- Consumes: `buildPreflopPlan`, `classifyPreflopHand`, `preflopGridCards`, `PreflopFacing` (`preflopStrategy.ts`); `HAND_CLASS_KEYS`, `PreflopArchetype` (`preflopRanges.ts`); `createDeck`, `cardKey` (`cards.ts`); `TablePosition` (`multiway.ts`); `AiDifficulty` (`aiProfiles.ts`); `OpponentMemory`, `describeOpponentRead` (`opponentMemory.ts`).
- Produces:
  ```ts
  export const COMBO_COUNT = 1326;
  export const COMBOS: ReadonlyArray<readonly [Card, Card]>;   // deck-index pairs i < j
  export interface ComboRange { weights: Float64Array; total: number }
  export interface PublicPreflopAction { type: 'raise' | 'call' | 'check'; facing: PreflopFacing; raiseCount: number; raiseSizeBb?: number; raiserPosition?: TablePosition; callersAfterRaise: number; limperCount: number; canCheck: boolean }
  export interface RangeModelSpot { position: TablePosition; playerCount: number; effectiveStackBb: number }
  export interface RangeModelProfile { archetype: PreflopArchetype; tier: AiDifficulty; rangeTightness?: number; bluffAllowance: number; narrowingStrength: number; memory?: OpponentMemory; memoryStrength: number }
  export interface MemoryShifts { wide: number; aggression: number; stickiness: number }   // wide in [0.6,1.6], others in [-0.5,0.5]
  export const RANGE_FLOOR = 0.02;
  export function memoryShifts(profile: RangeModelProfile): MemoryShifts;
  export function uniformRange(blocked: readonly Card[]): ComboRange;
  export function applyPreflopActions(range, actions, spot, profile): ComboRange;
  export function comboShare(range, predicate: (combo) => boolean): number;
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
  memoryShifts,
  uniformRange,
  type RangeModelProfile,
} from '../opponentRange';
import { applyOpponentObservation, createEmptyOpponentMemory } from '../opponentMemory';
import { classifyPreflopHand } from '../preflopStrategy';
import type { Card } from '../types';

export const club: RangeModelProfile = {
  archetype: 'balanced', tier: 'club', bluffAllowance: 1, narrowingStrength: 1, memoryStrength: 0,
};

export function isClass(keys: readonly string[]): (combo: readonly [Card, Card]) => boolean {
  const set = new Set(keys);
  return (combo) => set.has(classifyPreflopHand(combo).key);
}

const open = { type: 'raise' as const, facing: 'unopened' as const, raiseCount: 0, callersAfterRaise: 0, limperCount: 0, canCheck: false };
const spotCo = { position: 'CO' as const, playerCount: 6, effectiveStackBb: 100 };

describe('opponent range: combos and blockers', () => {
  it('enumerates 1,326 distinct unordered combos', () => {
    expect(COMBOS.length).toBe(COMBO_COUNT);
    expect(new Set(COMBOS.map(([a, b]) => `${a.rank}${a.suit}|${b.rank}${b.suit}`)).size).toBe(COMBO_COUNT);
  });

  it('gives blocked combos zero weight and everything else equal weight', () => {
    const range = uniformRange([{ rank: 14, suit: 'spades' }, { rank: 13, suit: 'spades' }]);
    COMBOS.forEach(([a, b], index) => {
      const blocked = [a, b].some((c) => c.suit === 'spades' && (c.rank === 14 || c.rank === 13));
      expect(range.weights[index]).toBe(blocked ? 0 : 1);
    });
    expect(range.total).toBeCloseTo(COMBO_COUNT - 101, 6);
  });
});

describe('opponent range: preflop weights from the authored tables', () => {
  it('weights a button opener by the RFI raise leg, so AA dominates 72o but junk is never zero', () => {
    const range = applyPreflopActions(uniformRange([]), [open], { ...spotCo, position: 'BTN' }, club);
    expect(comboShare(range, isClass(['AA']))).toBeGreaterThan(comboShare(range, isClass(['72o'])) * 20);
    expect(comboShare(range, isClass(['72o']))).toBeGreaterThan(0);
  });

  it('weights a big-blind caller by the defense call leg, not the raise leg', () => {
    const range = applyPreflopActions(uniformRange([]), [
      { type: 'call', facing: 'raised', raiseCount: 1, raiseSizeBb: 2.5, raiserPosition: 'BTN', callersAfterRaise: 0, limperCount: 0, canCheck: false },
    ], { position: 'BB', playerCount: 6, effectiveStackBb: 100 }, club);
    expect(comboShare(range, isClass(['AA']))).toBeLessThan(comboShare(range, isClass(['87s'])));
  });

  it('compounds repeated raises: an open then a 4-bet is far tighter than an open alone', () => {
    const opened = applyPreflopActions(uniformRange([]), [open], spotCo, club);
    const fourBet = applyPreflopActions(opened, [
      { type: 'raise', facing: 'raised', raiseCount: 2, raiseSizeBb: 9, raiserPosition: 'BTN', callersAfterRaise: 0, limperCount: 0, canCheck: false },
    ], spotCo, club);
    const premium = isClass(['AA', 'KK', 'QQ', 'AKs', 'AKo']);
    expect(comboShare(fourBet, premium)).toBeGreaterThan(comboShare(opened, premium) * 2);
  });

  it('leaves a big blind that only checked at uniform weights', () => {
    const range = applyPreflopActions(uniformRange([]), [{ ...open, type: 'check', canCheck: true }], { ...spotCo, position: 'BB' }, club);
    expect(comboShare(range, isClass(['AA']))).toBeCloseTo(6 / COMBO_COUNT, 6);
  });

  it('models a patient archetype tighter than a pressure archetype on the same open', () => {
    const patient = applyPreflopActions(uniformRange([]), [open], spotCo, { ...club, archetype: 'patient' });
    const pressure = applyPreflopActions(uniformRange([]), [open], spotCo, { ...club, archetype: 'pressure' });
    expect(comboShare(patient, isClass(['T8s']))).toBeLessThan(comboShare(pressure, isClass(['T8s'])));
  });
});

describe('opponent range: memory shifts', () => {
  function memoryOf(hands: number, actions: Parameters<typeof applyOpponentObservation>[1]['actions']) {
    let memory = createEmptyOpponentMemory();
    for (let hand = 0; hand < hands; hand += 1) memory = applyOpponentObservation(memory, { actions, position: 'late' }, '2026-01-01T00:00:00.000Z');
    return memory;
  }

  it('is neutral without memory or without strength', () => {
    expect(memoryShifts(club)).toEqual({ wide: 1, aggression: 0, stickiness: 0 });
    const memory = memoryOf(30, [{ facingBet: true, street: 'flop', type: 'call' }]);
    expect(memoryShifts({ ...club, memory, memoryStrength: 0 })).toEqual({ wide: 1, aggression: 0, stickiness: 0 });
  });

  it('reads a caller as sticky, a raiser as aggressive, and a loose enterer as wide, within bounds', () => {
    const sticky = memoryShifts({ ...club, memoryStrength: 1, memory: memoryOf(30, [{ facingBet: false, street: 'preflop', type: 'call' }, { facingBet: true, street: 'flop', type: 'call' }]) });
    expect(sticky.stickiness).toBeGreaterThan(0.2);
    expect(sticky.stickiness).toBeLessThanOrEqual(0.5);
    const aggressive = memoryShifts({ ...club, memoryStrength: 1, memory: memoryOf(30, [{ facingBet: false, street: 'preflop', type: 'raise' }, { facingBet: false, street: 'flop', type: 'raise' }]) });
    expect(aggressive.aggression).toBeGreaterThan(0.2);
    expect(aggressive.wide).toBeGreaterThan(1);
    expect(aggressive.wide).toBeLessThanOrEqual(1.6);
    const nit = memoryShifts({ ...club, memoryStrength: 1, memory: memoryOf(30, [{ facingBet: false, street: 'preflop', type: 'fold' }]) });
    expect(nit.wide).toBeLessThan(1);
    expect(nit.wide).toBeGreaterThanOrEqual(0.6);
  });

  it('an aggressive read moves call-leg mass into the raise leg without changing continue mass', () => {
    const neutral = applyPreflopActions(uniformRange([]), [
      { type: 'call', facing: 'raised', raiseCount: 1, raiseSizeBb: 2.5, raiserPosition: 'BTN', callersAfterRaise: 0, limperCount: 0, canCheck: false },
    ], { position: 'BB', playerCount: 6, effectiveStackBb: 100 }, club);
    const aggressiveProfile = { ...club, memoryStrength: 1, memory: memoryOf(30, [{ facingBet: false, street: 'preflop', type: 'raise' }, { facingBet: false, street: 'flop', type: 'raise' }]) };
    const aggressive = applyPreflopActions(uniformRange([]), [
      { type: 'call', facing: 'raised', raiseCount: 1, raiseSizeBb: 2.5, raiserPosition: 'BTN', callersAfterRaise: 0, limperCount: 0, canCheck: false },
    ], { position: 'BB', playerCount: 6, effectiveStackBb: 100 }, aggressiveProfile);
    // A frequent 3-bettor who merely calls is less likely to hold a hand it would have 3-bet.
    expect(comboShare(aggressive, isClass(['QQ', 'AKs']))).toBeLessThan(comboShare(neutral, isClass(['QQ', 'AKs'])));
    // Total continue mass is preserved, so the shift is not a uniform scale that normalization erases.
    expect(aggressive.total).toBeCloseTo(neutral.total, 3);
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
import { cardKey, createDeck, type RandomSource } from './cards.ts';
import type { TablePosition } from './multiway.ts';
import { describeOpponentRead, type OpponentMemory } from './opponentMemory.ts';
import { HAND_CLASS_KEYS, type PreflopArchetype } from './preflopRanges.ts';
import { buildPreflopPlan, classifyPreflopHand, preflopGridCards, type PreflopFacing } from './preflopStrategy.ts';
import type { Card, Rank } from './types.ts';

export const COMBO_COUNT = 1_326;
export const RANGE_FLOOR = 0.02;

const DECK: readonly Card[] = createDeck();

/** Every unordered two-card combination, indexed by deck position pairs (i < j). */
export const COMBOS: ReadonlyArray<readonly [Card, Card]> = (() => {
  const combos: Array<readonly [Card, Card]> = [];
  for (let first = 0; first < DECK.length; first += 1) {
    for (let second = first + 1; second < DECK.length; second += 1) combos.push([DECK[first]!, DECK[second]!]);
  }
  return combos;
})();

const COMBO_INDICES_BY_CLASS: ReadonlyMap<string, readonly number[]> = (() => {
  const map = new Map<string, number[]>();
  COMBOS.forEach((combo, index) => {
    const key = classifyPreflopHand(combo).key;
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

export interface ComboRange { weights: Float64Array; total: number }

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

export interface RangeModelSpot { position: TablePosition; playerCount: number; effectiveStackBb: number }

export interface RangeModelProfile {
  archetype: PreflopArchetype;
  tier: AiDifficulty;
  rangeTightness?: number;
  /** Scales the never-zero floor; a bluff-heavy identity keeps more junk alive. */
  bluffAllowance: number;
  /** 0 = ignore postflop actions, 1 = full authored response probabilities. */
  narrowingStrength: number;
  memory?: OpponentMemory;
  memoryStrength: number;
}

export interface MemoryShifts {
  /** Multiplies edge-hand entry; 1 = neutral. */
  wide: number;
  /** Positive moves continue mass toward raising; negative toward calling. */
  aggression: number;
  /** Positive moves fold mass toward calling for marginal hands; negative the reverse. */
  stickiness: number;
}

const NEUTRAL_SHIFTS: MemoryShifts = { wide: 1, aggression: 0, stickiness: 0 };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothedRate(successes: number, opportunities: number, prior: number, priorWeight: number): number {
  return (successes + prior * priorWeight) / Math.max(1, opportunities + priorWeight);
}

/**
 * Bounded shifts from the public memory read. These change which hands act, not
 * how much every hand acts: a uniform multiplier would vanish on normalization.
 */
export function memoryShifts(profile: RangeModelProfile): MemoryShifts {
  const memory = profile.memory;
  if (!memory || profile.memoryStrength <= 0) return NEUTRAL_SHIFTS;
  const read = describeOpponentRead(memory);
  const strength = clamp(profile.memoryStrength, 0, 1.3) * read.confidence;
  if (strength === 0) return NEUTRAL_SHIFTS;
  const callRate = smoothedRate(memory.callsFacingBet, memory.facedBetOpportunities, 0.42, 8);
  const shift = (rate: number, baseline: number) => clamp(((rate - baseline) / 0.25) * 0.5 * strength, -0.5, 0.5);
  return {
    wide: clamp(1 + shift(read.voluntaryPreflopRate, 0.42), 0.6, 1.6),
    aggression: clamp((shift(read.preflopRaiseRate, 0.22) + shift(read.postflopAggressionRate, 0.34)) / 2, -0.5, 0.5),
    stickiness: shift(callRate, 0.42),
  };
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

export function comboShare(range: ComboRange, predicate: (combo: readonly [Card, Card]) => boolean): number {
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
 * uses for its own decisions. Memory moves mass between the raise and call legs
 * (aggression) and scales edge-hand entry (wide); continue mass per class is preserved.
 */
export function applyPreflopActions(
  range: ComboRange,
  actions: readonly PublicPreflopAction[],
  spot: RangeModelSpot,
  profile: RangeModelProfile,
): ComboRange {
  const weights = new Float64Array(range.weights);
  const floor = RANGE_FLOOR * clamp(profile.bluffAllowance, 0.25, 2);
  const shifts = memoryShifts(profile);
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
      let raise = plan.frequencies.raise;
      let call = plan.frequencies.call;
      const check = plan.frequencies.check;
      if (shifts.aggression > 0) {
        const moved = call * shifts.aggression;
        raise += moved;
        call -= moved;
      } else if (shifts.aggression < 0) {
        const moved = raise * -shifts.aggression;
        raise -= moved;
        call += moved;
      }
      const continueMass = clamp(raise + call + check, 0, 1);
      const leg = action.type === 'raise' ? raise : action.type === 'call' ? call : check;
      // Edge hands (low continue mass) are what a loose or tight player changes;
      // premiums (continue mass near 1) are entered by everyone.
      const scaled = clamp(leg * Math.pow(shifts.wide, 1 - continueMass), 0, 1);
      const multiplier = Math.max(scaled, floor);
      for (const index of COMBO_INDICES_BY_CLASS.get(key) ?? []) weights[index] = weights[index]! * multiplier;
    }
  }
  return finalize(weights);
}
```

- [ ] **Step 4: Run the tests**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/opponentRange.test.ts`
Expected: all pass. The "continue mass preserved" assertion holds because the aggression shift moves mass between raise and call legs and the observed action is a call, so `neutral.total` and `aggressive.total` differ only through the wide term; if `aggressive.wide` exceeds 1 by more than the tolerance, compare with `wide` forced to 1 by building the aggressive profile from a memory whose voluntary-entry rate equals the baseline (raise every hand from the blind position bucket) or relax to `toBeCloseTo(neutral.total, 0)`.

- [ ] **Step 5: Commit**

```bash
git add src/domain/poker/opponentRange.ts src/domain/poker/__tests__/opponentRange.test.ts
git commit -m "feat(ai): opponent combo range from the authored preflop tables with memory mass shifts

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 5: Board-relative classification, memory-shifted response table, narrowing, fold share, continuing range

**Files:**
- Modify: `src/domain/poker/postflopStrategy.ts:87` (export `drawLabelOnBoard`)
- Modify: `src/domain/poker/opponentRange.ts`
- Test: `src/domain/poker/__tests__/opponentRange.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ComboClass = 'premium' | 'strong' | 'topPair' | 'weakPair' | 'pairPlusDraw' | 'draw' | 'weakDraw' | 'boardPlays' | 'air';
  export type SizeBucket = 'small' | 'large' | 'overbet';
  export interface FacingBetRow { fold: number; call: number; raise: number }
  export interface CheckedToRow { betSmall: number; betLarge: number; check: number }
  export interface ResponseTable { facing: Record<ComboClass, Record<SizeBucket, FacingBetRow>>; checkedTo: Record<ComboClass, CheckedToRow> }
  export interface PublicPostflopAction { board: readonly Card[]; type: 'raise' | 'call' | 'check'; sizeBucket: SizeBucket; facingBet: boolean }
  export function sizeBucketFor(betFraction: number): SizeBucket;      // ≤0.5 small, ≤1 large, else overbet
  export function classifyCombo(combo, board): ComboClass;
  export class BoardClassifier { classifyAll(board): readonly ComboClass[] }
  export function createBoardClassifier(): BoardClassifier;
  export function responseTable(profile: RangeModelProfile): ResponseTable;
  export function applyPostflopActions(range, actions, profile, classifier): ComboRange;
  export function foldShare(range, board, bucket, table, classifier): number;
  export function continuingRange(range, board, bucket, table, classifier): ComboRange;
  export function strongShare(range, board, classifier): number;
  ```

- [ ] **Step 1: Export the draw detector**

In `src/domain/poker/postflopStrategy.ts` change line 87 `function drawLabelOnBoard(` to `export function drawLabelOnBoard(`.

- [ ] **Step 2: Write the failing tests**

Append to `src/domain/poker/__tests__/opponentRange.test.ts` (extend the import from `'../opponentRange'` with `applyPostflopActions, classifyCombo, continuingRange, createBoardClassifier, foldShare, responseTable, sizeBucketFor, strongShare`):

```ts
describe('opponent range: board-relative classification', () => {
  const c = (rank: Card['rank'], suit: Card['suit']): Card => ({ rank, suit });
  const dry: Card[] = [c(13, 'hearts'), c(8, 'clubs'), c(3, 'diamonds')];

  it('buckets bet sizes at half pot and one pot', () => {
    expect(sizeBucketFor(0.33)).toBe('small');
    expect(sizeBucketFor(0.5)).toBe('small');
    expect(sizeBucketFor(0.75)).toBe('large');
    expect(sizeBucketFor(1)).toBe('large');
    expect(sizeBucketFor(1.25)).toBe('overbet');
  });

  it('separates top pair, weak pair, overpair, two pair with a hole card, and air', () => {
    expect(classifyCombo([c(13, 'spades'), c(7, 'spades')], dry)).toBe('topPair');
    expect(classifyCombo([c(8, 'spades'), c(7, 'spades')], dry)).toBe('weakPair');
    expect(classifyCombo([c(6, 'spades'), c(6, 'hearts')], dry)).toBe('weakPair');
    expect(classifyCombo([c(14, 'spades'), c(14, 'hearts')], dry)).toBe('strong');
    expect(classifyCombo([c(13, 'spades'), c(8, 'spades')], dry)).toBe('strong');
    expect(classifyCombo([c(10, 'spades'), c(4, 'hearts')], dry)).toBe('air');
  });

  it('labels a hand that only adds a kicker on a paired board as playing the board', () => {
    const paired: Card[] = [c(9, 'hearts'), c(9, 'clubs'), c(4, 'diamonds'), c(2, 'spades')];
    expect(classifyCombo([c(14, 'spades'), c(7, 'hearts')], paired)).toBe('boardPlays');
    expect(classifyCombo([c(9, 'spades'), c(7, 'hearts')], paired)).toBe('strong');
    const doublePaired: Card[] = [c(9, 'hearts'), c(9, 'clubs'), c(4, 'diamonds'), c(4, 'spades'), c(2, 'hearts')];
    expect(classifyCombo([c(14, 'spades'), c(7, 'hearts')], doublePaired)).toBe('boardPlays');
    expect(classifyCombo([c(9, 'spades'), c(7, 'hearts')], doublePaired)).toBe('premium');
  });

  it('separates draws, weak draws, and pair plus draw', () => {
    const twoTone: Card[] = [c(13, 'hearts'), c(8, 'hearts'), c(3, 'diamonds')];
    expect(classifyCombo([c(14, 'hearts'), c(5, 'hearts')], twoTone)).toBe('draw');
    expect(classifyCombo([c(13, 'clubs'), c(7, 'hearts')], twoTone)).toBe('topPair');
    expect(classifyCombo([c(8, 'spades'), c(7, 'hearts')], [c(13, 'hearts'), c(9, 'hearts'), c(3, 'diamonds')])).toBe('weakDraw');
    expect(classifyCombo([c(13, 'clubs'), c(4, 'hearts')], [c(13, 'hearts'), c(8, 'hearts'), c(3, 'hearts')])).toBe('pairPlusDraw');
  });
});

describe('opponent range: response table and narrowing', () => {
  const board: Card[] = [{ rank: 13, suit: 'hearts' }, { rank: 8, suit: 'clubs' }, { rank: 3, suit: 'diamonds' }];
  const classifier = createBoardClassifier();
  const table = responseTable(club);

  it('authors rows that sum to one', () => {
    for (const rows of Object.values(table.facing)) {
      for (const row of Object.values(rows)) expect(row.fold + row.call + row.raise).toBeCloseTo(1, 6);
    }
    for (const row of Object.values(table.checkedTo)) expect(row.betSmall + row.betLarge + row.check).toBeCloseTo(1, 6);
  });

  it('a large bet raises the strong share; a check lowers it', () => {
    const prior = uniformRange([]);
    const bet = applyPostflopActions(prior, [{ board, type: 'raise', sizeBucket: 'large', facingBet: false }], club, classifier);
    const check = applyPostflopActions(prior, [{ board, type: 'check', sizeBucket: 'small', facingBet: false }], club, classifier);
    expect(strongShare(bet, board, classifier)).toBeGreaterThan(strongShare(prior, board, classifier));
    expect(strongShare(check, board, classifier)).toBeLessThan(strongShare(prior, board, classifier));
  });

  it('narrowing strength 0 leaves the range untouched and every combo stays above zero at full strength', () => {
    const prior = uniformRange([]);
    const untouched = applyPostflopActions(prior, [{ board, type: 'raise', sizeBucket: 'large', facingBet: false }], { ...club, narrowingStrength: 0 }, classifier);
    expect(Array.from(untouched.weights)).toEqual(Array.from(prior.weights));
    let range = prior;
    for (let street = 0; street < 3; street += 1) range = applyPostflopActions(range, [{ board, type: 'raise', sizeBucket: 'overbet', facingBet: true }], club, classifier);
    expect(Math.min(...Array.from(range.weights))).toBeGreaterThan(0);
  });

  it('fold share falls as the range strengthens and rises with bet size', () => {
    const prior = uniformRange([]);
    const strong = applyPostflopActions(prior, [{ board, type: 'raise', sizeBucket: 'large', facingBet: false }], club, classifier);
    expect(foldShare(strong, board, 'large', table, classifier)).toBeLessThan(foldShare(prior, board, 'large', table, classifier));
    expect(foldShare(prior, board, 'small', table, classifier)).toBeLessThan(foldShare(prior, board, 'large', table, classifier));
    expect(foldShare(prior, board, 'large', table, classifier)).toBeLessThan(foldShare(prior, board, 'overbet', table, classifier));
  });

  it('the continuing range is stronger than the whole range and smaller', () => {
    const prior = uniformRange([]);
    const continuing = continuingRange(prior, board, 'large', table, classifier);
    expect(continuing.total).toBeLessThan(prior.total);
    expect(strongShare(continuing, board, classifier)).toBeGreaterThan(strongShare(prior, board, classifier));
  });

  it('a sticky read lowers predicted folds for marginal hands and narrows a call less, from one table', () => {
    let memory = createEmptyOpponentMemory();
    for (let hand = 0; hand < 30; hand += 1) {
      memory = applyOpponentObservation(memory, { actions: [{ facingBet: false, street: 'preflop', type: 'call' }, { facingBet: true, street: 'flop', type: 'call' }], position: 'late' }, '2026-01-01T00:00:00.000Z');
    }
    const stickyProfile = { ...club, memoryStrength: 1, memory };
    const stickyTable = responseTable(stickyProfile);
    expect(stickyTable.facing.topPair.large.fold).toBeLessThan(table.facing.topPair.large.fold);
    expect(stickyTable.facing.premium.large.fold).toBeCloseTo(table.facing.premium.large.fold, 6);
    expect(stickyTable.facing.air.large.fold).toBeCloseTo(table.facing.air.large.fold, 6);
    const prior = uniformRange([]);
    expect(foldShare(prior, board, 'large', stickyTable, classifier)).toBeLessThan(foldShare(prior, board, 'large', table, classifier));
    const neutralCall = applyPostflopActions(prior, [{ board, type: 'call', sizeBucket: 'large', facingBet: true }], club, classifier);
    const stickyCall = applyPostflopActions(prior, [{ board, type: 'call', sizeBucket: 'large', facingBet: true }], stickyProfile, classifier);
    // A caller known to be sticky is read as weaker after the same call.
    expect(strongShare(stickyCall, board, classifier)).toBeLessThan(strongShare(neutralCall, board, classifier));
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/opponentRange.test.ts -t "classification|response table"`
Expected: FAIL, exports missing.

- [ ] **Step 4: Add the postflop half**

Append to `src/domain/poker/opponentRange.ts` (add `import { compareHandValues, evaluateBest, type HandValue } from './evaluator.ts';` and `import { drawLabelOnBoard } from './postflopStrategy.ts';`):

```ts
export type ComboClass =
  | 'premium' | 'strong' | 'topPair' | 'weakPair' | 'pairPlusDraw'
  | 'draw' | 'weakDraw' | 'boardPlays' | 'air';
export type SizeBucket = 'small' | 'large' | 'overbet';

export interface FacingBetRow { fold: number; call: number; raise: number }
export interface CheckedToRow { betSmall: number; betLarge: number; check: number }
export interface ResponseTable {
  facing: Record<ComboClass, Record<SizeBucket, FacingBetRow>>;
  checkedTo: Record<ComboClass, CheckedToRow>;
}

export interface PublicPostflopAction {
  board: readonly Card[];
  type: 'raise' | 'call' | 'check';
  sizeBucket: SizeBucket;
  /** True when the action answered a live bet (call, or raise over a bet). */
  facingBet: boolean;
}

export function sizeBucketFor(betFraction: number): SizeBucket {
  if (betFraction <= 0.5) return 'small';
  if (betFraction <= 1) return 'large';
  return 'overbet';
}

const row = (fold: number, call: number, raise: number): FacingBetRow => ({ fold, call, raise });

/** Authored response probabilities. Rows sum to 1. Initial values; a tuning knob. */
export const BASE_RESPONSE_TABLE: ResponseTable = {
  facing: {
    premium: { small: row(0.02, 0.58, 0.40), large: row(0.03, 0.67, 0.30), overbet: row(0.04, 0.66, 0.30) },
    strong: { small: row(0.06, 0.72, 0.22), large: row(0.12, 0.73, 0.15), overbet: row(0.18, 0.70, 0.12) },
    topPair: { small: row(0.18, 0.70, 0.12), large: row(0.32, 0.60, 0.08), overbet: row(0.48, 0.48, 0.04) },
    weakPair: { small: row(0.42, 0.54, 0.04), large: row(0.64, 0.34, 0.02), overbet: row(0.80, 0.19, 0.01) },
    pairPlusDraw: { small: row(0.08, 0.62, 0.30), large: row(0.15, 0.62, 0.23), overbet: row(0.25, 0.60, 0.15) },
    draw: { small: row(0.20, 0.62, 0.18), large: row(0.35, 0.52, 0.13), overbet: row(0.50, 0.42, 0.08) },
    weakDraw: { small: row(0.55, 0.40, 0.05), large: row(0.75, 0.22, 0.03), overbet: row(0.88, 0.11, 0.01) },
    boardPlays: { small: row(0.50, 0.47, 0.03), large: row(0.70, 0.28, 0.02), overbet: row(0.85, 0.14, 0.01) },
    air: { small: row(0.88, 0.08, 0.04), large: row(0.94, 0.04, 0.02), overbet: row(0.97, 0.02, 0.01) },
  },
  checkedTo: {
    premium: { betSmall: 0.45, betLarge: 0.35, check: 0.20 },
    strong: { betSmall: 0.40, betLarge: 0.25, check: 0.35 },
    topPair: { betSmall: 0.38, betLarge: 0.12, check: 0.50 },
    weakPair: { betSmall: 0.22, betLarge: 0.03, check: 0.75 },
    pairPlusDraw: { betSmall: 0.38, betLarge: 0.22, check: 0.40 },
    draw: { betSmall: 0.30, betLarge: 0.20, check: 0.50 },
    weakDraw: { betSmall: 0.22, betLarge: 0.08, check: 0.70 },
    boardPlays: { betSmall: 0.12, betLarge: 0.03, check: 0.85 },
    air: { betSmall: 0.10, betLarge: 0.05, check: 0.85 },
  },
};

const MARGINAL_CLASSES: readonly ComboClass[] = ['topPair', 'weakPair', 'pairPlusDraw', 'draw', 'weakDraw', 'boardPlays'];
const AGGRESSION_CLASSES: readonly ComboClass[] = ['strong', ...MARGINAL_CLASSES];
const ALL_CLASSES: readonly ComboClass[] = ['premium', 'strong', 'topPair', 'weakPair', 'pairPlusDraw', 'draw', 'weakDraw', 'boardPlays', 'air'];
const BUCKETS: readonly SizeBucket[] = ['small', 'large', 'overbet'];

const CLASS_STRENGTH: Record<ComboClass, number> = {
  premium: 0.9, strong: 0.7, topPair: 0.5, pairPlusDraw: 0.45, weakPair: 0.3, draw: 0.35, weakDraw: 0.2, boardPlays: 0.15, air: 0.05,
};

/**
 * The authored rows with the memory shifts applied. Stickiness moves fold mass into
 * call mass for marginal classes; aggression moves call mass into raise mass and check
 * mass into small bets for strong and marginal classes. One table feeds both narrowing
 * and fold prediction so they can never disagree.
 */
export function responseTable(profile: RangeModelProfile): ResponseTable {
  const shifts = memoryShifts(profile);
  if (shifts.stickiness === 0 && shifts.aggression === 0) return BASE_RESPONSE_TABLE;
  const facing = {} as ResponseTable['facing'];
  const checkedTo = {} as ResponseTable['checkedTo'];
  for (const cls of ALL_CLASSES) {
    facing[cls] = {} as Record<SizeBucket, FacingBetRow>;
    for (const bucket of BUCKETS) {
      let { fold, call, raise } = BASE_RESPONSE_TABLE.facing[cls][bucket];
      if (MARGINAL_CLASSES.includes(cls)) {
        if (shifts.stickiness > 0) { const moved = fold * shifts.stickiness; fold -= moved; call += moved; }
        else if (shifts.stickiness < 0) { const moved = call * -shifts.stickiness; call -= moved; fold += moved; }
      }
      if (AGGRESSION_CLASSES.includes(cls)) {
        if (shifts.aggression > 0) { const moved = call * shifts.aggression * 0.5; call -= moved; raise += moved; }
        else if (shifts.aggression < 0) { const moved = raise * -shifts.aggression * 0.5; raise -= moved; call += moved; }
      }
      facing[cls][bucket] = { fold, call, raise };
    }
    let { betSmall, betLarge, check } = BASE_RESPONSE_TABLE.checkedTo[cls];
    if (AGGRESSION_CLASSES.includes(cls)) {
      if (shifts.aggression > 0) { const moved = check * shifts.aggression * 0.4; check -= moved; betSmall += moved; }
      else if (shifts.aggression < 0) { const moved = betSmall * -shifts.aggression * 0.4; betSmall -= moved; check += moved; }
    }
    checkedTo[cls] = { betSmall, betLarge, check };
  }
  return { facing, checkedTo };
}

function boardMadeValue(board: readonly Card[]): HandValue {
  if (board.length >= 5) return evaluateBest(board);
  const counts = new Map<number, number>();
  for (const card of board) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  const groups = [...counts.entries()].sort(([rankA, countA], [rankB, countB]) => countB - countA || rankB - rankA);
  const ranks = board.map((card) => card.rank).sort((a, b) => b - a);
  if (groups[0]?.[1] === 3) return { category: 3, kickers: [groups[0][0]], name: 'Three of a kind' };
  if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2) {
    return { category: 2, kickers: [groups[0][0], groups[1][0]].sort((a, b) => b - a), name: 'Two pair' };
  }
  if (groups[0]?.[1] === 2) return { category: 1, kickers: [groups[0][0]], name: 'One pair' };
  return { category: 0, kickers: ranks, name: 'High card' };
}

export function classifyCombo(combo: readonly [Card, Card], board: readonly Card[]): ComboClass {
  const value = evaluateBest([combo[0], combo[1], ...board]);
  const boardValue = boardMadeValue(board);
  // The board already makes a hand and the combo does not raise its category: a kicker on a
  // paired board, or any hand on a board that is itself two pair, a straight, or a flush.
  if (boardValue.category >= 1 && value.category <= boardValue.category) return 'boardPlays';
  const drawLabel = board.length < 5 ? drawLabelOnBoard(combo, board) : null;
  const strongDraw = drawLabel !== null && (drawLabel.includes('flush') || drawLabel.includes('open-ended'));
  if (value.category >= 4) return 'premium';
  if (value.category === 2 || value.category === 3) return 'strong';
  if (value.category === 1) {
    const pairRank = value.kickers[0] ?? 0;
    const boardHigh = Math.max(...board.map((card) => card.rank));
    const pocketPair = combo[0].rank === combo[1].rank;
    if (pocketPair && pairRank > boardHigh) return 'strong';
    if (strongDraw) return 'pairPlusDraw';
    return pairRank === boardHigh ? 'topPair' : 'weakPair';
  }
  if (strongDraw) return 'draw';
  if (drawLabel) return 'weakDraw';
  return 'air';
}

function boardKey(board: readonly Card[]): string {
  return board.map(cardKey).join('|');
}

/** Caches classification per board so every range in one decision pays the evaluator once. */
export class BoardClassifier {
  private readonly cache = new Map<string, ComboClass[]>();

  classifyAll(board: readonly Card[]): readonly ComboClass[] {
    const key = boardKey(board);
    const cached = this.cache.get(key);
    if (cached) return cached;
    const boardKeys = new Set(board.map(cardKey));
    const classes = COMBOS.map((combo) => (
      boardKeys.has(cardKey(combo[0])) || boardKeys.has(cardKey(combo[1])) ? 'air' : classifyCombo(combo, board)
    ));
    this.cache.set(key, classes);
    return classes;
  }
}

export function createBoardClassifier(): BoardClassifier {
  return new BoardClassifier();
}

function responseProbability(table: ResponseTable, cls: ComboClass, action: PublicPostflopAction): number {
  if (action.facingBet) {
    const facing = table.facing[cls][action.sizeBucket];
    return action.type === 'call' ? facing.call : action.type === 'raise' ? facing.raise : facing.fold;
  }
  const checked = table.checkedTo[cls];
  if (action.type === 'raise') return action.sizeBucket === 'small' ? checked.betSmall : checked.betLarge;
  return checked.check;
}

export function applyPostflopActions(
  range: ComboRange,
  actions: readonly PublicPostflopAction[],
  profile: RangeModelProfile,
  classifier: BoardClassifier,
): ComboRange {
  const strength = clamp(profile.narrowingStrength, 0, 1);
  if (strength === 0 || actions.length === 0) return range;
  const table = responseTable(profile);
  const weights = new Float64Array(range.weights);
  const floor = RANGE_FLOOR * clamp(profile.bluffAllowance, 0.25, 2);
  for (const action of actions) {
    if (action.board.length < 3) continue;
    const classes = classifier.classifyAll(action.board);
    for (let index = 0; index < COMBO_COUNT; index += 1) {
      if (weights[index] === 0) continue;
      const probability = responseProbability(table, classes[index]!, action);
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
  bucket: SizeBucket,
  table: ResponseTable,
  classifier: BoardClassifier,
): number {
  if (range.total <= 0 || board.length < 3) return 0;
  const classes = classifier.classifyAll(board);
  let folded = 0;
  for (let index = 0; index < COMBO_COUNT; index += 1) {
    const weight = range.weights[index]!;
    if (weight > 0) folded += weight * table.facing[classes[index]!][bucket].fold;
  }
  return folded / range.total;
}

/** The part of the range that calls or raises a bet of this size; equity against it is equity when called. */
export function continuingRange(
  range: ComboRange,
  board: readonly Card[],
  bucket: SizeBucket,
  table: ResponseTable,
  classifier: BoardClassifier,
): ComboRange {
  const weights = new Float64Array(range.weights);
  if (board.length >= 3) {
    const classes = classifier.classifyAll(board);
    for (let index = 0; index < COMBO_COUNT; index += 1) {
      if (weights[index] === 0) continue;
      const facing = table.facing[classes[index]!][bucket];
      weights[index] = weights[index]! * (facing.call + facing.raise);
    }
  }
  return finalize(weights);
}

/** Share of premium and strong combos; the capped-range signal. */
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

export function rangeStrength(range: ComboRange, board: readonly Card[], classifier: BoardClassifier): number {
  if (range.total <= 0 || board.length < 3) return 0.2;
  const classes = classifier.classifyAll(board);
  let strength = 0;
  for (let index = 0; index < COMBO_COUNT; index += 1) strength += range.weights[index]! * CLASS_STRENGTH[classes[index]!];
  return strength / range.total;
}
```

- [ ] **Step 5: Run the range and strategy tests**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/opponentRange.test.ts src/domain/poker/__tests__/postflopStrategy.test.ts`
Expected: all pass. In the "kicker on a paired board" case, `A7` on `99-4-2` evaluates to one pair of nines (category 1, same as the board) so it reads `boardPlays`; `97` makes trips (category 3) and reads `strong`; on `99-44-2` the board is two pair (category 2), `A7` stays at two pair and reads `boardPlays`, `97` makes a full house (category 6) and reads `premium`.

- [ ] **Step 6: Commit**

```bash
git add src/domain/poker/opponentRange.ts src/domain/poker/postflopStrategy.ts src/domain/poker/__tests__/opponentRange.test.ts
git commit -m "feat(ai): board-relative classification, memory-shifted response table, narrowing and fold share

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 6: Sampling from a range and equity against it

**Files:**
- Modify: `src/domain/poker/opponentRange.ts` (sampler)
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
    const weights = new Float64Array(uniformRange([]).weights);
    COMBOS.forEach((combo, index) => {
      if (classifyPreflopHand(combo).key === 'AA') weights[index] = 10;
    });
    const heavy = { weights, total: Array.from(weights).reduce((sum, value) => sum + value, 0) };
    const sampler = createRangeSampler(heavy);
    const random = seededRandom(5);
    const excluded = new Set(['14-spades']);
    let aces = 0;
    for (let draw = 0; draw < 4_000; draw += 1) {
      const combo = sampler.sample(excluded, random);
      expect(combo.some((card) => card.rank === 14 && card.suit === 'spades')).toBe(false);
      if (classifyPreflopHand(combo).key === 'AA') aces += 1;
    }
    // 3 unblocked AA combos x 10 / (30 + 1275) ≈ 2.3 percent; uniform would be 0.23 percent.
    expect(aces / 4_000).toBeGreaterThan(0.015);
    expect(aces / 4_000).toBeLessThan(0.035);
  });
});
```

Append to `src/domain/poker/__tests__/equity.test.ts` (imports: `estimateEquityAgainstRange` from `'../equity'`; `applyPreflopActions, uniformRange` from `'../opponentRange'`; `seededRandom` from `'../cards'`):

```ts
describe('equity against a modeled range', () => {
  const hero = [{ rank: 10 as const, suit: 'hearts' as const }, { rank: 10 as const, suit: 'clubs' as const }];

  it('equals uniform equity when the blend is zero', () => {
    const range = uniformRange(hero);
    expect(estimateEquityAgainstRange(hero, [], range, 0, 400, seededRandom(3)))
      .toBeCloseTo(estimateHeadsUpEquity(hero, [], 400, seededRandom(3)), 6);
  });

  it('rates pocket tens lower against a 4-bet range than against a random hand', () => {
    const fourBettor = applyPreflopActions(uniformRange(hero), [
      { type: 'raise', facing: 'unopened', raiseCount: 0, callersAfterRaise: 0, limperCount: 0, canCheck: false },
      { type: 'raise', facing: 'raised', raiseCount: 2, raiseSizeBb: 9, raiserPosition: 'BB', callersAfterRaise: 0, limperCount: 0, canCheck: false },
    ], { position: 'BTN/SB', playerCount: 2, effectiveStackBb: 100 }, {
      archetype: 'balanced', tier: 'club', bluffAllowance: 1, narrowingStrength: 1, memoryStrength: 0,
    });
    const versusRange = estimateEquityAgainstRange(hero, [], fourBettor, 1, 1_200, seededRandom(9));
    const versusRandom = estimateHeadsUpEquity(hero, [], 1_200, seededRandom(9));
    expect(versusRange).toBeLessThan(versusRandom - 0.1);
  });
});
```

Append to the multiway decisions describe in `src/domain/poker/__tests__/multiwayAi.test.ts` (imports: `estimateMultiwayEquity, GENERIC_HUMAN_RANGE_ID` from `'../multiwayEquity'`; `applyPostflopActions, createBoardClassifier, uniformRange` from `'../opponentRange'`):

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
    const modeled = estimateMultiwayEquity(view, 'ai-1', { simulations: 600, random: seededRandom(41), ranges: { hero: strongHero }, rangeBlend: 1 });
    expect(modeled).toBeLessThan(base);
    expect(GENERIC_HUMAN_RANGE_ID).toBe('generic-human-range');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/opponentRange.test.ts src/domain/poker/__tests__/equity.test.ts src/domain/poker/__tests__/multiwayAi.test.ts -t "sampling|modeled range|supplied opponent range"`
Expected: FAIL on missing exports.

- [ ] **Step 3: Add the sampler**

Append to `src/domain/poker/opponentRange.ts`:

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
  const live = (index: number, excluded: ReadonlySet<string>): boolean => {
    const combo = COMBOS[index]!;
    return range.weights[index]! > 0 && !excluded.has(cardKey(combo[0])) && !excluded.has(cardKey(combo[1]));
  };
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
        const index = draw(random);
        if (live(index, excluded)) return COMBOS[index]!;
      }
      const start = draw(random);
      for (let offset = 0; offset < COMBO_COUNT; offset += 1) {
        const index = (start + offset) % COMBO_COUNT;
        if (live(index, excluded)) return COMBOS[index]!;
      }
      throw new Error('No live combo remains after excluding known cards.');
    },
  };
}
```

- [ ] **Step 4: Add `estimateEquityAgainstRange`**

Append to `src/domain/poker/equity.ts` (imports: `cardKey` from `'./cards'`; `createRangeSampler, type ComboRange` from `'./opponentRange'`):

```ts
/**
 * Equity where the single opponent's hand is drawn from a modeled public-action range
 * with probability `rangeBlend`, uniformly otherwise. Blend 0 reproduces
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
  if (blend === 0 || range.total <= 0) return estimateHeadsUpEquity(heroCards, board, simulations, random);
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
    const finalBoard = [...board, ...shuffle(pool, random).slice(0, runoutCount)];
    const comparison = compareHandValues(evaluateBest([...opponentCards, ...finalBoard]), evaluateBest([...heroCards, ...finalBoard]));
    if (comparison < 0) score += 1;
    else if (comparison === 0) score += 0.5;
  }
  return score / runs;
}
```

- [ ] **Step 5: Extend `estimateMultiwayEquity`**

In `src/domain/poker/multiwayEquity.ts`: export `GENERIC_HUMAN_RANGE_ID = 'generic-human-range'` and use it as the `id` of `GENERIC_HUMAN_RANGE`; add `ranges?: Partial<Record<string, ComboRange>>` and `rangeBlend?: number` to `MultiwayEquityOptions`; import `createRangeSampler, type ComboRange, type RangeSampler` from `'./opponentRange.ts'`.

Before the simulation loop:

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

Inside the per-opponent loop replace `const cards = sampleRangeHand(pool, state.board, rangeStrength, random);` with:

```ts
      const sampler = samplers.get(opponentId);
      const cards = sampler && random() < blend
        ? sampler.sample(new Set([...player.holeCards, ...state.board, ...Object.values(sampledHands).flat()].map(cardKey)), random)
        : sampleRangeHand(pool, state.board, rangeStrength, random);
```

Keep `pool = removeCards(pool, cards);` after it.

- [ ] **Step 6: Run the three test files and typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/opponentRange.test.ts src/domain/poker/__tests__/equity.test.ts src/domain/poker/__tests__/multiwayAi.test.ts && pnpm typecheck`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/domain/poker/opponentRange.ts src/domain/poker/equity.ts src/domain/poker/multiwayEquity.ts src/domain/poker/__tests__/opponentRange.test.ts src/domain/poker/__tests__/equity.test.ts src/domain/poker/__tests__/multiwayAi.test.ts
git commit -m "feat(ai): sample opponent hands from modeled ranges in equity estimates

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 7: Fold-equity pricing in the plan and the heuristic selector; heads-up integration

**Files:**
- Modify: `src/domain/poker/postflopStrategy.ts` (`PostflopStrategyInput`, `PostflopCandidate`, `aggressiveCandidates`, `selectPostflopAction`)
- Modify: `src/domain/poker/opponentRange.ts` (`rangeSpotFromHeadsUp`, `buildOpponentRange`)
- Modify: `src/domain/poker/ai.ts`
- Test: `src/domain/poker/__tests__/postflopStrategy.test.ts`, `src/domain/poker/__tests__/opponentRange.test.ts`, `src/domain/poker/__tests__/ai.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // postflopStrategy.ts
  PostflopStrategyInput.foldShareBySize?: Record<SizeBucket, number>;   // probability every live opponent folds
  PostflopStrategyInput.extraSizeFractions?: readonly number[];          // used only from Task 14
  PostflopCandidate.foldEquity?: number;
  // opponentRange.ts
  export interface RangeSpotActions { spot: RangeModelSpot; preflop: PublicPreflopAction[]; postflop: PublicPostflopAction[] }
  export function rangeSpotFromHeadsUp(state: FairHeadsUpDecisionState, opponentId: PlayerId): RangeSpotActions;
  export function buildOpponentRange(line: RangeSpotActions, viewerCards, board, profile, classifier): ComboRange;
  // ai.ts
  export interface HeadsUpAiOptions { identity?: MultiwayAiIdentity }   // widened in Task 12
  decideAiAction(state, playerId, random, difficulty, opponentMemory?, options: HeadsUpAiOptions = {})
  ```

- [ ] **Step 1: Write the failing tests**

Append inside `describe('shared postflop strategy', ...)` in `src/domain/poker/__tests__/postflopStrategy.test.ts`:

```ts
  it('records fold equity per candidate by size bucket', () => {
    const plan = buildPostflopPlan(input({ equity: 0.2, foldShareBySize: { small: 0.3, large: 0.55, overbet: 0.7 } }));
    const small = plan.candidates.find((c) => c.action.type === 'raise' && (c.potFraction ?? 0) <= 0.5);
    const large = plan.candidates.find((c) => c.action.type === 'raise' && (c.potFraction ?? 0) > 0.5);
    expect(small?.foldEquity).toBeCloseTo(0.3, 6);
    expect(large?.foldEquity).toBeCloseTo(0.55, 6);
    expect(plan.candidates.some((c) => (c.potFraction ?? 0) > 1)).toBe(false);
  });

  it('prices bluffs: Sharp bluffs a weak range far more than a strong one', () => {
    const weakRange = buildPostflopPlan(input({ equity: 0.18, foldShareBySize: { small: 0.55, large: 0.7, overbet: 0.8 } }));
    const strongRange = buildPostflopPlan(input({ equity: 0.18, foldShareBySize: { small: 0.1, large: 0.15, overbet: 0.2 } }));
    const noRange = buildPostflopPlan(input({ equity: 0.18 }));
    const bluffs = (plan: ReturnType<typeof buildPostflopPlan>) => Array.from({ length: 2_000 }, (_, i) => (
      selectPostflopAction(plan, (i + 0.5) / 2_000, 'sharp').role === 'bluff'
    )).filter(Boolean).length;
    expect(bluffs(weakRange)).toBeGreaterThan(bluffs(strongRange) * 3);
    expect(bluffs(noRange)).toBeLessThan(bluffs(weakRange));
  });

  it('keeps Friendly gentle and unpriced', () => {
    const plan = buildPostflopPlan(input({ equity: 0.18, foldShareBySize: { small: 0.7, large: 0.8, overbet: 0.9 } }));
    const bluffs = Array.from({ length: 2_000 }, (_, i) => selectPostflopAction(plan, (i + 0.5) / 2_000, 'friendly').role === 'bluff').filter(Boolean).length;
    expect(bluffs).toBeLessThan(60);
  });
```

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
    expect(villainLine.preflop).toEqual([expect.objectContaining({ type: 'raise', facing: 'raised', raiseCount: 1, raiseSizeBb: 2.5, raiserPosition: 'BTN/SB' })]);
    const heroLine = rangeSpotFromHeadsUp(view, 'hero');
    expect(heroLine.spot.position).toBe('BTN/SB');
    expect(heroLine.preflop).toEqual([expect.objectContaining({ type: 'raise', facing: 'unopened', raiseCount: 0 })]);
    expect(view.players.villain.holeCards).toEqual([]);
  });
});
```

Append to `describe('AI difficulty profiles', ...)` in `src/domain/poker/__tests__/ai.test.ts`:

```ts
  it('Sharp respects a 3-bettor at least as much as Club with the same hand', () => {
    const trials = (difficulty: 'club' | 'sharp') => Array.from({ length: 60 }, (_, index) => {
      let state = createHand({ button: 'villain', random: seededRandom(500 + index) });
      state.players.villain.holeCards = [{ rank: 9, suit: 'clubs' }, { rank: 8, suit: 'clubs' }];
      state = applyAction(state, 'villain', { type: 'raise', amount: 50 });
      state = applyAction(state, 'hero', { type: 'raise', amount: 180 });
      return decideAiAction(createFairHeadsUpDecisionState(state, 'villain'), 'villain', seededRandom(900 + index), difficulty).action.type;
    });
    const folds = (types: string[]) => types.filter((type) => type === 'fold').length;
    expect(folds(trials('sharp'))).toBeGreaterThanOrEqual(folds(trials('club')));
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

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/postflopStrategy.test.ts src/domain/poker/__tests__/opponentRange.test.ts -t "fold equity|prices bluffs|Friendly gentle|heads-up public line"`
Expected: FAIL (unknown fields, missing export).

- [ ] **Step 3: Plan and selector changes**

In `src/domain/poker/postflopStrategy.ts` (import `type SizeBucket` and `sizeBucketFor` from `'./opponentRange.ts'`; this import is type-and-function only and `opponentRange.ts` imports `drawLabelOnBoard` from this file, so keep both imports at module top and avoid using either at module-evaluation time to keep the cycle harmless):

Add to `PostflopStrategyInput` after `tournamentRiskPremium?: number;`:

```ts
  /** Probability that every live opponent folds, by bet-size bucket, from the modeled ranges. */
  foldShareBySize?: Record<SizeBucket, number>;
  /** Additional pot fractions above 1 to offer as candidates (Nemesis overbets). */
  extraSizeFractions?: readonly number[];
```

Add to `PostflopCandidate` after `potFraction?: number;`:

```ts
  /** Estimated probability that every opponent folds to this exact size; undefined without a range. */
  foldEquity?: number;
```

In `aggressiveCandidates`, inside `addCandidate` after `actualFraction`:

```ts
    const foldEquity = input.foldShareBySize ? input.foldShareBySize[sizeBucketFor(actualFraction)] : undefined;
```

and include `foldEquity,` in the pushed candidate. After the `sizeChoices.forEach(...)` line add:

```ts
  for (const fraction of input.extraSizeFractions ?? []) {
    if (fraction > 1) addCandidate(fraction, `${Math.round(fraction * 100)}% pot`);
  }
```

Import `aiStrategyProfile` from `'./aiProfiles.ts'`. In `selectPostflopAction`, inside the `if (candidate.action.type === 'raise') {` block, replace the `else if (candidate.role === 'bluff') { score -= 0.04; }` branch written in Task 3 with:

```ts
      } else if (candidate.role === 'bluff' || candidate.role === 'draw') {
        if (candidate.foldEquity !== undefined) {
          // Priced: attractive only when the modeled range folds more often than the size needs.
          const fraction = Math.max(0.2, candidate.potFraction ?? 0.5);
          const breakEven = fraction / (1 + fraction);
          score += aiStrategyProfile(difficulty).bluffPricingScale * (candidate.foldEquity - breakEven);
        } else if (candidate.role === 'bluff') {
          score -= 0.04;
        }
      }
```

- [ ] **Step 4: Heads-up line reader and range builder**

Append to `src/domain/poker/opponentRange.ts` (imports: `type FairHeadsUpDecisionState` from `'./fairness.ts'`; `type PlayerId` from `'./types.ts'`; `preflopFacingFromPublicAction` from `'./preflopStrategy.ts'`):

```ts
export interface RangeSpotActions {
  spot: RangeModelSpot;
  preflop: PublicPreflopAction[];
  postflop: PublicPostflopAction[];
}

export function rangeSpotFromHeadsUp(state: FairHeadsUpDecisionState, opponentId: PlayerId): RangeSpotActions {
  const opponent = state.players[opponentId];
  const other = state.players[opponentId === 'hero' ? 'villain' : 'hero'];
  const position: TablePosition = state.button === opponentId ? 'BTN/SB' : 'BB';
  const preflop: PublicPreflopAction[] = [];
  const postflop: PublicPostflopAction[] = [];
  let effectiveStackBb = Math.min(opponent.stack + opponent.totalCommitted, other.stack + other.totalCommitted) / state.bigBlind;
  state.history.forEach((record, index) => {
    if (record.player !== opponentId || record.type === 'fold' || record.street === 'complete') return;
    const context = record.decisionContext;
    if (preflop.length + postflop.length === 0) {
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
        type: record.type,
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
    const potBefore = Math.max(1, context.potBefore);
    const fraction = record.type === 'raise' ? (record.amount - context.currentBet) / potBefore : context.toCall / potBefore;
    postflop.push({
      board: context.board,
      type: record.type,
      sizeBucket: record.type === 'raise' && context.currentBet > 0 && fraction <= 1 ? 'large' : sizeBucketFor(fraction),
      facingBet: context.toCall > 0,
    });
  });
  return { spot: { position, playerCount: 2, effectiveStackBb }, preflop, postflop };
}

export function buildOpponentRange(
  line: RangeSpotActions,
  viewerCards: readonly Card[],
  board: readonly Card[],
  profile: RangeModelProfile,
  classifier: BoardClassifier,
): ComboRange {
  const prior = uniformRange([...viewerCards, ...board]);
  const preflop = applyPreflopActions(prior, line.preflop, line.spot, profile);
  return applyPostflopActions(preflop, line.postflop, profile, classifier);
}
```

- [ ] **Step 5: Integrate into `decideAiAction`**

In `src/domain/poker/ai.ts` add imports: `estimateEquityAgainstRange` from `'./equity'`; `buildOpponentRange, createBoardClassifier, foldShare, rangeSpotFromHeadsUp, responseTable, type ComboRange, type SizeBucket` from `'./opponentRange'`; `type MultiwayAiIdentity` from `'./multiwayAiProfiles'`.

Add before `decideAiAction`:

```ts
export interface HeadsUpAiOptions {
  /** Roster identity for archetype, range tightness and slow play; balanced when omitted. */
  identity?: MultiwayAiIdentity;
}

const SIZE_BUCKETS: readonly SizeBucket[] = ['small', 'large', 'overbet'];
```

Signature: `export function decideAiAction(state: FairHeadsUpDecisionState, playerId: PlayerId = 'villain', random: RandomSource = Math.random, difficulty: AiDifficulty = 'club', opponentMemory?: OpponentMemory, options: HeadsUpAiOptions = {}): AiDecision`.

Replace the top of the function through the adaptation line with:

```ts
  const profile = aiStrategyProfile(difficulty);
  const player = state.players[playerId];
  const opponentId: PlayerId = playerId === 'hero' ? 'villain' : 'hero';
  const opponent = state.players[opponentId];
  const identity = options.identity;
  const classifier = createBoardClassifier();
  const rangeProfile = {
    archetype: 'balanced' as const,
    tier: 'club' as const,
    bluffAllowance: 1,
    narrowingStrength: profile.narrowingStrength,
    memory: opponentMemory,
    memoryStrength: profile.memoryStrength,
  };
  const opponentRange: ComboRange | null = profile.rangeBlend > 0
    ? buildOpponentRange(rangeSpotFromHeadsUp(state, opponentId), player.holeCards, state.board, rangeProfile, classifier)
    : null;
  const equity = opponentRange
    ? estimateEquityAgainstRange(player.holeCards, state.board, opponentRange, profile.rangeBlend, profile.equitySamples, random)
    : estimateHeadsUpEquity(player.holeCards, state.board, profile.equitySamples, random);
  const adaptation = buildOpponentAdaptation(
    opponentMemory ?? createEmptyOpponentMemory(),
    profile.memoryStrength,
    state.button === 'hero' ? 'late' : 'blind',
  );
```

Delete the now-duplicated `const player`, `const opponentId`, `const opponent` lines inside the preflop and postflop branches. In the preflop `buildPreflopPlan` call set `archetype: identity?.style ?? 'balanced',` and add `rangeTightness: identity?.rangeTightness,`.

In the postflop branch, before `buildPostflopPlan`, add:

```ts
    const table = responseTable(rangeProfile);
    const foldShareBySize = opponentRange
      ? Object.fromEntries(SIZE_BUCKETS.map((bucket) => [bucket, foldShare(opponentRange, state.board, bucket, table, classifier)])) as Record<SizeBucket, number>
      : undefined;
```

add `foldShareBySize,` to the `buildPostflopPlan` input, and change the `selectPostflopAction` adjustments to:

```ts
    const selected = selectPostflopAction(plan, random(), difficulty, {
      bluffFrequencyScale: adaptation.bluffFrequencyScale * (identity?.bluffFrequency ?? 1),
      callToleranceDelta: adaptation.callToleranceDelta + (identity?.callTolerance ?? 0),
      pressureFrequencyScale: adaptation.pressureFrequencyScale * (identity?.aggression ?? 1),
      raiseSizeScale: adaptation.raiseSizeScale * (identity ? Math.max(0.9, Math.min(1.12, identity.potFraction / 0.66)) : 1),
      slowPlayFrequency: identity?.slowPlayFrequency ?? 0,
      valueFrequencyScale: adaptation.valueFrequencyScale * (identity?.aggression ?? 1),
    });
```

- [ ] **Step 6: Run the heads-up, strategy, range, and ladder-structure tests; typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/postflopStrategy.test.ts src/domain/poker/__tests__/opponentRange.test.ts src/domain/poker/__tests__/ai.test.ts src/domain/poker/__tests__/aiLadder.test.ts src/domain/poker/__tests__/aiBenchmark.test.ts && pnpm typecheck`
Expected: pass. Re-pin only heads-up behavior tests whose new value is in the intended direction; record each in `docs/AI_LADDER_QA.md`. Fairness tests must pass unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/domain/poker/postflopStrategy.ts src/domain/poker/opponentRange.ts src/domain/poker/ai.ts src/domain/poker/__tests__/postflopStrategy.test.ts src/domain/poker/__tests__/opponentRange.test.ts src/domain/poker/__tests__/ai.test.ts docs/AI_LADDER_QA.md
git commit -m "feat(ai): heads-up decisions model the opponent range and price bluffs by fold equity

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 8: Multiway integration and the Stage 2 measurement

**Files:**
- Modify: `src/domain/poker/opponentRange.ts` (`rangeSpotFromMultiway`)
- Modify: `src/domain/poker/multiwayAi.ts`
- Test: `src/domain/poker/__tests__/opponentRange.test.ts`, `src/domain/poker/__tests__/multiwayAi.test.ts`
- Modify: `docs/AI_LADDER_QA.md`

**Interfaces:**
- Produces: `export function rangeSpotFromMultiway(state: FairMultiwayDecisionState, opponentId: string): RangeSpotActions;`
- `decideMultiwayAiAction` builds one range per live opponent when `rangeBlend > 0`, passes `ranges` and `rangeBlend` to equity, and `foldShareBySize` (product over opponents) to the plan. Elite and Nemesis still use `selectAdvancedPostflopAction` here; Task 9 and 10 teach it called equity.

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/poker/__tests__/opponentRange.test.ts` (imports: `rangeSpotFromMultiway`; `applyMultiwayAction, createMultiwayHand, type TablePlayerConfig` from `'../multiway'`; `createFairMultiwayDecisionState` from `'../fairness'`):

```ts
describe('opponent range: multiway public line', () => {
  function players(count: number): TablePlayerConfig[] {
    return Array.from({ length: count }, (_, seat) => ({ id: seat === 0 ? 'hero' : `ai-${seat}`, name: `P${seat}`, seat, stack: 1_000, isHero: seat === 0 }));
  }

  it('reads facing, raise count, raiser position and callers from the recorded decision context', () => {
    let state = createMultiwayHand({ players: players(6), buttonSeat: 0, random: seededRandom(606) });
    const order = [...state.pending];
    state = applyMultiwayAction(state, order[0]!, { type: 'raise', amount: 50 });
    state = applyMultiwayAction(state, order[1]!, { type: 'call' });
    state = applyMultiwayAction(state, order[2]!, { type: 'raise', amount: 200 });
    const view = createFairMultiwayDecisionState(state, order[3]!);
    expect(rangeSpotFromMultiway(view, order[2]!).preflop).toEqual([expect.objectContaining({
      type: 'raise', facing: 'raised', raiseCount: 1, callersAfterRaise: 1, raiserPosition: state.players[order[0]!]!.position,
    })]);
    expect(rangeSpotFromMultiway(view, order[1]!).preflop).toEqual([expect.objectContaining({ type: 'call', facing: 'raised', raiseCount: 1 })]);
    expect(rangeSpotFromMultiway(view, order[2]!).spot.playerCount).toBe(6);
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

  it('keeps production-depth Nemesis decisions responsive at six and nine seats', () => {
    for (const count of [6, 9]) {
      const state = createMultiwayHand({ players: players(count), buttonSeat: 0, random: seededRandom(900 + count) });
      const startedAt = performance.now();
      const decision = decideMultiwayAiAction(createFairMultiwayDecisionState(state, 'ai-3'), 'ai-3', { difficulty: 'nemesis', random: seededRandom(9_009) });
      expect(performance.now() - startedAt, `${count} seats`).toBeLessThan(1_000);
      expect(() => applyMultiwayAction(state, 'ai-3', decision.action)).not.toThrow();
    }
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/opponentRange.test.ts -t "multiway public line"`
Expected: FAIL, missing export.

- [ ] **Step 3: Multiway line reader**

Append to `src/domain/poker/opponentRange.ts` (import `type FairMultiwayDecisionState` from `'./fairness.ts'`):

```ts
export function rangeSpotFromMultiway(state: FairMultiwayDecisionState, opponentId: string): RangeSpotActions {
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
        type: record.type,
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
    const fraction = record.type === 'raise' ? (record.amount - context.currentBet) / potBefore : context.toCall / potBefore;
    postflop.push({
      board: context.board,
      type: record.type,
      sizeBucket: record.type === 'raise' && context.currentBet > 0 && fraction <= 1 ? 'large' : sizeBucketFor(fraction),
      facingBet: context.toCall > 0,
    });
  });
  return { spot: { position, playerCount, effectiveStackBb }, preflop, postflop };
}
```

- [ ] **Step 4: Integrate into `decideMultiwayAiAction`**

In `src/domain/poker/multiwayAi.ts` add imports: `GENERIC_HUMAN_RANGE_ID, resolveMultiwayOpponentRangeIdentity` from `'./multiwayEquity.ts'`; `buildOpponentRange, createBoardClassifier, foldShare, rangeSpotFromMultiway, responseTable, type ComboRange, type RangeModelProfile, type ResponseTable, type SizeBucket` from `'./opponentRange.ts'`.

After `const random = options.random ?? Math.random;` and before the equity estimate:

```ts
  const profile = aiStrategyProfile(difficulty);
  const classifier = createBoardClassifier();
  const liveOpponents = liveOpponentIds(state, playerId);
  const ranges: Partial<Record<string, ComboRange>> = {};
  const tables: Partial<Record<string, ResponseTable>> = {};
  if (profile.rangeBlend > 0) {
    for (const opponentId of liveOpponents) {
      const opponent = state.players[opponentId];
      if (!opponent) continue;
      const modeled = resolveMultiwayOpponentRangeIdentity(opponent, options.identities);
      const human = modeled.id === GENERIC_HUMAN_RANGE_ID;
      const rangeProfile: RangeModelProfile = {
        archetype: human ? 'balanced' : modeled.style,
        tier: human ? 'club' : modeled.level,
        rangeTightness: human ? undefined : modeled.rangeTightness,
        bluffAllowance: human ? 1 : modeled.bluffFrequency,
        narrowingStrength: profile.narrowingStrength,
        memory: human ? options.opponentMemory : undefined,
        memoryStrength: profile.memoryStrength,
      };
      ranges[opponentId] = buildOpponentRange(rangeSpotFromMultiway(state, opponentId), player.holeCards, state.board, rangeProfile, classifier);
      tables[opponentId] = responseTable(rangeProfile);
    }
  }
  const modeledAll = liveOpponents.length > 0 && liveOpponents.every((id) => ranges[id] !== undefined);
  const allFoldShare = (bucket: SizeBucket): number => liveOpponents.reduce(
    (product, id) => product * foldShare(ranges[id]!, state.board, bucket, tables[id]!, classifier),
    1,
  );
```

Change the equity call to include `ranges,` and `rangeBlend: profile.rangeBlend,`. In the postflop branch add to the `buildPostflopPlan` input:

```ts
      foldShareBySize: modeledAll
        ? { small: allFoldShare('small'), large: allFoldShare('large'), overbet: allFoldShare('overbet') }
        : undefined,
```

- [ ] **Step 5: Run the multiway suites, range tests, championship simulation, typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/multiwayAi.test.ts src/domain/poker/__tests__/opponentRange.test.ts src/domain/poker/__tests__/championshipSimulation.test.ts src/domain/poker/__tests__/aiLadder.test.ts && pnpm typecheck`
Expected: fairness, legality, chip-conservation, latency, and dynamics bands pass unchanged. Re-pin only behavior tests in the intended direction and record them. If the nine-seat latency test fails, make `BoardClassifier.classifyAll` skip combos whose weight is zero by accepting an optional weights argument before touching sample counts.

- [ ] **Step 6: Measure the stage**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && AI_BENCHMARK_OUTPUT=/tmp/ladder-stage2.json pnpm eval:ai:ladder`
Fill "Stage 2: ranges" in `docs/AI_LADDER_QA.md` with the tuning-corpus tables and one sentence on what hand-reading added over Stage 1.

- [ ] **Step 7: Commit**

```bash
git add src/domain/poker/multiwayAi.ts src/domain/poker/opponentRange.ts src/domain/poker/__tests__/multiwayAi.test.ts src/domain/poker/__tests__/opponentRange.test.ts docs/AI_LADDER_QA.md
git commit -m "feat(ai): multiway decisions model every live opponent range; record stage 2 ladder

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Stage 3: Equity when called

### Task 9: EV selector uses fold equity and equity when called; shared core; heads-up adapter

**Files:**
- Modify: `src/domain/poker/postflopEv.ts`
- Test: `src/domain/poker/__tests__/postflopEv.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface PostflopEvContext { ...existing; calledEquityBySize?: Record<SizeBucket, number> }
  export interface AdvancedPostflopSelectionInput { ...existing; calledEquityBySize?: Record<SizeBucket, number> }
  export function selectPostflopActionByEv(evs: PostflopCandidateEv[], mix: number, difficulty: 'elite' | 'nemesis'): PostflopCandidate;
  export function selectHeadsUpPostflopActionByEv(input: { plan: PostflopPlan; context: PostflopEvContext; mix: number; difficulty: 'elite' | 'nemesis' }): PostflopCandidate;
  ```
- `estimatePostflopCandidateEv` uses `candidate.foldEquity` for the all-fold branch when present and `calledEquityBySize[bucket]` for the called branch when present; otherwise the legacy heuristics.

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/poker/__tests__/postflopEv.test.ts` (import `selectHeadsUpPostflopActionByEv, selectPostflopActionByEv` from `'../postflopEv'`):

```ts
describe('range-informed EV', () => {
  it('uses the candidate fold equity when present instead of the size heuristic', () => {
    const bluff = { ...candidate('raise', 100), role: 'bluff' as const, potFraction: 0.5, foldEquity: 0.7 };
    const heuristic = { ...bluff, foldEquity: undefined };
    const ctx = context({ equity: 0.1 });
    expect(estimatePostflopCandidateEv(bluff, ctx).foldEquity).toBeCloseTo(0.7, 6);
    expect(estimatePostflopCandidateEv(heuristic, ctx).foldEquity).toBeLessThan(0.7);
    expect(estimatePostflopCandidateEv(bluff, ctx).expectedValue).toBeGreaterThan(estimatePostflopCandidateEv(heuristic, ctx).expectedValue);
  });

  it('values a bet by equity against the hands that call, not overall equity', () => {
    // 60 percent overall, but only 30 percent against the continuing range for a large bet.
    const value = { ...candidate('raise', 100), role: 'value' as const, potFraction: 0.75, foldEquity: 0.35 };
    const optimistic = estimatePostflopCandidateEv(value, context({ equity: 0.6 }));
    const conditioned = estimatePostflopCandidateEv(value, context({ equity: 0.6, calledEquityBySize: { small: 0.5, large: 0.3, overbet: 0.2 } }));
    expect(conditioned.expectedValue).toBeLessThan(optimistic.expectedValue);
    const smallBet = { ...value, potFraction: 0.33 };
    const smallConditioned = estimatePostflopCandidateEv(smallBet, context({ equity: 0.6, calledEquityBySize: { small: 0.5, large: 0.3, overbet: 0.2 } }));
    // The small bet is called by a wider, weaker range, so its called equity is higher.
    expect(smallConditioned.expectedValue / 0.33).toBeGreaterThan(conditioned.expectedValue / 0.75);
  });

  it('selects heads-up by EV through the shared core', () => {
    const plan = buildPostflopPlan({
      bigBlind: 20,
      board: [{ rank: 14, suit: 'spades' }, { rank: 8, suit: 'hearts' }, { rank: 2, suit: 'clubs' }],
      cards: [{ rank: 14, suit: 'diamonds' }, { rank: 13, suit: 'diamonds' }],
      currentBet: 0, effectiveStack: 900, equity: 0.8, initiative: 'player',
      legal: { canFold: false, canCheck: true, canCall: false, canRaise: true, toCall: 0, minRaiseTo: 20, maxRaiseTo: 900, suggestedRaiseTo: 66 },
      opponentCount: 1, playerStreetBet: 0, playersBehind: 0, pot: 100, street: 'flop',
      foldShareBySize: { small: 0.4, large: 0.55, overbet: 0.7 },
    });
    const picks = Array.from({ length: 200 }, (_, i) => selectHeadsUpPostflopActionByEv({
      plan, mix: (i + 0.5) / 200, difficulty: 'elite',
      context: context({ equity: 0.8, currentBet: 0, pot: 100, street: 'flop', calledEquityBySize: { small: 0.72, large: 0.66, overbet: 0.6 } }),
    }).action.type);
    expect(picks.filter((type) => type === 'raise').length).toBeGreaterThan(120);
    expect(typeof selectPostflopActionByEv).toBe('function');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/postflopEv.test.ts -t "range-informed"`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/domain/poker/postflopEv.ts` import `sizeBucketFor, type SizeBucket` from `'./opponentRange.ts'`. Add to `PostflopEvContext` and to `AdvancedPostflopSelectionInput`:

```ts
  /** Equity against the part of the modeled ranges that continues against each size bucket. */
  calledEquityBySize?: Record<SizeBucket, number>;
```

In `estimatePostflopCandidateEv`, in the raise branch, replace `foldEquity = estimatedAllFoldProbability(candidate, context);` and the `calledEquity` computation with:

```ts
    foldEquity = candidate.foldEquity !== undefined
      ? clamp(candidate.foldEquity, 0.002, 0.9)
      : estimatedAllFoldProbability(candidate, context);
    const bucket = sizeBucketFor(sizeFraction);
    const baseCalledEquity = context.calledEquityBySize
      ? context.calledEquityBySize[bucket]
      : equity - Math.max(0, context.averageOpponentRangeStrength - 0.16) * 0.16 - Math.max(0, sizeFraction - 0.75) * 0.025;
    const calledEquity = clamp(baseCalledEquity - context.adaptation.valueThresholdDelta, 0.015, 0.985);
```

Extract the selection loop into a shared core and add the heads-up adapter:

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
    ...counts, [item.candidate.action.type]: (counts[item.candidate.action.type] ?? 0) + 1,
  }), {});
  const weights = sorted.map((item) => ({
    item,
    weight: Math.exp((item.utility - best.utility) * temperature) / Math.max(1, familyCounts[item.candidate.action.type] ?? 1),
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
  return selectPostflopActionByEv(
    input.plan.candidates.map((candidate) => estimatePostflopCandidateEv(candidate, input.context)),
    input.mix,
    input.difficulty,
  );
}
```

Rewrite `selectAdvancedPostflopAction` as `return selectPostflopActionByEv(advancedPostflopCandidateEvs(input), input.mix, input.difficulty);` and pass `calledEquityBySize: input.calledEquityBySize,` into the context in `advancedPostflopCandidateEvs`.

- [ ] **Step 4: Run the EV tests**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/postflopEv.test.ts`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/poker/postflopEv.ts src/domain/poker/__tests__/postflopEv.test.ts
git commit -m "feat(ai): EV selector prices bets by fold equity and equity when called

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 10: Route Elite and Nemesis through the EV selector with called equity; measure Stage 3

**Files:**
- Modify: `src/domain/poker/ai.ts`
- Modify: `src/domain/poker/multiwayAi.ts`
- Test: `src/domain/poker/__tests__/ai.test.ts`, `src/domain/poker/__tests__/multiwayAi.test.ts`
- Modify: `docs/AI_LADDER_QA.md`

**Interfaces:** none new. Called-equity estimates run at `Math.max(60, Math.round(profile.equitySamples * 0.4))` samples per bucket and only when a bet or raise is legal.

- [ ] **Step 1: Write the failing tests**

Append to `describe('AI difficulty profiles', ...)` in `src/domain/poker/__tests__/ai.test.ts`:

```ts
  it('Elite bets a strong hand into a weak checked range far more than a capped-and-strong one', () => {
    // Villain (button) holds top set on a dry board after both players checked the flop.
    const base = stateWithOptionToBet();
    base.players.villain.holeCards = [{ rank: 14, suit: 'clubs' }, { rank: 14, suit: 'diamonds' }];
    const bets = Array.from({ length: 80 }, (_, index) => decideAiAction(
      createFairHeadsUpDecisionState(base, 'villain'), 'villain', seededRandom(6_000 + index), 'elite',
    ).action.type === 'raise').filter(Boolean).length;
    expect(bets).toBeGreaterThan(40);
  });
```

Append to the multiway decisions describe in `src/domain/poker/__tests__/multiwayAi.test.ts`:

```ts
  it('Elite still folds bottom pair to a large bet from a strong modeled range', () => {
    const state = stateFacingRaise();
    // Move to the flop with a raise from the hero and a weak holding for ai-1.
    const view = createFairMultiwayDecisionState(state, 'ai-1');
    const decision = decideMultiwayAiAction(view, 'ai-1', {
      difficulty: 'elite', identity: multiwayAiIdentityForSeat(1), simulations: 200, random: seededRandom(3_303),
    });
    expect(['fold', 'call', 'raise']).toContain(decision.action.type);
    expect(Number.isFinite(decision.estimatedEquity)).toBe(true);
  });
```

- [ ] **Step 2: Run to verify current behavior**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/ai.test.ts -t "weak checked range"`
Expected: may pass or fail before routing; proceed either way, the test pins the EV path after Step 3.

- [ ] **Step 3: Heads-up routing**

In `src/domain/poker/ai.ts` import `selectHeadsUpPostflopActionByEv, type PostflopEvContext` from `'./postflopEv'` and `continuingRange, rangeStrength` from `'./opponentRange'`. In the postflop branch, after `foldShareBySize` and before `buildPostflopPlan`, add:

```ts
    const calledSamples = Math.max(60, Math.round(profile.equitySamples * 0.4));
    const calledEquityBySize = opponentRange && legal.canRaise
      ? Object.fromEntries(SIZE_BUCKETS.map((bucket) => [
        bucket,
        estimateEquityAgainstRange(
          player.holeCards, state.board,
          continuingRange(opponentRange, state.board, bucket, table, classifier),
          1, calledSamples, random,
        ),
      ])) as Record<SizeBucket, number>
      : undefined;
```

Replace the `selectPostflopAction(...)` call with:

```ts
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
          adaptation: {
            ...adaptation,
            bluffFrequencyScale: adjustments.bluffFrequencyScale,
            callToleranceDelta: adjustments.callToleranceDelta,
            pressureFrequencyScale: adjustments.pressureFrequencyScale,
            raiseSizeScale: adjustments.raiseSizeScale,
            valueFrequencyScale: adjustments.valueFrequencyScale,
          },
          averageOpponentRangeStrength: opponentRange ? rangeStrength(opponentRange, state.board, classifier) : 0.2,
          calledEquityBySize,
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

- [ ] **Step 4: Multiway routing**

In `src/domain/poker/multiwayAi.ts` import `continuingRange` from `'./opponentRange.ts'`. In the postflop branch, before the selector, add:

```ts
    const calledEquityBySize = modeledAll && legal.canRaise
      ? Object.fromEntries((['small', 'large', 'overbet'] as const).map((bucket) => [
        bucket,
        estimateMultiwayEquity(state, playerId, {
          simulations: Math.max(60, Math.round((options.simulations ?? tuning.equitySamples) * 0.4)),
          random,
          identities: options.identities,
          ranges: Object.fromEntries(liveOpponents.map((id) => [id, continuingRange(ranges[id]!, state.board, bucket, tables[id]!, classifier)])),
          rangeBlend: 1,
        }),
      ])) as Record<SizeBucket, number>
      : undefined;
```

Change the Elite/Nemesis condition to `profile.evSelector && (difficulty === 'elite' || difficulty === 'nemesis')` and pass `calledEquityBySize,` into the `selectAdvancedPostflopAction` input.

- [ ] **Step 5: Run the suites and latency tests; typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/ai.test.ts src/domain/poker/__tests__/multiwayAi.test.ts src/domain/poker/__tests__/postflopEv.test.ts src/domain/poker/__tests__/championshipSimulation.test.ts && pnpm typecheck`
Expected: pass, including the six- and nine-seat Nemesis latency test. If latency fails, lower the called-equity sample share from 0.4 to 0.3 in both files and record it.

- [ ] **Step 6: Measure the stage**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && AI_BENCHMARK_OUTPUT=/tmp/ladder-stage3.json pnpm eval:ai:ladder`
Fill "Stage 3: equity when called" in `docs/AI_LADDER_QA.md`.

- [ ] **Step 7: Commit**

```bash
git add src/domain/poker/ai.ts src/domain/poker/multiwayAi.ts src/domain/poker/__tests__/ai.test.ts src/domain/poker/__tests__/multiwayAi.test.ts docs/AI_LADDER_QA.md
git commit -m "feat(ai): Elite and Nemesis select by EV with equity when called on both paths; record stage 3

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Stage 4: Calibrate

### Task 11: Tuning pass on the tuning corpus, confirmation on the evaluation corpus

**Files:**
- Modify: `src/domain/poker/aiProfiles.ts` (ladder fields) and `src/domain/poker/opponentRange.ts` (`BASE_RESPONSE_TABLE`) as needed
- Modify: `src/domain/poker/__tests__/aiLadder.test.ts` (CI bluff-ratio pin)
- Modify: `docs/AI_LADDER_QA.md`, `docs/AI_DIFFICULTY_PRESETS.md`

- [ ] **Step 1: Iterate on the tuning corpus**

Targets (tuning corpus first): heads-up Elite vs Club and Nemesis vs Club at least +20 BB/100 with lower 2 SE bound above 0; heads-up adjacent pairs with positive point estimates; six-max Sharp, Elite, Nemesis vs Club positive. One knob per iteration, each re-run and recorded as a subsection under "Stage 4":

1. `bluffPricingScale` for Club (0.6) and Sharp (0.9), steps of 0.15.
2. `narrowingStrength` for Club (0.5) and Sharp (0.8), steps of 0.1.
3. `BASE_RESPONSE_TABLE` cells, at most 0.05 per cell per iteration, rows kept summing to 1.
4. `rangeBlend` for Club (0.4) and Sharp (0.7), steps of 0.1.
5. Friendly and Club gentleness constants only if a step below Sharp is still inverted.

After every iteration run `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/multiwayAi.test.ts src/domain/poker/__tests__/ai.test.ts src/domain/poker/__tests__/championshipSimulation.test.ts`; if a dynamics band fails, revert that iteration and try the next knob.

- [ ] **Step 2: Confirm on the evaluation corpus, once**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && LADDER_CORPUS=evaluation AI_BENCHMARK_OUTPUT=/tmp/ladder-stage4-eval.json pnpm eval:ai:ladder`
Record under "Stage 4: evaluation corpus". If a target fails on the evaluation corpus, return to Step 1 on the tuning corpus; do not tune against the evaluation numbers.

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

If the measured ratio after tuning is above 2.5, set the bound to the measured ratio plus 0.5 and record why.

- [ ] **Step 4: Update the presets doc**

In `docs/AI_DIFFICULTY_PRESETS.md` replace the "Earned Championship tiers" table's "Main distinction" column with the spec section 5.4 feature list, and add a "Ladder benchmark" subsection pointing at `pnpm eval:ai:ladder`, the two corpora, and the shipped heads-up and six-max numbers from the evaluation corpus.

- [ ] **Step 5: Commit**

```bash
git add src/domain/poker/aiProfiles.ts src/domain/poker/opponentRange.ts src/domain/poker/__tests__/aiLadder.test.ts docs/AI_LADDER_QA.md docs/AI_DIFFICULTY_PRESETS.md
git commit -m "tune(ai): calibrate the difficulty ladder on the tuning corpus; confirm on held-out seeds

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Stage 5: Nemesis features

### Task 12: Per-session exploit read

**Files:**
- Create: `src/domain/poker/sessionExploitRead.ts`
- Create: `src/domain/poker/__tests__/sessionExploitRead.test.ts`
- Modify: `src/domain/poker/ai.ts` (`HeadsUpAiOptions.sessionRead`), `src/domain/poker/multiwayAi.ts` (`MultiwayAiDecisionOptions.sessionRead`), `src/domain/poker/multiwaySession.ts` (`decideSessionAiAction` gains `sessionRead?`)

**Interfaces:**
- Produces:
  ```ts
  export interface SessionExploitRead { version: 1; hands: number; cbetOpportunities: number; cbetFolds: number; threeBetOpportunities: number; threeBetFolds: number; riverBetOpportunities: number; riverCalls: number }
  export function createEmptySessionExploitRead(): SessionExploitRead;
  export function observeSessionHeadsUpHand(read, state: GameState, heroId?: PlayerId): SessionExploitRead;
  export function observeSessionMultiwayHand(read, state: MultiwayHandState, heroId?: string): SessionExploitRead;
  export interface SessionExploitScales { cbetScale: number; threeBetScale: number; riverValueScale: number }   // each in [0.7, 1.4]
  export function sessionExploitScales(read): SessionExploitScales;
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/domain/poker/__tests__/sessionExploitRead.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { seededRandom } from '../cards';
import { applyAction, createHand } from '../engine';
import { createEmptySessionExploitRead, observeSessionHeadsUpHand, sessionExploitScales } from '../sessionExploitRead';

function heroFoldsToCbet() {
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
    expect(read).toMatchObject({ hands: 1, cbetOpportunities: 1, cbetFolds: 1, threeBetOpportunities: 0 });
  });

  it('counts a fold to a re-raise as a 3-bet fold', () => {
    const read = observeSessionHeadsUpHand(createEmptySessionExploitRead(), heroFoldsToThreeBet());
    expect(read).toMatchObject({ threeBetOpportunities: 1, threeBetFolds: 1, cbetOpportunities: 0 });
  });

  it('ramps over twelve hands and stays inside [0.7, 1.4]', () => {
    let read = createEmptySessionExploitRead();
    for (let hand = 0; hand < 12; hand += 1) read = observeSessionHeadsUpHand(read, heroFoldsToCbet());
    const scales = sessionExploitScales(read);
    expect(scales.cbetScale).toBeGreaterThan(1.2);
    expect(scales.cbetScale).toBeLessThanOrEqual(1.4);
    const early = sessionExploitScales(observeSessionHeadsUpHand(createEmptySessionExploitRead(), heroFoldsToCbet()));
    expect(early.cbetScale).toBeGreaterThan(1);
    expect(early.cbetScale).toBeLessThan(scales.cbetScale);
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

/** Nemesis-only, per-session, public-action counters about the human. Never persisted. */
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
  /** Multiplies re-raise frequency against the human's opens. */
  threeBetScale: number;
  /** Multiplies river value-bet frequency; higher when the human calls rivers often. */
  riverValueScale: number;
}

const RAMP_HANDS = 12;
const NEUTRAL: SessionExploitScales = { cbetScale: 1, threeBetScale: 1, riverValueScale: 1 };

export function createEmptySessionExploitRead(): SessionExploitRead {
  return { version: 1, hands: 0, cbetOpportunities: 0, cbetFolds: 0, threeBetOpportunities: 0, threeBetFolds: 0, riverBetOpportunities: 0, riverCalls: 0 };
}

interface PublicRecord { actor: string; type: 'fold' | 'check' | 'call' | 'raise'; street: string; toCall: number }

function observe(read: SessionExploitRead, records: readonly PublicRecord[], heroId: string): SessionExploitRead {
  const next = { ...read, hands: read.hands + 1 };
  const preflop = records.filter((record) => record.street === 'preflop');
  const lastPreflopRaiser = preflop.filter((record) => record.type === 'raise').at(-1)?.actor;
  const heroRaiseIndex = preflop.findIndex((record) => record.actor === heroId && record.type === 'raise');
  if (heroRaiseIndex >= 0) {
    const reraiseIndex = preflop.findIndex((record, index) => index > heroRaiseIndex && record.type === 'raise' && record.actor !== heroId);
    const response = reraiseIndex >= 0 ? preflop.find((record, index) => index > reraiseIndex && record.actor === heroId) : undefined;
    if (response) {
      next.threeBetOpportunities += 1;
      if (response.type === 'fold') next.threeBetFolds += 1;
    }
  }
  const flop = records.filter((record) => record.street === 'flop');
  const firstFlopBet = flop.findIndex((record) => record.type === 'raise');
  if (firstFlopBet >= 0 && lastPreflopRaiser && lastPreflopRaiser !== heroId && flop[firstFlopBet]!.actor === lastPreflopRaiser) {
    const response = flop.find((record, index) => index > firstFlopBet && record.actor === heroId && record.toCall > 0);
    if (response) {
      next.cbetOpportunities += 1;
      if (response.type === 'fold') next.cbetFolds += 1;
    }
  }
  const riverResponse = records.find((record) => record.street === 'river' && record.actor === heroId && record.toCall > 0);
  if (riverResponse) {
    next.riverBetOpportunities += 1;
    if (riverResponse.type === 'call') next.riverCalls += 1;
  }
  return next;
}

export function observeSessionHeadsUpHand(read: SessionExploitRead, state: GameState, heroId: PlayerId = 'hero'): SessionExploitRead {
  return observe(read, state.history.map((record) => ({ actor: record.player, type: record.type, street: record.street, toCall: record.decisionContext.toCall })), heroId);
}

export function observeSessionMultiwayHand(read: SessionExploitRead, state: MultiwayHandState, heroId = 'hero'): SessionExploitRead {
  return observe(read, state.history.map((record) => ({ actor: record.playerId, type: record.type, street: record.street, toCall: record.decisionContext?.toCall ?? 0 })), heroId);
}

function smoothed(successes: number, opportunities: number, prior: number, priorWeight: number): number {
  return (successes + prior * priorWeight) / Math.max(1, opportunities + priorWeight);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function sessionExploitScales(read: SessionExploitRead): SessionExploitScales {
  const confidence = clamp(read.hands / RAMP_HANDS, 0, 1);
  if (confidence === 0) return NEUTRAL;
  const scale = (rate: number, baseline: number) => clamp(1 + ((rate - baseline) / 0.3) * 0.4 * confidence, 0.7, 1.4);
  return {
    cbetScale: scale(smoothed(read.cbetFolds, read.cbetOpportunities, 0.45, 4), 0.45),
    threeBetScale: scale(smoothed(read.threeBetFolds, read.threeBetOpportunities, 0.55, 4), 0.55),
    riverValueScale: scale(smoothed(read.riverCalls, read.riverBetOpportunities, 0.45, 4), 0.45),
  };
}
```

- [ ] **Step 4: Wire the scales into Nemesis decisions**

`src/domain/poker/ai.ts`: add `sessionRead?: SessionExploitRead;` to `HeadsUpAiOptions` (import the type and `sessionExploitScales`). After `const identity = options.identity;` add:

```ts
  const exploit = profile.sessionRead && options.sessionRead
    ? sessionExploitScales(options.sessionRead)
    : { cbetScale: 1, threeBetScale: 1, riverValueScale: 1 };
```

Preflop: multiply `raiseFrequencyScale` by `facing === 'raised' ? exploit.threeBetScale : 1`. Postflop `adjustments`: multiply `pressureFrequencyScale` by `state.street === 'flop' && initiative === 'player' && state.currentBet === 0 ? exploit.cbetScale : 1` and `valueFrequencyScale` by `state.street === 'river' ? exploit.riverValueScale : 1`. The EV context receives the same adjusted scales through its `adaptation` copy.

`src/domain/poker/multiwayAi.ts`: add `sessionRead?: SessionExploitRead;` to `MultiwayAiDecisionOptions`, compute `exploit` after `profile`, and apply the same three multipliers to the preflop `raiseFrequencyScale`, the heuristic `pressureFrequencyScale` and `valueFrequencyScale`, and the `adaptation` passed to `selectAdvancedPostflopAction`.

`src/domain/poker/multiwaySession.ts`: add a final parameter `sessionRead?: SessionExploitRead` to `decideSessionAiAction` and pass `sessionRead` in the options.

- [ ] **Step 5: Run the tests and typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/sessionExploitRead.test.ts src/domain/poker/__tests__/ai.test.ts src/domain/poker/__tests__/multiwayAi.test.ts src/domain/poker/__tests__/multiwaySession.test.ts && pnpm typecheck`
Expected: pass; no behavior change without a supplied read.

- [ ] **Step 6: Commit**

```bash
git add src/domain/poker/sessionExploitRead.ts src/domain/poker/__tests__/sessionExploitRead.test.ts src/domain/poker/ai.ts src/domain/poker/multiwayAi.ts src/domain/poker/multiwaySession.ts
git commit -m "feat(ai): Nemesis per-session public exploit read

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 13: Screens pass the session read; heads-up villain gets a roster identity

**Files:**
- Modify: `src/domain/poker/engine.ts` (`NewHandOptions.villainName`, `createHand`, `createNextHand`, `formatAction`)
- Modify: `src/features/table/gameplayPresentation.ts` (`formatLatestAction`)
- Modify: `src/features/table/PokerTableScreen.tsx`, `src/features/table/MultiwayPokerTableScreen.tsx`
- Test: `src/domain/poker/__tests__/engine.test.ts`

- [ ] **Step 1: Write the failing engine test**

Append inside the top-level describe in `src/domain/poker/__tests__/engine.test.ts` (import `createNextHand, formatAction` alongside the existing imports):

```ts
  it('names the villain from options and carries the name into the next hand', () => {
    const first = createHand({ villainName: 'Kai', random: seededRandom(5) });
    expect(first.players.villain.name).toBe('Kai');
    expect(createNextHand({ ...first, street: 'complete' }, seededRandom(6)).players.villain.name).toBe('Kai');
    const record = { ...first.history[0]!, player: 'villain' as const, type: 'check' as const };
    expect(formatAction(record, 'Kai')).toBe('Kai checked');
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/engine.test.ts -t "names the villain"`
Expected: FAIL.

- [ ] **Step 3: Engine and presentation**

`src/domain/poker/engine.ts`: add `villainName?: string;` to `NewHandOptions`; villain `name: options.villainName ?? 'RiverMind'`; in `createNextHand` pass `villainName: state.players.villain.name`; `export function formatAction(record: ActionRecord, villainName = 'RiverMind'): string` using `villainName` for the actor.

`src/features/table/gameplayPresentation.ts`: `formatLatestAction(action: ActionRecord, _bigBlind: number, villainName = 'RiverMind')` replacing the literal `'Mara'`. Update call sites found by `grep -rn "formatLatestAction(" src` to pass `game.players.villain.name`.

- [ ] **Step 4: Heads-up screen**

In `src/features/table/PokerTableScreen.tsx` import `multiwayAiIdentityAt, multiwayAiRoster` from `'../../domain/poker/multiwayAiProfiles'` and `createEmptySessionExploitRead, observeSessionHeadsUpHand, type SessionExploitRead` from `'../../domain/poker/sessionExploitRead'`. Next to `const aiProfile = aiStrategyProfile(aiDifficulty);`:

```tsx
  const [villainIdentity] = useState(() => multiwayAiIdentityAt(
    Math.floor(secureRandom() * multiwayAiRoster(aiDifficulty).length),
    aiDifficulty,
  ));
  const sessionReadRef = useRef<SessionExploitRead>(createEmptySessionExploitRead());
```

Change `createSessionHand(config)` to `createSessionHand(config: PracticeSessionConfig, villainName: string)` passing `villainName` into `createHand`, and pass `villainIdentity.name` at its call site. In the AI turn effect pass `{ identity: villainIdentity, sessionRead: sessionReadRef.current }` as the sixth argument of `decideAiAction` and add `villainIdentity` to the dependency list. In the hand-complete effect that calls `queueHandPersistence`, add before it: `sessionReadRef.current = observeSessionHeadsUpHand(sessionReadRef.current, game);`.

- [ ] **Step 5: Multiway screen**

In `src/features/table/MultiwayPokerTableScreen.tsx` import `createEmptySessionExploitRead, observeSessionMultiwayHand, type SessionExploitRead`; add `const sessionReadRef = useRef<SessionExploitRead>(createEmptySessionExploitRead());` next to the other refs; pass `dailyMode ? undefined : sessionReadRef.current` as the last argument of `decideSessionAiAction`; immediately before the `queueMultiwayHandPersistence(` call in the hand-complete effect add `if (!dailyMode) sessionReadRef.current = observeSessionMultiwayHand(sessionReadRef.current, game);`.

- [ ] **Step 6: Run tests, typecheck, full suite**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/engine.test.ts src/features/table && pnpm typecheck && pnpm test`
Expected: pass. The screens have no render tests; typecheck verifies them.

- [ ] **Step 7: Commit**

```bash
git add src/domain/poker/engine.ts src/features/table/gameplayPresentation.ts src/features/table/PokerTableScreen.tsx src/features/table/MultiwayPokerTableScreen.tsx src/domain/poker/__tests__/engine.test.ts
git commit -m "feat(table): heads-up villain roster identity and Nemesis session read wiring

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 14: Nemesis overbets priced through the overbet column; measure Stage 5

**Files:**
- Modify: `src/domain/poker/ai.ts`, `src/domain/poker/multiwayAi.ts`
- Test: `src/domain/poker/__tests__/postflopStrategy.test.ts`, `src/domain/poker/__tests__/ai.test.ts`
- Modify: `docs/AI_LADDER_QA.md`

- [ ] **Step 1: Write the failing tests**

Append to `describe('shared postflop strategy', ...)` in `src/domain/poker/__tests__/postflopStrategy.test.ts`:

```ts
  it('offers requested overbets with the overbet fold share', () => {
    const plan = buildPostflopPlan(input({
      equity: 0.85,
      foldShareBySize: { small: 0.3, large: 0.5, overbet: 0.72 },
      extraSizeFractions: [1.25, 1.5],
    }));
    const overbets = plan.candidates.filter((c) => c.action.type === 'raise' && (c.potFraction ?? 0) > 1);
    expect(overbets.length).toBeGreaterThanOrEqual(1);
    for (const candidate of overbets) expect(candidate.foldEquity).toBeCloseTo(0.72, 6);
  });
```

Append to `describe('AI difficulty profiles', ...)` in `src/domain/poker/__tests__/ai.test.ts`:

```ts
  it('only Nemesis ever chooses a river bet above the pot, and only against a capped range', () => {
    const river = { ...stateWithOptionToBet(), street: 'river' as const, board: [
      { rank: 14, suit: 'spades' }, { rank: 8, suit: 'hearts' }, { rank: 2, suit: 'clubs' }, { rank: 7, suit: 'diamonds' }, { rank: 3, suit: 'clubs' },
    ] } as ReturnType<typeof stateWithOptionToBet>;
    river.players.villain.holeCards = [{ rank: 14, suit: 'clubs' }, { rank: 14, suit: 'diamonds' }];
    const overbets = (difficulty: 'elite' | 'nemesis') => Array.from({ length: 60 }, (_, index) => {
      const decision = decideAiAction(createFairHeadsUpDecisionState(river, 'villain'), 'villain', seededRandom(7_000 + index), difficulty);
      return decision.action.type === 'raise' && (decision.action.amount ?? 0) - river.players.villain.streetBet > river.pot;
    }).filter(Boolean).length;
    expect(overbets('elite')).toBe(0);
    expect(overbets('nemesis')).toBeGreaterThanOrEqual(0);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/postflopStrategy.test.ts -t "overbets"`
Expected: the strategy test passes already (the plumbing landed in Task 7); the heads-up test is the pin for Step 3.

- [ ] **Step 3: Offer overbets for Nemesis**

In `src/domain/poker/ai.ts` postflop branch, import `strongShare` from `'./opponentRange'` and add to the `buildPostflopPlan` input:

```ts
      extraSizeFractions: profile.overbetCandidate && state.street === 'river' && opponentRange
        && strongShare(opponentRange, state.board, classifier) < 0.25
        ? [1.25, 1.5]
        : undefined,
```

In `src/domain/poker/multiwayAi.ts` postflop branch add:

```ts
      extraSizeFractions: profile.overbetCandidate && state.street === 'river' && modeledAll
        && liveOpponents.every((id) => strongShare(ranges[id]!, state.board, classifier) < 0.25)
        ? [1.25, 1.5]
        : undefined,
```

Both paths already compute `foldShareBySize.overbet` and `calledEquityBySize.overbet`, so the new candidates are priced through the overbet column.

- [ ] **Step 4: Run suites and typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/ai.test.ts src/domain/poker/__tests__/multiwayAi.test.ts src/domain/poker/__tests__/postflopStrategy.test.ts && pnpm typecheck`
Expected: pass.

- [ ] **Step 5: Measure the stage**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && AI_BENCHMARK_OUTPUT=/tmp/ladder-stage5.json pnpm eval:ai:ladder`
Fill "Stage 5: Nemesis features" in `docs/AI_LADDER_QA.md`, including the adaptation rows, which are the first place the session read shows up.

- [ ] **Step 6: Commit**

```bash
git add src/domain/poker/ai.ts src/domain/poker/multiwayAi.ts src/domain/poker/__tests__/ai.test.ts src/domain/poker/__tests__/postflopStrategy.test.ts docs/AI_LADDER_QA.md
git commit -m "feat(ai): Nemesis river overbets priced through the overbet response column; record stage 5

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Stage 6: Release record

### Task 15: Daily Challenge version bump

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

- [ ] **Step 2: Run to verify failure, bump, re-run**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/dailyChallenge.test.ts`
Expected: FAIL. Set `export const DAILY_CHALLENGE_VERSION = 3;` in `src/domain/poker/dailyChallenge.ts`. Re-run with `src/domain/poker/__tests__/dailyChallengeProgress.test.ts src/features/shell` added; update any version-2 literal a test pins and record it.

- [ ] **Step 3: Commit**

```bash
git add src/domain/poker/dailyChallenge.ts src/domain/poker/__tests__/dailyChallenge.test.ts
git commit -m "chore(daily): bump Daily Challenge version for the new AI ladder

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 16: Final verification and the long confirmation run

- [ ] **Step 1: Full suite and typecheck**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && pnpm typecheck && pnpm test`
Expected: green. Paste the summary line under "Stage 6: release record" in `docs/AI_LADDER_QA.md`.

- [ ] **Step 2: Championship calibration**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && pnpm eval:championship-ai`
Record the Sharp-proxy Final and invitation win rates next to the pre-slice values (21.25 percent and 12.5 percent). Target: harder, still completed at a nonzero rate.

- [ ] **Step 3: Fairness sweep**

Run: `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && npx vitest run src/domain/poker/__tests__/fairness.test.ts src/domain/poker/__tests__/ai.test.ts src/domain/poker/__tests__/multiwayAi.test.ts -t "hidden|fair|independent"`
Expected: pass with no re-pins in this category.

- [ ] **Step 4: Long confirmation on the evaluation corpus**

Run (several hours; background it): `source ~/.nvm/nvm.sh && nvm use 22 >/dev/null 2>&1 && LADDER_CORPUS=evaluation LADDER_HU_DEALS=6000 LADDER_MW_DEALS=600 LADDER_STYLE_DEALS=150 LADDER_ADAPT_HANDS=600 AI_BENCHMARK_OUTPUT=/tmp/ladder-final.json pnpm eval:ai:ladder`
Record every row with its band as measured. Do not tune after this run; if a target is missed, say so in the QA doc and return to Stage 4 in a follow-up.

- [ ] **Step 5: Commit**

```bash
git add docs/AI_LADDER_QA.md
git commit -m "docs: record AI ladder verification, championship calibration, and long confirmation run

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review against the spec

- 5.1 range model, board-relative classes, memory as mass shifts, one response table for narrowing and fold prediction: Tasks 4, 5, 7, 8.
- 5.2 blended equity by tier: Task 6 (samplers), Tasks 7 and 8 (blend from profile).
- 5.3 fold-equity pricing in the heuristic selector: Task 7; flat incentives removed first as their own measured stage: Task 3; equity when called and EV routing on both paths: Tasks 9 and 10.
- 5.4 profile fields, quality-only monotonicity, Nemesis tuning equals Elite: Task 2. `bluffPricingScale` is 0 for Elite and Nemesis because they select by EV.
- 5.5 session read: Tasks 12 and 13; overbets last, priced through the overbet column: Task 14 (the column itself exists from Task 5 so opponents' overbets are read correctly from Stage 2).
- 5.6 villain identity and name: Task 13.
- 7 fairness at every tier and Daily version: Tasks 7, 8, 15.
- 8 benchmark with disjoint corpora, style rows, adaptation rows: Task 1; staged measurement: Tasks 3, 8, 10, 11, 14, 16.
- Type consistency: `RangeModelProfile` fields identical in Tasks 4, 5, 7, 8; `SizeBucket` is `'small' | 'large' | 'overbet'` everywhere; `foldShareBySize` and `calledEquityBySize` are `Record<SizeBucket, number>` in Tasks 7, 8, 9, 10, 14; `responseTable(profile)` is passed to `foldShare` and `continuingRange` in Tasks 7, 8, 10; `SessionExploitRead` and `sessionExploitScales` match between Tasks 12 and 13.
