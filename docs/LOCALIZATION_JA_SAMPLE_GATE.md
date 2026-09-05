# Phase 19.5 — Japanese sample gate (runtime-copy samples for native review)

**Status:** Drafted from the live catalogs. **Not approved.** A qualified
native Japanese poker reviewer must approve every sample below per
`docs/LOCALIZATION_JA_STYLE_GUIDE.md` §13 before bulk-translation sign-off
(scope J1). The samples are extracted verbatim from the authoritative message,
lesson, and scenario catalogs — they are exactly the strings the application
renders. The machine-checked map at the bottom of this document binds each
sample to its authoritative catalog path; the sample-gate regression test
(`src/localization/jaSampleGate.test.ts`) fails when the catalogs drift from
this packet.

**Source (provenance):** the merged Phase 19 tree (`69de3a71`), remediated in
the dirty working tree on `master`. Review remediation #3 rebuilt this packet
after the first draft paraphrased the catalogs instead of quoting them.

---

## 1. Beginner lesson — ハンドランキング (`lesson-hand-rankings`)

Rendered from `japaneseLearningContent.lessons['lesson-hand-rankings']`
(title/description come from the `activity.lesson-hand-rankings.*` message
keys; the lesson memory slices carry no duplicate title fields).

- Title (msg): ベストな5枚の役を作る
- Description (msg): ハンドランキング・キッカー・引き分け
- Section 1 heading: 最も強い5枚を使う
- Section 1 body: テキサスホールデムでは、ホールカード2枚とコミュニティカード5枚、合計7枚のカードが使えます。最終的な役は、その中で最も強い5枚の組み合わせになります。ホールカードは2枚とも使っても、1枚だけでも、まったく使わなくてもかまいません。
- Section 1 takeaway: 勝負をつけるために6枚目のカードを足すことはできません。役として数えられるのは、最も強い5枚だけです。
- Example title: 例・ロイヤルフラッシュ
- Example detail: A♠ K♠にQ♠ J♠ 10♠が加わると、5枚でエースハイのストレートフラッシュになります。ペアになった2は役に影響しません。

## 2. Mathematical lesson — インプライドオッズ (`lesson-math-implied-odds`, section 2)

- Section 2 heading: 足りない将来の価値を見積もる
- Section 2 body: まず、直接コールのしきい値を計算します。エクイティが足りなければ、差を埋めるために後であと何ビッグブラインド獲得する必要があるかを見積もります。そのターゲットを、エフェクティブスタックと現実的な将来のベットと比べてください。相手の残りスタック全体と比べるのではありません。
- Example title: 例・スタックに余裕のあるスモールペア
- Example detail: 6♠ 6♦で2ビッグブラインドをコールすることは、60ビッグブラインドより多く残っていて、セットをフロップしたあとに強いオーバーペアが意味のあるベットを払いそうなときには、合理的になり得ます。

## 3. Randomized scenario — `river-polarized-value` (with per-choice feedback)

Rendered through `createScenarioLocalizer` with the ja vocabulary;
`{{heroHand}}` interpolates at runtime (e.g. 「A-5のスート」).

- focus: リバーのポラライズドバリュー
- opponentAction: ビッグブラインドはフロップとターンをコールし、フロップから狙っていたフラッシュがリバーで完成するとチェックします。
- prompt: {{heroHand}}でナッツのフラッシュを持っているとき、下位のフラッシュやブラフキャッチャーを含むキャップされたレンジをどう狙えばよいでしょうか？
- reasoning: {{heroHand}}でナッツのフラッシュを持っている場合、リバーのレンジで最上位に立ちます。チェックする相手がナッツを持っている可能性は低めです。大きなポラライズドベットはバリューを作り、リバーの大きなブラフに必要なバリュー側を支えます。
- takeaway: リバーでは、コールされても構えられるハンドで、いちばん大きなサイズを使いましょう。
- Choice `small` label: 12ビッグブラインドをベット
- Choice `small` feedback: 小さなベットはコールを集められますが、強いブラフキャッチャーを多く含みうるレンジ相手には、バリューを取り残してしまいます。
- Choice `overbet` label: 54ビッグブラインドをベット
- Choice `overbet` feedback: ナッツのフラッシュは、下位のフラッシュや選ばれたブラフキャッチャーが払ってくれるポラライズドなサイズを支えられます。
- Choice `check` label: チェック
- Choice `check` feedback: チェックは、まだコールしてこられる強いハンドがいくつも残る相手に、レンジの最上位からバリューを消してしまいます。

