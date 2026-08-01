import type { Card, Rank, Suit } from '../poker/types';
import type { ScenarioChoice, ScenarioSpot, ScenarioTrainerDefinition } from './types';

const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const SESSION_SIZE = 6;

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
    prompt: 'What is your clearest beginner baseline?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'mistake', feedback: `${hand.label} is far too strong to release against one random big-blind hand.` },
      { id: 'limp', label: 'Call 0.5 BB', grade: 'reasonable', feedback: 'Some strong strategies mix limps, but raising is the simpler value-first baseline.' },
      { id: 'raise', label: `Raise to ${formatBb(raiseTo)} BB`, grade: 'best', feedback: 'You build value, pressure weaker hands, and keep the positional advantage after the flop.' },
    ],
    bestChoiceId: 'raise',
    reasoning: `${hand.label} is comfortably ahead of a random big-blind hand. A ${formatBb(raiseTo)} BB raise earns value now without risking an excessive part of the ${stack} BB stack.`,
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
    opponentAction: `Button raises to ${formatBb(openTo)} BB. You have 1 BB invested and must call ${formatBb(callAmount)} BB.`,
    prompt: 'How should you defend?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'best', feedback: `The large size worsens your price, and ${hand.label} realizes equity poorly out of position.` },
      { id: 'call', label: `Call ${formatBb(callAmount)} BB`, grade: 'mistake', feedback: `The call needs about ${required}% equity before accounting for poor playability. Your posted blind is already part of the pot.` },
      { id: 'raise', label: `Raise to ${formatBb(openTo * 3)} BB`, grade: 'mistake', feedback: 'This hand has poor blockers and playability, making it a weak bluff candidate.' },
    ],
    bestChoiceId: 'fold',
    reasoning: `Calling ${formatBb(callAmount)} BB creates a ${formatBb(finalPot)} BB final pot, a ${required}% price. ${hand.label} remains a weak, disconnected holding that must act first after the flop.`,
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
    opponentAction: `Big blind bets ${formatBb(bet)} BB into ${basePot} BB. The displayed pot is now ${formatBb(currentPot)} BB.`,
    prompt: 'Choose the cleanest response with the nut-flush draw.',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'mistake', feedback: `Nine clean flush outs have about 35% equity by the river, comfortably above this ${required}% price.` },
      { id: 'call', label: `Call ${formatBb(bet)} BB`, grade: 'best', feedback: `Calling needs ${required}% equity, while nine clean flush outs hit about 35% of the time by the river.` },
      { id: 'raise', label: `Raise to ${formatBb(Math.round(basePot * 1.7))} BB`, grade: 'reasonable', feedback: 'A semi-bluff can work, but it adds fold-equity assumptions. Calling is the clearest mathematical baseline.' },
    ],
    bestChoiceId: 'call',
    reasoning: `After your ${formatBb(bet)} BB call, the final pot is ${formatBb(finalPot)} BB: ${formatBb(bet)} ÷ ${formatBb(finalPot)} = ${required}%. Nine clean flush outs are about 35% with two cards to come.`,
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
    prompt: `How do you continue with ${hand.label}?`,
    choices: [
      { id: 'check', label: 'Check', grade: 'reasonable', feedback: 'Checking controls the pot, but it misses value from weaker pairs and draws.' },
      { id: 'bet', label: `Bet ${formatBb(bet)} BB`, grade: 'best', feedback: 'A half-pot bet targets several worse hands while charging available draws.' },
      { id: 'all-in', label: 'Move all-in', grade: 'mistake', feedback: 'An oversized shove folds too much of the weaker range you want to keep calling.' },
    ],
    bestChoiceId: 'bet',
    reasoning: `You can name several worse hands that continue. Betting ${formatBb(bet)} BB into ${pot} BB captures value without isolating you against only very strong hands.`,
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
    opponentAction: `Big blind bets ${formatBb(bet)} BB into ${basePot} BB. You estimate this bluff catcher wins ${estimated}% of the time.`,
    prompt: 'What does the price tell you to do?',
    choices: [
      { id: 'fold', label: 'Fold', grade: 'best', feedback: `You need about ${required}% equity, so a trustworthy ${estimated}% estimate cannot support a call.` },
      { id: 'call', label: `Call ${formatBb(bet)} BB`, grade: 'mistake', feedback: 'Top pair looks attractive, but the call loses when your equity estimate is below the price.' },
      { id: 'raise', label: 'Raise all-in', grade: 'mistake', feedback: 'Turning showdown value into a bluff needs blocker and fold evidence you do not have.' },
    ],
    bestChoiceId: 'fold',
    reasoning: `Calling ${formatBb(bet)} BB makes the final pot ${formatBb(finalPot)} BB. Required equity is ${formatBb(bet)} ÷ ${formatBb(finalPot)} ≈ ${required}%, above the stated ${estimated}% win estimate.`,
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
    prompt: 'Should the missed draw bluff?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'best', feedback: 'Low fold equity and poor blockers make this a disciplined give-up.' },
      { id: 'small', label: `Bet ${formatBb(pot / 3)} BB`, grade: 'mistake', feedback: 'A small bet gives a call-heavy opponent an easy price and lacks a clear better-hand target.' },
      { id: 'pot', label: `Bet ${pot} BB`, grade: 'mistake', feedback: 'A bigger bet risks more chips without evidence this opponent will release enough pairs.' },
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
    prompt: 'How should you handle second pair with a strong kicker?',
    choices: [
      { id: 'check', label: 'Check back', grade: 'best', feedback: 'Checking realizes your showdown value and avoids building a large pot against stronger pairs.' },
      { id: 'small', label: `Bet ${formatBb(pot / 3)} BB`, grade: 'reasonable', feedback: 'A small protection bet can be mixed, but many worse hands fold while stronger hands continue.' },
      { id: 'large', label: `Bet ${pot} BB`, grade: 'mistake', feedback: 'A pot-sized bet isolates this medium-strength hand against too much of the stronger range.' },
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
    opponentAction: 'Cutoff limps for 1 BB. The small blind and big blind are still waiting behind you.',
    prompt: `What is the clearest plan with ${hand.label}?`,
    choices: [
      { id: 'fold', label: 'Fold', grade: 'mistake', feedback: `${hand.label} is much too strong to fold against one limp.` },
      { id: 'call', label: 'Call 1 BB', grade: 'reasonable', feedback: 'Calling keeps the pot small, but it invites both blinds and gives up a strong isolation opportunity.' },
      { id: 'raise', label: `Raise to ${formatBb(raiseTo)} BB`, grade: 'best', feedback: 'Raising builds value, discourages the blinds, and aims to play in position against the limper.' },
    ],
    bestChoiceId: 'raise',
    reasoning: `${hand.label} is ahead of a typical limp range. Raising to ${formatBb(raiseTo)} BB charges that range and reduces the chance of playing a crowded pot.`,
    takeaway: 'Use position and strong hands to isolate weaker limps rather than automatically joining them.',
  });
};

const scenarioFactories: ScenarioFactory[] = [
  strongButtonValue,
  weakBlindDefense,
  flushDrawPrice,
  turnValueBet,
  riverBluffCatch,
  missedDrawDiscipline,
  potControl,
  isolateLimper,
];

let generatedSeed = 25_000;

export const scenarioTemplateCount = scenarioFactories.length;
export const scenarioSessionSize = SESSION_SIZE;

export function generateScenarioSession(seed = Date.now() + generatedSeed++, count = SESSION_SIZE): ScenarioSpot[] {
  const random = mulberry32(seed);
  return shuffle(random, scenarioFactories)
    .slice(0, Math.min(Math.max(1, count), scenarioFactories.length))
    .map((factory, index) => factory(random, seed * 10 + index));
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
