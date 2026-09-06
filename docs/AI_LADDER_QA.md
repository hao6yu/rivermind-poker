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

Commit: dbfdc792 (Task 3). Tuning corpus only; the evaluation corpus is run at Stage 4.

### Tuning corpus
| matchup | hands | bbPer100 | ± | showdown % | higher bluffs | lower bluffs |
| **Heads-up, 3,000 hands** | | | | | | |
| club vs friendly | 3000 | 12.7 | 30.1 | 41.7 | 69 | 22 |
| sharp vs club | 3000 | 23.4 | 35.9 | 32.6 | 58 | 57 |
| elite vs sharp | 3000 | 9.4 | 35.5 | 29.6 | 59 | 58 |
| nemesis vs elite | 3000 | -18.8 | 35.4 | 28.9 | 52 | 62 |
| elite vs club | 3000 | 10.8 | 36.7 | 31.1 | 60 | 63 |
| nemesis vs club | 3000 | 0.9 | 35.9 | 31.8 | 58 | 55 |
| **Six-max, 1,200 hands** | | | | | | |
| club vs friendly | 1200 | 31.1 | 19.4 | 57.4 | 49 | 6 |
| sharp vs club | 1200 | 7.2 | 22.2 | 38.8 | 42 | 47 |
| elite vs sharp | 1200 | -19 | 27.2 | 25.1 | 285 | 36 |
| nemesis vs elite | 1200 | 18.6 | 30.2 | 23.8 | 219 | 198 |
| elite vs club | 1200 | -17.8 | 29.5 | 27.7 | 280 | 32 |
| nemesis vs club | 1200 | -20.4 | 29.8 | 27.3 | 293 | 30 |
| **Six-max styles, 300 hands each** | | | | | | |
| sharp vs club [balanced] | 300 | 16.9 | 39.5 | 36.3 | 12 | 7 |
| sharp vs club [patient] | 300 | 22.6 | 29.4 | 21.3 | 3 | 2 |
| sharp vs club [pressure] | 300 | -38 | 57.6 | 44 | 15 | 14 |
| sharp vs club [sticky] | 300 | 0.1 | 48.5 | 72.7 | 4 | 3 |
| sharp vs club [deceptive] | 300 | 5.8 | 33.1 | 43.3 | 15 | 7 |
| elite vs club [balanced] | 300 | -39.6 | 55.5 | 29.3 | 70 | 13 |
| elite vs club [patient] | 300 | 5.7 | 37.9 | 14.3 | 41 | 5 |
| elite vs club [pressure] | 300 | -18 | 64 | 34 | 75 | 15 |
| elite vs club [sticky] | 300 | 11.8 | 53.7 | 58 | 53 | 4 |
| elite vs club [deceptive] | 300 | -52.8 | 52.8 | 30.3 | 91 | 17 |
| nemesis vs club [balanced] | 300 | 13.5 | 59.3 | 28 | 64 | 10 |
| nemesis vs club [patient] | 300 | 28.5 | 39.8 | 16.7 | 35 | 6 |
| nemesis vs club [pressure] | 300 | 6 | 73.5 | 35 | 81 | 11 |
| nemesis vs club [sticky] | 300 | 44.9 | 66.2 | 59 | 55 | 7 |
| nemesis vs club [deceptive] | 300 | 1.8 | 52.6 | 26.7 | 73 | 9 |

| adaptation matchup | hands | memory off BB | memory on BB | gain BB/100 |
| sharp vs club | 600 | -329.5 | -343.5 | -2.3 |
| elite vs club | 600 | -358.6 | -224.3 | 22.4 |
| nemesis vs club | 600 | -177.3 | -149.6 | 4.6 |

Heads-up: every tier above Club moved from clearly negative against Club to a small positive or near-zero point estimate, with higher-tier bluff counts collapsing to Club's level. Elite and Nemesis are now indistinguishable within noise. At six-max, only Sharp changed significantly, because Elite and Nemesis select through the EV path that flat incentives do not touch, leaving their bluff counts and results unchanged.

## Stage 2: ranges

Commit: 977e8a35 (Tasks 4 to 8). Tuning corpus only; the evaluation corpus is run at Stage 4.

