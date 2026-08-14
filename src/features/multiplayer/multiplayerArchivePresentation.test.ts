import { describe, expect, it } from 'vitest';

import type { MultiplayerHandArchive } from '../../domain/multiplayer/contracts';
import { applyMultiwayAction, createMultiwayHand } from '../../domain/poker/multiway';
import { multiplayerArchiveToSessionHand } from './multiplayerArchivePresentation';

function completedArchive(): MultiplayerHandArchive {
  let hand = createMultiwayHand({
    bigBlind: 20,
    buttonSeat: 0,
    players: [
      { id: 'player:viewer', name: 'Kai', seat: 0, stack: 2_000 },
      { id: 'ai:lena', name: 'Lena', seat: 1, stack: 2_000 },
    ],
    random: () => 0.314,
    smallBlind: 10,
  });
  const actor = hand.toAct;
  if (!actor) throw new Error('Archive fixture is missing an actor.');
  hand = applyMultiwayAction(hand, actor, { type: 'fold' });
  if (!hand.outcome) throw new Error('Archive fixture did not complete.');

  const viewerPlayerId = 'player:viewer';
  return {
    completedAtMs: 2_000_000_000_000,
    completionReason: null,
    hand: {
      ...hand,
      deck: [],
      history: hand.history.map((action) => ({
        ...action,
        decisionContext: action.playerId === viewerPlayerId ? action.decisionContext : undefined,
      })),
      players: {
        ...hand.players,
        'ai:lena': { ...hand.players['ai:lena']!, holeCards: [] },
      },
      pending: [],
      toAct: null,
    },
    roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    sessionNumber: 2,
    viewerPlayerId,
  };
}

describe('multiplayer archive replay adapter', () => {
  it('normalizes the viewer to hero across every player reference without revealing cards', () => {
    const archive = completedArchive();
    const sourceJson = JSON.stringify(archive);
    const record = multiplayerArchiveToSessionHand(archive);

    expect(record?.clientId).toContain(':session:2:hand:1');
    expect(record?.game.players.hero).toMatchObject({ id: 'hero', isHero: true, name: 'Kai' });
    expect(record?.game.tablePlayerIds).toContain('hero');
    expect(record?.game.history.some((action) => action.playerId === 'player:viewer')).toBe(false);
    expect(record?.game.players['ai:lena']?.holeCards).toEqual([]);
    expect(record?.game.deck).toEqual([]);
    expect(JSON.stringify(archive)).toBe(sourceJson);
  });

  it('rejects an unredacted deck or a hand without a completed outcome', () => {
    const archive = completedArchive();
    expect(multiplayerArchiveToSessionHand({
      ...archive,
      hand: { ...archive.hand, deck: [{ rank: 14, suit: 'spades' }] },
    })).toBeNull();
    expect(multiplayerArchiveToSessionHand({
      ...archive,
      hand: { ...archive.hand, outcome: undefined },
    })).toBeNull();
  });
});
