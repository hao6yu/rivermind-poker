# Phase 15 — Chinese localization quality

## Outcome

Make RiverMind clear and natural to Chinese-speaking poker learners. Simplified
and Traditional Chinese should read as authored product copy, not translated
English, while preserving every poker fact, action, amount, score, and rule.

## Language standards

- Simplified Chinese targets natural Mainland usage.
- Traditional Chinese targets clear Taiwan/Hong Kong-neutral usage. It is
  reviewed independently rather than produced by character conversion alone.
- Short controls use direct verbs. Supporting copy explains the decision once
  and avoids repeating the title in a full sentence.
- English product names stay only when they are established names: RiverMind,
  AI, Sit & Go, QR Code, iPhone, and iPad.
- Interpolation variables, card notation, percentages, chip amounts, blind
  levels, and correct-answer IDs never change during copy editing.

## Poker glossary

| Concept | Simplified Chinese | Traditional Chinese |
| --- | --- | --- |
| check / call / bet / raise / fold | 过牌 / 跟注 / 下注 / 加注 / 弃牌 | 過牌 / 跟注 / 下注 / 加注 / 棄牌 |
| all-in | 全下 | 全下 |
| preflop / flop / turn / river | 翻牌前 / 翻牌 / 转牌 / 河牌 | 翻牌前 / 翻牌 / 轉牌 / 河牌 |
| hole cards / board | 底牌 / 公共牌 | 底牌 / 公共牌 |
| pot / side pot | 底池 / 边池 | 底池 / 邊池 |
| big blind / small blind | 大盲 / 小盲 | 大盲 / 小盲 |
| button | 庄家位 | 莊家位 |
| position | 位置 | 位置 |
| equity | 胜率 | 勝率 |
| pot odds / implied odds | 底池赔率 / 隐含赔率 | 底池賠率 / 隱含賠率 |
| range | 范围 | 範圍 |
| value bet / bluff | 价值下注 / 诈唬 | 價值下注 / 詐唬 |
| continuation bet | 持续下注 | 持續下注 |
| three-bet / four-bet | 3-bet / 4-bet | 3-bet / 4-bet |
| showdown | 摊牌 | 攤牌 |
| hand history / replay | 手牌记录 / 回放 | 手牌記錄 / 重播 |

Established English poker shorthand may appear where it is more recognizable
than a forced translation, but one concept must use one term throughout a
single locale.

## Included work

- Home, Play, Profile, onboarding, setup, and private-table flows.
- Heads-up and multiway tables, actions, results, coach, review, and history.
- Daily Challenge, Sit & Go, Championship, missions, and continuation states.
- Lessons, quizzes, scenarios, reference sheets, and long-form explanations.
- Accessibility labels, errors, empty states, and destructive confirmations.
- App Store Simplified and Traditional Chinese copy after the in-app wording is
  finalized.

## Automated acceptance

- All three catalogs contain the same keys.
- Every locale preserves the exact interpolation-variable set for every key.
- Chinese catalogs do not silently inherit English product sentences.
- Stable identifiers, numbers, card examples, grades, and correct answers in
  learning content remain unchanged.
- Focused localization tests, full typecheck, and the full test suite pass.

## Visual acceptance

- Walk Home, Learn, Play, Profile, Quick Play, a six-player table, Daily,
  Championship, private setup/lobby/game/result, coach review, and replay.
- Check Simplified and Traditional Chinese on a compact iPhone and iPad.
- Required controls remain visible at normal and accessibility text sizes.
- Table copy may be spatially capped, but exact actions remain available in the
  persistent state and accessibility label.

## Not included

- Changing poker rules, AI strategy, progression, scoring, or network behavior.
- Adding new languages.
- Public App Review submission or legal/privacy attestations.

## Deployment note

The optional AI hand review receives the same regional terminology guidance in
the `poker-coach` Edge Function. Deploy that function after merge and run one
authenticated Simplified and Traditional Chinese review smoke before calling
Phase 15 released. Static in-app localization remains fully usable if the
optional AI request is unavailable.
