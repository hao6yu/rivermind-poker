# Local agent model scorecard

This document records implementation-model performance for comparable product
work in RiverMind Poker. Scores evaluate the model's delivered work and review
process, not the model in general. Keep first-pass quality separate from the
quality reached after another agent or a human performs additional QA.

## Scoring protocol

- Use a 0–10 scale, where 5 is usable with substantial supervision, 8 is strong
  production work with limited corrections, and 10 is exceptional work that
  survives adversarial code and device review without material correction.
- Record the model, reasoning setting, task scope, base/final commits, tests
  actually run, simulator/device coverage, review rounds, and material defects
  found after the model declared completion.
- Apply the same nine scored categories to each model. The original overall
  score is their unweighted average.
- Do not credit a model for hosted, device, visual, accessibility, audio, haptic,
  or release verification it did not actually perform.
- Record the final project-state score separately when later reviewers improve
  the implementation; that number is not a model-performance score.

## DeepSeek V4 Flash — Phase 16 Slice 3.8

Evaluation date: 2026-08-28  
Reasoning setting: maximum  
Scope: Slice 3.8A–D, ephemeral table moments, AI reactions, all-in presentation,
and next-hand pacing  
Primary commits: `c7adec04` through `0b1ba092` as listed in the Slice 3.8 release
record  
External simulator-stabilization commit: `e8a55949`

| Category | Score | Evidence summary |
| --- | ---: | --- |
| Domain architecture | 8.0 | Strong versioned contracts, pure helpers, bounded presentation state, and clear engine/presentation separation. |
| Multiplayer authority and security | 8.5 | Coordinator-authoritative commands, room/hand/sender validation, private Broadcast reuse, idempotent transitions, and useful RLS coverage. |
| Automated testing | 8.5 | Broad deterministic domain, coordinator, migration, Edge, and pgtap coverage; several important regressions were encoded well. |
| Recovery and concurrency logic | 8.0 | Countdown convergence, reconnect behavior, accepted-transition authority, and retry/idempotency design were generally strong. |
| React Native implementation | 6.5 | Functional component wiring was substantial, but several layout and sender-presentation defects survived the model's completion gate. |
| Visual and interaction judgment | 4.5 | Phone landscape, overlapping controls, subtle winner treatment, oversized sizing UI, redundant result/countdown rows, and poor bullet-screen motion required follow-up. |
| Simulator verification | 4.0 | The delivery relied too heavily on pure tests and did not catch multiple defects that were immediately visible during a real simulator walkthrough. |
| Self-review effectiveness | 6.0 | Internal review caught meaningful P1/P2 issues, but the final confidence statement was stronger than the observed UI evidence justified. |
| Efficiency | 4.5 | The result required many review/fix loops and some behavior was over-specified before the core phone interaction had been visually validated. |
| **Original overall** | **6.5** | Unweighted average of the nine categories above. |

Final project-state score after external simulator QA: **8.5/10**. This reflects
the corrected codebase, not DeepSeek's unaided delivery.

### What worked well

- Server-authoritative moment and pacing contracts were the strongest part of
  the slice.
- The model handled deterministic tests, migration boundaries, idempotency, and
  recovery substantially better than visual polish.
- Its implementation provided a sound foundation that could be corrected
  without a wholesale rewrite.

### Material issues found after completion

- The reaction launcher overlapped live and completed-hand primary controls.
- Bullet-screen messages flashed instead of moving smoothly and did not present
  the sender/phrase/sticker experience clearly.
- The player-facing per-hand reaction quota conflicted with the intended casual
  interaction; settled-hand reactions also required an authority correction.
- A locally accepted all-in could miss its presentation while waiting for a
  Realtime echo.
- Nine-seat phone landscape, winner emphasis, countdown placement, and the first
  custom-sizing design were technically functional but visually unacceptable.
- Several of these defects required actual simulator interaction to identify;
  passing pure-function tests did not validate the complete experience.

### Interpretation

DeepSeek V4 Flash at maximum reasoning was strong enough for the domain,
security, and concurrency portions of Slice 3.8. It was not reliable as the sole
reviewer for interaction-heavy React Native work. Maximum reasoning increased
thoroughness, but it also produced overconfidence and extra complexity when
direct visual evidence was missing.

## Qwen — pending evaluation

Record the exact Qwen model/version and reasoning setting before work begins.
Evaluate it with the same categories and distinguish:

1. quality at the first checkpoint-complete claim;
2. quality after its own adversarial review rounds;
3. defects found by an independent code review;
4. defects found only through simulator/device use; and
5. final project quality after external corrections.

For a fair comparison, report task complexity and changed-line count alongside
the scores. Slice 3.9 contains more information architecture and visual-product
judgment than Slice 3.8, so the raw overall score should not be compared without
that context.
