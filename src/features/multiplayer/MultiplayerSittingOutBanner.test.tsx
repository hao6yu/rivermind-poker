import { createElement, type ReactNode } from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import type { MultiplayerSeatState } from '../../domain/multiplayer/contracts';
import { multiplayerSeatHandPlayer, multiplayerSeatStatusBadge } from './multiplayerLifecycleUi';
import { MultiplayerSittingOutBanner } from './MultiplayerSittingOutBanner';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { __DEV__?: boolean }).__DEV__ = true;

vi.mock('react-native', () => {
  const host = (type: string) => (props: { children?: ReactNode }) => createElement(type, props, props.children);
  const Pressable = (props: { children?: ReactNode; [key: string]: unknown }) => (
    createElement('pressable', props, props.children)
  );
  return {
    Pressable,
    StyleSheet: { create: <T,>(styles: T): T => styles },
    Text: host('text'),
    View: host('view'),
  };
});
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('../../localization', () => ({
  useLocalization: () => ({
      tCount: (key: string, count: number, values?: Record<string, string | number>) => {
        let value = `T:${key}`;
        const merged = { ...values, count };
        for (const [name, replacement] of Object.entries(merged)) {
          value = value.replaceAll(`{{${name}}}`, String(replacement));
        }
        return value;
      },
    t: (key: string) => ({
      'multiplayer.game.sittingOutBanner': 'You are sitting out. Return next hand to be dealt back in.',
      'multiplayer.game.returnQueued': 'Returning next hand…',
      'multiplayer.game.returnNextHand': 'Return next hand',
    })[key] ?? key,
  }),
}));
vi.mock('../../theme', () => ({
  useAppTheme: () => ({ palette: new Proxy({}, { get: () => '#000' }) as Record<string, string> }),
}));

function seat(overrides: Partial<MultiplayerSeatState> = {}): MultiplayerSeatState {
  return {
    aiProfileId: null,
    connection: 'online',
    control: 'human',
    displayName: 'Viewer',
    isHost: false,
    joinedAtMs: 0,
    kind: 'human',
    ledger: { initialBuyIn: 2_000, playerId: 'p:viewer', rebuyChips: 0, rebuyCount: 0, settledAtMs: 0, settledHandNumber: 1, settledStack: 2_000, totalBuyIn: 2_000 },
    missedTurns: 0,
    participation: 'active',
    playerId: 'p:viewer',
    ready: true,
    seat: 0,
    userId: 'u:viewer',
    ...overrides,
  } as MultiplayerSeatState;
}

const t = (key: string) => key;

describe('viewer plaque states (P18-003)', () => {
  it('builds a hand-neutral plaque player for a seat the hand did not deal in', () => {
    const player = multiplayerSeatHandPlayer(seat({
      displayName: 'Kai',
      participation: 'sitting-out',
      playerId: 'p:kai',
      seat: 4,
    }));
    expect(player).toMatchObject({
      folded: false,
      holeCards: [],
      id: 'p:kai',
      name: 'Kai',
      seat: 4,
      stack: 2_000, // the authoritative settled stack, not a fabricated hand stack
    });
  });

  it('falls back to a zero stack when the seat has no settled ledger row', () => {
    const player = multiplayerSeatHandPlayer(seat({ ledger: undefined }));
    expect(player.stack).toBe(0);
  });

  it('names every viewer participation state on the plaque', () => {
    const live = { allIn: false, currentTurn: false, folded: false, handComplete: false, stack: 2_000, viewer: true };
    const settled = { ...live, handComplete: true };
    expect(multiplayerSeatStatusBadge(seat({ participation: 'active' }), live, t)).toBeNull();
    expect(multiplayerSeatStatusBadge(seat({ participation: 'active' }), { ...live, folded: true }, t)).toBe('multiway.state.folded');
    expect(multiplayerSeatStatusBadge(seat({ participation: 'active' }), { ...live, allIn: true, stack: 0 }, t)).toBe('multiway.state.allIn');
    expect(multiplayerSeatStatusBadge(seat({ participation: 'active' }), { ...live, currentTurn: true }, t)).toBe('multiplayer.game.yourTurn');
    expect(multiplayerSeatStatusBadge(seat({ participation: 'sitting-out' }), live, t)).toBe('multiplayer.game.sittingOut');
    expect(multiplayerSeatStatusBadge(seat({ participation: 'disconnected', connection: 'offline' }), live, t)).toBe('multiplayer.game.offline');
    expect(multiplayerSeatStatusBadge(seat({ participation: 'rebuy-pending' }), settled, t)).toBe('multiplayer.game.rebuyPending');
    expect(multiplayerSeatStatusBadge(seat({ participation: 'left' }), settled, t)).toBe('multiplayer.game.left');
    // Busted at the boundary (active seat, zero stack, complete hand).
    expect(multiplayerSeatStatusBadge(seat({ participation: 'active' }), { ...settled, stack: 0 }, t)).toBe('multiway.state.out');
  });
});

describe('sitting-out banner (P18-003)', () => {
  function renderBanner(onReturn?: () => void, queued = false): ReactTestRenderer {
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(createElement(MultiplayerSittingOutBanner, { onReturn, queued }));
    });
    return renderer!;
  }

  function textValues(renderer: ReactTestRenderer): string[] {
    const values: string[] = [];
    renderer.root.findAllByType('text' as never).forEach((node) => {
      const child = (node as unknown as { props: { children?: unknown } }).props.children;
      if (typeof child === 'string') values.push(child);
    });
    return values;
  }

  it('states the sitting-out state through a live region', () => {
    const renderer = renderBanner();
    const banner = renderer.root.findByType('view' as never);
    expect((banner as unknown as { props: Record<string, unknown> }).props.accessibilityLiveRegion).toBe('polite');
    expect(textValues(renderer)).toContain('You are sitting out. Return next hand to be dealt back in.');
    act(() => renderer.unmount());
  });

  it('offers Return next hand whenever the viewer can return', () => {
    const onReturn = vi.fn();
    const renderer = renderBanner(onReturn);
    expect(textValues(renderer)).toContain('Return next hand');
    const button = renderer.root.findByType('pressable' as never);
    act(() => {
      (button as unknown as { props: { onPress?: () => void } }).props.onPress?.();
    });
    expect(onReturn).toHaveBeenCalledTimes(1);
    act(() => renderer.unmount());
  });

  it('queues the return during live play and names the queued state', () => {
    const renderer = renderBanner(vi.fn(), true);
    expect(textValues(renderer)).toContain('Returning next hand…');
    const button = renderer.root.findByType('pressable' as never) as unknown as { props: { disabled?: boolean } };
    expect(button.props.disabled).toBe(true);
    act(() => renderer.unmount());
  });

  it('renders without a return action for a disconnected or busted sitting-out viewer', () => {
    const renderer = renderBanner(undefined);
    expect(textValues(renderer)).toContain('You are sitting out. Return next hand to be dealt back in.');
    expect(renderer.root.findAllByType('pressable' as never)).toHaveLength(0);
    act(() => renderer.unmount());
  });
});