## 4. Hand-result / review surface (message keys)

- `table.result` → 結果
- `multiway.result.title` → ハンド結果
- `multiway.result.yourResult` → あなたの結果
- `multiway.result.finalPot` → 最終ポット
- `multiway.result.showdown` → ショーダウン
- `multiway.result.keyDecision` → このハンドの重要な判断
- `table.review.title` → コーチレビュー
- `table.review.bestPlay` → ベストプレー
- `table.review.remember` → 覚えること
- `table.handComplete` → ハンド完了

## 5. Nine-seat table state (rendered at count = 9)

- `setup.multiway` → 9人対戦AIテーブル
- `setup.multiwayDescription` → 1つのプライベートテーブルで、9人の個性あるAI相手と対戦します。
- `setup.footer` → 9人 · 2,000チップ · 40ハンド · 中級AI
- `multiway.level` → レベル2 · 残り8人 · 10/20
- `table.pot` → ポット · 1,240
- `table.heroTurnPrompt` → あなたの番 · 下からアクションを選んでください
- `table.waitingFor` → マラのアクション待ち
- `multiway.state.folded` → フォールド
- `multiway.state.allIn` → オールイン
- `multiway.thinking` → マラが考えています…

## 6. Consent and account-deletion wording (critical copy — no truncation)

AI consent (`aiCoachConsentCopy('ja')`):

- eyebrow: サードパーティAI
- title: Supabase と OpenAI を許可しますか？
- introduction: AIの解説を生成するため、RiverMindはこの完了したハンドをSupabase経由でOpenAIに送信します。「許可」を選ぶまで、AIコーチへのリクエストは送信されません。
- sentItems[0]: あなたのホールカード2枚、すでに配られたコミュニティカード、ハンドのストリート。
- allow: 許可してAIに相談
- decline: 許可しない

Account deletion (`accountDeletionMessage('ja', …)`):

- `settings.deleteAccountTitle` → アカウントを削除しますか？
- `settings.deleteAccountMessage` → この操作により、ゲストアカウントとRiverMindのすべてのデータ（保存されたゲーム、学習進捗、フィードバックを含む）が完全に削除されます。参加したプライベートテーブルのハンドは全参加者の保存履歴から削除され、進行中のテーブルは全員に対してクローズされます。この操作は元に戻せません。

## 7. Accessibility announcements

- `table.coachA11y` → コーチの分析を表示
- `opponentRead.a11y` → 相手の読み。{{title}}。{{detail}}
- `play.quickSeatA11y` → 9人のクイックゲームを開始
- `setup.totalPlayersA11y` → 合計{{count}}人
- Live action pattern (state → actor → action → amount): マラが40にレイズ

---

## Machine-checked sample map

Every line below is `key = exact rendered value`. The regression test
(`src/localization/jaSampleGate.test.ts`) resolves each key against the live
catalogs and fails when any value drifts from this packet.

