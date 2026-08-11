import type { Card, Rank, Suit } from '../poker/types';
import { practicePackById, practicePackForFocus } from './practicePacks';
import type {
  PracticePackId,
  ScenarioChoice,
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
  focus: string;
  hands: Array<{ label: string; pattern: Array<[Rank, number]> }>;
  id: string;
  opponentAction: string;
  opponentPosition: string;
  pack: 'preflop-enter' | 'preflop-pressure';
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
      focus: config.focus,
      street: 'preflop',
      position: config.position,
      opponentPosition: config.opponentPosition,
      effectiveStackBb: pick(random, [40, 60, 80, 100]),
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

const enterPotExpansion = expandedEnterPotFactories.map(compactPreflopFactory);
const pressureExpansion = expandedPressureFactories.map(compactPreflopFactory);

const preflopScenarioFactories: ScenarioFactory[] = [
  strongButtonValue,
  weakBlindDefense,
  isolateLimper,
  premiumFacingThreeBet,
  earlyPositionDiscipline,
  ...enterPotExpansion,
  ...pressureExpansion,
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
];

const scenarioFactories: ScenarioFactory[] = [
  ...preflopScenarioFactories,
  ...postflopScenarioFactories,
];

const scenarioFactoriesByPack: Record<PracticePackId, ScenarioFactory[]> = {
  preflop: [
    ...preflopScenarioFactories,
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
};

let generatedSeed = 25_000;

export const scenarioTemplateCount = scenarioFactories.length;
export const scenarioSessionSize = SESSION_SIZE;
export const focusedScenarioSessionSize = FOCUSED_SESSION_SIZE;

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
