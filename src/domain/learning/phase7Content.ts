import type { Card, Rank, Suit } from '../poker/types';
import type { CheatSheetDefinition, LessonDefinition } from './types';

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

export const tournamentBubbleLessons: LessonDefinition[] = [
  {
    id: 'lesson-tournament-risk-premium',
    type: 'lesson',
    difficulty: 'intermediate',
    title: 'Understand bubble risk premium',
    description: 'Separate chip value from survival value near a payout or qualification line',
    estimatedMinutes: 6,
    sections: [
      {
        heading: 'Equal chip gains do not always have equal tournament value',
        body: 'In a cash game, gaining 10 chips offsets losing 10 chips. Near a tournament bubble, losing can end the event while winning the same amount may only improve an already safe stack. That asymmetry creates a risk premium: a covered stack often needs more equity to call an all-in than raw pot odds alone suggest.',
        takeaway: 'Use chip odds as the starting point, then ask what elimination costs in the current tournament state.',
      },
      {
        heading: 'Risk premium changes calls more than first-in pressure',
        body: 'Calling an all-in has no fold equity and can end the tournament. Opening or shoving first can still win uncontested, so a player may pressure more hands while calling fewer. Avoid the common mistake of becoming uniformly tight on the bubble.',
        bullets: [
          'Covered medium stacks should avoid marginal call-offs.',
          'Chip leaders can pressure stacks that cannot call comfortably.',
          'Short stacks still need to take profitable first-in opportunities.',
        ],
      },
      {
        heading: 'Treat RiverMind ICM guidance as a practical baseline',
        body: 'Exact ICM depends on every stack and the payout structure. RiverMind uses bounded, explainable risk adjustments—not solver charts. When payout details or opponent ranges are uncertain, keep the conclusion directional: tighter call, wider pressure, or little meaningful change.',
        example: {
          title: 'Example · same pot, different cost',
          detail: 'Three players remain and two advance. With A♠ 10♦, a medium stack covered by the leader should decline a marginal all-in call that could be reasonable far from the bubble.',
          heroCards: [card(14, 'spades'), card(10, 'diamonds')],
        },
        takeaway: 'Never present an ICM-lite adjustment as an exact tournament chart.',
      },
    ],
  },
  {
    id: 'lesson-tournament-stack-coverage',
    type: 'lesson',
    difficulty: 'intermediate',
    title: 'Use stack coverage on the bubble',
    description: 'Recognize who can eliminate whom before choosing pressure or defense',
    estimatedMinutes: 6,
    sections: [
      {
        heading: 'Coverage determines the elimination threat',
        body: 'A player covers another when they can win that player’s full stack. If the chip leader shoves into you, calling and losing can eliminate you. If you cover a short stack, losing the same pot hurts but does not necessarily end the event. That difference changes the range interaction before cards are considered.',
        takeaway: 'Before an all-in decision, identify who covers whom and which stacks survive a loss.',
      },
      {
        heading: 'Leaders pressure; middle stacks avoid collisions',
        body: 'A leader can open more often when covered opponents must protect survival. A medium stack should be especially cautious about playing a huge pot with the leader while a shorter stack is close to elimination. This does not mean folding premium hands or attacking blindly—it changes marginal edges.',
        example: {
          title: 'Example · the shortest stack matters',
          detail: 'With stacks of 42, 21, and 6 big blinds and two places advancing, the 21-big-blind stack should avoid a thin call against the leader while the 6-big-blind stack remains alive.',
          heroCards: [card(8, 'hearts'), card(8, 'clubs')],
        },
      },
      {
        heading: 'Short stacks cannot wait forever',
        body: 'The shortest stack has less survival value to protect and fewer future hands before the blinds consume it. First-in fold equity is often its best asset. Still account for position and calling ranges; “shortest” is not permission to shove any two cards through the entire table.',
        takeaway: 'Coverage changes the price of failure, but hand quality, position, and fold equity still determine the action.',
      },
    ],
  },
  {
    id: 'lesson-tournament-bubble-decisions',
    type: 'lesson',
    difficulty: 'intermediate',
    title: 'Build a bubble decision checklist',
    description: 'Combine payout pressure, stack rank, position, and ranges without guessing',
    estimatedMinutes: 6,
    sections: [
      {
        heading: 'Read the tournament state before the cards',
        body: 'Count players remaining, identify the qualifying or paid places, rank the live stacks, and note coverage. Then convert the effective stack to big blinds. This prevents a familiar cash-game habit from overriding the actual tournament incentives.',
        bullets: [
          'How many players remain and how many advance?',
          'Which player is shortest, and who covers you?',
          'Is this a call with no fold equity or a first-in action?',
        ],
      },
      {
        heading: 'Change marginal decisions, not obvious ones',
        body: 'Bubble pressure should move close calls toward folds and profitable first-in pressure toward action. It should not turn a dominated hand into a call or a premium hand into an automatic fold. If the cash-game baseline is far from the boundary, the tournament adjustment is usually small.',
        takeaway: 'Apply the risk premium at the edge of a range, not as a reason to abandon poker fundamentals.',
      },
      {
        heading: 'State the assumption behind the recommendation',
        body: 'A useful tournament explanation names the stack relationship and range assumption: “tighter because the leader covers you and a six-big-blind stack remains,” or “wider first-in because only two risk-constrained stacks remain.” If that sentence cannot be completed, the adjustment is probably too vague.',
        example: {
          title: 'Example · explainable pressure',
          detail: 'As the 35-big-blind leader on the button, K♣ 9♣ can open efficiently into two 14-big-blind stacks that face elimination if they continue.',
          heroCards: [card(13, 'clubs'), card(9, 'clubs')],
        },
        takeaway: 'Good tournament advice names the pressure source instead of merely saying “ICM.”',
      },
    ],
  },
];

