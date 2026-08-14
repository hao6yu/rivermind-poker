# Phase 12 — Multiplayer Trust & Learning Loop

## Outcome

Make private tables feel complete, dependable, and recognizably RiverMind.
A friend should be able to open an invite, join the correct room, survive a
temporary connection loss, understand the session result, review only the
cards they were entitled to see, and start a rematch without rebuilding the
table.

Phase 12 also closes two shared table-quality gaps exposed during multiplayer
testing: strategically valid early folds should not make a game feel broken or
instant, and every completed Quick Play, Daily Challenge, practice, and private
session must offer an obvious next action.

## Product principles

- Poker correctness comes before artificial action. AI players may fold weak
  hands; RiverMind will not rig cards or force knowingly bad calls to prolong a
  hand.
- A short hand still receives readable action/result presentation and an
  immediate path to the next hand or a fresh run.
- Realtime is transport, not authority. The Edge Function and canonical room
  version remain the source of truth.
- Reconnect and replay are silent catch-up paths: they never replay old action
  bubbles or haptics.
- Multiplayer review is viewer-relative. Folded cards that were not shown at
  showdown never leave the server.
- Games display chips. Big-blind units remain limited to training and coaching.

## Included

### 1. Invitations and joining

- A host invite sheet containing a scannable QR code, six-digit room code,
  Copy, and native Share actions.
- A stable RiverMind custom-scheme link whose join route contains only the
  short-lived room code.
- Incoming links open Play with the Join flow selected and the code prefilled.
- Manual code entry remains the fallback for every invite.
- Invalid, expired, full, already-started, and unavailable rooms have distinct
  localized recovery copy.

### 2. Active-room recovery

- Persist only the room identifier and non-secret display metadata needed to
  offer same-device recovery.
- Surface one clear **Resume private table** action from Play.
- Synchronize the viewer projection before rendering lobby or game controls.
- Clear stale recovery records after leave, expiry, forbidden membership, or a
  confirmed unavailable room.
- Background, foreground, and Realtime recovery keep controls locked until the
  authoritative snapshot is current.

### 3. Session finish and rematch

- A complete-session sheet with final standings, final chip stacks, net chip
  change, hands played, and a clear session winner.
- The host can return the same room, code, seats, and AI configuration to a new
  ready-up lobby. Human players explicitly ready again before the rematch.
- Guests see the host/rematch state without duplicate commands or stale result
  controls.
- Open sessions retain the current winner-by-elimination rule.

### 4. Viewer-safe history and learning

- Archive a separately redacted completed-hand view for each human member in
  the private schema. Never retain the full completed deck or one reusable
  all-players archive.
- Load history only through the authenticated multiplayer Edge Function after
  membership is verified.
- Return the viewer's cards and cards legitimately shown at showdown; redact
  the deck, other hidden cards, user IDs, and AI-private reasoning.
- Provide a session hand list and action replay from the result/session flow.
- Grade only the viewer's own recorded decisions. A useful review spot can
  route to the existing targeted-practice flow without exposing opponents'
  cards.

### 5. AI and continuation quality

- Measure heads-up and multiway first-action folds, walks, flops seen, and hand
  duration across difficulties before changing strategy.
- Make Quick Play one two-hand heads-up orbit, with one button per player, so a
  strategically correct opening AI fold cannot end the whole experience before
  the player receives a decision.
- Correct genuine heads-up or short-handed range defects while preserving
  authored folds and identity differences.
- Give early terminal actions the same readable pacing and result clarity as a
  long hand.
- Put **Next hand**, **Play again**, or **Replay today's challenge** directly in
  every terminal action area where the user currently has to discover it in a
  secondary sheet.
- Keep summaries and detailed review available as secondary actions.

### 6. Reliability and privacy-safe diagnostics

- Exercise duplicate taps, stale versions, simultaneous commands, missed
  Broadcasts, background/foreground, timeout, AI takeover/reclaim, host
  transfer, rematch, and app-relaunch recovery.
- Record bounded operational diagnostics such as stable error code, room
  lifecycle state, command kind, version gap, and reconnect duration.
- Never record room codes, display names, cards, deck state, action rationales,
  or authentication material.
- Add expired-room cleanup and verify create/join abuse limits before a wider
  beta.

## Deferred

- Visible accounts and cross-device recovery
- Public matchmaking or discoverable rooms
- Chat, friend lists, notifications, leagues, rankings, and public profiles
- Spectators or joining after play starts
- Nine-player tables and additional poker variants
- Gameplay audio, chip purchases, prizes, or real-money wagering

## Delivery slices

1. **Invite and resume foundation** — deep links, QR/share sheet, local active
   room record, and sync-first resume UI.
2. **Session loop** — final standings, authoritative rematch, private archives,
   replay, and viewer-only decision review.
3. **Shared table polish** — measured AI range/pacing fixes and direct
   next/play-again actions across Quick Play, Daily, practice, and private play.
4. **Trust gate** — database/RLS/adversarial checks, fault injection,
   two-device play, accessibility, localization, and simulator/device QA.

## Acceptance criteria

- Scanning an invite on a device with RiverMind installed opens Join with the
  correct six-digit code already filled.
- Two devices can complete a ten-hand session with matching board, pots,
  stacks, action order, payouts, and final standings.
- A backgrounded or relaunched member resumes the same authoritative room on
  the same anonymous device without seeing enabled stale controls.
- Network loss, duplicate taps, timeout, AI takeover, host transfer, and
  rematch cannot produce an out-of-turn action or divergent room state.
- The host can start a rematch in the same room; every human must ready again.
- Every archived hand is replayable by a member and reveals no card that viewer
  was not entitled to see during the original hand.
- Quick Play, Daily Challenge, regular AI games, and private tables always
  present an obvious next/play-again action after completion.
- AI evaluation documents any strategy change and retains fairness, legality,
  difficulty separation, and identity-style regression gates.
- The complete flow is readable on the smallest supported iPhone and on iPad,
  in English, Simplified Chinese, and Traditional Chinese, with Dynamic Type,
  VoiceOver, reduced motion, and haptics disabled or enabled.
