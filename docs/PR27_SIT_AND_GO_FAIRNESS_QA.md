# PR 27 — Sit & Go and fair-play QA

## Scope

PR 27 introduces the first Phase 3 competition mode: a resumable three-player, play-chip Sit & Go against local AI. It also hardens every live deal and every AI/coach boundary before larger tournaments are added.

The tournament starts at 60 big blinds per player. Blinds increase every four hands through fixed, visible levels. The dealer opens at a securely randomized live seat; subsequent hands move the dealer clockwise to the next live seat. Small blind and big blind are derived from that dealer and skip eliminated seats. The header always shows the hand, level, players left, and current blinds, while each seat carries its D, SB, or BB marker.

## Randomness boundary

- Live heads-up, multiway, and tournament decks use `expo-crypto.getRandomValues` through one shared random source.
- Opening dealer selection and mixed-frequency live AI choices use that source too.
- Deterministic seeded random remains available only for repeatable tests, simulations, and equity sampling; it never deals a production hand.
- Scenario and quiz sessions refresh through the secure source. Teaching questions randomize suits, choices, and order inside validated templates so the correct explanation remains true.
- A resumed tournament never restores cards. Its public checkpoint produces a completely fresh shuffled hand.

## Private-information boundary

The rules engine owns the complete hand, but neither an AI decision nor the live coach receives it. Branded fair-decision constructors expose only:

- that viewer's two hole cards;
- dealt community cards;
- public stacks, contributions, positions, and action history; and
- public betting state.

They replace every other seat's hole cards with an empty array, remove the undealt deck, and remove the final outcome. Type signatures require these restricted views at AI and equity entry points.

The server coach contract independently rejects an `opponentCards` field and rebuilds the outgoing OpenAI payload from an exact allowlist. Client-supplied deck, opponent-card, result, and pot-won fields are discarded even if a modified client tries to include them.

## Automated validation

- Fair-state tests prove hidden cards, deck, and outcome are absent from heads-up and multiway decision inputs.
- Coach-contract tests inject malicious private fields and prove none survive sanitization.
- Tournament tests cover secure opening-seat injection, clockwise live-seat rotation, blind advancement, eliminations, place calculation, public-only checkpoints, and fresh resume deals.
- Training tests verify suit/order randomization without changing answer identity.
- Gameplay presentation tests include pre-blind stack accounting so a hand result includes the hero's posted blind.
- Full TypeScript and unit-test suites pass together with the production export and mobile-secret release gate.

## iPhone simulator pass

Test device: RiverMind iPhone SE simulator, iOS 27.0.

| Journey | Evidence | Result |
| --- | --- | --- |
| Start Sit & Go | Clean Play entry; hand 1 shows level 1, three players, and 10/20 | Pass |
| Position rotation | Observed D/SB/BB rotate across hands 1–6, including after resume | Pass |
| Blind schedule | Hand 5 advanced to level 2 and 15/30 | Pass |
| Saved tournament | Exiting after hand 5 showed “Saved at hand 6”; Continue opened hand 6 with public stacks preserved and a fresh deal | Pass |
| Showdown privacy | Only live showdown participants revealed; folded hero/opponent cards stayed hidden | Pass |
| Six-player clarity | Six distinct seats rendered with D, SB, BB, UTG, LJ, and HJ; latest-action feed and current actor remained readable | Pass |
| Fresh training | Closing and reopening Scenario Training produced a different template and card deal | Pass |

## Finding fixed during the pass

The first implementation measured the result against the hero stack after forced blinds were posted, which understated a loss or overstated a win by the posted blind. Result presentation now reconstructs the pre-blind stack as `stack + totalCommitted`, with a regression test.

## Deliberate limits

- This PR ships a three-player local Sit & Go, not live multiplayer.
- A checkpoint intentionally resumes at the next uncompleted hand; an abandoned in-progress deal is never restored.
- Six- and nine-player tournament formats wait for the next performance and strategy pass.
- Coaching remains available because this is a learning tournament; ranked competitive rules can lock it off later.
