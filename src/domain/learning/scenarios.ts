import type { Card, Rank, Suit } from '../poker/types';
import { practicePackById, practicePackForFocus } from './practicePacks';
import type {
  LearningDifficulty,
  PracticePackId,
  ScenarioChoice,
  ScenarioChoiceGrade,
  ScenarioSpot,
  ScenarioTrainerDefinition,
} from './types';

const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const SESSION_SIZE = 6;
const FOCUSED_SESSION_SIZE = 5;

type RandomSource = () => number;
type ScenarioFactory = (random: RandomSource, variant: number) => ScenarioSpot;

function mulberry32(seed: number): RandomSource {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pick<T>(random: RandomSource, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)]!;
}

function shuffle<T>(random: RandomSource, values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

function formatBb(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

/**
 * Lesson amounts stay in big blinds because the lesson *is* the ratio — a pot-odds
 * drill has no blind level to resolve into chips. Spell the unit out so it never
 * reads as an abbreviation competing with the chip counts on the table screens.
 */
function bbUnit(value: number): string {
  return `${formatBb(value)} big blind${value === 1 ? '' : 's'}`;
}

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

function cardsFromPattern(random: RandomSource, pattern: Array<[Rank, number]>): Card[] {
  const suitOrder = shuffle(random, suits);
  return pattern.map(([rank, suitIndex]) => card(rank, suitOrder[suitIndex]!));
}

function finish(random: RandomSource, scenario: ScenarioSpot): ScenarioSpot {
  return { ...scenario, choices: shuffle(random, scenario.choices) };
}

const strongButtonValue: ScenarioFactory = (random, variant) => {
  const hand = pick(random, [
    { label: 'A-J suited', cards: cardsFromPattern(random, [[14, 0], [11, 0]]) },
    { label: 'K-Q suited', cards: cardsFromPattern(random, [[13, 0], [12, 0]]) },
    { label: 'A-Q offsuit', cards: cardsFromPattern(random, [[14, 0], [12, 1]]) },
    { label: 'pocket tens', cards: cardsFromPattern(random, [[10, 0], [10, 1]]) },
  ]);
  const stack = pick(random, [60, 80, 100]);
  const raiseTo = pick(random, [2.5, 3]);
  return finish(random, {
    id: `button-value-${variant}`,
    focus: 'Preflop value',
    street: 'preflop',
    position: 'Button · Small blind',
    opponentPosition: 'Big blind',
    effectiveStackBb: stack,
    potBb: 1.5,
    heroCards: hand.cards,
    board: [],
    opponentAction: 'Action folds to you heads-up.',
    practicePacks: ['preflop', 'preflop-enter'],
    prompt: 'What is your clearest beginner baseline?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'mistake', feedback: `${hand.label} is far too strong to release against one random big-blind hand.` },
      { id: 'limp', label: 'Call 0.5 big blinds', grade: 'reasonable', feedback: 'Some strong strategies mix limps, but raising is the simpler value-first baseline.' },
      { id: 'raise', label: `Raise to ${bbUnit(raiseTo)}`, grade: 'best', feedback: 'You build value, pressure weaker hands, and keep the positional advantage after the flop.' },
    ],
    bestChoiceId: 'raise',
    reasoning: `${hand.label} is comfortably ahead of a random big-blind hand. A ${bbUnit(raiseTo)} raise earns value now without risking an excessive part of the ${bbUnit(stack)} stack.`,
    takeaway: 'Raise strong button hands for value; position helps you realize that advantage.',
  });
};

const weakBlindDefense: ScenarioFactory = (random, variant) => {
  const hand = pick(random, [
    { label: '7-2 offsuit', ranks: [7, 2] as [Rank, Rank] },
    { label: '8-3 offsuit', ranks: [8, 3] as [Rank, Rank] },
    { label: '9-2 offsuit', ranks: [9, 2] as [Rank, Rank] },
    { label: '6-2 offsuit', ranks: [6, 2] as [Rank, Rank] },
  ]);
  const [first, second] = cardsFromPattern(random, [[hand.ranks[0], 0], [hand.ranks[1], 1]]);
  const openTo = pick(random, [3.5, 4, 4.5]);
  const callAmount = openTo - 1;
  const currentPot = openTo + 1;
  const finalPot = currentPot + callAmount;
  const required = Math.round((callAmount / finalPot) * 100);
  return finish(random, {
    id: `blind-defense-${variant}`,
    focus: 'Blind defense',
    street: 'preflop',
    position: 'Big blind',
    opponentPosition: 'Button · Small blind',
    effectiveStackBb: pick(random, [40, 60, 100]),
    potBb: currentPot,
    heroCards: [first!, second!],
    board: [],
    opponentAction: `Button raises to ${bbUnit(openTo)}. You have 1 big blind invested and must call ${bbUnit(callAmount)}.`,
    practicePacks: ['preflop', 'preflop-pressure', 'odds'],
    prompt: 'How should you defend?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'best', feedback: `The large size worsens your price, and ${hand.label} realizes equity poorly out of position.` },
      { id: 'call', label: `Call ${bbUnit(callAmount)}`, grade: 'mistake', feedback: `The call needs about ${required}% equity before accounting for poor playability. Your posted blind is already part of the pot.` },
      { id: 'raise', label: `Raise to ${bbUnit(openTo * 3)}`, grade: 'mistake', feedback: 'This hand has poor blockers and playability, making it a weak bluff candidate.' },
    ],
    bestChoiceId: 'fold',
    reasoning: `Calling ${bbUnit(callAmount)} creates a ${bbUnit(finalPot)} final pot, a ${required}% price. ${hand.label} remains a weak, disconnected holding that must act first after the flop.`,
    takeaway: 'Defend wider against small opens, but release the weakest hands as the price increases.',
    calculation: { callAmountBb: callAmount, finalPotBb: finalPot, requiredEquityPercent: required },
  });
};

const flushDrawPrice: ScenarioFactory = (random, variant) => {
  const [heroLow, boardLow] = pick(random, [[5, 2], [4, 3], [6, 2], [3, 7]] as const);
  const boardHigh = pick(random, [11, 12, 13] as Rank[]);
  const boardMiddle = pick(random, [8, 9, 10] as Rank[]);
  const generated = cardsFromPattern(random, [
    [14, 0], [heroLow, 0], [boardHigh, 0], [boardMiddle, 1], [boardLow, 0],
  ]);
  const basePot = pick(random, [10, 12, 14, 16]);
  const bet = basePot / 2;
  const currentPot = basePot + bet;
  const finalPot = currentPot + bet;
  const required = Math.round((bet / finalPot) * 100);
  return finish(random, {
    id: `flush-draw-price-${variant}`,
    focus: 'Draws and pot odds',
    street: 'flop',
    position: 'Button',
    opponentPosition: 'Big blind',
    effectiveStackBb: pick(random, [70, 84, 100]),
    potBb: currentPot,
    heroCards: generated.slice(0, 2),
    board: generated.slice(2),
    opponentAction: `Big blind bets ${bbUnit(bet)} into ${bbUnit(basePot)}. The displayed pot is now ${bbUnit(currentPot)}.`,
    practicePacks: ['odds'],
    prompt: 'Choose the cleanest response with the nut-flush draw.',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'mistake', feedback: `Nine clean flush outs have about 35% equity by the river, comfortably above this ${required}% price.` },
      { id: 'call', label: `Call ${bbUnit(bet)}`, grade: 'best', feedback: `Calling needs ${required}% equity, while nine clean flush outs hit about 35% of the time by the river.` },
      { id: 'raise', label: `Raise to ${bbUnit(Math.round(basePot * 1.7))}`, grade: 'reasonable', feedback: 'A semi-bluff can work, but it adds fold-equity assumptions. Calling is the clearest mathematical baseline.' },
    ],
    bestChoiceId: 'call',
    reasoning: `After your ${bbUnit(bet)} call, the final pot is ${bbUnit(finalPot)}: ${formatBb(bet)} ÷ ${formatBb(finalPot)} = ${required}%. Nine clean flush outs are about 35% with two cards to come.`,
    takeaway: 'Compare draw equity with the final pot after your call—not the pot before it.',
    calculation: { callAmountBb: bet, estimatedEquityPercent: 35, finalPotBb: finalPot, requiredEquityPercent: required },
  });
};

const turnValueBet: ScenarioFactory = (random, variant) => {
  const hand = pick(random, [
    { label: 'top pair, top kicker', pattern: [[14, 0], [12, 1], [12, 2], [7, 3], [3, 0], [2, 2]] as Array<[Rank, number]> },
    { label: 'top pair, top kicker', pattern: [[14, 0], [13, 1], [13, 2], [8, 3], [4, 0], [2, 2]] as Array<[Rank, number]> },
    { label: 'top pair with a strong kicker', pattern: [[13, 0], [12, 1], [12, 2], [8, 3], [3, 0], [2, 2]] as Array<[Rank, number]> },
  ]);
  const generated = cardsFromPattern(random, hand.pattern);
  const pot = pick(random, [16, 18, 20, 24]);
  const bet = pot / 2;
  return finish(random, {
    id: `turn-value-${variant}`,
    focus: 'Value betting',
    street: 'turn',
    position: 'Button',
    opponentPosition: 'Big blind',
    effectiveStackBb: pick(random, [60, 72, 90]),
    potBb: pot,
    heroCards: generated.slice(0, 2),
    board: generated.slice(2),
    opponentAction: 'Big blind checks a second time.',
    practicePacks: ['betting'],
    prompt: `How do you continue with ${hand.label}?`,
    choices: [
      { id: 'check', label: 'Check', grade: 'reasonable', feedback: 'Checking controls the pot, but it misses value from weaker pairs and draws.' },
      { id: 'bet', label: `Bet ${bbUnit(bet)}`, grade: 'best', feedback: 'A half-pot bet targets several worse hands while charging available draws.' },
      { id: 'all-in', label: 'Move all-in', grade: 'mistake', feedback: 'An oversized shove folds too much of the weaker range you want to keep calling.' },
    ],
    bestChoiceId: 'bet',
    reasoning: `You can name several worse hands that continue. Betting ${bbUnit(bet)} into ${bbUnit(pot)} captures value without isolating you against only very strong hands.`,
    takeaway: 'Value betting starts by identifying worse hands that can realistically call your size.',
  });
};

const riverBluffCatch: ScenarioFactory = (random, variant) => {
  const hand = pick(random, [
    { pattern: [[13, 0], [11, 0], [13, 1], [8, 2], [6, 3], [3, 0], [2, 1]] as Array<[Rank, number]> },
    { pattern: [[12, 0], [11, 0], [12, 1], [8, 2], [5, 3], [3, 0], [2, 1]] as Array<[Rank, number]> },
    { pattern: [[14, 0], [10, 0], [14, 1], [8, 2], [6, 3], [4, 0], [2, 1]] as Array<[Rank, number]> },
  ]);
  const generated = cardsFromPattern(random, hand.pattern);
  const basePot = pick(random, [16, 20, 24]);
  const bet = basePot * 1.25;
  const currentPot = basePot + bet;
  const finalPot = currentPot + bet;
  const required = Math.round((bet / finalPot) * 100);
  const estimated = pick(random, [23, 25, 27]);
  return finish(random, {
    id: `river-bluff-catch-${variant}`,
    focus: 'Bluff catching',
    street: 'river',
    position: 'Button',
    opponentPosition: 'Big blind',
    effectiveStackBb: pick(random, [50, 60, 75]),
    potBb: currentPot,
    heroCards: generated.slice(0, 2),
    board: generated.slice(2),
    opponentAction: `Big blind bets ${bbUnit(bet)} into ${bbUnit(basePot)}. You estimate this bluff catcher wins ${estimated}% of the time.`,
    practicePacks: ['odds'],
    prompt: 'What does the price tell you to do?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'best', feedback: `You need about ${required}% equity, so a trustworthy ${estimated}% estimate cannot support a call.` },
      { id: 'call', label: `Call ${bbUnit(bet)}`, grade: 'mistake', feedback: 'Top pair looks attractive, but the call loses when your equity estimate is below the price.' },
      { id: 'raise', label: 'Raise all-in', grade: 'mistake', feedback: 'Turning showdown value into a bluff needs blocker and fold evidence you do not have.' },
    ],
    bestChoiceId: 'fold',
    reasoning: `Calling ${bbUnit(bet)} makes the final pot ${bbUnit(finalPot)}. Required equity is ${formatBb(bet)} ÷ ${formatBb(finalPot)} ≈ ${required}%, above the stated ${estimated}% win estimate.`,
    takeaway: 'Do not let absolute hand strength override the price and your range-based estimate.',
    calculation: { callAmountBb: bet, estimatedEquityPercent: estimated, finalPotBb: finalPot, requiredEquityPercent: required },
  });
};

