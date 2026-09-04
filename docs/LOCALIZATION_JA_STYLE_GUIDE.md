# RiverMind Japanese (`ja`) style guide and poker glossary

**Status:** Approved for Phase 19.5 first-draft translation work. Native
Japanese poker-language review is **pending** and remains an owner gate; this
guide is the contract that reviewer reviews against. First-draft Japanese must
not ship past the language picker (`releaseEnabled: false`) until that review
signs off. Machine-assisted translation is a first draft, never native
approval.

**Audience:** Japanese players on iOS and Android. One catalog serves all of
Japan; no regional variants. Written Japanese only (no half-width katakana, no
romaji prose).

**References:** `docs/PHASE_19_LOCALIZATION_EXPANSION_SCOPE-codex-gpt-5.6.md`
§6 (J1–J3), `docs/LOCALIZATION_ES_419_STYLE_GUIDE.md`,
`docs/LOCALIZATION_PT_BR_STYLE_GUIDE.md`, `docs/PHASE_19_EXECUTION_RECORD.md`.

---

## 1. Voice and reading level

- Friendly, direct coach voice. RiverMind teaches; it never lectures and never
  mocks a wrong answer.
- Explanatory prose (lessons, feedback, takeaways, dialogs, consent) uses
  です/ます体 (polite form). Plain body sentences stay short: one idea per
  sentence, clauses before the verb, no nested double relatives.
- Control labels, seat plaques, tabs, and action buttons use plain forms —
  katakana action nouns (フォールド, チェック, コール) or short verb phrases.
  Never paste です/ます onto a button.
- The coach addresses the player as 「あなた」 at most once per screen and
  usually drops the pronoun entirely; Japanese subject-dropping is the norm,
  not a compression trick.
- Concrete verbs over nominalizations: 判断する, 比較する, 払う — not
  意思決定を行う.
- No humor that depends on wordplay that breaks in translation. Character
  titles (the multiway AI jokes) are rewritten per language, never translated
  word for word.
- Product name is always "RiverMind" (Latin letters). Never translate it.
- No machine-translation cadence: avoid ます-clean endings stacked with のです,
  double ことができます constructions, and untranslated English fragments.

## 2. Formality and register split

| Surface | Register | Example |
| --- | --- | --- |
| Action buttons, tabs, plaques | Plain noun / short form | コール, ベット, フォールド, 設定 |
| Table status, announcements | Compact declarative | マラが40にレイズ |
| Lessons, takeaways, explanations | です/ます | ポットオッズを比較しましょう。 |
| Feedback (right/wrong) | です/ます, direct, kind | 正解です。…が正しいプレーです。 |
| Consent, deletion, privacy | です/ます, complete sentences | この操作は元に戻せません。 |
| Accessibility labels | Compact, state-first | 待機中、マラ、ベット40 |

Never mix である調 (essay style) into UI copy. Never put 系 endings
(〜系的) or slang into coach prose.

## 3. Poker-action terminology (authoritative)

| English (source) | ja | Notes |
| --- | --- | --- |
| Fold | フォールド | Not 畳む/降りる/棄牌 (Chinese form banned). |
| Check | チェック | Never 待つ. |
| Check back | チェック | 「チェック」; context carries "back". |
| Call | コール | |
| Call all-in | オールインにコール | Compact: コール（All-in）. |
| Bet | ベット | |
| Bet {{amount}} | {{amount}}をベット | Compact: ベット {{amount}}. |
| Raise | レイズ | |
| Raise to {{amount}} | {{amount}}にレイズ | No space before に. |
| Raise all-in | オールインにレイズ | |
| Move all-in | オールイン | Context carries "move". |
| All-in | オールイン | Retained as katakana; `All-in` Latin form allowed in seat plaques. |
| Limp | リンプ | リンプする in prose. |
| Squeeze | スクイーズ | |
| 3-bet / 4-bet | 3-bet / 4-bet | Retained Latin form. Never 3ベット in this catalog, never 三段レイズ. |
| Check-raise | チェックレイズ | |
| Continuation bet | C-bet | コンティニュエーションベット in lesson prose after first use. |
| Showdown | ショーダウン | |
| Bluff | ブラフ | |
| Semi-bluff | セミブラフ | |
| Value bet | バリューベット | |
| Bluff-catcher | ブラフキャッチャー | |
| Fold equity | フォールドエクイティ | |
| Pot-committed | ポットコミット | |

