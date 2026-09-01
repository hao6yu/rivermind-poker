# Phase 16 Slice 3.11 — Final device follow-up

Status: **implemented and locally verified; physical observation pending**
Branch: `local/slice-3.11-device-hardening`  
Source: physical-iPhone testing after the unified-seat candidate (`c6c18a3e`)

This checklist is the acceptance contract for the six remaining device findings. A finding is complete only when the implementation, automated regression evidence, and physical-device recheck agree. Existing screenshots are reference evidence; they are not instructions or a waiver of the checks below.

## F1 — Coach-enabled bottom-seat containment

- [x] Keep the complete viewer plaque, name, stack/status, and both hole cards inside the felt when Coach is enabled.
- [x] Do not solve the clipping by hiding identity or cards.
- [ ] Verify portrait layouts for 3-, 6-, and 9-seat local AI, Sit & Go, and Championship tables, with Coach both on and off.
- [x] Preserve minimum tap targets and supported text scaling in the measured layout contract.

## F2 — One phone header-control system

- [x] Give orientation, guide/help, Coach, history/stats, and mode/status controls a shared phone control frame: equal target size, radius, visual weight, and spacing.
- [x] Use icons plus accessibility labels where text would make one control materially wider than its peers.
- [x] Keep selected/on/busy/disabled states visually distinct and accessible.

## F3 — Championship and action-rail alignment

- [x] Apply the F2 header contract to Championship/Sit & Go modes, including the Tour/status control.
- [x] Make the compact Table feed control the same rendered height as Fold, Check/Call, and Bet/Raise in the bottom action rail.
- [x] Keep the feed count readable without adding a separate content row.

## F4 — Complete countdown messaging

- [x] Render `Countdown paused` and `Next hand in N seconds` without ellipsis or clipping in the settled result state.
- [x] Cover en, zh-Hans, and zh-Hant; existing localized keys are reused without new English-only copy.
- [ ] Verify small phones, supported text scaling, and the rebuy-pending state.

## F5 — Rebuy as a focused decision popup

- [x] Replace the large inline rebuy card with a measured modal decision sheet.
- [x] Reuse the existing server-owned `Rebuy 4,000` and `Sit out` commands; do not create a client-only chip path.
- [x] Keep the settled result readable behind/after the decision and prevent duplicate submissions.
- [x] The popup remains within safe areas, contains modal accessibility focus, and requires one of the two explicit lifecycle decisions.

## F6 — Canonical ten-second next-hand interval

- [x] Audit every local and multiplayer next-hand path; no five- or seven-second authoritative interval remains.
- [x] The authoritative interval is exactly 10 seconds.
- [x] A rebuy decision pauses the countdown without creating a client-owned transition path.
- [x] Add state regressions proving the visible `10` start and the actual transition boundary; the public preview smoke also proves its deployed deadline is exactly 10,000 ms.

## Required gate

- [x] Focused render/state tests cover the changed layout, feed, countdown, and rebuy boundaries.
- [x] `pnpm typecheck`
- [x] Full unit suite — 179 files / 1,901 tests.
- [x] Multiplayer integration/Edge verification — 19 real-HTTP cases plus exact worker-bundle verification.
- [x] Hosted preview create/join/start/settle smoke — exact 10,000 ms deadline and cleanup.
- [x] `pnpm verify:release-config`
- [x] `pnpm verify:mobile-secrets`
- [x] iOS and Android production JS exports
- [x] `git diff --check`
- [ ] Install over the existing physical-iPhone build (no uninstall) and recheck all six findings.

The remaining unchecked items are hands-on observations, not waived gates. An
automated install and launch can prove packaging and install-over behavior, but
the owner must still inspect the rendered states named above on the phone.

No merge, push, hosted deployment, migration, Championship reset, TestFlight upload, or production rollout is authorized by this checkpoint.