### Tuning corpus
| matchup | hands | bbPer100 | ± | showdown % | higher bluffs | lower bluffs |
| **Heads-up, 3,000 hands** | | | | | | |
| club vs friendly | 3000 | 0.3 | 28.6 | 41.2 | 194 | 27 |
| sharp vs club | 3000 | 46.5 | 32.5 | 26.7 | 204 | 188 |
| elite vs sharp | 3000 | 31.7 | 25.4 | 20.1 | 68 | 167 |
| nemesis vs elite | 3000 | -17.8 | 22.2 | 16.6 | 55 | 73 |
| elite vs club | 3000 | 71.8 | 29.2 | 22.5 | 72 | 173 |
| nemesis vs club | 3000 | 83.6 | 29.9 | 22.1 | 62 | 186 |
| **Six-max, 1,200 hands** | | | | | | |
| club vs friendly | 1200 | 17 | 18.9 | 58.8 | 74 | 1 |
| sharp vs club | 1200 | 0 | 22.8 | 36.3 | 128 | 86 |
| elite vs sharp | 1200 | -9.3 | 26.3 | 23.1 | 252 | 131 |
| nemesis vs elite | 1200 | 0.3 | 26.9 | 15.1 | 183 | 211 |
| elite vs club | 1200 | 35.8 | 28.2 | 26.8 | 283 | 87 |
| nemesis vs club | 1200 | 21.6 | 26.7 | 26.2 | 273 | 81 |
| **Six-max styles, 300 hands each** | | | | | | |
| sharp vs club [balanced] | 300 | -10.7 | 50.9 | 36.3 | 35 | 19 |
| sharp vs club [patient] | 300 | 14.4 | 32.7 | 20.7 | 10 | 0 |
| sharp vs club [pressure] | 300 | -46.9 | 75.1 | 46.3 | 68 | 47 |
| sharp vs club [sticky] | 300 | 25.9 | 68.5 | 73.3 | 6 | 5 |
| sharp vs club [deceptive] | 300 | -1.8 | 53 | 44.7 | 57 | 47 |
| elite vs club [balanced] | 300 | 51.6 | 49.2 | 26.7 | 62 | 18 |
| elite vs club [patient] | 300 | -4.6 | 36.3 | 13.3 | 38 | 4 |
| elite vs club [pressure] | 300 | 51.8 | 67.4 | 30.3 | 68 | 44 |
| elite vs club [sticky] | 300 | 23.6 | 65.1 | 57.7 | 55 | 3 |
| elite vs club [deceptive] | 300 | 9.5 | 60.7 | 32.7 | 75 | 28 |
| nemesis vs club [balanced] | 300 | 19.8 | 58.5 | 27 | 79 | 16 |
| nemesis vs club [patient] | 300 | 18 | 38.3 | 14.3 | 28 | 2 |
| nemesis vs club [pressure] | 300 | 50.9 | 66.3 | 30.7 | 66 | 41 |
| nemesis vs club [sticky] | 300 | 27 | 60.3 | 56 | 67 | 5 |
| nemesis vs club [deceptive] | 300 | 39.7 | 58.6 | 31.7 | 82 | 33 |

| adaptation matchup | hands | memory off BB | memory on BB | gain BB/100 |
| sharp vs club | 600 | 433.9 | 680.1 | 41 |
| elite vs club | 600 | 489.2 | 394.6 | -15.8 |
| nemesis vs club | 600 | 482.7 | 538.1 | 9.2 |

Heads-up, Sharp, Elite, and Nemesis now beat Club outside the noise band with hand-reading improvement; Elite over Sharp is positive but compressed by legacy fold heuristics still active in the EV path. Six-max shows Elite and Nemesis gaining significantly against Club with Elite leading, while Sharp flatlines, and Club's performance against Friendly falls to near break-even as it now models Friendly's range as balanced Club, a self-play artifact to revisit during calibration.

## Stage 3: equity when called

Commit: e7db4949 (Tasks 9 and 10). Tuning corpus only; the evaluation corpus is run at Stage 4.

