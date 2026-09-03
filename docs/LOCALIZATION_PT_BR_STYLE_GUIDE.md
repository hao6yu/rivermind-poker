# RiverMind Brazilian Portuguese (`pt-BR`) style guide and poker glossary

**Status:** Approved for Phase 19 first-draft translation. Native
poker-language review is **pending** and remains an owner gate; this guide is
what that reviewer reviews against. First-draft content must not ship past the
language picker until that review signs off.

**Audience:** Brazilian players. This catalog is `pt-BR` only: Brazilian
vocabulary and spelling (Acordo Ortográfico). European Portuguese is out of
scope for Phase 19 and stays English until a dedicated catalog exists (scope
§2).

---

## 1. Voice and reading level

- Friendly, direct coach voice. RiverMind teaches; it never lectures and never
  mocks a wrong answer.
- Clear standard register, roughly a general-press reading level. Short
  sentences for instructions; one idea per sentence in lessons.
- Prefer concrete verbs: "decida", "compare", "pague" — not "realize a
  tomada de decisão".
- The BSOP audience is familiar with organized-poker vocabulary; keep the
  established Brazilian terms rather than inventing calques.
- Product name is always "RiverMind". Never translate it.

## 2. Formality and second person

- Use **você** consistently (standard Brazilian product voice). Never tu (adds
  verb-form churn; regionally marked), never "o senhor/a senhora".
