import type {
  CheatSheetDefinition,
  LearningActivityDefinition,
  LessonDefinition,
  TrainerDefinition,
} from './types';
import type { Card, Rank, Suit } from '../poker/types';
import { scenarioTrainer } from './scenarios';

export { scenarioTrainer } from './scenarios';

const card = (rank: Rank, suit: Suit): Card => ({ rank, suit });

export const lessons: LessonDefinition[] = [
  {
    id: 'lesson-hand-rankings',
    type: 'lesson',
    title: 'Build your best five-card hand',
    description: 'Hand rankings, kickers, and ties',
    estimatedMinutes: 4,
    sections: [
      {
        heading: 'Use the best five cards',
        body: 'Texas Hold’em gives you seven available cards: two hole cards and five community cards. Your result is always the strongest five-card combination. You may use both, one, or neither hole card.',
        takeaway: 'Do not add a sixth card to break a tie. Only the best five cards count.',
        example: {
          title: 'Example · royal flush',
          detail: 'A♠ K♠ plus Q♠ J♠ 10♠ makes the five-card A-high straight flush. The paired deuces do not matter.',
          heroCards: [card(14, 'spades'), card(13, 'spades')],
          board: [card(12, 'spades'), card(11, 'spades'), card(10, 'spades'), card(2, 'diamonds'), card(2, 'clubs')],
        },
      },
      {
        heading: 'Rank hands from rarest to most common',
        body: 'Straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, one pair, then high card.',
        bullets: [
          'A flush beats a straight.',
          'A full house beats a flush.',
          'An ace can be high in A-K-Q-J-10 or low in A-2-3-4-5, but cannot wrap around.',
        ],
      },
      {
        heading: 'Break ties in order',
        body: 'Compare the part that makes the hand first, then compare remaining kickers from highest to lowest. If the same five cards play for both players, the pot is split.',
        takeaway: 'With one pair, compare the pair, then the highest kicker, then the next two kickers.',
      },
    ],
  },
  {
    id: 'lesson-position-blinds',
    type: 'lesson',
    title: 'Understand position and blinds',
    description: 'Who acts first—and why it matters',
    estimatedMinutes: 4,
    sections: [
      {
        heading: 'Blinds create action',
        body: 'The small blind and big blind are forced bets posted before the cards are dealt. In heads-up play, the dealer button posts the small blind and acts first before the flop.',
        example: {
          title: 'Example · button hand',
          detail: 'With A♠ J♠ on the heads-up button, you post the small blind and act first preflop—but last on every later street.',
          heroCards: [card(14, 'spades'), card(11, 'spades')],
        },
      },
      {
        heading: 'The order flips after the flop',
        body: 'After the flop, the big blind acts first and the button acts last. Acting last is valuable because you see the other player’s choice before making yours.',
        takeaway: 'Position is information. You can usually play more hands on the button than out of position.',
      },
      {
        heading: 'The button moves each hand',
        body: 'The dealer button alternates in heads-up play, so both players take turns posting each blind and receiving the positional advantage.',
      },
    ],
  },
  {
    id: 'lesson-actions-order',
    type: 'lesson',
    title: 'Know every legal action',
    description: 'Check, bet, call, raise, and fold',
    estimatedMinutes: 5,
    sections: [
      {
        heading: 'When nobody has bet',
        body: 'You may check and pass the action without adding chips, or bet and set a price. A round ends when all active players have matched the same wager and no action remains.',
      },
      {
        heading: 'When facing a bet',
        body: 'You may fold, call the amount needed to match the bet, or raise to a larger total. A normal no-limit raise must be at least as large as the previous full bet or raise.',
        bullets: [
          'Fold gives up your claim to the pot.',
          'Call matches the current price.',
          'Raise increases the price for the opponent.',
        ],
        example: {
          title: 'Example · pair plus draw',
          detail: 'Q♥ J♥ on J♠ 8♥ 2♥ has top pair and a flush draw. Facing a bet, compare fold, call, and a legal raise—not just the cards.',
          heroCards: [card(12, 'hearts'), card(11, 'hearts')],
          board: [card(11, 'spades'), card(8, 'hearts'), card(2, 'hearts')],
        },
      },
      {
        heading: 'All-in is a chip limit, not a special hand',
        body: 'A player may wager every remaining chip. A short all-in can be less than a full raise and may not reopen raising. RiverMind calculates the legal bounds for you.',
        takeaway: 'Before choosing an action, identify the call price, the pot, and who acts later.',
      },
    ],
  },
  {
    id: 'lesson-starting-hands',
    type: 'lesson',
    title: 'Choose stronger starting hands',
    description: 'Pairs, high cards, suitedness, and position',
    estimatedMinutes: 5,
    sections: [
      {
        heading: 'Start with card quality',
        body: 'Pairs can make strong one-pair hands or hidden sets. High cards make stronger top pairs. Suited and connected cards gain ways to make flushes and straights, but those bonuses are smaller than many beginners expect.',
        example: {
          title: 'Example · premium structure',
          detail: 'A♠ K♠ combines two high cards, suitedness, and straight connectivity. Each feature adds useful ways to continue after the flop.',
          heroCards: [card(14, 'spades'), card(13, 'spades')],
        },
      },
      {
        heading: 'Position changes the threshold',
        body: 'On the heads-up button you act last after the flop, so you can profitably enter with more hands. From the big blind you already have chips invested, but you will act first postflop.',
        takeaway: 'A hand can be a raise on the button and a fold against heavy pressure out of position.',
      },
      {
        heading: 'Raise with a purpose',
        body: 'A preflop raise can win the blinds, build value with stronger hands, and avoid revealing your exact strength. Use the starter chart as a learning baseline, then adjust to opponent behavior.',
      },
    ],
  },
  {
    id: 'lesson-outs-equity-odds',
    type: 'lesson',
    title: 'Connect outs, equity, and pot odds',
    description: 'Estimate whether a call has the right price',
    estimatedMinutes: 6,
    sections: [
      {
        heading: 'Count clean outs',
        body: 'An out is an unseen card that is likely to improve you to the winning hand. Do not count a card as clean when it can also complete a stronger hand for the opponent.',
        example: {
          title: 'Example · nut-flush draw',
          detail: 'A♥ 5♥ on K♥ 8♣ 2♥ has four visible hearts, leaving nine unseen hearts that complete an ace-high flush.',
          heroCards: [card(14, 'hearts'), card(5, 'hearts')],
          board: [card(13, 'hearts'), card(8, 'clubs'), card(2, 'hearts')],
        },
      },
      {
        heading: 'Make a fast estimate',
        body: 'With one card to come, multiply clean outs by about 2. From the flop with two cards to come, multiply by about 4. The rule of 4 becomes less accurate with many outs, so use it as table math—not an exact calculator.',
        bullets: [
          '9 flush outs: about 19% on the next card.',
          '9 flush outs: about 35% by the river.',
          '8 straight outs: about 17% on the next card.',
        ],
      },
      {
        heading: 'Compare equity with the price',
        body: 'Required call equity equals call amount divided by the final pot after you call. Calling 50 into a pot that becomes 200 requires 25% equity before considering future action.',
        takeaway: 'Call when your realistic equity exceeds the break-even percentage by enough to cover uncertainty and future decisions.',
      },
    ],
  },
  {
    id: 'lesson-value-bluffs',
    type: 'lesson',
    title: 'Bet for value or as a bluff',
    description: 'Give every bet a clear reason',
    estimatedMinutes: 5,
    sections: [
      {
        heading: 'Value bets get called by worse',
        body: 'A value bet works when enough weaker hands can call. The best size is not automatically the biggest one; choose a size those weaker hands can realistically continue against.',
        example: {
          title: 'Example · value candidate',
          detail: 'A♠ Q♦ on Q♣ 7♥ 3♠ can be called by weaker queens, sevens, pairs, and some draws. Name those hands before choosing a size.',
          heroCards: [card(14, 'spades'), card(12, 'diamonds')],
          board: [card(12, 'clubs'), card(7, 'hearts'), card(3, 'spades')],
        },
      },
      {
        heading: 'Bluffs make better hands fold',
        body: 'A bluff needs fold equity. Prefer candidates that block strong calls, unblock folds, and have little showdown value. Bluff less against players who call too often.',
        example: {
          title: 'Example · missed draw',
          detail: 'Q♣ 5♣ misses on K♠ 9♣ 4♣ 2♦ 2♥. Missing alone is not enough—this becomes a bluff only when enough better hands can fold.',
          heroCards: [card(12, 'clubs'), card(5, 'clubs')],
          board: [card(13, 'spades'), card(9, 'clubs'), card(4, 'clubs'), card(2, 'diamonds'), card(2, 'hearts')],
        },
      },
      {
        heading: 'Many good checks are neither',
        body: 'Checking can protect a medium-strength hand, realize drawing equity, or avoid folding out everything worse. Aggression is useful only when its purpose fits the range and board.',
        takeaway: 'Before betting, name the worse hands that call or the better hands that fold.',
      },
    ],
  },
];

