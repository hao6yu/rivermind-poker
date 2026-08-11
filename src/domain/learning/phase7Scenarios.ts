import type { Card, Rank, Suit } from '../poker/types';
import type {
  PracticePackId,
  ScenarioChoice,
  ScenarioSpot,
} from './types';

export type Phase7ScenarioFactory = (random: () => number, variant: number) => ScenarioSpot;

interface ScenarioState {
  board?: Array<[Rank, number]>;
  hand: string;
  hero: Array<[Rank, number]>;
}

interface ScenarioTemplate {
  bestChoiceId: string;
  calculation?: ScenarioSpot['calculation'];
  choices: ScenarioChoice[];
  effectiveStackBb: number[];
  focus: string;
  id: string;
  lessonId: string;
  opponentAction: string;
  opponentPosition: string;
  pack: Extract<PracticePackId, 'tournament-bubble' | 'opponent-adjustments' | 'advanced-math'>;
  position: string;
  potBb: number;
  prompt: string;
  reasoning: string;
  states: ScenarioState[];
  street: ScenarioSpot['street'];
  takeaway: string;
}

const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];

function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)]!;
}

function shuffle<T>(random: () => number, values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

function cardsFromPatterns(
  random: () => number,
  ...patterns: Array<Array<[Rank, number]>>
): Card[][] {
  const suitOrder = shuffle(random, suits);
  return patterns.map((pattern) => pattern.map(([rank, suitIndex]) => ({
    rank,
    suit: suitOrder[suitIndex]!,
  })));
}

function withHand(value: string, hand: string): string {
  return value.replaceAll('{hand}', hand);
}

function scenarioFactory(template: ScenarioTemplate): Phase7ScenarioFactory {
  return (random, variant) => {
    const state = pick(random, template.states);
    const [heroCards, board] = cardsFromPatterns(random, state.hero, state.board ?? []);
    return {
      id: `${template.id}-${variant}`,
      lessonId: template.lessonId,
      difficulty: 'intermediate',
      focus: template.focus,
      street: template.street,
      position: template.position,
      opponentPosition: template.opponentPosition,
      effectiveStackBb: pick(random, template.effectiveStackBb),
      potBb: template.potBb,
      heroCards: heroCards!,
      board: board!,
      opponentAction: withHand(template.opponentAction, state.hand),
      practicePacks: [template.pack],
      prompt: withHand(template.prompt, state.hand),
      choices: shuffle(random, template.choices.map((choice) => ({
        ...choice,
        feedback: withHand(choice.feedback, state.hand),
      }))),
      bestChoiceId: template.bestChoiceId,
      reasoning: withHand(template.reasoning, state.hand),
      takeaway: template.takeaway,
      calculation: template.calculation,
    };
  };
}

const bubbleTemplates: ScenarioTemplate[] = [
  {
    id: 'bubble-medium-stack-calloff', lessonId: 'lesson-tournament-risk-premium', focus: 'Covered-stack call discipline', street: 'preflop',
    position: 'Big blind · three players', opponentPosition: 'Button · chip leader', effectiveStackBb: [18, 20, 22], potBb: 23.5,
    states: [
      { hand: 'A-10 offsuit', hero: [[14, 0], [10, 1]] },
      { hand: 'K-Q offsuit', hero: [[13, 0], [12, 1]] },
      { hand: 'pocket sevens', hero: [[7, 0], [7, 1]] },
    ],
    opponentAction: 'Two places advance. The 42-big-blind leader shoves from the button, you are second in chips, and a 6-big-blind stack remains.',
    prompt: 'How should bubble risk change the marginal call with {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'best', feedback: 'Preserving the second stack while a six-big-blind player remains outweighs a thin chip-equity call.' },
      { id: 'call', label: 'Call all-in', grade: 'mistake', mistakeCategory: 'commitment', feedback: '{hand} may be close in chip terms, but calling has no fold equity and losing ends the event before the shortest stack.' },
    ],
    bestChoiceId: 'fold',
    reasoning: 'The leader covers you and the shortest stack is under immediate blind pressure. {hand} is not far enough ahead of the shoving range to justify risking elimination for a marginal chip gain.',
    takeaway: 'Covered middle stacks should tighten close all-in calls while a much shorter stack remains.', pack: 'tournament-bubble',
  },
  {
    id: 'bubble-leader-pressure', lessonId: 'lesson-tournament-stack-coverage', focus: 'Chip-leader pressure', street: 'preflop',
    position: 'Button · three players', opponentPosition: 'Two covered blinds', effectiveStackBb: [32, 36, 40], potBb: 1.5,
    states: [
      { hand: 'K-9 suited', hero: [[13, 0], [9, 0]] },
      { hand: 'Q-10 suited', hero: [[12, 0], [10, 0]] },
      { hand: 'A-7 offsuit', hero: [[14, 0], [7, 1]] },
    ],
    opponentAction: 'Two places advance. You cover both 14-big-blind blinds, and action folds to you.',
    prompt: 'Which first-in plan uses the survival pressure without risking the full lead?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'mistake', mistakeCategory: 'position', feedback: '{hand} has enough card quality and button pressure to open against two constrained ranges.' },
      { id: 'raise', label: 'Raise to 2.1 big blinds', grade: 'best', feedback: 'A compact open pressures both blinds while preserving the ability to respond to an all-in.' },
      { id: 'shove', label: 'Move all-in', grade: 'mistake', mistakeCategory: 'sizing', feedback: 'Risking more than thirty big blinds is unnecessary when a small open captures most of the bubble pressure.' },
    ],
    bestChoiceId: 'raise',
    reasoning: 'Both blinds face elimination if they continue, so {hand} can open efficiently. The advantage supports more frequent pressure, not an extreme all-in that risks the chip lead.',
    takeaway: 'Leaders convert coverage into frequent small pressure, not reckless stack-offs.', pack: 'tournament-bubble',
  },
  {
    id: 'bubble-short-stack-action', lessonId: 'lesson-tournament-stack-coverage', focus: 'Shortest-stack initiative', street: 'preflop',
    position: 'Button · three players', opponentPosition: 'Two larger blinds', effectiveStackBb: [7, 8, 9], potBb: 1.5,
    states: [
      { hand: 'A-6 suited', hero: [[14, 0], [6, 0]] },
      { hand: 'K-10 suited', hero: [[13, 0], [10, 0]] },
      { hand: 'pocket fives', hero: [[5, 0], [5, 1]] },
    ],
    opponentAction: 'Two places advance. You are the shortest stack, action folds to you, and both blinds can eliminate you.',
    prompt: 'Should bubble fear stop the first-in opportunity with {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'mistake', mistakeCategory: 'stack-depth', feedback: 'Waiting gives the blinds a larger share of the remaining stack and removes this hand’s first-in fold equity.' },
      { id: 'shove', label: 'Move all-in', grade: 'best', feedback: '{hand} combines useful equity with the chance to win the blinds immediately while acting first.' },
    ],
    bestChoiceId: 'shove',
    reasoning: 'As the shortest stack, you have less survival value to protect and cannot depend on another player busting first. {hand} is strong enough to use late-position fold equity now.',
    takeaway: 'Bubble pressure can tighten calls while leaving good short-stack first-in shoves intact.', pack: 'tournament-bubble',
  },
  {
    id: 'bubble-premium-call', lessonId: 'lesson-tournament-bubble-decisions', focus: 'Premium hand under pressure', street: 'preflop',
    position: 'Big blind · three players', opponentPosition: 'Small blind · chip leader', effectiveStackBb: [14, 16, 18], potBb: 18.5,
    states: [
      { hand: 'pocket queens', hero: [[12, 0], [12, 1]] },
      { hand: 'pocket kings', hero: [[13, 0], [13, 1]] },
      { hand: 'A-K suited', hero: [[14, 0], [13, 0]] },
    ],
    opponentAction: 'Two places advance. The leader shoves from the small blind and a 7-big-blind stack remains.',
    prompt: 'Does the risk premium make {hand} a fold?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'mistake', mistakeCategory: 'range', feedback: 'Bubble pressure changes marginal calls, but {hand} is too far ahead of a wide small-blind shove to release.' },
      { id: 'call', label: 'Call all-in', grade: 'best', feedback: 'The premium hand clears the higher tournament threshold and can call despite being covered.' },
    ],
    bestChoiceId: 'call',
    reasoning: 'The risk premium is real, but it is not infinite. {hand} retains a decisive equity advantage against a leader who can pressure widely from the small blind.',
    takeaway: 'Use ICM to move boundary decisions; do not fold hands far above the adjusted threshold.', pack: 'tournament-bubble',
  },
  {
    id: 'bubble-covering-call', lessonId: 'lesson-tournament-stack-coverage', focus: 'Covering-stack call', street: 'preflop',
    position: 'Big blind · three players', opponentPosition: 'Button · shortest stack', effectiveStackBb: [7, 8, 9], potBb: 10,
    states: [
      { hand: 'A-8 suited', hero: [[14, 0], [8, 0]] },
      { hand: 'pocket eights', hero: [[8, 0], [8, 1]] },
      { hand: 'K-Q suited', hero: [[13, 0], [12, 0]] },
    ],
    opponentAction: 'Two places advance. The shortest stack shoves the button, the small blind folds, and you remain chip leader after losing.',
    prompt: 'How does covering the shove affect {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'reasonable', feedback: 'Folding preserves the lead, but gives up a profitable price against a wide shortest-stack shove.' },
      { id: 'call', label: 'Call all-in', grade: 'best', feedback: 'You cover the short stack, keep chips after a loss, and hold strong equity against the late-position range.' },
    ],
    bestChoiceId: 'call',
    reasoning: 'The shortest stack can shove widely and cannot eliminate you. {hand} has enough direct equity, while your survival cost is lower than that of a covered middle stack.',
    takeaway: 'Coverage can support a wider call when the hand still beats enough of the shoving range.', pack: 'tournament-bubble',
  },
  {
    id: 'bubble-ladder-discipline', lessonId: 'lesson-tournament-bubble-decisions', focus: 'Ladder-pressure discipline', street: 'preflop',
    position: 'Small blind · three players', opponentPosition: 'Big blind · chip leader', effectiveStackBb: [17, 19, 21], potBb: 1.5,
    states: [
      { hand: 'Q-8 offsuit', hero: [[12, 0], [8, 1]] },
      { hand: 'K-6 offsuit', hero: [[13, 0], [6, 1]] },
      { hand: 'J-8 suited', hero: [[11, 0], [8, 0]] },
    ],
    opponentAction: 'Two places advance. A 4-big-blind button folded, and the 45-big-blind leader waits in the big blind.',
    prompt: 'What is the cleanest baseline with a marginal {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'best', feedback: 'The hand is marginal, the leader can apply maximum pressure, and a four-big-blind stack remains.' },
      { id: 'raise', label: 'Raise to 2.2 big blinds', grade: 'mistake', mistakeCategory: 'commitment', feedback: 'The open invites a re-shove from the covering leader in a spot where your range cannot defend comfortably.' },
      { id: 'shove', label: 'Move all-in', grade: 'mistake', mistakeCategory: 'range', feedback: 'Risking the entire medium stack through the leader is unnecessary while the shortest stack is nearly blinded out.' },
    ],
    bestChoiceId: 'fold',
    reasoning: '{hand} sits near the normal opening boundary, but this specific stack configuration adds a meaningful survival cost. The leader covers you and the four-big-blind player may be forced all-in soon.',
    takeaway: 'Name the shorter stack and the covering stack before making a bubble-tight fold.', pack: 'tournament-bubble',
  },
];

