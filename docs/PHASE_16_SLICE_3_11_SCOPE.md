# Phase 16 Slice 3.11 — Profile, Play Hub, Table Experience, and Championship Expansion

## Status

Draft for product review. This document records the design agreed after physical-device testing of the Slice 3.10 build. It defines the next implementation slice; it does not reopen the completed Slice 3.9 or 3.10 contracts except where this scope explicitly replaces their UI or tournament limits.

## Outcome

Make the dark theme consistently readable, turn Profile identity editing into one compact interaction, accept and adjust ordinary iPhone photos, simplify Play around social play and one configurable AI entry point, make setup and live poker tables use their measured space clearly in both orientations, and expand RiverMind Championship into a branded 3/6/9-seat tour with two sequential hidden nine-seat events.

The shipped experience should feel simpler even though the underlying tournament capability becomes broader:

- **Play together** is the first section on Play.
- RiverMind Championship has its own branded section.
- Practice and Sit & Go share one compact **Play vs RiverMind AI** configuration surface while remaining distinct game formats internally.
- The Profile header owns both name and avatar editing; the standalone Avatar card is removed.
- Home places **Meet the players** directly below **Poker cheat sheets** as a second compact reference shortcut.
- Setup previews and live tables derive their geometry from the space actually available to them rather than stretching fixed phone/table constants.
- AI seats use their authored avatar plus an explicit **AI** identifier; color is supporting emphasis, never the only distinction.
- Reactions use an understandable text menu instead of an unlabeled sticker grid.
- A simple hand result says who won, how much, and why once rather than repeating the same payout in several rows.
- A human who reaches zero chips at a private multiplayer table may rebuy exactly 4,000 play chips between hands, with no count limit.
- A human seat is never handed to AI. A temporary connection loss preserves that seat for the same authenticated player to retry; an intentional exit permanently ends that player's participation in the running session.
- A compact top action opens live **Table stats** showing every participant's settled chips won or lost against all of their buy-ins.
- The Championship starts fresh for this early release. No legacy Championship progression is migrated or grandfathered.
- **The River Below** becomes a nine-seat timed invitation. Winning it unlocks one new, harder all-Nemesis invitation named **The Undertow**.

## Product decisions and drafted recommendations

1. Keep the primary Profile UI clean. Do not show storage, hosting, or private-room sharing explanations in the identity card or avatar editor.
2. Removing that copy does not change the underlying private avatar authorization model. This slice adds no public avatar, globally discoverable profile, or unrestricted URL. The room-private Play record snapshot defined below is a bounded multiplayer identity field visible only to authorized current room members. Accurate policy and store disclosure remain outside the compact editing UI.
3. Reset only Championship progression and active Championship checkpoints for this release instead of migrating old champions into the expanded course. Preserve every unrelated record, identity, learning state, history, and preference.
4. Add one new hidden event after The River Below for now, not a longer chain of invitations.
5. The River Below uses a 45-second action clock. The Undertow uses a 30-second action clock.
6. The River Below has four Elite and four Nemesis opponents. The Undertow has eight Nemesis opponents.
7. Both hidden events, the RiverMind Final, and every future hidden invitation are nine-seat events.
8. Replace the two-option orientation selector with one 44-point-or-larger toggle that switches to the other orientation and labels that destination for accessibility.
9. Do not color entire AI plaques yellow or red. Show the authored AI avatar, an explicit localized **AI** badge, and a restrained accent tint that does not conflict with action, danger, active-turn, or winner states.
10. Approved visible reaction set: **Let’s go!**, **Whoa!**, **Ha ha!**, **Nice hand!**, **Well played!**, **So close!**, **On fire!**, and **Good game!** Keep the twelve-id protocol compatible with older clients, but do not expose all twelve in the new compact menu.
11. Keep the reaction menu open after a selection so repeated taps remain easy. Tapping the reaction button again or anywhere outside closes it.
12. For a single-pot, single-recipient result, show the amount exactly once. Payout breakdowns appear only when a split pot, tie, or side-pot structure needs them.
13. Tapping any occupied player plaque during a game opens a readable player-profile sheet. This applies to the viewer, other humans, and AI players across every table type.
14. An AI profile shows its large authored avatar, name, fun character title, personality label, and short description. A human profile shows the same **Play record** card visible on that person's own Profile—Hands, Tables, Wins, Win rate, populated mode breakdown, and truthful scope/coverage note—not a smaller current-table-only substitute.
15. Add **Meet the players** directly below **Poker cheat sheets** on Home and keep the existing Learn reference route. Selecting any roster entry opens the shared AI profile as a popup without moving the roster. Tapping the dimmed area outside closes it; an explicit close target and platform Back/Escape remain available. Tapping descriptive content inside the popup does not dismiss it unexpectedly.
16. Every new or changed user-visible string ships together in English, Simplified Chinese, and Traditional Chinese, including visible copy, errors, empty/loading states, accessibility labels/hints/announcements, and perspective-aware statistics notes. No checkpoint may defer localization to the integrated gate.
17. Private multiplayer human seats may rebuy 4,000 play chips after reaching exactly zero. Rebuys are unlimited in count, owner-initiated, and accepted only between hands; they are not voluntary top-ups and do not apply to AI seats.
18. Net chips won/lost means the player's last settled stack minus all chips they brought to the session: original buy-in plus every 4,000-chip rebuy. A rebuy increases stack and total buy-in together, so the rebuy itself never appears as a win.
19. Add one 44-point-or-larger **Table stats** action to the live private-table header. Its sheet lists every session participant, including AI and departed/offline human seats, ordered from largest settled winner to largest settled loser.
20. Never replace, delegate, or transfer a human seat to AI after the room starts. Only a seat created as an authored AI seat may make AI decisions.
21. Treat **Leave table** and connection loss differently. Leaving is a confirmed, permanent exit from the current running session. A connection loss is recoverable by the same authenticated player, but that seat makes no poker decisions while disconnected and is not dealt into later hands until the owner reconnects.

## Current implementation and confirmed issues

### 1. Dark-mode text can fall back to black

`RecommendedSessionHomeCard` renders **Start your session** through a style with font properties but no color. React Native therefore uses its default black text, which is unreadable on the dark Home background. The visible failure is specific, but the release requirement is global: no `Text`, icon, badge, disabled state, overlay, or modal may depend on the platform's default foreground color.

The existing dark palette has usable semantic colors. The main defect class is incomplete or incorrect token application rather than the need to redesign the palette.

### 2. The profile-entry avatar is optically misaligned

The header uses a 24-point circular avatar inside a 44-point rounded-square button. The authored silhouette is also visually bottom-heavy inside its square asset. The result is mathematically centered but appears undersized and low within the button.

The alignment must be fixed through one shared avatar-button boundary and normalized artwork framing, not per-screen offsets.

### 3. Profile presents the avatar twice

Profile currently shows the avatar in the identity header and repeats it in a large standalone Avatar card containing explanatory copy, a large preview, six authored choices, and a full-width Change photo button. This consumes significant vertical space and separates two parts of one identity.

### 4. Ordinary iPhone photos can be rejected before processing

The picker treats its MIME result as authoritative and the pure service accepts only PNG, JPEG, WebP, and AVIF. iPhone Photos commonly supplies `image/heic`, `image/heif`, or no MIME at all. The current path rejects those assets before the native image manipulator can decode and normalize them.

The current 8 MiB validation is also applied to the original source before compression. A valid high-resolution phone photo can therefore be rejected even though its processed 1024-pixel avatar would be small.

### 5. Photo replacement has no user-controlled framing

The current picker disables editing and applies an automatic center square crop. The player cannot pan, zoom, or preview how the photo will look in the Profile header or at a small poker-table seat before replacement.

### 6. Play duplicates configuration while mixing unlike formats

Quick Play and Sit & Go both expose AI/table choices, but they are not the same game:

- Practice/Quick Play is a fixed hand orbit with no elimination.
- Sit & Go is a resumable elimination tournament with rising blinds and one winner.

They should share one compact configuration surface, not one domain implementation.

### 7. Championship lacks product hierarchy

RiverMind Championship currently appears as one menu row beside Daily Challenge and Sit & Go. Its journey, destinations, record, and invitations warrant a dedicated branded entry surface.

### 8. Tournament infrastructure rejects nine seats

The ordinary table engine and layouts support nine seats, but tournament infrastructure does not:

- `SitAndGoPlayerCount` permits only 3 and 6.
- checkpoint validation rejects seats at index 6 or above;
- tournament checkpoint arrays must have 3 or 6 players;
- the live table explicitly throws when a tournament receives nine players;
- Championship progress and statistics count only three- and six-player runs.

### 9. Championship persistence describes the old five-event course

Championship progress is version 1 and keys completion to five single events plus The River Below. The expanded course changes event identity, required seat counts, statistics, checkpoints, unlock order, and invitation behavior. This release intentionally resets that progression instead of preserving it.

### 10. The nine-seat lobby overlays status copy with a real seat

The compact private-table lobby uses a fixed 3×3 seat grid while independently positioning **Waiting for players** across the center. The middle seat therefore covers the status label. The table height is also calculated from fixed 215–270-point clamps rather than from the content rectangle between the lobby information and bottom action.

The status is not table geometry and does not need to occupy the felt. Move it into the lobby information hierarchy so every 2/3/6/9-seat preview can reserve the felt for seats.

### 11. Lobby AI seats discard their authored avatars

The live private table renders `AiAvatar`, but the lobby substitutes the same hardware-chip icon for every AI. Human seats use `HumanAvatar`, so lobby identity fidelity differs by seat kind and from the table that follows.

Every occupied lobby and live-table seat must render the same identity source it will use in play. Missing or unavailable human photos fall back to the default human avatar; missing authored AI assets fall back to initials without collapsing the plaque.

### 12. Responsive decisions use the raw viewport instead of the allocated pane

The current live layout mixes raw-window width classifications, hard-coded plaque footprints, percentage anchors, fixed minimum table heights, and a separately sized activity rail. On a landscape phone, the raw width can select wide plaques even after the activity rail has reduced the felt pane below the width those plaques require. This produces clipped names, stacks, cards, and right-edge seats.

Portrait tables can also stretch to consume surplus vertical space without improving readability. Setup and live geometry need one measured content-rectangle contract, not independent width/height guesses in each component.

### 13. Action chronology is difficult to verify visually

The canonical multiway engine builds preflop and postflop action order from the button and live seats, and the coordinator appends actions in hand-history order. The presentation layer then compresses server batches to a two-frame visual budget while the activity feed independently projects the full history. Seat rotation, skipped presentation frames, persistent plaque actions, and the feed can therefore look contradictory even when canonical state is legal.

The reported Bruce-then-Zane sequence in the supplied turn screenshot is itself legal: Aya has the dealer button, Bruce is the small blind, and Zane is the big blind, so Bruce precedes Zane post-flop. This scope must not “fix” that into dealer-first play. It must prove that engine order, displayed seat direction, transient bubbles, persistent actions, and feed rows all describe one monotonically ordered history.

### 14. The orientation selector behaves like two tiny tabs

The header currently renders separate portrait and landscape icon targets. The duplicated choice consumes scarce header width and makes the selected icon more prominent than the action. A single toggle can communicate the only useful command: switch to the other orientation.

