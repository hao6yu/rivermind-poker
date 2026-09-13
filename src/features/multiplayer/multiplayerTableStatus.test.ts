import { describe, expect, it } from 'vitest';

import { resolveMultiplayerTableStatus } from './multiplayerTableStatus';

const base = {
  autoDealArmed: false,
  returnQueued: false,
  roomStatus: 'playing' as const,
  sessionComplete: false,
  transportReconnecting: false,
  viewerConnection: 'online' as const,
  viewerParticipation: 'active' as const,
  viewerReady: null,
  waitingHumanCount: 0,
};

describe('multiplayer table status resolution (A2)', () => {
  it('prioritizes a broken connection over every personal state', () => {
    const status = resolveMultiplayerTableStatus({
      ...base,
      transportReconnecting: true,
      viewerParticipation: 'rebuy-pending',
    });
    expect(status.kind).toBe('reconnecting');
    expect(status.blocking).toBe(true);
    expect(status.messageKey).toBe('multiplayer.game.reconnect');
  });

  it('explains a host pause as blocking with no duplicate action', () => {
    const status = resolveMultiplayerTableStatus({
      ...base,
      roomStatus: 'paused',
    });
    expect(status.kind).toBe('pausedByHost');
    expect(status.blocking).toBe(true);
    expect(status.action).toBeNull();
  });

  it('offers the rebuy decision next to the rebuy-required status', () => {
    const status = resolveMultiplayerTableStatus({
      ...base,
      viewerParticipation: 'rebuy-pending',
    });
    expect(status.kind).toBe('rebuyRequired');
    expect(status.action).toBe('rebuy');
    expect(status.actionLabelKey).toBe('multiplayer.rebuy.pending');
  });

  it('offers return-next-hand while sitting out and the queued copy once queued', () => {
    const sittingOut = resolveMultiplayerTableStatus({
      ...base,
      viewerParticipation: 'sitting-out',
    });
    expect(sittingOut.kind).toBe('sittingOut');
    expect(sittingOut.action).toBe('returnNextHand');
    const queued = resolveMultiplayerTableStatus({
      ...base,
      returnQueued: true,
      viewerParticipation: 'sitting-out',
    });
    expect(queued.kind).toBe('returnQueued');
    expect(queued.action).toBeNull();
    expect(queued.messageKey).toBe('multiplayer.game.returnQueued');
  });

  it('asks an unready lobby viewer to ready up and reports other waiters informatively', () => {
    const unready = resolveMultiplayerTableStatus({
      ...base,
      roomStatus: 'lobby',
      viewerReady: false,
      waitingHumanCount: 2,
    });
    expect(unready.kind).toBe('waitingForPlayers');
    expect(unready.action).toBe('readyUp');
    expect(unready.blocking).toBe(true);
    const waitingOnOthers = resolveMultiplayerTableStatus({
      ...base,
      roomStatus: 'lobby',
      viewerReady: true,
      waitingHumanCount: 1,
    });
    expect(waitingOnOthers.kind).toBe('waitingForPlayers');
    expect(waitingOnOthers.action).toBeNull();
    expect(waitingOnOthers.blocking).toBe(false);
  });

  it('shows nothing during normal play, an armed between-hands countdown, or a completed session', () => {
    expect(resolveMultiplayerTableStatus(base).kind).toBe('none');
    expect(resolveMultiplayerTableStatus({
      ...base,
      autoDealArmed: true,
      roomStatus: 'between-hands',
    }).kind).toBe('none');
    expect(resolveMultiplayerTableStatus({
      ...base,
      sessionComplete: true,
    }).kind).toBe('none');
  });

  it('treats an offline viewer seat as reconnecting even while the transport is quiet', () => {
    const status = resolveMultiplayerTableStatus({
      ...base,
      viewerConnection: 'offline',
    });
    expect(status.kind).toBe('reconnecting');
    expect(status.blocking).toBe(true);
  });
});
