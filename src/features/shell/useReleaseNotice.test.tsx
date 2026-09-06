import { createElement } from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { completeOnboarding } from '../../services/onboarding';
import { RELEASE_NOTICE_STORAGE_KEY } from '../../services/releaseNotice';
import { useReleaseNotice } from './useReleaseNotice';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('release notice presentation lifecycle', () => {
  let tree: ReactTestRenderer;
  let notice: ReturnType<typeof useReleaseNotice>;
  let values: Map<string, string>;
  function Harness({ ready }: { ready: boolean }) {
    notice = useReleaseNotice(ready);
    return null;
  }
  function render(ready: boolean) {
    act(() => { tree = TestRenderer.create(createElement(Harness, { ready })); });
  }
  function ready(value: boolean) {
    act(() => { tree.update(createElement(Harness, { ready: value })); });
  }
  beforeEach(() => {
    vi.useFakeTimers();
    values = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    });
    completeOnboarding();
  });
  afterEach(() => {
    act(() => tree?.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('waits for a stable Home and cancels a pending presentation on navigation', () => {
    render(false);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(notice.visible).toBe(false);
    ready(true);
    act(() => { vi.advanceTimersByTime(300); });
    ready(false);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(notice.visible).toBe(false);
    expect(values.has(RELEASE_NOTICE_STORAGE_KEY)).toBe(false);
    ready(true);
    act(() => { vi.advanceTimersByTime(600); });
    expect(notice.visible).toBe(true);
    // An invite/table taking priority also hides an already open notice.
    ready(false);
    expect(notice.visible).toBe(false);
    expect(values.has(RELEASE_NOTICE_STORAGE_KEY)).toBe(false);
  });

  it('remains dismissed for the session and after remount', () => {
    render(true);
    act(() => { vi.advanceTimersByTime(600); });
    act(() => notice.dismiss());
    ready(false);
    ready(true);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(notice.visible).toBe(false);
    act(() => tree.unmount());
    render(true);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(notice.visible).toBe(false);
  });

  it('still dismisses in memory when the receipt cannot be written', () => {
    render(true);
    act(() => { vi.advanceTimersByTime(600); });
    vi.stubGlobal('localStorage', { setItem: () => { throw new Error('full'); } });
    act(() => notice.dismiss());
    act(() => { vi.advanceTimersByTime(1000); });
    expect(notice.visible).toBe(false);
  });

  it('account reset suppresses a pending notice without recreating deleted data', () => {
    render(true);
    act(() => notice.suppress());
    act(() => { vi.advanceTimersByTime(1000); });
    expect(notice.visible).toBe(false);
    expect(values.has(RELEASE_NOTICE_STORAGE_KEY)).toBe(false);
  });
});