### 15. Reaction choices are not understandable at a glance

The current tray presents twelve 30–32-point stickers without visible labels, then adds a 20-point eye control and 20-point close control. The stickers require memorization, and the two footer actions are below comfortable touch size. The mute action also competes with the primary task of sending a reaction.

### 16. A simple hand result repeats the same chips and winner

For an uncontested 20-chip pot, the result currently renders **Aya wins 20**, **Aya wins because everyone else folded**, **20 paid to Aya**, and **Final pot · 20**. The activity projection also appends both award and result events for every completed multiway hand. Complete payout data is important for side pots, but duplicating a simple result makes the explanation harder to scan.

### 17. Tap-to-open player profiles are inconsistent across tables

The local multiway table still gives recognized AI seats a tap handler and opens `AiPlayerProfile`, but the unified private-table `MultiplayerGameSeat` has no profile press handler. The existing AI sheet also stops at the large avatar, name, and optional title even though the authored identity already carries a personality label and summary. Human seats have no equivalent in-table profile sheet.

This must return as a shared occupied-seat interaction rather than another private-table-only patch. A player plaque remains readable without tapping, while a tap opens identity and appropriate public record detail without revealing cards, strategy internals, owner-only history, user ids, or account metadata.

### 18. Meet the players expands profiles inside the roster

**Meet the players** is currently reachable only through Learn's reference catalog. Featured regulars expand into a detail block below their grid, while other players expand inside their list row. Both patterns move surrounding content, make the selected player feel detached from the tap, and require scrolling to continue browsing.

Home needs a quiet direct route beside its existing poker reference shortcut. Within the roster, every player uses one stable popup presentation so the grid/list remains still, the selected identity is immediately readable, and dismissal is predictable.

### 19. A busted human cannot re-enter the current private-table session

The coordinator currently treats fewer than two positive stacks as `last-player-standing` and completes the session immediately. The next-hand projection also drops zero-stack players. There is no authenticated command that lets the busted seat add chips, so a real player who loses their stack can only wait for a rematch.

The new rule keeps the human's identity and seat intact and offers a 4,000-chip rebuy at a safe between-hands boundary. The server, not the client, owns the amount, eligibility, chip mutation, and idempotency.

### 20. Chip results are available only after the session and assume one buy-in

The existing Session standings sheet appears only when the session is complete. Its `delta` is `final stack − configured starting stack`, which is valid only when every player bought in once. It cannot explain a live result such as **Player A won 8,000** and **Player B lost 4,000**, and it would incorrectly count a rebuy as winnings.

The room needs an authoritative participant ledger and an always-reachable live stats sheet. Values shown during an active hand must remain frozen through the last settled hand so chips temporarily committed to the pot are not misreported as losses.

### 21. Human disconnects currently become AI play

The current multiplayer seat model can change a human seat's control to AI after leaving or missing turns, then offers a later reclaim flow. That makes the table continue, but it permits decisions the real player did not make and blurs the difference between an authored RiverMind opponent and an absent human.

This slice removes human-to-AI takeover entirely. An authored AI seat remains AI for the session. A human seat remains human through active play, a recoverable connection loss, sitting out, bust/rebuy, or permanent departure. The coordinator may deterministically fold an absent human when their unchanged deadline expires, but it may never check, call, bet, raise, or select strategy for them.

## Physical-device screenshot references

These screenshots preserve the reported build exactly as tested. Names, room codes, stacks, and other visible values are test data. They are evidence of the observed problems, not pixel-perfect specifications; the written behavior, responsive-layout, localization, accessibility, and poker-order requirements in this document remain authoritative.

| Reference | Captured evidence | Primary scope |
| --- | --- | --- |
| [Dark Home contrast](assets/phase16-slice-3.11/dark-mode-home-contrast.png) | The recommended-session action falls back to an unreadable dark foreground. | Issues 1; 3.11A |
| [Profile avatar layout](assets/phase16-slice-3.11/profile-avatar-layout.png) | The header avatar is optically low/undersized, and the separate Avatar card duplicates identity editing and consumes the screen. | Issues 2–5; 3.11A–B |
| [Play hub hierarchy](assets/phase16-slice-3.11/play-hub-hierarchy.png) | Quick Play and Sit & Go duplicate AI setup while Championship is reduced to an ordinary event row. | Issues 6–7; 3.11C–D |
| [Private nine-seat lobby](assets/phase16-slice-3.11/private-nine-seat-lobby.png) | The center status is covered by the middle seat, setup space is rigid, and lobby AI seats use generic chip icons instead of authored avatars. | Issues 10–12; 3.11E |
| [Private nine-seat portrait table](assets/phase16-slice-3.11/private-nine-seat-portrait.png) | Portrait density, duplicated orientation controls, seat/card allocation, and action/feed presentation need joint review. The Bruce-before-Zane sequence shown on the turn is a legal post-flop reference, not by itself an order defect. | Issues 12–14; 3.11E |
| [Reaction menu](assets/phase16-slice-3.11/reaction-menu.png) | Twelve unlabeled visual reactions plus undersized eye/close controls are difficult to interpret and operate. | Issue 15; 3.11E |
| [Private nine-seat landscape table](assets/phase16-slice-3.11/private-nine-seat-landscape.png) | Plaques, names, stacks, cards, board, and actions clip or overlap after the side rail consumes the actual felt width. | Issues 12 and 14; 3.11E |
| [Hand-result duplication](assets/phase16-slice-3.11/hand-result-duplication.png) | One 20-chip uncontested result repeats the winner/amount across headline, reason, payout, and final-pot copy. | Issue 16; 3.11E |

Before changing the related surfaces, the implementer must review the full-resolution references rather than relying on resized chat previews. Final visual QA captures comparable after screenshots at the same orientation and representative device size so reviewers can confirm that the identified failure—not merely one coordinate—was resolved.

## Product principles

- **Simpler surface, explicit format.** One AI-play card may configure multiple formats, but Practice and Tournament are never silently treated as the same rules.
- **Identity is one object.** Name and avatar live in one compact Profile header and one focused editor.
- **Normalize inputs, bound outputs.** Common source photo formats are converted into one safe avatar output contract before persistence or upload.
- **No default foregrounds.** Every visible string and icon resolves through a reviewed semantic theme token.
- **Championship earns its brand.** It is a journey with stages and invitations, not another setup row.
- **Nine-seat support is end-to-end.** A nine-seat Championship claim requires engine, checkpoint, simulation, statistics, UI, accessibility, and device verification.
- **Measure the pane, then lay out the table.** Window width alone does not describe the felt after safe areas, headers, feeds, and action rails take their space.
- **Identity semantics beat decorative color.** Avatars and explicit AI text communicate player kind; tint may reinforce but never replace the label.
- **One canonical chronology.** Roles, seats, bubbles, feed rows, timers, and actions are projections of the same ordered hand history.
- **A seat is a doorway to identity.** Every occupied plaque opens one consistent player profile, but the detail shown depends on whether the seat is authored AI, the viewer, or another human.
- **One character, one detail surface.** Meet the players and poker tables reuse the same AI profile presentation instead of expanding different fragments in place.
- **Room sharing is not public discovery.** A human intentionally shares the same Play record they see on Profile with members of the private room they joined. That does not create a searchable global profile, public API, or cross-room access path.
- **Results summarize before they account.** The common case is one compact sentence and reason; accounting detail appears only when poker settlement is genuinely complex.
- **Added chips are not winnings.** Every chip result is measured against the participant's complete buy-in ledger, and only settled hands change won/lost presentation.
- **Absence never becomes AI consent.** A human identity remains human. Disconnection can pause that person's participation and explicit exit can end it, but neither authorizes automated poker decisions on their behalf.
- **Early-release reset is narrow and intentional.** Reset Championship progression and active Championship checkpoints once; do not erase identity, learning progress, Daily Challenge progress, ordinary hand history, private-table history, or unrelated settings.

## Cross-cutting localization contract

- Add every new or changed message key to English, Simplified Chinese, and Traditional Chinese in the same implementation commit. The typed catalog and locale-completion tests must fail when any locale, key, or required interpolation is missing.
- Do not place user-visible English literals in components, domain presentation helpers, errors, accessibility metadata, timers, or fallback branches. Stable protocol/event ids remain untranslated internal values; every displayed label resolves through localization.
- Localize the complete Slice 3.11 surface: Home links; Profile/avatar editing and media errors; Play formats, player counts, difficulties, stack labels and chip/BB values; Championship stages, event titles including **The Undertow**, invitation/achievement/reset copy, and clocks; AI/Human and human-participation labels; AI personality titles/descriptions; player-profile owner/observer wording; rebuy eligibility/actions/status, buy-in and rebuy counts, won/lost/even chip results, settled-through-hand notes, and Table stats; orientation state; reactions; action/feed/result copy; Leave confirmation and consequences; connected, disconnected, sitting-out, left, retrying, reconnected, reconnect-denied, loading, partial, unavailable, and timeout states; and all accessibility output.
- Preserve placeholder names and meaning across locales. Tests must compare each locale's interpolation set and exercise plural/count, chips, big blinds, percentages, player names, table sizes, scope labels, **most recent** qualifiers, and owner-versus-observer grammar. Another player's record must never address the viewer as its owner in any locale.
- Translate display names for stages/events where the product uses localized titles, while keeping `local_3`, `the_undertow`, reaction ids, and other stable identifiers unchanged. Locked or hidden content must remain undiscoverable through untranslated fallback keys, accessibility text, analytics labels, deep links, or locale changes.
- Run the existing localization completion and Chinese quality suites at every checkpoint that changes wording. Add focused presentation tests for new messages and perform visual/Dynamic Type review in all three locales before the checkpoint is complete.

## 3.11A — Global dark-mode readability

### Theme contract

- Fix the confirmed Home session action by assigning the semantic primary foreground color.
- Audit every raw React Native `Text` and icon in Home, Learn, Play, Profile, setup, Championship, private multiplayer, every table, results, replay, sheets, alerts, and onboarding.
- Every text style must use an explicit semantic token such as primary text, secondary text, text on accent, danger text, table text, or card text. Platform default black/white is never an accepted fallback.
- Do not use `primaryText` unless the immediate background is `primary`; dark-theme `primaryText` is intentionally dark because the primary fill is light lavender.
- Review disabled, pressed, selected, placeholder, badge, scrim, and translucent-overlay combinations independently.
- Preserve a minimum 4.5:1 contrast target for ordinary text and 3:1 for large text and meaningful non-text controls.

### Regression prevention

- Add a theme-token contrast corpus covering every supported foreground/background token pair.
- Add a source or component invariant that rejects newly introduced visible text without an explicit semantic foreground unless it inherits from a reviewed themed text boundary.
- Add deterministic light/dark screenshot states for the highest-risk shared components.
- Dark-mode QA must cover English, Simplified Chinese, and Traditional Chinese because wrapping can move text onto a different background region.

## 3.11B — Compact identity editor and robust photo adjustment

### Profile identity header

