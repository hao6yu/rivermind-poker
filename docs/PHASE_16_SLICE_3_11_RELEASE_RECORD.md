# Phase 16 Slice 3.11 — Release Verification Record

Slice: Profile, Play Hub, Table Experience, and Championship Expansion
Scope of record: `docs/PHASE_16_SLICE_3_11_SCOPE.md`
Branch: `codex/slice-3.11-profile-play-championship`

## Commit checkpoints (one commit each, adversarial review closed per checkpoint)

| Checkpoint | Commit | Review |
| --- | --- | --- |
| 3.11A — themed foregrounds, compact identity shell | `d09161a4` | fixes `024ba37f` |
| 3.11B — common-photo intake and adjustable preview | `39df725c` | fixes `7c18a0bb` |
| 3.11C — simplified Play hub | `2ae58fa8` | fixes `73214d72` |
| 3.11D — nine-seat tournaments, Championship v2 | `a64641ff` | fixes `ee6b536f` |
| 3.11E — measured panes, AI identity, player profiles, canonical order | `c77bd342` | review closed this branch (P1/P2 resolved in-commit) |
| 3.11F — seat lifecycle, rebuys, ledger, Table stats | `6c9bd6b2` | review closed this branch (4×P1 + 6×P2 resolved in-commit) |
| 3.11G — integrated verification gate | this commit | integrated diff reviewed via the 3.11E/3.11F adversarial passes |

## Automated gate results (this exact commit)

- `tsc --noEmit`: clean.
- Full unit/localization suite: **161 files, 1,707 tests, all green** (includes the
  measured-layout collision matrix, canonical Aya/Bruce/Zane order fixtures,
  the record-snapshot validation corpus, ledger/rebuy coordinator corpus,
  Table stats presentation, and localization parity/completion/Chinese-quality suites).
- `git diff --check`: clean.
- `verify:release-config`: pass (RiverMind iOS/Android 1.0.0).
- `verify:mobile-secrets`: pass for tracked source.
- `verify:multiplayer-edge`: **environment-blocked** — the Supabase CLI is not
  installed in this workspace (`spawnSync supabase ENOENT`). The Edge Function
  changes were reviewed as code and route the new commands through the same
  coordinator validation paths covered by the domain tests; the gate itself
  must be re-run on a machine with the Supabase CLI before distribution.

## Pending human verification (device/simulator QA)

These are implemented in code and covered by automated tests where possible,
but require physical/simulator verification before distribution:

1. **iOS and Android production exports** (EAS build profiles) — not run in
   this workspace.
2. **Physical-device visual pass**: dark/light modes in English, Simplified
   Chinese, and Traditional Chinese at supported Dynamic Type sizes; the
   measured-pane table compositions on the minimum supported phone, a large
   phone, and a tablet in both orientations (3.11E manual matrix).
3. **Rebuy/Table stats device pass**: bust a human between hands, exercise the
   Rebuy 4,000 / Sit out decision, reconnect paths, and confirm both devices'
   Table stats sheets converge on identical ledger values.
4. **All-Nemesis nine-seat performance bound** (3.11D/3.11G): frame pacing,
   action latency, temperature, and battery on the minimum supported physical
   phone during a sustained hidden-invitation run.
5. **`verify:multiplayer-edge`** on a Supabase-CLI-equipped machine, plus one
   real-room smoke of the `rebuy`, `sit-out`, `update-play-record`, and
   `end-stalled-session` commands against the deployed Edge Function.

## Known limitations recorded at gate time

- `verify:multiplayer-edge` executed: not executed here (environment) — flagged above.
- The Snapshot protocol version constant did not advance in 3.11F; capability
  negotiation for pre-3.11F clients is satisfied at runtime by the coordinator's
  owner-only command gating and the client parser's bounded coercion. A future
  protocol bump is recommended when pre-3.11F builds must be refused before seating.
- Residual 3.11E review nits intentionally deferred as non-blocking (documented
  in the 3.11E review record): lobby preview "measured remainder", focus
  restoration on the table sheets, per-render seat-map memoization.
