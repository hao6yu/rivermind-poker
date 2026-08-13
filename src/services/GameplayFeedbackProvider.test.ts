import { describe, expect, it } from 'vitest';

import { GameplayFeedbackScopeScheduler, type FeedbackTimerDriver } from './gameplayFeedback';

function controlledTimerDriver() {
  let nextId = 0;
  const callbacks = new Map<number, () => void>();
  const cleared = new Set<number>();
  const driver: FeedbackTimerDriver = {
    clear: (timer) => {
      cleared.add(timer as unknown as number);
    },
    set: (callback) => {
      const timer = ++nextId;
      callbacks.set(timer, callback);
      return timer as unknown as ReturnType<typeof setTimeout>;
    },
  };
  return { callbacks, cleared, driver };
}

describe('GameplayFeedbackProvider scope scheduling', () => {
  it('prevents a delayed result haptic after table cleanup', () => {
    const timers = controlledTimerDriver();
    const scope = new GameplayFeedbackScopeScheduler(timers.driver);
    let hapticCount = 0;

    scope.schedule(() => {
      hapticCount += 1;
    }, 500);
    expect(scope.pendingCount).toBe(1);

    scope.cancelAll();
    expect(scope.pendingCount).toBe(0);
    expect(timers.cleared).toEqual(new Set([1]));

    // Model a timer callback already queued on the JS event loop when cleanup
    // ran. The revision guard still rejects its stale result work.
    timers.callbacks.get(1)?.();
    expect(hapticCount).toBe(0);
  });

  it('allows feedback scheduled by the next table scope', () => {
    const timers = controlledTimerDriver();
    const scope = new GameplayFeedbackScopeScheduler(timers.driver);
    let playCount = 0;
    scope.schedule(() => { playCount += 1; }, 100);
    scope.cancelAll();
    scope.schedule(() => { playCount += 1; }, 100);

    timers.callbacks.get(1)?.();
    timers.callbacks.get(2)?.();
    expect(playCount).toBe(1);
  });

  it('drops timer-delayed feedback on scope cleanup', () => {
    const timers = controlledTimerDriver();
    const scheduler = new GameplayFeedbackScopeScheduler(timers.driver);
    let hapticCount = 0;

    scheduler.schedule(() => {
      hapticCount += 1;
    }, 300);

    // Mirrors stopGameplayFeedback(): cancel provider-owned callbacks as one
    // table-scope operation.
    scheduler.cancelAll();
    timers.callbacks.get(1)?.();
    expect(hapticCount).toBe(0);
  });
});