- Keep one identity card at the top of Profile.
- Make the avatar a 44-point-or-larger accessible button with a 30–32-point visible avatar and a small camera/edit badge.
- Normalize authored avatar artwork to consistent visual padding and center of mass. The shared `HumanAvatar`/avatar-button components own geometry for Home, Learn, Play, Profile, setup, tables, results, and replay.
- Tapping the name or **Edit name** edits the name. Tapping the avatar opens the avatar editor.
- Remove the standalone Avatar card, its duplicated large preview, and its explanatory paragraphs from the scrolling Profile screen.

### Avatar editor

Use a focused bottom sheet or modal with only the controls needed for the task:

1. Current avatar preview.
2. Authored avatar choices.
3. **Choose photo** and **Take photo** actions when supported.
4. **Remove photo** or **Use initials** when applicable.
5. Cancel/close.

Do not add storage or sharing prose to this sheet. The existing private owner-scoped upload and room-authorized rendering rules remain unchanged.

### Source image support

- Accept ordinary still-image sources from iPhone and common libraries: JPEG/JPG, PNG, HEIC, HEIF, WebP, and AVIF.
- Treat picker MIME as a hint. When it is absent, generic, or an alias, use the asset extension and/or bounded magic-byte detection before rejecting it.
- A Live Photo selection uses its still-photo component; animated video content is never uploaded as an avatar.
- Apply EXIF orientation before crop and strip metadata from the processed result.
- Permit a bounded original source large enough for modern phone photos (target ceiling: 25 MiB with a reviewed decoded-pixel guard), then enforce the strict limit on the processed output.
- Re-encode uploaded photos to a canonical supported format, target a maximum 1024×1024 square, and keep the processed result at or below 2 MiB. The recorded MIME and upload content type must match the actual encoded bytes.
- Corrupt files, unsupported animated inputs, decoder failures, oversized sources, and oversized processed results return specific localized errors without replacing the current avatar.

### Crop, zoom, and confirmation

- After selection or capture, show a square adjustment view with pan and pinch-to-zoom. Correct orientation before the player adjusts framing.
- The crop viewport represents the exact square saved by the app. The circular mask is a presentation overlay, not a destructive second crop.
- After adjustment, show a confirmation preview at two sizes: the Profile avatar and the small table-seat avatar.
- Provide **Use photo**, **Adjust again**, and **Cancel**. Nothing is persisted or uploaded until **Use photo**.
- Preserve the existing replacement invariant: the previous avatar remains active until the new processed file is valid and durably tracked; failed upload or cleanup must not leave an untracked file or broken profile reference.

## 3.11C — Simplified Play hub

### Section order

The Play screen uses this order:

1. **Play together** — create, join, and resume private tables.
2. **RiverMind Championship** — a dedicated branded entry card.
3. **Play vs RiverMind AI** — one compact configurable card.
4. **Daily Challenge** — one compact event card/row.
5. **Training & custom** — scenario and advanced custom setup behind a quiet disclosure.

Remove the existing large Quick Play card from the top of Play. The Home Quick Play shortcut remains a one-tap route and launches the last valid Practice configuration or the product default.

### Home reference shortcuts

- Keep **Poker cheat sheets** in its current quiet Home position and place **Meet the players** immediately below it, before **Quick start**.
- Present the two routes as one compact reference group or two visually paired rows. They must not become large promotional cards or push the primary session and Quick start content materially farther down the screen.
- **Meet the players** opens the existing full AI roster directly. Keep the existing Learn → Reference entry so both routes converge on the same roster state rather than maintaining separate catalogs.
- Give each row a distinct icon, label, description, and explicit themed foreground in light and dark mode. The entire row is a 44-point-or-larger target and remains readable at supported text scales in all three locales.

### Play vs RiverMind AI

The compact card exposes:

- **Format:** Practice or Tournament.
- **Players:** Practice supports 2/3/6/9. Tournament supports 3/6/9. A two-player heads-up Sit & Go is not part of this slice.
- **AI difficulty:** Friendly, Club, Sharp, Elite, or Nemesis, limited only when the authored roster cannot fill the selected table without duplicate identities.
- **Starting stack:** Practice uses Short 800 chips (40 BB), Standard 2,000 (100 BB, default), and Deep 4,000 (200 BB). Sit & Go uses Short 800 (40 BB), Standard 1,200 (60 BB, default), and Deep 2,000 (100 BB). Show both chips and big blinds rather than asking the player to translate between them. Championship stacks remain fixed by event and are not user-selectable.
- **Advanced:** Coach where allowed, practice hand/orbit length, table pace, and tournament blind speed. Keep this collapsed by default.
- One clear **Start practice** or **Start tournament** action.

Changing format updates only the controls whose meaning differs. Practice keeps a bounded hand/orbit duration; Tournament keeps elimination, rising blinds, checkpoints, and one winner.

### Compactness rules

- Use segmented controls or horizontal chips for Format and Players.
- Use one summary row or compact selector for Difficulty and Stack rather than five full-height cards.
- Keep the primary start action visible without scrolling on a large iPhone when the AI card first opens.
- Preserve Dynamic Type reachability and do not horizontally clip Chinese labels.

## 3.11D — Branded Championship v2 and nine-seat tournaments

### Play entry

RiverMind Championship receives its own branded card with:

- Championship wordmark/trophy treatment;
- current stage and table size;
- completed-event count;
- **Continue Championship** or **Start Championship**;
- a quiet route to the Championship map/record.

It must be visually distinct from an ordinary list row without introducing a second navigation system or consuming the entire first screen.

### Main tour

The expanded main tour contains ten required events grouped into five branded stages:

| Stage | Stable event | Seats | Target lineup | Qualification | Structure |
| --- | --- | ---: | --- | ---: | --- |
| Local Tables | `local_3` | 3 | 1 Friendly, 1 Club | Top 2 | Standard |
| Local Tables | `local_6` | 6 | 3 Club, 2 Sharp | Top 3 | Standard |
| Local Tables | `local_9` | 9 | 4 Club, 4 Sharp | Top 4 | Standard |
| City Circuit | `city_6` | 6 | 2 Club, 3 Sharp | Top 3 | Standard |
| City Circuit | `city_9` | 9 | 2 Club, 6 Sharp | Top 4 | Standard |
| National Tour | `national_6` | 6 | 2 Sharp, 3 Elite | Top 2 | Standard |
| National Tour | `national_9` | 9 | 4 Sharp, 4 Elite | Top 3 | Standard |
| Masters Division | `masters_6` | 6 | 5 Elite | Top 2 | Masters |
| Masters Division | `masters_9` | 9 | 6 Elite, 2 Nemesis | Top 2 | Masters |
| RiverMind Final | `championship_final` | 9 | 8 Elite | Win | Final |

The lineup and qualification values above are design targets. Seeded simulation may tune them before release, but the seat progression and stage order are fixed by this scope.

A stage unlocks its next table when the current table is qualified. The next stage unlocks only after every table in the current stage is qualified. RiverMind Final completion unlocks The River Below.

### Hidden invitation chain

| Invitation | Stable event | Seats | Lineup | Qualification | Turn clock | Structure |
| --- | --- | ---: | --- | ---: | ---: | --- |
| The River Below | `river_below` | 9 | 4 Elite, 4 Nemesis | Win | 45 seconds | Invitation |
| The Undertow | `the_undertow` | 9 | 8 Nemesis | Win | 30 seconds | Undertow |

- The Undertow remains completely hidden until The River Below has been won.
- Winning RiverMind Final reveals only The River Below; it must not reveal or name The Undertow.
- Winning The River Below completes its existing achievement and reveals the new invitation.
- Winning The Undertow completes the currently authored hidden chain. Future invitations may follow its unlock boundary but are outside this slice.

### Turn-clock behavior

- Every active seat is subject to the event's turn limit. AI seats complete their normal presentation and action within the same cap; only the human needs an interactive countdown.
- The human clock starts only after the table is stable, legal actions are visible, and control has actually passed to the player. Deal, street, reaction, rotation, and result animations never consume the action budget.
- Opening bet/raise sizing does not pause the clock. The remaining time stays visible inside the sizing sheet.
- Show a calm countdown throughout the turn, a clear warning at 10 seconds, and a critical state at 5 seconds. Do not add constant audio. Haptics respect the existing preference.
- Timeout chooses **Check** when check is legal; otherwise it chooses **Fold**. It never invents a call, bet, raise, or all-in.
- App backgrounding or an OS-owned interruption pauses the local clock and resumes with the same remaining duration. Rotation and opening/closing app-owned sheets do not reset it.
- Reduced Motion replaces animated urgency with static color/text changes. VoiceOver announces the available time at turn start and the 10- and 5-second warnings without repeating every second.
- The timer is part of local challenge rules only. This slice adds no leaderboard, anti-tamper claim, server clock, or prize implication.

### Tournament engine expansion

- Extend the Sit & Go seat-count contract and every validator from 3/6 to 3/6/9.
- Accept seat indices 0–8 in nine-seat checkpoints and preserve all nine players, stacks, seats, button position, blind level, structure, difficulty, and next-hand number through save/resume.
- Remove the live-table assertion that nine-seat tournaments are local-practice-only.
- Keep two-player heads-up outside `SitAndGoPlayerCount` unless the open product decision explicitly approves a heads-up tournament implementation.
- Extend Championship lineups, seeded simulations, completion placement, qualification, achievements, statistics, record presentation, and checkpoint validation to nine seats.
- Add `ninePlayerRuns`; replace six-player-only **Full Table** semantics with an explicit nine-seat/full-ring achievement while preserving clear localized copy.
- Verify Nemesis decision cost with eight AI opponents on the minimum supported phone. Difficulty must not make the interface miss its own 30-second action/presentation cap, overheat, or stall.

### Intentional Championship reset

- Bump the Championship persistence/checkpoint contract to version 2 or move it to a versioned v2 storage key.
- On the first load of this release, any version 1 Championship progress, achievements, record, and active Championship checkpoint are discarded and replaced by one valid empty version 2 state.
- Persist the empty version 2 state immediately so the reset happens once, not on every launch.
- Do not attempt to infer completion of new tables from old five-event progress.
- Do not preserve an active legacy six-player Final or River Below run.
- Do not erase ordinary completed-hand history or Profile play statistics as part of this reset; they are historical play records, not Championship unlock state.
- Do not erase identity/avatar, learning progress, Daily Challenge progress, Sit & Go checkpoints, private-table history, language, appearance, haptics, or other settings.
- No blocking migration explanation is required in the app for this early release. Release notes may state that Championship progression was refreshed for the expanded tour.

## 3.11E — Responsive setup and live-table experience

### One measured layout contract

Create one pure layout resolver for table previews and live tables. Its inputs are the measured content width and height, safe-area insets, orientation, seat count, surface (`setup`, `lobby`, `live`, or `result`), activity-feed mode, and accessibility text scale. Its output owns:

- table-pane bounds and bounded aspect ratio;
- seat anchors and plaque density;
- protected board/status rectangle;
- activity and action-rail bounds;
- portrait/landscape composition;
- whether secondary information collapses into a disclosure.

Use `flex`, `onLayout`, and measured remaining space for the outer composition. Numeric sizes remain appropriate for minimum touch targets, card aspect ratios, readable type, safe gaps, and maximum content widths; they must not be used as an unrelated fixed table height selected from raw screen width alone.

The resolver must prefer a smaller readable table with intentional surrounding space over a stretched felt, and it must never choose a plaque density that cannot fit after the activity rail is allocated.