const missedDrawDiscipline: ScenarioFactory = (random, variant) => {
  const pattern = pick(random, [
    [[12, 0], [5, 0], [13, 1], [9, 0], [4, 0], [2, 2], [2, 3]],
    [[11, 0], [6, 0], [12, 1], [8, 0], [3, 0], [2, 2], [2, 3]],
    [[10, 0], [5, 0], [13, 1], [8, 0], [3, 0], [2, 2], [2, 3]],
  ] as Array<Array<[Rank, number]>>);
  const generated = cardsFromPattern(random, pattern);
  const pot = pick(random, [18, 24, 30]);
  return finish(random, {
    id: `missed-draw-${variant}`,
    focus: 'Bluff selection',
    street: 'river',
    position: 'Button',
    opponentPosition: 'Big blind',
    effectiveStackBb: pick(random, [45, 60, 80]),
    potBb: pot,
    heroCards: generated.slice(0, 2),
    board: generated.slice(2),
    opponentAction: 'Big blind checks. This opponent calls too often, and your cards do not block strong one-pair calls.',
    practicePacks: ['betting'],
    prompt: 'Should the missed draw bluff?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'best', feedback: 'Low fold equity and poor blockers make this a disciplined give-up.' },
      { id: 'small', label: `Bet ${bbUnit(pot / 3)}`, grade: 'mistake', feedback: 'A small bet gives a call-heavy opponent an easy price and lacks a clear better-hand target.' },
      { id: 'pot', label: `Bet ${bbUnit(pot)}`, grade: 'mistake', feedback: 'A bigger bet risks more chips without evidence this opponent will release enough pairs.' },
    ],
    bestChoiceId: 'check',
    reasoning: 'Missing a draw does not automatically create a profitable bluff. This opponent, board, and blocker combination offers too little fold equity.',
    takeaway: 'Bluff because the range can fold—not simply because your draw missed.',
  });
};

const potControl: ScenarioFactory = (random, variant) => {
  const pattern = pick(random, [
    [[14, 0], [9, 1], [13, 2], [9, 3], [5, 0], [2, 2]],
    [[13, 0], [8, 1], [14, 2], [8, 3], [5, 0], [3, 2]],
    [[14, 0], [10, 1], [13, 2], [10, 3], [6, 0], [2, 2]],
  ] as Array<Array<[Rank, number]>>);
  const generated = cardsFromPattern(random, pattern);
  const pot = pick(random, [12, 16, 20]);
  return finish(random, {
    id: `pot-control-${variant}`,
    focus: 'Showdown value',
    street: 'turn',
    position: 'Button',
    opponentPosition: 'Big blind',
    effectiveStackBb: pick(random, [65, 80, 100]),
    potBb: pot,
    heroCards: generated.slice(0, 2),
    board: generated.slice(2),
    opponentAction: 'Big blind calls the flop, then checks the turn.',
    practicePacks: ['betting'],
    prompt: 'How should you handle second pair with a strong kicker?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'best', feedback: 'Checking realizes your showdown value and avoids building a large pot against stronger pairs.' },
      { id: 'small', label: `Bet ${bbUnit(pot / 3)}`, grade: 'reasonable', feedback: 'A small protection bet can be mixed, but many worse hands fold while stronger hands continue.' },
      { id: 'large', label: `Bet ${bbUnit(pot)}`, grade: 'mistake', feedback: 'A pot-sized bet isolates this medium-strength hand against too much of the stronger range.' },
    ],
    bestChoiceId: 'check',
    reasoning: 'Second pair has useful showdown value but does not clearly gain from a large bet. Position lets you take a free card and make the river decision with more information.',
    takeaway: 'A good check can protect medium-strength showdown value; aggression always needs a purpose.',
  });
};

const isolateLimper: ScenarioFactory = (random, variant) => {
  const hand = pick(random, [
    { label: 'A-Q offsuit', pattern: [[14, 0], [12, 1]] as Array<[Rank, number]> },
    { label: 'K-Q suited', pattern: [[13, 0], [12, 0]] as Array<[Rank, number]> },
    { label: 'pocket nines', pattern: [[9, 0], [9, 1]] as Array<[Rank, number]> },
  ]);
  const raiseTo = pick(random, [4.5, 5, 5.5]);
  return finish(random, {
    id: `isolate-limper-${variant}`,
    focus: 'Isolation and position',
    street: 'preflop',
    position: 'Button · two blinds behind',
    opponentPosition: 'Cutoff',
    effectiveStackBb: pick(random, [75, 100, 120]),
    potBb: 2.5,
    heroCards: cardsFromPattern(random, hand.pattern),
    board: [],
    opponentAction: 'Cutoff limps for 1 big blind. The small blind and big blind are still waiting behind you.',
    practicePacks: ['preflop', 'preflop-enter'],
    prompt: `What is the clearest plan with ${hand.label}?`,
    choices: [
      { id: 'fold', label: 'Fold', grade: 'mistake', feedback: `${hand.label} is much too strong to fold against one limp.` },
      { id: 'call', label: 'Call 1 big blind', grade: 'reasonable', feedback: 'Calling keeps the pot small, but it invites both blinds and gives up a strong isolation opportunity.' },
      { id: 'raise', label: `Raise to ${bbUnit(raiseTo)}`, grade: 'best', feedback: 'Raising builds value, discourages the blinds, and aims to play in position against the limper.' },
    ],
    bestChoiceId: 'raise',
    reasoning: `${hand.label} is ahead of a typical limp range. Raising to ${bbUnit(raiseTo)} charges that range and reduces the chance of playing a crowded pot.`,
    takeaway: 'Use position and strong hands to isolate weaker limps rather than automatically joining them.',
  });
};

const premiumFacingThreeBet: ScenarioFactory = (random, variant) => {
  const hand = pick(random, [
    { label: 'pocket aces', pattern: [[14, 0], [14, 1]] as Array<[Rank, number]> },
    { label: 'pocket kings', pattern: [[13, 0], [13, 1]] as Array<[Rank, number]> },
  ]);
  const threeBetTo = pick(random, [8.5, 9, 10]);
  const fourBetTo = pick(random, [21, 22, 23]);
  return finish(random, {
    id: `premium-three-bet-${variant}`,
    focus: 'Facing a three-bet',
    street: 'preflop',
    position: 'Button',
    opponentPosition: 'Big blind',
    effectiveStackBb: pick(random, [80, 100, 120]),
    potBb: threeBetTo + 3,
    heroCards: cardsFromPattern(random, hand.pattern),
    board: [],
    opponentAction: `You raise to 2.5 big blinds. Small blind folds, then big blind re-raises to ${bbUnit(threeBetTo)}.`,
    practicePacks: ['preflop', 'preflop-pressure'],
    prompt: `What is the clearest value plan with ${hand.label}?`,
    choices: [
      { id: 'fold', label: 'Fold', grade: 'mistake', feedback: `${hand.label} is at the very top of your range and cannot fold to one normal three-bet.` },
      { id: 'call', label: `Call ${bbUnit(threeBetTo - 2.5)}`, grade: 'reasonable', feedback: 'Calling can trap, but it leaves value on the table and lets the opponent realize equity cheaply.' },
      { id: 'raise', label: `Raise to ${bbUnit(fourBetTo)}`, grade: 'best', feedback: 'A controlled four-bet builds value while leaving weaker premium hands room to continue.' },
    ],
    bestChoiceId: 'raise',
    reasoning: `${hand.label} wants to build a large pot against the opponent's strongest continuing range. ${bbUnit(fourBetTo)} applies pressure without jumping straight to an unnecessary all-in.`,
    takeaway: 'When you hold the top of your range, respond to pressure by building value—not by protecting the result.',
  });
};

const earlyPositionDiscipline: ScenarioFactory = (random, variant) => {
  const hand = pick(random, [
    { label: '10-6 offsuit', pattern: [[10, 0], [6, 1]] as Array<[Rank, number]> },
    { label: 'J-5 offsuit', pattern: [[11, 0], [5, 1]] as Array<[Rank, number]> },
    { label: '9-5 offsuit', pattern: [[9, 0], [5, 1]] as Array<[Rank, number]> },
  ]);
  return finish(random, {
    id: `early-discipline-${variant}`,
    focus: 'Early-position discipline',
    street: 'preflop',
    position: 'Under the gun · six players',
    opponentPosition: 'Five players behind',
    effectiveStackBb: pick(random, [60, 80, 100]),
    potBb: 1.5,
    heroCards: cardsFromPattern(random, hand.pattern),
    board: [],
    opponentAction: 'You are first to act. Five players still have live cards behind you.',
    practicePacks: ['preflop', 'preflop-enter'],
    prompt: `What is the clearest baseline with ${hand.label}?`,
    choices: [
      { id: 'fold', label: 'Fold', grade: 'best', feedback: `${hand.label} lacks high-card strength and playability while five ranges can still apply pressure.` },
      { id: 'limp', label: 'Call 1 big blind', grade: 'mistake', feedback: 'Open-limping invites a crowded pot with a weak hand and no positional advantage.' },
      { id: 'raise', label: 'Raise to 2.5 big blinds', grade: 'mistake', feedback: 'This holding is too weak for a simple early-position opening range at a six-player table.' },
    ],
    bestChoiceId: 'fold',
    reasoning: `Position changes the threshold. ${hand.label} must pass five players and then play many flops out of position, so folding preserves chips for stronger opportunities.`,
    takeaway: 'Open tighter from early position because more players can wake up with a strong hand.',
  });
};

const riverThinValueSize: ScenarioFactory = (random, variant) => {
  const pattern = pick(random, [
    [[14, 0], [12, 1], [12, 2], [8, 3], [4, 0], [2, 1], [7, 2]],
    [[14, 0], [13, 1], [13, 2], [9, 3], [5, 0], [2, 1], [8, 2]],
    [[13, 0], [12, 1], [12, 2], [7, 3], [4, 0], [2, 1], [9, 2]],
  ] as Array<Array<[Rank, number]>>);
  const generated = cardsFromPattern(random, pattern);
  const pot = pick(random, [18, 24, 30]);
  const valueSize = pot / 3;
  return finish(random, {
    id: `river-thin-value-${variant}`,
    focus: 'Thin value sizing',
    street: 'river',
    position: 'Button',
    opponentPosition: 'Big blind',
    effectiveStackBb: pick(random, [45, 60, 75]),
    potBb: pot,
    heroCards: generated.slice(0, 2),
    board: generated.slice(2),
    opponentAction: 'Big blind checks. Several weaker one-pair hands can still call a modest bet.',
    practicePacks: ['betting'],
    prompt: 'Which size keeps worse hands in most often?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'reasonable', feedback: 'Checking guarantees showdown, but it misses a profitable call from several weaker pairs.' },
      { id: 'small', label: `Bet ${bbUnit(valueSize)}`, grade: 'best', feedback: 'One-third pot gives weaker pairs a realistic price while still earning value.' },
      { id: 'all-in', label: 'Move all-in', grade: 'mistake', feedback: 'The oversized bet folds too much of the exact weaker range you want to call.' },
    ],
    bestChoiceId: 'small',
    reasoning: `A ${bbUnit(valueSize)} bet into ${bbUnit(pot)} targets the weaker pairs you identified. The goal is not maximum size; it is the largest size enough worse hands can call.`,
    takeaway: 'Choose a value size by picturing the weaker hands that will actually pay it.',
  });
};

const semiBluffSizing: ScenarioFactory = (random, variant) => {
  const pattern = pick(random, [
    [[9, 0], [8, 0], [10, 1], [7, 2], [2, 3]],
    [[8, 0], [7, 0], [9, 1], [6, 2], [2, 3]],
    [[7, 0], [6, 0], [8, 1], [5, 2], [2, 3]],
  ] as Array<Array<[Rank, number]>>);
  const generated = cardsFromPattern(random, pattern);
  const pot = pick(random, [10, 14, 18]);
  const bet = pot / 2;
  return finish(random, {
    id: `semi-bluff-size-${variant}`,
    focus: 'Semi-bluff sizing',
    street: 'flop',
    position: 'Button',
    opponentPosition: 'Big blind',
    effectiveStackBb: pick(random, [70, 90, 110]),
    potBb: pot,
    heroCards: generated.slice(0, 2),
    board: generated.slice(2),
    opponentAction: 'Big blind checks. You have an open-ended straight draw and little showdown value.',
    practicePacks: ['betting'],
    prompt: 'Which line applies pressure without over-risking the draw?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'reasonable', feedback: 'Checking realizes draw equity safely, but gives up the chance to fold out better high-card hands.' },
      { id: 'half', label: `Bet ${bbUnit(bet)}`, grade: 'best', feedback: 'Half pot combines fold equity with eight straight outs while keeping the risk controlled.' },
      { id: 'all-in', label: 'Move all-in', grade: 'mistake', feedback: 'A huge shove risks the full stack when a smaller bet can create similar folds.' },
    ],
    bestChoiceId: 'half',
    reasoning: `Betting ${bbUnit(bet)} into ${bbUnit(pot)} can fold out stronger unpaired hands while the open-ended draw retains eight improving cards when called.`,
    takeaway: 'Semi-bluffs combine fold equity and draw equity; they do not require the largest possible size.',
  });
};

