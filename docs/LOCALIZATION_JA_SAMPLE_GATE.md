# Phase 19.5 — Japanese sample gate (first-draft samples for native review)

**Status:** Machine-assisted first draft. **Not approved.** A qualified native
Japanese poker reviewer must approve every sample below per
`docs/LOCALIZATION_JA_STYLE_GUIDE.md` §13 before bulk-translation sign-off
(scope J1). The samples exist so the reviewer reviews real app surfaces — one
beginner lesson, one mathematical lesson section, one randomized scenario with
feedback, one hand-result/review surface, one nine-seat table state, the
consent and account-deletion wording, and representative accessibility
announcements — not a terminology list in isolation.

**Source commit (provenance):** `69de3a71` — the merged Phase 19 tree
(`glm/phase-19-localization` via PR #83). Samples were drafted against exactly
this tree; nothing Japanese-related existed before this branch.

Each sample shows the English source and the Japanese first draft. Poker facts,
card ranks, order, and numbers are frozen — only language changes.

---

## 1. Beginner lesson — `lesson-hand-rankings` (section 1)

**Source (en):**

- Title: "Build your best five-card hand" / description "Hand rankings, kickers, and ties"
- Heading: "Use the best five cards"
- Body: "Texas Hold’em gives you seven available cards: two hole cards and five community cards. Your result is always the strongest five-card combination. You may use both, one, or neither hole card."
- Takeaway: "Do not add a sixth card to break a tie. Only the best five cards count."
- Example title: "Example · royal flush" / detail: "A♠ K♠ plus Q♠ J♠ 10♠ makes the five-card A-high straight flush. The paired deuces do not matter."

**Japanese draft:**

- タイトル: 「最強の5枚を作る」/ 説明: 「ハンドランキング・キッカー・引き分け」
- 見出し: 「最も強い5枚を使う」
- 本文: 「テキサスホールデムでは、ホールカード2枚とコミュニティカード5枚の合計7枚が使えます。結果は常に最も強い5枚の組み合わせで判定されます。ホールカードを2枚とも使う、1枚だけ使う、まったく使わない、のいずれも可能です。」
- キーポイント: 「引き分けを判定するために6枚目を足すことはできません。数えるのは常にベストな5枚だけです。」
- 例タイトル: 「例 · ロイヤルフラッシュ」/ 例詳細: 「A♠ K♠にQ♠ J♠ 10♠が加わり、Aハイのストレートフラッシュ（ロイヤルフラッシュ）が完成します。ペアの2は関係ありません。」

## 2. Mathematical lesson — `lesson-math-implied-odds` (section 2)

**Source (en):**

- Title: "Estimate implied odds"
- Heading: "Estimate the missing future value"
- Body: "First calculate the direct call threshold. If your equity falls short, estimate how many extra big blinds must be won later to close the gap. Compare that target with the effective stack and a realistic future bet—not the opponent’s entire remaining stack."
- Example title: "Example · small pair with room behind" / detail: "Calling 2 big blinds with 6♠ 6♦ can be reasonable when more than 60 big blinds remain and a strong overpair is likely to pay a meaningful bet after you flop a set."

**Japanese draft:**

- タイトル: 「インプライドオッズを見積もる」
- 見出し: 「足りない将来のバリューを見積もる」
- 本文: 「まずコールに必要なエクイティの基準（直接オッズ）を計算します。エクイティが基準に届かない場合は、差を埋めるために後からどれだけのビッグブラインドを追加で獲得する必要があるかを見積もります。その目標額を、相手の残りスタック全体ではなく、エフェクティブスタックと現実的な将来のベットと比較してください。」
- 例タイトル: 「例 · スタックに余裕があるときの小さいペア」/ 例詳細: 「6♠ 6♦で2ビッグブラインドをコールすることは、残りスタックが60ビッグブラインドを超えていて、セットを完成させた後に強いオーバーペアが意味のあるベットを払ってくれそうな場合に妥当です。」

## 3. Randomized scenario — `river-polarized-value` (with feedback)

**Source (en):** focus "Polarized river value"; opponentAction "The big blind called the flop and turn, then checks after the river completes a flush draw that was chasing since the flop."; prompt "How can {{heroHand}} with the nut flush target a capped range that contains smaller flushes and bluff-catchers?"; reasoning: "{{heroHand}} with the nut flush sits at the very top of your range on this river, while the checking opponent is less likely to hold the best hand. A large polarized bet builds value and provides the value side needed to balance big river bluffs."; takeaway "Use your largest sizes on rivers with hands that stay comfortable when called."; choices: small → label "Bet 12 big blinds" / overbet → "Bet 54 big blinds" / check → "Check", with per-choice feedback.

**Japanese draft:**

- focus: 「リバーでのポラライズド・バリュー」
- opponentAction: 「ビッグブラインドはフロップとターンをコールし、フロップから追っていたフラッシュドローがリバーで完成したあと、チェックしました。」
- prompt: 「ナッツフラッシュを持つ{{heroHand}}は、小さいフラッシュやブラフキャッチャーしか持たないキャップされたレンジから、どうやってバリューを取りに行けますか?」
- reasoning: 「ナッツフラッシュの{{heroHand}}はこのリバーであなたのレンジの最上位にあり、チェックした相手がベストの役を持っている可能性は低くなります。大きいポラライズドベットはバリューを積み上げ、リバーの大きなブラフとバランスを取るためのバリュー側を用意します。」
- takeaway: 「コールされても安心して抜けられるハンドでは、リバーで最も大きいサイズを使いましょう。」
- choices:
  - small: label「12ビッグブラインドをベット」/ feedback「小さいベットはコールを集めますが、強いブラフキャッチャーを多く含むレンジからバリューを取り残します。」
  - overbet: label「54ビッグブラインドをベット」/ feedback「ナッツフラッシュは、小さいフラッシュや厳選したブラフキャッチャーをコールさせるポラライズドサイズに耐えられます。」
  - check: label「チェック」/ feedback「チェックは、まだコールしてくる強い手に対してレンジ最上位のバリューを捨てることになります。」

## 4. Hand-result / review surface

**Source (en):** `multiway.result.header` "Hand {{hand}} · {{count}} players"; `multiway.result.title` "Hand result"; `multiway.result.yourResult` "Your result"; `multiway.result.finalPot` "Final pot"; `multiway.result.showdown` "Showdown"; `multiway.result.keyDecision` "Key decision from this hand"; `table.review.title` "Coach review"; `table.review.bestPlay` "Best play"; `table.review.remember` "Remember"; `table.handComplete` "Hand complete".

**Japanese draft:**

- `multiway.result.header`: 「ハンド{{hand}} · {{count}}人」
- `multiway.result.title`: 「ハンド結果」
- `multiway.result.yourResult`: 「あなたの結果」
- `multiway.result.finalPot`: 「ファイナルポット」
- `multiway.result.showdown`: 「ショーダウン」
- `multiway.result.keyDecision`: 「このハンドの重要な判断」
- `table.review.title`: 「コーチレビュー」
- `table.review.bestPlay`: 「ベストプレー」
- `table.review.remember`: 「覚えること」
- `table.handComplete`: 「ハンド完了」

## 5. Nine-seat table state

**Source (en):** `setup.multiway` "{{count}}-player AI table" (renders "9-player AI table"); `setup.multiwayDescription` "You face {{count}} distinct AI opponents on one private practice table."; `setup.footer` "{{count}} players · {{stack}} chips · {{length}} · {{difficulty}} AI"; `multiway.level` "Level {{level}} · {{count}} left · {{smallBlind}}/{{bigBlind}}"; `table.pot` "Pot · {{amount}}"; `table.heroTurnPrompt` "Your turn · choose an action below"; `table.waitingFor` "Waiting for {{player}}"; `multiway.state.folded` "Folded"; `multiway.state.allIn` "All-in"; `multiway.thinking` "{{player}} is thinking…".

**Japanese draft (rendered at count=9):**

- `setup.multiway`: 「{{count}}人対戦AIテーブル」→「9人対戦AIテーブル」
- `setup.multiwayDescription`: 「1つのプライベートテーブルで、{{count}}人の個性あるAI相手と対戦します。」→「1つのプライベートテーブルで、9人の個性あるAI相手と対戦します。」
- `setup.footer`: 「{{count}}人 · {{stack}}チップ · {{length}} · {{difficulty}}AI」→「9人 · 2,000チップ · 40ハンド · 中級AI」
- `multiway.level`: 「レベル{{level}} · 残り{{count}}人 · {{smallBlind}}/{{bigBlind}}」→「レベル2 · 残り8人 · 10/20」
- `table.pot`: 「ポット · {{amount}}」→「ポット · 1,240」
- `table.heroTurnPrompt`: 「あなたの番 · 下からアクションを選んでください」
- `table.waitingFor`: 「{{player}}のアクション待ち」
- `multiway.state.folded`: 「フォールド」
- `multiway.state.allIn`: 「オールイン」
- `multiway.thinking`: 「{{player}}が考え中…」

## 6. Consent and account-deletion wording (critical copy — no truncation)

**Source (en) — AI consent:** eyebrow "THIRD-PARTY AI"; title "Allow Supabase and OpenAI?"; introduction "To generate an AI explanation, RiverMind sends this completed hand through Supabase to OpenAI. No AI-coach request is sent until you choose Allow."; sentItems[0] "Your two hole cards, dealt community cards, and hand street."; allow "Allow & ask AI"; decline "Don’t allow".

**Japanese draft:**

- eyebrow: 「サードパーティAI」
- title: 「Supabase と OpenAI を許可しますか?」
- introduction: 「AIの解説を生成するため、RiverMindはこの完了したハンドをSupabase経由でOpenAIに送信します。「許可」を選ぶまで、AIコーチへのリクエストは送信されません。」
- sentItems[0]: 「あなたのホールカード2枚、すでに配られたコミュニティカード、ハンドのストリート。」
- allow: 「許可してAIに相談」
- decline: 「許可しない」

**Source (en) — account deletion:** `settings.deleteAccountTitle` "Delete your account?"; `settings.deleteAccountMessage` "This permanently deletes your guest account and all RiverMind data, including saved games, learning progress, and feedback. Private-table hands from tables you joined will be removed from every participant’s saved history, and any active table will close for everyone. This cannot be undone."

**Japanese draft:**

- `settings.deleteAccountTitle`: 「アカウントを削除しますか?」
- `settings.deleteAccountMessage`: 「この操作により、ゲストアカウントとRiverMindのすべてのデータ（保存されたゲーム、学習進捗、フィードバックを含む）が完全に削除されます。参加したプライベートテーブルのハンドは全参加者の保存履歴から削除され、進行中のテーブルは全員に対してクローズされます。この操作は元に戻せません。」

## 7. Accessibility announcements

**Source (en):** `table.coachA11y` "Show coaching insights"; `opponentRead.a11y` "Opponent read. {{title}}. {{detail}}"; `play.quickSeatA11y` "Start a {{count}}-player quick game"; `setup.totalPlayersA11y` "{{count}} total players"; announcement pattern "Mara raises to 40 chips" (live table action).

**Japanese draft:**

- `table.coachA11y`: 「コーチの分析を表示」
- `opponentRead.a11y`: 「相手の読み。{{title}}。{{detail}}。」
- `play.quickSeatA11y`: 「{{count}}人のクイックゲームを開始」
- `setup.totalPlayersA11y`: 「合計{{count}}人」
- live action: 「マラが40にレイズ」(state → actor → action → amount order preserved from English; spoken as マラが・よんじゅう・に・レイズ)

---

## Disposition (honest record)

- Drafted by the implementing model against the `69de3a71` tree.
- **No qualified native Japanese poker review has occurred.** The samples and
  the style guide are the review packet. Until a reviewer signs off (recorded
  in `docs/PHASE_19_5_EXECUTION_RECORD.md`), Japanese stays
  `releaseEnabled: false`, out of the production picker and system-locale
  resolution, regardless of catalog completeness.