Apply the contract to every table-bearing flow:

- heads-up Practice;
- 3/6/9-seat Practice and Sit & Go;
- missions and Daily Challenge;
- Championship and hidden invitations;
- private 2/3/6/9-seat lobby and live table;
- results and hand replay where the shared table is visible.

### Setup and lobby previews

- Review the AI setup, Sit & Go setup, Championship event preview, and private-table create/join/lobby screens together so table-size controls and seat previews use the same 2/3/6/9-seat vocabulary.
- Give the preview/table region the measured remainder between its information header and sticky bottom action. Bound its aspect ratio rather than assigning an independent fixed height.
- Move **Waiting for players** and equivalent setup status outside the seat map. No center copy may sit beneath an occupied or open seat.
- Render `AiAvatar` for every authored AI in the lobby. Render `HumanAvatar` for every real player, including the default avatar, authored choice, uploaded photo, loading fallback, failed-photo fallback, and privacy-hidden state.
- Keep every open seat visually and semantically distinct from an occupied seat. Host add/remove behavior remains reachable with at least a 44×44-point target even when the visible plaque is compact.
- Resolve all seat rectangles and the protected center rectangle in pixels from the measured table. Tests must reject overlaps, clipping, and targets outside the felt for every supported size.

### AI identification

- Add a localized **AI** pill or equivalent explicit text to authored AI plaques in setup, lobby, live play, result, and replay.
- Use the AI avatar's existing accent family for a subtle border or background tint. Do not use danger red, winner gold, or a saturated full-card fill.
- Active turn, just acted, all-in, folded, disconnected, winner, dealer, small blind, and big blind retain higher visual priority than the AI tint.
- Human and AI distinctions must remain understandable in grayscale, high contrast, and VoiceOver/TalkBack output.
- A human seat is never AI-controlled and never displays an AI-control state. It remains explicitly **Human** and adds the applicable participation state—**Disconnected**, **Sitting out**, **Reconnecting**, or **Left**—without imitating an authored AI identity.

### Tap-to-open player profiles

- Make the complete occupied player plaque a 44-point-or-larger accessible target in every setup, lobby, live, result, and replay surface that displays players. A single tap opens the same responsive player-profile sheet for the viewer, another human, or an authored AI. Open seats keep their setup/lobby add-player behavior and do not open a profile.
- Restore this interaction across heads-up Practice, 3/6/9-seat Practice and Sit & Go, missions, Daily Challenge, Championship and hidden invitations, and private 2/3/6/9-seat tables. Opening or closing the sheet must not replace, navigate away from, or reset the active table.
- The AI view shows a large authored `AiAvatar`, display name, localized fun title when one exists, explicit **AI** identity, localized personality label, and short authored description. It must not expose hidden strategy weights, ranges, adaptation state, decision traces, or other gameplay internals.
- In **Meet the players**, tapping either a featured tile or a regular list row opens that same AI presentation in a popup above a dimmed, stationary roster. Remove the detail block below the featured grid and the expanded regular-player row; selection must never resize, reorder, or scroll the roster.
- The roster popup closes when the player taps anywhere outside its card, uses platform Back/Escape, or activates one clear 44-point close target. A tap inside the descriptive card does not have hidden dismiss behavior. Closing restores accessibility focus to the exact tile or row that opened it.
- The human view shows a large `HumanAvatar`, display name, explicit **Human** identity, and the same shared `PlayStatisticsCard` presentation visible on that person's own Profile: completed Hands, Tables, Wins, Win rate, populated Solo/Local/Private breakdown, and the same truthful scope/coverage note. Both surfaces consume one presentation model so future field or wording changes cannot drift.
- Keep the same fields, values, ordering, definitions, and coverage meaning while adapting grammatical perspective: the owner may read **Your full record**, while another room member sees neutral or named copy such as **Hao's full record**. The viewer must never be addressed as the owner of somebody else's statistics.
- The human's client builds a bounded, versioned `PublicPlayerRecordSnapshot` from the same `loadPlayStatistics({ includePrivate: true })` result used by Profile and supplies it when creating, joining, or rejoining a private room. Refresh it after each completed private-room hand and after a foreground/reconnect statistics refresh so the owner's Profile and room profile converge.
- Preserve the source coverage states (`complete`, `capped`, `partial`, `unavailable`, and `skipped`) in the shared snapshot. Never convert unreadable history into zero hands or zero wins, remove a **most recent** qualifier, or imply that a device-only/partial record is complete.
- Treat Solo/Local figures as player-supplied because their source history can live only on that player's device. The room service validates version, shape, non-negative integer bounds, totals, source consistency, payload size, and that only the authenticated seat owner can publish or replace its snapshot; the UI must not call the record verified, ranked, or server-certified.
- Expose that snapshot only inside the private room's authorized public projection. Do not expose a human player's account id, email, authentication metadata, hand archive, stable hand/table ids, private hole cards, raw coverage source rows, or a globally discoverable profile endpoint.
- When a remote player's record has not arrived or cannot be refreshed, show the same honest unavailable state as Profile rather than synthesizing a current-table substitute. Realtime retry, reconnect, replay, and snapshot convergence must not apply another player's snapshot to the wrong seat or accept a stale update over a newer one.
- A human's uploaded avatar remains available only through the existing room-authorized avatar path and obeys the existing hidden-photo fallback. Leaving or losing authorization to the room removes access; the profile sheet must not make the image URL reusable or public.
- Preserve the existing avatar-privacy gesture as a separate interaction: single-tapping the plaque opens the profile, while the documented long-press/accessibility action on the avatar controls privacy. These actions must have distinct labels and hints.
- Do not let profile browsing steal an action. The turn clock continues running, and an open sheet dismisses automatically when the viewer becomes the actor, followed by the normal **Your turn** announcement. While the viewer is already the actor, occupied plaques remain identifiable but the profile action is unavailable with the hint **Act first to view player profile**.
- The sheet uses the measured safe area: a compact bottom sheet in portrait and a bounded side sheet in landscape. It closes with one clear 44-point target or an outside tap, restores focus to the originating plaque, and never covers the legal-action rail when the viewer must act.

### Canonical poker order and presentation

The engine and every presentation must follow these invariants:

- Define one canonical clockwise seating ring. Starting at the button, its visible and semantic order is **Dealer → Small Blind → Big Blind → remaining player(s) → Dealer**. Rotating the table to place the viewer at the bottom may change screen coordinates, but it must never reverse or scramble that clockwise ring.
- Betting always advances through that clockwise ring, skipping seats that are not eligible to act. The street determines only where traversal starts; it does not change its direction.
- At 3–9 seats, preflop begins with the first live seat clockwise after the big blind. The small blind and big blind act near the end unless a later raise reopens action.
- Heads-up keeps the dealer/small blind first preflop and the big blind first post-flop.
- At 3–9 seats, every post-flop street begins with the first live seat clockwise after the dealer.
- A raise reopens action clockwise immediately after the raiser, skipping folded and all-in seats and stopping only when every eligible player has responded to the current wager.
- Rendering rotates the viewer to the owned seat without reversing the engine's clockwise order. Dealer, small-blind, and big-blind badges must stay attached to their canonical players.
- Transition batches, bubbles, persistent plaque actions, and activity rows use strictly increasing authoritative history indexes. Presentation may omit intermediate bubbles to meet a time budget, but it may never show a newer action and then an older action.
- The activity feed is the complete canonical chronology and contains each durable event once. Realtime retries, snapshot convergence, rotation, reconnect, and moment merging must not duplicate or reorder it.

Add a named regression fixture matching the reported screen: Aya is dealer, Bruce is small blind, and Zane is big blind on the turn. The canonical ring is **Aya (Dealer) → Bruce (Small Blind) → Zane (Big Blind) → remaining seats → Aya**. Because the turn is post-flop, action starts with the first eligible seat after Aya; assert that Bruce precedes Zane, then the remaining eligible seats follow clockwise until Aya. Add a complementary preflop assertion that action starts with the first eligible seat after Zane and continues clockwise through the remaining seats, Aya, Bruce, and finally Zane when no fold, all-in, or raise changes eligibility. Add heads-up, raise-reopen, folded-seat, all-in, and reconnect fixtures so a true order defect cannot hide behind this legal example.

### Orientation toggle

- Replace the portrait/landscape tab pair with one 44×44-point-or-larger toggle.
- In portrait it displays the landscape destination and announces **Switch to landscape**. In landscape it displays the portrait destination and announces **Switch to portrait**.
- Tapping while a rotation is in flight is disabled and displays progress in the same target. Unsupported and failed rotation feedback remains visible and accessible.
- The toggle changes presentation only. It never resets a timer, action queue, bet-sizing draft, reaction queue, table feed, or canonical game state.

### Portrait live table

- Allocate the header, table, optional feed disclosure, result/action rail, and safe areas before resolving the felt.
- Do not stretch the felt solely because a tall phone has unused height. Keep a bounded table aspect ratio and use surplus space to improve gaps, plaque readability, or separation from controls.
- Preserve a protected board lane and keep every seat, role badge, hole card, action line, winner badge, and transient moment outside it.
- The viewer's cards and action buttons remain the clearest interactive hierarchy. Opponent cards must not become larger than the information needed to act.

### Landscape live table

- Use a true two-pane composition: the measured felt receives the remaining width after the safe-area-aware activity/action rail is allocated.
- Size the rail within a tested proportional range and minimum readable width; do not select wide table plaques from total window width when the resulting felt is compact.
- Place the activity feed above the actions in the side rail. Fold, Check/Call, and Bet/Raise remain full-width text buttons inside that rail with at least 44-point targets.
- Remove the options/sliders icon from Bet/Raise in portrait and landscape. The verb and amount carry the meaning; opening the sizing sheet remains the interaction.
- Keep the pot, board, viewer cards, all occupied seats, names, stacks, roles, and current action fully inside the felt. No right-edge clipping or horizontal scrolling is allowed.
- On a short landscape phone, reduce plaque density and secondary metadata before reducing primary names, stacks, cards, or action-target size below their minimums.

### Reaction menu

- Keep one 44×44-point-or-larger reaction button beside the action/result rail.
- Tapping it toggles an anchored text menu. Tapping outside closes the menu. Remove the tray's eye control and close button.
- Show the eight proposed localized phrases as text rows with no icon-decoding requirement. Use one column in portrait and up to two textual columns on short landscape surfaces; every row remains at least 44 points high.
- Selecting a phrase queues it immediately and leaves the menu open for repeated taps. Preserve the silent, no-visible-cooldown, bounded serial queue and non-overlapping slow 弹幕 behavior from Slice 3.10.
- Announce queued, busy, and failed states accessibly without reserving a permanent footer row. Do not let the menu cover the player's legal actions; flip or reposition it within the measured safe area.
- Move the global **Mute table moments** preference to Profile Preferences. Per-seat avatar privacy and any future per-player moderation remain separate controls; the reaction popover does not host them.
- Keep all twelve protocol ids valid for mixed-version private rooms. The new UI sends only the selected eight, so an older client can still send one of the four hidden ids without causing a protocol or rendering failure.

### Concise hand results

