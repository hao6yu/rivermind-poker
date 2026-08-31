# Slice 3.11 Q4 — Server-Authoritative Seat Liveness Design

Status: approved design (pre-implementation), Qwen follow-up round 3, Checkpoint C.
Branch: `codex/slice-3.11-qwen-followup`. Goal: `docs/PHASE_16_SLICE_3_11_QWEN_FIX_GOAL.md` Q4.

## 1. The defect being fixed

The coordinator has no ground truth about whether a client is alive. A seat's
`connection` is app state the CLIENT declares through `set-connection`
commands, and the production flow never sends `offline` on real transport
loss (only `online` on resume/retry — `MultiplayerFlowModal.tsx` never emits
an offline signal at all). Consequence at the deadline today:

- `tick` expiry classifies the actor by `seat.connection === 'offline'`.
  A killed/backgrounded client whose transport just died is still
  `'online'`, so an expired turn resolves with the ONLINE courtesy rule:
  `check` whenever checking is legal.
- A real disconnection therefore gets treated like an attentive player who
  chose to check. An offline human who would have folded, called, or acted
  is silently short-changed, and the seat stays `'online'` forever (nothing
  ever marks it disconnected except an explicit client command).

Q4 replaces the client-declared flag as the liveness authority with
server-observed contact: every accepted authenticated touch to the room
function refreshes a liveness row, and deadline enforcement reads ONLY that
row. The client can still declare `set-connection` for its lifecycle UI, but
liveness decisions can no longer be spoofed or forgotten by clients.

## 2. Source of truth

`private.multiplayer_seat_liveness (room_id, user_id, renewed_at_ms)`

- `room_id` → `public.multiplayer_rooms (id)` ON DELETE CASCADE;
  `user_id` → `auth.users (id)` ON DELETE CASCADE; PK `(room_id, user_id)`
  mirrors `private.multiplayer_room_members`.
- `renewed_at_ms` is a BIGINT epoch-millisecond stamp SUPPLIED BY THE WORKER
  (`Date.now()`), not by the database clock and never by a client. The
  coordinator compares it against its own `context.nowMs`, so comparison and
  writing share one clock and no Postgres/Edge clock-skew can fake liveness
  or manufacture staleness. Retention pruning is the only use of the
  database clock (`now()`), where skew is irrelevant at 3-day granularity.
- Table is `service_role` only (revoke from `public, anon, authenticated`),
  exactly like `private.multiplayer_game_states`. Clients reach it through
  the edge function exclusively.

Write path (all server-side; the client cannot write liveness directly):

1. `public.multiplayer_renew_seat_liveness(p_room_id, p_user_id, p_renewed_at_ms)`
   — `security invoker`, `service_role`-only, mirroring the existing
   `multiplayer_commit_transition` grant model. Validates, in order:
   - all arguments present, `p_renewed_at_ms > 0` (else `raise 22023`
     "Invalid multiplayer transition collections."-style 400 mapping);
   - room row exists and `expires_at > now()` (else `P0002`
     "Multiplayer room was not found." — the same stable code the commit
     path uses, so the worker maps it to 404 identically);
   - the SUBMITTED-BY-DATABASE canonical state
     (`private.multiplayer_game_states.canonical_state`, never a client
     payload) contains a `kind = 'human'` seat with matching `userId` whose
     `participation <> 'left'` — otherwise `raise 42501`
     ("Only a seated human may renew seat liveness." → worker 403).
     A permanently departed seat can never refresh liveness; a disconnected,
     sitting-out, or rebuy-pending human can (liveness ≠ participation — see
     §6).
2. The upsert is monotonic:
   `renewed_at_ms = greatest(existing, excluded)`. Out-of-order or replayed
   renewals (duplicate signals) can never move a seat's liveness forward or
   backward — the stored value is always the freshest genuine contact.
3. Opportunistic renewal rides every accepted authenticated touch that
   already names the room and has passed the JWT + membership gates:
   `command` (before the coordinator applies it, so acting always proves
   presence and a survivor can never stale-fold itself with its own tick),
   `sync`, and `moment`. Opportunistic renew failures are swallowed with a
   diagnostic log — a failed refresh must never fail the primary operation,
   because renewal failure fails SAFE toward "not stale" only while the row
   stays fresh; a client that stops touching entirely is still caught by the
   row aging out.
4. Dedicated operation `liveness` (body `{ operation: 'liveness', roomId }`):
   authenticated, room-scoped; the RPC performs the ownership check itself.
   Success answers `{ renewed: true, roomId }` with HTTP 200. It commits NO
   canonical state — the room `version` never moves, and no realtime
   broadcast is produced. Errors map like the commit path: 42501 → 403
   `room_forbidden`, `P0002` → 404 `room_not_found`, else 503.

Read path:

