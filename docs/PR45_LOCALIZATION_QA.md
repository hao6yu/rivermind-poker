# PR 45 learning localization QA

## Scope

- English, Simplified Chinese, and Traditional Chinese lesson bodies
- Percentage trainer and hand quiz prompts, choices, feedback, and explanations
- Randomized scenario copy for all 14 validated templates
- Hand rankings, position, percentages, and preflop reference sheets
- Interactive 169-hand preflop range explorer
- In-game table guide learning content

## Content invariants

Localization changes presentation copy only. Automated tests verify that every language preserves:

- card identities and board state;
- question and choice IDs;
- correct answers, scenario grades, and best-action IDs;
- scenario pot-odds calculations;
- reference examples and hand-ranking probabilities.

## Layout matrix

| Device | Language | Result |
| --- | --- | --- |
| Compact 4.7-inch iPhone simulator | Simplified Chinese | Learn list and lesson layout visually checked; no clipping or footer overlap |
| iPhone 17 Pro simulator | Traditional Chinese | Lesson header, cards, body copy, and completion footer visually checked |
| 11-inch iPad simulator target | English/Chinese responsive rules | Native target compiled; learning content and action areas capped at 720–760 pt for readable line length |

The local Xcode 27 simulator cannot launch the existing native app target after compilation because apps built with that SDK now require UIScene lifecycle adoption. This is a local native-toolchain compatibility issue; Expo Go and the EAS/TestFlight toolchain are unaffected. A future native-maintenance PR should adopt UIScene before Xcode 27 becomes the release toolchain.

## Commands

```sh
pnpm typecheck
pnpm vitest run src/localization/core.test.ts src/localization/learningContent.test.ts
pnpm test
pnpm exec expo export --platform ios
```
