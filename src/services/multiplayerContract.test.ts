import { describe, expect, it } from 'vitest';
import { seededRandom } from '../domain/poker/cards';
import {
  applyMultiplayerCommand,
  createMultiplayerRoom,
} from '../domain/multiplayer/coordinator';
import type { MultiplayerRoomCommand } from '../domain/multiplayer/contracts';
import {
  createMultiplayerPublicSnapshot,
  createMultiplayerPublicTransition,
  createMultiplayerViewerProjection,
} from '../domain/multiplayer/projection';
import {
  multiplayerSnapshotRequiresUpdate,
  parseMultiplayerBroadcastEnvelope,
  parseMultiplayerHandHistoryEnvelope,
  parseMultiplayerMomentEnvelope,
  parseMultiplayerRoomEnvelope,
  parseTableMomentBroadcastEnvelope,
} from './multiplayerContract';
import { TABLE_MOMENT_REACTION_IDS } from '../domain/multiplayer/tableMoments';

const roomId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const viewerPlayerId = 'player:host';
const opponentPlayerId = 'player:opponent';

type CommandInput = MultiplayerRoomCommand extends infer Command
  ? Command extends MultiplayerRoomCommand
    ? Omit<Command, 'commandId' | 'expectedVersion'>
    : never
  : never;

function config() {
  return {
    aiDifficulty: 'club',
    bigBlindChips: 20,
    handTarget: 10,
    seatCount: 2,
    smallBlindChips: 10,
    startingStackChips: 2_000,
    turnSeconds: 45,
  };
}

function seat(
  playerId: string,
  seatIndex: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    aiProfileId: null,
    connection: 'online',
    control: 'human',
    displayName: playerId === viewerPlayerId ? 'River' : 'Iris',
    isHost: playerId === viewerPlayerId,
    joinedAtMs: 1_000 + seatIndex,
    kind: 'human',
    missedTurns: 0,
    playerId,
    ready: true,
    seat: seatIndex,
    userId: null,
    ...overrides,
  };
}

function liveHand(): any {
  return {
    activePlayerIds: [viewerPlayerId, opponentPlayerId],
    actedAtBet: {
      [viewerPlayerId]: null,
      [opponentPlayerId]: null,
    },
    bigBlind: 20,
    bigBlindPlayerId: opponentPlayerId,
    board: [],
    buttonPlayerId: viewerPlayerId,
    buttonSeat: 0,
    currentBet: 20,
    dealOrder: [viewerPlayerId, opponentPlayerId],
    deck: [],
    handNumber: 1,
    history: [],
    lastFullRaise: 20,
    pending: [viewerPlayerId, opponentPlayerId],
    players: {
      [viewerPlayerId]: {
        allIn: false,
        folded: false,
        holeCards: [
          { rank: 14, suit: 'spades' },
          { rank: 13, suit: 'spades' },
        ],
        id: viewerPlayerId,
        name: 'River',
        position: 'BTN/SB',
        seat: 0,
        stack: 1_990,
        streetBet: 10,
        totalCommitted: 10,
      },
      [opponentPlayerId]: {
        allIn: false,
        folded: false,
        holeCards: [],
        id: opponentPlayerId,
        name: 'Iris',
        position: 'BB',
        seat: 1,
        stack: 1_980,
        streetBet: 20,
        totalCommitted: 20,
      },
    },
    postflopActionOrder: [opponentPlayerId, viewerPlayerId],
    pot: 30,
    preflopActionOrder: [viewerPlayerId, opponentPlayerId],
    smallBlind: 10,
    smallBlindPlayerId: viewerPlayerId,
    street: 'preflop',
    tablePlayerIds: [viewerPlayerId, opponentPlayerId],
    toAct: viewerPlayerId,
  };
}

function personalizedSnapshot(overrides: Record<string, unknown> = {}): any {
  return {
    completionReason: null,
    config: config(),
    createdAtMs: 1_000,
    hand: null,
    hostPlayerId: viewerPlayerId,
    legalActions: null,
    protocolVersion: 1,
    roomCode: '724826',
    roomId,
    seats: [seat(viewerPlayerId, 0), seat(opponentPlayerId, 1)],
    sessionNumber: 1,
    status: 'lobby',
    turnDeadlineAtMs: null,
    nextHandAtMs: null,
    updatedAtMs: 2_000,
    version: 0,
    viewerPlayerId,
    ...overrides,
  };
}