## 4. Retained English shorthand (do not translate)

`All-in`, `flop` (フロップ in prose; compact copy may keep `flop`), `turn`
(ターン), `river` (リバー), `board` (ボード), `3-bet`, `4-bet`, `C-bet`, `SPR`,
`EV`, `ICM`, `MTT`, `Sit & Go`, `UTG`, `MP`, `CO`, `BTN`, `SB`, `BB` (compact
amount copy: `10BB`; lesson prose spells ビッグブラインド), `K` (thousand
abbreviation in `1.2K`), `RiverMind`, `AI`, `Lv`.

Street names are katakana in this catalog: プリフロップ, フロップ, ターン,
リバー. Do not invent kanji street names (前焼き/中焼き etc. are banned) and do
not use the Spanish-style retention of Latin `flop/turn/river` inside Japanese
sentences.

Suit symbols are never translated: ♠ ♥ ♦ ♣ with ranks `A K Q J 10 9 8 7 6 5 4
3 2`. Card strings keep source order and half-width spaces between cards:
"A♠ K♠", "Q♠ J♠ 10♠". Suited/offsuit hand shorthand renders as in the source
("A-5のスート" is banned; the live renderer supplies the hand notation and the
「{{heroHand}}」 runtime token must be preserved verbatim).

## 5. Core glossary (authoritative)