export const percentageTrainer: TrainerDefinition = {
  id: 'trainer-percentages',
  type: 'percentage_drill',
  title: 'Percentage trainer',
  description: 'Estimate outs, hit chances, and call prices',
  estimatedMinutes: 4,
  questions: [
    {
      id: 'nine-outs-next-card',
      prompt: 'You have 9 clean outs on the flop. About how often do you hit on the turn?',
      context: 'Use the quick one-card estimate or calculate 9 ÷ 47.',
      heroCards: [card(14, 'hearts'), card(5, 'hearts')],
      board: [card(13, 'hearts'), card(8, 'clubs'), card(2, 'hearts')],
      choices: [
        { id: 'a', label: '9%', feedback: 'That treats each out as roughly 1%. With one card coming, multiply clean outs by about 2.' },
        { id: 'b', label: '19%', feedback: 'Correct: 9 ÷ 47 is about 19%, and the rule of 2 gives a quick 18% estimate.' },
        { id: 'c', label: '36%', feedback: 'That is the rough chance by the river when two cards remain, not the chance on the next card alone.' },
      ],
      correctChoiceId: 'b',
      explanation: '9 of the 47 unseen cards are outs: 9 ÷ 47 ≈ 19%. The rule of 2 gives a fast 18% estimate.',
    },
    {
      id: 'nine-outs-two-cards',
      prompt: 'With 9 clean outs on the flop, about how often do you hit by the river?',
      context: 'Assume you will see both remaining community cards.',
      heroCards: [card(14, 'diamonds'), card(4, 'diamonds')],
      board: [card(12, 'diamonds'), card(8, 'spades'), card(2, 'diamonds')],
      choices: [
        { id: 'a', label: '19%', feedback: 'That is approximately the chance of hitting on only the turn.' },
        { id: 'b', label: '27%', feedback: 'This is too low for two chances to hit one of nine clean outs.' },
        { id: 'c', label: '35%', feedback: 'Correct: the exact two-card chance is about 35%; the rule of 4 estimates 36%.' },
      ],
      correctChoiceId: 'c',
      explanation: 'The exact chance is about 35%. The rule of 4 gives 36%, which is close enough for a quick decision.',
    },
    {
      id: 'half-pot-call',
      prompt: 'The pot is 100. Villain bets 50. What equity does a call need to break even?',
      context: 'You call 50 and the final pot becomes 200.',
      choices: [
        { id: 'a', label: '20%', feedback: 'This understates the price because your 50-chip call must be included in the final pot.' },
        { id: 'b', label: '25%', feedback: 'Correct: calling 50 creates a final pot of 200, and 50 ÷ 200 is 25%.' },
        { id: 'c', label: '33%', feedback: 'That is the call price against a pot-sized bet, not a half-pot bet.' },
      ],
      correctChoiceId: 'b',
      explanation: 'Call amount ÷ final pot is 50 ÷ 200 = 25%.',
    },
    {
      id: 'three-quarter-pot-call',
      prompt: 'The pot is 120. Villain bets 90. What equity does a call need?',
      context: 'After calling 90, the final pot will be 300.',
      choices: [
        { id: 'a', label: '25%', feedback: 'That is the familiar price against a half-pot bet; this wager is larger.' },
        { id: 'b', label: '30%', feedback: 'Correct: after calling, the final pot is 300, so 90 ÷ 300 is 30%.' },
        { id: 'c', label: '43%', feedback: 'That compares the bet with the pot before your call rather than the final pot you can win.' },
      ],
      correctChoiceId: 'b',
      explanation: '90 ÷ 300 = 30%. Do not divide only by the pot before your call.',
    },
    {
      id: 'eight-outs-river',
      prompt: 'You have 8 clean outs on the turn. About how often do you hit on the river?',
      context: 'There is one card to come and 46 unseen cards.',
      heroCards: [card(9, 'clubs'), card(8, 'diamonds')],
      board: [card(7, 'spades'), card(6, 'hearts'), card(2, 'clubs'), card(13, 'diamonds')],
      choices: [
        { id: 'a', label: '9%', feedback: 'That is closer to four outs with one card to come.' },
        { id: 'b', label: '17%', feedback: 'Correct: 8 ÷ 46 is about 17%, and the rule of 2 gives a fast 16% estimate.' },
        { id: 'c', label: '32%', feedback: 'That roughly applies the rule of 4, but only one river card remains.' },
      ],
      correctChoiceId: 'b',
      explanation: '8 ÷ 46 ≈ 17%. Multiplying the outs by 2 gives a fast 16% estimate.',
    },
  ],
};

