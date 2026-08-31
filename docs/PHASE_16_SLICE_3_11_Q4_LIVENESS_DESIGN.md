# Slice 3.11 Q4 — Server-observed liveness and safe dealing

Status: implemented on `codex/slice-3.11-liveness-closure`; local evidence is in
[the release record](PHASE_16_SLICE_3_11_RELEASE_RECORD.md). Physical-device and
release approval remain separate. This replaces the round-3 design's unsafe
fail-open and implicit client-enrollment assumptions.

## 1. Fixed review findings

- **Manual deals bypassed liveness:** `start`, `deal-now`, `tick`, and
  `rematch` now request verified server contact data. The actual next-hand
  dealer sweeps stale seats, so host-triggered deals cannot use stale
  connection flags. A stale ready-up guest is marked offline/unready and the
  room stays in its lobby until that owner reconnects and readies again.
- **Read failures changed game actions:** liveness is verified before the
  coordinator or persistence commit. An RPC error, rejected request, malformed
  row set, duplicate owner, or missing/lagged caller stamp produces retryable
  HTTP 503 `room_unavailable`. It does not silently disable enforcement,
  advance the hand, mark a timeout processed, or change a decision deadline.
- **Pre-heartbeat builds were still accepted:** live requests explicitly
  require request capability **4**. The persisted/public lifecycle snapshot
  stays at **3**; no accounting or history format migration is needed.
- **Adjacent recovery defects:** reconnect never extends a rebuy decision or
  reverses explicit Sit out. Valid legacy owners lacking a participation
  field can renew through the narrowly updated RPC; Left and unknown
  participation states remain refused.

## 2. Explicit compatibility, not inference from row existence

`MULTIPLAYER_CLIENT_PROTOCOL_VERSION = 4` identifies builds implementing
foreground lobby/game heartbeats. It is distinct from
`MULTIPLAYER_SNAPSHOT_PROTOCOL_VERSION = 3`.

The raw worker gate checks `create`, `join`, `sync`, `resume`, `command`,
`liveness`, and `moment` before any room mutation or contact renewal.
Missing, older (including 3), or future capabilities receive HTTP 426
`multiplayer_update_required`; malformed declarations receive 400.
The production service attaches capability 4 to all its requests.
Account-owned archive reads/deletion remain available without upgrading.

Existing canonical state and ledger balances are preserved through the
existing validated normalizer. This is **not** seamless support for older
clients: their live requests are refused until they update. Do not deploy
over active mixed-build tables expecting continued old-client play. Finish
those tables before the coordinated rollout; no room/progress reset is part
of this fix.

## 3. Server data and authorization

`private.multiplayer_seat_liveness(room_id, user_id, renewed_at_ms)` remains
private and service-role-only. Its foreign keys cascade on room/account
deletion. The worker supplies the verified JWT subject and server timestamp,
never a client-supplied player identity or clock.

`multiplayer_renew_seat_liveness` verifies an unexpired room and the
canonical human owner. A missing participation field supports the legacy
active shape; explicit Left and unknown states are rejected. Upserts keep
the greatest observed timestamp. Existing expiration/three-day pruning is
unchanged.

Dedicated heartbeats renew only that owner's contact record. They do not
change canonical revision, hand history, ledger balances, or emit a room
transition. Opportunistic sync/moment renewals remain auxiliary; **command
renewal must succeed** before any command is applied.

## 4. Verified command preparation

`prepareMultiplayerCommandLiveness` runs before the coordinator:

1. Renew the authenticated caller and require an explicit successful RPC.
2. For every expiry/deal entry point, load all room contact stamps.
3. Validate every returned row and require the caller's preceding renewal
   to be visible. Empty, partial-caller, malformed, and failed reads do not
   become an absent map.
4. Pass the verified map and server time into the pure coordinator.

A genuinely missing **other** owner is stale. An unverified read is an
infrastructure failure, not evidence that a player disappeared. Failed
requests can retry the same command ID/version without manufacturing a
second action. The coordinator's optional map is for transport-free local
simulations, not a production compatibility fallback.

## 5. Timing and participation

The existing failure-detector lease remains **15 seconds**, with foreground
heartbeats every **5 seconds** and a **4-second** heartbeat HTTP timeout.
A contact stamp is stale at age >= 15 seconds. Clocks are server supplied;
renewal does not restart a poker decision.

