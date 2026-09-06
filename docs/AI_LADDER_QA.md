# AI difficulty ladder QA

Spec: docs/superpowers/specs/2026-09-05-ai-difficulty-ladder-design.md

Method: `pnpm eval:ai:ladder` (tuning corpus) and `LADDER_CORPUS=evaluation pnpm eval:ai:ladder`
(held-out corpus). Duplicate deals at production sample depth. Positive numbers mean the higher
tier won chips; `±` is the 2-standard-error half-width in BB per 100. Adaptation rows are
sequential sessions, not duplicate deals, and report memory-on minus memory-off on identical deals.

## Stage 0: baseline (commit e75e90fc)

### Tuning corpus
| matchup | hands | bbPer100 | ± | showdown % | higher bluffs | lower bluffs |
| **Heads-up, 3,000 hands** | | | | | | |
| club vs friendly | 3000 | 12.7 | 30.1 | 41.7 | 69 | 22 |
| sharp vs club | 3000 | -41.6 | 46 | 30 | 453 | 81 |
| elite vs sharp | 3000 | 8.6 | 58.3 | 27.6 | 543 | 521 |
| nemesis vs elite | 3000 | 11.6 | 58.6 | 27.3 | 601 | 614 |
| elite vs club | 3000 | -72.1 | 47.8 | 29 | 496 | 78 |
| nemesis vs club | 3000 | -65.3 | 46.9 | 29.3 | 507 | 82 |
| **Six-max, 1,200 hands** | | | | | | |
| club vs friendly | 1200 | 31.1 | 19.4 | 57.4 | 49 | 6 |
| sharp vs club | 1200 | -19.2 | 25.8 | 34.9 | 273 | 47 |
| elite vs sharp | 1200 | 4.2 | 31.1 | 27.3 | 281 | 263 |
| nemesis vs elite | 1200 | 19.1 | 30.2 | 24.1 | 220 | 197 |
| elite vs club | 1200 | -17.8 | 29.5 | 27.7 | 280 | 32 |
| nemesis vs club | 1200 | -24.2 | 29.5 | 27.3 | 293 | 31 |
| **Six-max styles, 300 hands each** | | | | | | |
| sharp vs club [balanced] | 300 | -17.2 | 57.8 | 32.3 | 70 | 8 |
| sharp vs club [patient] | 300 | 26.9 | 29.5 | 17.3 | 27 | 2 |
| sharp vs club [pressure] | 300 | -93.6 | 76.7 | 36.3 | 81 | 16 |
| sharp vs club [sticky] | 300 | 2.7 | 69.6 | 69.3 | 53 | 2 |
| sharp vs club [deceptive] | 300 | -26.9 | 49.4 | 38 | 89 | 10 |
| elite vs club [balanced] | 300 | -39.6 | 55.5 | 29.3 | 70 | 13 |
| elite vs club [patient] | 300 | 5.7 | 37.9 | 14.3 | 41 | 5 |
| elite vs club [pressure] | 300 | -18 | 64 | 34 | 75 | 15 |
| elite vs club [sticky] | 300 | 11.8 | 53.7 | 58 | 53 | 4 |
| elite vs club [deceptive] | 300 | -52.8 | 52.8 | 30.3 | 91 | 17 |
| nemesis vs club [balanced] | 300 | 6.8 | 58.3 | 28.7 | 64 | 10 |
| nemesis vs club [patient] | 300 | 27.2 | 38 | 17 | 32 | 4 |
| nemesis vs club [pressure] | 300 | 3.6 | 72.3 | 33.3 | 80 | 12 |
| nemesis vs club [sticky] | 300 | 46.3 | 67 | 59.7 | 54 | 8 |
| nemesis vs club [deceptive] | 300 | -1 | 52.9 | 26.7 | 71 | 9 |

| adaptation matchup | hands | memory off BB | memory on BB | gain BB/100 |
| sharp vs club | 600 | -535.2 | -526.4 | 1.5 |
| elite vs club | 600 | -1060.9 | -985.4 | 12.6 |
| nemesis vs club | 600 | -423.6 | -733.6 | -51.7 |