const opponentTemplates: ScenarioTemplate[] = [
  {
    id: 'read-small-sample', lessonId: 'lesson-opponents-evidence', focus: 'Small-sample restraint', street: 'river',
    position: 'Button', opponentPosition: 'Big blind', effectiveStackBb: [70, 85, 100], potBb: 24,
    states: [
      { hand: 'ace-high showdown value', hero: [[14, 0], [9, 1]], board: [[13, 2], [8, 1], [5, 3], [3, 0], [2, 2]] },
      { hand: 'a missed low flush draw', hero: [[12, 0], [5, 0]], board: [[13, 1], [9, 0], [4, 0], [2, 2], [2, 3]] },
      { hand: 'bottom pair', hero: [[8, 0], [7, 1]], board: [[14, 2], [13, 1], [8, 3], [4, 0], [2, 2]] },
    ],
    opponentAction: 'The opponent checks. In only two observed hands, they called one river bet and folded once.',
    prompt: 'Should the tiny sample create an extreme exploit with {hand}?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'best', feedback: 'The hand lacks a clear value target or supported bluff, and two observations do not justify an extreme adjustment.' },
      { id: 'large', label: 'Bet 24 big blinds', grade: 'mistake', mistakeCategory: 'range', feedback: 'One call is not evidence of a stable tendency, and {hand} has no clear better-hand fold target.' },
    ],
    bestChoiceId: 'check',
    reasoning: 'The sample contains opposite outcomes and no repeated comparable decision. Keep the normal range-and-purpose baseline with {hand} instead of inventing a read.',
    takeaway: 'Two hands are a clue, not a license for a large exploit.', pack: 'opponent-adjustments',
  },
  {
    id: 'read-sticky-thin-value', lessonId: 'lesson-opponents-callers-folders', focus: 'Thin value against callers', street: 'river',
    position: 'Button', opponentPosition: 'Big blind · frequent caller', effectiveStackBb: [70, 85, 100], potBb: 20,
    states: [
      { hand: 'top pair, medium kicker', hero: [[13, 0], [10, 1]], board: [[13, 2], [8, 1], [4, 3], [3, 0], [2, 2]] },
      { hand: 'second pair, top kicker', hero: [[14, 0], [10, 1]], board: [[13, 2], [10, 3], [6, 1], [4, 0], [2, 2]] },
      { hand: 'an overpair', hero: [[11, 0], [11, 1]], board: [[9, 2], [7, 1], [4, 3], [3, 0], [2, 2]] },
    ],
    opponentAction: 'Across 16 observed hands, this opponent called six of eight comparable small and medium river bets, then checks to you.',
    prompt: 'Which adjustment extracts value from {hand} without over-isolating against better hands?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'reasonable', feedback: 'Checking protects the result, but misses evidence-supported value from a call-heavy weaker range.' },
      { id: 'small', label: 'Bet 7 big blinds', grade: 'best', feedback: 'A modest size gives weaker pairs a realistic call and uses the repeated calling evidence.' },
      { id: 'all-in', label: 'Move all-in', grade: 'mistake', mistakeCategory: 'sizing', feedback: 'The extreme size can still fold the weak hands you target and concentrates action around stronger hands.' },
    ],
    bestChoiceId: 'small',
    reasoning: 'The sample is established and directly relevant to river calls. {hand} has identifiable weaker targets, so a modest thin-value bet is a measured exploit.',
    takeaway: 'Against repeated callers, widen thin value before reaching for extreme sizes.', pack: 'opponent-adjustments',
  },
  {
    id: 'read-sticky-bluff-restraint', lessonId: 'lesson-opponents-callers-folders', focus: 'Bluff restraint against callers', street: 'river',
    position: 'Button', opponentPosition: 'Big blind · frequent caller', effectiveStackBb: [70, 85, 100], potBb: 22,
    states: [
      { hand: 'a missed low flush draw', hero: [[10, 0], [5, 0]], board: [[13, 1], [9, 0], [3, 0], [2, 2], [2, 3]] },
      { hand: 'missed low straight cards', hero: [[7, 0], [6, 1]], board: [[14, 2], [13, 1], [9, 3], [4, 0], [2, 2]] },
      { hand: 'queen-high with poor blockers', hero: [[12, 0], [8, 1]], board: [[13, 2], [10, 1], [5, 3], [3, 0], [2, 2]] },
    ],
    opponentAction: 'Across 18 hands, this opponent folded only twice in nine comparable river decisions and now checks.',
    prompt: 'Does {hand} have enough fold evidence to bluff?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'best', feedback: 'The hand has poor blockers and the established calling sample makes the required folds unlikely.' },
      { id: 'large', label: 'Bet 18 big blinds', grade: 'mistake', mistakeCategory: 'range', feedback: 'Risking more does not repair weak blockers or an opponent range that repeatedly continues.' },
    ],
    bestChoiceId: 'check',
    reasoning: '{hand} has little showdown value, but that alone does not create a bluff. The opponent’s relevant sample and the poor blockers both point toward insufficient fold equity.',
    takeaway: 'A missed draw becomes a bluff only when better hands can credibly fold.', pack: 'opponent-adjustments',
  },
  {
    id: 'read-frequent-folder-pressure', lessonId: 'lesson-opponents-callers-folders', focus: 'Evidence-supported pressure', street: 'turn',
    position: 'Button', opponentPosition: 'Big blind · frequent folder', effectiveStackBb: [70, 85, 100], potBb: 18,
    states: [
      { hand: 'the nut-flush draw', hero: [[14, 0], [5, 0]], board: [[13, 1], [8, 0], [3, 0], [2, 2]] },
      { hand: 'an open-ended straight draw', hero: [[10, 0], [9, 1]], board: [[8, 2], [7, 3], [2, 0], [13, 1]] },
      { hand: 'two overcards and a flush draw', hero: [[13, 0], [12, 0]], board: [[9, 0], [6, 1], [2, 0], [3, 2]] },
    ],
    opponentAction: 'Across 14 hands, this opponent folded five of seven comparable single-raised pots. They call the flop, then check a neutral turn.',
    prompt: 'Which measured adjustment uses both equity and observed folds with {hand}?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'reasonable', feedback: 'Checking realizes draw equity, but gives up evidence-supported fold pressure.' },
      { id: 'bet', label: 'Bet 11 big blinds', grade: 'best', feedback: 'The controlled barrel combines clean improvement equity with a relevant history of folds.' },
      { id: 'all-in', label: 'Move all-in', grade: 'mistake', mistakeCategory: 'sizing', feedback: 'The sample supports more pressure, not risking the entire stack when a smaller bet can produce folds.' },
    ],
    bestChoiceId: 'bet',
    reasoning: '{hand} can improve when called, and the opponent has repeatedly folded in comparable pots. A controlled barrel changes one lever—frequency—without turning the read into an extreme overbet.',
    takeaway: 'Use reliable fold evidence to add selected pressure with equity or useful blockers.', pack: 'opponent-adjustments',
  },
  {
    id: 'read-patient-raise', lessonId: 'lesson-opponents-aggression-traps', focus: 'Respect rare aggression', street: 'river',
    position: 'Button', opponentPosition: 'Big blind · patient', effectiveStackBb: [65, 80, 100], potBb: 52,
    states: [
      { hand: 'top pair, top kicker', hero: [[14, 0], [13, 1]], board: [[14, 2], [9, 1], [5, 3], [4, 0], [2, 2]] },
      { hand: 'an overpair', hero: [[12, 0], [12, 1]], board: [[10, 2], [8, 1], [5, 3], [3, 0], [2, 2]] },
      { hand: 'top two pair on a paired river', hero: [[13, 0], [10, 1]], board: [[13, 2], [10, 3], [6, 1], [4, 0], [4, 2]] },
    ],
    opponentAction: 'After 17 quiet hands with only one prior raise, the opponent check-raises your 16-big-blind river bet all-in. Few natural draws missed.',
    prompt: 'How should the established rare-aggression read affect {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'best', feedback: 'The rare, large river raise and lack of missed draws make the value range too concentrated for this bluff catcher.' },
      { id: 'call', label: 'Call all-in', grade: 'mistake', mistakeCategory: 'range', feedback: 'Strong absolute value does not supply enough bluffs to a line this opponent has almost never taken.' },
    ],
    bestChoiceId: 'fold',
    reasoning: '{hand} is strong in absolute terms, but the relevant evidence is a large river raise from a consistently passive range with few credible bluffs. The measured exploit is a disciplined fold.',
    takeaway: 'Against established patience, give rare large aggression more credit when the line lacks bluffs.', pack: 'opponent-adjustments',
  },
  {
    id: 'read-pressure-bluff-catch', lessonId: 'lesson-opponents-aggression-traps', focus: 'Defend against wide pressure', street: 'river',
    position: 'Big blind', opponentPosition: 'Button · frequent aggressor', effectiveStackBb: [70, 85, 100], potBb: 40,
    states: [
      { hand: 'top pair, strong kicker', hero: [[13, 0], [12, 1]], board: [[13, 2], [8, 1], [5, 3], [3, 0], [2, 2]] },
      { hand: 'second pair with an ace kicker', hero: [[14, 0], [10, 1]], board: [[13, 2], [10, 3], [6, 1], [4, 0], [2, 2]] },
      { hand: 'an overpair', hero: [[11, 0], [11, 1]], board: [[9, 2], [7, 1], [4, 3], [3, 0], [2, 2]] },
    ],
    opponentAction: 'Across 20 hands, the button bet or raised ten of thirteen postflop opportunities. Several draws miss and they bet 14 into 40 on the river.',
    prompt: 'Does the price and wide-aggression evidence support defending {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'reasonable', feedback: 'Folding is lower variance, but may over-respect a small bet from a range observed to apply frequent pressure.' },
      { id: 'call', label: 'Call 14 big blinds', grade: 'best', feedback: 'The fair price, missed draws, and established aggressive frequency make this a supported bluff catch.' },
      { id: 'raise', label: 'Raise to 45 big blinds', grade: 'mistake', mistakeCategory: 'range', feedback: 'Calling keeps the bluffs in; raising folds them and receives action from the strongest value hands.' },
    ],
    bestChoiceId: 'call',
    reasoning: 'Calling 14 creates a 68-big-blind final pot and needs about 21% equity. The opponent’s relevant aggressive sample and the missed draws give {hand} enough bluff-catching support without turning it into a raise.',
    takeaway: 'Widen bluff-catching only when sample, line, blockers, and price point in the same direction.', pack: 'opponent-adjustments',
    calculation: { callAmountBb: 14, finalPotBb: 68, requiredEquityPercent: 21, estimatedEquityPercent: 28 },
  },
];

