import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { expect, it, vi } from 'vitest';
import { useChampionshipOrientation } from './useChampionshipOrientation';

const native = vi.hoisted(() => ({ get: vi.fn(), supports: vi.fn(), lock: vi.fn() }));
vi.hoisted(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
vi.mock('expo-screen-orientation', () => ({ OrientationLock: { DEFAULT: 0, UNKNOWN: -1, PORTRAIT_UP: 3 }, getOrientationLockAsync: native.get, supportsOrientationLockAsync: native.supports, lockAsync: native.lock }));
function Harness() { useChampionshipOrientation(true); return null; }

it('serializes the automatic map lock and restoration when closed during a native request', async () => {
  let finish!: () => void;
  native.get.mockResolvedValue(3); native.supports.mockResolvedValue(true);
  native.lock.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; })).mockResolvedValue(undefined);
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => { tree = TestRenderer.create(createElement(Harness)); });
  expect(native.lock.mock.calls).toEqual([[0]]);
  await act(async () => { tree.unmount(); });
  expect(native.lock.mock.calls).toEqual([[0]]);
  await act(async () => { finish(); });
  expect(native.lock.mock.calls).toEqual([[0], [3]]);
});