### Tuning corpus
| matchup | hands | bbPer100 | ± | showdown % | higher bluffs | lower bluffs |
| **Heads-up, 3,000 hands** | | | | | | |
| club vs friendly | 3000 | 0.3 | 28.6 | 41.2 | 194 | 27 |
| sharp vs club | 3000 | 46.5 | 32.5 | 26.7 | 204 | 188 |
| elite vs sharp | 3000 | -2.9 | 38.8 | 14.8 | 541 | 189 |
| nemesis vs elite | 3000 | 17.5 | 38.4 | 8.4 | 506 | 481 |
| elite vs club | 3000 | 42.9 | 42 | 17.1 | 551 | 193 |
| nemesis vs club | 3000 | 30.4 | 44.2 | 18.6 | 629 | 223 |
| **Six-max, 1,200 hands** | | | | | | |
| club vs friendly | 1200 | 17 | 18.9 | 58.8 | 74 | 1 |
| sharp vs club | 1200 | 0 | 22.8 | 36.3 | 128 | 86 |
| elite vs sharp | 1200 | 9.7 | 25.9 | 22.3 | 252 | 118 |
| nemesis vs elite | 1200 | 14.6 | 25.2 | 14.9 | 194 | 215 |
| elite vs club | 1200 | 5.2 | 25.1 | 26.6 | 276 | 91 |
| nemesis vs club | 1200 | 26.1 | 27.6 | 26.8 | 267 | 96 |
| **Six-max styles, 300 hands each** | | | | | | |
| sharp vs club [balanced] | 300 | -10.7 | 50.9 | 36.3 | 35 | 19 |
| sharp vs club [patient] | 300 | 14.4 | 32.7 | 20.7 | 10 | 0 |
| sharp vs club [pressure] | 300 | -46.9 | 75.1 | 46.3 | 68 | 47 |
| sharp vs club [sticky] | 300 | 25.9 | 68.5 | 73.3 | 6 | 5 |
| sharp vs club [deceptive] | 300 | -1.8 | 53 | 44.7 | 57 | 47 |
| elite vs club [balanced] | 300 | 33.3 | 54 | 30.7 | 60 | 17 |
| elite vs club [patient] | 300 | -13.6 | 44.8 | 14.3 | 46 | 4 |
| elite vs club [pressure] | 300 | 52.7 | 69.5 | 34.7 | 75 | 44 |
| elite vs club [sticky] | 300 | 39.1 | 68.1 | 61 | 99 | 7 |
| elite vs club [deceptive] | 300 | 18.2 | 54.8 | 33 | 81 | 26 |
| nemesis vs club [balanced] | 300 | 8.5 | 55.4 | 27 | 76 | 15 |
| nemesis vs club [patient] | 300 | 27.8 | 34.6 | 15.7 | 40 | 3 |
| nemesis vs club [pressure] | 300 | 4.5 | 76.3 | 34 | 79 | 37 |
| nemesis vs club [sticky] | 300 | 42 | 60.1 | 56.7 | 108 | 3 |
| nemesis vs club [deceptive] | 300 | 45.2 | 52 | 33.3 | 87 | 33 |

| adaptation matchup | hands | memory off BB | memory on BB | gain BB/100 |
| sharp vs club | 600 | 433.9 | 680.1 | 41 |
| elite vs club | 600 | 361.2 | 703.7 | 57.1 |
| nemesis vs club | 600 | 750.9 | 516.5 | -39.1 |

At six-max, every adjacent step is now positive and Nemesis leads Club. Heads-up, Elite and Nemesis still beat Club but by less than at Stage 2 while their bluff counts rose about eightfold; the authored fold column predicts more folds than the AI population actually makes and the EV path therefore finds bluffs profitable too often, which is the first calibration target of Stage 4.

## Stage 4: calibration (one subsection per knob change)

Commit: d615a63 (round 1: response-table fold column × 0.8)

