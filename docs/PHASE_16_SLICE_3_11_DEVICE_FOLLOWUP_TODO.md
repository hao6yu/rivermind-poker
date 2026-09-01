# Phase 16 Slice 3.11 — Final device follow-up

Status: **in progress**  
Branch: `local/slice-3.11-device-hardening`  
Source: physical-iPhone testing after the unified-seat candidate (`c6c18a3e`)

This checklist is the acceptance contract for the six remaining device findings. A finding is complete only when the implementation, automated regression evidence, and physical-device recheck agree. Existing screenshots are reference evidence; they are not instructions or a waiver of the checks below.

## F1 — Coach-enabled bottom-seat containment

- [ ] Keep the complete viewer plaque, name, stack/status, and both hole cards inside the felt when Coach is enabled.
- [ ] Do not solve the clipping by hiding identity or cards.
- [ ] Verify portrait layouts for 3-, 6-, and 9-seat local AI, Sit & Go, and Championship tables, with Coach both on and off.
- [ ] Preserve minimum tap targets and supported text scaling.

## F2 — One phone header-control system

- [ ] Give orientation, guide/help, Coach, history/stats, and mode/status controls a shared phone control frame: equal target size, radius, visual weight, and spacing.
- [ ] Use icons plus accessibility labels where text would make one control materially wider than its peers.
- [ ] Keep selected/on/busy/disabled states visually distinct and accessible.

## F3 — Championship and action-rail alignment

- [ ] Apply the F2 header contract to Championship/Sit & Go modes, including the Tour/status control.
- [ ] Make the compact Table feed control the same rendered height as Fold, Check/Call, and Bet/Raise in the bottom action rail.
- [ ] Keep the feed count readable without adding a separate content row.

## F4 — Complete countdown messaging

- [ ] Render `Countdown paused` and `Next hand in N seconds` without ellipsis or clipping in the settled result state.
- [ ] Cover en, zh-Hans, and zh-Hant; any wording change must be localized in all three.
- [ ] Verify small phones, supported text scaling, and the rebuy-pending state.

## F5 — Rebuy as a focused decision popup

- [ ] Replace the large inline rebuy card with a measured modal decision sheet.
- [ ] Reuse the existing server-owned `Rebuy 4,000` and `Sit out` commands; do not create a client-only chip path.
- [ ] Keep the settled result readable behind/after the decision and prevent duplicate submissions.
- [ ] The popup must remain within safe areas, support accessibility focus, and provide an explicit decision path without a hidden dismissal that changes player state.

## F6 — Canonical ten-second next-hand interval

- [ ] Audit every local and multiplayer next-hand path; remove any remaining five- or seven-second interval.
- [ ] The authoritative interval is exactly 10 seconds.
- [ ] A rebuy decision may pause the countdown. After the decision, the authoritative transition must still provide the intended ten-second review window rather than immediately dealing.
- [ ] Add fake-timer/state regressions proving the visible `10` start and the actual transition boundary.

## Required gate

- [ ] Focused render/state tests fail on the prior behavior and pass on the fix.
- [ ] `pnpm typecheck`
- [ ] Full unit suite
- [ ] Multiplayer integration/Edge verification where locally available
- [ ] `pnpm verify:release-config`
- [ ] `pnpm verify:mobile-secrets`
- [ ] iOS and Android production JS exports
- [ ] `git diff --check`
- [ ] Install over the existing physical-iPhone build (no uninstall) and recheck all six findings.

No merge, push, hosted deployment, migration, Championship reset, TestFlight upload, or production rollout is authorized by this checkpoint.