const turnStraightDrawPrice: ScenarioFactory = (random, variant) => {
  const pattern = pick(random, [
    [[8, 0], [7, 1], [6, 2], [13, 3], [2, 0], [12, 1]],
    [[9, 0], [8, 1], [7, 2], [14, 3], [3, 0], [12, 1]],
    [[7, 0], [6, 1], [5, 2], [13, 3], [2, 0], [11, 1]],
  ] as Array<Array<[Rank, number]>>);
  const generated = cardsFromPattern(random, pattern);
  const basePot = pick(random, [18, 24, 30]);
  const bet = basePot / 6;
  const currentPot = basePot + bet;
  const finalPot = currentPot + bet;
  const required = Math.round((bet / finalPot) * 100);
  return finish(random, {
    id: `turn-straight-price-${variant}`,
    focus: 'Straight-draw price',
    street: 'turn',
    position: 'Button',
    opponentPosition: 'Big blind',
    effectiveStackBb: pick(random, [55, 70, 90]),
    potBb: currentPot,
    heroCards: generated.slice(0, 2),
    board: generated.slice(2),
    opponentAction: `Big blind bets ${bbUnit(bet)} into ${bbUnit(basePot)}. Eight clean straight outs are about 17% with one card to come.`,
    practicePacks: ['odds'],
    prompt: 'Does the direct price support a call?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'mistake', feedback: `Folding gives up a draw estimated at 17% when the call needs only about ${required}%.` },
      { id: 'call', label: `Call ${bbUnit(bet)}`, grade: 'best', feedback: `The call needs about ${required}% equity, below the stated 17% draw chance.` },
      { id: 'all-in', label: 'Raise all-in', grade: 'mistake', feedback: 'The profitable direct call does not justify risking the full stack without fold-equity evidence.' },
    ],
    bestChoiceId: 'call',
    reasoning: `Calling ${bbUnit(bet)} makes the final pot ${bbUnit(finalPot)}: ${formatBb(bet)} ÷ ${formatBb(finalPot)} ≈ ${required}%. That price is below the draw's stated 17% equity.`,
    takeaway: 'A small bet can offer a profitable draw call even with only one card remaining.',
    calculation: { callAmountBb: bet, estimatedEquityPercent: 17, finalPotBb: finalPot, requiredEquityPercent: required },
  });
};

const overpricedTurnFlushDraw: ScenarioFactory = (random, variant) => {
  const generated = cardsFromPattern(random, [
    [14, 0], [5, 0], [13, 0], [8, 1], [2, 0], [9, 2],
  ]);
  const basePot = pick(random, [16, 20, 24]);
  const bet = basePot;
  const currentPot = basePot + bet;
  const finalPot = currentPot + bet;
  const required = Math.round((bet / finalPot) * 100);
  const estimated = pick(random, [19, 20]);
  return finish(random, {
    id: `overpriced-flush-${variant}`,
    focus: 'Overpriced draws',
    street: 'turn',
    position: 'Button',
    opponentPosition: 'Big blind',
    effectiveStackBb: pick(random, [50, 65, 80]),
    potBb: currentPot,
    heroCards: generated.slice(0, 2),
    board: generated.slice(2),
    opponentAction: `Big blind bets ${bbUnit(bet)} into ${bbUnit(basePot)}. Nine flush outs are about ${estimated}% with one card to come.`,
    practicePacks: ['odds'],
    prompt: 'What does the price say about continuing?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'best', feedback: `The call needs ${required}% equity, well above the stated ${estimated}% chance to complete the flush.` },
      { id: 'call', label: `Call ${bbUnit(bet)}`, grade: 'mistake', feedback: 'A visually strong draw is still a losing call when its equity is below the direct price.' },
      { id: 'raise', label: 'Raise all-in', grade: 'mistake', feedback: 'A bluff raise needs credible fold equity; the draw alone does not erase the bad price.' },
    ],
    bestChoiceId: 'fold',
    reasoning: `Calling ${bbUnit(bet)} creates a ${bbUnit(finalPot)} final pot, so the break-even price is ${required}%. The stated ${estimated}% draw chance is not enough.`,
    takeaway: 'Strong-looking draws can still be folds when a large wager offers the wrong price.',
    calculation: { callAmountBb: bet, estimatedEquityPercent: estimated, finalPotBb: finalPot, requiredEquityPercent: required },
  });
};

interface CompactPreflopTemplate {
  bestChoiceId: string;
  choices: ScenarioChoice[];
  difficulty?: LearningDifficulty;
  effectiveStackBb?: number | number[];
  focus: string;
  hands: Array<{ label: string; pattern: Array<[Rank, number]> }>;
  id: string;
  opponentAction: string;
  opponentPosition: string;
  pack: 'preflop-enter' | 'preflop-pressure' | 'preflop-three-bet';
  position: string;
  potBb: number | number[];
  prompt: string;
  reasoning: string;
  takeaway: string;
}

function compactPreflopFactory(config: CompactPreflopTemplate): ScenarioFactory {
  return (random, variant) => {
    const hand = pick(random, config.hands);
    const withHand = (value: string) => value.replaceAll('{hand}', hand.label);
    return finish(random, {
      id: `${config.id}-${variant}`,
      difficulty: config.difficulty ?? 'beginner',
      focus: config.focus,
      street: 'preflop',
      position: config.position,
      opponentPosition: config.opponentPosition,
      effectiveStackBb: config.effectiveStackBb === undefined
        ? pick(random, [40, 60, 80, 100])
        : Array.isArray(config.effectiveStackBb)
          ? pick(random, config.effectiveStackBb)
          : config.effectiveStackBb,
      potBb: Array.isArray(config.potBb) ? pick(random, config.potBb) : config.potBb,
      heroCards: cardsFromPattern(random, hand.pattern),
      board: [],
      opponentAction: withHand(config.opponentAction),
      practicePacks: ['preflop', config.pack],
      prompt: withHand(config.prompt),
      choices: config.choices.map((choice) => ({
        ...choice,
        feedback: withHand(choice.feedback),
      })),
      bestChoiceId: config.bestChoiceId,
      reasoning: withHand(config.reasoning),
      takeaway: config.takeaway,
    });
  };
}

interface CompactPostflopState {
  boardPattern: Array<[Rank, number]>;
  heroPattern: Array<[Rank, number]>;
  label: string;
}

interface CompactPostflopTemplate {
  bestChoiceId: string;
  calculation?: ScenarioSpot['calculation'];
  choices: ScenarioChoice[];
  effectiveStackBb: number | number[];
  focus: string;
  id: string;
  lessonId: string;
  opponentAction: string;
  opponentPosition: string;
  pack: 'postflop-range' | 'postflop-river';
  position: string;
  potBb: number | number[];
  prompt: string;
  reasoning: string;
  states: CompactPostflopState[];
  street: 'flop' | 'turn' | 'river';
  takeaway: string;
}

function compactPostflopFactory(config: CompactPostflopTemplate): ScenarioFactory {
  return (random, variant) => {
    const state = pick(random, config.states);
    const knownCards = cardsFromPattern(random, [...state.heroPattern, ...state.boardPattern]);
    const heroCards = knownCards.slice(0, state.heroPattern.length);
    const board = knownCards.slice(state.heroPattern.length);
    const withHand = (value: string) => value.replaceAll('{hand}', state.label);
    return finish(random, {
      id: `${config.id}-${variant}`,
      difficulty: 'intermediate',
      lessonId: config.lessonId,
      focus: config.focus,
      street: config.street,
      position: config.position,
      opponentPosition: config.opponentPosition,
      effectiveStackBb: Array.isArray(config.effectiveStackBb)
        ? pick(random, config.effectiveStackBb)
        : config.effectiveStackBb,
      potBb: Array.isArray(config.potBb) ? pick(random, config.potBb) : config.potBb,
      heroCards,
      board,
      opponentAction: withHand(config.opponentAction),
      practicePacks: [config.pack],
      prompt: withHand(config.prompt),
      choices: config.choices.map((choice) => ({
        ...choice,
        feedback: withHand(choice.feedback),
      })),
      bestChoiceId: config.bestChoiceId,
      reasoning: withHand(config.reasoning),
      takeaway: config.takeaway,
      calculation: config.calculation,
    });
  };
}

const expandedEnterPotFactories = [
  {
    id: 'cutoff-open',
    focus: 'Cutoff opening',
    position: 'Cutoff · six players',
    opponentPosition: 'Button and blinds behind',
    hands: [
      { label: 'A-10 suited', pattern: [[14, 0], [10, 0]] },
      { label: 'K-J suited', pattern: [[13, 0], [11, 0]] },
      { label: 'pocket eights', pattern: [[8, 0], [8, 1]] },
    ],
    opponentAction: 'Action folds to you. The button and both blinds remain.',
    prompt: 'What is the cleanest first-in action with {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'mistake', feedback: '{hand} is strong enough to enter from the cutoff after earlier players fold.' },
      { id: 'limp', label: 'Call 1 big blind', grade: 'mistake', feedback: 'Open-limping gives up immediate pressure and invites a crowded pot.' },
      { id: 'raise', label: 'Raise to 2.5 big blinds', grade: 'best', feedback: 'A consistent small raise builds value and can win the blinds.' },
    ],
    bestChoiceId: 'raise',
    reasoning: '{hand} combines enough card quality and position to open profitably from the cutoff. A consistent 2.5-big-blind size keeps the strategy clear.',
    takeaway: 'Open more hands as fewer players remain, but enter with a raise rather than a limp.',
    potBb: 1.5,
    pack: 'preflop-enter',
  },
  {
    id: 'button-suited-open',
    focus: 'Button opening',
    position: 'Button · six players',
    opponentPosition: 'Small blind and big blind',
    hands: [
      { label: '9-8 suited', pattern: [[9, 0], [8, 0]] },
      { label: 'A-6 suited', pattern: [[14, 0], [6, 0]] },
      { label: 'K-9 suited', pattern: [[13, 0], [9, 0]] },
    ],
    opponentAction: 'Every player before you folds. Only the blinds remain.',
    prompt: 'How should position influence {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'reasonable', feedback: 'Folding is safe, but it gives up a useful late-position opening opportunity.' },
      { id: 'limp', label: 'Call 1 big blind', grade: 'mistake', feedback: 'A simple raise-first plan uses position more effectively than an open limp.' },
      { id: 'raise', label: 'Raise to 2.5 big blinds', grade: 'best', feedback: '{hand} has enough playability to pressure two random blind ranges.' },
    ],
    bestChoiceId: 'raise',
    reasoning: 'With only two players behind and guaranteed postflop position when called, {hand} is a practical button open.',
    takeaway: 'Late position adds profitable opens because fewer ranges remain and you act last after the flop.',
    potBb: 1.5,
    pack: 'preflop-enter',
  },
  {
    id: 'small-blind-steal',
    focus: 'Small-blind opening',
    position: 'Small blind · six players',
    opponentPosition: 'Big blind',
    hands: [
      { label: 'A-9 offsuit', pattern: [[14, 0], [9, 1]] },
      { label: 'K-10 suited', pattern: [[13, 0], [10, 0]] },
      { label: 'pocket sevens', pattern: [[7, 0], [7, 1]] },
    ],
    opponentAction: 'Everyone folds to you. You have posted 0.5 big blinds.',
    prompt: 'What is the simplest value-first plan with {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'mistake', feedback: '{hand} is too strong to surrender against one random big-blind range.' },
      { id: 'call', label: 'Call 0.5 big blinds', grade: 'reasonable', feedback: 'Some strategies limp, but raising is the clearer beginner baseline with this hand.' },
      { id: 'raise', label: 'Raise to 3 big blinds', grade: 'best', feedback: 'Raise for value and make the big blind pay to continue in position.' },
    ],
    bestChoiceId: 'raise',
    reasoning: '{hand} is ahead of a random big-blind holding. Raising builds value even though you will act first after the flop.',
    takeaway: 'When folded to the small blind, attack with solid hands while respecting the postflop position disadvantage.',
    potBb: 1.5,
    pack: 'preflop-enter',
  },
  {
    id: 'middle-pair-open',
    focus: 'Pair opening',
    position: 'Middle position · six players',
    opponentPosition: 'Three players behind',
    hands: [
      { label: 'pocket sixes', pattern: [[6, 0], [6, 1]] },
      { label: 'pocket sevens', pattern: [[7, 0], [7, 1]] },
      { label: 'pocket eights', pattern: [[8, 0], [8, 1]] },
    ],
    opponentAction: 'The players before you fold. Three players remain behind.',
    prompt: 'How should you enter with {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'reasonable', feedback: 'Folding is conservative, but this pair is normally strong enough to open here.' },
      { id: 'limp', label: 'Call 1 big blind', grade: 'mistake', feedback: 'Open-limping invites pressure and makes your entry range easier to read.' },
      { id: 'raise', label: 'Raise to 2.5 big blinds', grade: 'best', feedback: 'Raise first in and retain ways to win without making a set.' },
    ],
    bestChoiceId: 'raise',
    reasoning: '{hand} has immediate pair strength and useful set potential. A normal open can win now or reach the flop with initiative.',
    takeaway: 'Playable pairs usually enter unopened pots with the same raise size as the rest of your range.',
    potBb: 1.5,
    pack: 'preflop-enter',
  },
  {
    id: 'multi-limper-isolate',
    focus: 'Multiple limpers',
    position: 'Button · six players',
    opponentPosition: 'Two limpers and both blinds',
    hands: [
      { label: 'A-K offsuit', pattern: [[14, 0], [13, 1]] },
      { label: 'pocket queens', pattern: [[12, 0], [12, 1]] },
      { label: 'A-Q suited', pattern: [[14, 0], [12, 0]] },
    ],
    opponentAction: 'Two players limp for 1 big blind each. Both blinds remain behind you.',
    prompt: 'What is the clearest plan with {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'mistake', feedback: '{hand} is far ahead of typical limping ranges.' },
      { id: 'call', label: 'Call 1 big blind', grade: 'mistake', feedback: 'Calling invites both blinds and misses a large value opportunity.' },
      { id: 'raise', label: 'Raise to 6 big blinds', grade: 'best', feedback: 'Add size for both limpers and try to narrow the field with a premium hand.' },
    ],
    bestChoiceId: 'raise',
    reasoning: 'Two limpers create more dead money and more possible callers. {hand} should use a larger isolation raise for value.',
    takeaway: 'Add roughly one big blind per limper when isolating, then adjust for position and opponent behavior.',
    potBb: 3.5,
    pack: 'preflop-enter',
  },
  {
    id: 'overlimp-small-pair',
    focus: 'Selective over-limping',
    position: 'Button · six players',
    opponentPosition: 'Two limpers and both blinds',
    hands: [
      { label: 'pocket twos', pattern: [[2, 0], [2, 1]] },
      { label: 'pocket threes', pattern: [[3, 0], [3, 1]] },
      { label: 'pocket fours', pattern: [[4, 0], [4, 1]] },
    ],
    opponentAction: 'Two players limp. Stacks are deep and the blinds rarely raise.',
    prompt: 'Which low-variance entry makes sense with {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'reasonable', feedback: 'Folding is fine if the table is aggressive, but the stated conditions support a cheap call.' },
      { id: 'call', label: 'Call 1 big blind', grade: 'best', feedback: 'Deep stacks, position, and a low squeeze risk support set-mining cheaply.' },
      { id: 'raise', label: 'Raise to 6 big blinds', grade: 'reasonable', feedback: 'Isolation can work, but the small pair dislikes several callers and postflop pressure.' },
    ],
    bestChoiceId: 'call',
    reasoning: '{hand} often needs to make a set to win a large pot. The deep, passive conditions and button position make a one-big-blind call reasonable.',
    takeaway: 'Call behind selectively when the hand, stack depth, position, and table behavior all favor a multiway pot.',
    potBb: 3.5,
    pack: 'preflop-enter',
  },
  {
    id: 'short-stack-open',
    focus: 'Short-stack opening',
    position: 'Cutoff · six players',
    opponentPosition: 'Button and blinds behind',
    hands: [
      { label: 'A-Q offsuit', pattern: [[14, 0], [12, 1]] },
      { label: 'pocket tens', pattern: [[10, 0], [10, 1]] },
      { label: 'A-J suited', pattern: [[14, 0], [11, 0]] },
    ],
    opponentAction: 'Action folds to you with 25 big blinds effective.',
    prompt: 'How should the shorter stack affect {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'mistake', feedback: '{hand} is a clear value open at this depth.' },
      { id: 'limp', label: 'Call 1 big blind', grade: 'mistake', feedback: 'Limping gives away initiative and creates awkward pressure behind.' },
      { id: 'raise', label: 'Raise to 2.25 big blinds', grade: 'best', feedback: 'A small open risks little while preparing for shorter-stack re-raise decisions.' },
    ],
    bestChoiceId: 'raise',
    reasoning: 'At 25 big blinds, {hand} remains a strong open, but a compact size preserves room to respond to action behind.',
    takeaway: 'As stacks shorten, use efficient open sizes and plan the response to an all-in before raising.',
    potBb: 1.5,
    pack: 'preflop-enter',
  },
] satisfies Array<CompactPreflopTemplate>;