This is bounded silence detection, not instantaneous proof of connectivity:
a connection lost within the last fresh lease can still be classified online
at expiry. The existing online inactivity rule (Check when legal, otherwise
Fold) is retained; stale/explicitly offline actors are always enforced-folded,
even when Check is free. No AI controls a human seat. Changing every online
timeout to Fold would be a separate product-rule change.

A stale online active/rebuy-pending seat becomes disconnected; an intentional
sitting-out seat retains its choice. Host authority can transfer, but human
ownership and private cards cannot. An all-in player's existing hand settles
normally. New deals omit disconnected, sitting-out, Left, and zero-stack
seats while preserving their ledger entries.

Manual dealing commits observed disconnects even if the room must wait
because fewer than two funded active players remain. Automatic ticks also
converge stale participation before countdown decisions. No hand is dealt
while a connected rebuy decision is pending.

## 6. Client and recovery lifecycle

The shared heartbeat hook belongs to the entire open private room, not only
its live-table component:

- It runs while foregrounded in the lobby, live game, and recoverable paused
  or between-hands states.
- It stops when backgrounded, closed, or complete, and renews immediately
  on foreground. Requests do not overlap.
- A successful beat may send the same owner's `set-connection: online` to
  restore transport; it never submits Return, Rebuy, or poker actions.
- Closing/changing rooms invalidates pending callbacks. An intentionally
  sitting-out owner stays sitting out after transport recovery.
- A busted owner resumes only an existing, unexpired decision window,
  including when the room was paused. Expired/no-window returns remain
  sitting out and can explicitly Rebuy at a safe boundary.
- Existing turn/rebuy deadlines do not get a fresh duration. Folded hands
  and permanent Left seats cannot be resurrected.

The UI uses existing localized update/retry/return/rebuy strings in English,
Simplified Chinese, and Traditional Chinese; no new untranslated message
keys are introduced.

## 7. Rendered host escape

The host-end action is owned by `MultiplayerActionPanel`, outside the
result/between-hands early-return branches. Its eligibility and confirmation
are rendered and tested together with either content branch, including
non-host, offline, playing/completed, pending-animation, and busy states.
These tests are rendered component-composition tests, not device layout or
VoiceOver evidence.

## 8. Migration and rollout

Apply all missing earlier migrations in order, then:

1. `20260902000000_multiplayer_nine_seat_hand_archives.sql`
2. `20260902000100_multiplayer_seat_liveness.sql`
3. `20260902000200_multiplayer_legacy_liveness_renewal.sql`
4. Matching Edge worker
5. Capability-4 client build

The new migration was first created with the CLI. Its generated local-clock
filename preceded the existing future-dated September migrations, so it was
sequenced immediately after its liveness dependency. No prior migration was
rewritten.

Have the client candidate ready and drain active older-build tables before
the worker cutover. A missing migration causes retryable refusal, never an
automatic Check fallback. Client-only deployment against the older worker
will also be refused at its capability gate; therefore test the coordinated
worker/client pair. Nothing in this task authorizes hosted rollout, signing,
or TestFlight submission.

## 9. Required evidence

- Unit tests: all deal gates, stale ready-up, insufficient funded players,
  invalid/failed liveness reads and renewal, explicit request compatibility,
  heartbeat foreground/close/room lifecycle, preserved deadlines and Sit out.
- Real HTTP/DB: 7-9 human archives, omitted-seat settlement/return, public
  enforced folds, silent-client real deadline, stale manual deal/start,
  old-client join/resume refusal without membership/stamp/ledger changes.
- Real RPC read-failure injection scoped to a disposable room: timeout
  request returns 503 with identical canonical state; restoring the exact RPC
  and retrying the same command folds once at the unchanged deadline.
- pgTAP: legacy owner renewal, unknown/Left/AI/non-owner refusal, monotonicity,
  archive capacity/redaction, RLS and account deletion.
- Full unit/type/config/secrets/Edge smoke and iOS/Android JS export gates.
- Still required before release: physical two-device network/airplane-mode
  and near-deadline tests, portrait/landscape/text-scale host result layout,
  accessibility, real iPhone photo intake, all-Nemesis nine-seat performance,
  signed native builds and coordinated hosted rollout.