- A sole-recipient uncontested result renders **Aya wins 20** and **Everyone else folded.** The name and amount appear nowhere else in that visible result card.
- A sole-recipient showdown renders **Aya wins 668** followed by the localized winning-hand description. Do not introduce the word **because** as a heading or sentence template.
- Hide payout rows and final-pot copy when one recipient receives the entire pot and that amount is already in the headline.
- For a split pot or side pots, show one neutral result headline and one compact accounting breakdown containing each recipient and amount once. Show the total pot once only when it adds information beyond the individual awards.
- Project one ordinary terminal event into the activity feed. Add separate side-pot award rows only when distinct pots or recipients need explanation; do not append a duplicate award and result pair for the common case.
- Accessibility output follows the same information budget: it must be complete, but it must not read the same winner and amount repeatedly.

## 3.11F — Human seat lifecycle, unlimited rebuys, and live chip results

### Rebuy eligibility and accounting

- Define one server-owned `MULTIPLAYER_REBUY_CHIPS = 4_000` constant. The client sends only a `rebuy` intent; it never supplies or calculates the accepted amount.
- A rebuy is legal only for the authenticated owner of a human seat whose last settled stack is exactly zero, while the room is between hands (or paused from between hands) and the configured hand limit has not completed the session. A disconnected human must successfully reconnect as that seat owner first; a player who explicitly left the running session cannot rebuy or return to it.
- Accept any number of valid rebuys over the life of the room session. There is no product cap, escalating price, waiting period between busts, or host approval. Normal safe-integer/payload bounds remain defensive invariants, not a gameplay limit.
- Rebuy is not a top-up: reject it when the human still has chips, during an unsettled hand, after session completion, from an AI seat, for another user's seat, or with a duplicate/stale command.
- On acceptance, atomically add exactly 4,000 to the settled player stack, add 4,000 to that participant's cumulative buy-in, increment the rebuy count once, clear the seat's pending decision, and publish one new canonical version. A transport retry with the same command id returns the original transition and never adds chips twice.
- These are play chips only. No purchase, currency, wallet, payment, cash-out, prize, or monetary-value language or system is introduced.
- Disclose the fixed **Rebuy 4,000 chips** rule in private-table create/lobby summaries even when the original table starting stack is 800 or 2,000, so every participant sees that a rebuy can be larger than the opening stack before readying.

### Between-hands rebuy window

- When a settled hand reduces a connected human to zero and the hand limit has not been reached, keep the seat and identity in the room, mark its rebuy decision pending, and defer the normal next-hand countdown. Show **Rebuy 4,000** and **Sit out** as separate 44-point actions.
- Use the room's configured 30/45/60-second turn duration as the rebuy-decision deadline; do not add another table setting. Expiry or disconnection resolves that decision as **Sit out** for the next hand, after which the player may still rebuy at any later between-hands boundary. The number of later rebuys remains unlimited.
- Start the ordinary next-hand countdown only after every connected pending human has rebought, chosen Sit out, or reached the decision deadline. A player who sits out is omitted from the next deal but keeps the seat and room membership.
- If fewer than two active funded participants remain but at least one busted, disconnected, or sitting-out human could return, do not immediately complete with `last-player-standing`. Keep the room between hands with no deal countdown until reconnect/return/rebuy produces at least two active funded players or the host explicitly ends the session. A disconnected human may authenticate, reconnect to the preserved seat, and then return or rebuy during that wait.
- Complete normally at the configured hand limit regardless of rebuy eligibility. Complete as `last-player-standing` only when fewer than two positive stacks remain and no human participant can return. Add a distinct localized `host-ended` completion reason for the host ending a stalled fewer-than-two-live-stacks session. Rematch starts a fresh session and fresh buy-in ledger.
- A rebuy/deal-now/tick/timeout race resolves through expected-version and command-id semantics. A hand may never be dealt from a state that both excludes the busted player and has already accepted that player's rebuy.

### Human seat lifecycle, reconnection, and permanent exit

Keep seat identity separate from participation state. `kind = human | ai` is immutable for a running session. Human participation is represented explicitly as **active**, **disconnected**, **sitting out**, **rebuy pending**, or **left**; none of those states changes `kind`, grants AI control, or permits an authored AI profile to replace the person.

#### Connection loss and retry

- A transport interruption, app background termination, Realtime timeout, or failed heartbeat marks the human **Disconnected**; it does not mean **Left**. Preserve the exact seat, player identity, stack, cards already committed to the current hand, rebuy state, ledger row, and room authorization needed for recovery.
- Only the same authenticated user bound to that seat may use **Retry connection**. The host, another room member, a new anonymous client, or a client supplying the seat/user id may not reclaim or act for it. A successful retry resumes from the newest canonical snapshot and never resets a turn/rebuy deadline or duplicates an action, buy-in, or statistics update.
- If the player reconnects before their current action deadline and the server has not yet accepted a forced fold, they regain control of the existing legal decision with the original deadline. The client must not extend the clock by disconnecting or retrying.
- If the player is still disconnected when their action deadline expires, the coordinator records one deterministic **Disconnected — folded** transition and advances the hand. It never checks for them when checking is free, calls a wager, bets, raises, goes all-in, or invokes an AI strategy. If the player was already all-in, no decision is required; their committed hand remains eligible for normal settlement.
- After that hand, a disconnected human is **Sitting out** and receives no cards in later hands. Reconnecting during a hand from which the player was already omitted restores room access and controls, but eligibility begins at the next safe between-hands deal.
- A connected sitting-out player with chips may choose **Return next hand**. A connected sitting-out player at zero must use the fixed Rebuy flow before returning. Reconnection itself never grants chips or inserts a player into a hand already in progress.
- Keep Retry connection available until the room expires or completes, the host ends a stalled session, or the player explicitly leaves. Failure states distinguish retryable network/service failure, expired/completed room, authentication mismatch, and permanent departure without exposing account or seat identifiers.

#### Intentional Leave table

- **Leave table** requires a clear confirmation that the player will forfeit/fold the current hand if necessary and cannot return to this running session. Cancel is the safe default. All visible, spoken, and error copy is localized in the same checkpoint.
- Once the authoritative leave command is accepted, it is permanent for that `roomId + sessionNumber`. The former player cannot re-enter with the room code, Retry connection, a fresh client instance, or host assistance. They may participate only in a later rematch/new session that performs a new seating flow.
- If the human still has a decision in the active hand, the coordinator folds that seat at the next legal transition and never asks AI to finish it. If the seat is already all-in, the committed hand settles normally without further decisions; the seat becomes **Left** immediately after settlement. Between hands, departure becomes effective immediately.
- Preserve the departed participant's last settled/cashed-out stack and ledger row for Table stats, final standings, archive, and chip conservation. Mark the row **Left** and exclude the seat from every future deal in the running session. Do not let the host fill it with another human or AI after play has begun.
- Open lobby seats may still be filled before the first deal under the existing rules. After the first deal, a human seat belongs only to its original authenticated owner until that owner leaves or the session ends; leaving retires the seat instead of reopening it.
- If the departing or disconnected player is host, transfer table-management authority to an eligible connected human using the existing deterministic host order. Host transfer never transfers the original player's identity, seat, stack, cards, or ability to act, and reconnecting does not silently take host authority back.

#### Table viability

- A new hand requires at least two **active**, funded participants. Disconnected, sitting-out, left, and zero-stack seats are not dealt. Only authored AI seats count as active AI participants.
- When fewer than two active funded participants remain but a disconnected, sitting-out, or busted human is still allowed to return, pause between hands. The host may use the localized host-end action rather than wait indefinitely.
- `last-player-standing` is legal only when fewer than two funded participants remain and no preserved human seat can reconnect, return, or rebuy. Permanent departures, room completion/expiry, and host-ended completion close their retry path deterministically.
- The action feed and accessible announcements say **disconnected**, **folded while disconnected**, **reconnected**, **sitting out**, or **left**. They never say or imply that RiverMind AI took over a human seat.

### Authoritative participant ledger

- Add one versioned ledger entry for every participant who took a seat in the session, including authored AI and humans who later disconnect, leave, or sit out. Do not drop historical rows when the live seat presentation changes.
- Initialize `initialBuyIn` and `totalBuyIn` from the configured starting stack, with `rebuyCount = 0`, `rebuyChips = 0`, and the opening settled stack equal to that buy-in.
- Store/update only the bounded facts required for presentation: player/seat identity reference, immutable kind, initial buy-in, rebuy count, rebuy chips, total buy-in, stack after the last settled hand or accepted rebuy, net chips, last settled hand number, and active/disconnected/sitting-out/rebuy-pending/left status.
- Define `netChips = settledStack - totalBuyIn`. Example: a player buying 4,000, busting, rebuying 4,000, and busting again has `0 − 8,000 = −8,000`; the opponent holding 12,000 after one 4,000 buy-in has `12,000 − 4,000 = +8,000`.
- Update settled stacks and net chips only after canonical pot settlement. During an active hand the ledger remains frozen and labelled **Through Hand N**; blinds, calls, and bets currently in the pot must not appear as temporary losses.
- At every settled boundary, the sum of net chips across all ledger participants is exactly zero and the sum of settled stacks equals the sum of all original/rebuy chips introduced. Reject or fail closed on a snapshot that violates those conservation invariants.
- Persist the final ledger with the session archive/summary so reconnect, final standings, and hand review render the same values. A rematch increments `sessionNumber` and initializes new ledger entries rather than carrying prior wins, losses, or rebuy counts forward.

### Table stats quick action and sheet

- Add one visible **Stats** action with a chart/list symbol to the top private-table header from the first deal through completion. It is at least 44×44 points, has the accessibility label **View table stats**, and remains distinct from the orientation toggle, pot, timer, feed, and player-profile interactions.
- The measured header/landscape rail contract reserves space for Stats instead of squeezing or clipping the title, timer, orientation control, or felt. On compact portrait it may use the short localized label **Stats**; in landscape it may sit at the top of the side rail while remaining visually part of the header action group.
- Opening Stats presents a responsive sheet containing every participant ledger row, including AI, busted, sitting-out, disconnected, and departed players. Sort by `netChips` descending, breaking ties by canonical seat order, so the largest winner appears first and the largest loser last.
- Each row shows avatar, player name, explicit AI/Human identity plus any human participation state, localized **Won 8,000**, **Lost 4,000**, or **Even**, and quieter supporting values for settled stack, total buy-in, and rebuy count. Do not derive a win/loss label from final stack alone.
- Show **Through Hand N** while a hand is active and update the list only after settlement. At zero completed hands show every participant as **Even**, not as a winner or loser.
- Reuse this ledger in the final Session standings so `netChange` subtracts total buy-in rather than only the first starting stack. Final placement may remain based on settled stack, but stack/place and chips won/lost must be labelled as different concepts.
- Stats is read-only and never pauses the action or rebuy clock. Apply the same turn-safety rule as player profiles: dismiss it automatically when the viewer becomes the actor, announce **Your turn** once, and make opening unavailable while the viewer must act.
- Outside tap, one clear close target, Back/Escape, orientation change, reconnect, and result transition dismiss or reflow the sheet without losing ledger state or scroll/focus origin. The sheet must remain readable for nine rows in portrait, short landscape, Dynamic Type, and all three locales.

### Protocol and authorization boundary

