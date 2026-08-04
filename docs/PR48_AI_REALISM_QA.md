# PR48 — AI Realism & Difficulty Ceiling QA

## Baseline (before range-table rewrite)

Captured via `pnpm eval:multiway-ai` on branch `codex/preflop-range-tables`, immediately
after adding flop-participation/preflop-entry metrics (this task adds instrumentation
only — no AI behavior changed).

```
> rivermind-poker@1.0.0 eval:multiway-ai
> PRINT_MULTIWAY_AI_METRICS=1 vitest run src/domain/poker/__tests__/multiwayAi.test.ts --reporter=verbose

 RUN  v4.1.10

 ✓ keeps a unique expanded roster across five stable personalities 1ms
 ✓ never uses another seat hidden cards to estimate or choose an action 22ms
 ✓ keeps a postflop decision unchanged when every other hidden hand changes 29ms
 ✓ prices the same premium hand lower as more live ranges enter the pot 102ms

does not surrender the big blind too often to a repeated 2.5 BB small-blind open:
┌─────────┬────────────┬───────┬───────┬────────┬────────────┬──────────┐
│ (index) │ difficulty │ calls │ folds │ raises │ defendRate │ foldRate │
├─────────┼────────────┼───────┼───────┼────────┼────────────┼──────────┤
│ 0       │ 'friendly' │ 188   │ 180   │ 32     │ 0.55       │ 0.45     │
│ 1       │ 'club'     │ 166   │ 189   │ 45     │ 0.5275     │ 0.4725   │
│ 2       │ 'sharp'    │ 146   │ 189   │ 65     │ 0.5275     │ 0.4725   │
│ 3       │ 'elite'    │ 183   │ 144   │ 73     │ 0.64       │ 0.36     │
│ 4       │ 'nemesis'  │ 184   │ 142   │ 74     │ 0.645      │ 0.355    │
└─────────┴────────────┴───────┴───────┴────────┴────────────┴──────────┘

defends more often after observing a persistent preflop raiser:
┌──────────┬───────┬───────┬────────┬────────────┬──────────┐
│ (index)  │ calls │ folds │ raises │ defendRate │ foldRate │
├──────────┼───────┼───────┼────────┼────────────┼──────────┤
│ baseline │ 146   │ 189   │ 65     │ 0.5275     │ 0.4725   │
│ adapted  │ 158   │ 177   │ 65     │ 0.5575     │ 0.4425   │
└──────────┴───────┴───────┴────────┴────────────┴──────────┘

finishes seeded three- and six-player tables for every difficulty:
┌─────────┬────────────┬─────────┬───────────┬──────────┬──────────┬───────────────┬─────────────┬─────────┐
│ (index) │ difficulty │ players │ decisions │ raisePct │ bluffPct │ foldFacingPct │ showdownPct │ walkPct │
├─────────┼────────────┼─────────┼───────────┼──────────┼──────────┼───────────────┼─────────────┼─────────┤
│ 0       │ 'friendly' │ 3       │ 122       │ 10.7     │ 0        │ 38.9          │ 70          │ 20      │
│ 1       │ 'friendly' │ 6       │ 235       │ 14       │ 0        │ 53.8          │ 90          │ 0       │
│ 2       │ 'club'     │ 3       │ 105       │ 22.9     │ 1        │ 47.2          │ 55          │ 20      │
│ 3       │ 'club'     │ 6       │ 199       │ 22.1     │ 3        │ 59            │ 65          │ 0       │
│ 4       │ 'sharp'    │ 3       │ 108       │ 38       │ 9.3      │ 43.9          │ 50          │ 20      │
│ 5       │ 'sharp'    │ 6       │ 185       │ 26.5     │ 3.8      │ 56.7          │ 65          │ 0       │
│ 6       │ 'elite'    │ 3       │ 103       │ 46.6     │ 9.7      │ 37.5          │ 65          │ 15      │
│ 7       │ 'elite'    │ 6       │ 184       │ 28.3     │ 4.3      │ 57.5          │ 70          │ 0       │
│ 8       │ 'nemesis'  │ 3       │ 102       │ 47.1     │ 9.8      │ 37.5          │ 65          │ 15      │
│ 9       │ 'nemesis'  │ 6       │ 189       │ 29.6     │ 4.8      │ 54.3          │ 75          │ 0       │
└─────────┴────────────┴─────────┴───────────┴──────────┴──────────┴───────────────┴─────────────┴─────────┘

keeps all-AI six-player pots contested through a healthy number of showdowns:
┌─────────┬────────────┬───────────────┬─────────────────┬────────────────────┬─────────────┬─────────┐
│ (index) │ difficulty │ foldFacingPct │ foldsFacingOpen │ foldsFacingReraise │ showdownPct │ walkPct │
├─────────┼────────────┼───────────────┼─────────────────┼────────────────────┼─────────────┼─────────┤
│ 0       │ 'friendly' │ 56.3          │ 240             │ 49                 │ 57.5        │ 8.5     │
│ 1       │ 'club'     │ 61.1          │ 313             │ 101                │ 27.5        │ 10      │
│ 2       │ 'sharp'    │ 57.3          │ 282             │ 181                │ 23          │ 7       │
│ 3       │ 'elite'    │ 58.2          │ 321             │ 141                │ 23          │ 3.5     │
│ 4       │ 'nemesis'  │ 58.5          │ 289             │ 177                │ 20          │ 4.5     │
└─────────┴────────────┴───────────────┴─────────────────┴────────────────────┴─────────────┴─────────┘

keeps production personalities measurably distinct across a six-player corpus (club, 6p, 120 hands):
┌─────────┬─────────────────────┬───────────┬──────────┬─────────┬───────────────┬─────────┬──────────┐
│ (index) │ identity            │ decisions │ raisePct │ callPct │ callFacingPct │ foldPct │ bluffPct │
├─────────┼─────────────────────┼───────────┼──────────┼─────────┼───────────────┼─────────┼──────────┤
│ 5       │ 'kai-balanced'      │ 253       │ 23.3     │ 19.8    │ 30.1          │ 36      │ 1.2      │
│ 6       │ 'iris-patient'      │ 213       │ 13.1     │ 14.1    │ 19.9          │ 49.3    │ 0.9      │
│ 7       │ 'dex-pressure'      │ 263       │ 24.3     │ 15.2    │ 23.7          │ 33.8    │ 1.1      │
│ 8       │ 'lena-sticky'       │ 253       │ 16.2     │ 20.6    │ 32.1          │ 37.9    │ 0.4      │
│ 9       │ 'amir-deceptive'    │ 242       │ 20.7     │ 14      │ 21            │ 40.5    │ 2.5      │
└─────────┴─────────────────────┴───────────┴──────────┴─────────┴───────────────┴─────────┴──────────┘
(all other roster identities show 0 decisions — this run only seats the "club" difficulty's
5-identity subset at a 6-player table; the other 22 identities belong to different difficulty tiers.)

reports flop participation, three-bet, and preflop entry metrics (club, 5p, 160 hands):
┌──────────────────┬─────────────────────────┐
│ (index)          │ Values                  │
├──────────────────┼─────────────────────────┤
│ flopRate         │ 0.5625                  │
│ multiwayFlopRate │ 0.15                    │
│ walkRate         │ 0.11875                 │
│ threeBetRate     │ 0.2125                  │
│ participants     │ '{"2":66,"3":21,"4":3}' │
└──────────────────┴─────────────────────────┘

 Test Files  1 passed (1)
      Tests  22 passed (22)
```

Reference points measured earlier on this codebase (5-player all-AI, production
decision path): ~46-50% of hands ended preflop, 68-73% of flops heads-up,
multiway flops 13.4% (sharp) / 17.1% (club) / 17.2% (elite) of hands,
walk rate 13-15% (club/sharp), per-player fold-vs-open 50-66%.

The new club/5-player/160-hand sample above (flopRate 56.25%, multiwayFlopRate 15%,
threeBetRate 21.25%) is directionally consistent with those reference points and now
has instrumentation (`flopsSeen`, `flopParticipantCounts`, `multiwayFlops`,
`threeBetHands`, `flopRate`, `multiwayFlopRate`, `threeBetRate`, plus per-identity
`vpipOpportunities` / `vpipEntries` / `pfrEntries`) to track drift as the range-table
rewrite lands in later tasks.

## Intentional test-expectation changes

| Test | Old expectation | New expectation | Design reason |
|---|---|---|---|

## Final metrics

(filled by Task 13)