const mathTemplates: ScenarioTemplate[] = [
  {
    id: 'math-implied-set-call', lessonId: 'lesson-math-implied-odds', focus: 'Implied-odds target', street: 'preflop',
    position: 'Button', opponentPosition: 'Under the gun · strong range', effectiveStackBb: [65, 80, 100], potBb: 7,
    states: [
      { hand: 'pocket sixes', hero: [[6, 0], [6, 1]] },
      { hand: 'pocket fives', hero: [[5, 0], [5, 1]] },
      { hand: 'pocket sevens', hero: [[7, 0], [7, 1]] },
    ],
    opponentAction: 'A strong early range opens to 3 big blinds. The blinds are passive and more than 60 big blinds remain behind.',
    prompt: 'Can realistic future value support calling 3 big blinds with {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'reasonable', feedback: 'Folding avoids variance, but the deep, in-position conditions can support a conservative set-mine.' },
      { id: 'call', label: 'Call 3 big blinds', grade: 'best', feedback: 'Position, deep effective stacks, low squeeze risk, and a strong range likely to pay after a set make the implied target plausible.' },
      { id: 'raise', label: 'Raise to 10 big blinds', grade: 'mistake', mistakeCategory: 'range', feedback: '{hand} performs poorly against a tight continuing range and does not need to turn into a bluff.' },
    ],
    bestChoiceId: 'call',
    reasoning: 'The direct chance of flopping a set is below the immediate price, but {hand} can plausibly win the required extra value from a strong overpair range with deep stacks and position.',
    takeaway: 'Implied odds need a realistic future payment, enough stack behind, and manageable players behind.', pack: 'advanced-math',
    calculation: { kind: 'implied-odds', callAmountBb: 3, finalPotBb: 10, directRequiredEquityPercent: 30, estimatedCleanEquityPercent: 12, minimumFutureWinBb: 15 },
  },
  {
    id: 'math-implied-short-fold', lessonId: 'lesson-math-implied-odds', focus: 'Implied-odds ceiling', street: 'preflop',
    position: 'Button', opponentPosition: 'Under the gun', effectiveStackBb: [12, 14, 16], potBb: 7,
    states: [
      { hand: 'pocket fours', hero: [[4, 0], [4, 1]] },
      { hand: 'pocket fives', hero: [[5, 0], [5, 1]] },
      { hand: 'pocket sixes', hero: [[6, 0], [6, 1]] },
    ],
    opponentAction: 'A strong early range opens to 3 big blinds. Only about twelve big blinds remain after a call.',
    prompt: 'Does the short effective stack supply enough future value for {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'best', feedback: 'The remaining stack is too small to recover the direct-equity gap often enough after flopping a set.' },
      { id: 'call', label: 'Call 3 big blinds', grade: 'mistake', mistakeCategory: 'stack-depth', feedback: 'The same call that can work deep loses its implied-odds support when little future value remains.' },
      { id: 'shove', label: 'Move all-in', grade: 'mistake', mistakeCategory: 'range', feedback: '{hand} has poor equity against the early range that can call the shove.' },
    ],
    bestChoiceId: 'fold',
    reasoning: '{hand} rarely flops a set, and the effective stack cannot pay the additional value needed to compensate. Short stacks cap implied odds even when the opponent is strong.',
    takeaway: 'Future value cannot exceed the effective stack; implied odds disappear quickly as stacks shorten.', pack: 'advanced-math',
    calculation: { kind: 'implied-odds', callAmountBb: 3, finalPotBb: 10, directRequiredEquityPercent: 30, estimatedCleanEquityPercent: 12, minimumFutureWinBb: 15 },
  },
  {
    id: 'math-reverse-flush', lessonId: 'lesson-math-reverse-implied-odds', focus: 'Reverse implied odds', street: 'flop',
    position: 'Button', opponentPosition: 'Under the gun', effectiveStackBb: [70, 85, 100], potBb: 24,
    states: [
      { hand: 'a seven-high flush draw', hero: [[7, 0], [5, 0]], board: [[13, 0], [11, 0], [2, 1]] },
      { hand: 'an eight-high flush draw', hero: [[8, 0], [6, 0]], board: [[14, 0], [12, 0], [3, 1]] },
      { hand: 'a nine-high flush draw', hero: [[9, 0], [6, 0]], board: [[13, 0], [10, 0], [2, 1]] },
    ],
    opponentAction: 'A tight early-position range bets 8 big blinds into 16 on a two-flush board. Stronger same-suit cards remain likely.',
    prompt: 'Should all nine apparent flush cards be treated as clean outs for {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'best', feedback: 'Higher flushes and difficult future action reduce the clean equity below the bare nine-out estimate.' },
      { id: 'call', label: 'Call 8 big blinds', grade: 'mistake', mistakeCategory: 'range', feedback: 'Counting every flush card as a clean winner ignores the large pots lost to higher flushes.' },
      { id: 'raise', label: 'Raise to 28 big blinds', grade: 'mistake', mistakeCategory: 'commitment', feedback: 'The low draw has poor nut potential against the tight range and is a fragile semi-bluff.' },
    ],
    bestChoiceId: 'fold',
    reasoning: 'The direct price is 25%, but {hand} does not own nine clean winners against a tight range containing higher same-suit cards. Reverse implied odds also make later calls expensive after the draw completes.',
    takeaway: 'Count clean winning outs, not every card that completes the named draw.', pack: 'advanced-math',
    calculation: { callAmountBb: 8, finalPotBb: 32, requiredEquityPercent: 25, estimatedEquityPercent: 20 },
  },
  {
    id: 'math-half-pot-bluff', lessonId: 'lesson-math-break-even-bluffs', focus: 'Half-pot bluff threshold', street: 'river',
    position: 'Button', opponentPosition: 'Big blind', effectiveStackBb: [70, 85, 100], potBb: 20,
    states: [
      { hand: 'a missed nut-flush draw', hero: [[14, 0], [5, 0]], board: [[13, 1], [9, 0], [4, 0], [3, 2], [2, 3]] },
      { hand: 'a missed open-ended draw', hero: [[10, 0], [9, 1]], board: [[8, 2], [7, 3], [2, 0], [13, 1], [3, 2]] },
      { hand: 'queen-high with an ace blocker', hero: [[14, 0], [12, 1]], board: [[13, 2], [10, 3], [6, 1], [4, 0], [2, 2]] },
    ],
    opponentAction: 'The opponent checks a capped one-pair range. You estimate at least 40% of that range folds to a 10-big-blind bet.',
    prompt: 'What does the break-even math support for {hand}?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'reasonable', feedback: 'Checking gives up safely, but the stated fold estimate exceeds the pure-bluff threshold.' },
      { id: 'bet', label: 'Bet 10 big blinds', grade: 'best', feedback: 'Risking 10 to win 20 needs about 33% folds, below the supported 40% estimate.' },
      { id: 'all-in', label: 'Move all-in', grade: 'mistake', mistakeCategory: 'sizing', feedback: 'The scenario supports the measured half-pot bluff, not an uncalculated extreme size.' },
    ],
    bestChoiceId: 'bet',
    reasoning: 'A 10-big-blind pure bluff risks 10 to win 20, so it needs about 33% folds. The stated 40% estimate clears that threshold, and {hand} has little showdown value.',
    takeaway: 'Required folds equal risk divided by risk plus the pot you can win.', pack: 'advanced-math',
    calculation: { kind: 'bluff', riskBb: 10, rewardBb: 20, requiredFoldPercent: 33 },
  },
  {
    id: 'math-pot-bluff-fold', lessonId: 'lesson-math-break-even-bluffs', focus: 'Pot-sized bluff threshold', street: 'river',
    position: 'Button', opponentPosition: 'Big blind · frequent caller', effectiveStackBb: [70, 85, 100], potBb: 20,
    states: [
      { hand: 'a missed low flush draw', hero: [[10, 0], [5, 0]], board: [[13, 1], [9, 0], [4, 0], [3, 2], [2, 3]] },
      { hand: 'missed low straight cards', hero: [[7, 0], [6, 1]], board: [[14, 2], [13, 1], [9, 3], [4, 0], [2, 2]] },
      { hand: 'jack-high with poor blockers', hero: [[11, 0], [8, 1]], board: [[13, 2], [10, 3], [6, 1], [4, 0], [2, 2]] },
    ],
    opponentAction: 'The opponent checks. A pot-sized bet risks 20 big blinds, but the range evidence suggests only about 35% of better hands fold.',
    prompt: 'Is a pot-sized bluff profitable with {hand}?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'best', feedback: 'The estimated 35% folds are well below the 50% required by a zero-equity pot-sized bluff.' },
      { id: 'bet', label: 'Bet 20 big blinds', grade: 'mistake', mistakeCategory: 'sizing', feedback: 'Risking 20 to win 20 needs half the range to fold, which the evidence does not support.' },
    ],
    bestChoiceId: 'check',
    reasoning: 'A pot-sized pure bluff must work 20 ÷ (20 + 20), or 50%, of the time. The 35% estimate leaves a large gap, and {hand} has no clean called equity to close it.',
    takeaway: 'Bigger bluffs require more folds; extra risk does not automatically create them.', pack: 'advanced-math',
    calculation: { kind: 'bluff', riskBb: 20, rewardBb: 20, requiredFoldPercent: 50 },
  },
  {
    id: 'math-semibluff-equity', lessonId: 'lesson-math-break-even-bluffs', focus: 'Semi-bluff equity cushion', street: 'turn',
    position: 'Button', opponentPosition: 'Big blind', effectiveStackBb: [65, 80, 100], potBb: 24,
    states: [
      { hand: 'the nut-flush draw', hero: [[14, 0], [5, 0]], board: [[13, 1], [8, 0], [3, 0], [2, 2]] },
      { hand: 'an open-ended straight draw', hero: [[10, 0], [9, 1]], board: [[8, 2], [7, 3], [2, 0], [13, 1]] },
      { hand: 'a combo draw', hero: [[9, 0], [8, 0]], board: [[7, 0], [6, 1], [2, 0], [13, 2]] },
    ],
    opponentAction: 'The opponent checks a range containing one-pair hands. A 14-big-blind bet receives some folds, and the draw retains clean river equity when called.',
    prompt: 'Which line uses both winning paths with {hand}?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'reasonable', feedback: 'Checking realizes draw equity, but gives up immediate folds against hands that currently lead.' },
      { id: 'bet', label: 'Bet 14 big blinds', grade: 'best', feedback: 'The controlled semi-bluff can win now and retains clean improvement equity when called.' },
      { id: 'all-in', label: 'Move all-in', grade: 'mistake', mistakeCategory: 'sizing', feedback: 'The draw does not need an extreme overbet to combine equity and fold pressure.' },
    ],
    bestChoiceId: 'bet',
    reasoning: 'Unlike a pure bluff, {hand} does not lose every time it is called. Its clean draw equity lowers the immediate fold requirement, while the measured size still targets better one-pair hands.',
    takeaway: 'Semi-bluffs need fewer folds than pure bluffs only when their called equity is clean and realizable.', pack: 'advanced-math',
  },
];

export const tournamentBubbleScenarioFactories = bubbleTemplates.map(scenarioFactory);
export const opponentAdjustmentScenarioFactories = opponentTemplates.map(scenarioFactory);
export const advancedMathScenarioFactories = mathTemplates.map(scenarioFactory);

export const phase7PreflopScenarioFactories = [
  ...tournamentBubbleScenarioFactories,
  ...advancedMathScenarioFactories.filter((_, index) => index < 2),
];

export const phase7PostflopScenarioFactories = [
  ...opponentAdjustmentScenarioFactories,
  ...advancedMathScenarioFactories.filter((_, index) => index >= 2),
];