const expandedPressureFactories = [
  {
    id: 'suited-broadway-call', focus: 'Calling in position', position: 'Button', opponentPosition: 'Cutoff',
    hands: [
      { label: 'K-Q suited', pattern: [[13, 0], [12, 0]] },
      { label: 'Q-J suited', pattern: [[12, 0], [11, 0]] },
      { label: 'J-10 suited', pattern: [[11, 0], [10, 0]] },
    ],
    opponentAction: 'Cutoff raises to 2.5 big blinds. Both blinds remain behind you.', prompt: 'What is the clearest baseline with {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'mistake', feedback: '{hand} has too much equity and playability to fold to a normal cutoff open.' },
      { id: 'call', label: 'Call 2.5 big blinds', grade: 'best', feedback: 'Calling keeps weaker hands in and uses your positional advantage.' },
      { id: 'raise', label: 'Raise to 8 big blinds', grade: 'reasonable', feedback: 'A re-raise can mix, but calling is the simplest way to realize this hand’s equity.' },
    ], bestChoiceId: 'call', reasoning: '{hand} performs well against a cutoff range and will usually have position. Calling avoids inflating the pot against stronger continues.',
    takeaway: 'Strong, playable hands can call in position without turning every continue into a re-raise.', potBb: 4, pack: 'preflop-pressure',
  },
  {
    id: 'dominated-broadway-fold', focus: 'Avoiding domination', position: 'Big blind', opponentPosition: 'Under the gun',
    hands: [
      { label: 'A-10 offsuit', pattern: [[14, 0], [10, 1]] },
      { label: 'K-J offsuit', pattern: [[13, 0], [11, 1]] },
      { label: 'Q-10 offsuit', pattern: [[12, 0], [10, 1]] },
    ],
    opponentAction: 'A disciplined early-position player raises to 3 big blinds.', prompt: 'How should you treat {hand} against this range?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'best', feedback: 'The early range dominates too many of your top-pair outcomes.' },
      { id: 'call', label: 'Call 2 big blinds', grade: 'mistake', feedback: 'A small discount does not repair poor playability against a strong range out of position.' },
      { id: 'raise', label: 'Raise to 10 big blinds', grade: 'mistake', feedback: 'This hand lacks the blockers and robust equity for a simple bluff re-raise.' },
    ], bestChoiceId: 'fold', reasoning: '{hand} often makes a second-best pair against a tight early open and must play every postflop street out of position.',
    takeaway: 'Fold dominated offsuit broadways more often as the opener moves earlier and uses a larger size.', potBb: 4.5, pack: 'preflop-pressure',
  },
  {
    id: 'set-mine-price', focus: 'Set-mining conditions', position: 'Button', opponentPosition: 'Under the gun',
    hands: [
      { label: 'pocket fives', pattern: [[5, 0], [5, 1]] },
      { label: 'pocket sixes', pattern: [[6, 0], [6, 1]] },
      { label: 'pocket sevens', pattern: [[7, 0], [7, 1]] },
    ],
    opponentAction: 'Early position raises to 2.5 big blinds. You are 100 big blinds deep and the blinds are passive.', prompt: 'Which response best uses {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'reasonable', feedback: 'Folding avoids variance, but the deep stacks and position make a call viable.' },
      { id: 'call', label: 'Call 2.5 big blinds', grade: 'best', feedback: 'Deep stacks and position provide enough upside when you flop a set.' },
      { id: 'raise', label: 'Raise to 8 big blinds', grade: 'reasonable', feedback: 'A re-raise can mix, but it often folds worse hands and faces strong continues.' },
    ], bestChoiceId: 'call', reasoning: '{hand} flops a set infrequently, so it needs deep stacks, a manageable price, and a good chance to realize its implied value.',
    takeaway: 'Set-mine only when the price, stack depth, position, and players behind support the future payoff.', potBb: 4, pack: 'preflop-pressure',
  },
  {
    id: 'ace-blocker-three-bet', focus: 'Blocker re-raise', position: 'Big blind', opponentPosition: 'Button',
    hands: [
      { label: 'A-5 suited', pattern: [[14, 0], [5, 0]] },
      { label: 'A-4 suited', pattern: [[14, 0], [4, 0]] },
      { label: 'A-3 suited', pattern: [[14, 0], [3, 0]] },
    ],
    opponentAction: 'An active button raises to 2.5 big blinds. Small blind folds.', prompt: 'Which aggressive option can {hand} support?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'reasonable', feedback: 'Folding is acceptable, but it gives up this hand’s blocker and suited playability.' },
      { id: 'call', label: 'Call 1.5 big blinds', grade: 'reasonable', feedback: 'Calling uses the price, though it leaves you out of position without initiative.' },
      { id: 'raise', label: 'Raise to 9 big blinds', grade: 'best', feedback: 'The ace blocks premium continues and the suited wheel card retains playable equity.' },
    ], bestChoiceId: 'raise', reasoning: '{hand} blocks A-A, A-K, and A-Q combinations while keeping straight and flush potential when called, making it a useful occasional pressure hand.',
    takeaway: 'Choose bluff re-raises for blockers and playability—not simply because the cards are weak.', potBb: 4, pack: 'preflop-pressure',
  },
  {
    id: 'squeeze-value', focus: 'Value squeezing', position: 'Small blind', opponentPosition: 'Cutoff and button',
    hands: [
      { label: 'pocket kings', pattern: [[13, 0], [13, 1]] },
      { label: 'pocket queens', pattern: [[12, 0], [12, 1]] },
      { label: 'A-K suited', pattern: [[14, 0], [13, 0]] },
    ],
    opponentAction: 'Cutoff raises to 2.5 big blinds and button calls. Big blind remains behind.', prompt: 'What is the clearest value line with {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'mistake', feedback: '{hand} is near the top of the range and cannot fold here.' },
      { id: 'call', label: 'Call 2 big blinds', grade: 'reasonable', feedback: 'Calling traps, but invites a four-way pot and misses value from both ranges.' },
      { id: 'raise', label: 'Raise to 12 big blinds', grade: 'best', feedback: 'A larger squeeze charges both players and reduces the chance of a crowded pot.' },
    ], bestChoiceId: 'raise', reasoning: '{hand} is far ahead of the opener and caller’s combined continuing ranges. Re-raising builds value and discourages the big blind from joining cheaply.',
    takeaway: 'When a raise gets called, expand the value size to charge both ranges and narrow the field.', potBb: 6.5, pack: 'preflop-pressure',
  },
  {
    id: 'marginal-four-bet-fold', focus: 'Facing a four-bet', position: 'Big blind', opponentPosition: 'Under the gun',
    hands: [
      { label: 'A-Q offsuit', pattern: [[14, 0], [12, 1]] },
      { label: 'pocket tens', pattern: [[10, 0], [10, 1]] },
      { label: 'A-J suited', pattern: [[14, 0], [11, 0]] },
    ],
    opponentAction: 'You three-bet an early open to 10 big blinds. The opener four-bets to 24 big blinds.', prompt: 'What is the disciplined baseline with {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'best', feedback: 'Against a strong early-position four-bet range, this hand lacks a robust continue.' },
      { id: 'call', label: 'Call 14 big blinds', grade: 'mistake', feedback: 'Calling creates a large out-of-position pot against a range that dominates you too often.' },
      { id: 'all-in', label: 'Move all-in', grade: 'mistake', feedback: 'A shove is usually called by hands with substantially better equity.' },
    ], bestChoiceId: 'fold', reasoning: 'The action and positions make the four-bet range very strong. The chips already invested do not justify continuing {hand} into poor equity.',
    takeaway: 'Plan before three-betting, then release marginal hands when later action represents a much stronger range.', potBb: 35.5, pack: 'preflop-pressure',
  },
  {
    id: 'short-stack-reshove', focus: 'Short-stack re-raise', position: 'Big blind', opponentPosition: 'Button',
    hands: [
      { label: 'A-K offsuit', pattern: [[14, 0], [13, 1]] },
      { label: 'pocket jacks', pattern: [[11, 0], [11, 1]] },
      { label: 'pocket queens', pattern: [[12, 0], [12, 1]] },
    ],
    opponentAction: 'Button raises to 2.5 big blinds. You have 20 big blinds effective.', prompt: 'How should stack depth shape the value response with {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'mistake', feedback: '{hand} is far too strong to fold against a late-position open.' },
      { id: 'call', label: 'Call 1.5 big blinds', grade: 'reasonable', feedback: 'Calling keeps the range wide, but misses the clean value of committing at this depth.' },
      { id: 'all-in', label: 'Raise all-in', grade: 'best', feedback: 'The low stack-to-pot ratio makes a direct value shove practical against a wide opener.' },
    ], bestChoiceId: 'all-in', reasoning: 'At 20 big blinds, {hand} has strong equity against a button opening and continuing range. An all-in denies equity and avoids awkward smaller re-raise sizes.',
    takeaway: 'Shorter stacks move strong preflop hands toward direct commitment against wide late-position opens.', potBb: 4, pack: 'preflop-pressure',
  },
  {
    id: 'suited-connector-defense', focus: 'Playable blind defense', position: 'Big blind', opponentPosition: 'Button',
    hands: [
      { label: '8-7 suited', pattern: [[8, 0], [7, 0]] },
      { label: '9-8 suited', pattern: [[9, 0], [8, 0]] },
      { label: '7-6 suited', pattern: [[7, 0], [6, 0]] },
    ],
    opponentAction: 'Button raises to 2.25 big blinds. Small blind folds; you have 1 big blind posted.', prompt: 'How should the price and playability affect {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'reasonable', feedback: 'Folding avoids a difficult position, but is too tight for this small price against a wide range.' },
      { id: 'call', label: 'Call 1.25 big blinds', grade: 'best', feedback: 'The discount and suited connectivity make this a practical big-blind call.' },
      { id: 'raise', label: 'Raise to 9 big blinds', grade: 'reasonable', feedback: 'A re-raise can mix, but calling is the simplest way to realize the hand’s playable equity.' },
    ], bestChoiceId: 'call', reasoning: '{hand} receives a favorable price and can make concealed straights and flushes. Those features help it realize equity despite acting first after the flop.',
    takeaway: 'Against small late opens, defend playable suited hands wider than disconnected offsuit holdings.', potBb: 3.75, pack: 'preflop-pressure',
  },
] satisfies Array<CompactPreflopTemplate>;

