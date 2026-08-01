# PR 24 — Gameplay clarity simulator QA

## Goal

Make a live hand understandable to a first-time poker player without requiring them to decode the engine state. This pass also makes every quiz and scenario answer useful after the player chooses.

## What changed

- Highlight the acting seat and label it `Your turn`, `Acting`, or `Thinking…`.
- Keep each seat's latest action and amount visible until that player acts again.
- Show a larger central `Just happened` feed so fast AI actions are not lost.
- Show dealer, small-blind, big-blind, and common position markers at the seats.
- Slow local AI actions slightly so a player can follow the table without making play feel stalled.
- Give the live coach a concrete legal recommendation, including an exact bet or raise target when appropriate.
- Keep live recommendations deterministic and local; they do not spend an OpenAI hand-review request.
- Add an in-game cheat sheet for actions, positions, hand rankings, and common percentages.
- Reveal a specific explanation for every quiz choice and grade every scenario alternative after answering.

## Simulator matrix

Primary layout pass: iPhone SE simulator in Expo Go, using the local Expo development bundle.

| Journey | What was exercised | Result |
| --- | --- | --- |
| Heads-up table | Blind posting, acting-seat highlight, call amount, persistent action badge, latest-action feed, coach state | Pass |
| 3-player table | Preflop through later streets, AI pacing, dealer/blind markers, fold/call/raise amounts, hero turns | Pass |
| 6-player table | All seat positions, consecutive AI actions, hero action controls, compact badges, multiple streets | Pass |
| In-game guide | Open from a hand, scroll content, close back to the unchanged hand | Pass |
| Percentage/hand quiz | Choose an incorrect option, inspect the correct answer and every rejected alternative | Pass |
| Scenario training | Choose a playable alternative, inspect best/alternative/avoid grades and all explanations | Pass |

## Findings resolved during the pass

- Constrained the heads-up active-seat outline so it no longer spans the table on a narrow phone.
- Replaced third-person hero copy such as `You calls` and `You has` with natural second-person wording.
- Kept the central feed readable while preserving compact seat labels on a six-player table.
- Anchored learning feedback inside the existing scroll area so all alternatives remain reviewable without covering the completion controls.

## Boundaries and follow-up

PR 24 improves comprehension of the existing deterministic hands and content. It does not claim solver-grade live advice, and the local recommendation is labeled as a learning baseline.

The next content milestone should replace the small fixed training bank with validated scenario templates. Cards, positions, stack depths, and action lines can vary only when the generator recomputes legal actions, equity/odds facts, answer grades, and explanations. Cosmetic card randomization against a fixed answer would teach incorrect poker.