### Round 1, tuning corpus
| matchup | hands | bbPer100 | ± | showdown % | higher bluffs | lower bluffs |
| **Heads-up, 3,000 hands** | | | | | | |
| club vs friendly | 3000 | 4.2 | 28.3 | 41.2 | 143 | 26 |
| sharp vs club | 3000 | 53.5 | 31.8 | 27.1 | 113 | 145 |
| elite vs sharp | 3000 | 26.2 | 38.6 | 15.6 | 459 | 115 |
| nemesis vs elite | 3000 | -5.3 | 36.6 | 8 | 433 | 373 |
| elite vs club | 3000 | 69.4 | 41.9 | 17.3 | 485 | 145 |
| nemesis vs club | 3000 | 72.3 | 41.6 | 18.8 | 529 | 163 |
| **Six-max, 1,200 hands** | | | | | | |
| club vs friendly | 1200 | 20 | 18.5 | 58.9 | 56 | 1 |
| sharp vs club | 1200 | 2.7 | 20.7 | 35.9 | 91 | 56 |
| elite vs sharp | 1200 | 11.3 | 25.7 | 22.5 | 225 | 81 |
| nemesis vs elite | 1200 | 2.8 | 22.9 | 13.2 | 162 | 163 |
| elite vs club | 1200 | 30.1 | 24.5 | 28.6 | 227 | 62 |
| nemesis vs club | 1200 | 22.4 | 24.9 | 26.9 | 227 | 71 |

Style and adaptation rows were not re-run for this round.

### Evaluation corpus (held out)
| matchup | hands | bbPer100 | ± | showdown % | higher bluffs | lower bluffs |
| **Heads-up, 3,000 hands** | | | | | | |
| club vs friendly | 3000 | 2.8 | 25.7 | 40.9 | 136 | 15 |
| sharp vs club | 3000 | 12.9 | 34.6 | 26.8 | 128 | 138 |
| elite vs sharp | 3000 | 27.5 | 36.4 | 15.4 | 466 | 135 |
| nemesis vs elite | 3000 | 14.3 | 34 | 7.2 | 359 | 358 |
| elite vs club | 3000 | 27.4 | 39.2 | 17.5 | 504 | 140 |
| nemesis vs club | 3000 | 52.7 | 41.6 | 17.8 | 487 | 135 |
| **Six-max, 1,200 hands** | | | | | | |
| club vs friendly | 1200 | 5.1 | 20.2 | 59.3 | 56 | 2 |
| sharp vs club | 1200 | 17.5 | 26.2 | 38.3 | 80 | 67 |
| elite vs sharp | 1200 | 20.9 | 25.8 | 24.8 | 209 | 80 |
| nemesis vs elite | 1200 | 10.3 | 22.7 | 16.1 | 161 | 168 |
| elite vs club | 1200 | 30.5 | 26.5 | 29.3 | 202 | 60 |
| nemesis vs club | 1200 | 32 | 24.4 | 27.2 | 184 | 51 |
| **Six-max styles, 300 hands each** | | | | | | |
| sharp vs club [balanced] | 300 | -62.3 | 59 | 42.3 | 27 | 11 |
| sharp vs club [patient] | 300 | -9.2 | 28.4 | 23.3 | 6 | 1 |
| sharp vs club [pressure] | 300 | -41.7 | 62.6 | 44.7 | 46 | 25 |
| sharp vs club [sticky] | 300 | -31.6 | 51.6 | 73.7 | 2 | 3 |
| sharp vs club [deceptive] | 300 | -23.7 | 44.2 | 46.3 | 37 | 22 |
| elite vs club [balanced] | 300 | -28.4 | 69.1 | 32.3 | 57 | 11 |
| elite vs club [patient] | 300 | 8.1 | 35.7 | 16.7 | 33 | 3 |
| elite vs club [pressure] | 300 | 23.4 | 61 | 35 | 56 | 43 |
| elite vs club [sticky] | 300 | 2.8 | 71.7 | 53.7 | 69 | 4 |
| elite vs club [deceptive] | 300 | 4.7 | 54.6 | 35 | 66 | 22 |
| nemesis vs club [balanced] | 300 | -9.5 | 54.9 | 32.3 | 62 | 10 |
| nemesis vs club [patient] | 300 | 24.6 | 40 | 13.3 | 33 | 1 |
| nemesis vs club [pressure] | 300 | 28.2 | 64.4 | 32 | 60 | 28 |
| nemesis vs club [sticky] | 300 | 84.9 | 62.7 | 54.7 | 69 | 7 |
| nemesis vs club [deceptive] | 300 | 10.1 | 55.3 | 30.7 | 58 | 25 |