const intermediateThreeBetFactories = [
  {
    id: 'late-open-value-three-bet', focus: 'Value three-bet versus a late open', position: 'Big blind', opponentPosition: 'Button',
    difficulty: 'intermediate', effectiveStackBb: [80, 100],
    hands: [
      { label: 'pocket queens', pattern: [[12, 0], [12, 1]] },
      { label: 'pocket jacks', pattern: [[11, 0], [11, 1]] },
      { label: 'A-K suited', pattern: [[14, 0], [13, 0]] },
    ],
    opponentAction: 'Button raises to 2.5 big blinds and small blind folds.', prompt: 'Which plan gets the clearest value from {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'mistake', mistakeCategory: 'range', feedback: '{hand} is far ahead of a wide button opening range and cannot be folded.' },
      { id: 'call', label: 'Call 1.5 big blinds', grade: 'reasonable', feedback: 'Calling keeps the button wide, but misses value and lets them realize equity cheaply.' },
      { id: 'raise', label: 'Raise to 9 big blinds', grade: 'best', feedback: 'This size builds value, denies equity, and leaves room for worse strong hands to continue.' },
    ], bestChoiceId: 'raise', reasoning: '{hand} sits well ahead of a button opening and continuing range. A nine-big-blind out-of-position three-bet builds value without forcing every weaker hand out.',
    takeaway: 'Build the value core of a three-bet range before adding pressure hands.', potBb: 4, pack: 'preflop-three-bet',
  },
  {
    id: 'blocker-three-bet-plan', focus: 'Blocker three-bet', position: 'Big blind', opponentPosition: 'Button',
    difficulty: 'intermediate', effectiveStackBb: 100,
    hands: [
      { label: 'A-5 suited', pattern: [[14, 0], [5, 0]] },
      { label: 'A-4 suited', pattern: [[14, 0], [4, 0]] },
      { label: 'A-3 suited', pattern: [[14, 0], [3, 0]] },
    ],
    opponentAction: 'An active button raises to 2.5 big blinds and small blind folds.', prompt: 'Which aggressive plan has the best structure with {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'reasonable', feedback: 'Folding is acceptable, but gives up the ace blocker and suited wheel potential.' },
      { id: 'call', label: 'Call 1.5 big blinds', grade: 'reasonable', feedback: 'Calling uses the price, though it does not apply immediate pressure to the wide open.' },
      { id: 'raise', label: 'Raise to 9 big blinds', grade: 'best', feedback: 'The ace blocks premium continues and the suited low card retains several ways to improve.' },
    ], bestChoiceId: 'raise', reasoning: '{hand} removes combinations of aces, ace-king, and ace-queen while retaining straight and flush potential. Those properties make it a deliberate occasional bluff three-bet.',
    takeaway: 'Choose pressure hands for blockers and playability, not simply because they are too weak to call.', potBb: 4, pack: 'preflop-three-bet',
  },
  {
    id: 'out-of-position-three-bet-size', focus: 'Out-of-position three-bet sizing', position: 'Small blind', opponentPosition: 'Cutoff',
    difficulty: 'intermediate', effectiveStackBb: 100,
    hands: [
      { label: 'pocket queens', pattern: [[12, 0], [12, 1]] },
      { label: 'pocket jacks', pattern: [[11, 0], [11, 1]] },
      { label: 'A-K offsuit', pattern: [[14, 0], [13, 1]] },
    ],
    opponentAction: 'Cutoff raises to 2.5 big blinds. You will be out of position if called.', prompt: 'Which size best supports the value plan with {hand}?',
    choices: [
      { id: 'call', label: 'Call 2 big blinds', grade: 'reasonable', feedback: 'Calling is playable, but invites the big blind and misses a clear value re-raise.' },
      { id: 'small-raise', label: 'Raise to 6 big blinds', grade: 'mistake', mistakeCategory: 'sizing', feedback: 'This small size gives the opener and big blind an attractive price to realize equity.' },
      { id: 'raise', label: 'Raise to 11 big blinds', grade: 'best', feedback: 'The larger out-of-position size builds value and charges the opener for positional advantage.' },
    ], bestChoiceId: 'raise', reasoning: 'Out of position, {hand} benefits from a larger three-bet. Eleven big blinds creates value and reduces the opener’s ability to call cheaply with a wide range.',
    takeaway: 'Use a larger three-bet out of position than in position against the same opening size.', potBb: 4, pack: 'preflop-three-bet',
  },
  {
    id: 'facing-three-bet-position-call', focus: 'Calling a three-bet in position', position: 'Button', opponentPosition: 'Big blind',
    difficulty: 'intermediate', effectiveStackBb: 100,
    hands: [
      { label: 'K-Q suited', pattern: [[13, 0], [12, 0]] },
      { label: 'Q-J suited', pattern: [[12, 0], [11, 0]] },
      { label: 'J-10 suited', pattern: [[11, 0], [10, 0]] },
    ],
    opponentAction: 'You opened to 2.5 big blinds. Big blind three-bets to 10 big blinds.', prompt: 'What is the clearest baseline with {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'reasonable', feedback: 'Folding is conservative, but gives up a hand with useful equity and positional realization.' },
      { id: 'call', label: 'Call 7.5 big blinds', grade: 'best', feedback: 'Position and suited connectivity let this hand realize equity without inflating the pot again.' },
      { id: 'raise', label: 'Raise to 23 big blinds', grade: 'reasonable', feedback: 'A four-bet can mix selectively, but calling is the more stable baseline with this playable hand.' },
    ], bestChoiceId: 'call', reasoning: '{hand} can make strong pairs, straights, and flushes while acting last after the flop. Calling keeps dominated hands in and avoids isolating against the strongest continues.',
    takeaway: 'Position and robust playability can turn a three-bet call into the best baseline.', potBb: 13, pack: 'preflop-three-bet',
  },
  {
    id: 'facing-three-bet-dominated-fold', focus: 'Folding dominated hands to a three-bet', position: 'Cutoff', opponentPosition: 'Small blind',
    difficulty: 'intermediate', effectiveStackBb: [80, 100],
    hands: [
      { label: 'A-J offsuit', pattern: [[14, 0], [11, 1]] },
      { label: 'K-Q offsuit', pattern: [[13, 0], [12, 1]] },
      { label: 'A-10 offsuit', pattern: [[14, 0], [10, 1]] },
    ],
    opponentAction: 'You opened to 2.5 big blinds. Small blind three-bets to 11 big blinds and big blind folds.', prompt: 'How should you respond with {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'best', feedback: 'Release the dominated offsuit hand instead of defending the earlier opening investment.' },
      { id: 'call', label: 'Call 8.5 big blinds', grade: 'mistake', mistakeCategory: 'range', feedback: 'This hand makes too many second-best pairs against the stronger three-bet range.' },
      { id: 'all-in', label: 'Move all-in', grade: 'mistake', mistakeCategory: 'commitment', feedback: 'A shove is usually called by a range with substantially better equity.' },
    ], bestChoiceId: 'fold', reasoning: '{hand} is offsuit, frequently dominated, and faces a large out-of-position re-raise. The 2.5 big blinds already invested do not make an unprofitable continue correct.',
    takeaway: 'Treat the open as sunk cost; continue only when the hand survives the new range and price.', potBb: 14.5, pack: 'preflop-three-bet',
  },
  {
    id: 'four-bet-premium-value', focus: 'Four-betting for value', position: 'Button', opponentPosition: 'Small blind',
    difficulty: 'intermediate', effectiveStackBb: 100,
    hands: [
      { label: 'pocket aces', pattern: [[14, 0], [14, 1]] },
      { label: 'pocket kings', pattern: [[13, 0], [13, 1]] },
      { label: 'A-K suited', pattern: [[14, 0], [13, 0]] },
    ],
    opponentAction: 'You opened to 2.5 big blinds. Small blind three-bets to 11 big blinds and big blind folds.', prompt: 'Which line builds the clearest value with {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'mistake', mistakeCategory: 'range', feedback: '{hand} is at the top of the opening range and is much too strong to fold.' },
      { id: 'call', label: 'Call 8.5 big blinds', grade: 'reasonable', feedback: 'Calling can trap, but gives up the clearest opportunity to build the pot against strong continues.' },
      { id: 'raise', label: 'Raise to 24 big blinds', grade: 'best', feedback: 'A compact four-bet builds value while leaving the three-bettor room to continue with worse.' },
    ], bestChoiceId: 'raise', reasoning: '{hand} wants a larger pot against the small blind’s strong continuing hands. A controlled four-bet gains value without using an unnecessarily large all-in size.',
    takeaway: 'Four-bet the top of the range for value and choose a size that can still be called by worse.', potBb: 14.5, pack: 'preflop-three-bet',
  },
  {
    id: 'release-three-bet-bluff', focus: 'Releasing a three-bet bluff', position: 'Big blind', opponentPosition: 'Cutoff',
    difficulty: 'intermediate', effectiveStackBb: 100,
    hands: [
      { label: 'A-5 suited', pattern: [[14, 0], [5, 0]] },
      { label: 'A-4 suited', pattern: [[14, 0], [4, 0]] },
      { label: 'A-3 suited', pattern: [[14, 0], [3, 0]] },
    ],
    opponentAction: 'You three-bet a cutoff open to 10 big blinds. The opener four-bets to 24 big blinds.', prompt: 'What was the original plan with {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'best', feedback: 'The pressure hand has done its job; release it when the opponent represents a much stronger range.' },
      { id: 'call', label: 'Call 14 big blinds', grade: 'mistake', mistakeCategory: 'range', feedback: 'The suited ace does not have enough equity or realization against the four-bet range.' },
      { id: 'all-in', label: 'Move all-in', grade: 'mistake', mistakeCategory: 'commitment', feedback: 'Turning the bluff into a five-bet shove risks the stack against the opponent’s strongest hands.' },
    ], bestChoiceId: 'fold', reasoning: '{hand} was selected to create folds before the flop, not to continue against every later raise. The four-bet narrows the opponent to a range that dominates this pressure hand.',
    takeaway: 'A good three-bet bluff includes a disciplined fold plan when the opponent applies the final raise.', potBb: 35.5, pack: 'preflop-three-bet',
  },
  {
    id: 'short-stack-three-bet-plan', focus: 'Short-stack three-bet commitment', position: 'Big blind', opponentPosition: 'Button',
    difficulty: 'intermediate', effectiveStackBb: 30,
    hands: [
      { label: 'pocket queens', pattern: [[12, 0], [12, 1]] },
      { label: 'pocket jacks', pattern: [[11, 0], [11, 1]] },
      { label: 'A-K offsuit', pattern: [[14, 0], [13, 1]] },
    ],
    opponentAction: 'Button raises to 2.5 big blinds and small blind folds. Effective stacks are 30 big blinds.', prompt: 'Which plan uses the shorter stack best with {hand}?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'mistake', mistakeCategory: 'range', feedback: '{hand} is far too strong to fold against a wide button opening range.' },
      { id: 'call', label: 'Call 1.5 big blinds', grade: 'reasonable', feedback: 'Calling is playable, but misses value and lets the button realize equity cheaply.' },
      { id: 'raise', label: 'Raise to 8.5 big blinds', grade: 'best', feedback: 'The efficient size builds value and prepares to continue against a shove at this stack depth.' },
    ], bestChoiceId: 'raise', reasoning: 'At 30 big blinds, {hand} has strong equity against both the button open and a reasonable continuing range. A compact three-bet creates a low stack-to-pot ratio and a clear commitment plan.',
    takeaway: 'As stacks shorten, decide whether the value three-bet will continue against an all-in before raising.', potBb: 4, pack: 'preflop-three-bet',
  },
] satisfies Array<CompactPreflopTemplate>;

