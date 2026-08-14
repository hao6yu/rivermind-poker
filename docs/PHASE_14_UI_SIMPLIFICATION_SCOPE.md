# Phase 14 — UI simplification and table alignment

## Outcome

Make RiverMind feel calmer and easier to scan without removing any game,
training, review, or settings capability. Each fact or action should have one
clear home, and table content must occupy explicit non-overlapping lanes on
supported phone and iPad sizes.

## Visual hierarchy

- Indigo is reserved for selection, the primary action, and the current turn.
- Aqua is reserved for completion, success, and live coaching feedback.
- Red is reserved for destructive actions and errors.
- Ordinary navigation, metadata, and containers use neutral surfaces.
- A screen has one primary action. Secondary actions use rows or quiet buttons.
- Temporary action bubbles explain the moment; persistent seat labels preserve
  the current street. The table center does not narrate those actions again.

## Included simplification

### Home, Play, setup, and Profile

- Home keeps the learning recommendation, Quick Play, Daily Challenge, and one
  route to all games. Championship, scenarios, and references remain available
  from their dedicated Play or Learn destinations instead of being duplicated.
- Play uses one consistent list for solo modes. Quick Play no longer has a
  second decorative hero treatment.
- Game Setup removes the mode recap, private-card explainer, and footer recap;
  their values are already visible in the selected controls.
- Profile combines appearance, haptics, and language in one Preferences
  surface. It removes the saved-learning summary already available in Progress
  and removes repeated player-name helper copy.

### Learn and supporting sheets

- The personal plan leads with its next step and discloses the rest on demand.
- Goal/calibration and mastery remain available in compact, quieter rows.
- Ordinary learning rows stop alternating indigo and aqua decoration.
- Retained metadata uses readable text sizes and retained actions meet a
  44-point minimum target.
- Result, championship, and bet-sizing sheets remove values or explanations
  already visible in the table or adjacent review content.

### Local and private tables

- Heads-up, multiway, Daily, Sit & Go, Championship, and private tables keep
  only turn or thinking state in the center. The result rail owns completion.
- Player actions appear in their transient bubble and current-street seat label,
  not a third central action-history panel.
- Six-seat layouts reserve top seats, top feedback, board/status, bottom
  feedback, and bottom seats as separate vertical bands.
- Lobby and live-game anchors are independent. Phone, compact iPad, and wide
  iPad geometry is verified mathematically rather than by percentages alone.
- D, SB, and BB remain the only position badges.

## Responsive acceptance

- 320×568 and 375-point phones: no sticky action covers setup controls; seat
  plaques, bubbles, board, and CTA rails do not intersect.
- 768- and 834-point iPad portrait: readable player metadata without reverting
  to phone typography, and no center/side-seat overlap.
- 1024-point iPad landscape: all six seats align to explicit top/bottom lanes.
- English, Simplified Chinese, and Traditional Chinese copy can wrap without
  hiding a required action.
- Accessibility text keeps navigation reachable; retained non-table controls
  have at least a 44-point target.

## Deliberately retained

- Poker-correct folds, exact chip amounts, action history, coach facts, replay,
  progress, difficulty, pace, and all private-room recovery controls.
- Temporary action bubbles and persistent current-street seat labels, because
  they serve different momentary and recall needs.
- Green felt and established card/position semantics.

## Deferred

- A wholesale brand/theme redesign.
- New navigation tabs or moving capabilities between product areas.
- AI strategy, networking, schema, audio, or gameplay-rule changes.