`public.multiplayer_load_seat_liveness(p_room_id)` → rows
`(user_id, renewed_at_ms)`, `service_role`-only. The worker loads rows ONLY
while executing a `tick` command (the only transition that enforces
liveness), and passes them into the coordinator context as
`liveness: Record<userId, renewedAtMs>`.

## 3. Expiry timing

- `MULTIPLAYER_LIVENESS_STALE_MS = 15_000` (exported from the coordinator —
  the single authority). A seat is STALE when `context.nowMs - renewed_at_ms
  >= 15_000`, and also when it is MISSING from the map (a row-less seat has
  never proven contact — missing == stale for rooms that have any
  liveness rows at all).
- The client heartbeat sends the `liveness` operation every
  `MULTIPLAYER_LIVENESS_HEARTBEAT_MS = 5_000` while the table is open and
  not complete, so a healthy seat is ≥ 3× redundant. Future-dated stamps
  (worker clock or skew) can only make a seat look fresher — never staler.
- Fail-open deployment rules, so this feature can never orphan rooms:
  - `multiplayer_load_seat_liveness` errors (e.g. migration not yet
    applied): the worker passes NO liveness map, and enforcement is off for
    that tick — behaviour degenerates exactly to today's rules.
  - The rows come back EMPTY: also no map (enforcement off). This keeps
    every room created before the feature (and a room between the client's
    first heartbeat and its first renewal) governed by the connection rules
    it was accepted under. The first accepted touch under the new worker
    creates the first row and turns enforcement on for that room from then
    on — including for seats whose last contact predates the feature; their
    first heartbeat renews within 5 s, far inside the 45 s turn window.
  - Renewal (opportunistic or dedicated) failing never fails the operation
    and never fabricates staleness.

## 4. Enforcement at the deadline (playing state)

The tick-expiry path keeps its existing structure and adds ONE input —
`stale = liveness map present && (missing || now - renewed >= 15_000)`:

```
offline = seat.connection === 'offline' || stale
```

When `stale` is true and the seat still claims `'online'`, the coordinator
first marks the truth it observed: `connection = 'offline'`, and
`participation` `'active'` → `'disconnected'` (other lifecycle states stay;
a `left` seat never reaches this path). Then the EXISTING offline expiry
rule applies unchanged: `applyEnforcedFold` once — never the courtesy
`check`, `missedTurns += 1`, no AI takeover, control stays human forever,
`transferUnavailableHost` for table authority, then `processAutomatedTurns`
(whose next human actor arms a FRESH full budget — Q3 semantics unchanged).

Loss exactly at the deadline is therefore decided by the liveness row AT
EXPIRY TIME: stale/missing at expiry ⇒ treated disconnected ⇒ folded once.
Renewals arriving after the fold have already lost that race and cannot
resurrect the hand (the fold is canonical state; see §6). Late renewal can
only refresh the row for the NEXT deadline.

Deadline preservation is untouched: liveness enforcement NEVER writes
`turnDeadlineAtMs`. A preserved deadline (disconnect pause/resume, Q3)
stays the same absolute instant; renewing mid-turn does not reset, extend,
or clear the clock in progress — it only protects the seat from being
treated as transport-dead at expiry.

## 5. Between-hands convergence sweep

A stale `connection = 'online'` seat must not keep sitting in a between-
hands room counted as a live decision-maker. On every `tick` command while
`status === 'between-hands'` and a liveness map is present, BEFORE the
countdown-due gate, the coordinator sweeps:

- every human seat, `connection === 'online'`, `participation !== 'left'`,
  stale by liveness → `connection = 'offline'`;
  `participation` `'active' | 'rebuy-pending'` → `'disconnected'` (a pending
  rebuy decision is NOT resolved as "sit out" for a seat that merely lost
  transport — it stays pending exactly like the existing offline-return
  contract; `'sitting-out'` stays `'sitting-out'`).
