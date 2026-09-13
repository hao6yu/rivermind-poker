# C1 production-path parity — Championship endgame evaluation

Status: investigation record for `docs/RELEASE_1_3_SCOPE_DRAFT.md` C1. Reviewed at HEAD `23a2ee64` plus the in-flight v1.3 working tree. Source-confirmed unless marked otherwise.

## The Undertow production path (source-confirmed)

1. Event roster: `championship.ts:113` — `the_undertow` seats eight `'nemesis'` opponents, invitational, 30-second turn clock, qualifying place 1.
2. Seat → difficulty: `championshipOpponentDifficulty` (`championship.ts:238`) maps `ai-N` to `opponentDifficulties[N-1]` and throws on a mismatch — every Undertow seat executes the Nemesis tier.
3. Decision entry: the multiway table's AI effect (`MultiwayPokerTableScreen.tsx:1055-1098`) calls `decideSessionAiAction(current, playerId, decisionDifficulty, secureRandom, opponentMemory, tournamentDecisionContext, decisionSimulations, sessionReadRef.current)` — the Nemesis path receives the human-tendency memory and the session exploit read (except in daily mode, which does not apply here).
4. Equity budget: invitational events use `Math.round(multiwayDifficultyTuning(decisionDifficulty).equitySamples * 1.5)` (`MultiwayPokerTableScreen.tsx:1062-1064`) — a 1.5× sampling boost over the tier default.
5. Error fallback: the same effect catches AI decision failures and applies a legal check/call/fold (`multiway_ai_decision_failed` diagnostic). The calibration harness counts its fallbacks per run (`aiFallbacks`); a live-session frequency measurement remains open.

Conclusion: the shipped Undertow table does route all eight seats through Nemesis with the boosted budget. The friend's v1.2 result cannot be attributed to a mis-routed difficulty.

## Calibration harness vs. live path — confirmed parity gaps

`championshipSimulation.ts` `playSimulationHand` vs the live decision call:

| Concern | Live path | Calibration harness | Impact |
| --- | --- | --- | --- |
| Opponent identity | `opponentIdentity(state, playerId, difficulty)` → `multiwayAiIdentityForName(playerName) ?? multiwayAiIdentityAt(index, difficulty)` (`multiwaySession.ts:44-57`): production seats are NAMED roster identities carrying the seat's difficulty | `multiwayAiIdentityAt(opponentIdentityIndex(playerId))` with no difficulty argument (defaults toward the friendly flavor) and ignores seat names | Simulated Nemesis seats do not carry their production personas/styles |
| Identities map | `multiwayIdentityMap(state, difficulty)` with the deciding seat's difficulty | `multiwayIdentityMap(state)` (default difficulty) | Cross-identity reads differ |
| Equity budget | Invitational: `tuning(difficulty).equitySamples * 1.5`; otherwise the tier default | `samplesPerDecision * (tuning(difficulty).equitySamples / tuning('sharp').equitySamples * invitationalScale)` with `samplesPerDecision` default 24 | Reduced budgets; Nemesis decisions are cheaper and weaker than production |
| Tournament context | `{ enabled: true, qualifyingPlace }` (`tournamentDecisionContext`, `MultiwayPokerTableScreen.tsx:648-650`) | `{ enabled: true, qualifyingPlace }` | None — matches. (`buildTournamentPressure` feeds only the hero's UI label, not AI decisions.) |
| Session exploit read | `sessionReadRef.current` (exploit read of the human session) | not passed | The adaptation path against the human is absent from calibration |
| Hero | the human | Sharp AI proxy or one of five scripted strategies (`periodic_stealer`, `tag`, `calling_station`, `maniac`, `shove_bot`) | Expected and acceptable — proxies, labeled as such |

These confirm the scope draft's claims: the calibration suite is not production-equivalent, and its win rates must not be quoted as shipped-experience measurements. C2 work must close the first five rows before measuring.

## Review finding (2026-09-10): initial-table construction gap — fixed

The `productionParity` mode closed the five rows above for the DECISION path, but the review found the harness still constructed its initial Sit & Go without the event's authored difficulty (`createSitAndGo` defaulted to Club), so parity runs seated the Club roster even at Elite/Nemesis events — a sixth construction gap the decision-call parity could not see. Fixed: `simulateChampionshipTournament` now passes `event.aiDifficulty`, and `championshipSimulation.test.ts` asserts the roster (opponent names must come from the event's roster tier; zero Club decisions at an Elite event). Consequence: every C2 number produced before this fix measured the wrong population and is invalidated — see `docs/RELEASE_1_3_C2_BASELINE.md`.

## Corpus gap (source-confirmed)

The tournament corpus in `championshipSimulation.test.ts` seeds the Final and The River Below (`CHAMPIONSHIP_INVITATIONAL_EVENT`) only; The Undertow has no calibration entry. C2 adds it explicitly with independent evaluation seeds.

## Adaptation activation — VERIFIED (round 17)

The human-tendency adaptation is structurally active in production and measurably moves decisions:

- Wiring: the hero seat is absent from the identities map, so `resolveMultiwayOpponentRangeIdentity` falls back to `GENERIC_HUMAN_RANGE` for the hero; only that generic-human model consumes `opponentMemory` (`multiwayAi.ts` line ~438), and `buildOpponentAdaptation` scales the Nemesis calling tolerance, raise sizing, pressure frequency, bluff frequency, and value thresholds by observed-sample confidence.
- End-to-end regression: `multiwayAi.test.ts` — "pressures an observed folder more than a calling station" runs the same fixed flop spot against two 60-hand memory profiles; the Nemesis bet/pressure distribution moves in the exploitative direction on both.
- All-AI calibration intentionally keeps the adaptation inert (no generic-human seat) — which is exactly why the parity harness passes the scripted hero's session read and memory.

## Still to verify (C1 remainder — gating completion claims)

- Fallback frequency on fresh, resumed, and shrinking tables: the counter is instrumented in the harness results (`aiFallbacks`); a live-session measurement remains.
- Match an installed v1.2 binary to this source before attributing the friend's experience to HEAD. Until this closes, no measurement in C1/C2 may be used to explain the public-v1.2 result.

C1 is not complete while either item is open.