export const opponentReadLessons: LessonDefinition[] = [
  {
    id: 'lesson-opponents-evidence',
    type: 'lesson',
    difficulty: 'intermediate',
    title: 'Build reads from evidence',
    description: 'Separate a useful tendency from one memorable hand',
    estimatedMinutes: 5,
    sections: [
      {
        heading: 'Observe decisions, not outcomes',
        body: 'A shown bluff is one data point, not proof that someone always bluffs. Record the public situation: position, price, street, and whether the player bet, called, raised, or folded. A lost pot can contain a strong decision, and a won pot can contain a mistake.',
        bullets: [
          'Patient and sticky styles separate through repeated entry and calling frequencies.',
          'Pressure and deceptive styles separate through repeated aggression and its timing.',
          'Against a balanced style with no repeated one-direction leak, keep the baseline intact.',
        ],
        takeaway: 'Describe what happened repeatedly before assigning a label to the player.',
      },
      {
        heading: 'Require a relevant sample',
        body: 'Two hands are a clue; they are not a stable read. Look for at least three similar decisions and prefer eight or more observed hands before making a meaningful adjustment. A preflop looseness read does not automatically prove the same player over-bluffs rivers.',
        bullets: [
          'Match the evidence to the same kind of spot.',
          'Shrink the adjustment when the sample is small.',
          'Update the read when new actions disagree.',
        ],
      },
      {
        heading: 'Keep the default strategy underneath',
        body: 'An exploit should be a measured change from a sound baseline. With weak evidence, choose the normal range-and-price decision. With repeated evidence, change frequency or size gradually rather than jumping to an extreme.',
        example: {
          title: 'Example · early clue, normal action',
          detail: 'After only two observed loose calls, A♠ 5♠ should not fire a no-equity river bluff merely because the opponent “seems sticky.” Use the normal blocker and fold-target test.',
          heroCards: [card(14, 'spades'), card(5, 'spades')],
        },
        takeaway: 'Confidence determines the size of the adjustment, not just the direction.',
      },
    ],
  },
  {
    id: 'lesson-opponents-callers-folders',
    type: 'lesson',
    difficulty: 'intermediate',
    title: 'Adjust to callers and folders',
    description: 'Move value and bluff frequencies in opposite directions',
    estimatedMinutes: 6,
    sections: [
      {
        heading: 'Against frequent callers, value bet more directly',
        body: 'When repeated evidence shows too many calls, widen thin value modestly and choose sizes that the weaker range can still pay. Reduce low-equity bluffs because the required folds are less likely. Do not confuse “calls often” with “never folds”—strong pressure and bad prices still matter.',
        takeaway: 'Sticky ranges reward value and punish unsupported bluffs.',
      },
      {
        heading: 'Against frequent folders, pressure capped ranges',
        body: 'When a player repeatedly folds to reasonable bets, add selected bluffs with blockers or improvement potential. Avoid over-bluffing obvious strong ranges; a player who folds many weak hands can still continue correctly with strong ones.',
        example: {
          title: 'Example · evidence-supported pressure',
          detail: 'After twelve hands and five folds in comparable single-raised pots, Q♣ J♣ can barrel a strong draw more often than against an unknown opponent.',
          heroCards: [card(12, 'clubs'), card(11, 'clubs')],
          board: [card(10, 'clubs'), card(6, 'diamonds'), card(2, 'clubs')],
        },
      },
      {
        heading: 'Adjust one lever at a time',
        body: 'Start with frequency: bluff slightly less or value bet slightly more. Change size only when you can name the target range. Simultaneously widening range and using extreme sizes makes it difficult to know whether the read or the execution caused the result.',
        takeaway: 'A small, explainable exploit is easier to learn from than an all-or-nothing adjustment.',
      },
    ],
  },
  {
    id: 'lesson-opponents-aggression-traps',
    type: 'lesson',
    difficulty: 'intermediate',
    title: 'Respond to pressure and deception',
    description: 'Defend enough against aggression without paying every strong line',
    estimatedMinutes: 6,
    sections: [
      {
        heading: 'Wider aggression creates more bluff-catching value',
        body: 'A player who bets and raises many credible spots arrives with more weak combinations than a patient player. With a sufficient sample and a fair price, defend more bluff catchers. Continue to respect board texture and blockers; aggression alone does not make every call profitable.',
        takeaway: 'Widen defense only where the observed aggression can contain realistic bluffs.',
      },
      {
        heading: 'Patient aggression represents more strength',
        body: 'A selective opponent who suddenly raises after many passive hands usually deserves more credit. Fold marginal bluff catchers and weak made hands more readily, especially when the line has few natural missed draws.',
        example: {
          title: 'Example · respect a rare raise',
          detail: 'After sixteen observed hands with little aggression, K♠ Q♦ on K♥ 9♣ 4♠ 4♦ 2♣ can fold to a large river raise more comfortably.',
          heroCards: [card(13, 'spades'), card(12, 'diamonds')],
          board: [card(13, 'hearts'), card(9, 'clubs'), card(4, 'spades'), card(4, 'diamonds'), card(2, 'clubs')],
        },
      },
      {
        heading: 'Deception requires range protection, not guessing',
        body: 'A deceptive player may delay aggression or slow-play strong hands. Keep some strong hands in your checking and calling ranges so later action is protected. Do not try to identify the exact trap; compare the full value-and-bluff range with your price.',
        takeaway: 'Against traps, protect ranges and price decisions rather than trying to read minds.',
      },
    ],
  },
];

