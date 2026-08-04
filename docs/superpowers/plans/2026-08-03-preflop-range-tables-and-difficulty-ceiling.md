# Preflop Range Tables + Difficulty Ceiling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 1-D `handScore`+threshold preflop model with explicit per-hand-class range tables (fixing "pots are almost never multiway"), then raise the AI's skill ceiling with river bluffs, an opponent-model bluff term, balanced sizing, true strategy mixing, and stronger adaptation.

**Architecture:** A new pure-data module `preflopRanges.ts` holds a range-notation parser plus banded frequency tables per (position × facing) context, with archetype/difficulty/size/overcall transforms applied as bounded frequency operations. `buildPreflopPlan` in `preflopStrategy.ts` keeps its exact public signature but routes all non-short-stack decisions through the tables; the coach, grader, trainer, and both AI engines pick the change up automatically. Phase 2 makes five local edits to `multiwayEquity.ts`, `postflopStrategy.ts`, `multiwaySession.ts`, and `opponentMemory.ts`.

**Tech Stack:** TypeScript (strict), vitest, no new dependencies. React Native app but all changes are in the pure-TS domain layer plus one screen wiring change.

## Global Constraints

- Node `>=22.19.0` required (package.json engines). The shell default may be Node 16 — run `node --version` first; if wrong, use `source ~/.nvm/nvm.sh && nvm use 22` (this worked in this repo before). pnpm is the package manager.
- Run tests with `npx vitest run <path>`; evals with `pnpm eval:multiway-ai`, `pnpm eval:ai`, `pnpm eval:championship-ai`.
- Work on a new branch `codex/preflop-range-tables` created from `master` (NOT from `codex/simplify-game-ui`).
- **Frozen public API** (other modules import these — signatures and semantics of existing fields must not change):
  - `buildPreflopPlan(input: PreflopRangeInput): PreflopPlan` — new input fields may be added ONLY as optional.
  - `selectPreflopAction(plan, mix, legal, sizing, difficulty?, adjustment?): PlayerAction`
  - `preferredPreflopRaiseTo(input: PreflopSizingInput): number` — new fields optional only.
  - `PreflopRangeCategory` must stay exactly `'raise' | 'continue' | 'mix' | 'fold'` — non-English locales render `t('range.explanation.${category}')` (see `src/features/learn/PreflopRangeExplorer.tsx:58-60`).
  - `PreflopPlan` existing fields (`category, explanation, frequencies, hand, jamPreferred, primaryAction, score, stackBand`) keep their types. `explanation` stays a human-readable English sentence (it renders verbatim in the coach UI at `src/features/table/liveCoach.ts:101` and `src/domain/poker/decisionGrading.ts:238`).
- Consumers of `buildPreflopPlan` that must keep passing their existing tests (they call with NO archetype, so the default path must stay a solid "balanced baseline"): `src/domain/poker/ai.ts`, `src/domain/poker/multiwayAi.ts`, `src/domain/poker/decisionGrading.ts`, `src/features/table/liveCoach.ts`, `src/features/learn/PreflopRangeExplorer.tsx`.
- When an existing test's pinned expectation changes because behavior intentionally changed, the new expectation must be justified from the range-table design (e.g. "22 now flats a CO open on the BTN by design"), never "whatever value the code now returns". Record every such change in `docs/PR48_AI_REALISM_QA.md`.
- Hand-class keys follow `classifyPreflopHand` (`preflopStrategy.ts:106`): pairs `"QQ"`, suited `"AKs"`, offsuit `"AKo"`, always high-card-first (`"T9s"`, never `"9Ts"`).
- Commit after every green test cycle. Commit messages: imperative mood, end body with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File Structure

| File | Role |
|---|---|
| `src/domain/poker/preflopRanges.ts` (create) | Range-notation parser, band tables (all contexts), archetype/tier profiles, transform helpers. Pure data + pure functions, no imports from multiway/engine. |
| `src/domain/poker/__tests__/preflopRanges.test.ts` (create) | Parser tests, table-width tests, transform tests. |
| `src/domain/poker/preflopStrategy.ts` (modify) | `buildPreflopPlan` rewired onto tables; legacy threshold/advanced/patch code deleted; tournament short-stack branches kept. |
| `src/domain/poker/multiwayAi.ts` (modify) | Pass `archetype` + `raiseCount` through. |
| `src/domain/poker/ai.ts` (modify) | Pass `archetype: 'balanced'`. |
| `src/domain/poker/multiwayAiSimulation.ts` (modify) | Flop-participation, walk, 3-bet, VPIP/PFR metrics. |
| `src/domain/poker/multiwayEquity.ts` (modify, P2) | Bluff allowance in opponent range inference. |
| `src/domain/poker/postflopStrategy.ts` (modify, P2) | Busted-draw river bluffs; bluff sizing mirrors value sizing. |
| `src/domain/poker/multiwaySession.ts` (modify, P2) | Salted decision RNG. |
| `src/domain/poker/opponentMemory.ts` (modify, P2) | Wider adaptation caps; correct multiway facing-bet observation. |
| `src/features/table/MultiwayPokerTableScreen.tsx` (modify, P2) | Pass per-session RNG salt. |
| `docs/PR48_AI_REALISM_QA.md` (create) | Baseline + final metrics, changed-expectation log. |

Execution order is Task 1 → 13. Tasks 8–12 (Phase 2) are independent of each other and may be done in any order after Task 7.

---

### Task 1: Flop-participation metrics in the simulation harness

The eval suite cannot currently see the tester-visible symptom (how many players reach the flop). Add the metrics FIRST so every later task is measured.

**Files:**
- Modify: `src/domain/poker/multiwayAiSimulation.ts`
- Modify: `src/domain/poker/__tests__/multiwayAi.test.ts`
- Create: `docs/PR48_AI_REALISM_QA.md`

**Interfaces:**
- Produces: `MultiwayAiSimulationMetrics` gains `flopsSeen: number`, `flopParticipantCounts: Record<number, number>`, `multiwayFlops: number`, `threeBetHands: number`, `flopRate: number`, `multiwayFlopRate: number`, `threeBetRate: number`; `MultiwayAiIdentitySimulationMetrics` gains `vpipOpportunities: number`, `vpipEntries: number`, `pfrEntries: number`. Tasks 7 and 13 assert against these exact names.

- [ ] **Step 1: Create the branch**

```bash
git checkout master && git pull && git checkout -b codex/preflop-range-tables
node --version   # must be >= 22; if not: source ~/.nvm/nvm.sh && nvm use 22
```

- [ ] **Step 2: Write the failing test**

Append to `src/domain/poker/__tests__/multiwayAi.test.ts` (inside the existing top-level `describe`; imports already include `simulateMultiwayAiTable`):

```ts
it('reports flop participation, three-bet, and preflop entry metrics', () => {
  const result = simulateMultiwayAiTable('club', 5, {
    hands: 160,
    heroStrategy: 'ai',
    seed: 90_210,
    samplesPerDecision: 24,
  });
  const participantTotal = Object.values(result.flopParticipantCounts)
    .reduce((sum, count) => sum + count, 0);
  expect(participantTotal).toBe(result.flopsSeen);
  expect(result.multiwayFlops).toBe(
    result.flopsSeen - (result.flopParticipantCounts[2] ?? 0),
  );
  expect(result.flopRate).toBeGreaterThan(0.2);
  expect(result.threeBetRate).toBeGreaterThanOrEqual(0);
  const iris = result.identityMetrics['iris-patient'];
  expect(iris).toBeDefined();
  expect(iris!.vpipOpportunities).toBeGreaterThan(0);
  expect(iris!.vpipEntries).toBeLessThanOrEqual(iris!.vpipOpportunities);
  expect(iris!.pfrEntries).toBeLessThanOrEqual(iris!.vpipEntries);
  if (process.env.PRINT_MULTIWAY_AI_METRICS === '1') {
    console.table({
      flopRate: result.flopRate,
      multiwayFlopRate: result.multiwayFlopRate,
      walkRate: result.walkRate,
      threeBetRate: result.threeBetRate,
      participants: JSON.stringify(result.flopParticipantCounts),
    });
  }
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `npx vitest run src/domain/poker/__tests__/multiwayAi.test.ts -t "flop participation"`
Expected: FAIL — `flopParticipantCounts` is undefined.

- [ ] **Step 4: Implement the metrics**

In `src/domain/poker/multiwayAiSimulation.ts`:

Add to `MultiwayAiSimulationMetrics` (after `walkRate: number;`):

```ts
  /** Hands in which a flop was dealt (including all-in runouts). */
  flopsSeen: number;
  /** Live (non-folded) player count when the flop appeared, e.g. {2: 71, 3: 24}. */
  flopParticipantCounts: Record<number, number>;
  /** Flops seen by three or more live players. */
  multiwayFlops: number;
  /** Hands containing two or more preflop raises. */
  threeBetHands: number;
  flopRate: number;
  multiwayFlopRate: number;
  threeBetRate: number;
```

Add to `MultiwayAiIdentitySimulationMetrics`:

```ts
  /** Hands in which this identity had a chance to voluntarily enter preflop. */
  vpipOpportunities: number;
  /** Hands in which it voluntarily called or raised preflop. */
  vpipEntries: number;
  /** Hands in which it raised preflop. */
  pfrEntries: number;
```

In `simulateMultiwayAiTable`, extend `counts` with `flopsSeen: 0, multiwayFlops: 0, threeBetHands: 0`, add `const flopParticipantCounts: Record<number, number> = {};` next to it, and add the three per-identity zeros to the `identityMetrics` initializer object.

Inside the per-hand loop, before the action loop, add per-hand trackers:

```ts
    const vpipOpportunitySeen = new Set<string>();
    const vpipSeen = new Set<string>();
    const pfrSeen = new Set<string>();
    let flopRecorded = false;
```

Inside the action loop, in the AI branch (after `identityMetric.decisions += 1;`), record preflop entry stats:

```ts
      if (state.street === 'preflop') {
        if (!vpipOpportunitySeen.has(playerId)) {
          vpipOpportunitySeen.add(playerId);
          identityMetric.vpipOpportunities += 1;
        }
        const voluntary = decision.action.type === 'call' || decision.action.type === 'raise';
        if (voluntary && !vpipSeen.has(playerId)) {
          vpipSeen.add(playerId);
          identityMetric.vpipEntries += 1;
        }
        if (decision.action.type === 'raise' && !pfrSeen.has(playerId)) {
          pfrSeen.add(playerId);
          identityMetric.pfrEntries += 1;
        }
      }