function publicSnapshot(overrides: Record<string, unknown> = {}): any {
  return {
    completionReason: null,
    config: config(),
    createdAtMs: 1_000,
    hand: null,
    hostPlayerId: viewerPlayerId,
    protocolVersion: 1,
    roomCode: '',
    roomId,
    seats: [seat(viewerPlayerId, 0), seat(opponentPlayerId, 1)],
    sessionNumber: 1,
    status: 'lobby',
    turnDeadlineAtMs: null,
    nextHandAtMs: null,
    updatedAtMs: 2_000,
    version: 0,
    ...overrides,
  };
}

function transition(version = 4): any {
  return {
    acceptedAtMs: 1_000,
    actionBatch: [{
      amount: 20,
      playerId: opponentPlayerId,
      potAfter: 50,
      street: 'preflop',
      type: 'call',
    }],
    commandId: `command:${version}`,
    kind: 'action',
    timeout: null,
    version,
  };
}

function publicLiveHand(): any {
  const hand = structuredClone(liveHand());
  hand.players[viewerPlayerId].holeCards = [];
  return hand;
}

function completedShowdownHand(): any {
  const hand = structuredClone(liveHand());
  hand.board = [
    { rank: 2, suit: 'clubs' },
    { rank: 7, suit: 'diamonds' },
    { rank: 9, suit: 'hearts' },
    { rank: 11, suit: 'spades' },
    { rank: 12, suit: 'clubs' },
  ];
  hand.pending = [];
  hand.street = 'complete';
  hand.toAct = null;
  return {
    ...hand,
    outcome: {
      awards: [{
        amount: 30,
        contributionCap: 20,
        eligiblePlayerIds: [viewerPlayerId, opponentPlayerId],
        kind: 'main',
        shares: { [viewerPlayerId]: 30 },
        winnerPlayerIds: [viewerPlayerId],
      }],
      handDescriptions: { [viewerPlayerId]: 'a pair' },
      showdown: true,
      totalPot: 30,
      winnerPlayerIds: [viewerPlayerId],
    },
  };
}

function viewerDecisionContext() {
  return {
    board: [],
    currentBet: 20,
    effectiveStack: 1_980,
    estimatedEquity: 0.62,
    initiative: 'none',
    legalActions: {
      canCall: true,
      canCheck: false,
      canFold: true,
      canRaise: true,
      maxRaiseTo: 1_990,
      minRaiseTo: 40,
      raiseReopened: true,
      suggestedRaiseTo: 60,
      toCall: 10,
    },
    limperCount: 0,
    opponentCount: 1,
    playerCount: 2,
    playersBehind: 1,
    playerStackBefore: 1_990,
    playerStreetBetBefore: 10,
    position: 'BTN/SB',
    potBefore: 30,
    preflopFacing: 'raised',
    preflopRaiseCount: 1,
    toCall: 10,
  };
}