| English | ja | Banned |
| --- | --- | --- |
| big blind (unit) | ビッグブラインド | 大盲注 (Chinese); BB as the only prose form |
| small blind | スモールブラインド | 小盲注 (Chinese) |
| blinds | ブラインド | |
| pot | ポット | 赌池 (Chinese); 壺 |
| pot odds | ポットオッズ | 現在価格 for the call price; 賠率 (Chinese) |
| equity | エクイティ | 勝率 alone when the source means equity |
| required equity | 必要エクイティ | |
| hand (two cards) | ハンド | 手札 alone is allowed in prose but ハンド in counts |
| hand (rankings entry) | 役 | ハンド for 役 names (use ストレート, not ハンド・ストレート) |
| hole cards | ホールカード | prose: 自分の2枚のカード |
| community cards | コミュニティカード | 共有牌 (Chinese) |
| board | ボード | 台 |
| draw | ドロー | 引き; 画 (Chinese) |
| flush draw | フラッシュドロー | |
| straight draw | ストレートドロー | |
| out | アウツ | count as {{count}}アウツ; never 外 |
| flush | フラッシュ | 花 |
| straight | ストレート | 順子 (Chinese) |
| full house | フルハウス | フルハウス以外の和訳 (三組二対) |
| three of a kind | スリーカード | スリーオブアカインド |
| two pair | ツーペア | |
| one pair | ワンペア | ワンペアー |
| high card | ハイカード | |
| kicker | キッカー | |
| range | レンジ | 幅 |
| position | ポジション | 座位 |
| button | ボタン (BTN) | ディーラーボタン in lesson prose |
| cutoff | カットオフ (CO) | |
| under the gun | UTG | アンダーザガン in prose after first use |
| stack | スタック | 山; 籌碼堆 |
| chips | チップ | counter 枚 (チップ2枚), amounts stay numeric |
| cash game | キャッシュゲーム | 現金ゲーム |
| tournament | トーナメント | 大会 alone when the feature means tournament mode |
| buy-in | バイイン | |
| rebuy | リバイ | 再購入 |
| add-on | アドオン | |
| bubble | バブル | 泡 |
| tilt | ティルト | 傾き |
| gutshot | ガットショット | インサイドドロー allowed in prose |
| backdoor | バックドア | 裏目 |
| board texture | ボードテクスチャー | 板の質感 |
| value | バリュー / 価値 | バリュー for value betting, 価値 in plain prose |
| table | テーブル | 机 |
| seat | シート | 席 in prose is allowed; シート in UI |
| dealer | ディーラー | |
| chip leader | チップリーダー | |
| short stack | ショートスタック | |
| deep stack | ディープスタック | |
| effective stack | エフェクティブスタック | |
| stack-to-pot ratio | SPR | prose first use: スタックトゥポットレシオ（SPR） |
| implied odds | インプライドオッズ | |
| reverse implied odds | リバースインプライドオッズ | |
| break-even | ブレークイーブン | prose: 損益分岐 |
| expected value | EV | prose first use: 期待値（EV） |
| preflop / postflop | プリフロップ / ポストフロップ | プレフロップ is a banned variant |
| hand history | ハンド履歴 | ハンドヒストリー banned in this catalog |
| replay | リプレイ | 再生 only for media playback controls |
| graded decision | 判定された判断 | count with 件: 12件の判断 |
| baseline | ベースライン | |
| coach | コーチ | 指導者; 教練 (Chinese) |
| Daily Challenge | デイリーチャレンジ | |
| Championship | チャンピオンシップ | |
| Quick Play | クイックプレイ | |
| private table | プライベートテーブル | 私人桌 (Chinese) |
| lobby | ロビー | |
| room code | ルームコード | |
| nickname | ニックネーム | |
| avatar | アバター | |
| onboarding | 初期設定 | オンボーディング banned in this catalog |
| Learning path | 学習パス | |
| Practice pack | プラクティスパック | 練習パック banned for the feature name |
| Scenario training | シナリオトレーニング | |
| Hand rankings | ハンドランキング | 役一覧 allowed in prose |
| cheat sheet | チートシート | 早見表 in prose is allowed |
| heads-up | ヘッズアップ | 一対一 |
| multiway | マルチウェイ | 複数人数ポット in prose after first use |
| risk premium | リスクプレミアム | |
| limper | リンパー | |
| caller | コーラー | |
| aggressor | アグレッサー | |
| blocker | ブロッカー | |
| polarized | ポラライズド | 两极化 (Chinese) |
| overbet | オーバーベット | |
| cold deck | — | avoid; describe the situation |
| bankroll | バンクロール | 資金 in prose is allowed |
| session | セッション | counter: 回 (3回のセッション) |
| spot | スポット | 局面 in prose is allowed |
| street | フロップ/ターン/リバー | 通り; 道 (#10) |
| stake | ブラインドレベル | 層 |

## 6. Counters (authoritative)

Japanese counters are contextual. This catalog fixes one counter per surface
family — no synonyms across screens:

| Surface | Counter | Example rendering |
| --- | --- | --- |
| players (behind, live, seated) | 人 | 残り2人, 5人のプレイヤー, 1人 |
| hands (played, history, sample) | ハンド | 100ハンド, Hand 12 → ハンド12 |
| cards | 枚 | 2枚のカード, 5枚のコミュニティカード |
| chips | 枚 | チップ2枚 (numeric amounts stay bare: 2,000) |
| attempts / tries / actions | 回 | 3回のチャレンジ |
| questions | 問 | 10問中8問正解 |
| lessons | レッスン or 件 | 3件のレッスン |
| decisions / graded spots | 件 | 12件の判断 |
| sessions | 回 | 3回のセッション |
| minutes | 分 | 4分 |
| hours / duration | 時間 | 1時間 |
| days | 日 | 3日 |
| weeks | 週間 | 2週間 |
| outs | アウツ | 8アウツ |
| big blinds (unit) | ビッグブラインド / BB | 10ビッグブラインド (prose), 10BB (compact) |
| levels left / players left | 人 | 残り3人 |
| rebuys | リバイ | リバイ2回 |
| runs (best runs) | 回 | 最高記録 · 3回 |
| seconds (countdown) | 秒 | 残り30秒 |

Rules:
- Numbers 0–9 in lesson prose may stay Arabic numerals (this catalog does not
  spell out counts; consistent with the poker-notation invariance).
- Never use the English plural system: Japanese has no singular/plural
  inflection. The `ja` plural catalog is empty by design; every count-bearing
  key renders the base template with `{{count}}` interpolated for 0, 1, and
  larger values. A Japanese string must never read 「1 人」 with a stray space,
  「players」, or an English plural ("1 lessons").
- Avoid unnecessary 「〜つ」 counts; use the table above.

## 7. Numbers, punctuation, capitalization

- Half-width (ASCII) digits everywhere: 2,000 / 2.5 / 40%.
- Thousands separator stays `,` and decimal stays `.` for chips, big-blind
  amounts, and percentages — poker notation is language-neutral (same decision
  as es-419/pt-BR §7; documented in format.ts).
- Percentages: `40%` — no space, no パーセント in compact copy; パーセント
  allowed in lesson prose when the sentence reads better.
- Dates: `2026年9月3日` (Gregorian, 年月日 suffixes, no era names, no spaces).
- Japanese punctuation: 、 。 ！ ？ ・ 「」 『』. Full-width forms inside
  Japanese sentences. Ellipsis is 「…」 (single character).
- Latin strings inside Japanese prose (RiverMind, SPR, 3-bet) keep their Latin
  punctuation.
- No half-width katakana. No 全角 alphanumerics (ＡＢＣ１２３ banned).
- Spacing: no space between Japanese words; no space between a numeral and its
  particle/counter (40にレイズ, 8アウツ, 残り2人). One half-width space is
  required between two juxtaposed Latin tokens that are not card notation
  ("C-bet 60%" reads as one token — no space needed there).
- Sentence case does not exist in Japanese; do not capitalize mid-sentence
  katakana terms. Button labels have no terminal 。. Full sentences in body
  copy end with 。.

## 8. Line breaking and kinsoku

- Rely on the platform's kinsoku shori (line-break prohibition). The strings
  never contain manual line breaks, zero-width spaces, or word-joiners.
- Opening brackets （ 「 『 and the long-vowel mark ー must not start a line;
  closing brackets 」 』 ） 。 、 ！ ？ must not end a line. Platform defaults
  handle this; if a device shows a violation, file a layout defect — never
  repair one device by hacking the string.
- Long katakana terms (コンティニュエーションベット) may overflow narrow
  plaques; use the approved compact form (C-bet) there instead of shrinking
  text.
- No per-character layout hacks, no letter-spacing tricks, no forced
  font-shrinking below the platform body size on consent/deletion copy.

## 9. Fonts and weights

- iOS renders Japanese through the system Hiragino family (Hiragino Sans /
  Hiragino Kaku Gothic). All shipped weights have real glyphs; synthetic bold
  is not expected on iOS.
- Android falls back to Noto Sans CJK JP for Japanese glyphs; Latin-only fonts
  in a style must still fall back to Noto for CJK. Device verification is an
  owner gate (J2): confirm every rendered weight shows real kanji/kana, and
  record any platform where faux-bold degrades readability.
- Ruby (furigana) is **not used** in this catalog. Default decision per scope
  J2: no furigana unless native/user research shows the poker vocabulary
  requires it. Revisit only through the native review contract.

## 10. Banned literal translations and variants

- Any Simplified/Traditional Chinese form leaking through: 弃牌, 过牌, 加注,
  底池, 大盲注, 翻牌 — instant defect.
- 畳む/折る/降りる for fold; 待つ for check; 現在価格 for the call price.
- 三ベット/四ベット — 3-bet/4-bet stay Latin.
- プレフロップ — プリフロップ only.
- スリーベット/コンティベット — see §3/§4 approved forms.
- オールイン押下, 押すもの — machine cadence; use natural button copy.
- 「〜してあげます」/「〜してさしあげる」 — condescending; plain です/ます.
- あなたの過剰使用 — drop the pronoun.
- Half-width katakana (ﾎﾟｯﾄ) and 全角 alphanumerics (４０％).
- Untranslated English left inside Japanese sentences outside the §4
  allowlist ("just call here" style leakage).
- 「ハンド」 used for a 役 name ("フルハウスというハンド" → say 役).
- Mixed-width spacing inside card strings ("A♠ K♠" never "A♠　K♠").

## 11. Compact-control length guidance

Japanese runs **shorter** than English in kana count but wider in glyph
width — kana are effectively double-width. Measure by visual width, not
characters:

| Surface | Target | Hard ceiling |
| --- | --- | --- |
| Table action buttons | ≤ 6 kana | 10 kana |
| Seat plaques / status pills | ≤ 8 kana | 12 kana |
| Tab labels | ≤ 6 kana | 10 kana |
| Difficulty names | one word | 8 kana |
| Chip/bet amounts | numeric only | — |

Approved compact forms: コール (3), ベット (3), レイズ (3), チェック (4),
フォールド (5), オールイン (5). If a control still overflows on device, file
it as a layout defect — do not re-translate to fit.

## 12. Accessibility phrasing (TalkBack/VoiceOver)

- Labels are short noun phrases or clear verbs read in one breath:
  「コール 20」 not 「20枚のコールを行うためのボタン」.
- State comes before action, mirroring the English announcement order:
  「待機中、マラ、ベット40」 (state, actor, action, amount).
- Suit names for cards that matter: スペードのエース, ハートのキング.
- Percentages read as 40パーセント; write the label "40%" and let the screen
  reader verbalize it.
- No emoji inside accessibility labels.
- TalkBack Japanese and VoiceOver Japanese verification is an owner gate:
  table state and action order, chip/blind amounts, board narration, results
  and winners, review/replay, private-table errors and recovery, consent and
  account deletion, destructive confirmations. Record actual spoken output.

## 13. Review contract

First drafts in this repository are machine-assisted and explicitly marked
`// DRAFT: awaiting qualified native ja poker-language review` in each
generated catalog header. Native review must cover, at minimum:

1. The glossary above (§3–§6) — one authoritative form per term.
2. All lesson and scenario poker facts and math (values unchanged from source).
3. Consent, privacy, and account-deletion copy (complete sentences, no
   truncation).
4. Coach output language instructions (§14).
5. Compact-control label list (§11) and its behavior at 320 dp/360 dp.
6. Counter usage audit (§6) across live surfaces.
7. Accessibility narration samples (§12) — spoken-order naturalness.
8. Line-breaking/kinsoku spot checks on result, review, and consent surfaces.

One qualified reviewer may fill both the native-language and poker-knowledge
roles per scope §6. Approval is recorded in
`docs/PHASE_19_5_EXECUTION_RECORD.md` before `releaseEnabled` flips to `true`.
No reviewer approval may be claimed from a model-generated catalog.

## 14. AI-coach language instruction (contract parity)

The server contract (`supabase/functions/poker-coach/language.ts`) carries this
Japanese instruction, mirroring the glossary:

- Write summary, bestDecision, keyConcept, and practiceTip in concise, natural
  Japanese (です/ます体).
- Use standard Japanese poker terms: フォールド、チェック、コール、ベット、
  レイズ、オールイン、プリフロップ、フロップ、ターン、リバー、ボード、
  コミュニティカード、ポットオッズ、エクイティ、レンジ、バリューベット、
  ブラフ、必要エクイティ.
- Keep established abbreviations such as BB, SPR, EV, ICM, 3-bet, and 4-bet
  unchanged.
- Prefer 必要エクイティ over literal 必要な勝率, and 判断 for decision.
- Avoid English sentence structure and do not translate 3-bet/4-bet into
  katakana coinages (三ベット is banned).
