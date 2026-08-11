# PR 56 — six-max phone readability QA

## Outcome

Six-player tables now use a focused phone presentation instead of shrinking the
full table until every label fits. Essential information stays visible at a
comfortable size while inactive seats stop competing with the board and the
current decision.

## Changes verified

- Six-max phone opponents use wider plaques with larger names, stacks, roles,
  and action text.
- Hidden opponent cards use a compact two-card indicator; full cards return at
  a legitimate showdown.
- Inactive seats omit stale action badges. Folded, all-in, acting, and most
  recently acted states remain visible.
- Dealer and blind markers sit on the seat corner without reducing the name's
  text width.
- The upper-left/right pair sits below the top-center player as a distinct row,
  while the lower-left/right pair starts below the protected board and action
  lane.
- The current seat scales and layers above nearby content.
- The compact-height action trail keeps the latest two actions and uses larger
  center-table text.
- Community cards remain 44×62 points and hero actions retain their existing
  48-point minimum height.
- Three-player phones and tablet-sized six-player layouts keep their existing
  presentation.

## Automated verification

- TypeScript: pass.
- Compact layout classification: covered at 360×640, 375×667, 430×932, and
  768×1024.
- Targeted table presentation tests: pass.
- Full deterministic and UI-model suite: pass.

## Real-device simulator pass

Device: RiverMind iPhone SE simulator, portrait, Simplified Chinese.

- Opened Custom AI Game and started a six-player, five-hand Club session.
- Verified long names such as **Uncle Tu**, all five opponent stacks, hero
  cards, D/SB/BB markers, compact hidden-card indicators, and folded states.
- Followed the preflop raise and call sequence with the active opponent and
  center action both readable.
- Re-ran a fresh six-player deal after staggering both side pairs and verified
  clear gaps between the top-center seat, upper side pair, pot, board, current
  action, and lower side pair.
- Continued to a three-card flop and verified the full-size board, pot, latest
  action, hero prompt, Coach summary, and Fold/Call/Bet controls remained
  separated and readable.
- No seat, role marker, community card, center action, Coach card, or hero
  control collision was observed.

## Follow-up matrix

Before distributing the next beta, repeat the core six-player path on a
360-pixel-wide Android device, dark mode, largest supported text size, and one
showdown where several opponent hands are revealed.
