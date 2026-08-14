import { describe, expect, it } from 'vitest';

import { applyMultiplayerCommand, canStartMultiplayerRoom } from '../../domain/multiplayer/coordinator';
import type { MultiplayerRoomCommand } from '../../domain/multiplayer/contracts';
import {
  defaultMultiplayerDraft,
  isValidMultiplayerDisplayName,
  isValidMultiplayerRoomCode,
  MULTIPLAYER_COMPACT_SEAT_WIDTH,
  MULTIPLAYER_COMPACT_VIEWER_SEAT_WIDTH,
  MULTIPLAYER_WIDE_LAYOUT_MIN_WIDTH,
  MULTIPLAYER_TABLET_VIEWPORT_MIN_EDGE,
  multiplayerAiRulesPresentation,
  multiplayerSeatAnchor,
  multiplayerSeatFootprintWidth,
  multiplayerSeatHorizontalAlignment,
  multiplayerSeatIsTopRow,
  multiplayerSeatLayoutForWidth,
  multiplayerUsesTabletSeatReadability,
  multiplayerTableWidthForScreen,
  normalizeMultiplayerRoomCode,
} from './multiplayerUx';
import {
  createMultiplayerLobbyState,
  multiplayerLobbySeats,
  multiplayerLobbyViewerUserId,
} from './multiplayerLobbyState';
import {
  phase9EnglishMessages,
  phase9SimplifiedMessages,
  phase9TraditionalMessages,
} from '../../localization/phase9Messages';

describe('multiplayer room entry', () => {
  it('accepts exactly six numeric digits for a room code', () => {
    expect(normalizeMultiplayerRoomCode('room 72-48-26')).toBe('724826');
    expect(normalizeMultiplayerRoomCode('123456789')).toBe('123456');
    expect(isValidMultiplayerRoomCode('724826')).toBe(true);
    expect(isValidMultiplayerRoomCode('72482')).toBe(false);
    expect(isValidMultiplayerRoomCode('ABC234')).toBe(false);
  });

  it('requires a short but meaningful display name', () => {
    expect(isValidMultiplayerDisplayName(' A ')).toBe(false);
    expect(isValidMultiplayerDisplayName(' River ')).toBe(true);
    expect(isValidMultiplayerDisplayName('x'.repeat(19))).toBe(false);
  });

  it('keeps multiplayer amounts chip-based without repeating a unit label', () => {
    [phase9EnglishMessages, phase9SimplifiedMessages, phase9TraditionalMessages].forEach((messages) => {
      const gameFacingCopy = Object.entries(messages)
        .filter(([key]) => key.startsWith('multiplayer.'))
        .map(([, value]) => value)
        .join(' ');
      expect(gameFacingCopy).not.toMatch(/\bBB\b|big blinds?/i);
    });
    expect(phase9EnglishMessages['multiplayer.option.chips']).toBe('{{amount}}');
    expect(phase9EnglishMessages['multiplayer.lobby.tableSummary']).not.toContain('chips');
    expect(phase9EnglishMessages['multiplayer.game.pot']).not.toContain('chips');
  });
});

