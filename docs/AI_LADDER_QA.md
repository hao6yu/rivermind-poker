# AI difficulty ladder QA

Spec: docs/superpowers/specs/2026-09-05-ai-difficulty-ladder-design.md

Method: `pnpm eval:ai:ladder` (tuning corpus) and `LADDER_CORPUS=evaluation pnpm eval:ai:ladder`
(held-out corpus). Duplicate deals at production sample depth. Positive numbers mean the higher
tier won chips; `±` is the 2-standard-error half-width in BB per 100. Adaptation rows are
sequential sessions, not duplicate deals, and report memory-on minus memory-off on identical deals.

## Stage 0: baseline (commit e75e90fc)

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

- postflopStrategy.test.ts › bluffs busted draws on the river at a meaningful frequency: bluffPicks bracket (10, 90), deterministic 66/100 → bluffPicks bracket (2, 50), deterministic 6/100, reason: flat incentive removed
- postflopStrategy.test.ts › bluffs busted draws less often as more opponents remain on the river: headsUp > 10 and threeWay ≤ headsUp − 10 → headsUp > 2 (measured 4/100) and threeWay < headsUp (measured threeWay 1/100, fourWay 1/100), reason: flat incentive removed
- ai.test.ts › completes repeatable varied-hand simulations without illegal actions or lost chips (aggressionRate ordering): club!.aggressionRate < sharp!.aggressionRate → |club!.aggressionRate − sharp!.aggressionRate| < 0.08 (measured club 0.3716, sharp 0.3333 — Club is now marginally more aggressive), reason: flat incentive removed
- ai.test.ts › completes repeatable varied-hand simulations without illegal actions or lost chips (postflopRaiseRate ordering): postflopRaiseRate(sharp) > postflopRaiseRate(club) → |postflopRaiseRate(sharp) − postflopRaiseRate(club)| < 0.08 (measured club 0.3832, sharp 0.3333), reason: flat incentive removed