- Version the coordinator, public snapshot, archive, completion-reason parser, and client parser for the participant ledger, immutable seat kind, explicit human participation states, pending rebuy decisions/deadline, `host-ended`, and `rebuy`/`sit-out`/`return-next-hand`/`leave`/`retry-connection`/`end-stalled-session` commands. Retire human `control = ai` and the old `reclaim` path; an upgraded parser must never normalize an absent human into AI control. The end command is host-only and legal only when the room is between hands with fewer than two active funded participants. Consolidate this with the Slice 3.11 player-record protocol bump rather than creating incompatible intermediate versions.
- Advertise the seat-lifecycle and rebuy-ledger capability during join negotiation. A client that cannot parse the immutable human/AI kind, participation states, authoritative ledger, and rebuy state is refused before seating with localized update-required guidance; it must never join and then silently enable human-to-AI takeover or calculate old one-buy-in standings.
- The multiplayer Edge Function authenticates the caller, resolves the caller's seat and reconnect eligibility from canonical state, applies the command through the coordinator, and publishes only the bounded public ledger. Do not trust a client-provided user id, seat id, amount, stack, total buy-in, rebuy count, net result, participation state, or reconnect claim. Only the original authenticated owner may recover a disconnected seat; the host cannot override this binding.
- Keep canonical user ids, processed-command fingerprints, and private hand state out of the public projection. Only current authorized room members may read the live ledger; leaving/room expiry removes access under the existing room authorization boundary.
- Old clients that implement human-to-AI takeover cannot enter a new-version room. Any pre-upgrade room that cannot be represented safely is closed or paused with update-required guidance during the coordinated deployment; it must never continue by silently granting AI control over a human seat.

## Component and domain boundaries

| Concern | Primary boundary |
| --- | --- |
| Semantic theme tokens and resolved appearance | `src/theme.tsx` |
| Home session contrast defect | `src/features/learn/RecommendedSessionHomeCard.tsx` |
| Shared avatar rendering and header button | `src/components/HumanAvatar.tsx`, a focused avatar-button component |
| Compact Profile identity editor | `src/features/shell/AppShell.tsx`, `src/components/HumanAvatarProfilePicker.tsx` |
| Source detection, conversion, crop, and descriptor validation | `src/domain/avatarProcessing.ts`, `src/services/avatarUploadService.ts`, `src/services/avatarUploadClient.ts` |
| Unified Play presentation/configuration | focused Play components extracted from `src/features/shell/AppShell.tsx` |
| Sit & Go 3/6/9 contract | `src/domain/poker/tournament.ts` |
| Championship v2 course and unlocks | `src/domain/poker/championship.ts` |
| Championship reset boundary | `src/services/championshipProgress.ts` |
| Hidden-event turn clock | pure clock/controller module consumed by `MultiwayPokerTableScreen` |
| Championship map/record branding | `src/features/shell/ChampionshipModal.tsx`, `ChampionshipRecordModal.tsx` |
| Measured table geometry and seat collision checks | `src/features/table/multiwayTableLayout.ts`, `src/features/multiplayer/multiplayerUx.ts` |
| Private lobby/live table composition | `src/features/multiplayer/MultiplayerFlowModal.tsx` |
| Home reference shortcuts | `src/features/shell/AppShell.tsx`, existing Home `MenuRow` presentation |
| Shared tap-to-open player profiles | `src/components/AiPlayerProfile.tsx`, a shared `PlayerProfileSheet`, `src/features/learn/AiRosterModal.tsx`, `src/features/table/MultiwayPokerTableScreen.tsx`, `src/features/multiplayer/MultiplayerFlowModal.tsx` |
| Shared human Play record presentation | `src/features/profile/PlayStatisticsCard.tsx`, `playStatisticsPresentation.ts`, a bounded `PublicPlayerRecordSnapshot` projection |
| Room-private Play record transport | multiplayer contracts/coordinator, client parser, and `supabase/functions/multiplayer-room` using the existing room-authorized public snapshot |
| Canonical action presentation chronology | `src/features/multiplayer/multiplayerActionQueue.ts`, `src/features/table/tableActivity.ts` |
| Shared orientation toggle | `src/features/table/TableOrientationControl.tsx`, `useTableOrientation.ts` |
| Text reaction menu and protocol-compatible visible subset | `src/features/multiplayer/TableMomentTrayView.tsx`, `src/domain/multiplayer/tableMoments.ts` |
| Concise private-table results | `src/features/multiplayer/multiplayerGamePresentation.ts`, `MultiplayerFlowModal.tsx` |
| Rebuy eligibility, deadline, idempotency, and chip mutation | `src/domain/multiplayer/contracts.ts`, `coordinator.ts`, client contract parser, `supabase/functions/multiplayer-room` |
| Human disconnect/retry, sitting out, permanent leave, and host transfer | multiplayer contracts/coordinator, Realtime client recovery, `MultiplayerFlowModal.tsx`, `supabase/functions/multiplayer-room` |
| Authoritative participant buy-in/net ledger | multiplayer coordinator/public projection/archive plus `src/domain/multiplayer/sessionSummary.ts` |
| Live Table stats presentation | a focused `MultiplayerTableStatsModal`, `MultiplayerSessionSummaryModal.tsx`, `MultiplayerFlowModal.tsx` |

The human-profile, seat-lifecycle, and rebuy-ledger decisions require one consolidated versioned multiplayer client/Edge Function contract change. A seat owner publishes its bounded Play record; only that authenticated owner may recover its disconnected seat; the coordinator alone applies folds, participation transitions, rebuys, and participant-ledger mutations; current room members receive only the authorized public projection. This does not require a globally readable profile/ledger table, public discovery endpoint, broader avatar policy, or cross-room record access. Prefer extending the existing canonical room JSON/public projection over creating a new exposed table; if implementation proves a schema change is necessary, it must ship migration-first with explicit owner-write, coordinator-only mutation, and current-room-member-read authorization tests. Existing private owner-scoped avatar upload and room-authorized fetch behavior must continue to pass its security corpus.

## Commit checkpoints

Every checkpoint includes its English, Simplified Chinese, and Traditional Chinese messages, interpolation/perspective tests, and locale-specific layout coverage. A checkpoint with placeholder English, missing accessibility copy, or deferred translations is not complete.

### 3.11A — Theme and identity-shell correction

- Fix confirmed dark-mode failures.
- Add semantic contrast/token tests and the no-default-foreground guard.
- Normalize authored-avatar framing and shared avatar-button geometry.
- Merge the Profile avatar entry into the identity header and remove the standalone Avatar card.

**Commit point:** dark/light identity surfaces are readable and compact before changing native media handling.

### 3.11B — Common-photo intake and adjustable preview

- Accept HEIC/HEIF, aliases, and missing picker MIME safely.
- Add camera/library selection, source bounds, canonical encoding, crop/zoom, two-size preview, confirmation, and cancellation cleanup.
- Preserve atomic avatar replacement and existing private Storage authorization.

**Commit point:** real iPhone camera/library photos can be adjusted, confirmed, saved, rendered locally, and shown in an authorized private room.

### 3.11C — Play hub simplification

- Put Play together first.
- Add the branded Championship entry.
- Replace the separate Quick Play and Sit & Go presentation with one compact AI configurator.
- Keep format-specific domain behavior and Home's one-tap Quick Play route.
- Add the compact Home **Meet the players** reference shortcut directly below **Poker cheat sheets**, converging on the existing Learn roster.

**Commit point:** every current Play destination remains reachable with less vertical duplication, and Home offers a compact direct route to both poker references without duplicating their content.

### 3.11D — Nine-seat tournaments and Championship v2

- Extend Sit & Go engine/checkpoints to nine seats.
- Replace the five-event Championship with the ten-event grouped tour.
- Reset version 1 Championship state once.
- Add nine-seat Final, River Below, and The Undertow.
- Add 45/30-second hidden-event clocks and all-Nemesis performance bounds.

**Commit point:** a fresh user can complete the full expanded unlock chain and a version 1 user starts from an empty valid v2 Championship.

### 3.11E — Responsive setup and table clarity

- Replace raw-viewport/fixed-height table decisions with the measured pane resolver across setup, lobby, live, result, and replay surfaces.
- Remove lobby center-copy collisions and render the correct human/AI avatar in every occupied seat.
- Add explicit, non-color-only AI identification without weakening role, action, or winner states.
- Restore the occupied-seat profile interaction with full AI character details and the same room-private human Play record shown on Profile.
- Extend the multiplayer snapshot/client capability contract so only a seat owner can publish its bounded Play record and only current room members receive it.
- Replace both in-place Meet the players expansion patterns with the same stable AI profile popup and predictable outside-tap dismissal.
- Prove canonical poker order through engine, rotated seat map, transition queue, and activity feed.
- Replace the two-tab orientation control with one destination-labelled toggle.
- Recompose landscape into a measured felt plus readable feed/action rail, and remove the Bet/Raise icon.
- Replace the twelve-icon reaction tray with the eight-phrase menu while keeping mixed-version protocol compatibility and Slice 3.10 queue behavior.
- Collapse ordinary results and terminal feed events to one winner, one amount, and one reason.

**Commit point:** every 2/3/6/9-seat setup and table is collision-free in both orientations, chronology is provably correct, AI identity is explicit, and an occupied human seat shows the same truthful room-private Play record as Profile without exposing source history or account metadata.

### 3.11F — Human seat lifecycle, unlimited rebuys, and live chip ledger

- Add the authenticated, idempotent, between-hands human `rebuy` flow at the fixed server-owned 4,000-chip amount with no count cap.
- Add pending Rebuy/Sit out decisions, configured-duration deadlines, last-live-player continuation, and host ending of a stalled session.
- Remove human-to-AI takeover and reclaim. Add authenticated retry for transient disconnects, deadline-bound disconnected folds, between-hand sitting out/return, confirmed permanent leave, retired seats, and deterministic host transfer without transferring seat control.
- Add the canonical participant buy-in/settled-stack/net ledger with conservation invariants, reconnect/archive support, and corrected final deltas.
- Add the top Stats action and responsive all-player won/lost sheet without blocking a human turn.
- Extend join capability negotiation, canonical/public/archive protocols, the Edge Function, client parser, and all three locales atomically.

**Commit point:** a busted real player can re-enter repeatedly without double-minting chips, a disconnected human can safely recover only their own unchanged seat without any AI decisions on their behalf, an intentional departure cannot return to the running session, and every current room member sees the same settled, zero-sum won/lost list throughout and after the session.

### 3.11G — Integrated release gate

- Complete automated, simulator, physical-device, localization, accessibility, and performance verification below.
- Review the integrated diff adversarially and resolve all P1/P2 findings before distribution.

**Commit point:** release evidence and screenshots correspond to the exact tested commit and build.

## Automated acceptance

### Theme and layout

- Every approved semantic foreground/background pair satisfies its contrast threshold in light and dark palettes.
- The Home recommended-session action, Profile identity, Play hub, Championship card/map, every action button, modal, result, and table state has an explicit themed foreground.
- Shared avatar-button geometry centers every authored and uploaded avatar at Home/Profile/Play/table sizes without per-screen transforms.

### Avatar media

