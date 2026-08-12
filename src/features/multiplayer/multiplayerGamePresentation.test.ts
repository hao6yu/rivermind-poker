import { describe, expect, it } from 'vitest';

import { createMultiwayHand, applyMultiwayAction, type MultiwayHandState } from '../../domain/poker/multiway';
import { englishMessages, type MessageKey } from '../../localization/messages';
import type { TranslationValues } from '../../localization/core';
import {
  buildMultiplayerResultPresentation,
  multiplayerActionLabel,
  multiplayerSeatActionLabel,
} from './multiplayerGamePresentation';

const t = (key: MessageKey, values: TranslationValues = {}) => {
  const template = englishMessages[key];
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => (
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match
  ));
};

function headsUp(): MultiwayHandState {
  return createMultiwayHand({
    bigBlind: 20,
    buttonSeat: 0,
    players: [
      { id: 'host', name: 'Kai', seat: 0, stack: 2_000 },
      { id: 'guest', name: 'Iris', seat: 1, stack: 2_000 },
    ],
    random: () => 0.25,
    smallBlind: 10,
  });
}

describe('multiplayer game presentation', () => {
  it('labels every public action relative to the current viewer', () => {
    let hand = headsUp();
    hand = applyMultiwayAction(hand, 'host', { amount: 60, type: 'raise' });
    hand = applyMultiwayAction(hand, 'guest', { type: 'call' });

    expect(multiplayerActionLabel(hand, hand.history[0]!, 'host', t)).toBe('You raised to 60');
    expect(multiplayerActionLabel(hand, hand.history[1]!, 'host', t)).toBe('Iris called 40');
    expect(multiplayerSeatActionLabel(hand, 'guest', t)).toBe('Call 40');
  });

  it('explains a fold win and includes the actual payout', () => {
    let hand = headsUp();
    hand = applyMultiwayAction(hand, 'host', { type: 'fold' });

    const result = buildMultiplayerResultPresentation(hand, 'host', t);
    expect(result).toMatchObject({
      detail: 'Iris wins because everyone else folded.',
      showdown: false,
      title: 'Iris wins',
      totalPot: 20,
    });
    expect(result?.payouts).toEqual([{ amount: 20, label: 'Iris', playerId: 'guest' }]);
  });

  it('uses You when the viewer wins at showdown', () => {
    const hand = headsUp();
    hand.outcome = {
      awards: [{
        amount: 200,
        contributionCap: 100,
        eligiblePlayerIds: ['host', 'guest'],
        kind: 'main',
        shares: { host: 200 },
        winnerPlayerIds: ['host'],
      }],
      handDescriptions: { guest: 'a pair of kings', host: 'a flush' },
      showdown: true,
      totalPot: 200,
      winnerPlayerIds: ['host'],
    };

    expect(buildMultiplayerResultPresentation(hand, 'host', t)).toMatchObject({
      detail: 'You win the showdown with a flush.',
      title: 'You win',
      tone: 'win',
    });
  });
});