- per demoted seat: `transferUnavailableHost` (host authority moves when the
  host's transport dies; the host SEAT stays human — 3.11F).
- After any demotion: recompute the rebuy-decision/countdown picture exactly
  like the existing expiry-resolution block — online-`rebuy-pending` seats
  are the only thing that holds `rebuyDecisionDeadlineAtMs`; when the sweep
  removed the last online pending seat, clear it and re-arm `nextHandAtMs`
  iff `activeFundedCount >= 2 || !humanCanReturnToSession`, else leave it
  null (the room waits; the host may end the stalled session). If EVERY
  human is now offline, `pauseRoom('between-hands')`.
- The sweep commits convergence even when the countdown is not due (the
  transition is real state repair). If the sweep changed nothing and the
  countdown is not due, the existing "The next-hand countdown has not
  reached zero." invalid refusal still fires, so premature-tick behaviour
  (and its tests) are unchanged. The sweep never touches `turnDeadlineAtMs`
  (between-hands has none) and never mutates the settled hand or ledgers.

## 6. Reconnection semantics (no resurrection, no fake restoration)

- Renewal alone NEVER restores anything: not participation, not a folded
  hand, not a missed deal. It only refreshes the row.
- A stale-demoted `disconnected` seat returns exactly through the existing
  authenticated `set-connection: online` owner path: active again (chips
  via ledger), or `rebuy-pending` re-entry at zero with the fresh decision
  window — the same rules the GLM lifecycle contract already defines and
  tests. The Q4 client adds convenience on top: when a heartbeat SUCCEEDS
  while the viewer's own seat shows `disconnected`, the modal auto-sends
  `set-connection: online` (the user's visible "table screen" action is the
  heartbeat itself; no new button, no new copy).
- A `left` seat remains permanently left (renew RPC refuses it; the sweep
  skips it; `requireMember` still rejects commands).
- A seat folded by stale expiry stays folded for that hand even if its row
  is fresh one second later — the fold was true at expiry time; later
  contact cannot undo a committed action (§4).

## 7. Authorization and abuse boundaries

- Every write is behind the worker's verified JWT (`withSupabase`
  verifyJwt) AND the RPC's canonical-state ownership check: `p_user_id` is
  the worker's authenticated subject, never client input; a peer cannot
  renew (or clear) another user's row; non-members get 403/404 without any
  write; departed (`left`) users are refused.
- No client can mark another seat stale: staleness is purely
  absence-of-contact over ≥ 15 s of worker clock. There is no "report
  stale" input at all.
- Liveness rows are tiny fixed-size facts `(room, user, bigint)`; no PII
  beyond the FK ids; retention is bounded: per-renew pruning of rows whose
  room has expired and rows older than 3 days, plus FK cascade on room
  deletion. No new realtime traffic, no new public tables/columns.
- Replay safety: replays are `greatest()`-monotonic; there is nothing to
  idempotency-track beyond that.

## 8. Client changes

- `buildMultiplayerSeatLivenessRequest(roomId)` in the production request
  builder + `renewMultiplayerSeatLiveness(roomId)` service function using the
  existing invoke/error-mapping pipeline and production response parsing.
- `MULTIPLAYER_LIVENESS_HEARTBEAT_MS = 5_000` lives with the client
  lifecycle helpers; the server keeps the only authority on
  `MULTIPLAYER_LIVENESS_STALE_MS` (15 s). A unit test pins
  `heartbeat × 3 ≤ stale` so the ratio cannot silently drift.
- Modal: while the table is open and not `complete`, a 5 s interval beats
  the liveness endpoint; each successful beat that finds the viewer's own
  seat `disconnected` sends `set-connection: online` once per observed
  state (guarded against repeat-fires while a request is in flight). All
  heartbeat failures are silent (the next beat retries; the visible error
  surface stays the existing transport-notice system). The heartbeat stops
  when the modal closes or the session completes.

## 9. Deployment order (mandatory)

1. Database migration FIRST (`multiplayer_renew_seat_liveness` /
   `multiplayer_load_seat_liveness` / table).
2. Edge worker next (opportunistic renewal + `liveness` operation + tick
   injection).
3. Client heartbeat last.

Every layer tolerates the others being old or new: an old worker never
calls the new RPCs (rows simply never appear → enforcement off); a new
worker with a missing migration fail-opens (§3); an old client keeps the
connection-declared rules until its heartbeat ships. Enforcement for a room
only starts once that room has at least one liveness row, which requires a
new client AND new worker.

## 10. Proof plan (what the tests must show)

- Coordinator unit: stale actor facing-a-bet AND stale actor with a free
  check both enforced-fold (never check); fresh liveness keeps the online
  check rule; missing row = stale when map present; empty/absent map =
  today's behaviour byte-for-byte (all pre-existing timing tests green
  unchanged); between-hands sweep demotes/marks/transfers/pauses, commits
  even when the countdown is not due, still refuses a no-change premature
  tick; sweep never touches `turnDeadlineAtMs`; renewal-mid-turn never
  moves the deadline; a post-fold renewal never resurrects.
- Real HTTP: victim's client goes silent (no commands, no heartbeats) while
  survivors keep touching; after the REAL 30 s turn deadline the survivor
  tick force-folds the victim, marks the seat `disconnected`/`offline`, and
  the victim's public action ledger contains ZERO `check` rows for that
  seat; psql proves the victim's liveness row did not advance while
  silent, that a peer's `liveness` call cannot touch it, and that a
  non-member's `liveness` call is 403/404; a late renewal returns 200 but
  the fold and the omission from the next deal stand; `set-connection:
  online` restores participation, ledger visibility, and next-hand deal
  inclusion; a `liveness` request never bumps the room `version`.
- pgTAP: RPC guards directly — unknown room → P0002 text; non-owner/non-
  human/left ownership → 42501; `greatest()` monotonicity on out-of-order
  stamps; retention prune removes expired-room rows.