export const advancedMathLessons: LessonDefinition[] = [
  {
    id: 'lesson-math-implied-odds',
    type: 'lesson',
    difficulty: 'intermediate',
    title: 'Estimate implied odds',
    description: 'Add realistic future winnings when the direct call price is close',
    estimatedMinutes: 6,
    sections: [
      {
        heading: 'Direct odds stop at the current pot',
        body: 'Direct pot odds compare the call with the final pot if no more chips enter. Implied odds add future chips you expect to win after improving. They matter most for disguised strong hands, deep stacks, position, and opponents likely to pay another bet.',
        takeaway: 'Future chips count only when both the improvement and the payment are realistic.',
      },
      {
        heading: 'Estimate the missing future value',
        body: 'First calculate the direct call threshold. If your equity falls short, estimate how many extra big blinds must be won later to close the gap. Compare that target with the effective stack and a realistic future bet—not the opponent’s entire remaining stack.',
        example: {
          title: 'Example · small pair with room behind',
          detail: 'Calling 2 big blinds with 6♠ 6♦ can be reasonable when more than 60 big blinds remain and a strong overpair is likely to pay a meaningful bet after you flop a set.',
          heroCards: [card(6, 'spades'), card(6, 'diamonds')],
        },
      },
      {
        heading: 'Position improves realization',
        body: 'Acting last makes it easier to collect value after improving and to avoid paying extra when you miss. Multiway pots can increase potential payment but also create stronger competing draws. Keep the estimate conservative.',
        takeaway: 'Implied odds are an evidence-based adjustment, not permission to call every draw.',
      },
    ],
  },
  {
    id: 'lesson-math-reverse-implied-odds',
    type: 'lesson',
    difficulty: 'intermediate',
    title: 'Discount reverse implied odds',
    description: 'Recognize improvements that can still lose a larger pot',
    estimatedMinutes: 6,
    sections: [
      {
        heading: 'Not every out creates a clean winner',
        body: 'Reverse implied odds are future losses after making a second-best hand. A low flush draw can complete while losing to a higher flush; a dominated ace can pair and lose to a better kicker. These outcomes make the hand worth less than a simple out count suggests.',
        takeaway: 'Discount outs that improve your hand without reliably making it best.',
      },
      {
        heading: 'Nut potential matters more as stacks deepen',
        body: 'Deep stacks increase both implied winnings and reverse-implied losses. Small suited cards look attractive, but a large pot on a four-flush board often concentrates action around higher flushes. Favor draws that can make the nuts or remain easy to release.',
        example: {
          title: 'Example · dominated flush risk',
          detail: '7♥ 5♥ on K♥ J♥ 2♣ has a flush draw, but strong action from an early-position range can include many higher hearts. Treat fewer than all nine hearts as clean value cards.',
          heroCards: [card(7, 'hearts'), card(5, 'hearts')],
          board: [card(13, 'hearts'), card(11, 'hearts'), card(2, 'clubs')],
        },
      },
      {
        heading: 'Use a conservative equity margin',
        body: 'When outs are dirty or future action will be difficult, require more than the bare call threshold. Folding a close draw is not “ignoring odds”; it is accounting for the quality of the equity and the cost of later mistakes.',
        takeaway: 'Compare clean winning equity—not merely the chance of making a named hand—with the price.',
      },
    ],
  },
  {
    id: 'lesson-math-break-even-bluffs',
    type: 'lesson',
    difficulty: 'intermediate',
    title: 'Calculate break-even bluffs',
    description: 'Know how often a zero-equity bet must make better hands fold',
    estimatedMinutes: 6,
    sections: [
      {
        heading: 'Risk divided by risk plus reward',
        body: 'For a pure bluff with no showdown equity, required folds = bet ÷ (bet + pot before the bet). Betting 10 into 20 risks 10 to win 20, so it needs folds more than 10 ÷ 30, or about 33%, before accounting for rake or future action.',
        bullets: [
          'Half-pot bluff: needs about 33% folds.',
          'Two-thirds-pot bluff: needs about 40% folds.',
          'Pot-sized bluff: needs 50% folds.',
        ],
        takeaway: 'Memorize the common thresholds, then verify that the opponent range can actually fold that often.',
      },
      {
        heading: 'Semi-bluff equity lowers the fold requirement',
        body: 'A draw can still win when called, so it needs fewer immediate folds than a pure bluff. The exact value depends on equity, realization, and future action. Use the pure-bluff percentage as a conservative ceiling, then confirm the draw has clean improvement paths.',
        example: {
          title: 'Example · two ways to win',
          detail: 'A♣ 5♣ on K♦ 8♣ 3♣ can win when a half-pot bet gets folds and can improve to the nut flush when called.',
          heroCards: [card(14, 'clubs'), card(5, 'clubs')],
          board: [card(13, 'diamonds'), card(8, 'clubs'), card(3, 'clubs')],
        },
        takeaway: 'Called equity helps only when the draw is clean and likely to realize its value.',
      },
      {
        heading: 'Math cannot invent fold targets',
        body: 'After finding the required fold percentage, name the better hands that actually fold. Blockers, range advantage, and opponent evidence determine whether the estimate is plausible. Against a call-heavy range, even a mathematically modest threshold may be unrealistic.',
        takeaway: 'A bluff calculation is complete only after the range supplies enough credible folds.',
      },
    ],
  },
];

export const advancedMathCheatSheet: CheatSheetDefinition = {
  id: 'sheet-advanced-math',
  title: 'Advanced decision math',
  description: 'Implied odds, dirty outs, and break-even bluff thresholds',
  groups: [
    {
      title: 'Future-value checks',
      rows: [
        { label: 'Implied odds', detail: 'Add only realistic future chips won after improving.' },
        { label: 'Reverse implied odds', detail: 'Discount improvements that can make an expensive second-best hand.' },
        { label: 'Effective stack', detail: 'Future value cannot exceed the smaller live stack.' },
      ],
    },
    {
      title: 'Pure-bluff folds needed',
      rows: [
        { label: 'Half pot', detail: 'Risk 0.5 pot to win 1 pot · about 33%' },
        { label: 'Two-thirds pot', detail: 'Risk 0.67 pot to win 1 pot · about 40%' },
        { label: 'Full pot', detail: 'Risk 1 pot to win 1 pot · 50%' },
      ],
    },
  ],
  note: 'Pure-bluff thresholds assume zero equity when called and no future action. Semi-bluffs need fewer folds, but only when their improvement equity is clean and realizable.',
};