describe('multiplayer service contract', () => {
  it('accepts the authoritative live viewer and Realtime projection shapes', () => {
    const random = seededRandom(73);
    let state = createMultiplayerRoom({
      config: config() as never,
      hostDisplayName: 'River',
      hostPlayerId: viewerPlayerId,
      hostUserId: 'user:host',
      roomCode: '724826',
      roomId,
    }, { nowMs: 1_000, random });
    const send = (command: CommandInput) => {
      const result = applyMultiplayerCommand(state, {
        ...command,
        commandId: `command:${state.version + 1}`,
        expectedVersion: state.version,
      } as MultiplayerRoomCommand, { aiSimulations: 4, nowMs: state.updatedAtMs + 100, random });
      state = result.state;
      return result;
    };
    send({
      actorUserId: 'user:opponent',
      displayName: 'Iris',
      playerId: opponentPlayerId,
      seat: 1,
      type: 'join',
    });
    send({ actorUserId: 'user:host', ready: true, type: 'set-ready' });
    send({ actorUserId: 'user:opponent', ready: true, type: 'set-ready' });
    const started = send({ actorUserId: 'user:host', type: 'start' });
    const viewer = createMultiplayerViewerProjection(state, 'user:host');
    const publicProjection = createMultiplayerPublicSnapshot(state);
    const publicTransition = createMultiplayerPublicTransition(started.transition);

    expect(parseMultiplayerRoomEnvelope({
      roomId,
      snapshot: viewer,
      transition: publicTransition,
    })).not.toBeNull();
    expect(parseMultiplayerBroadcastEnvelope({
      payload: { snapshot: publicProjection, transition: publicTransition },
    })).not.toBeNull();
  });

  it('accepts and reconstructs a personalized room envelope', () => {
    const snapshot = personalizedSnapshot();
    delete snapshot.completionReason;
    delete snapshot.sessionNumber;
    expect(parseMultiplayerRoomEnvelope({
      roomCode: '724826',
      roomId,
      snapshot,
    })).toMatchObject({
      roomCode: '724826',
      roomId,
      snapshot: { completionReason: null, sessionNumber: 1 },
    });
  });

  it('accepts a persisted sync projection without the plaintext room code', () => {
    expect(parseMultiplayerRoomEnvelope({
      roomId,
      snapshot: personalizedSnapshot({ roomCode: '' }),
    })).toMatchObject({
      roomId,
      snapshot: { roomCode: '' },
    });
  });

  it('accepts a valid personalized live hand and preserves only the viewer cards', () => {
    const parsed = parseMultiplayerRoomEnvelope({
      roomId,
      snapshot: personalizedSnapshot({ hand: liveHand(), status: 'playing' }),
    });
    expect(parsed?.snapshot.hand?.players[viewerPlayerId]?.holeCards).toHaveLength(2);
    expect(parsed?.snapshot.hand?.players[opponentPlayerId]?.holeCards).toEqual([]);
    expect(parsed?.snapshot.hand?.deck).toEqual([]);
  });

  it('rejects mismatched rooms and malformed snapshots', () => {
    expect(parseMultiplayerRoomEnvelope({
      roomId,
      snapshot: personalizedSnapshot({ roomId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
    })).toBeNull();
    expect(parseMultiplayerRoomEnvelope({ roomId, snapshot: { roomId } })).toBeNull();
    expect(parseMultiplayerRoomEnvelope({
      roomId,
      snapshot: personalizedSnapshot({ completionReason: 'made-up', sessionNumber: 0 }),
    })).toBeNull();
  });

  it('keeps the authoritative action batch from command responses', () => {
    const envelope = parseMultiplayerRoomEnvelope({
      roomId,
      snapshot: personalizedSnapshot({ status: 'playing', version: 4 }),
      transition: transition(4),
    });

    expect(envelope?.transition?.actionBatch).toEqual([expect.objectContaining({
      playerId: opponentPlayerId,
      type: 'call',
    })]);
  });

  it('unwraps database Broadcast payloads and rejects version drift', () => {
    const payload = {
      payload: {
        snapshot: publicSnapshot({
          hand: publicLiveHand(),
          status: 'playing',
          version: 7,
        }),
        transition: transition(7),
      },
    };
    expect(parseMultiplayerBroadcastEnvelope(payload)).toMatchObject({ roomId });
    payload.payload.transition.version = 6;
    expect(parseMultiplayerBroadcastEnvelope(payload)).toBeNull();
  });

  it('rejects personalized viewer projections from the public Broadcast channel', () => {
    expect(parseMultiplayerBroadcastEnvelope({
      payload: {
        snapshot: personalizedSnapshot({
          hand: liveHand(),
          roomCode: '',
          status: 'playing',
          version: 7,
        }),
        transition: transition(7),
      },
    })).toBeNull();
  });

  it('accepts an older idempotent transition with a newer duplicate snapshot', () => {
    expect(parseMultiplayerRoomEnvelope({
      duplicate: true,
      roomId,
      snapshot: personalizedSnapshot({ status: 'playing', version: 9 }),
      transition: transition(7),
    })).toMatchObject({ duplicate: true, roomId });
  });

  it('accepts an intentional non-personalized snapshot after the viewer leaves', () => {
    expect(parseMultiplayerRoomEnvelope({
      left: true,
      roomId,
      snapshot: publicSnapshot({ version: 3 }),
      transition: { ...transition(3), actionBatch: [], kind: 'leave' },
    })).toMatchObject({ left: true, roomId });
  });

  it('rejects left responses that still expose a personalized viewer snapshot', () => {
    expect(parseMultiplayerRoomEnvelope({
      left: true,
      roomId,
      snapshot: personalizedSnapshot({ version: 3 }),
    })).toBeNull();
  });

  it('rejects a non-empty live deck', () => {
    const hand = liveHand();
    hand.deck.push({ rank: 2, suit: 'clubs' });
    expect(parseMultiplayerRoomEnvelope({
      roomId,
      snapshot: personalizedSnapshot({ hand, status: 'playing' }),
    })).toBeNull();
  });

  it('rejects oversized public boards and room codes in public projections', () => {
    const oversizedBoard = publicLiveHand();
    oversizedBoard.board = [
      { rank: 2, suit: 'clubs' },
      { rank: 3, suit: 'clubs' },
      { rank: 4, suit: 'clubs' },
      { rank: 5, suit: 'clubs' },
      { rank: 6, suit: 'clubs' },
      { rank: 7, suit: 'clubs' },
    ];
    expect(parseMultiplayerRoomEnvelope({
      roomId,
      snapshot: publicSnapshot({ hand: oversizedBoard, status: 'playing' }),
    })).toBeNull();
    expect(parseMultiplayerRoomEnvelope({
      roomId,
      snapshot: publicSnapshot({ roomCode: '724826' }),
    })).toBeNull();
    expect(parseMultiplayerRoomEnvelope({
      roomCode: '724826',
      roomId,
      snapshot: publicSnapshot(),
    })).toBeNull();
  });

  it('rejects opponent cards before showdown and all cards in a public snapshot', () => {
    const personalizedHand = liveHand();
    personalizedHand.players[opponentPlayerId].holeCards = [
      { rank: 2, suit: 'clubs' },
      { rank: 3, suit: 'clubs' },
    ];
    expect(parseMultiplayerRoomEnvelope({
      roomId,
      snapshot: personalizedSnapshot({ hand: personalizedHand, status: 'playing' }),
    })).toBeNull();

    const broadcastHand = publicLiveHand();
    broadcastHand.players[viewerPlayerId].holeCards = [
      { rank: 14, suit: 'spades' },
      { rank: 13, suit: 'spades' },
    ];
    expect(parseMultiplayerRoomEnvelope({
      roomId,
      snapshot: publicSnapshot({ hand: broadcastHand, status: 'playing' }),
    })).toBeNull();
  });

  it('allows revealed showdown opponents but never folded-opponent cards', () => {
    const revealed = completedShowdownHand();
    revealed.players[opponentPlayerId].holeCards = [
      { rank: 10, suit: 'hearts' },
      { rank: 8, suit: 'hearts' },
    ];
    expect(parseMultiplayerRoomEnvelope({
      roomId,
      snapshot: personalizedSnapshot({ hand: revealed, status: 'between-hands' }),
    })).not.toBeNull();

    const foldedLeak = structuredClone(revealed);
    foldedLeak.players[opponentPlayerId].folded = true;
    expect(parseMultiplayerRoomEnvelope({
      roomId,
      snapshot: personalizedSnapshot({ hand: foldedLeak, status: 'between-hands' }),
    })).toBeNull();
  });

  it('rejects auth ids on seats', () => {
    expect(parseMultiplayerRoomEnvelope({
      roomId,
      snapshot: personalizedSnapshot({
        seats: [seat(viewerPlayerId, 0, { userId: 'private-auth-user' }), seat(opponentPlayerId, 1)],
      }),
    })).toBeNull();
  });

  it('accepts authored AI names but rejects arbitrary human or injected hand names', () => {
    expect(parseMultiplayerRoomEnvelope({
      roomId,
      snapshot: personalizedSnapshot({
        seats: [
          seat(viewerPlayerId, 0),
          seat(opponentPlayerId, 1, {
            aiProfileId: 'lena-sticky',
            control: 'ai',
            displayName: 'Lena',
            kind: 'ai',
          }),
        ],
      }),
    })).not.toBeNull();

    expect(parseMultiplayerRoomEnvelope({
      roomId,
      snapshot: personalizedSnapshot({
        seats: [
          seat(viewerPlayerId, 0, { displayName: 'name@example.com' }),
          seat(opponentPlayerId, 1),
        ],
      }),
    })).toBeNull();

    const injectedHand = liveHand();
    injectedHand.players[viewerPlayerId].name = 'Custom Name';
    expect(parseMultiplayerRoomEnvelope({
      roomId,
      snapshot: personalizedSnapshot({ hand: injectedHand, status: 'playing' }),
    })).toBeNull();
  });

  it('rejects live decision context in a snapshot or transition', () => {
    const hand = liveHand();
    hand.history.push({
      amount: 20,
      decisionContext: { estimatedEquity: 0.92 },
      playerId: opponentPlayerId,
      potAfter: 50,
      street: 'preflop',
      type: 'call',
    } as never);
    expect(parseMultiplayerRoomEnvelope({
      roomId,
      snapshot: personalizedSnapshot({ hand, status: 'playing' }),
    })).toBeNull();

    const leakyTransition = transition(4);
    Object.assign(leakyTransition.actionBatch[0]!, {
      decisionContext: { estimatedEquity: 0.92 },
    });
    expect(parseMultiplayerRoomEnvelope({
      roomId,
      snapshot: personalizedSnapshot({ version: 4 }),
      transition: leakyTransition,
    })).toBeNull();
  });

  it('drops arbitrary snapshot, nested, transition, and envelope extras', () => {
    const hand = liveHand();
    Object.assign(hand.players[opponentPlayerId], { privateRationale: 'PRIVATE_MARKER_PLAYER' });
    const leakyTransition = transition(4);
    Object.assign(leakyTransition, {
      actorUserId: 'PRIVATE_MARKER_AUTH',
      privateServerState: 'PRIVATE_MARKER_TRANSITION',
    });
    Object.assign(leakyTransition.actionBatch[0]!, { privateOdds: 'PRIVATE_MARKER_ACTION' });
    const snapshot = personalizedSnapshot({
      config: { ...config(), privateSeed: 'PRIVATE_MARKER_CONFIG' },
      hand,
      privateState: 'PRIVATE_MARKER_SNAPSHOT',
      seats: [
        seat(viewerPlayerId, 0, { authMetadata: 'PRIVATE_MARKER_SEAT' }),
        seat(opponentPlayerId, 1),
      ],
      status: 'playing',
      version: 4,
    });
    const parsed = parseMultiplayerRoomEnvelope({
      privateEnvelopeState: 'PRIVATE_MARKER_ENVELOPE',
      roomId,
      snapshot,
      transition: leakyTransition,
    });

    expect(parsed).not.toBeNull();
    expect(JSON.stringify(parsed)).not.toContain('PRIVATE_MARKER');
    expect(parsed?.transition).not.toHaveProperty('actorUserId');
    expect(parsed?.snapshot).not.toHaveProperty('privateState');
    expect(parsed?.snapshot.config).not.toHaveProperty('privateSeed');
    expect(parsed?.snapshot.seats[0]).not.toHaveProperty('authMetadata');
    expect(parsed?.snapshot.hand?.players[opponentPlayerId]).not.toHaveProperty('privateRationale');
    expect(parsed?.transition?.actionBatch[0]).not.toHaveProperty('privateOdds');
  });

  it('rejects malformed transition kinds instead of casting them', () => {
    expect(parseMultiplayerRoomEnvelope({
      roomId,
      snapshot: personalizedSnapshot({ version: 4 }),
      transition: { ...transition(4), kind: 'read-private-state' },
    })).toBeNull();
  });

  it('accepts only viewer-redacted completed hand history', () => {
    const archivedHand = completedShowdownHand();
    archivedHand.history = [{
      amount: 20,
      decisionContext: viewerDecisionContext(),
      playerId: viewerPlayerId,
      potAfter: 50,
      street: 'preflop',
      type: 'call',
    }];
    const archive: any = {
      completedAtMs: 2_000,
      completionReason: null,
      hand: archivedHand,
      roomId,
      sessionNumber: 1,
      viewerPlayerId,
    };
    const parsed = parseMultiplayerHandHistoryEnvelope({ history: [archive] });
    expect(parsed).toHaveLength(1);
    expect(parsed?.[0]?.hand.history[0]?.decisionContext?.estimatedEquity).toBe(0.62);

    const foldedCardLeak = structuredClone(archive);
    foldedCardLeak.hand.players[opponentPlayerId].folded = true;
    foldedCardLeak.hand.players[opponentPlayerId].holeCards = [
      { rank: 2, suit: 'clubs' },
      { rank: 3, suit: 'clubs' },
    ];
    expect(parseMultiplayerHandHistoryEnvelope({ history: [foldedCardLeak] })).toBeNull();

    const decisionContextLeak = structuredClone(archive);
    decisionContextLeak.hand.history.push({
      amount: 0,
      decisionContext: viewerDecisionContext(),
      playerId: opponentPlayerId,
      potAfter: 50,
      street: 'preflop',
      type: 'fold',
    });
    expect(parseMultiplayerHandHistoryEnvelope({ history: [decisionContextLeak] })).toBeNull();

    const arbitraryExtras = structuredClone(archive);
    arbitraryExtras.privateArchiveState = 'PRIVATE_MARKER_ARCHIVE';
    arbitraryExtras.hand.privateSeed = 'PRIVATE_MARKER_HAND';
    arbitraryExtras.hand.players[opponentPlayerId].privateRationale = 'PRIVATE_MARKER_PLAYER';
    arbitraryExtras.hand.history[0].decisionContext.privateOdds = 'PRIVATE_MARKER_CONTEXT';
    const sanitized = parseMultiplayerHandHistoryEnvelope({ history: [arbitraryExtras] });
    expect(sanitized).toHaveLength(1);
    expect(JSON.stringify(sanitized)).not.toContain('PRIVATE_MARKER');
  });

  it('rejects non-name content (contact details) in completed hand history', () => {
    const hand = completedShowdownHand();
    hand.players[viewerPlayerId].name = 'name@example.com';
    expect(parseMultiplayerHandHistoryEnvelope({
      history: [{
        completedAtMs: 2_000,
        completionReason: null,
        hand,
        roomId,
        sessionNumber: 1,
        viewerPlayerId,
      }],
    })).toBeNull();
  });
});

describe('nine-seat protocol and update-required classification', () => {
  it('accepts an authoritative nine-seat live viewer projection', () => {
    const random = seededRandom(601);
    let state = createMultiplayerRoom({
      config: { ...config(), seatCount: 9 } as never,
      hostDisplayName: 'River',
      hostPlayerId: viewerPlayerId,
      hostUserId: 'user:host',
      roomCode: '724826',
      roomId,
    }, { nowMs: 1_000, random });
    for (let seat = 1; seat < 9; seat += 1) {
      const result = applyMultiplayerCommand(state, {
        commandId: `command:${seat}`,
        expectedVersion: state.version,
        actorUserId: 'user:host',
        seat,
        type: 'add-ai',
      }, { aiSimulations: 24, nowMs: 1_000 + seat, random });
      state = result.state;
    }
    state = applyMultiplayerCommand(state, {
      commandId: 'command:ready',
      expectedVersion: state.version,
      actorUserId: 'user:host',
      ready: true,
      type: 'set-ready',
    }, { aiSimulations: 24, nowMs: 2_000, random }).state;
    state = applyMultiplayerCommand(state, {
      commandId: 'command:start',
      expectedVersion: state.version,
      actorUserId: 'user:host',
      type: 'start',
    }, { aiSimulations: 24, nowMs: 2_100, random }).state;

    const viewer = createMultiplayerViewerProjection(state, 'user:host');
    const parsed = parseMultiplayerRoomEnvelope({
      roomId,
      snapshot: viewer,
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.snapshot.config.seatCount).toBe(9);
    expect(parsed?.snapshot.protocolVersion).toBe(2);
    expect(parsed?.snapshot.seats).toHaveLength(9);
    expect(parsed?.snapshot.hand?.tablePlayerIds).toHaveLength(9);
    expect(parsed?.snapshot.hand?.buttonSeat).toBeGreaterThanOrEqual(0);
    expect(parsed?.snapshot.hand?.buttonSeat).toBeLessThan(9);
  });

  it('rejects snapshots without the required protocol version', () => {
    const snapshot = personalizedSnapshot();
    delete snapshot.protocolVersion;
    expect(parseMultiplayerRoomEnvelope({ roomId, snapshot })).toBeNull();
  });

  it('classifies newer protocol versions as update-required, never partial', () => {
    const newer = personalizedSnapshot({ protocolVersion: 3 });
    expect(parseMultiplayerRoomEnvelope({ roomId, snapshot: newer })).toBeNull();
    expect(multiplayerSnapshotRequiresUpdate(newer)).toBe(true);
  });

  it('strictly parses the recoverable next-hand deadline', () => {
    const armed = personalizedSnapshot({ nextHandAtMs: 9_000 });
    expect(parseMultiplayerRoomEnvelope({ roomId, snapshot: armed })?.snapshot.nextHandAtMs)
      .toBe(9_000);
    const unarmed = personalizedSnapshot({ nextHandAtMs: null });
    expect(parseMultiplayerRoomEnvelope({ roomId, snapshot: unarmed })?.snapshot.nextHandAtMs)
      .toBeNull();
    // A missing or malformed deadline is a partial state: rejected, never guessed.
    const missing = personalizedSnapshot();
    delete missing.nextHandAtMs;
    expect(parseMultiplayerRoomEnvelope({ roomId, snapshot: missing })).toBeNull();
    expect(parseMultiplayerRoomEnvelope({ roomId, snapshot: personalizedSnapshot({ nextHandAtMs: 'soon' }) }))
      .toBeNull();
  });

  it('classifies oversized rooms and seats as update-required', () => {
    const tenSeats = personalizedSnapshot({
      config: { ...config(), seatCount: 10 },
      seats: [seat(viewerPlayerId, 0), seat(opponentPlayerId, 1)],
    });
    expect(multiplayerSnapshotRequiresUpdate(tenSeats)).toBe(true);
    expect(parseMultiplayerRoomEnvelope({ roomId, snapshot: tenSeats })).toBeNull();

    const seatBeyondNine = personalizedSnapshot({
      seats: [seat(viewerPlayerId, 0), seat(opponentPlayerId, 1), seat('player:nine', 9)],
    });
    expect(multiplayerSnapshotRequiresUpdate(seatBeyondNine)).toBe(true);
    expect(parseMultiplayerRoomEnvelope({ roomId, snapshot: seatBeyondNine })).toBeNull();
  });

  it('keeps current nine-seat protocol snapshots outside the update gate', () => {
    const nineSeats = personalizedSnapshot({
      config: { ...config(), seatCount: 9 },
      seats: Array.from({ length: 9 }, (_, index) => (
        index === 0
          ? seat(viewerPlayerId, 0)
          : seat(`player:seat-${index}`, index)
      )),
    });
    expect(multiplayerSnapshotRequiresUpdate(nineSeats)).toBe(false);
    expect(parseMultiplayerRoomEnvelope({ roomId, snapshot: nineSeats })).not.toBeNull();
  });
});

describe('ephemeral table moment envelopes', () => {
  const roomId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const validMoment = {
    atMs: 10_000,
    handNumber: 2,
    id: 'moment:user-1:2:cheer:3',
    playerId: 'player-3',
    protocolVersion: 1,
    reactionId: 'cheer',
    roomId,
    seat: 3,
  };

  it('parses a valid broadcast envelope wrapped by the realtime payload field', () => {
    expect(parseTableMomentBroadcastEnvelope({
      payload: { moment: validMoment, roomId },
    })).toEqual(validMoment);
    expect(parseTableMomentBroadcastEnvelope({
      moment: validMoment,
      roomId,
    })).toEqual(validMoment);
  });

  it('parses every authored reaction id from the wire', () => {
    for (const reactionId of TABLE_MOMENT_REACTION_IDS) {
      const moment = parseTableMomentBroadcastEnvelope({
        payload: { moment: { ...validMoment, id: `moment:${reactionId}`, reactionId }, roomId },
      });
      expect(moment?.reactionId).toBe(reactionId);
    }
  });

  it('drops malformed, unknown, and future-protocol moments silently', () => {
    const moment = (overrides: Record<string, unknown>) => ({
      payload: { moment: { ...validMoment, ...overrides }, roomId },
    });
    expect(parseTableMomentBroadcastEnvelope(moment({ protocolVersion: 3 }))).toBeNull();
    expect(parseTableMomentBroadcastEnvelope(moment({ protocolVersion: 0 }))).toBeNull();
    expect(parseTableMomentBroadcastEnvelope(moment({ protocolVersion: '1' }))).toBeNull();
    expect(parseTableMomentBroadcastEnvelope(moment({ reactionId: 'banana' }))).toBeNull();
    expect(parseTableMomentBroadcastEnvelope(moment({ reactionId: 7 }))).toBeNull();
    expect(parseTableMomentBroadcastEnvelope(moment({ atMs: 0 }))).toBeNull();
    expect(parseTableMomentBroadcastEnvelope(moment({ atMs: 1.5 }))).toBeNull();
    expect(parseTableMomentBroadcastEnvelope(moment({ handNumber: -1 }))).toBeNull();
    expect(parseTableMomentBroadcastEnvelope(moment({ handNumber: 1.5 }))).toBeNull();
    expect(parseTableMomentBroadcastEnvelope(moment({ seat: 9 }))).toBeNull();
    expect(parseTableMomentBroadcastEnvelope(moment({ seat: -1 }))).toBeNull();
    expect(parseTableMomentBroadcastEnvelope(moment({ id: '' }))).toBeNull();
    expect(parseTableMomentBroadcastEnvelope(moment({ id: 'x'.repeat(81) }))).toBeNull();
    expect(parseTableMomentBroadcastEnvelope(moment({ playerId: '' }))).toBeNull();
    expect(parseTableMomentBroadcastEnvelope(moment({ roomId: '' }))).toBeNull();
    expect(parseTableMomentBroadcastEnvelope(moment({ roomId: 5 }))).toBeNull();
    expect(parseTableMomentBroadcastEnvelope(null)).toBeNull();
    expect(parseTableMomentBroadcastEnvelope('moment')).toBeNull();
    expect(parseTableMomentBroadcastEnvelope({ payload: 'nope' })).toBeNull();
    expect(parseTableMomentBroadcastEnvelope({ payload: { roomId } })).toBeNull();
  });

  it('drops a moment whose room does not match the subscribed topic', () => {
    const otherRoom = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const moment = { ...validMoment, roomId: otherRoom };
    // The strict parser still accepts the well-formed envelope...
    expect(parseTableMomentBroadcastEnvelope({ payload: { moment, roomId: otherRoom } }))
      .toEqual(moment);
    // ...while the service subscription gate rejects it before presentation.
    expect(parseTableMomentBroadcastEnvelope({ payload: { moment, roomId } })).not.toBeNull();
  });

  it('parses the Edge acceptance response into the same envelope', () => {
    expect(parseMultiplayerMomentEnvelope({ moment: validMoment, roomId })).toEqual(validMoment);
    expect(parseMultiplayerMomentEnvelope({ moment: { ...validMoment, reactionId: 'laugh' } }))
      .not.toBeNull();
    expect(parseMultiplayerMomentEnvelope({ roomId })).toBeNull();
    expect(parseMultiplayerMomentEnvelope(null)).toBeNull();
  });
});