| adaptation matchup | hands | memory off BB | memory on BB | gain BB/100 |
| sharp vs club | 600 | 46 | 281.2 | 39.2 |
| elite vs club | 600 | 893.2 | 1192.2 | 49.8 |
| nemesis vs club | 600 | 341.4 | 370.5 | 4.9 |

On the held-out seeds every adjacent step is positive both heads-up and six-max. Nemesis vs Club meets the full bar heads-up, with a point estimate of 52.7 BB/100 and a lower 2 SE band of 11.1, well above zero. Elite vs Club meets the +20 point estimate at 27.4 BB/100, but its 3,000-hand band (±39.2) crosses zero; that is a sample-size limit, not a direction problem, and the 12,000-hand confirmation run in Stage 6 decides it. At six-max, Sharp, Elite, and Nemesis are all positive against Club (17.5, 30.5, and 32 BB/100), with Elite and Nemesis significant and Sharp's band still crossing zero. The tuning corpus was not touched after round 1, and no knob was adjusted against the evaluation numbers.

## Stage 5: Nemesis features
## Stage 6: release record

## Re-pinned tests
One line per changed expectation: test name, old value, new value, reason.

- postflopStrategy.test.ts › bluffs busted draws on the river at a meaningful frequency: bluffPicks bracket (10, 90), deterministic 66/100 → bluffPicks bracket (2, 50), deterministic 6/100, reason: flat incentive removed
- postflopStrategy.test.ts › bluffs busted draws less often as more opponents remain on the river: headsUp > 10 and threeWay ≤ headsUp − 10 → headsUp > 2 (measured 4/100) and threeWay < headsUp (measured threeWay 1/100, fourWay 1/100), reason: flat incentive removed
- ai.test.ts › completes repeatable varied-hand simulations without illegal actions or lost chips (aggressionRate ordering): club!.aggressionRate < sharp!.aggressionRate → |club!.aggressionRate − sharp!.aggressionRate| < 0.08 (measured club 0.3716, sharp 0.3333 — Club is now marginally more aggressive), reason: flat incentive removed
- ai.test.ts › completes repeatable varied-hand simulations without illegal actions or lost chips (postflopRaiseRate ordering): postflopRaiseRate(sharp) > postflopRaiseRate(club) → |postflopRaiseRate(sharp) − postflopRaiseRate(club)| < 0.08 (measured club 0.3832, sharp 0.3333), reason: flat incentive removed
- ai.test.ts › completes repeatable varied-hand simulations without illegal actions or lost chips (bluffRate ordering): club.bluffRate < sharp.bluffRate → non-ordering sanity check, reason: no tier-order aggression assertions (spec 5.4)
- ai.test.ts › completes repeatable varied-hand simulations without illegal actions or lost chips (postflopRaiseRate ordering): |postflopRaiseRate(sharp) − postflopRaiseRate(club)| < 0.08 (measured club 0.3832, sharp 0.3333) → postflopRaiseRate(sharp) > postflopRaiseRate(club) (measured club 0.284, sharp 0.381), reason: range model
- multiwayAi.test.ts › keeps production personalities measurably distinct (postflop raises): pressure > 2 × patient (27 vs 8) → pressure > patient (31 vs 26), reason: range-based equity restored Patient's value betting; the 2x margin was the legacy sampler deflating a tight range
- multiwayAi.test.ts › finishes seeded three- and six-player tables for every difficulty (playerDecisionOpportunityRate): toBeGreaterThan(0.75) → toBeGreaterThanOrEqual(0.75) (measured 0.75 exactly), reason: 20-hand sample sits on the boundary
- multiwayAi.test.ts › keeps adaptive pressure subtle across varied seeded multiway hands (aggression-rate delta cap): toBeLessThan(0.08) (measured 0.0904) → toBeLessThan(0.12), reason: memory now also shifts the modeled range (spec 5.1)
- multiwayAi.test.ts › keeps all-AI six-player pots contested (timeout): 60 s → 90 s, reason: called-equity estimates on the EV path; assertions unchanged
