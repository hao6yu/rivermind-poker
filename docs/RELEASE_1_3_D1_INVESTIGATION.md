# D1 engineering investigation — hand-ending presentation order

Status: investigation record for `docs/RELEASE_1_3_SCOPE_DRAFT.md` D1 (core priority). Reviewed at HEAD `23a2ee64`, 2026-09-09 draft basis. This document separates source-confirmed findings from hypotheses that still need device reproduction.

## What the owner reported

During an AI game, after a river action such as an all-in, the game displays won/lost before displaying the AI's final action. Intermittent. Required sequence (from the scope draft): committed action(s) → remaining board runout → showdown reveal → pot allocation / result, with audio, haptics and a11y announcements agreeing.

## Paths traced (source-confirmed)

### Heads-up local table (`src/features/table/PokerTableScreen.tsx`)

| Surface | Mechanism | Ordered today? |
| --- | --- | --- |
| Result banner (`HandResultCard`, line 1124) | `visibleResultSummary` gated by `actionPresentationPending` (`localActionPresentationPending`, line 320), which holds while `seatActionNotice` (the action bubble) is visible | Yes |
| Result audio/haptic (line 566–595) | `localTerminalResultSchedule` delays by `headsUpActionBubbleDurationMs(tablePace)` when the terminal action was just committed | Yes, for the live path |
| AI action bubble (line 391–445) | Set on history growth; cleared by timer after `actionPresentationDurationMs` | n/a |
| Opponent card reveal (line 287) | `revealVillain = Boolean(game.outcome?.showdown)` — **not presentation-gated** | No: cards flip in the same commit as the terminal action bubble |
| Pot display (line 286) | `displayPot = game.outcome?.potWon ?? game.pot` — swaps to the final pot immediately | No |
| Seat labels (lines 991, 1075) | Derive from `game.outcome` directly | No |
| AI pacing (line 597–628 + `aiTurnDelayMs`) | `readabilityFloor` guarantees a new AI action waits ≥ one bubble duration (`gameplayPresentation.ts:182-191`) | Yes |

### Multiway local table / Championship (`src/features/table/MultiwayPokerTableScreen.tsx`)

| Surface | Mechanism | Ordered today? |
| --- | --- | --- |
| Result banner (line 1532) | `visibleResultSummary` gated by `actionPresentationPending` (line 650) fed by `actionBubble` | Yes |
| Result audio/haptic (line 997–1038) | `localTerminalResultSchedule` with `multiwayActionBubbleDurationMs(tablePace)` | Yes, for the live path |
| A11y announcement (line 890) | Same gate as banner | Yes |
| Opponent card reveal (line 635) | `revealOpponents = Boolean(game.outcome?.showdown)` — **not presentation-gated** | No |
| Pot display (line 1218) | `game.outcome?.totalPot ?? game.pot` — immediate | No |
| Elimination/result detail sheet (line 1746) | Uses ungated `resultSummary`, but opens only from the gated banner | Ok |
| AI pacing (`multiwayReadableAiDelayMs`, line 289) | Same readability floor as heads-up | Yes |

## Assessment

The steady-state live path (AI acts → transition renders → bubble → banner/audio after the bubble window) is correctly ordered on both screens. The confirmed leaks are the outcome-gated visuals (card reveals, pot swap, seat labels), which violate required-sequence steps 2–3 whenever a showdown accompanies the terminal action.

### The intermittent "won/lost before the AI's final action" mechanisms (hypotheses, need reproduction)

1. **Backgrounded timer drain.** Android throttles JS timers in the background. If the app is backgrounded between the AI's terminal action landing and the bubble window elapsing, the bubble-clear timer and the result-audio timer both fire while hidden; on return the result banner is already on screen and the player never perceived the AI's final action.
2. **Screen remount with a terminal state.** `localActionPresentationPending` relies on refs initialized against the current state (`observedActionHistory`, line 282 heads-up; equivalent in multiway). A remount (process death restore, activity recreation) with an already-terminal hand initializes the cursor at the current history length, so the terminal action is considered "presented" and the banner appears immediately — the AI's final action is skipped entirely. The shell mounts the table screens without a `key` (AppShell.tsx:1438/1506), so an in-session remount is not the routine path; process-death restore and activity recreation are the realistic triggers.
3. **Batched multi-action commits after restore/resume.** If more than one history entry arrives beyond the presented boundary (e.g. resume), today only the LAST entry becomes a bubble; earlier ones are silently folded into the banner delay of one bubble duration.

All three share the same root cause: there is no durable, ordered presentation boundary — each surface gates independently against ephemeral state that does not survive interruption.

## Fix design (agreed direction, from the scope draft)

`src/features/table/handEndingPresentation.ts` (added this round) is the common completion boundary:

- `planHandEndingPresentation(transition, pace)` returns the ordered steps — `action*` → `streetReveal` (runout) → `showdown` (never for uncontested folds) → `result` — with `startMs`/`durationMs` per step. Restored hands with nothing unpresented show the result without a re-run reveal delay.
- `recordHandPresentationCursor` / `unpresentedActionTail` keep a per-session presentation cursor at module scope so a remounted screen can reconstruct the unpresented tail (including actions committed while backgrounded) and replay it before the result. The cursor survives screen remounts but deliberately not app restarts.

## Implementation status (rounds 2 + 8)

- `src/features/table/useHandEndingPresentation.ts` — React hook wrapping the plan: computes the unpresented tail (live growth ∪ session-cursor catch-up), engages the ordered sequence for every terminal hand (fast-forwarded when restored with nothing to replay), advances steps on timers, and exposes synchronous refs (`isTerminalSequenceRef`, `resultDelayMsRef`) for same-commit effect ordering.
- Both `PokerTableScreen` (heads-up) and `MultiwayPokerTableScreen` (Championship) are wired: the legacy single-action bubble/cue is suppressed for terminal transitions, terminal bubbles/cues are plan-driven (one reading window per action), card reveals and the result surface (banner + a11y announcement + result audio) are unlocked only at the plan's reveal/result steps. Mid-hand presentation is unchanged.
- Regression layer 1: `handEndingPresentation.integration.test.tsx` (5 tests) asserts the ordered phases through the screens' gating contract — river all-in, earlier-street all-in (action → runout → showdown → result), uncontested fold, interrupted-hand replay after remount, and restore. `handEndingPresentation.test.ts` (8 tests) covers the plan and cursor rules.
- Regression layer 2 (screen level): `MultiwayPokerTableScreen.handEnding.integration.test.tsx` mounts the REAL multiway screen, plays a live practice hand through the AI pacing timers under fake clocks, and asserts that a seat action bubble is presented strictly before the result banner ever appears — the D1 acceptance's screen/presentation-level order assertion, driven through the actual component (only native modules and storage-backed services are mocked; the engine, screens, presentation plan and bubble/banner surfaces are real).

## Private-table path verified (round 16)

The authoritative multiplayer table does NOT share the local defect class: `multiplayerActionQueue.ts` already implements an ordered presentation boundary — a per-session presentation cursor (consumed transition versions, observed history length, presented action ids), drain-paced action frames (1.8s handoff, 2-frame cap), controls locked via `multiplayerActionControlsEnabled` while frames are pending, and the settled-hand summary presenting only after the queue drains. The two-client gate runs additionally showed correct hand-completion agreement after recovery. No fix required on this path.

## Remaining work

1. Device/simulator reproduction of the background-drain and remount paths (the A2 reliability gate exercises them; findings and hypotheses live in docs/RELEASE_1_3_SIMULATOR_QA.md).