### Evaluation corpus
| matchup | hands | bbPer100 | ± | showdown % | higher bluffs | lower bluffs |
| **Heads-up, 3,000 hands** | | | | | | |
| club vs friendly | 3000 | 19.2 | 26.2 | 40.5 | 66 | 13 |
| sharp vs club | 3000 | -44.3 | 42.1 | 29.5 | 428 | 79 |
| elite vs sharp | 3000 | -56.5 | 54.2 | 26.6 | 506 | 445 |
| nemesis vs elite | 3000 | 27.5 | 55.3 | 25.2 | 551 | 504 |
| elite vs club | 3000 | -68.8 | 43.9 | 27.7 | 475 | 74 |
| nemesis vs club | 3000 | -94.5 | 44.7 | 28.8 | 517 | 73 |
| **Six-max, 1,200 hands** | | | | | | |
| club vs friendly | 1200 | 10 | 22.8 | 55.4 | 37 | 3 |
| sharp vs club | 1200 | -21.6 | 30.5 | 34.3 | 261 | 46 |
| elite vs sharp | 1200 | 13.9 | 33.9 | 28.4 | 303 | 263 |
| nemesis vs elite | 1200 | 16.3 | 32.1 | 24.9 | 220 | 254 |
| elite vs club | 1200 | 6.5 | 29.6 | 28.4 | 316 | 25 |
| nemesis vs club | 1200 | -10.9 | 26.9 | 27.3 | 255 | 32 |
| **Six-max styles, 300 hands each** | | | | | | |
| sharp vs club [balanced] | 300 | -34.8 | 70.7 | 37.7 | 74 | 12 |
| sharp vs club [patient] | 300 | 15.3 | 28.5 | 21.7 | 28 | 3 |
| sharp vs club [pressure] | 300 | -68.4 | 68.5 | 39.7 | 85 | 12 |
| sharp vs club [sticky] | 300 | -18.1 | 60.1 | 66 | 72 | 8 |
| sharp vs club [deceptive] | 300 | -15.7 | 49.9 | 43.3 | 82 | 15 |
| elite vs club [balanced] | 300 | 11.9 | 55.6 | 26 | 66 | 12 |
| elite vs club [patient] | 300 | -1.7 | 38 | 15.7 | 35 | 4 |
| elite vs club [pressure] | 300 | -67.8 | 70.4 | 37 | 73 | 16 |
| elite vs club [sticky] | 300 | 65.8 | 78.9 | 55 | 62 | 4 |
| elite vs club [deceptive] | 300 | 4.8 | 59.4 | 26.7 | 73 | 17 |
| nemesis vs club [balanced] | 300 | -24.1 | 60.9 | 27.7 | 81 | 12 |
| nemesis vs club [patient] | 300 | 11.4 | 38 | 16.3 | 36 | 3 |
| nemesis vs club [pressure] | 300 | -6.1 | 68.1 | 34 | 73 | 12 |
| nemesis vs club [sticky] | 300 | 24.5 | 69.3 | 52 | 56 | 4 |
| nemesis vs club [deceptive] | 300 | -20.6 | 48.4 | 30.3 | 82 | 13 |

| adaptation matchup | hands | memory off BB | memory on BB | gain BB/100 |
| sharp vs club | 600 | -190.8 | -134.4 | 9.4 |
| elite vs club | 600 | -63.9 | -30 | 5.6 |
| nemesis vs club | 600 | -875.8 | -783.9 | 15.3 |

Every tier above Club loses to Club heads-up on both corpora. Six-max point estimates are mostly negative with bands crossing zero. Higher tiers bluff several times as often as Club in every row. The adaptation effect is small and changes sign between corpora.

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
- ai.test.ts › completes repeatable varied-hand simulations without illegal actions or lost chips (bluffRate ordering): club.bluffRate < sharp.bluffRate → non-ordering sanity check, reason: no tier-order aggression assertions (spec 5.4)
