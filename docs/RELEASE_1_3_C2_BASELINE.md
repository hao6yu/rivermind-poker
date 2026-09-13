# C2 baseline — production-parity endgame measurement

Status: **INVALIDATED by the v1.3 implementation review (2026-09-10) — re-run required.** The measurement below was produced by a harness whose initial Sit & Go was constructed WITHOUT the event's authored AI difficulty, so every cohort played against the default Club roster instead of the live Elite/Nemesis table. Because `decideSessionAiAction` resolves named identities before its difficulty fallback, the numbers measured Club personas at Elite/Nemesis events. They are not production-parity measurements and must not be quoted as one. The construction defect is fixed (`championshipSimulation.ts` now passes `event.aiDifficulty`) and guarded by a roster/parity assertion (`championshipSimulation.test.ts` — "measures the event roster in production-parity mode"). The ratified targets and the round-25 confirmation inherit the same defect and are ratification-pending against corrected numbers, not met.

## Method

- Harness: `simulateChampionshipCorpus` with `productionParity: true` — the live decision call (`decideSessionAiAction`) with production identity construction (named roster identities at the seat's difficulty), invitational equity budgets (`tuning(difficulty).equitySamples × 1.5`), accumulated opponent memory, a session exploit read maintained against the hero, and the screen's legal check/call/fold error fallback (counted per cohort from this run forward).
- Initial-table construction (corrected): `createSitAndGo(..., event.playerCount, event.structureId, event.aiDifficulty)` — the same construction inputs as the live screen. The invalidated runs below omitted the difficulty argument.
- Events: RiverMind Final (8 Elite, **qualifying = first place** — the earlier "top-2" description in this report was wrong), The River Below (4 Elite + 4 Nemesis, qualify = win), The Undertow (8 Nemesis, qualify = win).
- Cohorts: five scripted strategy bots (disciplined `tag`, `calling_station`, `periodic_stealer`, `maniac`, `shove_bot`) plus the `sharp_ai_proxy` — a repeatable competent-aggressive stand-in for a skilled returning human. Proxies, never measured human rates.
- **Proxy precision label**: the sharp proxy ran at `samplesPerDecision: 8` — a deliberately reduced calibration budget, not the production Sharp decision depth. Its clear rates bound the harness's own proxy, not a production-difficulty Sharp opponent.
- Seeds: evaluation seeds disjoint from the tuning corpus (base 970_001, one block per cohort). Uncertainty: Wilson 95% bands.

## Results (INVALID — measured against the Club-default roster)

Preserved for provenance only; do not cite.

| Event | Cohort | Clear rate | Wilson band | Avg place | Avg hands |
| --- | --- | --- | --- | --- | --- |
| Final | tag | 0.0 | 0.00–0.28 | 6.2 | 70.0 |
| Final | calling_station | 0.0 | 0.00–0.28 | 8.8 | 6.4 |
| Final | periodic_stealer | 0.0 | 0.00–0.28 | 5.6 | 55.5 |
| Final | maniac | 0.0 | 0.00–0.28 | 7.7 | 13.4 |
| Final | shove_bot | 0.1 | 0.02–0.40 | 6.1 | 29.3 |
| Final | **sharp_ai_proxy** | **0.167** | 0.03–0.56 | 5.2 | 52.2 |
| River Below | tag | 0.1 | 0.02–0.40 | 3.5 | 117.3 |
| River Below | calling_station | 0.0 | 0.00–0.28 | 8.4 | 5.8 |
| River Below | periodic_stealer | 0.0 | 0.00–0.28 | 6.1 | 47.9 |
| River Below | maniac | 0.0 | 0.00–0.28 | 9.0 | 3.7 |
| River Below | shove_bot | 0.0 | 0.00–0.28 | 7.0 | 26.9 |
| River Below | **sharp_ai_proxy** | **0.333** | 0.10–0.70 | 4.3 | 72.2 |
| Undertow | tag | 0.0 | 0.00–0.28 | 5.7 | 75.3 |
| Undertow | calling_station | 0.0 | 0.00–0.28 | 8.6 | 7.8 |
| Undertow | periodic_stealer | 0.0 | 0.00–0.28 | 6.3 | 47.6 |
| Undertow | maniac | 0.0 | 0.00–0.28 | 9.0 | 3.5 |
| Undertow | shove_bot | 0.0 | 0.00–0.28 | 7.9 | 11.9 |
| Undertow | **sharp_ai_proxy** | **0.0** | 0.00–0.39 | 6.2 | 47.7 |

## Why the earlier reading no longer stands

1. The population measured was the Club roster at every event, so "the intended ordering is supported" (Elite harder than Nemesis, Undertow hardest) was never demonstrated. A re-run against the real rosters can reorder the events.
2. The Undertow conclusion exceeded its evidence even internally: 0/10 with a reported 95% band reaching 0.28 is **consistent with a true clear rate as high as ~28%** — it does not establish a ≤5% clear rate, and it does not rank the three events. The round-25 confirmation (0/15, band 0.00–0.28) has the same limit.
3. The "Final top-2 qualifying target" references were wrong: the Final requires first place (`championship_final` qualifyingPlace 1). Any reasoning that leaned on a top-2 target (e.g. explaining shove_bot's single clear) is unsound.
4. The friend's five-attempt win on the **public v1.2 binary** cannot be attributed to any cause measured here: C1's open item — matching the installed v1.2 binary to this source — was never closed, and the measurements above did not test the production roster. No evidence in this report justifies increasing aggression or attributing that result to a particular cause.

## What must happen before C1/C2/C3 can be marked complete

1. Re-run the corpus with the corrected construction (`RUN_CHAMPIONSHIP_PARITY=1 PARITY_RUNS=… pnpm vitest run src/domain/poker/__tests__/championshipParityBaseline.test.ts`). The roster/parity assertion now fails fast if the construction regresses.
2. Re-present the numbers with the Sharp-proxy precision label; re-ratify (or retire) the numeric targets against the corrected measurement.
3. Close C1's open items (live fallback-frequency measurement; v1.2 public-binary matching) — they gate any claim about the shipped experience.
4. Only then re-run the C3 exit criterion ("no known reproducible shortcut dominates the endgame evaluation") against the corrected baseline.

## What this feeds

- C3: **paused** — the exit criterion must be re-evaluated on the corrected baseline. The earlier "no tuning change warranted" verdict is withdrawn.
- Regression: every fixed exploit or runtime defect keeps a test; the baseline harness re-runs via `RUN_CHAMPIONSHIP_PARITY=1 pnpm vitest run src/domain/poker/__tests__/championshipParityBaseline.test.ts`.
