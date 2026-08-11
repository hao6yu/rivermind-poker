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

export const fundamentalsLessons: LessonDefinition[] = [
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

export const preflopStrategyLessons: LessonDefinition[] = [
  {
    id: 'lesson-preflop-opening-position',
    type: 'lesson',
    title: 'Open the pot by position',
    description: 'Enter tighter early and wider late',
    estimatedMinutes: 5,
    sections: [
      {
        heading: 'First identify who is still behind',
        body: 'An unopened pot means nobody has called or raised before you. Early position requires stronger hands because several players can still find a premium hand. Late position lets you open more hands because fewer ranges remain and you are more likely to act last after the flop.',
        takeaway: 'Use a tighter entry range when more players are still waiting to act.',
      },
      {
        heading: 'Raise instead of open-limping',
        body: 'A raise can win the blinds immediately, build value with stronger hands, and reduce the chance of a crowded pot. For a simple cash-game baseline, use about 2.5 big blinds when first in and keep the same size across your opening range.',
        bullets: [
          'Early position: prioritize pairs, strong aces, and strong broadway cards.',
          'Cutoff and button: add more suited aces, suited connectors, and playable high cards.',
          'Avoid changing size only because your cards are strong or weak.',
        ],
      },
      {
        heading: 'Let position settle close decisions',
        body: 'A borderline hand can be a clear fold early and a reasonable raise on the button. Position does not make every hand playable, but it improves how often you steal the blinds and how well you can realize equity after the flop.',
        example: {
          title: 'Example · the same hand moves',
          detail: 'A♠ 8♠ is usually too loose to open first from early position at a six-player table, but it becomes a practical button raise after everyone folds.',
          heroCards: [card(14, 'spades'), card(8, 'spades')],
        },
        takeaway: 'Before looking at a chart, ask: how many players remain, and will I have position later?',
      },
    ],
  },
  {
    id: 'lesson-preflop-limpers',
    type: 'lesson',
    title: 'Play against limpers',
    description: 'Isolate strong hands and avoid crowded pots',
    estimatedMinutes: 5,
    sections: [
      {
        heading: 'A limp changes the pot, not your goal',
        body: 'A limper calls one big blind without raising. Their range is often capped or uneven, but players behind can still wake up with strong hands. Start by asking whether your hand wants value, a cheap multiway flop, or no investment at all.',
      },
      {
        heading: 'Isolate with strength and position',
        body: 'Raise hands that are ahead of the limper’s likely range and can play well if called. Add roughly one big blind to your normal opening size for each limper, then add a little more when you will be out of position.',
        bullets: [
          'One limper in front: about 4 to 5 big blinds is a useful beginner baseline.',
          'Choose hands that make strong pairs or robust draws—not weak offsuit hands.',
          'More limpers create a bigger reward but also make isolation less likely.',
        ],
      },
      {
        heading: 'Calling behind is selective',
        body: 'Some small pairs and suited connected hands can call behind when stacks are deep and several players are likely to see the flop. Do not over-limp weak hands just because the price looks cheap; difficult reverse-dominance spots can cost much more later.',
        example: {
          title: 'Example · value isolation',
          detail: 'K♠ Q♠ on the button after one cutoff limp is strong enough to raise for value and try to play heads-up in position.',
          heroCards: [card(13, 'spades'), card(12, 'spades')],
        },
        takeaway: 'Raise to isolate with a clear advantage; call behind only with a hand and stack depth that benefit from a multiway pot.',
      },
    ],
  },
  {
    id: 'lesson-preflop-facing-raise',
    type: 'lesson',
    title: 'Respond to a preflop raise',
    description: 'Choose between folding, calling, and re-raising',
    estimatedMinutes: 6,
    sections: [
      {
        heading: 'The opener’s position shapes their range',
        body: 'An early-position raise usually represents a stronger range than a button raise. Continue tighter against early opens and wider against late opens. Your own position matters too: calling on the button is easier to realize than calling from the small blind.',
        takeaway: 'Never judge your two cards alone—compare them with the opener’s position and the players behind.',
      },
      {
        heading: 'Give each response a job',
        body: 'Fold hands that are dominated or cannot realize enough equity. Call hands that play well at the offered price, especially in position. Re-raise premium hands for value and use only a small, deliberate set of blocker-rich bluffs.',
        bullets: [
          'Value re-raises want worse strong hands to continue.',
          'Calls need enough equity, playability, and protection from players behind.',
          'A weak ace is not automatically a call; it can make an expensive second-best top pair.',
        ],
      },
      {
        heading: 'Pressure grows with every raise',
        body: 'When you face a three-bet, the pot is larger and ranges are stronger. Continue with the top of your opening range, considering position and stack depth. Avoid calling merely to defend the chips you already invested.',
        example: {
          title: 'Example · avoid domination',
          detail: 'A♦ J♣ in the big blind should usually fold against a solid early-position open, while the same hand can continue much more comfortably against a small button raise.',
          heroCards: [card(14, 'diamonds'), card(11, 'clubs')],
        },
        takeaway: 'As the action gets stronger, continue with hands that remain robust—not hands that only look attractive in isolation.',
      },
    ],
  },
  {
    id: 'lesson-preflop-blind-defense',
    type: 'lesson',
    title: 'Defend your blinds with discipline',
    description: 'Use price, position, and playability together',
    estimatedMinutes: 6,
    sections: [
      {
        heading: 'Posted chips improve the price—not the cards',
        body: 'From the big blind, you call only the difference between your posted blind and the raise. That discount supports a wider continuing range, especially against small late-position opens. The posted blind is already in the pot, so do not defend simply to avoid “losing” it.',
      },
      {
        heading: 'Size and position change the answer',
        body: 'Defend wider against a small button open and tighter against a large early-position open. Suited, connected hands realize equity better than disconnected offsuit hands. From the small blind, tighten further because the big blind can still act and you will usually be out of position.',
        bullets: [
          'Smaller open + later position = wider defense.',
          'Larger open + earlier position = tighter defense.',
          'Prefer hands that can make strong pairs, straights, or flushes.',
        ],
      },
      {
        heading: 'Re-raise for value or useful pressure',
        body: 'Three-bet your strongest hands for value. Some suited aces work as occasional pressure hands because they block premium aces and retain playability when called. Avoid bluffing with random weak hands that have neither blockers nor postflop potential.',
        example: {
          title: 'Example · price-sensitive defense',
          detail: '8♠ 7♠ can call a small button raise from the big blind, but the same hand should often fold when an early-position player uses a large size.',
          heroCards: [card(8, 'spades'), card(7, 'spades')],
        },
        takeaway: 'Defend because the price, ranges, and playability work together—not because the blind feels like yours.',
      },
    ],
  },
];

export const postflopFoundationsLessons: LessonDefinition[] = [
  {
    id: 'lesson-postflop-board-texture',
    type: 'lesson',
    title: 'Read the board texture',
    description: 'Separate dry boards, wet boards, and important future cards',
    estimatedMinutes: 4,
    sections: [
      {
        heading: 'Start with connection and suits',
        body: 'Dry boards contain few immediate straight or flush draws. Wet boards connect many ranks or share suits, so more hands can improve or already be strong. Texture describes how ranges interact with the board—not whether the cards look high or low.',
        bullets: ['Dry: disconnected ranks with three suits.', 'Wet: connected ranks, paired draws, or two cards of one suit.', 'Paired boards reduce some combinations and can make trips possible.'],
      },
      {
        heading: 'Compare both ranges with the board',
        body: 'The preflop raiser often holds more high-card combinations, while a caller can hold more suited connectors and small pairs. A high dry board may favor the raiser; a low connected board can interact strongly with the caller.',
        example: {
          title: 'Example · stable top pair',
          detail: 'A♠ Q♦ on Q♣ 7♥ 2♠ is top pair on a dry board. Few turn cards complete an obvious draw, so many weaker pairs can continue.',
          heroCards: [card(14, 'spades'), card(12, 'diamonds')],
          board: [card(12, 'clubs'), card(7, 'hearts'), card(2, 'spades')],
        },
      },
      {
        heading: 'Name the cards that change the plan',
        body: 'Before acting, identify turns or rivers that complete draws, create an overcard, pair the board, or leave the texture mostly unchanged. Planning around card classes is more useful than trying to predict one exact card.',
        takeaway: 'Read texture first, then ask which range connects better and which future cards change that advantage.',
      },
    ],
  },
  {
    id: 'lesson-postflop-continuation-bets',
    type: 'lesson',
    title: 'Continuation bet selectively',
    description: 'Use range, texture, and player count before betting again',
    estimatedMinutes: 4,
    sections: [
      {
        heading: 'A preflop raise does not require a flop bet',
        body: 'A continuation bet is simply a flop bet by the preflop aggressor. It works best when your range has an advantage, the board is stable, and one opponent must defend. Checking is part of a complete strategy, not an admission that you missed.',
      },
      {
        heading: 'Use small bets where many hands benefit',
        body: 'On dry, high-card boards, a small bet can earn folds from unpaired hands while risking little. Strong hands also use this size so the bet does not reveal whether you connected.',
        example: {
          title: 'Example · small range bet',
          detail: 'After raising preflop, A♠ K♦ can often bet small when checked to on Q♣ 7♥ 2♠ heads-up. Your range contains many strong queens and overpairs, and the board offers few powerful draws.',
          heroCards: [card(14, 'spades'), card(13, 'diamonds')],
          board: [card(12, 'clubs'), card(7, 'hearts'), card(2, 'spades')],
        },
      },
      {
        heading: 'Check more on wet or multiway boards',
        body: 'Connected boards create more strong calls and raises. Extra opponents make it more likely that someone connected. Check more often with misses and medium-strength hands when the board favors calling ranges or several players remain.',
        takeaway: 'Continuation bet because the range and board support it—not simply because you raised preflop.',
      },
    ],
  },
  {
    id: 'lesson-postflop-value-sizing',
    type: 'lesson',
    title: 'Choose value and sizing together',
    description: 'Name weaker callers before choosing how much to bet',
    estimatedMinutes: 4,
    sections: [
      {
        heading: 'Value begins with a calling range',
        body: 'A value bet earns money when enough weaker hands can call. Before choosing a size, name those hands: weaker top pairs, second pairs, pocket pairs, or draws. If you cannot name realistic weaker callers, checking may protect your showdown value.',
      },
      {
        heading: 'Let texture and range set the size',
        body: 'Small bets keep a wide weak range involved on dry boards. Larger bets can charge draws or target a narrower strong range on wet boards. Do not automatically bet larger only because your own hand is strong.',
        example: {
          title: 'Example · turn value target',
          detail: 'A♠ Q♦ on Q♣ 8♥ 3♠ 6♦ can bet about half pot after a second check. Weaker queens, eights, pocket pairs, and available draws can still continue.',
          heroCards: [card(14, 'spades'), card(12, 'diamonds')],
          board: [card(12, 'clubs'), card(8, 'hearts'), card(3, 'spades'), card(6, 'diamonds')],
        },
      },
      {
        heading: 'Re-evaluate on every street',
        body: 'A turn card can add draws or strengthen the caller. A river removes all future equity and often narrows the hands that can call. Rebuild the value target instead of repeating the previous street’s size by habit.',
        takeaway: 'First name the weaker hands that call; then select the size those hands can realistically pay.',
      },
    ],
  },
  {
    id: 'lesson-postflop-playing-draws',
    type: 'lesson',
    title: 'Play draws with price and purpose',
    description: 'Combine clean outs, pot odds, and selective semi-bluffs',
    estimatedMinutes: 5,
    sections: [
      {
        heading: 'Count only clean outs',
        body: 'A clean out usually improves you to the winning hand. A flush card that also pairs the board, or a straight card that completes a higher straight, may be discounted. Start with the visible draw, then remove questionable improvements.',
        example: {
          title: 'Example · strong flush draw',
          detail: '9♥ 8♥ on Q♥ 7♣ 2♥ has nine apparent flush outs plus useful straight potential. The exact value still depends on whether an opponent can hold a higher heart draw.',
          heroCards: [card(9, 'hearts'), card(8, 'hearts')],
          board: [card(12, 'hearts'), card(7, 'clubs'), card(2, 'hearts')],
        },
      },
      {
        heading: 'Compare equity with the final pot',
        body: 'For a call, divide the call amount by the pot after your call. A half-pot flop bet offers a 25% break-even price. Nine clean flush outs reach the river about 35% of the time, before considering future betting or dirty outs.',
      },
      {
        heading: 'Semi-bluff when both paths matter',
        body: 'A semi-bluff can win immediately through folds or later by completing the draw. Prefer robust draws, useful blockers, and opponents capable of folding. Calling is often cleaner when the price is good and fold equity is uncertain.',
        takeaway: 'Do not raise merely because you have a draw; raise when improvement equity and believable fold equity work together.',
      },
    ],
  },
  {
    id: 'lesson-postflop-river-decisions',
    type: 'lesson',
    title: 'Make disciplined river decisions',
    description: 'Separate thin value, bluffing, and bluff catching',
    estimatedMinutes: 5,
    sections: [
      {
        heading: 'The river has no future equity',
        body: 'No cards remain, so draws have either completed or missed. Every bet should have a present-tense purpose: get called by worse or make better hands fold. Medium-strength hands often prefer checking and reaching showdown.',
      },
      {
        heading: 'Value bet as thinly as the range allows',
        body: 'Strong one-pair hands can still value bet safe rivers when several weaker pairs call. Size for the target. A smaller bet may earn more from a wide bluff-catching range than a large bet that only strong hands call.',
        example: {
          title: 'Example · bluff-catcher threshold',
          detail: 'K♠ Q♠ on K♦ 8♣ 6♥ 3♠ 2♦ remains top pair, but facing a large polarized river bet it may only beat bluffs. The call depends on price and expected bluff frequency.',
          heroCards: [card(13, 'spades'), card(12, 'spades')],
          board: [card(13, 'diamonds'), card(8, 'clubs'), card(6, 'hearts'), card(3, 'spades'), card(2, 'diamonds')],
        },
      },
      {
        heading: 'Bluff catch with evidence, not curiosity',
        body: 'A bluff catcher loses to every value hand and beats only bluffs. Compare the call price with a realistic bluff estimate, then consider blockers and opponent tendencies. Folding a visually strong hand can be correct against a range that is too value-heavy.',
        takeaway: 'On the river, name the worse calls, better folds, or bluffs you beat before committing more chips.',
      },
    ],
  },
];

export const lessons: LessonDefinition[] = [
  ...fundamentalsLessons,
  ...preflopStrategyLessons,
  ...postflopFoundationsLessons,
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
      prompt: 'Heads-up, 100 big blinds deep. You are on the button with A♠ J♦ and action is on you preflop.',
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

export const preflopMasteryCheck: TrainerDefinition = {
  id: 'quiz-preflop-mastery',
  type: 'hand_quiz',
  title: 'Preflop mastery check',
  description: 'Eight mixed decisions across the complete preflop track',
  estimatedMinutes: 7,
  masteryThreshold: 80,
  questions: [
    {
      id: 'mastery-early-a8o',
      prompt: 'Six players, 100 big blinds deep. You are first to act with the hand shown above.',
      context: 'Five players with live cards remain behind you.',
      heroCards: [card(14, 'clubs'), card(8, 'diamonds')],
      choices: [
        { id: 'fold', label: 'Fold', feedback: 'Correct: the offsuit weak ace is dominated too often with five ranges still behind.' },
        { id: 'limp', label: 'Call 1 big blind', feedback: 'Open-limping invites a crowded pot with a hand that often makes a second-best top pair.' },
        { id: 'raise', label: 'Raise to 2.5 big blinds', feedback: 'This is too loose for a simple early-position six-player baseline.' },
      ],
      correctChoiceId: 'fold',
      explanation: 'A-8 offsuit lacks enough card quality and playability to pass five ranges. Position makes this a disciplined fold.',
    },
    {
      id: 'mastery-button-a8s',
      prompt: 'Six players, 100 big blinds deep. Everyone folds to you on the button.',
      context: 'Only the small blind and big blind remain.',
      heroCards: [card(14, 'spades'), card(8, 'spades')],
      choices: [
        { id: 'fold', label: 'Fold', feedback: 'Folding gives up a profitable late-position opportunity against only two remaining ranges.' },
        { id: 'limp', label: 'Call 1 big blind', feedback: 'A limp can exist in advanced strategies, but raising is the clearest beginner baseline.' },
        { id: 'raise', label: 'Raise to 2.5 big blinds', feedback: 'Correct: suitedness, an ace blocker, and position make this a practical button open.' },
      ],
      correctChoiceId: 'raise',
      explanation: 'The same hand that folds early becomes a raise on the button because fewer players remain and you will have position when called.',
    },
    {
      id: 'mastery-isolate-kqs',
      prompt: 'The cutoff limps for 1 big blind. You are on the button with both blinds behind.',
      context: 'Stacks are 100 big blinds effective.',
      heroCards: [card(13, 'spades'), card(12, 'spades')],
      choices: [
        { id: 'fold', label: 'Fold', feedback: 'K-Q suited is much too strong to fold against one typical limping range.' },
        { id: 'call', label: 'Call 1 big blind', feedback: 'Calling is playable, but invites both blinds and misses a clear value isolation.' },
        { id: 'raise', label: 'Raise to 5 big blinds', feedback: 'Correct: raise for value and try to play heads-up against the limper in position.' },
      ],
      correctChoiceId: 'raise',
      explanation: 'K-Q suited leads a typical limp range. Adding size for the limper builds value and discourages the blinds from joining cheaply.',
    },
    {
      id: 'mastery-overlimp-22',
      prompt: 'Two players limp. You are on the button, stacks are deep, and the blinds rarely raise.',
      context: 'Choose the clearest low-variance baseline for the stated table.',
      heroCards: [card(2, 'clubs'), card(2, 'hearts')],
      choices: [
        { id: 'fold', label: 'Fold', feedback: 'Folding is safe, but the deep passive conditions make a cheap set-mine reasonable.' },
        { id: 'call', label: 'Call 1 big blind', feedback: 'Correct: position, deep stacks, and low squeeze risk support a selective over-limp.' },
        { id: 'raise', label: 'Raise to 6 big blinds', feedback: 'Raising can mix, but this small pair dislikes several callers and postflop pressure.' },
      ],
      correctChoiceId: 'call',
      explanation: 'A small pair benefits from a cheap multiway pot only when stacks are deep, the squeeze risk is low, and you have position.',
    },
    {
      id: 'mastery-aJo-early-open',
      prompt: 'A disciplined early-position player raises to 3 big blinds. You are in the big blind.',
      context: 'You are 100 big blinds deep and will act first after the flop.',
      heroCards: [card(14, 'diamonds'), card(11, 'clubs')],
      choices: [
        { id: 'fold', label: 'Fold', feedback: 'Correct: the tight early range dominates too many of your top-pair outcomes.' },
        { id: 'call', label: 'Call 2 big blinds', feedback: 'The blind discount does not overcome domination and poor equity realization.' },
        { id: 'raise', label: 'Raise to 10 big blinds', feedback: 'This hand is a poor simple bluff against a strong early-position range.' },
      ],
      correctChoiceId: 'fold',
      explanation: 'The opener’s early position and larger size make their range strong. A-J offsuit often creates an expensive second-best pair.',
    },
    {
      id: 'mastery-kqs-facing-cutoff',
      prompt: 'The cutoff raises to 2.5 big blinds. You are on the button.',
      context: 'Both blinds remain behind, and stacks are 100 big blinds effective.',
      heroCards: [card(13, 'hearts'), card(12, 'hearts')],
      choices: [
        { id: 'fold', label: 'Fold', feedback: 'K-Q suited has too much equity and playability to fold to a normal cutoff open.' },
        { id: 'call', label: 'Call 2.5 big blinds', feedback: 'Correct: calling realizes the hand’s equity in position and keeps weaker hands in.' },
        { id: 'raise', label: 'Raise to 8 big blinds', feedback: 'A re-raise can mix, but calling is the clearest baseline with this playable hand.' },
      ],
      correctChoiceId: 'call',
      explanation: 'K-Q suited performs well against a cutoff opening range. Position makes calling a robust baseline without overinflating the pot.',
    },
    {
      id: 'mastery-87s-blind-defense',
      prompt: 'The button raises to 2.25 big blinds. Small blind folds; you are in the big blind.',
      context: 'You already posted 1 big blind and stacks are 100 big blinds effective.',
      heroCards: [card(8, 'clubs'), card(7, 'clubs')],
      choices: [
        { id: 'fold', label: 'Fold', feedback: 'Folding is too tight for this small price against a wide late-position range.' },
        { id: 'call', label: 'Call 1.25 big blinds', feedback: 'Correct: the discount and suited connectivity support a practical defense.' },
        { id: 'raise', label: 'Raise to 9 big blinds', feedback: 'A re-raise can mix, but calling is the simplest way to realize this hand’s equity.' },
      ],
      correctChoiceId: 'call',
      explanation: 'The small raise offers a favorable price, while suited connectivity creates robust ways to improve after the flop.',
    },
    {
      id: 'mastery-a5s-three-bet',
      prompt: 'An active button raises to 2.5 big blinds. Small blind folds; you are in the big blind.',
      context: 'Choose the aggressive option with the best structural reasons.',
      heroCards: [card(14, 'hearts'), card(5, 'hearts')],
      choices: [
        { id: 'fold', label: 'Fold', feedback: 'Folding is viable, but gives up a useful blocker and suited wheel potential.' },
        { id: 'call', label: 'Call 1.5 big blinds', feedback: 'Calling is viable, but does not use the ace blocker to create immediate pressure.' },
        { id: 'raise', label: 'Raise to 9 big blinds', feedback: 'Correct: the ace blocks premium continues and the hand remains playable when called.' },
      ],
      correctChoiceId: 'raise',
      explanation: 'A-5 suited is a deliberate occasional bluff re-raise: it blocks strong aces and keeps straight and flush potential when called.',
    },
  ],
};

export const postflopMasteryCheck: TrainerDefinition = {
  id: 'quiz-postflop-mastery',
  type: 'hand_quiz',
  title: 'Postflop mastery check',
  description: 'Eight mixed decisions across the Postflop Foundations track',
  estimatedMinutes: 8,
  masteryThreshold: 80,
  questions: [
    {
      id: 'postflop-mastery-dry-cbet',
      prompt: 'You raised from the cutoff and the big blind called. They check this dry flop to you.',
      context: 'The pot is 6 big blinds. Choose the clearest range-friendly baseline.',
      heroCards: [card(14, 'spades'), card(13, 'diamonds')],
      board: [card(12, 'clubs'), card(7, 'hearts'), card(2, 'spades')],
      choices: [
        { id: 'check', label: 'Check back', feedback: 'Checking can mix, but gives up a low-risk opportunity on a board that strongly favors the preflop raiser.' },
        { id: 'small', label: 'Bet 2 big blinds', feedback: 'Correct: a one-third-pot bet applies pressure while representing the many strong queens and overpairs in your range.' },
        { id: 'large', label: 'Bet 6 big blinds', feedback: 'A pot-sized bet risks too much when a smaller size can pressure the same unpaired hands.' },
      ],
      correctChoiceId: 'small',
      explanation: 'Heads-up on a dry high-card board, the raiser can use a small continuation bet with both made hands and selected misses.',
    },
    {
      id: 'postflop-mastery-wet-multiway',
      prompt: 'You raised preflop and two players called. Both opponents check this connected flop.',
      context: 'The pot is 9 big blinds. Extra callers have many pairs, two-pair combinations, and straight draws.',
      heroCards: [card(14, 'spades'), card(13, 'clubs')],
      board: [card(11, 'hearts'), card(10, 'hearts'), card(9, 'clubs')],
      choices: [
        { id: 'check', label: 'Check back', feedback: 'Correct: the wet multiway board connects strongly with calling ranges, while your hand retains useful turn equity.' },
        { id: 'small', label: 'Bet 3 big blinds', feedback: 'A small bet is unlikely to fold pairs or robust draws and can invite difficult raises.' },
        { id: 'large', label: 'Bet 8 big blinds', feedback: 'A large bluff into two connected ranges risks too much without a clear fold target.' },
      ],
      correctChoiceId: 'check',
      explanation: 'More opponents and a highly connected board reduce the automatic advantage of being the preflop raiser. Checking protects your range and realizes equity.',
    },
    {
      id: 'postflop-mastery-flop-value',
      prompt: 'You raised on the button, the big blind called, and they check this flop.',
      context: 'The pot is 6 big blinds. Several weaker pairs and backdoor draws can continue.',
      heroCards: [card(14, 'spades'), card(12, 'diamonds')],
      board: [card(12, 'clubs'), card(8, 'hearts'), card(3, 'spades')],
      choices: [
        { id: 'check', label: 'Check back', feedback: 'Checking protects the hand, but misses clear value from weaker queens, eights, pocket pairs, and draws.' },
        { id: 'half', label: 'Bet 3 big blinds', feedback: 'Correct: half pot keeps realistic weaker callers involved while beginning to build value.' },
        { id: 'overbet', label: 'Bet 10 big blinds', feedback: 'The overbet folds much of the weak range you want to call and isolates you against stronger continues.' },
      ],
      correctChoiceId: 'half',
      explanation: 'Top pair with top kicker has multiple weaker calling targets. A moderate size captures value without forcing the range to become unnecessarily strong.',
    },
    {
      id: 'postflop-mastery-turn-pot-control',
      prompt: 'You bet the flop and the big blind called. They check again on this quiet turn.',
      context: 'The pot is 14 big blinds. Your pair has showdown value, but few clearly weaker hands can call two more large bets.',
      heroCards: [card(14, 'spades'), card(9, 'diamonds')],
      board: [card(13, 'clubs'), card(9, 'hearts'), card(4, 'spades'), card(3, 'diamonds')],
      choices: [
        { id: 'check', label: 'Check back', feedback: 'Correct: checking realizes showdown value, protects your checking range, and avoids inflating the pot against stronger kings.' },
        { id: 'half', label: 'Bet 7 big blinds', feedback: 'Some protection value exists, but many weaker hands fold while stronger pairs continue.' },
        { id: 'pot', label: 'Bet 14 big blinds', feedback: 'A pot-sized bet isolates this medium-strength hand against too much of the stronger range.' },
      ],
      correctChoiceId: 'check',
      explanation: 'Medium showdown value does not always need protection. Position lets you take a free card and make a more informed river decision.',
    },
    {
      id: 'postflop-mastery-flush-price',
      prompt: 'The big blind bets 5 big blinds into a 10-big-blind pot on this flop.',
      context: 'Calling 5 makes the final pot 20 big blinds, so the break-even price is 25%.',
      heroCards: [card(14, 'hearts'), card(5, 'hearts')],
      board: [card(13, 'hearts'), card(8, 'clubs'), card(2, 'hearts')],
      choices: [
        { id: 'fold', label: 'Fold', feedback: 'Nine clean flush outs reach the river about 35% of the time, comfortably above the 25% price.' },
        { id: 'call', label: 'Call 5 big blinds', feedback: 'Correct: the nut-flush draw has enough equity for this price without assuming the opponent will fold.' },
        { id: 'shove', label: 'Move all-in', feedback: 'A raise can sometimes work, but a shove adds unnecessary fold-equity and stack-off assumptions to a profitable call.' },
      ],
      correctChoiceId: 'call',
      explanation: 'Call amount divided by the final pot is 5 ÷ 20 = 25%. Roughly 35% by-river flush equity makes calling the clean mathematical baseline.',
    },
    {
      id: 'postflop-mastery-combo-draw',
      prompt: 'You called on the button preflop. The big blind checks this flop to you.',
      context: 'The pot is 8 big blinds. You can improve with a straight or flush and can fold many unpaired hands now.',
      heroCards: [card(9, 'spades'), card(8, 'spades')],
      board: [card(7, 'spades'), card(6, 'diamonds'), card(2, 'spades')],
      choices: [
        { id: 'check', label: 'Check back', feedback: 'Checking realizes equity, but misses a strong semi-bluff opportunity with many improving cards and immediate fold equity.' },
        { id: 'bet', label: 'Bet 5 big blinds', feedback: 'Correct: the robust combo draw can win through folds now or by improving when called.' },
        { id: 'all-in', label: 'Move all-in', feedback: 'The draw is strong, but an extreme overbet risks far more than needed to apply useful pressure.' },
      ],
      correctChoiceId: 'bet',
      explanation: 'Strong draws are useful semi-bluffs because both parts of the bet matter: worse unpaired hands can fold, and many cards improve you when called.',
    },
    {
      id: 'postflop-mastery-river-value',
      prompt: 'The big blind checks this river after calling two moderate bets.',
      context: 'The pot is 16 big blinds. Weaker top pairs and some second pairs can still pay a small value bet.',
      heroCards: [card(14, 'spades'), card(11, 'diamonds')],
      board: [card(11, 'clubs'), card(8, 'hearts'), card(4, 'spades'), card(3, 'diamonds'), card(2, 'clubs')],
      choices: [
        { id: 'check', label: 'Check back', feedback: 'Checking wins at showdown, but misses thin value from several realistic weaker one-pair hands.' },
        { id: 'small', label: 'Bet 5 big blinds', feedback: 'Correct: the small size targets weaker pairs without requiring them to call a highly polarized bet.' },
        { id: 'all-in', label: 'Move all-in', feedback: 'A large shove folds too much of the weaker range and is called by a much stronger selection.' },
      ],
      correctChoiceId: 'small',
      explanation: 'The safe river leaves top pair with top kicker ahead of multiple bluff catchers. A small value size matches that wide target range.',
    },
    {
      id: 'postflop-mastery-river-bluff-catch',
      prompt: 'The big blind bets 25 big blinds into a 20-big-blind pot on this river.',
      context: 'Calling needs about 36% equity. Based on the line and opponent, you estimate this bluff catcher wins only 25%.',
      heroCards: [card(13, 'spades'), card(12, 'spades')],
      board: [card(13, 'diamonds'), card(8, 'clubs'), card(6, 'hearts'), card(3, 'diamonds'), card(2, 'clubs')],
      choices: [
        { id: 'fold', label: 'Fold', feedback: 'Correct: top pair looks strong, but the estimated bluff frequency does not meet the price of the call.' },
        { id: 'call', label: 'Call 25 big blinds', feedback: 'The hand beats bluffs only, and the stated 25% win estimate is below the roughly 36% requirement.' },
        { id: 'raise', label: 'Move all-in', feedback: 'Turning showdown value into a bluff needs blocker and fold evidence that the scenario does not provide.' },
      ],
      correctChoiceId: 'fold',
      explanation: 'A bluff catcher is a price decision. Calling 25 creates a 70-big-blind final pot: 25 ÷ 70 ≈ 36%, above the stated 25% win estimate.',
    },
  ],
};

export const trainers: TrainerDefinition[] = [percentageTrainer, handQuiz, preflopMasteryCheck, postflopMasteryCheck];
export const learningActivities: LearningActivityDefinition[] = [...lessons, ...trainers, scenarioTrainer];

export const cheatSheets: CheatSheetDefinition[] = [
  {
    id: 'sheet-hand-rankings',
    title: 'Hand rankings',
    description: 'Examples and approximate seven-card odds',
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
          { label: 'Big blind defends wider', detail: 'You already invested 1 big blind, so a small raise offers a better price.' },
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