export const handQuiz: TrainerDefinition = {
  id: 'quiz-core-decisions',
  type: 'hand_quiz',
  title: 'Hand quiz',
  description: 'Choose an action, then learn why',
  estimatedMinutes: 4,
  questions: [
    {
      id: 'button-ace-jack',
      prompt: 'Heads-up, 100 BB deep. You are on the button with A♠ J♦ and action is on you preflop.',
      context: 'Choose a practical beginner baseline.',
      heroCards: [card(14, 'spades'), card(11, 'diamonds')],
      choices: [
        { id: 'a', label: 'Fold', feedback: 'A-J is much too strong to release against one random big-blind hand.' },
        { id: 'b', label: 'Call only', feedback: 'Some advanced strategies mix limps, but calling only gives up a clear, simple value raise.' },
        { id: 'c', label: 'Raise', feedback: 'Correct: raise for value and keep the positional advantage after the flop.' },
      ],
      correctChoiceId: 'c',
      explanation: 'A-J is well ahead of a random big-blind hand. Raising builds value and uses your positional advantage. Strong strategies can include some limps, but folding is far too tight.',
    },
    {
      id: 'river-bluff-catcher',
      prompt: 'On the river, the pot is 80 and Villain bets 80. Your bluff catcher wins about 25% of the time.',
      context: 'There is no future action after this call.',
      heroCards: [card(13, 'clubs'), card(11, 'clubs')],
      board: [card(13, 'diamonds'), card(8, 'spades'), card(6, 'hearts'), card(3, 'clubs'), card(2, 'diamonds')],
      choices: [
        { id: 'a', label: 'Fold', feedback: 'Correct: your 25% win estimate is below the 33% break-even price.' },
        { id: 'b', label: 'Call', feedback: 'Calling loses in the long run when the stated win estimate is below the required equity.' },
        { id: 'c', label: 'Raise', feedback: 'A bluff raise needs strong fold evidence; the price alone does not provide it.' },
      ],
      correctChoiceId: 'a',
      explanation: 'A pot-sized bet gives you 33% required equity: 80 ÷ 240. An honest 25% estimate is below the break-even point, so fold.',
    },
    {
      id: 'thin-river-value',
      prompt: 'Villain checks the river. You have top pair with a strong kicker and several weaker pairs can call.',
      context: 'Very few missed draws remain in Villain’s range.',
      heroCards: [card(14, 'spades'), card(12, 'diamonds')],
      board: [card(12, 'clubs'), card(7, 'hearts'), card(3, 'spades'), card(2, 'clubs'), card(9, 'diamonds')],
      choices: [
        { id: 'a', label: 'Check automatically', feedback: 'Checking is safe, but it misses value when several weaker pairs can call.' },
        { id: 'b', label: 'Bet small for value', feedback: 'Correct: choose a size that keeps the identified weaker one-pair hands in.' },
        { id: 'c', label: 'Move all-in', feedback: 'The oversized bet is likely to fold the worse hands you want to call.' },
      ],
      correctChoiceId: 'b',
      explanation: 'A smaller value bet targets the weaker one-pair hands you identified. Checking can mix in some spots, but automatically missing clear calls from worse leaves value behind.',
    },
    {
      id: 'poor-bluff-candidate',
      prompt: 'Your low flush draw misses the river. Villain is call-heavy, and your cards do not block strong one-pair calls.',
      context: 'You have almost no showdown value, but little evidence the opponent will fold.',
      heroCards: [card(12, 'clubs'), card(5, 'clubs')],
      board: [card(13, 'spades'), card(9, 'clubs'), card(4, 'clubs'), card(2, 'diamonds'), card(2, 'hearts')],
      choices: [
        { id: 'a', label: 'Check', feedback: 'Correct: give up when the opponent calls too often and your hand has poor blockers.' },
        { id: 'b', label: 'Bet because you missed', feedback: 'A missed draw is not automatically a bluff; first identify enough better hands that can fold.' },
        { id: 'c', label: 'Always overbet', feedback: 'Risking more chips does not fix weak fold equity and poor blocker effects.' },
      ],
      correctChoiceId: 'a',
      explanation: 'A missed draw is not automatically a bluff. Against a call-heavy range, without useful blockers, fold equity is too low. Save the bluff for a better candidate.',
    },
  ],
};