- Unit tests cover JPEG/JPG, PNG, HEIC, HEIF, WebP, AVIF, missing MIME with detectable bytes, mismatched MIME/magic bytes, corrupt input, Live Photo still selection, oversized source, oversized decoded dimensions, and oversized processed output.
- Orientation, pan/zoom crop geometry, square output, canonical MIME, file size, metadata stripping, cancellation, replacement rollback, offline save, upload failure, cleanup queuing, and account deletion remain deterministic.
- The previous avatar stays active until confirmation and successful local registration.

### Play hub

- Home renders **Poker cheat sheets** followed immediately by **Meet the players** before **Quick start** in every locale and supported text scale. Both routes meet touch-target and dark/light contrast requirements without duplicating roster/reference state.
- Opening the roster from Home and Learn produces the same players, ordering, localization, and return behavior. Closing it returns to the route that opened it without losing Home or Learn scroll/navigation state.
- Every valid Practice combination routes to the correct heads-up or multiway engine.
- Every valid Tournament combination routes to a resumable 3/6/9-seat Sit & Go.
- Changing format, seats, difficulty, stack, or Advanced options never mutates an active table or stale checkpoint.
- Home Quick Play launches one valid bounded Practice configuration.

### Setup and table experience

- The layout resolver consumes measured pane dimensions and returns deterministic setup/lobby/live/result geometry for 2/3/6/9 seats, portrait/landscape, phones/tablets, safe areas, activity-rail states, and supported text scales.
- Pixel-rectangle tests reject every seat/seat, seat/board, seat/control, board/control, popover/action, and edge collision at the minimum supported viewport and representative modern iPhone, Android, and iPad dimensions.
- Lobby tests prove no status copy sits beneath a seat and every occupied AI/human seat renders the correct avatar path and fallback.
- AI identification tests cover authored AI and human seats with default avatar, uploaded photo, privacy-hidden photo, folded, current-turn, all-in, disconnected, sitting-out, rebuy-pending, left, and winner combinations without relying only on color. No human fixture renders AI control or an authored AI identity.
- Interaction tests tap the full occupied plaque for the viewer, another human, and an AI across every table family; open seats retain add-player behavior, and a sheet round-trip preserves the exact table, focus origin, action state, and history.
- AI profile tests render the authored avatar, name, optional title, localized personality label, and description, while proving that strategy weights, ranges, decision traces, and adaptation state are absent from presentation data and accessibility output.
- Meet the players tests select every featured tile and regular row without changing roster geometry or scroll position. The popup closes by outside tap, close target, Back/Escape, and accessibility dismissal; tapping its descriptive content keeps it open, and dismissal returns focus to the originating entry.
- Human profile tests feed the same `PlayStatistics` value to Profile and the published room snapshot and require identical Hands, Tables, Wins, Win rate, populated source rows, empty/unavailable state, and scope/coverage meaning. Fixtures cover complete, capped, partial, unavailable, skipped, mixed, and mixed-capped reads without a misleading zero or lost **most recent** qualifier; owner and observer localization variants preserve those semantics without calling another player's record **your** record.
- Record-contract tests reject unknown versions, negative/fractional/overflow totals, totals inconsistent with source rows, invalid coverage states, oversized payloads, stale revisions, a user writing another seat's record, a non-member read, and cross-room access. Reconnect and duplicate delivery converge on the newest valid snapshot.
- Privacy tests prove the human sheet and public room projection contain no account id, email, authentication metadata, stable source hand/table ids, raw hand history, hidden hole cards, or reusable unauthorized avatar URL. Room authorization and hidden-photo fallback behave exactly as they do on the seat plaque.
- Turn-safety tests prove the clock never pauses, an open profile dismisses when the viewer becomes the actor, the normal turn announcement fires once, and profile opening is unavailable while the viewer must act without shrinking the plaque's semantic identity target.
- Exact action-order tests prove the clockwise ring **Dealer → Small Blind → Big Blind → remaining seats → Dealer** for heads-up and 3/6/9-seat tables, then cover the correct preflop/post-flop starting point, skipped folded/all-in seats, raise reopening, elimination, button movement, reconnect, transition batching, snapshot convergence, and rotated viewer seats without ever reversing that ring.
- The Aya-button/Bruce-small-blind/Zane-big-blind turn fixture presents Bruce before Zane and then every remaining eligible seat clockwise to Aya, consistently in the seat map, bubble queue, persistent plaque action, and activity feed. Its preflop counterpart starts after Zane and follows the same ring back through Aya, Bruce, and Zane.
- Every action bubble history index is greater than the previously presented index. Feed rows are unique, durable rows are complete, and retries/rotation/reconnect cannot reorder them.
- The single orientation toggle preserves hand state, current actor, deadline, sizing state, reaction queue, and feed history across success, failure, unsupported devices, and rapid repeated taps.
- Landscape tests calculate plaque density from the post-rail felt width and reject clipped seats, names, stacks, cards, board, pot, and action targets.
- Reaction tests expose exactly eight visible localized phrases, keep all twelve protocol ids parseable/renderable, preserve repeated-tap order, close on launcher/outside press, and provide no eye or close target inside the menu.
- Result tests enforce one visible occurrence of the sole winner amount for fold and showdown outcomes, while split-pot and side-pot fixtures retain complete non-duplicated accounting.

### Championship

- The main event order is exactly 3/6/9, 6/9, 6/9, 6/9, then a nine-seat Final.
- Each event has exactly `playerCount - 1` opponent tiers and a valid qualification boundary.
- RiverMind Final unlocks The River Below and nothing later.
- Winning The River Below unlocks The Undertow; no other result or direct ID access does.
- The River Below contains four Elite and four Nemesis opponents. The Undertow contains eight Nemesis opponents.
- Nine-seat checkpoints validate seats 0–8 and resume without losing chips, eliminated players, button order, blinds, structure, or difficulty.
- Timeout checks when legal and folds otherwise; it cannot call, wager, submit twice, or allow stale timer completion to affect a later turn/hand/table.
- Rotation, sizing, app-owned sheets, background/foreground, result, replay, retry, and exit invalidate or preserve clocks exactly as specified.
- A version 1 Championship state becomes one empty persisted version 2 state while unrelated app data remains unchanged.
- Seeded simulation reports completion, qualification, runtime, and hero-finish distribution for all 12 events without crashes or impossible lineups.

### Human seat lifecycle, Rebuy, and Table stats

- Coordinator tests initialize 2/3/6/9-seat ledgers correctly at 800/2,000/4,000 starting stacks and prove that human/AI/disconnected/sitting-out/left rows remain stable through hands, host transfer, reconnect, and archive projection.
- State-machine tests prove `kind` cannot change during a session and that only `kind = ai` may invoke AI strategy. Every disconnect, missed-turn, app-kill, leave, timeout, retry, return, rebuy, host-transfer, and snapshot-convergence path rejects a human `control = ai` state.
- Disconnect-before-turn, disconnect-during-turn, and disconnect-after-action fixtures keep the original deadline. Retry by the same authenticated owner before an accepted timeout restores the same legal decision; expiry records one fold and no check/call/bet/raise; an already-all-in disconnected hand settles without a fabricated action.
- Post-hand tests exclude disconnected and sitting-out humans from later deals, allow a valid reconnect/Return next hand only at a safe boundary, and prove reconnect cannot insert the seat into an active hand or reset its stack, deadline, rebuy decision, ledger, or history.
- Authorization tests accept Retry connection only for the user already bound to that seat and reject host override, another member, anonymous/fresh identity, client-supplied user/seat ids, left players, expired rooms, and completed sessions without leaking canonical identifiers.
- Leave tests cover between-hands, not-current-actor, current-actor, and already-all-in timing. The accepted command folds/settles exactly once as specified, retires the seat for the running session, keeps its settled ledger row, removes room access, rejects every rejoin/retry path, and never opens that seat to replacement human or AI.
- Host lifecycle tests transfer table-management authority deterministically when the host disconnects or leaves without transferring the person's seat, cards, stack, identity, or actions. Reconnecting to the preserved seat does not silently retake host authority.
- A valid zero-stack human rebuy adds exactly 4,000 to settled stack and total buy-in, increments the count once, leaves net chips unchanged at acceptance, preserves identity/seat, and makes the player eligible for the next deal.
- Parameterized invalid-command tests reject positive-stack top-ups, AI rebuys, another user's seat, client-supplied amount/stack/net values, playing/result/complete states, expired session versions, hand-limit completion, disconnected or permanently left seats, and malformed or overflow ledger values.
- Idempotency and race tests cover duplicate command ids, lost responses, simultaneous rebuys, rebuy versus deal-now/tick, rebuy versus deadline expiry/Sit out, disconnect versus action, retry versus timeout fold, retry versus permanent leave, Return next hand versus deal, host transfer, and Edge Function retry. No accepted logical command acts or mints chips more than once.
- Rebuy-decision tests use each configured 30/45/60-second duration, pause ordinary auto-deal while a connected decision is pending, resolve expiry/disconnection as Sit out, and allow a later between-hands rebuy without limiting its count.
- Last-live-stack tests wait when a busted, disconnected, or sitting-out human can return, resume only after at least two active positive stacks, accept the host-only `end-stalled-session`, and retain ordinary `last-player-standing` only when no human can return. Hand-limit completion always wins over rebuy/reconnect/return eligibility.
- Repeated-rebuy property/simulation tests run long open sessions with many bust/rebuy cycles and assert after every settlement that `net = settled stack − total buy-in`, total net is zero, total stacks equal total introduced chips, and every value remains a safe integer.
- Active-hand tests freeze Table stats at the prior settlement while blinds/bets/calls/raises/all-ins sit in the pot, then update once after fold, showdown, split pot, and multi-side-pot settlement.
- Table stats projection tests include all participants, sort net descending with canonical-seat tie breaks, and render **Won**, **Lost**, or **Even** from net—not stack—plus accurate total buy-in and rebuy count. Final Session standings use the identical ledger delta.
- Header/layout tests reserve a 44-point Stats action without clipping title, timer, orientation, pot, feed, felt, or actions on the minimum portrait/landscape viewports and at supported Dynamic Type sizes.
- Turn-safety tests prove Stats never pauses either deadline, auto-dismisses exactly once when the viewer becomes actor, restores focus when normally closed, and survives rotation/reconnect/result transitions without stale rows.
- Protocol/security tests reject pre-ledger or human-takeover clients before seating, unknown snapshot/archive versions, user-id/seat/reconnect spoofing, non-member/cross-room reads, canonical-private fields in the public ledger, and old one-buy-in delta calculation after any rebuy. Old room state cannot be upgraded by silently converting a human to AI.

### Localization

