# Release 1.2 notice and CI verification

## Notice behavior

Returning installations receive a one-time, offline “What’s new in 1.2” notice
on a settled Home screen. It introduces the tutorial, updated opponents, table
and review improvements, and prominently explains the Championship fresh start.
It names the Championship records that reset and the other records that remain.

- The editorial release ID is `1.2`, independent of build numbers and patches.
- Eligibility uses the existing onboarding receipt. Fresh installations keep
  onboarding and acknowledge this release when they choose their experience.
- Presentation waits for initial-link handling, learning setup, and a quiet
  Home screen. Navigation cancels the presentation delay. A private-table
  invite defers automatic presentation for that app session without marking
  the release read.
- “Got it” and Android Back persist the receipt. Reading eligibility or showing
  the modal never marks it read. Storage failure still allows dismissal for
  the current session.
- Profile & settings → What’s new reopens the same notice. Dismissing a manual
  viewing also settles any pending automatic notice.
- Account deletion clears the receipt and suppresses pending presentation.
- Notice code never performs the Championship migration or changes game data.
- Copy ships in English and both Chinese locales. Draft Spanish, Portuguese,
  and Japanese translation memories/catalogs were updated without enabling them.
- The content scrolls, respects OS text scaling and reduced motion, and has a
  separate dismissal footer with a 52-point minimum touch target.

## CI diagnosis and fix

The September 6 run on `fc85a279` failed in two independent jobs:
https://github.com/hao6yu/rivermind-poker/actions/runs/34050384776

The multiplayer setup action successfully started its stack, but the harness
used `/usr/local/bin/supabase` instead of the executable installed on PATH.
The setup action installs the CLI in a versioned npm directory. The harness
now resolves executable tools from PATH, supports explicit overrides, retains
Node/tool directories in child environments, and distinguishes a spawn failure
from a stopped stack. CI pins the verified CLI version, 2.116.0. Secret-bearing
status output remains unlogged.

All ten failures in the main test job were whole-corpus timeouts. The unchanged
all-AI corpus took 212 seconds on that runner against a 90-second allowance;
two ladder structure tests took 6.8–6.9 seconds against a five-second default.
Hosted runs now use two workers and three times the existing local simulation
limits. Seeds, corpus sizes, behavioral thresholds, and explicit one-second
per-decision assertions are unchanged. Opt-in hour-long benchmark limits are
unchanged. The verify job has a 30-minute overall limit.

## Verification

- Node 22.19.0 typecheck: passed.
- Focused notice, storage, executable discovery, account deletion, onboarding,
  localization, and theme run: 28 files / 231 tests passed before the final
  account-deletion fixture addition.
- Multiplayer integration with the corrected tool resolution: all 20 tests
  passed locally (69.84 seconds).
- Full isolated-checkout and hosted CI results: pending at initial commit.
- Native visual verification and signed-release upgrade verification are not
  claimed by the automated tests above.

Work is isolated from concurrent AI strategy changes in the original checkout.