- Imperatives are the você forms: "Toque", "Escolha", "Deslize".
- Possessives: "sua mão", "seu range" — drop the possessive where Brazilian
  Portuguese naturally does ("Toque em Continuar", not "Toque no seu botão
  Continuar").

## 3. Poker-action terminology (authoritative)

| English (source) | pt-BR | Notes |
| --- | --- | --- |
| Fold | Desistir | Established UI term in Brazilian poker apps. |
| Check | Passar | |
| Check back | Passar | Context makes "back" redundant. |
| Call | Pagar | Also "igualar" in some rooms; "pagar" is the BR default. |
| Call all-in | Pagar all-in | |
| Bet | Apostar | |
| Raise | Aumentar | |
| Raise to {{amount}} | Aumentar para {{amount}} | |
| Raise all-in | Aumentar all-in | |
| Move all-in | Ir de all-in | Prose; controls use "All-in". |
| All-in | All-in | Retained; universal in Brazil. |
| Limp | Pagar a blind | Prose only; never in compact controls. |
| Squeeze | Squeeze | Retained. |
| 3-bet / 4-bet | 3-bet / 4-bet | Retained. Never "aposta tripla". |
| Showdown | Showdown | Retained. |
| Bluff | Blefe | "Farol" is European; blefe is the BR term. |
| Value bet | Aposta de valor | |
| Check-raise | Check-raise | Retained. |
| Continuation bet | C-bet (prose: "aposta de continuação") | |

## 4. Retained English shorthand (do not translate)

`All-in`, `flop`, `turn`, `river`, `board`, `3-bet`, `4-bet`, `C-bet`, `SPR`,
`EV`, `ICM`, `BB` (only in the seat glossary where it names a seat, never as an
amount), `Sit & Go`, `UTG`, `MP`, `CO`, `BTN`, `SB`, `BB`, `K` (thousand
abbreviation in `1.2K`), `RiverMind`, `big blind`/`big blinds` (the unit name —
see §5).

Suit symbols are never translated: ♠ ♥ ♦ ♣ with ranks `A K Q J 10 9 8 7 6 5 4 3 2`.
Card strings keep English source order and spacing: "A♠ K♠", "Q♠ J♠ 10♠".

## 5. Core glossary (authoritative)

| English | pt-BR | Banned |
| --- | --- | --- |
| big blind (unit) | big blind / big blinds | "grande cega"; BB as an amount |
| small blind | small blind | "pequena cega" |
| blinds | blinds | "cegadinhas" no |
| pot | pote | "bote" (Spanish false friend) |
| pot odds | odds do pote | "probabilidades do pote" (acceptable prose variant only) |
| equity | equidade | |
| hand (two cards) | mão | |
| hand (rankings) | mão / jogada | context |
| hole cards | cartas de mão (closed set: "suas duas cartas") | "bolso" |
| community cards | cartas comunitárias | |
| draw | draw | retained ("draw de flush"); "desenho" banned |
| flush draw | draw de flush | |
| straight draw | draw de sequência | |
| out | outs | retained |
| flush | flush | retained |
| straight | sequência | "escala" is European |
| full house | full house | retained |
| three of a kind | trinca | |
| two pair | dois pares | |
| one pair | um par | |
| high card | carta alta | |
| kicker | kicker | retained |
| range | range | retained (BR standard); "faixa" banned |
| position | posição | |
| button | botão | |
| cutoff | cutoff | retained |
| stack | stack | retained (BR standard) |
| chip(s) | ficha(s) | |
| cash game | cash game | retained |
| tournament | torneio | |
| buy-in | buy-in | retained |
| rebuy | rebuy | retained |
| add-on | add-on | retained |
| bubble | bolha | |
| tilt | tilt | retained |
| gutshot | gutshot | retained (prose: "sequência interna") |
| backdoor | backdoor | retained |
| board texture | textura do board | |
| value | valor | |
| bluff-catcher | bluff-catcher | retained (prose may gloss it) |
| table | mesa | |
| dealer | dealer | retained (also "carteador" in prose) |
| heads-up | heads-up | retained |
| multiway | multiway (prose: "pote com vários jogadores") | |
| bankroll | banca | |
| session | sessão | |
| spot | situação | |
| street | flop/turn/river (see §4) | "rua" banned |
| stake | nível de blinds | |
| deep stack | stack fundo | "stack profundo" also accepted; pick "fundo" |
| short stack | stack curto | |
| effective stack | stack efetivo | |
| stack-to-pot ratio (SPR) | SPR (prose: "relação stack-pote (SPR)") | |
| fold equity | fold equity | retained |
| implied odds | odds implícitas | |
| reverse implied odds | odds inversas implícitas | |
| break-even | ponto de equilíbrio | |
| expected value (EV) | EV (prose: "valor esperado (EV)") | |
| preflop / postflop | pré-flop / pós-flop | BR orthography with hyphen; never "preflop" in prose |
| hand history | histórico de mãos | |
| replay | repetição | |
| graded decision | decisão avaliada | |
| baseline | referência | "linha de base" in analytics prose only |
| coach | coach | retained (RiverMind persona); "treinador" banned for the feature name |
| Daily Challenge | Desafio Diário | |
| Championship | Campeonato RiverMind | |
| Quick Play | Partida Rápida | |
| private table | mesa privada | |
| lobby | lobby | retained |
| room code | código da sala | |
| nickname | apelido | |
| avatar | avatar | |
| onboarding | configuração inicial | |
| Learning path | Trilha de aprendizado | |
| Practice pack | Pacote de prática | |
| Scenario training | Treino de situações | |
| Hand rankings | Ranking de mãos | |

## 6. Grammar: counts, genders, articles

- Numbers up to and including twenty are written out in lesson prose
  ("dezesseis outs"); numbers in UI copy, amounts, and percentages stay numeric.
- Plural API: catalogs provide `one`/`other` forms for count-bearing keys
  ("1 big blind" / "2 big blinds" — the unit name is invariant but articles and
  following nouns agree). Never hardcode singular/plural in a screen.
- Watch noun gender: "o pote", "a mão", "a sequência", "o par", "o range",
  "a ficha", "o all-in", "a aposta".
- "Jogador(es)", "decisão(ões)": use the plural API, never "(s)".
- Percentages: `40%` — no space, no "por cento" in compact copy.
- Decimal amounts in big blinds keep the English source value ("2.5"): write
  "2.5" not "2,5" so interpolated poker facts stay identical to the source.

## 7. Numbers, punctuation, capitalization

- Thousands separator stays `,` (2,000 fichas) and decimal stays `.` for chips,
  big-blind amounts, and percentages: these are language-neutral poker notation
  (documented in the registry and inventory), not missing localization.
- Sentence case for buttons and titles: "Pagar e ver o flop". Only proper nouns
  and the first word capitalize.
- Questions open with a normal capital and close with ?.
- Ellipsis: use the single character "…" not three periods.
- No terminal period on buttons, tabs, or single-line labels; full sentences in
  body copy take one.
- Accents are mandatory (Acordo Ortográfico): "você", "após", "réu", "pôquer"
  when the game name appears in prose (the app name stays RiverMind).

## 8. Accessibility phrasing (TalkBack/VoiceOver)

- Labels are short noun phrases or clear verbs, read in one breath:
  "Pagar 20 fichas", not "Botão destinado a pagar a quantia de 20".
- State comes before action: "Recolhido, Trilha de aprendizado, cabeçalho".
- Percentages read naturally: "40 por cento" is what the screen reader says, so
  write the label as "40% concluído" — never spell "por cento" in the string.
- Avoid symbol-only labels; name the suit when a card matters: "Ás de espadas".
- Live announcements: "Mara aumenta para 40 fichas" — actor, action, amount, in
  that order, matching the table announcement order in English.
- No emoji inside accessibility labels.

## 9. Compact-control length guidance

Portuguese runs 20–35% longer than English. Do not shorten blindly; compact
labels that exceed their slot are recorded for device review (the Phase 19
record lists them).

| Surface | Target | Hard ceiling |
| --- | --- | --- |
| Table action buttons | ≤ 10 chars | 14 |
| Seat plaques / status pills | ≤ 12 chars | 16 |
| Tab labels | ≤ 12 chars | 14 |
| Difficulty names | one word | 12 |
| Chip/bet amounts | numeric only | — |

Approved compact forms: "Pagar" (5), "Aumentar" (8), "Apostar" (7), "Passar"
(6), "Desistir" (8), "All-in" (6). If a control still overflows on device, file
it as a layout defect — do not re-translate to fit.

## 10. Banned literal translations and false friends

- "escala" for straight — European usage; Brazil says "sequência".
- "farol" for bluff — European; Brazil says "blefe".
- "desenho" for draw — nonsense; keep "draw".
- "bote" for pot — that is Spanish; Portuguese is "pote".
- "pretender" ≠ "intend to raise" in the betting sense; use "planejar".
- "apontar" for "point to" UI guidance — use "tocar em" or "selecionar".
- "aposta de valor" ≠ "value betting" mistranslated as "valorizar a aposta".
- "cega" for blind — banned; the unit is "blind" in Brazil.
- "tu"/"te" verb forms — banned in this catalog.
- "registar", "utilizador", "ecrã" — European Portuguese; banned.
- Literal "cartas de bolso" for hole cards — wrong register.
- Machine-converted European Portuguese ("ficheiro", "telemóvel"): banned.

## 11. Review contract

First drafts in this repository are machine-assisted and explicitly marked
`// DRAFT: awaiting qualified native pt-BR poker-language review` in each
generated catalog header. Native review must cover, at minimum: the glossary
above, all lesson and scenario poker facts, consent and deletion copy, coach
output language instructions, and the compact-control label list. One qualified
reviewer may fill both the native-language and poker-knowledge roles per scope
§L4. Approval is recorded in `docs/PHASE_19_EXECUTION_RECORD.md` before the
language is shown past the language picker in a release build.