const intermediatePostflopRangeFactories = [
  {
    id: 'three-bet-pot-dry-range-bet', lessonId: 'lesson-postflop-three-bet-pots', focus: 'Dry three-bet-pot range bet', street: 'flop', position: 'Button', opponentPosition: 'Cutoff',
    effectiveStackBb: [80, 100], potBb: 21,
    states: [
      { label: 'K-Q offsuit', heroPattern: [[13, 0], [12, 1]], boardPattern: [[14, 2], [7, 3], [2, 0]] },
      { label: 'pocket queens', heroPattern: [[12, 0], [12, 1]], boardPattern: [[14, 2], [8, 3], [3, 0]] },
      { label: 'K-J suited', heroPattern: [[13, 0], [11, 0]], boardPattern: [[14, 2], [6, 3], [2, 1]] },
    ],
    opponentAction: 'You three-bet preflop, cutoff called, and now checks this dry flop.', prompt: 'Which flop plan best uses the range advantage with {hand}?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'reasonable', feedback: 'Checking can protect the range, but gives up a low-risk pressure opportunity on this dry board.' },
      { id: 'small', label: 'Bet 7 big blinds', grade: 'best', feedback: 'A one-third-pot bet uses the premium-heavy range while risking little against the caller’s weaker range.' },
      { id: 'large', label: 'Bet 21 big blinds', grade: 'mistake', mistakeCategory: 'sizing', feedback: 'A pot-sized bet risks too much when a small size pressures the same unpaired and medium-strength hands.' },
    ], bestChoiceId: 'small', reasoning: 'The three-bettor owns more strong aces, overpairs, and ace-king combinations on this dry ace-high board. A small bet applies that range advantage efficiently with {hand}.',
    takeaway: 'On dry high-card three-bet-pot flops, range advantage often supports a small, frequent bet.', pack: 'postflop-range',
  },
  {
    id: 'three-bet-pot-connected-check', lessonId: 'lesson-postflop-three-bet-pots', focus: 'Connected three-bet-pot restraint', street: 'flop', position: 'Button', opponentPosition: 'Cutoff',
    effectiveStackBb: [80, 100], potBb: 21,
    states: [
      { label: 'A-K offsuit', heroPattern: [[14, 0], [13, 1]], boardPattern: [[9, 2], [8, 3], [7, 2]] },
      { label: 'A-Q offsuit', heroPattern: [[14, 0], [12, 1]], boardPattern: [[10, 2], [9, 3], [8, 2]] },
      { label: 'K-Q offsuit', heroPattern: [[13, 0], [12, 1]], boardPattern: [[8, 2], [7, 3], [6, 2]] },
    ],
    opponentAction: 'You three-bet preflop, cutoff called, and now checks this connected flop.', prompt: 'How should the board interaction change the plan with {hand}?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'best', feedback: 'Checking preserves overcard equity and avoids inflating a pot on a board rich in strong calls and raises.' },
      { id: 'small', label: 'Bet 7 big blinds', grade: 'reasonable', feedback: 'A small bet can mix with better blockers, but this hand does not need to force immediate pressure.' },
      { id: 'large', label: 'Bet 21 big blinds', grade: 'mistake', mistakeCategory: 'range', feedback: 'The caller owns many pairs, two pair, sets, and draws that can continue or raise against a large bet.' },
    ], bestChoiceId: 'check', reasoning: 'The caller’s condensed range connects strongly with this low, coordinated flop. {hand} retains future equity but lacks the nut advantage required for a large automatic continuation bet.',
    takeaway: 'Three-betting preflop does not guarantee postflop range control on connected boards.', pack: 'postflop-range',
  },
  {
    id: 'caller-nut-advantage-restraint', lessonId: 'lesson-postflop-range-advantage', focus: 'Nut-advantage sizing', street: 'flop', position: 'Cutoff', opponentPosition: 'Big blind',
    effectiveStackBb: [80, 100], potBb: 6.5,
    states: [
      { label: 'pocket aces', heroPattern: [[14, 0], [14, 1]], boardPattern: [[8, 2], [7, 3], [6, 2]] },
      { label: 'pocket kings', heroPattern: [[13, 0], [13, 1]], boardPattern: [[9, 2], [8, 3], [7, 2]] },
      { label: 'pocket queens', heroPattern: [[12, 0], [12, 1]], boardPattern: [[7, 2], [6, 3], [5, 2]] },
    ],
    opponentAction: 'You opened preflop, big blind called, and now checks this low connected flop.', prompt: 'How should the caller’s nut advantage affect {hand}?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'reasonable', feedback: 'Checking protects the overpair and keeps the pot manageable against a range with more very strong hands.' },
      { id: 'medium', label: 'Bet 3.5 big blinds', grade: 'best', feedback: 'A controlled value-and-protection bet charges pairs and draws without forcing the largest pot.' },
      { id: 'large', label: 'Bet 6.5 big blinds', grade: 'mistake', mistakeCategory: 'range', feedback: 'A pot-sized bet builds the largest pot where the caller owns more straights, sets, and two-pair combinations.' },
    ], bestChoiceId: 'medium', reasoning: '{hand} can still earn value from pairs and draws, but the big blind owns more of the board’s strongest combinations. A controlled half-pot bet respects that nut advantage without surrendering value.',
    takeaway: 'Caller nut advantage should limit bet size and frequency, not erase every value bet.', pack: 'postflop-range',
  },
  {
    id: 'multiway-range-discipline', lessonId: 'lesson-postflop-range-advantage', focus: 'Multiway range discipline', street: 'flop', position: 'Cutoff', opponentPosition: 'Button · Big blind',
    effectiveStackBb: [60, 80, 100], potBb: 9,
    states: [
      { label: 'A-Q offsuit', heroPattern: [[14, 0], [12, 1]], boardPattern: [[13, 2], [8, 3], [7, 2]] },
      { label: 'Q-J offsuit', heroPattern: [[12, 0], [11, 1]], boardPattern: [[14, 2], [9, 3], [6, 2]] },
      { label: 'A-K offsuit', heroPattern: [[14, 0], [13, 1]], boardPattern: [[12, 2], [9, 3], [8, 2]] },
    ],
    opponentAction: 'You raised preflop and both button and big blind called. Both opponents check this flop.', prompt: 'What changes now that two ranges must continue against {hand}?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'best', feedback: 'Checking preserves overcard equity and respects that at least one of two callers connects more often.' },
      { id: 'small', label: 'Bet 3 big blinds', grade: 'reasonable', feedback: 'A small bet can mix selectively, but needs stronger blockers or backdoor equity against two ranges.' },
      { id: 'large', label: 'Bet 9 big blinds', grade: 'mistake', mistakeCategory: 'range', feedback: 'A pot-sized bluff must force folds from two ranges on a coordinated board, making the risk too high.' },
    ], bestChoiceId: 'check', reasoning: 'Multiway, each opponent can continue more selectively while the combined field connects more often. {hand} has useful overcards but not enough range support for automatic pressure.',
    takeaway: 'Bluff less multiway because one bet must work through several continuing ranges.', pack: 'postflop-range',
  },
  {
    id: 'equity-driven-turn-barrel', lessonId: 'lesson-postflop-turn-barrels', focus: 'Equity-driven turn barrel', street: 'turn', position: 'Button', opponentPosition: 'Big blind',
    effectiveStackBb: [80, 100], potBb: 18,
    states: [
      { label: 'A-5 suited', heroPattern: [[14, 0], [5, 0]], boardPattern: [[13, 0], [7, 1], [2, 0], [12, 2]] },
      { label: 'Q-J suited', heroPattern: [[12, 0], [11, 0]], boardPattern: [[13, 0], [9, 1], [2, 0], [4, 2]] },
      { label: '10-9 suited', heroPattern: [[10, 0], [9, 0]], boardPattern: [[12, 0], [7, 1], [2, 0], [13, 2]] },
    ],
    opponentAction: 'Big blind called your flop bet and checks the turn. You retain a strong flush draw.', prompt: 'Which turn plan keeps both winning paths alive with {hand}?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'reasonable', feedback: 'Checking guarantees realization of the draw, but gives up immediate fold equity against medium-strength hands.' },
      { id: 'medium', label: 'Bet 12 big blinds', grade: 'best', feedback: 'A controlled barrel combines draw equity with pressure on one-pair hands and weaker unpaired continues.' },
      { id: 'overbet', label: 'Bet 27 big blinds', grade: 'mistake', mistakeCategory: 'sizing', feedback: 'The oversized risk is unnecessary when a smaller bet can fold the same medium-strength range.' },
    ], bestChoiceId: 'medium', reasoning: '{hand} can improve to a strong flush and can also make better unpaired or one-pair hands fold. Those two paths support a controlled second barrel.',
    takeaway: 'Turn semi-bluffs work best when meaningful improvement equity and credible fold equity overlap.', pack: 'postflop-range',
  },
  {
    id: 'turn-favors-caller-check', lessonId: 'lesson-postflop-turn-barrels', focus: 'Turn card favors the caller', street: 'turn', position: 'Button', opponentPosition: 'Big blind',
    effectiveStackBb: [80, 100], potBb: 18,
    states: [
      { label: 'pocket queens', heroPattern: [[12, 0], [12, 1]], boardPattern: [[10, 2], [8, 3], [7, 2], [9, 1]] },
      { label: 'pocket aces', heroPattern: [[14, 0], [14, 1]], boardPattern: [[11, 2], [9, 3], [8, 2], [10, 1]] },
      { label: 'pocket kings', heroPattern: [[13, 0], [13, 1]], boardPattern: [[9, 2], [7, 3], [6, 2], [8, 1]] },
    ],
    opponentAction: 'Big blind called your flop bet and checks after the turn connects the middle ranks.', prompt: 'How should the range shift affect the overpair {hand}?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'best', feedback: 'Checking protects showdown value and avoids a large pot against newly completed straights and two pair.' },
      { id: 'small', label: 'Bet 6 big blinds', grade: 'reasonable', feedback: 'A small protection bet can mix, but must fold carefully when the caller applies strong pressure.' },
      { id: 'large', label: 'Bet 18 big blinds', grade: 'mistake', mistakeCategory: 'range', feedback: 'A pot-sized bet targets a turn that improves many of the caller’s pairs and draws into stronger hands.' },
    ], bestChoiceId: 'check', reasoning: 'The turn completes and strengthens many connected holdings in the big blind’s flop calling range. {hand} keeps showdown value, but the range shift makes pot control the clearest baseline.',
    takeaway: 'Rebuild the range comparison when a turn completes the caller’s natural draws and pair combinations.', pack: 'postflop-range',
  },
  {
    id: 'brick-turn-value-barrel', lessonId: 'lesson-postflop-turn-barrels', focus: 'Brick-turn value barrel', street: 'turn', position: 'Button', opponentPosition: 'Big blind',
    effectiveStackBb: [80, 100], potBb: 18,
    states: [
      { label: 'A-K offsuit', heroPattern: [[14, 0], [13, 1]], boardPattern: [[13, 2], [7, 3], [2, 0], [3, 1]] },
      { label: 'A-Q offsuit', heroPattern: [[14, 0], [12, 1]], boardPattern: [[12, 2], [8, 3], [3, 0], [4, 1]] },
      { label: 'K-Q suited', heroPattern: [[13, 0], [12, 0]], boardPattern: [[12, 2], [9, 3], [2, 1], [3, 2]] },
    ],
    opponentAction: 'Big blind called your flop bet and checks again after a low blank turn.', prompt: 'Which plan keeps extracting from weaker pairs and draws with {hand}?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'reasonable', feedback: 'Checking protects the hand, but misses value from weaker top pairs, second pairs, and available draws.' },
      { id: 'medium', label: 'Bet 10 big blinds', grade: 'best', feedback: 'A little over half pot charges draws while keeping several weaker made hands in the pot.' },
      { id: 'overbet', label: 'Bet 27 big blinds', grade: 'mistake', mistakeCategory: 'sizing', feedback: 'The oversized bet folds too much of the weaker range that the strong top pair wants to keep calling.' },
    ], bestChoiceId: 'medium', reasoning: 'The blank turn changes little and {hand} remains ahead of many flop calls. A controlled value barrel charges draws and weaker pairs without isolating against only the strongest hands.',
    takeaway: 'On a true blank, continue value betting when you can name several weaker hands that still call.', pack: 'postflop-range',
  },
  {
    id: 'no-equity-turn-give-up', lessonId: 'lesson-postflop-turn-barrels', focus: 'No-equity turn give-up', street: 'turn', position: 'Button', opponentPosition: 'Big blind',
    effectiveStackBb: [80, 100], potBb: 18,
    states: [
      { label: 'Q-J offsuit', heroPattern: [[12, 0], [11, 1]], boardPattern: [[14, 2], [8, 3], [7, 2], [6, 1]] },
      { label: 'K-Q offsuit', heroPattern: [[13, 0], [12, 1]], boardPattern: [[14, 2], [9, 3], [8, 2], [7, 1]] },
      { label: 'A-Q offsuit', heroPattern: [[14, 0], [12, 1]], boardPattern: [[13, 2], [7, 3], [6, 2], [5, 1]] },
    ],
    opponentAction: 'Big blind called your flop bet and checks after a turn that improves connected calling hands.', prompt: 'Does {hand} still have enough equity and fold pressure to barrel?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'best', feedback: 'Checking gives up cleanly when the hand has little improvement equity and the caller’s range strengthens.' },
      { id: 'medium', label: 'Bet 9 big blinds', grade: 'mistake', mistakeCategory: 'range', feedback: 'The called flop and connecting turn leave too few better hands likely to fold to another routine bet.' },
      { id: 'overbet', label: 'Bet 27 big blinds', grade: 'mistake', mistakeCategory: 'sizing', feedback: 'Increasing the size does not repair poor equity, weak blockers, and a turn that favors the caller.' },
    ], bestChoiceId: 'check', reasoning: '{hand} has little realistic improvement equity and the turn strengthens many flop calls. Without useful blockers or credible folds, a second bluff spends chips without a strong route to win.',
    takeaway: 'Give up when the turn removes both improvement equity and believable fold equity.', pack: 'postflop-range',
  },
] satisfies Array<CompactPostflopTemplate>;