export const trainers: TrainerDefinition[] = [percentageTrainer, handQuiz];
export const learningActivities: LearningActivityDefinition[] = [...lessons, ...trainers, scenarioTrainer];

export const cheatSheets: CheatSheetDefinition[] = [
  {
    id: 'sheet-hand-rankings',
    title: 'Hand rankings',
    description: 'Strongest to weakest, with tie reminders',
    groups: [
      {
        title: 'Strongest to weakest',
        rows: [
          { label: 'Straight flush', detail: 'Five consecutive cards of one suit', probability: '≈ 0.031%', example: '9♥ 8♥ 7♥ 6♥ 5♥' },
          { label: 'Four of a kind', detail: 'Four cards of the same rank', probability: '≈ 0.17%', example: 'K♠ K♥ K♦ K♣ 3♠' },
          { label: 'Full house', detail: 'Three of a kind plus a pair', probability: '≈ 2.60%', example: 'Q♠ Q♥ Q♦ 8♣ 8♦' },
          { label: 'Flush', detail: 'Five cards of one suit, not consecutive', probability: '≈ 3.03%', example: 'A♣ J♣ 8♣ 5♣ 2♣' },
          { label: 'Straight', detail: 'Five consecutive ranks in mixed suits', probability: '≈ 4.62%', example: '10♠ 9♥ 8♦ 7♣ 6♠' },
          { label: 'Three of a kind', detail: 'Three cards of one rank', probability: '≈ 4.83%', example: '7♠ 7♥ 7♦ A♣ J♠' },
          { label: 'Two pair', detail: 'Two different pairs', probability: '≈ 23.5%', example: 'A♠ A♦ 9♣ 9♥ K♠' },
          { label: 'One pair', detail: 'Two cards of one rank', probability: '≈ 43.8%', example: 'J♠ J♦ A♣ 8♥ 4♠' },
          { label: 'High card', detail: 'No made combination above', probability: '≈ 17.4%', example: 'A♠ J♦ 9♣ 6♥ 3♠' },
        ],
      },
      {
        title: 'Tie breakers',
        rows: [
          { label: 'Same category', detail: 'Compare the made part first, then kickers' },
          { label: 'Board plays', detail: 'If both use the same five cards, split the pot' },
        ],
      },
    ],
    note: 'Percentages are approximate final categories across all random seven-card Hold’em hands. They are not your chance to make the hand from a particular starting hand, and they are not your chance to win.',
  },
  {
    id: 'sheet-position',
    title: 'Heads-up positions',
    description: 'Blinds and action order',
    groups: [
      {
        title: 'Before the flop',
        rows: [
          { label: 'Button / small blind', detail: 'Posts the small blind and acts first' },
          { label: 'Big blind', detail: 'Posts the big blind and acts second' },
        ],
      },
      {
        title: 'After the flop',
        rows: [
          { label: 'Big blind', detail: 'Acts first on flop, turn, and river' },
          { label: 'Button', detail: 'Acts last and has the information advantage' },
        ],
      },
    ],
  },
  {
    id: 'sheet-percentages',
    title: 'Common percentages',
    description: 'Fast approximations for live decisions',
    groups: [
      {
        title: 'Clean outs',
        rows: [
          { label: '4 outs', detail: '≈ 9% next card · 17% by river' },
          { label: '8 outs', detail: '≈ 17% next card · 32% by river' },
          { label: '9 outs', detail: '≈ 19% next card · 35% by river' },
          { label: '15 outs', detail: '≈ 32% next card · 54% by river' },
        ],
      },
      {
        title: 'Facing a bet',
        rows: [
          { label: 'Half pot', detail: '25% required call equity' },
          { label: 'Two-thirds pot', detail: '≈ 29% required call equity' },
          { label: 'Three-quarters pot', detail: '30% required call equity' },
          { label: 'Full pot', detail: '33% required call equity' },
        ],
      },
    ],
    note: 'These assume clean outs and no future betting. Discount outs that can make a stronger hand for the opponent.',
  },
  {
    id: 'sheet-preflop',
    title: 'Preflop range explorer',
    description: 'Explore all 169 starting hands by table size, position, stack depth, and action',
    groups: [
      {
        title: 'Read the chart',
        rows: [
          { label: 'Pairs', detail: 'The diagonal from AA through 22', example: 'A♠ A♥' },
          { label: 'Suited', detail: 'Above the diagonal; both cards share a suit', example: 'A♥ 5♥' },
          { label: 'Offsuit', detail: 'Below the diagonal; the cards have different suits', example: 'K♠ T♦' },
        ],
      },
      {
        title: 'Adjust before acting',
        rows: [
          { label: 'Earlier seat = tighter', detail: 'More players can wake up with a strong hand behind you.' },
          { label: 'Big blind defends wider', detail: 'You already invested 1 BB, so a small raise offers a better price.' },
          { label: 'Deep stacks favor suited hands', detail: 'Connected suited hands gain value when more chips can be won after the flop.' },
        ],
      },
    ],
    note: 'This is an explainable beginner baseline, not a solver chart. Opponent tendencies and raise size still matter.',
  },
];

export function findLearningActivity(id: string): LearningActivityDefinition | undefined {
  return learningActivities.find((activity) => activity.id === id);
}