- Typed message-key coverage is identical in English, Simplified Chinese, and Traditional Chinese, with no missing/fallback key reachable from any Slice 3.11 screen or state.
- Placeholder-set tests require identical named interpolations across locales for players, chips, big blinds, percentages, hands, tables, wins, scopes, timers, and event progress.
- Owner/observer Play record tests preserve the same statistics and coverage qualification while using grammatically correct perspective in all three locales.
- Reaction tests resolve the approved eight visible phrases and all twelve received protocol ids in all three locales. Hidden ids remain renderable when received from an older client.
- Championship localization tests cover every stage, all ten main events, both hidden events, qualifications, achievements, lock/invitation states, timeouts, and reset state without leaking The Undertow before unlock.
- Human-lifecycle/Rebuy/Table stats localization tests cover Leave confirmation and permanent consequence; disconnected, folded while disconnected, retry, retrying, reconnected, sitting out, Return next hand, left, authentication mismatch, room ended/expired, update required, eligibility, Rebuy, waiting, deadline, host-ended, updated-through-hand, total buy-in, rebuy count, Won/Lost/Even, signed chip values, singular/plural, and accessibility row summaries in all three locales.
- Chinese quality tests cover punctuation, spacing, poker terminology, player-count/BB composition, **most recent completed hands** qualification, and Simplified/Traditional character correctness for all newly added messages.
- A source scan rejects newly introduced user-visible literals in the changed components and presentation helpers, with narrowly documented exceptions for stable internal ids and brand tokens.

### Standard gates

- `pnpm typecheck`
- focused unit/component tests
- full unit/localization suite
- `pnpm verify:multiplayer-edge`
- `pnpm verify:release-config`
- `pnpm verify:mobile-secrets`
- `git diff --check`
- iOS and Android production exports
- existing avatar Storage/RLS and private-room authorization corpus
- multiplayer-room Edge Function contract/state/security corpus, plus migration/advisor verification if implementation introduces schema changes

## Manual and visual acceptance

- On a small iPhone, large iPhone, iPad, and supported Android size, inspect Home, Learn, Play, Profile, setup, Championship, every table family, results, and replay in both light and dark mode.
- Repeat the dark-mode pass in English, Simplified Chinese, and Traditional Chinese, including largest supported Dynamic Type and VoiceOver/TalkBack.
- Confirm the header avatar is optically centered and consistently scaled in its rounded-square button; confirm authored and uploaded avatars match in apparent size.
- Select a real iPhone HEIC library photo, a newly captured camera photo, a portrait JPEG, a landscape PNG, and an image with rotated EXIF. Pan, zoom, adjust again, cancel, and confirm each path.
- Compare the final round Profile preview with the smallest live-table seat. No face-critical content may be unexpectedly clipped.
- Verify Profile contains no standalone Avatar card or storage/sharing paragraph and that name/avatar editing remains discoverable from the identity header.
- Verify Play together is first, Championship is visibly branded, and the AI configurator's default view remains compact.
- On Home, confirm **Meet the players** sits directly below **Poker cheat sheets** as a matching compact shortcut and both remain above **Quick start** without crowding the first screen. Open the roster from Home and Learn and confirm they are the same destination.
- In Meet the players, tap several featured and regular players while scrolled near the top, middle, and bottom. The selected profile must appear in a readable popup without moving the grid/list; outside tap, close, and Back dismiss it and return focus/scroll position, while tapping inside the profile leaves it open.
- Create and review 2/3/6/9-seat Practice, Tournament, Championship, and private-table setups. Confirm their previews use the available pane, never cover a seat with status copy, and do not leave a tiny fixed felt inside a large usable region.
- In a private nine-seat lobby, verify every authored AI avatar appears, every real player uses the correct default/authored/uploaded avatar, and the explicit AI identifier remains readable without confusing it with host, ready, or open-seat state.
- Tap the viewer, another active human, disconnected/sitting-out human seats, a departed human ledger row, and an authored AI in every applicable table family and in both orientations. Confirm the full plaque is easy to tap, the correct immutable Human/AI identity opens, outside/close dismissal restores focus, and no active hand or navigation state changes. No human ever appears as AI-controlled.
- Confirm each AI sheet shows its large avatar, name, fun title when authored, personality label, and readable description. On two devices, compare one human's own Profile Play record with the sheet opened by the other player; every visible total, source row, empty/unavailable state, and coverage note must match.
- Repeat the human-profile pass with complete, capped, partial, mixed-capped, and unavailable statistics plus the default avatar, an authored avatar, an uploaded photo, a privacy-hidden photo, reconnect, foreground refresh, and room exit. The record may be visible to current room members but never through another room or after authorization ends; raw history and reusable avatar addresses must not appear.
- Leave another player's sheet open immediately before the viewer's turn. Confirm it dismisses automatically, the timer continues, **Your turn** is announced once, and legal actions are unobstructed. During the viewer's turn, confirm the profile action provides the **Act first** accessibility hint.
- Play the named Aya/Bruce/Zane fixture and additional preflop/post-flop hands while tracing the visible **Dealer → Small Blind → Big Blind → remaining seats → Dealer** ring. Confirm post-flop starts after the dealer, preflop starts after the big blind, and the seat map, bubbles, persistent plaque actions, and feed all traverse the same clockwise direction.
- Toggle orientation repeatedly during an AI action, human turn, sizing draft, reaction queue, reconnect, and result. Confirm the one-button control preserves state and announces its destination.
- On the smallest supported landscape phone, verify the felt and side rail are both completely visible; all nine players, board, pot, and text-only Fold/Check-or-Call/Bet-or-Raise actions remain legible and tappable, with no Raise icon.
- Open the reaction menu in portrait and landscape, send repeated phrases without reopening it, dismiss it from the launcher and outside area, and confirm it never blocks legal actions. Confirm mute remains available in Profile Preferences.
- Finish an uncontested hand, a sole-winner showdown, a split pot, and a multi-side-pot hand. The common result must show winner, amount, and reason once; complex settlement must remain complete without duplicate feed rows.
- On two physical devices, create private tables with 800, 2,000, and 4,000 opening stacks and confirm every lobby discloses the fixed 4,000-chip rebuy. Bust one human, verify the Rebuy/Sit out decision blocks auto-deal until resolved or expired, then rebuy and receive exactly 4,000 in the next hand.
- Bust and rebuy the same human at least three times in one open session. Compare both devices after every acceptance and settlement: rebuy count, total buy-in, settled stack, and won/lost result must converge, while transport retry, rapid double tap, background/foreground, and reconnect never add an extra 4,000.
- Exercise 30/45/60-second rebuy deadlines, explicit Sit out, timeout, disconnect, authenticated Retry connection, Return next hand, later rebuy, the fewer-than-two-live-stacks waiting state, host ending that stalled session, finite hand-limit completion, and rematch ledger reset.
- On two devices, disconnect before the player's turn, during their turn, and after they act. Retry before the unchanged deadline and verify control returns to the same human; repeat without retry and verify exactly one fold, then no cards in later hands. Confirm the table never checks, calls, bets, raises, or shows an AI-control label for the disconnected human, while an already-all-in player remains eligible for settlement.
- Kill and relaunch the disconnected player's app, retry as the same signed-in user, and verify seat, stack, deadline, hand history, rebuy state, and Table stats converge. Attempt recovery as the host and as a different account; both must be denied without exposing private identifiers.
- Confirm **Leave table** displays the localized permanent-exit warning. Test leaving while acting, while waiting, while all-in, and between hands: the server folds or safely settles once, the ledger row remains labelled **Left**, no later hand deals that seat, neither AI nor another person can fill it, and the former player cannot rejoin the running session by code or Retry connection. Confirm a rematch/new session can seat that person normally.
- Disconnect and leave as host. Verify management authority transfers to an eligible connected human without transferring the original host's poker seat or decisions; reconnecting recovers only the preserved seat and does not silently restore host authority.
- Open Table stats from the top action in portrait and landscape with 2/3/6/9 participants, including AI, a busted player, a sitting-out player, and a departed/offline human. Confirm the sheet sorts largest winner to largest loser and each row's Won/Lost/Even, stack, buy-in, and rebuy count agrees on both devices.
- Keep Table stats open while another player acts and while chips enter the pot. It must remain labelled through the prior settled hand and must not show temporary betting losses; after settlement it updates once. When the viewer becomes actor it dismisses without pausing the timer or covering actions.
- Finish a session after multiple rebuys and compare live Table stats, final Session standings, archived summary, and the underlying settled stacks. Placement and stack may differ from profitability, but every surface must use total buy-ins for won/lost and the all-player net must sum to zero.
- Start Practice at 2/3/6/9 and Tournament at 3/6/9 across representative difficulties and stack presets. Complete, exit, resume, and finish at least one nine-seat tournament.
- Fresh-start the Championship and walk every unlock boundary. Confirm locked future stages and The Undertow do not leak through labels, accessibility text, record summaries, or deep links.
- In The River Below, verify the 45-second clock through Check, Fold, Call, sizing, rotation, backgrounding, and timeout. Repeat at 30 seconds with eight Nemesis opponents in The Undertow.
- Measure frame pacing, action latency, temperature, and battery pressure during a sustained nine-seat all-Nemesis run on the minimum supported physical phone.

## Explicitly deferred

- Globally discoverable profiles or avatar discovery outside the current authorized room
- Changing the current private avatar Storage/RLS/room-authorization model
- Cross-device Championship progress or recovery
- Migration or grandfathering of version 1 Championship progress
- More hidden events after The Undertow
- Public Championship rankings, prizes, anti-tamper, or server-authoritative clocks
- A two-player Sit & Go; the approved Tournament contract is 3/6/9
- Additional poker variants or tables larger than nine seats

## Product review resolution

There are no remaining open product decisions in this draft:

- Practice supports 2/3/6/9; ordinary Sit & Go and Championship support 3/6/9.
- The approved Practice and Sit & Go stack presets/defaults are fixed in 3.11C.
- The approved visible reaction set is the eight phrases fixed above; all twelve protocol ids remain compatible.
- **The Undertow** is the final event name.
- Only Championship progression and active Championship checkpoints reset.
- An in-game human profile shows the same Play record fields and values as that person's Profile, shared only inside the authorized current room.
- A zero-stack human at a private multiplayer table may rebuy exactly 4,000 play chips between hands any number of times; AI seats and positive-stack top-ups are not eligible.
- A human seat is never replaced or played by AI. A transient disconnect preserves it for retry by the same authenticated owner, without extending the existing deadline; after a missed deadline the human is folded and sits out until a safe return.
- Confirmed Leave is permanent for the current running session. The retired seat is never refilled, the departed ledger row remains in results, and only a new/rematch session may seat that person again.
- The live top-level Table stats sheet shows every participant's settled won/lost chips against total original plus rebuy chips, and final standings reuse that same ledger.

## Slice exit

Slice 3.11 is complete when the dark theme has no default-foreground regressions, Profile identity editing is compact and accepts adjustable iPhone photos, Home offers compact Cheat sheets and Meet the players routes, the roster opens stable dismissible player popups, Play uses the approved simplified hierarchy, setup and live tables use measured collision-free layouts with trustworthy chronology in both orientations, every occupied seat opens the correct room-private human Play record or character-rich AI profile, AI identity is explicit, reactions and results are concise and understandable, a busted private-table human can rebuy 4,000 repeatedly without double-minting chips, a human disconnect can only fold/sit out or recover through the original authenticated owner and never becomes AI play, an intentional exit is permanent for that running session, live and final Table stats report every participant's settled zero-sum result against all buy-ins, the ten-event Championship plus two-event hidden chain works from a deliberate fresh start, nine-seat tournaments save/resume correctly, hidden clocks are deterministic and accessible, every changed visible/accessibility string is complete and visually verified in English, Simplified Chinese, and Traditional Chinese, and the exact release candidate passes the automated and physical-device gates above.