describe('multiplayer lobby preview', () => {
  it('discloses one AI challenge and turn timer to hosts and guests', () => {
    expect(multiplayerAiRulesPresentation('friendly', 30)).toEqual({
      difficultyKey: 'difficulty.friendly',
      difficultySummaryKey: 'difficulty.friendlySummary',
      turnSeconds: 30,
    });
    expect(multiplayerAiRulesPresentation('club', 45)).toEqual({
      difficultyKey: 'difficulty.club',
      difficultySummaryKey: 'difficulty.clubSummary',
      turnSeconds: 45,
    });
    expect(multiplayerAiRulesPresentation('sharp', 60)).toEqual({
      difficultyKey: 'difficulty.sharp',
      difficultySummaryKey: 'difficulty.sharpSummary',
      turnSeconds: 60,
    });
    [phase9EnglishMessages, phase9SimplifiedMessages, phase9TraditionalMessages]
      .forEach((messages) => {
        expect(messages['multiplayer.create.aiNote']).toContain('{{difficulty}}');
        expect(messages['multiplayer.create.aiNote']).toContain('{{summary}}');
        expect(messages['multiplayer.lobby.aiRules']).toContain('{{difficulty}}');
        expect(messages['multiplayer.lobby.aiRules']).toContain('{{seconds}}');
      });
    expect(phase9EnglishMessages['multiplayer.create.ai']).toBe('AI difficulty');
  });

  it('creates a host lobby with only the viewer occupied', () => {
    const state = createMultiplayerLobbyState('create', {
      ...defaultMultiplayerDraft,
      playerName: 'Kai',
    }, '724826', 1_000);
    const seats = multiplayerLobbySeats(state, multiplayerLobbyViewerUserId('create'));
    expect(seats).toHaveLength(3);
    expect(seats[0]).toMatchObject({ displayName: 'Kai', isHost: true, isViewer: true, kind: 'human' });
    expect(seats.slice(1).every((seat) => seat.kind === 'open')).toBe(true);
  });

  it('creates a joined lobby with a ready remote host', () => {
    const state = createMultiplayerLobbyState('join', {
      ...defaultMultiplayerDraft,
      playerName: 'Kai',
      seatCount: 6,
    }, '724826', 1_000);
    const seats = multiplayerLobbySeats(state, multiplayerLobbyViewerUserId('join'));
    expect(seats.filter((seat) => seat.kind === 'human')).toHaveLength(2);
    expect(seats.find((seat) => seat.isHost)).toMatchObject({ displayName: 'Mina', ready: true });
    expect(seats.find((seat) => seat.isViewer)).toMatchObject({ displayName: 'Kai', ready: false });
    expect(seats.filter((seat) => seat.kind === 'ai')).toHaveLength(1);
  });

  it('uses coordinator commands for ready and AI seat changes', () => {
    let state = createMultiplayerLobbyState('create', {
      ...defaultMultiplayerDraft,
      playerName: 'Kai',
    }, '724826', 1_000);
    const send = (command: MultiplayerRoomCommand) => {
      state = applyMultiplayerCommand(state, command, { nowMs: 1_100 + state.version }).state;
    };
    send({
      actorUserId: multiplayerLobbyViewerUserId('create'),
      commandId: 'ready',
      expectedVersion: state.version,
      ready: true,
      type: 'set-ready',
    });
    expect(canStartMultiplayerRoom(state)).toBe(false);
    send({
      actorUserId: multiplayerLobbyViewerUserId('create'),
      commandId: 'add-ai',
      expectedVersion: state.version,
      seat: 1,
      type: 'add-ai',
    });
    expect(canStartMultiplayerRoom(state)).toBe(true);
    send({
      actorUserId: multiplayerLobbyViewerUserId('create'),
      commandId: 'remove-ai',
      expectedVersion: state.version,
      seat: 1,
      type: 'remove-ai',
    });
    expect(canStartMultiplayerRoom(state)).toBe(false);
  });

  it('provides unique anchors for every supported table size', () => {
    (['compact', 'wide'] as const).forEach((layout) => {
      ([2, 3, 6] as const).forEach((count) => {
        const anchors = Array.from(
          { length: count },
          (_, seat) => multiplayerSeatAnchor(count, seat, layout),
        );
        expect(new Set(anchors.map((anchor) => `${anchor.left}:${anchor.top}`)).size).toBe(count);
      });
    });
  });

  it('keeps all compact six-seat cards in clear top and bottom lanes', () => {
    const anchors = Array.from({ length: 6 }, (_, seat) => multiplayerSeatAnchor(6, seat));
    expect(anchors.slice(2, 5).every(({ top }) => Number.parseInt(top, 10) <= 4)).toBe(true);
    expect([anchors[0]!, anchors[1]!, anchors[5]!].every(({ top }) => Number.parseInt(top, 10) >= 72)).toBe(true);
  });

  it('orients every seat toward the center without card-label overlap', () => {
    expect([0, 1].map((seat) => multiplayerSeatIsTopRow(2, seat))).toEqual([false, true]);
    expect([0, 1, 2].map((seat) => multiplayerSeatIsTopRow(3, seat))).toEqual([false, true, true]);
    expect(Array.from({ length: 6 }, (_, seat) => multiplayerSeatIsTopRow(6, seat)))
      .toEqual([false, false, true, true, true, false]);
  });

  it('aligns action bubbles inward at table edges', () => {
    expect([0, 1, 2].map((seat) => multiplayerSeatHorizontalAlignment(3, seat)))
      .toEqual(['center', 'left', 'right']);
    expect(Array.from({ length: 6 }, (_, seat) => multiplayerSeatHorizontalAlignment(6, seat, 'wide')))
      .toEqual(['center', 'left', 'left', 'center', 'right', 'right']);
  });

  it('keeps every percentage anchor within the table bounds', () => {
    (['compact', 'wide'] as const).forEach((layout) => {
      ([2, 3, 6] as const).forEach((count) => {
        Array.from({ length: count }, (_, seat) => multiplayerSeatAnchor(count, seat, layout))
          .forEach(({ left, top }) => {
            expect(Number.parseInt(left, 10)).toBeGreaterThanOrEqual(0);
            expect(Number.parseFloat(left)).toBeLessThanOrEqual(69);
            expect(Number.parseInt(top, 10)).toBeGreaterThanOrEqual(0);
            expect(Number.parseInt(top, 10)).toBeLessThanOrEqual(77);
          });
      });
    });
  });

  it('keeps compact seat footprints inside supported narrow phones', () => {
    [320, 375].forEach((screenWidth) => {
      // The lobby has the tighter 12-point gutters; game tables are wider.
      const tableWidth = screenWidth - 24;
      ([2, 3, 6] as const).forEach((count) => {
        Array.from({ length: count }, (_, seat) => multiplayerSeatAnchor(count, seat))
          .forEach(({ left }) => {
            const seatLeft = tableWidth * (Number.parseFloat(left) / 100);
            expect(seatLeft).toBeGreaterThanOrEqual(0);
            expect(seatLeft + MULTIPLAYER_COMPACT_SEAT_WIDTH).toBeLessThanOrEqual(tableWidth);
          });
      });
    });
  });

  it('keeps all three six-player plaques in each compact lane separated', () => {
    [320, 375].forEach((screenWidth) => {
      const lobbyTableWidth = screenWidth - 24;
      const gameTableWidth = screenWidth - 14;
      const leftFor = (seat: number, tableWidth: number) => (
        tableWidth * (Number.parseFloat(multiplayerSeatAnchor(6, seat).left) / 100)
      );
      const expectSeparated = (
        seats: readonly number[],
        tableWidth: number,
        widthFor: (seat: number) => number,
      ) => {
        const footprints = seats
          .map((seat) => ({
            left: leftFor(seat, tableWidth),
            right: leftFor(seat, tableWidth) + widthFor(seat),
          }))
          .sort((left, right) => left.left - right.left);
        footprints.slice(1).forEach((footprint, index) => {
          expect(footprint.left).toBeGreaterThan(footprints[index]!.right);
        });
        expect(footprints[0]!.left).toBeGreaterThanOrEqual(0);
        expect(footprints.at(-1)!.right).toBeLessThanOrEqual(tableWidth);
      };

      // Lobby seats all use the same compact footprint.
      expectSeparated([2, 3, 4], lobbyTableWidth, () => MULTIPLAYER_COMPACT_SEAT_WIDTH);
      expectSeparated([1, 0, 5], lobbyTableWidth, () => MULTIPLAYER_COMPACT_SEAT_WIDTH);

      // The viewer is slightly wider during play, so cover that lane separately.
      expectSeparated(
        [1, 0, 5],
        gameTableWidth,
        (seat) => seat === 0
          ? MULTIPLAYER_COMPACT_VIEWER_SEAT_WIDTH
          : MULTIPLAYER_COMPACT_SEAT_WIDTH,
      );
    });
  });

  it('uses compact split-view geometry and full-width iPad geometry without six-seat overlap', () => {
    const screenCases = [
      { expectedLayout: 'compact' as const, screenWidth: 700 },
      { expectedLayout: 'compact' as const, screenWidth: 768 },
      { expectedLayout: 'wide' as const, screenWidth: 834 },
      { expectedLayout: 'wide' as const, screenWidth: 1_024 },
    ];
    const lanes = [[2, 3, 4], [1, 0, 5]] as const;

    screenCases.forEach(({ expectedLayout, screenWidth }) => {
      const layout = multiplayerSeatLayoutForWidth(screenWidth);
      expect(layout).toBe(expectedLayout);

      (['lobby', 'game'] as const).forEach((surface) => {
        const tableWidth = multiplayerTableWidthForScreen(screenWidth, surface, layout);
        lanes.forEach((seats) => {
          const footprints = seats.map((seat) => {
            const left = tableWidth * (Number.parseFloat(multiplayerSeatAnchor(6, seat, layout).left) / 100);
            return {
              left,
              right: left + multiplayerSeatFootprintWidth(
                layout,
                surface,
                surface === 'game' && seat === 0,
              ),
              seat,
            };
          }).sort((left, right) => left.left - right.left);

          expect(footprints[0]!.left).toBeGreaterThanOrEqual(0);
          expect(footprints.at(-1)!.right).toBeLessThanOrEqual(tableWidth);
          footprints.slice(1).forEach((footprint, index) => {
            expect(
              footprint.left,
              `${screenWidth}pt ${surface} seats ${footprints[index]!.seat}/${footprint.seat} overlap`,
            ).toBeGreaterThan(footprints[index]!.right);
          });
        });
      });
    });
  });

  it('switches to large iPad plaques only once the wide footprint mathematically fits', () => {
    expect(multiplayerSeatLayoutForWidth(MULTIPLAYER_WIDE_LAYOUT_MIN_WIDTH - 1)).toBe('compact');
    expect(multiplayerSeatLayoutForWidth(MULTIPLAYER_WIDE_LAYOUT_MIN_WIDTH)).toBe('wide');

    const tableWidth = multiplayerTableWidthForScreen(
      MULTIPLAYER_WIDE_LAYOUT_MIN_WIDTH,
      'game',
      'wide',
    );
    const viewerLeft = tableWidth * (Number.parseFloat(multiplayerSeatAnchor(6, 0, 'wide').left) / 100);
    const rightSeatLeft = tableWidth * (Number.parseFloat(multiplayerSeatAnchor(6, 5, 'wide').left) / 100);
    expect(viewerLeft + multiplayerSeatFootprintWidth('wide', 'game', true))
      .toBeLessThan(rightSeatLeft);
  });

  it('separates compact iPad geometry from tablet-readable plaque sizing', () => {
    expect(multiplayerSeatLayoutForWidth(768)).toBe('compact');
    expect(multiplayerUsesTabletSeatReadability(768, 1_024)).toBe(true);
    expect(multiplayerUsesTabletSeatReadability(810, 1_080)).toBe(true);
    expect(multiplayerUsesTabletSeatReadability(844, 390)).toBe(false);
    expect(multiplayerUsesTabletSeatReadability(MULTIPLAYER_TABLET_VIEWPORT_MIN_EDGE - 1, 1_024)).toBe(false);

    [768, 810].forEach((screenWidth) => {
      (['lobby', 'game'] as const).forEach((surface) => {
        const tableWidth = multiplayerTableWidthForScreen(screenWidth, surface, 'compact');
        [[2, 3, 4], [1, 0, 5]].forEach((seats) => {
          const lane = seats.map((seat) => {
            const left = tableWidth * (Number.parseFloat(multiplayerSeatAnchor(6, seat, 'compact').left) / 100);
            const width = multiplayerSeatFootprintWidth(
              'compact',
              surface,
              surface === 'game' && seat === 0,
              true,
            );
            return { left, right: left + width };
          }).sort((left, right) => left.left - right.left);

          lane.slice(1).forEach((plaque, index) => {
            expect(plaque.left).toBeGreaterThan(lane[index]!.right);
          });
          expect(lane.at(-1)!.right).toBeLessThanOrEqual(tableWidth);
        });
      });
    });
  });
});
