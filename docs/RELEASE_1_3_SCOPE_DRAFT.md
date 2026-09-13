# RiverMind 1.3 — Better game nights and a stronger Championship

Status: revised proposal for discussion, 2026-09-09. No implementation or release commitment is implied.

## Direction agreed in this discussion

Focus on the gaming experience: existing private multiplayer tables, Championship, UI/UX, game feel, reliability and meaningful challenge. No further training feature development this release. The owner selected improving existing private tables rather than adding private tournaments.

Scope feedback: **A1 (lobby clarity and saved setup) is removed**; the owner does not see enough value in it. **A2 (clear table status and recovery) is supported.** Other tracks remain proposals for discussion. Keep section IDs stable while reviewing the scope.

The owner also reports an intermittent AI-game presentation issue: after a river action such as an all-in, the game displays won/lost before displaying the AI's final action. **Fixing this hand-ending sequence is a core release priority (D1).** The precise mode, reproduction and root cause remain to be established.

The owner reports that a friend won **The Undertow, the second hidden event, on public v1.2 within five attempts**. The player's strategy and exact installed build are unknown. This makes The Undertow the first balance-validation priority. Treat the result as useful player feedback, not proof of a specific AI defect.

## Recommended release outcome

Friends can start and continue a game with less friction, understand the table's state, and trust the result. Championship feels like a connected tournament journey: clear stakes, distinctive events, satisfying victories and a credible difficulty curve.

Four core tracks:

1. Private-table flow and reliability.
2. Championship progression and presentation.
3. Measured Championship difficulty and targeted AI fixes.
4. Shared table readability, pacing and feedback.

## What already exists

Private tables already have room codes and invitations, readiness, human/AI seats, turn clocks, reconnect and resume, host controls, pause/resume, rebuys, sitting out, reactions, session results and rematches. Improve these capabilities rather than reintroducing them as new features.

Championship already has an illustrated map, a list view, venue previews, saved runs, ten main events, records/achievements and two hidden invitation events in the reviewed source. The table already has action badges, an activity feed, result presentation, sound/haptics, and recent nine-seat/foldable fixes.

Review basis: repository HEAD `23a2ee64`, version `1.2.0`, current source, prior release records and September 9 Android QA screenshots. Findings below distinguish source-confirmed behavior from issues that still need device reproduction. The source tree has not been matched to the friend's installed binary; no fresh production-device or multiplayer session test was performed in this scope review.

## What the difficulty evidence actually says

The current event configuration is:

| Event | Opponents | Starting depth / turn clock |
| --- | --- | --- |
| Championship Final | Eight Elite | 80 BB / no invitation clock |
| The River Below | Four Elite, four Nemesis | 100 BB / 45 seconds |
| The Undertow | Eight Nemesis | 100 BB / 30 seconds |

The recorded Stage 6 calibration in `docs/AI_LADDER_QA.md` reports a Sharp-proxy hero winning the Final 11/80 times (13.75%) and The River Below 8/80 times (10%). Those are simulations, not measured human win rates. They precede the Stage 7 range-read fixes; the later record reruns the ladder, not this tournament corpus.

There is no measured Undertow clear rate in this tournament-calibration record. The River Below's 10% proxy result cannot be transferred to The Undertow or used to explain this friend's win. One win within five attempts does not establish the player's underlying win probability, but the hardest event's missing calibration means its intended difficulty has not been demonstrated by this evidence.

The latest recorded 12,000-hand heads-up benchmark has Nemesis beating Club by 47.7 BB/100 with a reported uncertainty band of ±19.8, but beating Elite by only 1.6 ±17.7. The six-player Nemesis-over-Elite band also crosses zero. Nemesis's additional features are human-tendency adaptation and conditional river overbets; the record explicitly says the relevant human adaptation does not activate in its self-play benchmark. The evidence supports a substantial improvement over Club, but does not establish a massive jump over Elite or an exceptionally low human clear rate.

There are also concrete evaluation gaps:

- The tournament calibration suite covers the Final and `CHAMPIONSHIP_INVITATIONAL_EVENT`, which resolves to The River Below. It does not include The Undertow.
- The calibration uses reduced equity-sampling budgets. It does not pass the live app's session exploit read, and its roster/identity construction differs from the current live path. It should not be treated as an exact simulation of the shipped experience.
- Existing tournament assertions primarily prove valid completion, wins/losses and activity; they do not enforce a defined endgame difficulty target or a maximum success rate for simple exploit strategies.

General context: poker outcomes fluctuate because chance remains part of the game, as described by [PokerStars' explanation of variance](https://www.pokerstars.com/poker/learn/lesson/bad-beats-and-variance/). The decision to revisit RiverMind's balance comes from the internal evidence and player report above.

## Track A — Private tables that are easier to run

### A2. Clear table status and recovery — core

- Use one consistent status area for reconnecting, paused by host, waiting for players, sitting out, returning next hand and rebuy required.
- Put the relevant recovery action next to that status. Disable stale betting controls while state is uncertain; distinguish submitting an action from waiting for the next player.
- Make host pause/resume and end-session controls easy to find. Explain whether the current hand continues and when a pause takes effect, following authoritative room behavior.
- Improve turn/countdown visibility and tap targets, especially on compact phones. Opening player information or reactions must not conceal the decision deadline.
- Review errors in context: expired invitation, room already started, seat unavailable and transient network failure need an appropriate next action.

Reliability gate: two actual clients complete create/join, several hands, background/foreground, network interruption, host departure, sitting out, rebuy, pause/resume and rematch. Verify authoritative chips, pot, acting seat, deadlines and session number agree after recovery. Reproduce historical findings before calling them current bugs; prior records include old fixed issues and incomplete device evidence.

### A3. Results and rematch — core

- Fix completion-reason copy: the current summary maps `host-ended` to the hand-limit label.
- Clarify the distinction between the last hand's winner and the session's result.
- Make rematch → lobby → ready → start continuous, with clear waiting and host-transfer feedback. Rematch and fresh readiness already exist.
- Resolve the standings rule for rebuy-enabled sessions. Current standings rank final stack while also showing net chips after all buy-ins. Proposed 1.3 rule: rank new private sessions by net chip result, display final stack separately, and state the rule before play. This is a product-rule change to confirm during design, not an arithmetic bug. Do not silently rewrite historical rankings.

### A4. Room game-night scorecard — stretch

Add a same-room scorecard across completed rematches: session wins, net chips and games played for the people in that room. Use authoritative completed records, account for every rebuy, preserve departed participants in historical results, and handle ties and changing rosters explicitly. No persistent league, global ranking or friend graph.

This is the first multiplayer addition to cut if core recovery or result correctness expands.

## Track B — Championship should feel like a tournament journey

### B1. Resume and next-event flow — core

- A button labeled **Resume** resumes the saved event directly. Put **Restart event** behind a separate deliberate action. Currently the event's Resume route opens another Cancel/Restart/Continue choice.
- After qualifying, make **Next event** the primary action, opening its preview. After elimination, make **Try again** primary. Keep Map and existing review access secondary.
- Preserve selection and useful map position when returning from an event. Make current, completed and locked stops easy to distinguish in both map and list views.
- Protect the saved run when browsing or choosing another event. Explain replacement only when the player actually chooses a conflicting new run.

Source-confirmed target: the current Championship summary uses **Review every hand** as its primary action, followed by Retry event and Championship map; there is no direct Next event action. Reordering this gameplay surface does not expand training.

### B2. Tournament HUD — core

Add a compact tournament-status view with:

- current placement by stack and players remaining;
- the qualifying target;
- current blinds and hands until the next blind level;
- a clear qualification/bubble or heads-up milestone when relevant;
- a small standings drawer available without covering the legal action row.

Use current public tournament state. A temporary chip position is not a guaranteed finishing place. In timed invitation games, opening the drawer does not stop the clock. Keep one readable compact status line and put details in the drawer.

### B3. Event identity, victory and rewards — core

- Reuse venue artwork, event color accents and existing roster assets for a short, skippable event introduction. Carry a restrained venue identity into the table header/rail without competing with cards.
- Give elimination, qualification, stage completion and hidden invitation unlocks distinct presentation.
- Give Championship victories a short podium/trophy moment with the finishing place, event and newly unlocked destination. Preserve suspense: reveal hidden event names only at the intended unlock.
- Extend the existing Championship record with a small set of cosmetic title/border rewards for meaningful milestones. Reuse earned progress to grant these to existing champions; do not reset the tour.
- Honor reduced motion and sound preferences. Show no repeat unlock celebration on reload or failed-save retries.

Done when the player understands what they achieved and what they can play next, and the late events feel distinct from a generic custom AI table.

## Track C — Credible endgame challenge

### C1. Validate the exact game path — required first

- Start with The Undertow on the public v1.2 build: verify that all eight opponents execute the intended Nemesis path, then establish a production-equivalent full-event baseline. Match the installed build to source before attributing the player's experience to current HEAD.
- Confirm event-to-seat difficulty mapping, production roster, equity budgets and tournament rules on fresh, resumed and shrinking tables through heads-up play.
- Exercise the human-tendency adaptation path and verify when Nemesis-specific features activate and whether they improve decisions.
- Check exception fallback frequency: the live table catches AI errors and falls back to a legal check/call/fold. Frequent fallback could soften a supposedly strong table, but no such frequency was established in this review.
- Check how pause, restart and resume interact with public checkpoints, per-session adaptation and attempt counts. Treat these as integrity questions, not accusations about the friend.
- Bring tournament evaluation into parity with production before relying on win-rate measurements. Keep fast smoke tests separate from slower balance evaluation.

### C2. Measure all three endgame events — core

Evaluate The Undertow first, then compare it with the Final and The River Below across full runs, multiple independent seeds and several opponent-testing styles: disciplined tight play, loose calling, repeated small steals, aggressive multi-street betting and frequent shoves. Include informed human testers and, if available, the friend's observed approach.

Report event clear rate with uncertainty, finish distribution, run length, big-pot/concession patterns, and behavior as the table shrinks. Use separate tuning and evaluation seeds. Do not label the Sharp proxy as a measured human skill category.

The product target should be **challenging but fair**, with the Final accessible to a capable returning player, The River Below a harder step, and The Undertow the hardest. Define numeric targets for named tester/strategy cohorts after establishing the baseline and before tuning. Do not promise that a good player must lose an arbitrary number of attempts.

### C3. Fix demonstrated weaknesses — bounded core

Prioritize repeatable weaknesses found in C1/C2: exploitable fold/call behavior, incoherent actions across streets, weak short-handed transitions, ineffective adaptation or incorrect tournament pressure. Change difficulty through decision quality and coherent opponent behavior, then rerun the affected tests and event calibration.

Increasing aggression, shortening clocks, increasing stacks or adding more sampling is not by itself a sufficient difficulty improvement. Preserve hidden-card fairness, legal play, chip conservation, existing earned progress and acceptable device latency. A solver or wholesale AI replacement is outside this release.

Exit: no known reproducible shortcut dominates the endgame evaluation; the intended event ordering is supported by evidence or remaining uncertainty is stated explicitly. No claim that the boss is unbeatable or that a five-attempt win is impossible.

## Track D — Shared game feel and issue closure

### D1. Correct hand-ending presentation order — core priority

Owner-reported issue: during an AI game, especially after a river all-in or another final action, won/lost appears before the AI action that resolves the hand. Players should see the cause before the outcome.

Required visible sequence:

1. Present the player's committed action and amount.
2. Present every remaining AI response in action order, including the last call, fold or all-in.
3. If betting ended before the river, present the remaining board runout in order. Reveal showdown cards only when appropriate; an uncontested fold does not require a showdown.
4. Show pot allocation and the win/loss/split result, with matching sound, haptics and accessibility announcements.
5. Offer the next hand or tournament/session result. No late action from the completed hand may appear after its outcome or leak into the next hand.

Engineering investigation: both local table screens already gate their concise result banner with `localActionPresentationPending`. The multiway screen still derives opponent-card reveal directly from `game.outcome`, and result feedback is scheduled separately. These are source-confirmed paths to inspect, not a reproduced root-cause diagnosis. Trace all terminal UI, seat status, card reveals, payout displays, audio and summary entry points against the action presentation sequence. Use a common completion boundary for presentation; adding an arbitrary delay to one label is not enough.

Acceptance:

- Reproduce and fix the reported river transition in the actual AI-game flow, covering heads-up and multiway paths as applicable.
- Cover final calls, checks and folds; hero- and AI-initiated all-ins; multiple callers; earlier-street all-in runouts; split/side pots; and tournament-ending hands.
- Results, revealed cards and terminal cues cannot announce the outcome before the final action is presented. Relevant action amounts remain readable.
- Test fast/normal pace, rapid input, background/return and delayed frames. Stale timers, queued actions and sounds are cancelled or reconciled on hand/session changes.
- Add a regression at the screen/presentation integration level that asserts event order, rather than only testing a delay helper.
- Preserve engine settlement, persistence and authoritative multiplayer deadlines. Presentation ordering must not alter who wins or wait to save a completed hand until an animation finishes.

Start with the reported local AI flow, including Championship. Verify the corresponding private-table sequence because it has its own snapshot/presentation path; do not assume the same defect exists there without reproduction.

### D2. Readability, pacing and feedback — supporting polish

- Keep dealer/blind markers, active-seat emphasis, names, stack amounts and full action details legible at 2/3/6/9 seats. Preserve the latest perimeter layout and Android rotation/fold continuity fixes.
- Tighten hand-result pacing: let players recognize the winning combination and pot allocation before the next deal; offer appropriate skip/continue behavior using the existing local pace and server deadline contracts.
- Refine card reveal, pot award, elimination and turn-change feedback. Reuse existing sounds, haptics and all-in/reaction infrastructure; prioritize clarity over adding effects.
- Consolidate secondary table actions into a consistent menu; keep betting, urgent return/rebuy controls and the turn deadline immediately reachable.
- Check overlay collisions involving results, reactions, player profiles, bet sizing and reconnect banners. Respect text scaling, reduced motion, safe areas and screen readers in all shipped locales.

Potential additions after core closure: a small server-owned time bank for private games, or a cancellable **Check if possible** pre-action. Both affect timed action correctness and need their own protocol/state tests; neither is treated as a cheap UI-only checkbox for 1.3.

## Initial issue and evidence ledger

| Finding | Classification | Proposed action |
| --- | --- | --- |
| Won/lost displayed before the AI's final action after a river decision | Owner-reported intermittent AI-game issue; root cause not yet reproduced | D1 core priority; enforce action → resolution → result across visuals and cues |
| Host-ended session shown as hand limit | Source-confirmed copy defect | A3; cover all three completion reasons |
| Rebuy-enabled standings use final stack | Source-confirmed rule ambiguity | A3; agree and disclose the ranking rule |
| Championship primary result action leads to review | Source-confirmed UX mismatch with this release direction | B1; qualify → next event, bust → retry |
| Resume button asks Continue/Restart again | Source-confirmed redundant step | B1; explicit Resume and separate Restart |
| Countdown component has 9-point compact text and a 20-point minimum root height | Source-confirmed risk; actual touch/layout impact needs device measurement | A2/D; test the effective interactive area and improve it |
| Final hidden event missing from tournament calibration | Source-confirmed evaluation gap | C1/C2; add The Undertow explicitly |
| Calibration differs from live runtime | Source-confirmed evaluation gap | C1; parity before balance claims |
| Friend cleared The Undertow within five tries | Owner-reported outcome; no matching event calibration in the reviewed record | C1/C2 first priority; verify the shipped Nemesis path and measure the full event |
| Stuck turns, rebuy/reconnect divergence, repeated unlocks, unexpected save loss | Regression risks, not newly reproduced defects | Reproduce on the release candidate; fix supported findings |

## Delivery order and release boundary

1. Reproduce and fix the reported AI hand-ending sequence (D1), then verify current private-table and Championship journeys and close clear correctness/copy defects. Establish C1/C2 balance baseline alongside this work.
2. Deliver in-game status/recovery clarity (A2) and Championship resume/results/HUD.
3. Add event identity and milestone rewards; fix balance weaknesses supported by the baseline.
4. Run integrated two-client, full-tournament, upgrade, compact-layout, accessibility and latency checks. Add the room scorecard only if the core is stable.

If scope grows, cut the room scorecard, extra cosmetic variants and elaborate animations first. Keep correct action/result sequencing, result correctness, reconnect reliability, the Championship game loop and endgame validation.

Excluded: A1 lobby/setup redesign and saved table presets, training expansion, personal study libraries, private tournaments with rising blinds, public matchmaking, persistent leagues, global leaderboards, new poker variants, new seat counts, monetization, account linking/cloud recovery, a navigation redesign and a full AI rewrite. Existing training remains available; game-mode presentation can be simplified.

## Acceptance evidence

- Hand-ending sequence: a reproduced AI-game fixture and screen/presentation regression prove the final action precedes showdown/payout/result, including the reported river all-in case. Device evidence confirms visuals and sound agree.
- Private tables: two clients on different platforms complete the lifecycle matrix with matching authoritative state and correct results after rebuys.
- Championship: clean start, resume, elimination, qualification, main-tour completion and both invitation unlock paths work, with direct next actions and preserved progress after upgrade.
- Balance: documented production-path evaluation, all three endgame events, independent evaluation seeds, uncertainty and device performance; retain a regression for every fixed exploit or runtime defect.
- Presentation: compact phone, tablet and foldable/rotation checks; dark/light, large text, shipped languages and screen readers. Effects cannot block actions or delay the authoritative clock.
- Playtest questions: can guests join without the host explaining the UI; can everyone identify what the table is waiting for; do players understand session rankings; do Championship wins feel rewarding; do late opponents feel harder for understandable reasons?

No full benchmark, new gameplay test run or release certification was performed while writing this draft.

## Source pointers

- Private setup/lobby: `src/features/multiplayer/MultiplayerFlowModal.tsx`, `multiplayerLobbyState.ts`, `privateTableSetup.ts`.
- Lifecycle/rematch: `src/domain/multiplayer/contracts.ts`, `coordinator.ts`, `src/features/multiplayer/multiplayerLifecycleUi.ts`.
- Results: `src/domain/multiplayer/sessionSummary.ts`, `src/features/multiplayer/MultiplayerSessionSummaryModal.tsx`.
- Countdown: `src/features/multiplayer/MultiplayerSettledCountdown.tsx`.
- Championship journey: `src/features/shell/ChampionshipModal.tsx`, `ChampionshipMap.tsx`, `ChampionshipVenuePreview.tsx`, `AppShell.tsx`.
- Championship live/result UI: `src/features/table/MultiwayPokerTableScreen.tsx`.
- Local action/result sequencing: `src/features/table/PokerTableScreen.tsx`, `MultiwayPokerTableScreen.tsx`, `gameplayFeedbackEvents.ts`, `gameplayFeedbackEvents.test.ts`.
- Event definitions/structure: `src/domain/poker/championship.ts`, `tournament.ts`.
- Difficulty evidence: `docs/AI_LADDER_QA.md`, Stage 6 tournament calibration and Stage 7 ladder tables.
- Evaluation/runtime comparison: `src/domain/poker/__tests__/championshipSimulation.test.ts`, `championshipSimulation.ts`, `multiwaySession.ts`, `sessionExploitRead.ts`.
- Latest visual regression evidence: `artifacts/android/foldable-seat-qa/perimeter-verification.md` and its screenshots.