```
msg:activity.lesson-hand-rankings.title = ベストな5枚の役を作る
msg:activity.lesson-hand-rankings.description = ハンドランキング・キッカー・引き分け
lesson:lesson-hand-rankings.sections.0.heading = 最も強い5枚を使う
lesson:lesson-hand-rankings.sections.0.body = テキサスホールデムでは、ホールカード2枚とコミュニティカード5枚、合計7枚のカードが使えます。最終的な役は、その中で最も強い5枚の組み合わせになります。ホールカードは2枚とも使っても、1枚だけでも、まったく使わなくてもかまいません。
lesson:lesson-hand-rankings.sections.0.takeaway = 勝負をつけるために6枚目のカードを足すことはできません。役として数えられるのは、最も強い5枚だけです。
lesson:lesson-hand-rankings.sections.0.example.title = 例・ロイヤルフラッシュ
lesson:lesson-hand-rankings.sections.0.example.detail = A♠ K♠にQ♠ J♠ 10♠が加わると、5枚でエースハイのストレートフラッシュになります。ペアになった2は役に影響しません。
lesson:lesson-math-implied-odds.sections.1.heading = 足りない将来の価値を見積もる
lesson:lesson-math-implied-odds.sections.1.body = まず、直接コールのしきい値を計算します。エクイティが足りなければ、差を埋めるために後であと何ビッグブラインド獲得する必要があるかを見積もります。そのターゲットを、エフェクティブスタックと現実的な将来のベットと比べてください。相手の残りスタック全体と比べるのではありません。
lesson:lesson-math-implied-odds.sections.1.example.title = 例・スタックに余裕のあるスモールペア
lesson:lesson-math-implied-odds.sections.1.example.detail = 6♠ 6♦で2ビッグブラインドをコールすることは、60ビッグブラインドより多く残っていて、セットをフロップしたあとに強いオーバーペアが意味のあるベットを払いそうなときには、合理的になり得ます。
scenario:river-polarized-value.focus = リバーのポラライズドバリュー
scenario:river-polarized-value.opponentAction = ビッグブラインドはフロップとターンをコールし、フロップから狙っていたフラッシュがリバーで完成するとチェックします。
scenario:river-polarized-value.prompt = {{heroHand}}でナッツのフラッシュを持っているとき、下位のフラッシュやブラフキャッチャーを含むキャップされたレンジをどう狙えばよいでしょうか？
scenario:river-polarized-value.reasoning = {{heroHand}}でナッツのフラッシュを持っている場合、リバーのレンジで最上位に立ちます。チェックする相手がナッツを持っている可能性は低めです。大きなポラライズドベットはバリューを作り、リバーの大きなブラフに必要なバリュー側を支えます。
scenario:river-polarized-value.takeaway = リバーでは、コールされても構えられるハンドで、いちばん大きなサイズを使いましょう。
scenario:river-polarized-value.choices.small.label = 12ビッグブラインドをベット
scenario:river-polarized-value.choices.small.feedback = 小さなベットはコールを集められますが、強いブラフキャッチャーを多く含みうるレンジ相手には、バリューを取り残してしまいます。
scenario:river-polarized-value.choices.overbet.label = 54ビッグブラインドをベット
scenario:river-polarized-value.choices.overbet.feedback = ナッツのフラッシュは、下位のフラッシュや選ばれたブラフキャッチャーが払ってくれるポラライズドなサイズを支えられます。
scenario:river-polarized-value.choices.check.label = チェック
scenario:river-polarized-value.choices.check.feedback = チェックは、まだコールしてこられる強いハンドがいくつも残る相手に、レンジの最上位からバリューを消してしまいます。
msg:table.result = 結果
msg:multiway.result.title = ハンド結果
msg:multiway.result.yourResult = あなたの結果
msg:multiway.result.finalPot = 最終ポット
msg:multiway.result.showdown = ショーダウン
msg:multiway.result.keyDecision = このハンドの重要な判断
msg:table.review.title = コーチレビュー
msg:table.review.bestPlay = ベストプレー
msg:table.review.remember = 覚えること
msg:table.handComplete = ハンド完了
msg:table.coachA11y = コーチの分析を表示
msg:setup.totalPlayersA11y = 合計{{count}}人
msg:settings.deleteAccountTitle = アカウントを削除しますか？
msg:settings.deleteAccountMessage = この操作により、ゲストアカウントとRiverMindのすべてのデータ（保存されたゲーム、学習進捗、フィードバックを含む）が完全に削除されます。参加したプライベートテーブルのハンドは全参加者の保存履歴から削除され、進行中のテーブルは全員に対してクローズされます。この操作は元に戻せません。
```

## Disposition (honest record)

- Rebuilt by the remediation pass (review finding #3) from the live catalogs
  of the dirty working tree; the first draft had paraphrased several surfaces
  (hand-rankings lesson, river-polarized-value) instead of quoting them.
- **No qualified native Japanese poker review has occurred.** The packet is
  the review input. Until a reviewer signs off (recorded in
  `docs/PHASE_19_5_EXECUTION_RECORD.md`), Japanese stays
  `releaseEnabled: false` and out of production resolution, regardless of
  catalog completeness. The J1 prerequisite deviation is recorded in the
  execution record.
