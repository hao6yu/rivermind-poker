import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MultiplayerViewerProjection } from '../../domain/multiplayer/contracts';
import { useMultiplayerSeatLiveness } from './useMultiplayerSeatLiveness';

const mocks = vi.hoisted(() => ({
  renew: vi.fn(), state: 'active', listeners: new Set<(state: string) => void>(),
}));
vi.mock('../../services/multiplayer', () => ({ renewMultiplayerSeatLiveness: mocks.renew }));
vi.mock('react-native', () => ({ AppState: {
  get currentState() { return mocks.state; },
  addEventListener: (_: string, listener: (state: string) => void) => {
    mocks.listeners.add(listener);
    return { remove: () => mocks.listeners.delete(listener) };
  },
} }));

const baseRoom = {
  roomId: 'room-one', status: 'lobby', viewerPlayerId: 'self',
  seats: [{ playerId: 'self', participation: 'active' }],
} as unknown as MultiplayerViewerProjection;
type Props = Parameters<typeof useMultiplayerSeatLiveness>[0];
function Probe(props: Props) { useMultiplayerSeatLiveness(props); return null; }
let tree: ReactTestRenderer | undefined;
const reconnect = vi.fn();
async function mount(overrides: Partial<Props> = {}) {
  await act(async () => { tree = create(createElement(Probe, { enabled: true, room: baseRoom, onReconnect: reconnect, ...overrides })); });
}
async function appState(state: string) {
  await act(async () => { mocks.state = state; mocks.listeners.forEach((listener) => listener(state)); });
}
beforeEach(() => {
  vi.useFakeTimers();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.state = 'active'; mocks.listeners.clear(); mocks.renew.mockReset().mockResolvedValue(true); reconnect.mockReset().mockResolvedValue(true);
});
afterEach(async () => { if (tree) await act(async () => tree!.unmount()); tree = undefined; vi.useRealTimers(); });

describe('production room heartbeat lifecycle', () => {
  it('renews during ready-up lobby and live play without restarting on each snapshot', async () => {
    await mount();
    expect(mocks.renew).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(mocks.renew).toHaveBeenCalledTimes(2);
    await act(async () => { tree!.update(createElement(Probe, { enabled: true, room: { ...baseRoom, status: 'playing' }, onReconnect: reconnect })); });
    expect(mocks.renew).toHaveBeenCalledTimes(2);
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(mocks.renew).toHaveBeenCalledTimes(3);
  });
  it('does not renew in the background; foreground retries immediately', async () => {
    await mount(); await appState('background');
    await act(async () => { vi.advanceTimersByTime(20_000); });
    expect(mocks.renew).toHaveBeenCalledTimes(1);
    await appState('active');
    expect(mocks.renew).toHaveBeenCalledTimes(2);
  });
  it.each(['complete', 'closed'] as const)('stops when %s and removes the lifecycle listener', async (status) => {
    await mount();
    await act(async () => { tree!.update(createElement(Probe, { enabled: status !== 'closed', room: { ...baseRoom, status: status === 'complete' ? 'complete' : 'lobby' }, onReconnect: reconnect })); });
    await act(async () => { vi.advanceTimersByTime(20_000); });
    expect(mocks.renew).toHaveBeenCalledTimes(1); expect(mocks.listeners.size).toBe(0);
  });
  it.each(['active', 'disconnected', 'sitting-out', 'left'] as const)('only recovers transport-disconnected seats, not %s decisions', async (participation) => {
    await mount({ room: { ...baseRoom, seats: [{ ...baseRoom.seats[0]!, participation }] } });
    expect(reconnect).toHaveBeenCalledTimes(participation === 'disconnected' ? 1 : 0);
  });
  it('never overlaps renewals or restores a seat after closing during a pending beat', async () => {
    let resolve!: (value: boolean) => void;
    mocks.renew.mockReturnValue(new Promise<boolean>((done) => { resolve = done; }));
    await mount({ room: { ...baseRoom, seats: [{ ...baseRoom.seats[0]!, participation: 'disconnected' }] } });
    await act(async () => { vi.advanceTimersByTime(20_000); });
    expect(mocks.renew).toHaveBeenCalledTimes(1);
    await act(async () => { tree!.unmount(); }); tree = undefined;
    await act(async () => { resolve(true); });
    expect(reconnect).not.toHaveBeenCalled();
  });
  it('can reconnect transport for a sitting-out owner without sending a Return command', async () => {
    await mount({ room: { ...baseRoom, seats: [{ ...baseRoom.seats[0]!, participation: 'sitting-out', connection: 'offline' }] } });
    expect(reconnect).toHaveBeenCalledTimes(1);
  });
  it('ignores an old room renewal after changing to a different room', async () => {
    let resolve!: (value: boolean) => void;
    mocks.renew.mockReturnValueOnce(new Promise<boolean>((done) => { resolve = done; }));
    await mount({ room: { ...baseRoom, seats: [{ ...baseRoom.seats[0]!, participation: 'disconnected' }] } });
    await act(async () => { tree!.update(createElement(Probe, { enabled: true, room: { ...baseRoom, roomId: 'room-two' }, onReconnect: reconnect })); });
    await act(async () => { resolve(true); });
    expect(mocks.renew.mock.calls.map(([roomId]) => roomId)).toEqual(['room-one', 'room-two']);
    expect(reconnect).not.toHaveBeenCalled();
  });
  it('retries failed beats without automatically restoring a seat', async () => {
    mocks.renew.mockRejectedValueOnce(new Error('offline'));
    await mount({ room: { ...baseRoom, seats: [{ ...baseRoom.seats[0]!, participation: 'disconnected' }] } });
    expect(reconnect).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(reconnect).toHaveBeenCalledTimes(1);
  });
});
