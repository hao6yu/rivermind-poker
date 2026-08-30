import { describe, expect, it, vi } from 'vitest';

import {
  InvitationTurnClock,
  invitationClockAppStateReaction,
  invitationClockSecondsLabel,
} from '../invitationTurnClock';

describe('invitation turn clock (3.11D)', () => {
  it('counts down from the configured duration and expires exactly once', () => {
    const onExpire = vi.fn();
    const clock = new InvitationTurnClock(45, onExpire);
    expect(clock.tick(1_000)).toEqual({ remainingMs: 45_000, running: false });
    clock.start(1_000);
    expect(clock.tick(1_500)).toEqual({ remainingMs: 44_500, running: true });
    expect(clock.tick(46_500)).toEqual({ remainingMs: 0, running: false });
    expect(onExpire).toHaveBeenCalledTimes(1);
    // Additional ticks never re-fire expiry.
    expect(clock.tick(50_000)).toEqual({ remainingMs: 0, running: false });
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(clock.isExpired).toBe(true);
  });

  it('pauses on interruption and resumes with the same remaining duration', () => {
    const onExpire = vi.fn();
    const clock = new InvitationTurnClock(30, onExpire);
    clock.start(0);
    expect(clock.tick(2_000)).toEqual({ remainingMs: 28_000, running: true });
    clock.pause(2_000);
    expect(clock.running).toBe(false);
    // Time passes while paused; the remaining value does not move.
    expect(clock.tick(9_000)).toEqual({ remainingMs: 28_000, running: false });
    clock.start(9_000);
    expect(clock.tick(9_500)).toEqual({ remainingMs: 27_500, running: true });
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('classifies the reviewed urgency phases', () => {
    const clock = new InvitationTurnClock(45, () => undefined);
    clock.start(0);
    expect(clock.tick(1_000).remainingMs).toBe(44_000);
    expect(clock.phase()).toBe('calm');
    clock.pause(1_000);
    // Force the remaining value through the thresholds via pause/resume math.
    const drained = new InvitationTurnClock(11, () => undefined);
    drained.start(0);
    drained.tick(1_500);
    expect(drained.phase()).toBe('warning');
    drained.pause(1_500);
    const critical = new InvitationTurnClock(5, () => undefined);
    critical.start(0);
    critical.tick(250);
    expect(critical.phase()).toBe('critical');
  });

  it('rounds the display value up to whole seconds', () => {
    expect(invitationClockSecondsLabel(45_000)).toBe(45);
    expect(invitationClockSecondsLabel(44_250)).toBe(45);
    expect(invitationClockSecondsLabel(500)).toBe(1);
    expect(invitationClockSecondsLabel(0)).toBe(0);
  });

  it('rejects non-positive durations', () => {
    expect(() => new InvitationTurnClock(0, () => undefined)).toThrow();
    expect(() => new InvitationTurnClock(-5, () => undefined)).toThrow();
  });

  it('does not restart while already running', () => {
    const clock = new InvitationTurnClock(45, () => undefined);
    clock.start(0);
    clock.tick(1_000);
    clock.start(2_000);
    // The restart did not reset the remaining budget.
    expect(clock.tick(2_000)).toEqual({ remainingMs: 43_000, running: true });
  });

  it('reacts to AppState changes without ever resuming during the settle window', () => {
    // Backgrounding and OS interruptions always pause, whatever the clock is
    // doing — pausing an unstarted clock is a no-op.
    expect(invitationClockAppStateReaction('background', false, false)).toBe('pause');
    expect(invitationClockAppStateReaction('inactive', true, false)).toBe('pause');
    // Returning to the foreground before the settle delay completes must not
    // start the countdown: deal/street animations never consume the budget.
    expect(invitationClockAppStateReaction('active', true, false)).toBe('none');
    expect(invitationClockAppStateReaction('active', true, true)).toBe('none');
    // After the settle window the resumed clock starts with its remaining time.
    expect(invitationClockAppStateReaction('active', false, false)).toBe('start');
    // An expired clock is never restarted; its expiry already fired once.
    expect(invitationClockAppStateReaction('active', false, true)).toBe('none');
  });

  it('keeps the settle gate honest against the real class', () => {
    const onExpire = vi.fn();
    const clock = new InvitationTurnClock(45, onExpire);
    // During the settle window the reaction declines to start; after it, the
    // started clock runs and expiry still fires exactly once.
    expect(invitationClockAppStateReaction('active', true, clock.isExpired)).toBe('none');
    expect(invitationClockAppStateReaction('active', false, clock.isExpired)).toBe('start');
    clock.start(0);
    expect(clock.tick(45_000)).toEqual({ remainingMs: 0, running: false });
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(invitationClockAppStateReaction('active', false, clock.isExpired)).toBe('none');
  });
});