```

Note: the scripted-hero branch (`playerId === 'hero' && options.heroStrategy !== 'ai'`) applies its action with `continue`, so it never reaches this code — that is correct; scripted-hero actions must not pollute identity stats.

Detect the flop transition. Replace the plain `state = applyMultiwayAction(state, playerId, decision.action);` (both in the AI branch and the scripted-hero branch) with transition-aware application. Easiest: at the TOP of the action loop body add `const prevStreet = state.street;` and at the BOTTOM (after both apply paths — restructure so there is a single fall-through point, or duplicate the check in both branches) add:

```ts
      if (!flopRecorded && prevStreet === 'preflop' && state.street !== 'preflop' && state.board.length >= 3) {
        flopRecorded = true;
        const live = state.activePlayerIds
          .filter((id) => !state.players[id]?.folded).length;
        counts.flopsSeen += 1;
        flopParticipantCounts[live] = (flopParticipantCounts[live] ?? 0) + 1;
        if (live >= 3) counts.multiwayFlops += 1;
      }
```

(`board.length >= 3` distinguishes a real flop — including all-in runouts that jump straight to `complete` with a dealt board — from a preflop fold-out, where the board stays empty.)

After the hand completes (next to the existing `walks` logic):

```ts
    const preflopRaises = state.history
      .filter((action) => action.street === 'preflop' && action.type === 'raise').length;
    if (preflopRaises >= 2) counts.threeBetHands += 1;
```

In the returned object add:

```ts
    flopsSeen: counts.flopsSeen,
    flopParticipantCounts,
    multiwayFlops: counts.multiwayFlops,
    threeBetHands: counts.threeBetHands,
    flopRate: rate(counts.flopsSeen, counts.completedHands),
    multiwayFlopRate: rate(counts.multiwayFlops, counts.completedHands),
    threeBetRate: rate(counts.threeBetHands, counts.completedHands),
```

- [ ] **Step 5: Run the new test — PASS; run the whole file — PASS**

Run: `npx vitest run src/domain/poker/__tests__/multiwayAi.test.ts`
Expected: all tests pass (existing tests unaffected — only additive fields).

- [ ] **Step 6: Record the baseline**

Run: `pnpm eval:multiway-ai` and create `docs/PR48_AI_REALISM_QA.md`:

```markdown
# PR48 — AI Realism & Difficulty Ceiling QA

## Baseline (before range-table rewrite)

<paste the printed metric tables here, plus the flop-participation table>

Reference points measured earlier on this codebase (5-player all-AI, production
decision path): ~46-50% of hands ended preflop, 68-73% of flops heads-up,
multiway flops 13.4% (sharp) / 17.1% (club) / 17.2% (elite) of hands,
walk rate 13-15% (club/sharp), per-player fold-vs-open 50-66%.

## Intentional test-expectation changes

| Test | Old expectation | New expectation | Design reason |
|---|---|---|---|

## Final metrics

(filled by Task 13)
```

- [ ] **Step 7: Commit**

```bash
git add src/domain/poker/multiwayAiSimulation.ts src/domain/poker/__tests__/multiwayAi.test.ts docs/PR48_AI_REALISM_QA.md
git commit -m "Add flop-participation and preflop-entry metrics to AI simulation"
```

---

### Task 2: Range-notation parser (`preflopRanges.ts` foundation)

**Files:**
- Create: `src/domain/poker/preflopRanges.ts`
- Create: `src/domain/poker/__tests__/preflopRanges.test.ts`

**Interfaces:**
- Produces: `parseRangeSpec(spec: string): ReadonlySet<string>` — expands notation into hand-class keys matching `classifyPreflopHand().key`. Also exports `HAND_CLASS_KEYS: readonly string[]` (all 169 keys) and `combosForKey(key: string): number` (pair 6, suited 4, offsuit 12). Tasks 3–5 consume all three.

**Notation grammar (exact, keep deliberately small — connectors are always written out explicitly):**
- Tokens separated by commas; whitespace ignored.
- Pair: `88` · pair-plus: `88+` (88,99,TT,JJ,QQ,KK,AA) · pair-span: `88-55` (88,77,66,55).
- Suited/offsuit exact: `ATs`, `ATo`.
- Kicker-plus: `ATs+` = same high card, kicker up to one below the high card (ATs,AJs,AQs,AKs). `T8s+` = T8s,T9s.
- Kicker-span: `A5s-A2s` = A5s,A4s,A3s,A2s (same high card, descending kicker, inclusive; both ends must share high card and suffix).
- Anything else (e.g. `54s+`, mixed suffix spans, `72`) throws `Error('Unsupported range token: <token>')`.

- [ ] **Step 1: Write the failing tests**

`src/domain/poker/__tests__/preflopRanges.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { combosForKey, HAND_CLASS_KEYS, parseRangeSpec } from '../preflopRanges';

