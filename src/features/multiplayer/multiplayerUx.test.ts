import { describe, expect, it } from 'vitest';

import { applyMultiplayerCommand, canStartMultiplayerRoom } from '../../domain/multiplayer/coordinator';
import type { MultiplayerRoomCommand } from '../../domain/multiplayer/contracts';
import {
  defaultMultiplayerDraft,
  isValidMultiplayerDisplayName,
  isValidMultiplayerRoomCode,
  MULTIPLAYER_COMPACT_SEAT_WIDTH,
  MULTIPLAYER_COMPACT_VIEWER_SEAT_WIDTH,
  MULTIPLAYER_COMPACT_GAME_TABLE_MIN_HEIGHT,
  MULTIPLAYER_COMPACT_RESULT_TABLE_MIN_HEIGHT,
  MULTIPLAYER_TABLET_COMPACT_GAME_TABLE_MIN_HEIGHT,
  MULTIPLAYER_TABLET_COMPACT_RESULT_TABLE_MIN_HEIGHT,
  MULTIPLAYER_WIDE_LAYOUT_MIN_WIDTH,
  MULTIPLAYER_WIDE_GAME_TABLE_MIN_HEIGHT,
  MULTIPLAYER_WIDE_RESULT_TABLE_MIN_HEIGHT,
  MULTIPLAYER_TABLET_VIEWPORT_MIN_EDGE,
  multiplayerAiRulesPresentation,
  multiplayerCompactLiveTableBudget,
  multiplayerCompactResultTableBudget,
  multiplayerGameLaneBounds,
  multiplayerGameSeatAnchor,
  multiplayerGameTableMinHeight,
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

  it('requires a product-authored safe nickname preset', () => {
    expect(isValidMultiplayerDisplayName(' A ')).toBe(false);
    expect(isValidMultiplayerDisplayName(' River ')).toBe(true);
    expect(isValidMultiplayerDisplayName('Custom Name')).toBe(false);
    expect(isValidMultiplayerDisplayName('river')).toBe(false);
    expect(isValidMultiplayerDisplayName('x'.repeat(19))).toBe(false);
  });

  it('explains preset nickname safety in every supported language', () => {
    expect(phase9EnglishMessages['multiplayer.name.remembered']).toContain('preset');
    expect(phase9SimplifiedMessages['multiplayer.name.remembered']).toContain('预设昵称');
    expect(phase9TraditionalMessages['multiplayer.name.remembered']).toContain('預設暱稱');
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
        expect(messages['multiplayer.lobby.removeAi']).toBeTruthy();
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

  it('reserves non-overlapping feedback and board lanes at every target viewport', () => {
    const cases = [
      { height: MULTIPLAYER_COMPACT_GAME_TABLE_MIN_HEIGHT, layout: 'compact' as const, screen: '320pt phone', tablet: false },
      { height: MULTIPLAYER_COMPACT_GAME_TABLE_MIN_HEIGHT, layout: 'compact' as const, screen: '375pt phone', tablet: false },
      { height: MULTIPLAYER_TABLET_COMPACT_GAME_TABLE_MIN_HEIGHT, layout: 'compact' as const, screen: '768pt iPad', tablet: true },
      { height: MULTIPLAYER_WIDE_GAME_TABLE_MIN_HEIGHT, layout: 'wide' as const, screen: '834pt iPad', tablet: true },
      { height: MULTIPLAYER_WIDE_GAME_TABLE_MIN_HEIGHT, layout: 'wide' as const, screen: '1024pt iPad', tablet: true },
    ];

    cases.forEach(({ height, layout, screen, tablet }) => {
      expect(multiplayerGameTableMinHeight(layout, tablet && layout === 'compact')).toBe(height);
      const lanes = multiplayerGameLaneBounds(height, layout, tablet && layout === 'compact');
      expect(lanes.topSeat.top, screen).toBeGreaterThanOrEqual(0);
      expect(lanes.topSeat.bottom, screen).toBeLessThanOrEqual(lanes.topFeedback.top);
      expect(lanes.topFeedback.bottom, screen).toBeLessThanOrEqual(lanes.board.top);
      expect(lanes.board.bottom, screen).toBeLessThanOrEqual(lanes.bottomFeedback.top);
      expect(lanes.bottomFeedback.bottom, screen).toBeLessThanOrEqual(lanes.bottomSeat.top);
      expect(lanes.bottomSeat.bottom, screen).toBeLessThanOrEqual(height);
    });
  });

  it('uses the readable compact-tablet footprints at a 700×768 iPad viewport', () => {
    const screenWidth = 700;
    const screenHeight = 768;
    const layout = multiplayerSeatLayoutForWidth(screenWidth);
    const tabletCompact = multiplayerUsesTabletSeatReadability(screenWidth, screenHeight)
      && layout === 'compact';

    expect(layout).toBe('compact');
    expect(tabletCompact).toBe(true);
    expect(multiplayerGameTableMinHeight(layout, tabletCompact)).toBe(
      MULTIPLAYER_TABLET_COMPACT_GAME_TABLE_MIN_HEIGHT,
    );

    const lanes = multiplayerGameLaneBounds(
      MULTIPLAYER_TABLET_COMPACT_GAME_TABLE_MIN_HEIGHT,
      layout,
      tabletCompact,
    );
    expect(lanes.topSeat.bottom).toBeLessThanOrEqual(lanes.topFeedback.top);
    expect(lanes.topFeedback.bottom).toBeLessThanOrEqual(lanes.board.top);
    expect(lanes.board.bottom).toBeLessThanOrEqual(lanes.bottomFeedback.top);
    expect(lanes.bottomFeedback.bottom).toBeLessThanOrEqual(lanes.bottomSeat.top);
    expect(lanes.bottomSeat.bottom).toBeLessThanOrEqual(
      MULTIPLAYER_TABLET_COMPACT_GAME_TABLE_MIN_HEIGHT,
    );
  });

  it('aligns all six game plaques into two rows instead of the board lane', () => {
    (['compact', 'wide'] as const).forEach((layout) => {
      const anchors = Array.from(
        { length: 6 },
        (_, seat) => multiplayerGameSeatAnchor(6, seat, layout),
      );
      const top = anchors.slice(2, 5).map(({ top: value }) => value);
      const bottom = [anchors[1]!, anchors[0]!, anchors[5]!].map(({ bottom: value }) => value);
      expect(new Set(top), `${layout} top row`).toEqual(new Set(['1%']));
      expect(new Set(bottom), `${layout} bottom row`).toEqual(new Set(['1%']));
    });
  });

  it('fits completed-hand lanes into the responsive result table minima', () => {
    const cases = [
      { height: MULTIPLAYER_COMPACT_RESULT_TABLE_MIN_HEIGHT, layout: 'compact' as const, tablet: false },
      { height: MULTIPLAYER_TABLET_COMPACT_RESULT_TABLE_MIN_HEIGHT, layout: 'compact' as const, tablet: true },
      { height: MULTIPLAYER_WIDE_RESULT_TABLE_MIN_HEIGHT, layout: 'wide' as const, tablet: true },
    ];
    cases.forEach(({ height, layout, tablet }) => {
      expect(multiplayerGameTableMinHeight(layout, tablet && layout === 'compact', 'result')).toBe(height);
      const lanes = multiplayerGameLaneBounds(height, layout, tablet && layout === 'compact', 'result');
      expect(lanes.topSeat.bottom).toBeLessThanOrEqual(lanes.topFeedback.top);
      expect(lanes.topFeedback.bottom).toBeLessThanOrEqual(lanes.board.top);
      expect(lanes.board.bottom).toBeLessThanOrEqual(lanes.bottomFeedback.top);
      expect(lanes.bottomFeedback.bottom).toBeLessThanOrEqual(lanes.bottomSeat.top);
      expect(lanes.bottomSeat.bottom).toBeLessThanOrEqual(height);
    });
  });

  it('fits a 320×568 result screen with a banner and wrapped result rail', () => {
    const safeAreaHeight = 548;
    expect(multiplayerCompactResultTableBudget(safeAreaHeight)).toBe(394);
    expect(multiplayerCompactResultTableBudget(safeAreaHeight, { transportBanner: true })).toBe(360);
    expect(multiplayerCompactResultTableBudget(safeAreaHeight, {
      resultRailHeight: 106,
      transportBanner: true,
    })).toBe(MULTIPLAYER_COMPACT_RESULT_TABLE_MIN_HEIGHT);
  });

  it('keeps the live action rail and all five table lanes when transport feedback appears', () => {
    const safeAreaHeight = 548;
    const stackedBannerBudget = multiplayerCompactLiveTableBudget(safeAreaHeight, {
      transportBanner: true,
    });
    const inlineBannerBudget = multiplayerCompactLiveTableBudget(safeAreaHeight, {
      transportBanner: true,
      transportBannerInline: true,
    });

    expect(multiplayerCompactLiveTableBudget(safeAreaHeight)).toBe(426);
    expect(stackedBannerBudget).toBe(392);
    expect(stackedBannerBudget).toBeLessThan(MULTIPLAYER_COMPACT_GAME_TABLE_MIN_HEIGHT);
    expect(inlineBannerBudget).toBe(426);
    expect(inlineBannerBudget).toBeGreaterThanOrEqual(MULTIPLAYER_COMPACT_GAME_TABLE_MIN_HEIGHT);

    const lanes = multiplayerGameLaneBounds(
      MULTIPLAYER_COMPACT_GAME_TABLE_MIN_HEIGHT,
      'compact',
    );
    expect(lanes.topSeat.bottom).toBeLessThanOrEqual(lanes.topFeedback.top);
    expect(lanes.topFeedback.bottom).toBeLessThanOrEqual(lanes.board.top);
    expect(lanes.board.bottom).toBeLessThanOrEqual(lanes.bottomFeedback.top);
    expect(lanes.bottomFeedback.bottom).toBeLessThanOrEqual(lanes.bottomSeat.top);
  });

  it('keeps lobby plaques outside its center status band', () => {
    const cases = [
      { height: 235, layout: 'compact' as const, seatHeight: 56 },
      { height: 270, layout: 'compact' as const, seatHeight: 68 },
      { height: 300, layout: 'wide' as const, seatHeight: 80 },
    ];
    cases.forEach(({ height, layout, seatHeight }) => {
      Array.from({ length: 6 }, (_, seat) => ({
        anchor: multiplayerSeatAnchor(6, seat, layout, 'lobby'),
        topRow: multiplayerSeatIsTopRow(6, seat),
      })).forEach(({ anchor, topRow }) => {
        const top = height * (Number.parseFloat(anchor.top) / 100);
        if (topRow) expect(top + seatHeight).toBeLessThan(height * 0.4);
        else expect(top).toBeGreaterThan(height * 0.6);
        expect(top + seatHeight).toBeLessThanOrEqual(height);
      });
    });
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