const intermediateRiverFactories = [
  {
    id: 'river-thin-value-target', lessonId: 'lesson-postflop-river-polarization', focus: 'Thin river value', street: 'river', position: 'Button', opponentPosition: 'Big blind',
    effectiveStackBb: [80, 100], potBb: 32,
    states: [
      { label: 'K-Q offsuit', heroPattern: [[13, 0], [12, 1]], boardPattern: [[13, 2], [9, 3], [5, 2], [3, 1], [2, 0]] },
      { label: 'A-Q offsuit', heroPattern: [[14, 0], [12, 1]], boardPattern: [[14, 2], [8, 3], [6, 2], [4, 1], [2, 0]] },
      { label: 'K-J offsuit', heroPattern: [[13, 0], [11, 1]], boardPattern: [[13, 2], [8, 3], [4, 2], [3, 1], [2, 0]] },
    ],
    opponentAction: 'Big blind called modest flop and turn bets, then checks a blank river.', prompt: 'Which size keeps weaker one-pair hands calling against {hand}?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'reasonable', feedback: 'Checking guarantees showdown, but misses value from worse top pairs and stubborn lower pairs.' },
      { id: 'small', label: 'Bet 10 big blinds', grade: 'best', feedback: 'The inviting size targets weaker one-pair hands without forcing the range to become too strong.' },
      { id: 'overbet', label: 'Bet 48 big blinds', grade: 'mistake', mistakeCategory: 'sizing', feedback: 'The overbet folds many hands you beat and is more likely to be called by a stronger range.' },
    ], bestChoiceId: 'small', reasoning: '{hand} remains ahead of several natural bluff catchers on a blank river. A small value bet is sized for those worse calls instead of isolating against the top of the range.',
    takeaway: 'Thin value succeeds by giving weaker hands a price they can realistically pay.', pack: 'postflop-river',
  },
  {
    id: 'river-polarized-value', lessonId: 'lesson-postflop-river-polarization', focus: 'Polarized river value', street: 'river', position: 'Button', opponentPosition: 'Big blind',
    effectiveStackBb: [80, 100], potBb: 36,
    states: [
      { label: 'A-5 suited for the nut flush', heroPattern: [[14, 0], [5, 0]], boardPattern: [[13, 0], [8, 0], [12, 1], [3, 2], [2, 0]] },
      { label: 'A-4 suited for the nut flush', heroPattern: [[14, 0], [4, 0]], boardPattern: [[12, 0], [7, 0], [11, 1], [3, 2], [2, 0]] },
      { label: 'A-3 suited for the nut flush', heroPattern: [[14, 0], [3, 0]], boardPattern: [[13, 0], [9, 0], [11, 1], [4, 2], [2, 0]] },
    ],
    opponentAction: 'Big blind called the flop and turn, then checks after the river completes a front-door flush.', prompt: 'How can {hand} target a capped range containing lower flushes and bluff catchers?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'mistake', mistakeCategory: 'range', feedback: 'Checking removes value from the top of your range against several strong hands that can still call.' },
      { id: 'small', label: 'Bet 12 big blinds', grade: 'reasonable', feedback: 'A small bet earns calls, but leaves value behind against a range that can contain many strong bluff catchers.' },
      { id: 'overbet', label: 'Bet 54 big blinds', grade: 'best', feedback: 'The nut flush supports a polarized size that can be paid by lower flushes and selected bluff catchers.' },
    ], bestChoiceId: 'overbet', reasoning: '{hand} sits at the top of the river range while the checking opponent is less likely to hold the nuts. A large polarized bet builds value and supplies the value side needed for large river bluffs.',
    takeaway: 'Use the largest river sizes with hands that remain comfortable when called.', pack: 'postflop-river',
  },
  {
    id: 'river-showdown-check', lessonId: 'lesson-postflop-river-polarization', focus: 'Showdown-value river check', street: 'river', position: 'Button', opponentPosition: 'Big blind',
    effectiveStackBb: [80, 100], potBb: 28,
    states: [
      { label: 'pocket tens', heroPattern: [[10, 0], [10, 1]], boardPattern: [[13, 2], [9, 3], [6, 2], [4, 1], [2, 0]] },
      { label: 'A-9 offsuit', heroPattern: [[14, 0], [9, 1]], boardPattern: [[13, 2], [9, 3], [7, 2], [4, 1], [2, 0]] },
      { label: 'Q-9 suited', heroPattern: [[12, 0], [9, 0]], boardPattern: [[14, 2], [9, 3], [6, 2], [4, 1], [2, 1]] },
    ],
    opponentAction: 'Big blind called one flop bet and both players checked the turn. Big blind checks the river.', prompt: 'Does {hand} have a clear worse calling target?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'best', feedback: 'The hand retains useful showdown value but cannot name enough weaker hands that pay a river bet.' },
      { id: 'small', label: 'Bet 8 big blinds', grade: 'reasonable', feedback: 'A very small bet can sometimes target a lower pair, but the value margin is narrow.' },
      { id: 'large', label: 'Bet 28 big blinds', grade: 'mistake', mistakeCategory: 'range', feedback: 'A pot-sized bet folds weaker hands and receives action from a range that usually has this medium hand beaten.' },
    ], bestChoiceId: 'check', reasoning: '{hand} can win at showdown, but a large river bet has no stable target: weaker hands fold while stronger pairs continue. Checking preserves the hand’s existing value.',
    takeaway: 'Medium-strength river hands belong in the checking range when worse calls are hard to name.', pack: 'postflop-river',
  },
  {
    id: 'river-blocker-bluff', lessonId: 'lesson-postflop-river-polarization', focus: 'Blocker-led river bluff', street: 'river', position: 'Button', opponentPosition: 'Big blind',
    effectiveStackBb: [80, 100], potBb: 24,
    states: [
      { label: 'A-5 offsuit with the nut-suit blocker', heroPattern: [[14, 0], [5, 1]], boardPattern: [[13, 0], [8, 2], [3, 0], [12, 1], [2, 0]] },
      { label: 'A-4 offsuit with the nut-suit blocker', heroPattern: [[14, 0], [4, 1]], boardPattern: [[12, 0], [9, 2], [3, 0], [11, 1], [2, 0]] },
      { label: 'A-3 offsuit with the nut-suit blocker', heroPattern: [[14, 0], [3, 1]], boardPattern: [[13, 0], [8, 2], [4, 0], [11, 1], [2, 0]] },
    ],
    opponentAction: 'Big blind called the flop, both players checked the turn, and big blind checks when the third flush card arrives.', prompt: 'Which bluff size best uses the blocker carried by {hand}?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'reasonable', feedback: 'Giving up is acceptable, but it does not use the nut-suit blocker against a capped checking range.' },
      { id: 'small', label: 'Bet 8 big blinds', grade: 'mistake', mistakeCategory: 'sizing', feedback: 'A small bet gives many pairs and low flushes an easy bluff-catching price.' },
      { id: 'large', label: 'Bet 36 big blinds', grade: 'best', feedback: 'The polarized size pressures one-pair hands while the nut-suit blocker removes important strong calls.' },
    ], bestChoiceId: 'large', reasoning: '{hand} has little showdown value, blocks the nut flush, and does not block many one-pair folds. Those properties make it a more credible large bluff than a random missed hand.',
    takeaway: 'Choose river bluffs that block calls and leave likely folds in the opponent’s range.', pack: 'postflop-river',
  },
  {
    id: 'river-bad-bluff-candidate', lessonId: 'lesson-postflop-river-polarization', focus: 'Bad river bluff candidate', street: 'river', position: 'Button', opponentPosition: 'Big blind',
    effectiveStackBb: [80, 100], potBb: 24,
    states: [
      { label: 'Q-J offsuit without a flush blocker', heroPattern: [[12, 1], [11, 2]], boardPattern: [[13, 0], [8, 2], [3, 0], [9, 1], [2, 0]] },
      { label: 'J-10 offsuit without a flush blocker', heroPattern: [[11, 1], [10, 2]], boardPattern: [[12, 0], [8, 2], [4, 0], [9, 1], [2, 0]] },
      { label: '10-9 offsuit without a flush blocker', heroPattern: [[10, 1], [9, 2]], boardPattern: [[11, 0], [7, 2], [4, 0], [8, 1], [2, 0]] },
    ],
    opponentAction: 'A bluff-catching opponent called the flop, both players checked the turn, and the opponent checks a flush-completing river.', prompt: 'Should the missed draw in {hand} automatically become a bluff?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'best', feedback: 'Giving up avoids attacking a sticky range with poor blockers and no showdown value.' },
      { id: 'small', label: 'Bet 8 big blinds', grade: 'mistake', mistakeCategory: 'sizing', feedback: 'The small size offers an attractive call to the exact one-pair range you need to fold.' },
      { id: 'large', label: 'Bet 36 big blinds', grade: 'mistake', mistakeCategory: 'range', feedback: 'A large bluff is unsupported when the hand blocks likely folds and leaves the strongest calls available.' },
    ], bestChoiceId: 'check', reasoning: '{hand} missed, but that fact alone does not make it a good bluff. The opponent calls too often and the hand lacks a useful blocker to the strongest river continues.',
    takeaway: 'Missed draws need credible folds and useful blockers before becoming river bluffs.', pack: 'postflop-river',
  },
  {
    id: 'river-bluff-catch-call', lessonId: 'lesson-postflop-river-bluff-catchers', focus: 'Bluff catch at a fair price', street: 'river', position: 'Button', opponentPosition: 'Big blind',
    effectiveStackBb: [60, 80, 100], potBb: 24,
    states: [
      { label: 'A-J offsuit for top pair', heroPattern: [[14, 0], [11, 1]], boardPattern: [[11, 2], [8, 3], [6, 2], [3, 1], [2, 0]] },
      { label: 'K-Q offsuit for top pair', heroPattern: [[13, 0], [12, 1]], boardPattern: [[12, 2], [9, 3], [6, 2], [4, 1], [2, 0]] },
      { label: 'A-10 offsuit for top pair', heroPattern: [[14, 0], [10, 1]], boardPattern: [[10, 2], [7, 3], [5, 2], [3, 1], [2, 0]] },
    ],
    opponentAction: 'Big blind leads 8 big blinds into 24 on a blank river after several natural draws miss.', prompt: 'If {hand} wins about 28% of the time, what does the price support?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'mistake', mistakeCategory: 'range', feedback: 'Folding gives up when the estimated win rate exceeds the 20% break-even threshold.' },
      { id: 'call', label: 'Call 8 big blinds', grade: 'best', feedback: 'The call needs 20% equity and the plausible missed draws support an estimate above that price.' },
      { id: 'raise', label: 'Raise to 28 big blinds', grade: 'mistake', mistakeCategory: 'commitment', feedback: 'Turning a profitable bluff catcher into a raise folds bluffs and receives action from stronger value.' },
    ], bestChoiceId: 'call', reasoning: 'Calling 8 to win a final pot of 40 requires 20% equity. The estimated 28% win rate clears that threshold, so calling is the price-aware baseline without overplaying the hand.',
    takeaway: 'Small river bets can justify bluff catches when enough missed draws remain.', pack: 'postflop-river',
    calculation: { callAmountBb: 8, finalPotBb: 40, requiredEquityPercent: 20, estimatedEquityPercent: 28 },
  },
  {
    id: 'river-bluff-catch-fold', lessonId: 'lesson-postflop-river-bluff-catchers', focus: 'Fold bluff catcher to an overbet', street: 'river', position: 'Button', opponentPosition: 'Big blind',
    effectiveStackBb: [80, 100], potBb: 24,
    states: [
      { label: 'A-J offsuit for top pair', heroPattern: [[14, 0], [11, 1]], boardPattern: [[11, 2], [8, 3], [6, 2], [3, 1], [2, 0]] },
      { label: 'K-Q offsuit for top pair', heroPattern: [[13, 0], [12, 1]], boardPattern: [[12, 2], [9, 3], [6, 2], [4, 1], [2, 0]] },
      { label: 'A-10 offsuit for top pair', heroPattern: [[14, 0], [10, 1]], boardPattern: [[10, 2], [7, 3], [5, 2], [3, 1], [2, 0]] },
    ],
    opponentAction: 'A value-heavy big blind overbets 30 big blinds into 24 on a blank river.', prompt: 'If {hand} wins only about 20% of the time, what does the new price require?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'best', feedback: 'The disciplined fold avoids paying a 36% threshold with an estimated win rate near 20%.' },
      { id: 'call', label: 'Call 30 big blinds', grade: 'mistake', mistakeCategory: 'range', feedback: 'The call needs about 36% equity, far above the realistic bluff estimate for this value-heavy line.' },
      { id: 'raise', label: 'Raise all-in', grade: 'mistake', mistakeCategory: 'commitment', feedback: 'A bluff raise risks the remaining stack against a polarized range that is already too value-heavy.' },
    ], bestChoiceId: 'fold', reasoning: 'Calling 30 to win a final pot of 84 requires about 36% equity. An estimated 20% win rate falls well short, so the same top-pair bluff catcher must be released at this larger price.',
    takeaway: 'The hand can stay the same while the bet size changes a call into a fold.', pack: 'postflop-river',
    calculation: { callAmountBb: 30, finalPotBb: 84, requiredEquityPercent: 36, estimatedEquityPercent: 20 },
  },
  {
    id: 'river-raise-discipline', lessonId: 'lesson-postflop-river-bluff-catchers', focus: 'River raise discipline', street: 'river', position: 'Button', opponentPosition: 'Big blind',
    effectiveStackBb: [80, 100], potBb: 24,
    states: [
      { label: 'Q-J suited for a queen-high flush', heroPattern: [[12, 0], [11, 0]], boardPattern: [[13, 0], [8, 0], [6, 2], [3, 1], [2, 0]] },
      { label: 'J-10 suited for a jack-high flush', heroPattern: [[11, 0], [10, 0]], boardPattern: [[12, 0], [8, 0], [6, 2], [3, 1], [2, 0]] },
      { label: '10-9 suited for a ten-high flush', heroPattern: [[10, 0], [9, 0]], boardPattern: [[11, 0], [7, 0], [6, 2], [3, 1], [2, 0]] },
    ],
    opponentAction: 'Big blind bets 8 big blinds into 24 on a three-flush river. The nut flush remains possible.', prompt: 'How should {hand} continue without folding out the bluffs it beats?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'reasonable', feedback: 'Folding is cautious, but gives up too much against a small bet containing weaker value and bluffs.' },
      { id: 'call', label: 'Call 8 big blinds', grade: 'best', feedback: 'Calling keeps bluffs and weaker flushes in while limiting losses to the nut-heavy part of the range.' },
      { id: 'raise', label: 'Raise to 28 big blinds', grade: 'mistake', mistakeCategory: 'range', feedback: 'Raising folds many worse hands and is most likely to receive action from higher flushes.' },
    ], bestChoiceId: 'call', reasoning: '{hand} is strong enough to continue, but a raise has poor value targeting: worse hands often fold and better flushes continue. Calling preserves the opponent’s bluffs and controls the final pot.',
    takeaway: 'Before raising the river, name worse hands that can actually call the raise.', pack: 'postflop-river',
  },
] satisfies Array<CompactPostflopTemplate>;

