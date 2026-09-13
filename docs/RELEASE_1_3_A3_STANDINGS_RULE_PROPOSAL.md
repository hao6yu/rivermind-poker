# A3 standings-rule proposal — rebuy-enabled private sessions

Status: **DEFERRED (v1.3 follow-up review, 2026-09-11).** Sessions rank by **final stack** — the rule every shipped client computes. The net-ranking rule was implemented behind a ledger-completeness boundary during the first remediation round, and that boundary was proven insufficient: complete ledgers do not identify which ranking algorithm a seat's client understands (the pre-v1.3 implementation already reads the same ledger and always sorts by final stack, and server-created human seats receive ledger entries regardless of client version). With the same snapshot — A: stack 3,500, net −500; B: stack 2,500, net +500 — a final-stack client names **A** and a net client names **B**. Ranking by net while any final-stack client can view the session can therefore name different winners for the same session by construction.

Shipped behavior (`buildMultiplayerSessionSummary`, `src/domain/multiplayer/sessionSummary.ts`):

1. Rank by **final stack** (settled stack). Equal stacks share a place; canonical seat order breaks visual ties.
2. The delta column still shows the **net result** (settled − total buy-in) as display data; it is not the ranking key.
3. `rankedByNet` remains in the contract, always `false`, reserved for the versioned rollout below.

## Why deferral is the only safe boundary today

A client-side ranking rule can only be safe if the set of clients that may view a session is guaranteed to implement the same rule. Nothing in the current snapshot distinguishes v1.2 from v1.3 clients (both speak the same snapshot protocol and both handle ledgers), and hand-editing a new field would be ignored by old clients — no fix at all. The legacy final-stack rule is the one boundary that cannot disagree.

## Rollout requirements (when revisited)

1. **A real session/protocol capability boundary**: sessions must record the minimum ranking capability a client needs to join or view them, and the table must enforce it (refuse incompatible joins the way seat-count capability is enforced today). A field old clients ignore is not a boundary.
2. **Disclosure to every participant before play**: the agreed rule must be stated in the private setup flow — visible to all seats, not only the player facing a rebuy decision.
3. **Result caption**: the sheet states the ranking rule exactly when the net rule ranked it (`rankedByNet`).
4. **Archives untouched**: archived sessions keep the places they were recorded with.

## Original proposal (kept for the record)

For **new private sessions with rebuys enabled**:

1. Rank standings by **net chip result** (settled − total buy-ins). Ties share a place (existing equal-stack rule applied to net).
2. Display **final stack as its own column** (not the ranking key).
3. Disclose the rule **before play**: a one-line note in the private setup flow next to the rebuy toggle, e.g. "With rebuys on, standings rank the night's net result."
4. **Historical results are untouched**: archived sessions keep the places they were recorded with (`archive.ts` stores the sheet rows); only sessions created after the change rank by net.
5. Sessions with rebuys disabled keep ranking by final stack — identical to net there, and the familiar rule for quick games.

Tests: `sessionSummary.ranking.test.ts` pins the shipped final-stack rule, the follow-up review's A/B reproduction (the old and new algorithms must agree on the same snapshot), shared places, and the `rankedByNet: false` contract.

## Owner decision requested

- [ ] Adopt: rank rebuy-enabled sessions by net chips — **requires the capability boundary above first; not safe today**.
- [x] **Deferred (shipped)**: keep final-stack ranking for every session this release; revisit with the versioned rollout.
- [ ] Alternative: keep final-stack ranking but relabel the headline ("most chips at the end") to remove the contradiction.
- [ ] Alternative: show both rankings (adds sheet complexity; not recommended).