describe('parseRangeSpec', () => {
  it('expands pairs, pair-plus, and pair spans', () => {
    expect([...parseRangeSpec('88')]).toEqual(['88']);
    expect(parseRangeSpec('JJ+')).toEqual(new Set(['JJ', 'QQ', 'KK', 'AA']));
    expect(parseRangeSpec('88-55')).toEqual(new Set(['88', '77', '66', '55']));
  });

  it('expands kicker-plus and kicker spans', () => {
    expect(parseRangeSpec('ATs+')).toEqual(new Set(['ATs', 'AJs', 'AQs', 'AKs']));
    expect(parseRangeSpec('KTo+')).toEqual(new Set(['KTo', 'KJo', 'KQo']));
    expect(parseRangeSpec('A5s-A2s')).toEqual(new Set(['A5s', 'A4s', 'A3s', 'A2s']));
    expect(parseRangeSpec('T8s+')).toEqual(new Set(['T8s', 'T9s']));
  });

  it('merges comma lists and tolerates whitespace', () => {
    expect(parseRangeSpec('99+, ATs+ , KQo')).toEqual(
      new Set(['99', 'TT', 'JJ', 'QQ', 'KK', 'AA', 'ATs', 'AJs', 'AQs', 'AKs', 'KQo']),
    );
  });

  it('rejects malformed tokens', () => {
    for (const bad of ['54s+', '72', 'AKx', 'A5s-K2s', 'ATs-AJo', '']) {
      expect(() => parseRangeSpec(bad === '' ? ',' : bad)).toThrow(/Unsupported range token/);
    }
  });

  it('enumerates all 169 classes with correct combo counts', () => {
    expect(HAND_CLASS_KEYS).toHaveLength(169);
    const total = HAND_CLASS_KEYS.reduce((sum, key) => sum + combosForKey(key), 0);
    expect(total).toBe(1326);
    expect(combosForKey('AA')).toBe(6);
    expect(combosForKey('AKs')).toBe(4);
    expect(combosForKey('AKo')).toBe(12);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/domain/poker/__tests__/preflopRanges.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**

`src/domain/poker/preflopRanges.ts`:

```ts
import type { Rank } from './types';

const RANK_ORDER = '23456789TJQKA';

function rankIndex(char: string): number {
  const index = RANK_ORDER.indexOf(char);
  if (index < 0) throw new Error(`Unsupported range token: ${char}`);
  return index;
}

function rankChar(index: number): string {
  const char = RANK_ORDER[index];
  if (!char) throw new Error(`Rank index ${index} is out of bounds.`);
  return char;
}

export const HAND_CLASS_KEYS: readonly string[] = (() => {
  const keys: string[] = [];
  for (let high = RANK_ORDER.length - 1; high >= 0; high -= 1) {
    for (let low = high; low >= 0; low -= 1) {
      if (high === low) keys.push(`${rankChar(high)}${rankChar(low)}`);
      else keys.push(`${rankChar(high)}${rankChar(low)}s`, `${rankChar(high)}${rankChar(low)}o`);
    }
  }
  return keys;
})();

export function combosForKey(key: string): number {
  if (key.length === 2) return 6;
  return key.endsWith('s') ? 4 : 12;
}

const TOKEN_PATTERN = /^([2-9TJQKA])([2-9TJQKA])([so])?(\+)?(?:-([2-9TJQKA])([2-9TJQKA])([so])?)?$/;

/** Expands compact range notation ("JJ+, ATs+, A5s-A2s, KQo") into hand-class keys. */
export function parseRangeSpec(spec: string): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const raw of spec.split(',')) {
    const token = raw.replaceAll(/\s+/g, '');
    if (token.length === 0) throw new Error(`Unsupported range token: ${raw}`);
    const match = TOKEN_PATTERN.exec(token);
    if (!match) throw new Error(`Unsupported range token: ${token}`);
    const [, highChar, lowChar, suffix, plus, endHighChar, endLowChar, endSuffix] = match;
    const high = rankIndex(highChar!);
    const low = rankIndex(lowChar!);
    const pair = high === low;
    if (pair && suffix) throw new Error(`Unsupported range token: ${token}`);
    if (!pair && !suffix) throw new Error(`Unsupported range token: ${token}`);
    if (high < low) throw new Error(`Unsupported range token: ${token}`);
    if (plus && endHighChar) throw new Error(`Unsupported range token: ${token}`);

    if (endHighChar) {
      const endHigh = rankIndex(endHighChar);
      const endLow = rankIndex(endLowChar!);
      if (pair) {
        if (endHigh !== endLow || endHigh > high) throw new Error(`Unsupported range token: ${token}`);
        for (let rank = high; rank >= endHigh; rank -= 1) keys.add(`${rankChar(rank)}${rankChar(rank)}`);
      } else {
        if (endHigh !== high || endSuffix !== suffix || endLow > low) {
          throw new Error(`Unsupported range token: ${token}`);
        }
        for (let kicker = low; kicker >= endLow; kicker -= 1) {
          keys.add(`${rankChar(high)}${rankChar(kicker)}${suffix}`);
        }
      }
    } else if (plus) {
      if (pair) {
        for (let rank = high; rank < RANK_ORDER.length; rank += 1) keys.add(`${rankChar(rank)}${rankChar(rank)}`);
      } else {
        // Connectors ("54s+") are ambiguous notation in the wild (kicker-run vs
        // connector-run) — force table authors to list them explicitly.
        if (high - low === 1) throw new Error(`Unsupported range token: ${token}`);
        for (let kicker = low; kicker < high; kicker += 1) keys.add(`${rankChar(high)}${rankChar(kicker)}${suffix}`);
      }
    } else {
      keys.add(pair ? `${rankChar(high)}${rankChar(low)}` : `${rankChar(high)}${rankChar(low)}${suffix}`);
    }
  }
  return keys;
}
```

(Note `Rank` import is unused so omit it — shown here only to flag that this module must NOT import from `multiway.ts`/`engine.ts`; it may import types from `./types` if needed later.)

- [ ] **Step 4: Run tests — PASS.** `npx vitest run src/domain/poker/__tests__/preflopRanges.test.ts`

- [ ] **Step 5: Commit** — `git add -A && git commit -m "Add preflop range notation parser"`

---

### Task 3: RFI (first-in) range tables

**Files:**
- Modify: `src/domain/poker/preflopRanges.ts`
- Modify: `src/domain/poker/__tests__/preflopRanges.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 4–6):

```ts
export interface RangeBand {
  /** parseRangeSpec notation. Bands are evaluated in order; first match wins. */
  hands: string;
  raise: number;
  call: number;   // unopened: open-limp; facing raise: flat call; limped: over-limp
  wide?: boolean; // scaled by archetype wideScale and tier wideScale
}
export interface CompiledRangeTable {
  bands: readonly { hands: ReadonlySet<string>; raise: number; call: number; wide: boolean }[];
}
export function compileTable(bands: readonly RangeBand[]): CompiledRangeTable;
export function lookupBand(table: CompiledRangeTable, key: string):
  { raise: number; call: number; wide: boolean } | null;
export function tableWidth(table: CompiledRangeTable): number; // combo-weighted Σ min(1, raise+call) / 1326
export function rfiTable(position: TablePosition): CompiledRangeTable; // throws for 'BB'
```

`TablePosition` is imported as a type from `./multiway` (`'UTG' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB' | 'BTN/SB'`) — type-only import keeps the module cycle-free (multiway.ts does not import preflopRanges.ts).

- [ ] **Step 1: Write the failing tests**

Append to `preflopRanges.test.ts`:

```ts
import { compileTable, lookupBand, rfiTable, tableWidth } from '../preflopRanges';

describe('RFI tables', () => {
  it('produces realistic opening widths per position', () => {
    // Fractions of all 1326 combos entered (frequency-weighted raise+call).
    // Brackets are calibrated to the authored tables below (rough combo math),
    // slightly wider than real-game norms to leave tuning room.
    expect(tableWidth(rfiTable('UTG'))).toBeGreaterThan(0.1);
    expect(tableWidth(rfiTable('UTG'))).toBeLessThan(0.2);
    expect(tableWidth(rfiTable('HJ'))).toBeGreaterThan(0.14);
    expect(tableWidth(rfiTable('HJ'))).toBeLessThan(0.24);
    expect(tableWidth(rfiTable('CO'))).toBeGreaterThan(0.22);
    expect(tableWidth(rfiTable('CO'))).toBeLessThan(0.33);
    expect(tableWidth(rfiTable('BTN'))).toBeGreaterThan(0.35);
    expect(tableWidth(rfiTable('BTN'))).toBeLessThan(0.48);
    expect(tableWidth(rfiTable('SB'))).toBeGreaterThan(0.32);
    expect(tableWidth(rfiTable('SB'))).toBeLessThan(0.48);
    expect(tableWidth(rfiTable('BTN/SB'))).toBeGreaterThan(0.55);
    expect(tableWidth(rfiTable('BTN/SB'))).toBeLessThan(0.8);
  });

  it('orders positions monotonically and never opens trash from early seats', () => {
    expect(tableWidth(rfiTable('UTG'))).toBeLessThan(tableWidth(rfiTable('HJ')));
    expect(tableWidth(rfiTable('HJ'))).toBeLessThan(tableWidth(rfiTable('CO')));
    expect(tableWidth(rfiTable('CO'))).toBeLessThan(tableWidth(rfiTable('BTN')));
    for (const position of ['UTG', 'HJ', 'CO', 'BTN', 'SB'] as const) {
      expect(lookupBand(rfiTable(position), '72o')).toBeNull();
      expect(lookupBand(rfiTable(position), 'AA')!.raise).toBeGreaterThanOrEqual(0.85);
    }
  });

  it('opens every pocket pair from the button and lets the SB limp', () => {
    for (const pairKey of ['22', '55', '99', 'QQ'] as const) {
      expect(lookupBand(rfiTable('BTN'), pairKey)).not.toBeNull();
    }
    const sbWide = lookupBand(rfiTable('SB'), '98o');
    expect(sbWide).not.toBeNull();
    expect(sbWide!.call).toBeGreaterThan(0.2); // SB open-limps its wide band
  });

  it('rejects a BB first-in table', () => {
    expect(() => rfiTable('BB')).toThrow();
  });
});
```

- [ ] **Step 2: Run — FAIL** (exports missing).

- [ ] **Step 3: Implement tables and helpers**

Append to `preflopRanges.ts`:

```ts
import type { TablePosition } from './multiway';

export interface RangeBand {
  hands: string;
  raise: number;
  call: number;
  wide?: boolean;
}

interface CompiledBand {
  hands: ReadonlySet<string>;
  raise: number;
  call: number;
  wide: boolean;
}

export interface CompiledRangeTable {
  bands: readonly CompiledBand[];
}

export function compileTable(bands: readonly RangeBand[]): CompiledRangeTable {
  return {
    bands: bands.map((band) => ({
      hands: parseRangeSpec(band.hands),
      raise: band.raise,
      call: band.call,
      wide: band.wide ?? false,
    })),
  };
}

export function lookupBand(
  table: CompiledRangeTable,
  key: string,
): { raise: number; call: number; wide: boolean } | null {
  for (const band of table.bands) {
    if (band.hands.has(key)) return { raise: band.raise, call: band.call, wide: band.wide };
  }
  return null;
}

export function tableWidth(table: CompiledRangeTable): number {
  let entered = 0;
  for (const key of HAND_CLASS_KEYS) {
    const band = lookupBand(table, key);
    if (!band) continue;
    entered += combosForKey(key) * Math.min(1, band.raise + band.call);
  }
  return entered / 1326;
}

const RFI_TABLES: Partial<Record<TablePosition, CompiledRangeTable>> = {
  UTG: compileTable([
    { hands: '77+, ATs+, KJs+, QJs, JTs, T9s, 98s, AJo+, KQo', raise: 0.95, call: 0 },
    { hands: '66-22, A9s-A2s, KTs, K9s, QTs, J9s, 87s, 76s, ATo, KJo', raise: 0.32, call: 0, wide: true },
  ]),
  HJ: compileTable([
    { hands: '66+, A9s+, KTs+, QTs+, JTs, T9s, 98s, 87s, ATo+, KJo+, QJo', raise: 0.95, call: 0 },
    { hands: '55-22, A8s-A2s, K9s, Q9s, J9s, T8s, 76s, 65s, A9o, KTo, QTo', raise: 0.35, call: 0, wide: true },
  ]),
  CO: compileTable([
    { hands: '55+, A2s+, K9s+, Q9s+, J9s+, T8s+, 98s, 87s, 76s, A9o+, KTo+, QTo+, JTo', raise: 0.95, call: 0 },
    { hands: '44-22, K8s-K5s, Q8s, T7s, 97s, 86s, 65s, 54s, A8o-A5o, K9o, Q9o, J9o, T9o', raise: 0.4, call: 0, wide: true },
  ]),
  BTN: compileTable([
    { hands: '22+, A2s+, K5s+, Q7s+, J8s+, T8s+, 97s+, 86s+, 76s, 65s, 54s, A4o+, K9o+, Q9o+, J9o+, T9o', raise: 0.95, call: 0 },
    { hands: 'K4s-K2s, Q6s-Q4s, J7s, T7s, 96s, 85s, 75s, 64s, 53s, A3o-A2o, K8o, Q8o, J8o, T8o, 98o, 87o', raise: 0.45, call: 0, wide: true },
  ]),
  SB: compileTable([
    { hands: '22+, A2s+, K6s+, Q8s+, J8s+, T8s+, 97s+, 87s, 76s, 65s, A7o+, KTo+, QTo+, JTo', raise: 0.85, call: 0.12 },
    { hands: 'K5s-K2s, Q7s-Q4s, J7s, T7s, 96s, 86s, 75s, 54s, A6o-A2o, K9o, Q9o, J9o, T9o, 98o', raise: 0.3, call: 0.35, wide: true },
  ]),
  'BTN/SB': compileTable([
    { hands: '22+, A2s+, K2s+, Q2s+, J4s+, T6s+, 96s+, 86s+, 75s+, 65s, 54s, A2o+, K5o+, Q8o+, J8o+, T8o+, 98o', raise: 0.85, call: 0.12 },
    { hands: 'J3s-J2s, T5s-T2s, 95s-92s, 85s-82s, 74s, 64s, 53s, 43s, K4o-K2o, Q7o-Q2o, J7o-J5o, T7o, 97o, 87o, 76o, 65o', raise: 0.35, call: 0.4, wide: true },
  ]),
};

export function rfiTable(position: TablePosition): CompiledRangeTable {
  const table = RFI_TABLES[position];
  if (!table) throw new Error(`No first-in range table exists for ${position}.`);
  return table;
}
```

- [ ] **Step 4: Run tests.** If a width assertion fails, adjust that table's *wide band* frequency (±0.1) or add/remove the weakest hands from the wide band until inside the bracket — do not touch the core band. Then: PASS.

- [ ] **Step 5: Commit** — `git commit -am "Add first-in preflop range tables"`

---

### Task 4: Defense tables (vs open, vs 3-bet/4-bet) with size & overcall adjustments

**Files:**
- Modify: `src/domain/poker/preflopRanges.ts`
- Modify: `src/domain/poker/__tests__/preflopRanges.test.ts`

**Interfaces:**
- Produces (consumed by Task 6):

```ts
export type RaiserBucket = 'early' | 'late';
export function raiserBucket(position: TablePosition | undefined): RaiserBucket; // UTG,HJ → 'early'; CO,BTN,SB,BTN/SB,BB,undefined → 'late'
export function defenseTable(position: TablePosition, raiser: RaiserBucket): CompiledRangeTable;
export function vsThreeBetTable(): CompiledRangeTable;
export function vsFourBetTable(): CompiledRangeTable;
export interface BandFrequencies { raise: number; call: number; wide: boolean }
export function applyOpenSizeScale(band: BandFrequencies, raiseSizeBb: number | undefined): BandFrequencies;
export function applyOvercallAdjustment(band: BandFrequencies, key: string, callersAfterRaise: number): BandFrequencies;
```

- [ ] **Step 1: Write the failing tests**

Append to `preflopRanges.test.ts`:

```ts
import {
  applyOpenSizeScale, applyOvercallAdjustment, defenseTable,
  raiserBucket, vsFourBetTable, vsThreeBetTable,
} from '../preflopRanges';

describe('defense tables', () => {
  it('defends the BB widest against late opens', () => {
    const bbLate = tableWidth(defenseTable('BB', 'late'));
    const bbEarly = tableWidth(defenseTable('BB', 'early'));
    expect(bbLate).toBeGreaterThan(0.42);
    expect(bbLate).toBeLessThan(0.62);
    expect(bbEarly).toBeGreaterThan(0.25);
    expect(bbEarly).toBeLessThan(bbLate);
  });

  it('gives in-position seats a real cold-calling range including set-mining pairs', () => {
    const ipEarly = defenseTable('BTN', 'early');
    for (const pairKey of ['22', '55', '88'] as const) {
      const band = lookupBand(ipEarly, pairKey);
      expect(band).not.toBeNull();
      expect(band!.call).toBeGreaterThanOrEqual(0.5);
    }
    expect(tableWidth(ipEarly)).toBeGreaterThan(0.1);
    expect(tableWidth(ipEarly)).toBeLessThan(0.2);
  });

  it('keeps 3-bets premium-weighted but not dominant', () => {
    const bbLate = defenseTable('BB', 'late');
    expect(lookupBand(bbLate, 'AA')!.raise).toBeGreaterThan(0.5);
    expect(lookupBand(bbLate, '76s')!.raise).toBeLessThan(0.25);
    // Combo-weighted 3-bet share of the whole deal must be modest.
    let threeBet = 0;
    for (const key of HAND_CLASS_KEYS) {
      const band = lookupBand(bbLate, key);
      if (band) threeBet += combosForKey(key) * band.raise;
    }
    expect(threeBet / 1326).toBeGreaterThan(0.04);
    expect(threeBet / 1326).toBeLessThan(0.13);
  });

  it('continues narrow and strong versus 3-bets and 4-bets', () => {
    expect(tableWidth(vsThreeBetTable())).toBeGreaterThan(0.08);
    expect(tableWidth(vsThreeBetTable())).toBeLessThan(0.2);
    expect(tableWidth(vsFourBetTable())).toBeLessThan(0.06);
    expect(lookupBand(vsThreeBetTable(), 'AA')!.raise).toBeGreaterThan(0.5);
  });

  it('buckets raiser positions', () => {
    expect(raiserBucket('UTG')).toBe('early');
    expect(raiserBucket('HJ')).toBe('early');
    expect(raiserBucket('CO')).toBe('late');
    expect(raiserBucket('BTN/SB')).toBe('late');
    expect(raiserBucket(undefined)).toBe('late');
  });
});

describe('defense adjustments', () => {
  const band = { raise: 0.1, call: 0.6, wide: false };

  it('softens instead of cliffs against larger opens', () => {
    const vs25 = applyOpenSizeScale(band, 2.5);
    const vs4 = applyOpenSizeScale(band, 4);
    const vs5 = applyOpenSizeScale(band, 5);
    expect(vs25.call).toBeCloseTo(0.6, 5);
    expect(vs4.call).toBeLessThan(vs25.call);
    expect(vs5.call).toBeLessThan(vs4.call);
    expect(vs5.call).toBeGreaterThan(0.32); // no collapse to near-zero
    const vs2 = applyOpenSizeScale(band, 2);
    expect(vs2.call).toBeGreaterThan(vs25.call); // min-raises get defended MORE
  });

  it('loosens pot-odds hands and tightens dominated hands as callers pile in', () => {
    const pairNoCallers = applyOvercallAdjustment(band, '55', 0);
    const pairTwoCallers = applyOvercallAdjustment(band, '55', 2);
    expect(pairTwoCallers.call).toBeGreaterThan(pairNoCallers.call);
    const offsuitTwoCallers = applyOvercallAdjustment(band, 'KJo', 2);
    expect(offsuitTwoCallers.call).toBeLessThan(band.call);
    const suitedTwoCallers = applyOvercallAdjustment(band, '87s', 2);
    expect(suitedTwoCallers.call).toBeGreaterThan(band.call);
    expect(pairTwoCallers.raise).toBeLessThan(band.raise); // squeeze less into crowds
  });
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement**

Append to `preflopRanges.ts`:

```ts
export type RaiserBucket = 'early' | 'late';

export function raiserBucket(position: TablePosition | undefined): RaiserBucket {
  return position === 'UTG' || position === 'HJ' ? 'early' : 'late';
}

const BB_VS_LATE = compileTable([
  { hands: 'JJ+, AQs+, AKo', raise: 0.7, call: 0.3 },
  { hands: 'TT-99, AJs, ATs, KQs, KJs, QJs, JTs, AQo', raise: 0.25, call: 0.7 },
  { hands: 'A5s-A2s, K9s, Q9s, J9s, T8s, 97s, 86s, 75s, 65s, 54s', raise: 0.2, call: 0.6 },
  { hands: '88-22, A9s-A6s, K8s-K2s, Q8s-Q4s, J8s, T9s, 98s, 87s, 76s, 64s, 53s, 43s, ATo+, KTo+, QTo+, JTo, T9o, 98o', raise: 0.04, call: 0.75 },
  { hands: 'A9o-A2o, K9o, Q9o, J9o, T8o, 97o, 87o, 76o, 65o, J7s, T7s, T6s, 96s, 85s, 74s, 63s', raise: 0.02, call: 0.45, wide: true },
  // Pot-odds junk defenses: the BB closes the action getting a big price, so
  // even weak offsuit hands continue at a low frequency against a normal open.
  { hands: 'K8o-K2o, Q8o-Q2o, J8o-J2o, T7o-T2o, 96o-92o, 86o-82o, 75o-72o, 64o-62o, 54o-52o, 43o-42o, 32o, J6s-J2s, T5s-T2s, 95s-92s, 84s-82s, 73s-72s, 62s, 52s, 42s, 32s', raise: 0, call: 0.24, wide: true },
]);

const BB_VS_EARLY = compileTable([
  { hands: 'QQ+, AKs, AKo', raise: 0.6, call: 0.4 },
  { hands: 'JJ-99, AQs, AJs, KQs, AQo', raise: 0.2, call: 0.75 },
  { hands: '88-22, ATs-A2s, KJs-K9s, QTs+, JTs, T9s, 98s, 87s, 76s, 65s, 54s, AJo, KQo', raise: 0.04, call: 0.66 },
  { hands: 'ATo-A8o, KJo, QJo, JTo, K8s-K6s, Q9s, J9s, T8s, 97s, 86s, 75s', raise: 0.02, call: 0.35, wide: true },
  { hands: 'A7o-A2o, KTo, K9o, QTo, T9o, 98o, 87o, K5s-K2s, Q8s-Q5s, J8s, 64s, 53s', raise: 0, call: 0.16, wide: true },
]);

const SB_VS_EARLY = compileTable([
  { hands: 'QQ+, AKs, AKo', raise: 0.75, call: 0.25 },
  { hands: 'JJ-TT, AQs, AJs, KQs, AQo', raise: 0.45, call: 0.5 },
  { hands: '99-55, ATs, KJs, QJs, JTs, T9s, 98s, AJo', raise: 0.12, call: 0.5 },
  { hands: '44-22, A9s-A5s, KTs, QTs, 87s, 76s, KQo', raise: 0.06, call: 0.25, wide: true },
]);

const SB_VS_LATE = compileTable([
  { hands: 'TT+, AQs+, AQo+', raise: 0.7, call: 0.3 },
  { hands: '99-77, AJs, ATs, KQs, KJs, QJs, JTs, AJo, KQo', raise: 0.3, call: 0.55 },
  { hands: '66-22, A9s-A2s, KTs, QTs, J9s+, T9s, 98s, 87s, 76s, 65s, ATo, KJo', raise: 0.1, call: 0.42 },
  { hands: 'A9o-A7o, KTo, QTo, JTo, K9s, Q9s, T8s, 97s, 54s', raise: 0.08, call: 0.28, wide: true },
]);

const IP_VS_EARLY = compileTable([
  { hands: 'QQ+, AKs, AKo', raise: 0.65, call: 0.35 },
  { hands: 'JJ-TT, AQs, AQo', raise: 0.25, call: 0.7 },
  { hands: '99-22, AJs, ATs, KQs, KJs, QJs, JTs, T9s, 98s', raise: 0.05, call: 0.6 },
  { hands: 'A5s-A2s, AJo, KQo, QTs, J9s, 87s, 76s, 65s', raise: 0.08, call: 0.25, wide: true },
]);

const IP_VS_LATE = compileTable([
  { hands: 'JJ+, AQs+, AKo', raise: 0.7, call: 0.3 },
  { hands: 'TT-88, AJs, ATs, KQs, KJs, QJs, JTs, AQo', raise: 0.3, call: 0.6 },
  { hands: '77-22, A9s-A2s, KTs, QTs, T9s, 98s, 87s, 76s, 65s, AJo, ATo, KQo, KJo', raise: 0.08, call: 0.45 },
  { hands: '54s, J9s, T8s, 97s, QJo, JTo', raise: 0.06, call: 0.28, wide: true },
]);

const VS_THREE_BET = compileTable([
  { hands: 'KK+, AKs', raise: 0.75, call: 0.25 },
  { hands: 'QQ, JJ, AKo, AQs', raise: 0.3, call: 0.6 },
  { hands: 'TT-88, AJs, ATs, KQs, A5s-A4s, QJs, JTs, T9s', raise: 0.08, call: 0.45 },
  { hands: '77-22, KJs, QTs, 98s, 87s, AQo', raise: 0.03, call: 0.25, wide: true },
]);

const VS_FOUR_BET = compileTable([
  { hands: 'KK+, AKs', raise: 0.6, call: 0.4 },
  { hands: 'QQ, AKo', raise: 0.25, call: 0.45 },
  { hands: 'JJ, AQs, A5s', raise: 0.08, call: 0.2 },
]);

export function defenseTable(position: TablePosition, raiser: RaiserBucket): CompiledRangeTable {
  if (position === 'BB') return raiser === 'early' ? BB_VS_EARLY : BB_VS_LATE;
  if (position === 'SB' || position === 'BTN/SB') return raiser === 'early' ? SB_VS_EARLY : SB_VS_LATE;
  return raiser === 'early' ? IP_VS_EARLY : IP_VS_LATE;
}

export function vsThreeBetTable(): CompiledRangeTable { return VS_THREE_BET; }
export function vsFourBetTable(): CompiledRangeTable { return VS_FOUR_BET; }

export interface BandFrequencies { raise: number; call: number; wide: boolean }

function clampFrequency(value: number): number {
  return Math.max(0, Math.min(0.98, value));
}

/** Price-aware defense: shrink continues smoothly as the open grows, expand vs min-raises. */
export function applyOpenSizeScale(
  band: BandFrequencies,
  raiseSizeBb: number | undefined,
): BandFrequencies {
  const size = Math.max(2, Math.min(6, raiseSizeBb ?? 2.5));
  const callScale = Math.pow(2.5 / size, 0.5);
  const raiseScale = Math.pow(2.5 / size, 0.25);
  return {
    raise: clampFrequency(band.raise * raiseScale),
    call: clampFrequency(band.call * callScale),
    wide: band.wide,
  };
}

/** Overcalls: pot odds and multiway playability loosen pairs/suited hands, tighten offsuit. */
export function applyOvercallAdjustment(
  band: BandFrequencies,
  key: string,
  callersAfterRaise: number,
): BandFrequencies {
  if (callersAfterRaise <= 0) return band;
  const pair = key.length === 2;
  const suited = key.endsWith('s');
  const perCaller = pair || suited ? 1.15 : 0.85;
  const callScale = Math.min(1.35, Math.pow(perCaller, callersAfterRaise));
  const raiseScale = Math.pow(0.9, callersAfterRaise);
  return {
    raise: clampFrequency(band.raise * raiseScale),
    call: clampFrequency(band.call * callScale),
    wide: band.wide,
  };
}
```

- [ ] **Step 4: Run tests.** Same tuning rule as Task 3 (adjust wide bands only) if a width bracket fails. Then PASS.

- [ ] **Step 5: Commit** — `git commit -am "Add preflop defense range tables and price/overcall adjustments"`

---

### Task 5: Limped-pot tables, archetype profiles, and tier transforms

**Files:**
- Modify: `src/domain/poker/preflopRanges.ts`
- Modify: `src/domain/poker/__tests__/preflopRanges.test.ts`

**Interfaces:**
- Produces (consumed by Task 6):

```ts
export function limpedTable(position: TablePosition): CompiledRangeTable; // iso-raise + over-limp
export type PreflopArchetype = 'balanced' | 'patient' | 'pressure' | 'sticky' | 'deceptive';
export interface PreflopContext { facing: 'unopened' | 'limped' | 'raised' }
export function applyArchetype(band: BandFrequencies, archetype: PreflopArchetype | undefined, facing: PreflopContext['facing']): BandFrequencies;
export function applyTier(band: BandFrequencies, tier: AiDifficulty | undefined): BandFrequencies;
export function applyShortStack(band: BandFrequencies, key: string, stackBand: 'short' | 'medium' | 'deep'): BandFrequencies;
```

`AiDifficulty` is a type-only import from `./aiProfiles` (`'friendly' | 'club' | 'sharp' | 'elite' | 'nemesis'`).

- [ ] **Step 1: Write the failing tests**

```ts
import {
  applyArchetype, applyShortStack, applyTier, limpedTable,
} from '../preflopRanges';

describe('limped-pot tables', () => {
  it('lets any position over-limp playable hands and iso-raise strong ones', () => {
    const table = limpedTable('CO');
    expect(lookupBand(table, 'AA')!.raise).toBeGreaterThan(0.8);
    const smallPair = lookupBand(table, '44');
    expect(smallPair).not.toBeNull();
    expect(smallPair!.call).toBeGreaterThan(0.4);
    const suitedConnector = lookupBand(table, '76s');
    expect(suitedConnector).not.toBeNull();
    expect(suitedConnector!.call).toBeGreaterThan(0.4);
  });
});

describe('archetype and tier transforms', () => {
  const band = { raise: 0.3, call: 0.4, wide: false };
  const wideBand = { raise: 0.2, call: 0.3, wide: true };

  it('separates sticky and patient by a wide margin', () => {
    const sticky = applyArchetype(wideBand, 'sticky', 'raised');
    const patient = applyArchetype(wideBand, 'patient', 'raised');
    expect(sticky.call).toBeGreaterThan(patient.call * 2);
    expect(sticky.raise).toBeLessThan(applyArchetype(wideBand, 'pressure', 'raised').raise);
  });

  it('scales three-bets for pressure and limps for sticky', () => {
    expect(applyArchetype(band, 'pressure', 'raised').raise).toBeGreaterThan(band.raise);
    expect(applyArchetype(band, 'sticky', 'raised').raise).toBeLessThan(band.raise);
    expect(applyArchetype(band, 'sticky', 'unopened').call).toBeGreaterThan(band.call);
    expect(applyArchetype(band, undefined, 'raised')).toEqual(band);
  });

  it('caps combined frequency at 0.98', () => {
    const loose = applyArchetype({ raise: 0.5, call: 0.6, wide: true }, 'sticky', 'raised');
    expect(loose.raise + loose.call).toBeLessThanOrEqual(0.98);
  });

  it('makes friendly passive-loose and elite disciplined', () => {
    const friendly = applyTier(wideBand, 'friendly');
    const elite = applyTier(wideBand, 'elite');
    expect(friendly.call).toBeGreaterThan(wideBand.call);       // raise mass shifts to call
    expect(friendly.raise).toBeLessThan(wideBand.raise);
    expect(elite.call + elite.raise).toBeLessThan(wideBand.call + wideBand.raise); // wide bands trimmed
    expect(applyTier(band, 'club')).toEqual(band);
  });

  it('tightens speculative hands when short-stacked', () => {
    const short = applyShortStack({ raise: 0.2, call: 0.5, wide: true }, '76s', 'short');
    expect(short.call).toBeLessThan(0.5 * 0.7);
    const pairShort = applyShortStack({ raise: 0.2, call: 0.5, wide: false }, '77', 'short');
    expect(pairShort.call).toBeGreaterThan(0.3); // pairs keep most of their value shoving/calling
    expect(applyShortStack({ raise: 0.2, call: 0.5, wide: false }, '76s', 'deep').call).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement**

Append to `preflopRanges.ts`:

```ts
import type { AiDifficulty } from './aiProfiles';

const OVERLIMP_EXTRA: RangeBand = {
  hands: '88-22, A9s-A2s, KTs-K8s, QTs-Q9s, J9s+, T8s+, 97s+, 87s, 76s, 65s, 54s, ATo, KJo, QJo, JTo',
  raise: 0.08,
  call: 0.6,
};

const LIMPED_TABLES = new Map<TablePosition, CompiledRangeTable>();

/** Facing limpers: iso-raise with the position's opening range, over-limp playable hands. */
export function limpedTable(position: TablePosition): CompiledRangeTable {
  const cached = LIMPED_TABLES.get(position);
  if (cached) return cached;
  const base = position === 'BB' ? rfiTable('BTN') : rfiTable(position);
  const table: CompiledRangeTable = {
    bands: [...base.bands, ...compileTable([OVERLIMP_EXTRA]).bands],
  };
  LIMPED_TABLES.set(position, table);
  return table;
}

export type PreflopArchetype = 'balanced' | 'patient' | 'pressure' | 'sticky' | 'deceptive';

interface ArchetypePreflopProfile {
  raiseScale: number;
  callScale: number;
  wideScale: number;
  threeBetScale: number;
  limpScale: number;
}

const ARCHETYPE_PREFLOP: Record<PreflopArchetype, ArchetypePreflopProfile> = {
  balanced: { raiseScale: 1, callScale: 1, wideScale: 1, threeBetScale: 1, limpScale: 1 },
  patient: { raiseScale: 0.95, callScale: 0.85, wideScale: 0.4, threeBetScale: 0.85, limpScale: 0.6 },
  pressure: { raiseScale: 1.2, callScale: 0.9, wideScale: 1.5, threeBetScale: 1.45, limpScale: 0.5 },
  sticky: { raiseScale: 0.8, callScale: 1.45, wideScale: 1.7, threeBetScale: 0.6, limpScale: 2 },
  deceptive: { raiseScale: 1, callScale: 1.1, wideScale: 1.1, threeBetScale: 1.1, limpScale: 1.4 },
};

function capPair(raise: number, call: number, wide: boolean): BandFrequencies {
  const total = raise + call;
  if (total <= 0.98) return { raise, call, wide };
  const scale = 0.98 / total;
  return { raise: raise * scale, call: call * scale, wide };
}

export function applyArchetype(
  band: BandFrequencies,
  archetype: PreflopArchetype | undefined,
  facing: 'unopened' | 'limped' | 'raised',
): BandFrequencies {
  if (!archetype || archetype === 'balanced') return band;
  const profile = ARCHETYPE_PREFLOP[archetype];
  const wideFactor = band.wide ? profile.wideScale : 1;
  const raise = band.raise * profile.raiseScale * wideFactor
    * (facing === 'raised' ? profile.threeBetScale : 1);
  const call = band.call * profile.callScale * wideFactor
    * (facing === 'raised' ? 1 : profile.limpScale);
  return capPair(clampFrequency(raise), clampFrequency(call), band.wide);
}

interface TierPreflopProfile {
  raiseToCallShift: number;
  wideScale: number;
  raiseScale: number;
}

const TIER_PREFLOP: Record<AiDifficulty, TierPreflopProfile> = {
  friendly: { raiseToCallShift: 0.3, wideScale: 1.35, raiseScale: 0.85 },
  club: { raiseToCallShift: 0, wideScale: 1, raiseScale: 1 },
  sharp: { raiseToCallShift: 0, wideScale: 0.8, raiseScale: 1.05 },
  elite: { raiseToCallShift: 0, wideScale: 0.65, raiseScale: 1.08 },
  nemesis: { raiseToCallShift: 0, wideScale: 0.6, raiseScale: 1.1 },
};

export function applyTier(band: BandFrequencies, tier: AiDifficulty | undefined): BandFrequencies {
  if (!tier || tier === 'club') return band;
  const profile = TIER_PREFLOP[tier];
  const wideFactor = band.wide ? profile.wideScale : 1;
  const scaledRaise = band.raise * profile.raiseScale * wideFactor;
  const shifted = scaledRaise * profile.raiseToCallShift;
  return capPair(
    clampFrequency(scaledRaise - shifted),
    clampFrequency(band.call * wideFactor + shifted),
    band.wide,
  );
}

/** Below ~25bb speculative flats lose implied odds; pairs keep most value (jam/call). */
export function applyShortStack(
  band: BandFrequencies,
  key: string,
  stackBand: 'short' | 'medium' | 'deep',
): BandFrequencies {
  if (stackBand !== 'short') return band;
  const pair = key.length === 2;
  const callScale = pair ? 0.8 : band.wide ? 0.35 : 0.6;
  return { raise: band.raise, call: clampFrequency(band.call * callScale), wide: band.wide };
}
```

- [ ] **Step 4: Run tests — PASS.** `npx vitest run src/domain/poker/__tests__/preflopRanges.test.ts`

- [ ] **Step 5: Commit** — `git commit -am "Add limped-pot tables and archetype/tier preflop transforms"`

---

### Task 6: Rewire `buildPreflopPlan` onto the tables

The largest task: swap the internals of `preflopStrategy.ts` while keeping its contract, then update every dependent test.

**Files:**
- Modify: `src/domain/poker/preflopStrategy.ts`
- Modify: `src/domain/poker/multiwayAi.ts` (~line 445 `buildPreflopPlan` call, ~line 465 `selectPreflopAction` sizing input)
- Modify: `src/domain/poker/ai.ts` (~line 186 `buildPreflopPlan` call)
- Modify: `src/domain/poker/__tests__/preflopStrategy.test.ts`
- Possibly modify pinned expectations in: `__tests__/ai.test.ts`, `__tests__/multiwayAi.test.ts`, `__tests__/decisionGrading.test.ts`, `__tests__/coaching.test.ts`, `__tests__/sessionLearning.test.ts`, `src/features/table/*.test.ts`

**Interfaces:**
- Consumes: everything Tasks 2–5 export from `./preflopRanges`.
- Produces: `PreflopRangeInput` gains `archetype?: PreflopArchetype` (re-export `PreflopArchetype` from preflopStrategy for convenience). `PreflopSizingInput` gains `raiseCount?: number`. Everything else unchanged.

**What is deleted from `preflopStrategy.ts`:** `advancedOpeningFraction`, `advancedContinueFraction`, `advancedReraiseFraction`, `advancedOpeningPlan`, `advancedFacingRaisePlan`, `scoreThresholdForComboFraction`, `weightedPreflopClasses`, `TOTAL_PREFLOP_COMBOS`, and the two "recovery" blocks inside `adjustedFrequencies` (the `sizing.facing === 'unopened'` any-two-cards raise recovery and the `sizing.facing === 'raised'` fold-to-3bet recovery), plus the sharp/elite/nemesis raise-boost block. **What is kept:** `classifyPreflopHand`, `preflopGridCards`, `preflopStackBand`, `preflopFacingFromPublicAction`, `handScore` (still fills `plan.score`; `multiwayAi.ts:462,479,491` keys value-vs-bluff labeling on `score >= 0.84`), `openingThreshold`, `callingThreshold`, `raiserPositionAdjustment`, `rangeThresholdAdjustment`, `isPremium`, `isSuitedWheelAce`, `frequencies`, `buildPlan`, `categoryFor`, `primaryActionFor`, and the entire tournament `effectiveStackBb <= 10` push/fold and `<= 15` re-shove branches (they use the kept threshold helpers and behave well).

- [ ] **Step 1: Write the new table-driven core with failing tests**

Replace the range-behavior tests in `__tests__/preflopStrategy.test.ts`. Keep: 'classifies canonical hand keys', 'produces valid frequencies for all 169 hands across common contexts', 'always returns a legal action and clamps raise sizing', and the tournament/jam tests. Delete: 'uses solver-informed combination targets for earned-tier opening ranges' and 'makes earned-tier defense sensitive to opener position and size' (the advanced tier is gone). Rewrite/add these (uses the existing test helpers `hand()`/`plan()` in that file — adapt to its local helper names):

```ts
it('gives in-position callers a real flatting range including small pairs', () => {
  const plan = buildPreflopPlan({
    cards: [{ rank: 5, suit: 'spades' }, { rank: 5, suit: 'hearts' }],
    effectiveStackBb: 100,
    facing: 'raised',
    playerCount: 5,
    position: 'BTN',
    raiseCount: 1,
    raiseSizeBb: 2.5,
    raiserPosition: 'CO',
  });
  expect(plan.frequencies.call).toBeGreaterThan(0.4);
  expect(plan.frequencies.raise).toBeLessThan(0.15);
});

it('loosens suited and paired overcalls when the pot is already multiway', () => {
  const base = { cards: [{ rank: 7, suit: 'clubs' }, { rank: 6, suit: 'clubs' }] as const,
    effectiveStackBb: 100, facing: 'raised' as const, playerCount: 5,
    position: 'BTN' as const, raiseCount: 1, raiseSizeBb: 2.5, raiserPosition: 'HJ' as const };
  const alone = buildPreflopPlan({ ...base, callersAfterRaise: 0 });
  const crowded = buildPreflopPlan({ ...base, callersAfterRaise: 2 });
  expect(crowded.frequencies.call).toBeGreaterThan(alone.frequencies.call);
});

it('defends against a 5bb open at a reduced but nonzero rate', () => {
  const base = { cards: [{ rank: 13, suit: 'spades' }, { rank: 11, suit: 'spades' }] as const,
    effectiveStackBb: 100, facing: 'raised' as const, playerCount: 5,
    position: 'BB' as const, raiseCount: 1, raiserPosition: 'BTN' as const };
  const small = buildPreflopPlan({ ...base, raiseSizeBb: 2.5 });
  const big = buildPreflopPlan({ ...base, raiseSizeBb: 5 });
  expect(big.frequencies.fold).toBeGreaterThan(small.frequencies.fold);
  expect(big.frequencies.call + big.frequencies.raise).toBeGreaterThan(0.3);
});

it('separates archetypes by 15+ VPIP points on the button', () => {
  const vpip = (archetype: 'sticky' | 'patient') => {
    let entered = 0;
    let total = 0;
    for (const key of HAND_CLASS_KEYS) {
      const [first, second] = preflopGridCardsForKey(key); // helper below
      const plan = buildPreflopPlan({
        archetype, cards: [first, second], effectiveStackBb: 100,
        facing: 'raised', playerCount: 5, position: 'BTN',
        raiseCount: 1, raiseSizeBb: 2.5, raiserPosition: 'CO',
      });
      entered += combosForKey(key) * (plan.frequencies.raise + plan.frequencies.call);
      total += combosForKey(key);
    }
    return entered / total;
  };
  expect(vpip('sticky') - vpip('patient')).toBeGreaterThan(0.1);
});

it('never open-raises pure trash from early position at any frequency above noise', () => {
  const plan = buildPreflopPlan({
    cards: [{ rank: 7, suit: 'spades' }, { rank: 2, suit: 'hearts' }],
    effectiveStackBb: 100, facing: 'unopened', playerCount: 6, position: 'UTG',
  });
  expect(plan.frequencies.raise).toBeLessThan(0.02);
  expect(plan.frequencies.fold).toBeGreaterThan(0.95);
});

it('over-limps small pairs behind limpers instead of folding', () => {
  const plan = buildPreflopPlan({
    cards: [{ rank: 4, suit: 'spades' }, { rank: 4, suit: 'hearts' }],
    effectiveStackBb: 100, facing: 'limped', limperCount: 2, playerCount: 5, position: 'CO',
  });
  expect(plan.frequencies.call).toBeGreaterThan(0.35);
});
```

Add the tiny helper to the test file (uses the exported `preflopGridCards` + key parsing):

```ts
import { combosForKey, HAND_CLASS_KEYS } from '../preflopRanges';
import { PREFLOP_RANKS, preflopGridCards } from '../preflopStrategy';

const RANK_BY_CHAR: Record<string, number> = { 2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,T:10,J:11,Q:12,K:13,A:14 } as never;
function preflopGridCardsForKey(key: string) {
  const high = RANK_BY_CHAR[key[0]!]!;
  const low = RANK_BY_CHAR[key[1]!]!;
  const suited = key.endsWith('s') || high === low ? key.endsWith('s') : false;
  // preflopGridCards(row, col): row > col → suited, row < col → offsuit, equal → pair
  return suited ? preflopGridCards(high as never, low as never) : preflopGridCards(low as never, high as never);
}
```

(Check `preflopGridCards`' suited convention in the source — row > column means suited — and flip if needed so pairs/suited/offsuit map correctly.)

- [ ] **Step 2: Run — FAIL** (old model behavior).

- [ ] **Step 3: Rewrite `buildPreflopPlan`**

In `preflopStrategy.ts`:

Add imports:

```ts
import {
  applyArchetype, applyOpenSizeScale, applyOvercallAdjustment, applyShortStack, applyTier,
  defenseTable, limpedTable, lookupBand, raiserBucket, rfiTable, vsFourBetTable, vsThreeBetTable,
  type BandFrequencies, type PreflopArchetype,
} from './preflopRanges';
export type { PreflopArchetype } from './preflopRanges';
```

Add to `PreflopRangeInput`:

```ts
  /** Personality archetype driving real range-width differences. Defaults to 'balanced'. */
  archetype?: PreflopArchetype;
```

Add to `PreflopSizingInput`:

```ts
  raiseCount?: number;
```

Replace everything in `buildPreflopPlan` AFTER the tournament `<=10bb` and `<=15bb` branches (i.e. the `advancedTier`, `unopened`, `limped`, and `raised` sections, preflopStrategy.ts:508-601) with:

```ts
  const tier = input.strategyTier;
  const facing = input.facing;

  if (facing === 'unopened' && input.position === 'BB') {
    return buildPlan(hand, score, stackBand, frequencies(0, 0, 1, 0), `Checking ${hand.key} takes the free flop from the big blind.`);
  }

  const table = facing === 'unopened'
    ? rfiTable(input.position)
    : facing === 'limped'
      ? limpedTable(input.position)
      : (input.raiseCount ?? 1) >= 3
        ? vsFourBetTable()
        : (input.raiseCount ?? 1) === 2
          ? vsThreeBetTable()
          : defenseTable(input.position, raiserBucket(input.raiserPosition));

  const rawBand = lookupBand(table, hand.key);
  if (!rawBand) {
    const outside = facing === 'unopened'
      ? `${hand.key} is outside the ${input.position} opening range.`
      : facing === 'limped'
        ? `${hand.key} is too weak to over-limp as a default.`
        : `${hand.key} is outside the continuing range against this action.`;
    return buildPlan(
      hand, score, stackBand,
      input.canCheck ? frequencies(0, 0, 1, 0) : frequencies(0, 0, 0, 1),
      input.canCheck ? `Checking ${hand.key} takes the free flop without inflating the pot.` : outside,
    );
  }

  let band: BandFrequencies = rawBand;
  if (facing === 'raised') {
    band = applyOpenSizeScale(band, input.raiseSizeBb);
    band = applyOvercallAdjustment(band, hand.key, input.callersAfterRaise ?? 0);
    if (tournamentRisk > 0) {
      band = { ...band, raise: band.raise * (1 - tournamentRisk * 4), call: band.call * (1 - tournamentRisk * 5) };
    }
  }
  band = applyShortStack(band, hand.key, stackBand);
  band = applyArchetype(band, input.archetype, facing);
  band = applyTier(band, tier);

  const raise = Math.max(0, Math.min(0.98, band.raise));
  const call = Math.max(0, Math.min(0.98 - raise, band.call));
  const passiveRemainder = Math.max(0, 1 - raise - call);
  const check = input.canCheck ? passiveRemainder : 0;
  const fold = input.canCheck ? 0 : passiveRemainder;

  const explanation = facing === 'unopened'
    ? band.wide
      ? `${hand.key} sits on the edge of the ${input.position} opening range.`
      : `${hand.key} is inside the ${input.position} opening range.`
    : facing === 'limped'
      ? raise >= call
        ? `${hand.key} is strong enough to raise the limpers for value.`
        : `${hand.key} plays well enough to continue behind the limpers.`
      : raise > call
        ? `${hand.key} belongs in the re-raise range against this action.`
        : band.wide
          ? `${hand.key} is a close defense; the price and position break the tie.`
          : `${hand.key} is inside the continuing range from ${input.position}.`;

  return buildPlan(hand, score, stackBand, frequencies(raise, call, check, fold), explanation);
```

Notes:
- `tournamentRisk` is the existing clamped `input.tournamentRiskPremium` local (already computed at the top of the function); the bubble still tightens ranges, now applied to the band directly.
- The `identityAdjustment`/`rangeThresholdAdjustment` local stays ONLY for the tournament short-stack branches; the flexible-range personality now flows through `archetype`.
- Delete the dead functions listed in the task header, then run `npx tsc --noEmit` to catch leftover references.

Rewrite `adjustedFrequencies` (keep name and signature) to drop the difficulty/recovery logic — tier shaping now lives in `applyTier` inside `buildPreflopPlan` — keeping only the bounded adaptation deltas:

```ts
function adjustedFrequencies(
  plan: PreflopPlan,
  _difficulty: AiDifficulty,
  adjustment: PreflopDecisionAdjustment,
  _sizing: PreflopSizingInput,
): PreflopFrequencies {
  const base = plan.frequencies;
  const continueDelta = clamp(adjustment.continueFrequencyDelta ?? 0, -0.1, 0.1);
  const raiseScale = clamp(adjustment.raiseFrequencyScale ?? 1, 0.72, 1.35);
  const continueViaCall = base.call >= base.check;
  const continueWeight = continueViaCall ? base.call : base.check;
  const movedToContinue = Math.min(base.fold, Math.max(0, continueDelta));
  const movedToFold = Math.min(continueWeight, Math.max(0, -continueDelta));
  const scaledRaise = base.raise * raiseScale;
  const movedRaiseToContinue = Math.max(0, base.raise - scaledRaise);
  return frequencies(
    scaledRaise,
    base.call + (continueViaCall ? movedToContinue - movedToFold + movedRaiseToContinue : 0),
    base.check + (!continueViaCall ? movedToContinue - movedToFold + movedRaiseToContinue : 0),
    base.fold - movedToContinue + movedToFold,
  );
}
```

Fix 4-bet sizing in `preferredPreflopRaiseTo` — replace the `facing === 'raised'` branch:

```ts
  if (facing === 'raised') {
    const inPosition = position === 'BTN' || position === 'CO' || position === 'HJ';
    const reraiseFactor = (input.raiseCount ?? 1) >= 2 ? 2.4 : inPosition ? 3 : 3.5;
    target = currentBet * reraiseFactor;
  }
```

- [ ] **Step 4: Wire the callers**

`multiwayAi.ts` — in the `buildPreflopPlan({...})` call (~line 445) add `archetype: identity.style,`; in the `selectPreflopAction` sizing object (~line 465-475) add `raiseCount: preflopRaises.length,`. (`identity.style` is `MultiwayAiStyle = 'balanced' | 'patient' | 'pressure' | 'sticky' | 'deceptive'` — identical union to `PreflopArchetype`; if TS complains, widen `archetype` to accept it or map explicitly.)

`ai.ts` — in its `buildPreflopPlan({...})` call (~line 186) add `archetype: 'balanced',`.

- [ ] **Step 5: Run the new preflop tests — PASS**

Run: `npx vitest run src/domain/poker/__tests__/preflopStrategy.test.ts src/domain/poker/__tests__/preflopRanges.test.ts`

- [ ] **Step 6: Run the FULL suite and repair pinned expectations**

Run: `npx vitest run`
Expected failures to triage (update expectations ONLY per the Global Constraints rule, logging each in `docs/PR48_AI_REALISM_QA.md`):
- `preflopStrategy.test.ts` leftovers referencing deleted behavior.
- `ai.test.ts` / `multiwayAi.test.ts` aggression/fold-rate bands (3-bet spam is gone, so `raisePct` drops and `foldFacingPct` may drop — recentre the bands on the new measured values with ±6-point margins; the BB-defense-vs-steal floor of 48% must still pass, since BB_VS_LATE continues ~55-60%).
- `decisionGrading.test.ts` / `coaching.test.ts` / `sessionLearning.test.ts` / `src/features/table/*.test.ts` — graded verdicts on specific hands may legitimately flip (e.g. flatting 55 on the BTN is now 'strong' instead of 'mistake'). Verify each flip is a designed behavior before editing.
- Any test asserting exact `explanation` strings — update to the new template text.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Rewire preflop decisions onto explicit range tables"
```

---

### Task 7: Re-pin eval targets (Phase 1 acceptance)

**Files:**
- Modify: `src/domain/poker/__tests__/multiwayAi.test.ts` (the Task 1 test)
- Modify: `docs/PR48_AI_REALISM_QA.md`

- [ ] **Step 1: Measure**

Run: `pnpm eval:multiway-ai` and record the new metric tables in the QA doc under `## After range tables`.

- [ ] **Step 2: Tighten the Task 1 test into acceptance bands**

Replace the loose assertions with the design targets (club, 5-handed, 160 hands, seed 90210):

```ts
  expect(result.flopRate).toBeGreaterThan(0.5);
  expect(result.multiwayFlopRate).toBeGreaterThan(0.2);
  expect(result.multiwayFlopRate).toBeLessThan(0.45);
  expect(result.walkRate).toBeLessThan(0.1);
  expect(result.threeBetRate).toBeGreaterThan(0.03);
  expect(result.threeBetRate).toBeLessThan(0.15);
```

And add the archetype-separation guard:

```ts
  const vpipOf = (id: string) => {
    const metric = result.identityMetrics[id]!;
    return metric.vpipEntries / Math.max(1, metric.vpipOpportunities);
  };
  expect(vpipOf('lena-sticky') - vpipOf('iris-patient')).toBeGreaterThan(0.1);
```

- [ ] **Step 3: Tune until green**

If a band misses, adjust in this order (smallest hammer first), re-running `pnpm eval:multiway-ai` each time: (1) wide-band `raise`/`call` frequencies in `preflopRanges.ts` tables (±0.1); (2) `TIER_PREFLOP.wideScale`; (3) `ARCHETYPE_PREFLOP` scales (keep sticky callScale ≥ 1.35 and pressure threeBetScale ≥ 1.3 so personalities stay distinct); (4) only if structurally impossible, revisit the test band and justify in the QA doc. Also confirm `pnpm eval:ai` and `pnpm eval:championship-ai` still pass.

- [ ] **Step 4: Commit** — `git commit -am "Pin multiway realism acceptance bands"`

---

### Task 8 (Phase 2): Bluff allowance in the opponent range model

Stops every tier from reading all raises as pure strength (the "relentless aggression beats every level" exploit).

**Files:**
- Modify: `src/domain/poker/multiwayEquity.ts:85-99` (`inferMultiwayRangeStrength`)
- Modify: `src/domain/poker/__tests__/equity.test.ts` (this file tests multiwayEquity — confirm with `grep -l inferMultiwayRangeStrength src/domain/poker/__tests__/*.ts` and use whichever file it names)

- [ ] **Step 1: Write the failing tests** (in the file grep names; construct a minimal `MultiwayHandState` the way existing tests there do):

```ts
it('discounts raise strength for a bluff-heavy identity and applies diminishing repeats', () => {
  // state with two hero raises in history, one preflop one flop
  const sticky = inferMultiwayRangeStrength(state, 'ai-1', identityWith({ bluffFrequency: 0.42 }));
  const wild = inferMultiwayRangeStrength(state, 'ai-1', identityWith({ bluffFrequency: 1.38 }));
  expect(wild).toBeLessThan(sticky); // aggressive raiser's raises mean less
  // one raise vs two raises: second adds less than the first
  const oneRaise = inferMultiwayRangeStrength(stateWithOneRaise, 'ai-1', identity);
  const twoRaises = inferMultiwayRangeStrength(stateWithTwoRaises, 'ai-1', identity);
  expect(twoRaises - oneRaise).toBeLessThan(oneRaise - baseStrength);
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement** — replace the history loop in `inferMultiwayRangeStrength`:

```ts
  const bluffAllowance = clamp(0.12 + (profile.bluffFrequency - 1) * 0.08, 0.05, 0.28);
  let raisesSeen = 0;
  state.history.forEach((record) => {
    if (record.playerId !== playerId) return;
    if (record.type === 'raise') {
      const sizingPressure = clamp(record.amount / Math.max(state.bigBlind * 10, record.potAfter), 0, 0.08);
      const base = record.street === 'preflop' ? 0.15 : 0.12;
      strength += (base + sizingPressure) * (1 - bluffAllowance) * Math.pow(0.72, raisesSeen);
      raisesSeen += 1;
    } else if (record.type === 'call') {
      strength += record.street === 'preflop' ? 0.035 : 0.05;
    } else if (record.type === 'check') {
      strength -= 0.012;
    }
  });

  return clamp(strength, 0.02, 0.68);
```

(`record.amount` may be undefined for non-raise records but this branch only runs for raises; if TS complains use `record.amount ?? 0`.)

- [ ] **Step 4: Run the equity tests + full suite.** The AI now calls down more, so `foldFacingPct` bands in `multiwayAi.test.ts`/`ai.test.ts` may need recentring (log in QA doc). PASS.

- [ ] **Step 5: Commit** — `git commit -am "Model bluffs in opponent range inference"`

---

### Task 9 (Phase 2): Busted-draw river bluffs

**Files:**
- Modify: `src/domain/poker/postflopStrategy.ts`
- Modify: `src/domain/poker/__tests__/postflopStrategy.test.ts`

**Interfaces:**
- Produces: `PostflopPlan` gains `bustedDrawLabel: string | null` (additive).

- [ ] **Step 1: Write the failing test**

```ts
it('bluffs busted draws on the river at a meaningful frequency', () => {
  // Hero Q♠J♠ on A♠K♠4♥ | 7♦ | 2♣ — flush draw + gutshot on the turn, bricked river.
  const input: PostflopStrategyInput = {
    bigBlind: 20,
    board: [
      { rank: 14, suit: 'spades' }, { rank: 13, suit: 'spades' }, { rank: 4, suit: 'hearts' },
      { rank: 7, suit: 'diamonds' }, { rank: 2, suit: 'clubs' },
    ],
    cards: [{ rank: 12, suit: 'spades' }, { rank: 11, suit: 'spades' }],
    currentBet: 0, effectiveStack: 900, equity: 0.1, initiative: 'none',
    legal: { canCall: false, canCheck: true, canFold: false, canRaise: true,
      minRaiseTo: 20, maxRaiseTo: 900, suggestedRaiseTo: 132, toCall: 0 },
    opponentCount: 1, playerStreetBet: 0, playersBehind: 0, pot: 200, street: 'river',
  };
  const plan = buildPostflopPlan(input);
  expect(plan.bustedDrawLabel).toMatch(/flush/);
  const bluff = plan.candidates.find((candidate) => candidate.role === 'bluff');
  expect(bluff).toBeDefined();
  // Score close enough to check that a bluff-leaning profile actually picks it sometimes:
  let bluffPicks = 0;
  for (let mixStep = 0; mixStep < 100; mixStep += 1) {
    const selected = selectPostflopAction(plan, mixStep / 100, 'sharp', { bluffFrequencyScale: 1.3 });
    if (selected.role === 'bluff') bluffPicks += 1;
  }
  expect(bluffPicks).toBeGreaterThan(10);
  expect(bluffPicks).toBeLessThan(60);
});
```

(Match `LegalActions` field names to `./types` — check with a quick read of the type before writing; adjust the literal accordingly.)

- [ ] **Step 2: Run — FAIL** (`bustedDrawLabel` missing).

- [ ] **Step 3: Implement**

In `postflopStrategy.ts`:

1. Refactor `drawLabel` so its core takes an explicit board (keep the public behavior):

```ts
function drawLabelOnBoard(cards: readonly Card[], board: readonly Card[]): string | null {
  const allCards = [...cards, ...board];
  // ...existing body of drawLabel from line 89 down, unchanged...
}

function drawLabel(cards: readonly Card[], board: readonly Card[], street: PostflopStrategyInput['street']): string | null {
  if (street === 'river') return null;
  return drawLabelOnBoard(cards, board);
}

function bustedDrawLabel(cards: readonly Card[], board: readonly Card[], street: PostflopStrategyInput['street']): string | null {
  if (street !== 'river' || board.length < 5) return null;
  const turnDraw = drawLabelOnBoard(cards, board.slice(0, 4));
  if (!turnDraw) return null;
  const made = evaluateBest([...cards, ...board]);
  if (made.category >= 2) return null; // improved to two pair or better — not a busted-draw bluff
  return `busted ${turnDraw}`;
}
```

2. In `buildPostflopPlan`: compute `const bustedDraw = bustedDrawLabel(input.cards, input.board, input.street);`, pass it to `aggressiveCandidates` (new last parameter), and add `bustedDrawLabel: bustedDraw,` to the returned plan (and the field to `PostflopPlan`).

3. In `aggressiveCandidates`, accept `bustedDraw: string | null` and change the bluff roleBoost line (postflopStrategy.ts:279):

```ts
        : role === 'bluff'
          ? bustedDraw
            ? 0.16
            : input.playersBehind === 0 && input.opponentCount === 1 && texture.wetness < 0.3 ? 0.035 : -0.11
```

and the bluff `reason` string: when `bustedDraw`, use `` `${sizeLabel} turns the ${bustedDraw} into a bluff; the made-hand range checks back too often to let this go.` ``.

- [ ] **Step 4: Run postflop tests + full suite; recentre any aggression bands that moved (QA log). PASS.**

- [ ] **Step 5: Commit** — `git commit -am "Add busted-draw river bluffs"`

---

### Task 10 (Phase 2): Bluff sizing mirrors value sizing

Kills the "⅓ pot = weak, ¾ pot = strong" tell.

**Files:**
- Modify: `src/domain/poker/postflopStrategy.ts:222-235` (`preferredFraction`)
- Modify: `src/domain/poker/__tests__/postflopStrategy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('sizes bluffs like value bets on the same texture', () => {
  // weak hand, wet board → preferred bluff size should be the value size (3/4), not 1/3
  const plan = buildPostflopPlan(wetBoardWeakHandInput); // reuse/adapt an existing fixture in this file
  const bluff = plan.candidates.filter((candidate) => candidate.role === 'bluff');
  const best = [...bluff].sort((a, b) => b.score - a.score)[0];
  expect(best?.potFraction ?? 0).toBeGreaterThan(0.6);
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement** — in `preferredFraction`, replace the last two lines:

```ts
  if (strength === 'marginal') return 1 / 3;
  // Bluffs tell the same sizing story as the value range on this texture.
  return wetness >= 0.35 ? 0.75 : 0.5;
```

- [ ] **Step 4: Run tests, fix any pinned sizing expectations (QA log). PASS.**
- [ ] **Step 5: Commit** — `git commit -am "Size bluffs like value bets"`

---

### Task 11 (Phase 2): Salt the per-decision RNG so strategies actually mix

**Files:**
- Modify: `src/domain/poker/multiwaySession.ts:160-169` (`seededMultiwayDecisionRandom`)
- Modify: `src/features/table/MultiwayPokerTableScreen.tsx` (find call sites: `grep -n seededMultiwayDecisionRandom src -r`)
- Modify: `src/domain/poker/__tests__/multiwaySession.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('produces different decision streams for different session salts', () => {
  const state = createMultiwaySession(/* reuse this file's existing fixture helper */);
  const rollsA = Array.from({ length: 8 }, seededMultiwayDecisionRandom(state.hand ?? state, 'ai-1', 1));
  const rollsB = Array.from({ length: 8 }, seededMultiwayDecisionRandom(state.hand ?? state, 'ai-1', 2));
  const rollsA2 = Array.from({ length: 8 }, seededMultiwayDecisionRandom(state.hand ?? state, 'ai-1', 1));
  expect(rollsA).toEqual(rollsA2);      // deterministic per salt
  expect(rollsA).not.toEqual(rollsB);   // varies across salts
});
```

(Adapt the state fixture to whatever `multiwaySession.test.ts` already constructs — the function only reads `handNumber`, `history.length`, `board.length`, and the player's seat.)

- [ ] **Step 2: Run — FAIL** (no salt parameter).

- [ ] **Step 3: Implement**

```ts
export function seededMultiwayDecisionRandom(
  state: MultiwayHandState,
  playerId: string,
  salt = 0,
): () => number {
  const player = state.players[playerId];
  const playerSeed = player?.seat ?? 0;
  return seededRandom(
    state.handNumber * 1_000_003
      + state.history.length * 9_973
      + state.board.length * 397
      + playerSeed * 53
      + Math.floor(salt) * 7_919,
  );
}
```

In `MultiwayPokerTableScreen.tsx`, at every `seededMultiwayDecisionRandom(...)` call site pass a per-session salt held in a ref created when the session starts:

```ts
const decisionSaltRef = useRef(Math.floor(Math.random() * 0x7fff_ffff));
```

(Reset it wherever a new session is created — grep for where the screen resets session state, e.g. the handler that calls `createMultiwaySession`, and set `decisionSaltRef.current = Math.floor(Math.random() * 0x7fff_ffff)` there. Hand replays/coaching that re-derive decisions do NOT use this function — verify with the grep — so replay determinism within the session is preserved by keeping the salt constant for the session's lifetime.)

- [ ] **Step 4: Run tests + typecheck (`npx tsc --noEmit`). PASS.**
- [ ] **Step 5: Commit** — `git commit -am "Salt per-decision RNG per session"`

---

### Task 12 (Phase 2): Widen adaptation caps and fix the multiway facing-bet observation

**Files:**
- Modify: `src/domain/poker/opponentMemory.ts` (`observePublicMultiwayHand` ~line 168; `buildOpponentAdaptation` caps ~lines 352-384)
- Modify: `src/domain/poker/__tests__/opponentMemory.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
it('does not count an open-fold as folding to pressure in multiway hands', () => {
  // Build a MultiwayHandState whose history has hero folding preflop with
  // decisionContext.toCall === 0 (checking option / unraised limp behind is impossible for
  // toCall=0 fold in practice, so use a fold where hero already matched the bet —
  // simplest: hero in BB folding is illegal when toCall is 0, so assert via a raise-first case:
  // hero RAISES first-in (no prior raise) — must NOT be facingBet.
  const observation = observePublicMultiwayHand(stateWhereHeroOpenRaised);
  const preflopAction = observation.actions.find((action) => action.street === 'preflop');
  expect(preflopAction?.facingBet).toBe(false);
});

it('marks hero actions as facing a bet exactly when chips were owed', () => {
  const observation = observePublicMultiwayHand(stateWhereHeroFoldedToAnOpen);
  expect(observation.actions.at(-1)?.facingBet).toBe(true);
});

it('can at least halve or double bluff frequency at full confidence', () => {
  const passiveTarget = buildOpponentAdaptation(memoryOfSomeoneWhoFolds75PercentOver60Hands, 1.3, 'late');
  expect(passiveTarget.bluffFrequencyScale).toBeGreaterThan(1.35);
  const station = buildOpponentAdaptation(memoryOfSomeoneWhoCalls80PercentOver60Hands, 1.3, 'late');
  expect(station.bluffFrequencyScale).toBeLessThan(0.75);
});
```

(Build the memory fixtures with the module's own observation/apply helpers the way existing tests in this file do.)

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement**

Observation fix — in `observePublicMultiwayHand` replace the heuristic:

```ts
      facingBet: action.decisionContext
        ? action.decisionContext.toCall > 0
        : action.type === 'call'
          || (action.type === 'raise' && hasPriorStreetRaise(state.history, index, action.street)),
```

(`MultiwayActionRecord.decisionContext` is optional (`multiway.ts:41`) but always populated by `applyMultiwayAction` (`multiway.ts:484`); the fallback covers persisted pre-existing hands only, and drops `fold` from the fallback's facing-bet guess since an open-fold is precisely the miscount being fixed.)

Cap widening — in `buildOpponentAdaptation`, change the output clamps to:

```
bluffFrequencyScale:    [0.86, 1.14] → [0.6, 1.6]
pressureFrequencyScale: [0.88, 1.12] → [0.7, 1.45]
valueFrequencyScale:    [0.94, 1.08] → [0.85, 1.25]
raiseSizeScale:         [0.96, 1.05] → [0.9, 1.15]
callToleranceDelta:     ±0.035       → ±0.09
valueThresholdDelta:    ±0.018       → ±0.04
```

Keep the shape of each formula; only widen the min/max bounds (and scale the pre-clamp multipliers by ~2× where the old formula could never reach the new bounds — inspect each line and keep signal directions identical).

- [ ] **Step 4: Run the full suite.** The adapted-run assertions in `multiwayAi.test.ts` (BB-defense floor with adaptation, `ai.test.ts` adaptation bands) may shift — recentre per the rules, and confirm the BB-defense-vs-steal floor still holds ≥ 0.48 (if adaptation now pushes below it, reduce `callToleranceDelta`'s negative reach against blind defenders to -0.06 and note it). PASS.

- [ ] **Step 5: Commit** — `git commit -am "Widen opponent adaptation range and fix multiway pressure observation"`

---

### Task 13: Final sweep, metrics, and QA record

**Files:**
- Modify: `docs/PR48_AI_REALISM_QA.md`

- [ ] **Step 1: Full verification**

```bash
npx tsc --noEmit
npx vitest run
pnpm eval:multiway-ai
pnpm eval:ai
pnpm eval:championship-ai
```

Expected: all green. Fix anything that is not before proceeding.

- [ ] **Step 2: Fill in `## Final metrics`** in the QA doc: the printed tables from all three evals, plus a before/after comparison row: flopRate, multiwayFlopRate, walkRate, threeBetRate, per-archetype VPIP/PFR, foldRateFacingBet per tier. Confirm every Phase 1 acceptance band from Task 7 holds and state each explicitly.

- [ ] **Step 3: Commit** — `git commit -am "Record AI realism QA results"`

- [ ] **Step 4: Manual smoke test note** — the app itself should be launched by a human (Expo/iOS): play ~10 hands at a 6-player club table and confirm (a) multiway flops actually appear, (b) coach explanations read sensibly, (c) no crash in the range explorer (it renders all 169 classes through the new tables). Record observations in the QA doc.

---

## Self-Review (performed while writing)

- **Spec coverage:** multiway fix = Tasks 3–7 (3-bet spam ↓, cold-calls/set-mining, overcall sign flip, size-cliff softening, limps, walk rate via SB/BTN width + friendly shift); metrics-first guard = Task 1; ceiling = Tasks 8–12; archetype realism = Task 5 + Task 7 separation guard. Deliberately out of scope (documented here so nobody "helpfully" adds them): blind-structure pacing, ICM magnitudes, heads-up `ai.ts` legacy-path removal.
- **Type consistency:** `BandFrequencies`/`CompiledRangeTable`/`PreflopArchetype` names match across Tasks 3→6; metric field names match Tasks 1→7→13; `bustedDrawLabel` consistent within Task 9.
- **Known judgment calls an implementer must NOT "fix" silently:** first-match-wins band ordering (duplicates across bands are legal); `plan.score` still comes from the old `handScore` purely for style-labeling compat; BB unopened returns a pure check plan.