const enterPotExpansion = expandedEnterPotFactories.map(compactPreflopFactory);
const pressureExpansion = expandedPressureFactories.map(compactPreflopFactory);
const threeBetExpansion = intermediateThreeBetFactories.map(compactPreflopFactory);
const postflopRangeExpansion = intermediatePostflopRangeFactories.map(compactPostflopFactory);
const riverExpansion = intermediateRiverFactories.map(compactPostflopFactory);

const beginnerPreflopScenarioFactories: ScenarioFactory[] = [
  strongButtonValue,
  weakBlindDefense,
  isolateLimper,
  premiumFacingThreeBet,
  earlyPositionDiscipline,
  ...enterPotExpansion,
  ...pressureExpansion,
];

const preflopScenarioFactories: ScenarioFactory[] = [
  ...beginnerPreflopScenarioFactories,
  ...threeBetExpansion,
];

const postflopScenarioFactories: ScenarioFactory[] = [
  flushDrawPrice,
  turnValueBet,
  riverBluffCatch,
  missedDrawDiscipline,
  potControl,
  riverThinValueSize,
  semiBluffSizing,
  turnStraightDrawPrice,
  overpricedTurnFlushDraw,
  ...postflopRangeExpansion,
  ...riverExpansion,
];

const scenarioFactories: ScenarioFactory[] = [
  ...preflopScenarioFactories,
  ...postflopScenarioFactories,
];

const scenarioFactoriesByPack: Record<PracticePackId, ScenarioFactory[]> = {
  preflop: [
    ...beginnerPreflopScenarioFactories,
  ],
  'preflop-enter': [
    strongButtonValue,
    isolateLimper,
    earlyPositionDiscipline,
    ...enterPotExpansion,
  ],
  'preflop-pressure': [
    weakBlindDefense,
    premiumFacingThreeBet,
    ...pressureExpansion,
  ],
  'preflop-three-bet': [
    ...threeBetExpansion,
  ],
  betting: [
    turnValueBet,
    missedDrawDiscipline,
    potControl,
    riverThinValueSize,
    semiBluffSizing,
  ],
  odds: [
    weakBlindDefense,
    flushDrawPrice,
    riverBluffCatch,
    turnStraightDrawPrice,
    overpricedTurnFlushDraw,
  ],
  'postflop-range': [
    ...postflopRangeExpansion,
  ],
  'postflop-river': [
    ...riverExpansion,
  ],
};

let generatedSeed = 25_000;

export const scenarioTemplateCount = scenarioFactories.length;
export const scenarioSessionSize = SESSION_SIZE;
export const focusedScenarioSessionSize = FOCUSED_SESSION_SIZE;

export interface ScenarioSessionDecision {
  focus: string;
  grade: ScenarioChoiceGrade;
  lessonId?: string;
}

export interface ScenarioSessionRecap {
  focus: { label: string; lessonId?: string } | null;
  strengths: string[];
}

export function buildScenarioSessionRecap(
  decisions: readonly ScenarioSessionDecision[],
): ScenarioSessionRecap {
  if (decisions.length === 0) return { focus: null, strengths: [] };

  const gradePoints: Record<ScenarioChoiceGrade, number> = {
    best: 2,
    reasonable: 1,
    mistake: 0,
  };
  const ranked = decisions.map((decision, index) => ({ decision, index }));
  const focusDecision = ranked.reduce((weakest, candidate) => (
    gradePoints[candidate.decision.grade] < gradePoints[weakest.decision.grade]
      ? candidate
      : weakest
  )).decision;
  const strengths = ranked
    .filter(({ decision }) => decision.focus !== focusDecision.focus)
    .sort((left, right) => (
      gradePoints[right.decision.grade] - gradePoints[left.decision.grade]
      || left.index - right.index
    ))
    .map(({ decision }) => decision.focus)
    .filter((focus, index, values) => values.indexOf(focus) === index)
    .slice(0, 2);

  return {
    focus: { label: focusDecision.focus, lessonId: focusDecision.lessonId },
    strengths,
  };
}

export function scenarioFamilyId(id: string): string {
  return id.replace(/-\d+$/, '');
}

export function selectFreshestScenarioSession(
  candidates: readonly ScenarioSpot[][],
  previous: readonly ScenarioSpot[],
): ScenarioSpot[] {
  const previousFamilies = new Set(previous.map((scenario) => scenarioFamilyId(scenario.id)));
  return candidates.reduce<ScenarioSpot[]>((freshest, candidate) => {
    if (freshest.length === 0) return candidate;
    const overlap = candidate.filter((scenario) => previousFamilies.has(scenarioFamilyId(scenario.id))).length;
    const freshestOverlap = freshest.filter((scenario) => previousFamilies.has(scenarioFamilyId(scenario.id))).length;
    return overlap < freshestOverlap ? candidate : freshest;
  }, []);
}

export function generateScenarioSession(seed = Date.now() + generatedSeed++, count = SESSION_SIZE): ScenarioSpot[] {
  const random = mulberry32(seed);
  return generateScenarioSessionFromRandom(random, seed, count);
}

export function generateScenarioSessionFromRandom(
  random: RandomSource,
  variant = Math.floor(random() * 0x1_0000_0000),
  count = SESSION_SIZE,
): ScenarioSpot[] {
  const normalizedCount = Math.min(Math.max(1, count), scenarioFactories.length);
  const factories = normalizedCount === scenarioFactories.length
    ? shuffle(random, scenarioFactories)
    : shuffle(random, [
      ...shuffle(random, preflopScenarioFactories).slice(0, Math.ceil(normalizedCount / 2)),
      ...shuffle(random, postflopScenarioFactories).slice(0, Math.floor(normalizedCount / 2)),
    ]);
  return factories
    .map((factory, index) => factory(random, variant * 10 + index));
}

export function scenarioTemplateCountForPack(id: PracticePackId): number {
  return scenarioFactoriesByPack[practicePackById(id).id].length;
}

export function generateFocusedScenarioSession(
  focus: string,
  seed = Date.now() + generatedSeed++,
  count = FOCUSED_SESSION_SIZE,
): ScenarioSpot[] {
  const random = mulberry32(seed);
  return generateFocusedScenarioSessionFromRandom(focus, random, seed, count);
}

export function generateFocusedScenarioSessionFromRandom(
  focus: string,
  random: RandomSource,
  variant = Math.floor(random() * 0x1_0000_0000),
  count = FOCUSED_SESSION_SIZE,
): ScenarioSpot[] {
  const pack = practicePackForFocus(focus);
  if (!pack) return generateScenarioSessionFromRandom(random, variant, count);
  const factories = scenarioFactoriesByPack[pack.id];
  return shuffle(random, factories)
    .slice(0, Math.min(Math.max(1, count), factories.length))
    .map((factory, index) => factory(random, variant * 10 + index));
}

export function generateScenarioSessionForPackFromRandom(
  packId: PracticePackId,
  random: RandomSource,
  variant = Math.floor(random() * 0x1_0000_0000),
  count = FOCUSED_SESSION_SIZE,
): ScenarioSpot[] {
  const factories = scenarioFactoriesByPack[practicePackById(packId).id];
  return shuffle(random, factories)
    .slice(0, Math.min(Math.max(1, count), factories.length))
    .map((factory, index) => factory(random, variant * 10 + index));
}

export function generateScenarioSessionForPack(
  packId: PracticePackId,
  seed = Date.now() + generatedSeed++,
  count = FOCUSED_SESSION_SIZE,
): ScenarioSpot[] {
  return generateScenarioSessionForPackFromRandom(packId, mulberry32(seed), seed, count);
}

export function focusedScenarioTrainer(
  focus: string,
  scenarios: ScenarioSpot[],
): ScenarioTrainerDefinition {
  const pack = practicePackForFocus(focus);
  if (!pack) return { ...scenarioTrainer, scenarios };
  return {
    id: pack.progressActivityId,
    type: 'scenario_drill',
    title: pack.title,
    description: pack.description,
    estimatedMinutes: 5,
    scenarios,
  };
}

export function scenarioTrainerForPack(
  packId: PracticePackId,
  scenarios: ScenarioSpot[],
): ScenarioTrainerDefinition {
  const pack = practicePackById(packId);
  return {
    id: pack.progressActivityId,
    type: 'scenario_drill',
    title: pack.title,
    description: pack.description,
    estimatedMinutes: 5,
    scenarios,
  };
}

export const scenarioTrainer: ScenarioTrainerDefinition = {
  id: 'scenario-core-decisions',
  type: 'scenario_drill',
  title: 'Scenario training',
  description: 'Fresh cards, positions, and table math every session',
  estimatedMinutes: 6,
  scenarios: generateScenarioSession(20_260_801),
};

export function scenarioChoicePoints(choice: ScenarioChoice): number {
  if (choice.grade === 'best') return 1;
  if (choice.grade === 'reasonable') return 0.5;
  return 0;
}
