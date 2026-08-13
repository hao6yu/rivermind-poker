import { describe, expect, it } from 'vitest';

import {
  feedbackDedupeKey,
  feedbackDescriptorForCue,
  FeedbackDedupeWindow,
  feedbackSupersedesPendingResults,
  type GameplayFeedbackCue,
} from './gameplayFeedback';

describe('gameplay haptic feedback', () => {
  it('maps action, turn, timer, connection, and result events to restrained haptics', () => {
    const expectations: Array<[GameplayFeedbackCue, string]> = [
      ['newHand', 'light'],
      ['fold', 'selection'],
      ['check', 'light'],
      ['call', 'light'],
      ['raise', 'medium'],
      ['allIn', 'medium'],
      ['streetReveal', 'light'],
      ['viewerTurn', 'medium'],
      ['timerWarning', 'warning'],
      ['disconnect', 'warning'],
      ['restore', 'success'],
      [{ type: 'handResult', result: 'win' }, 'success'],
      [{ type: 'handResult', result: 'loss' }, 'warning'],
      [{ type: 'handResult', result: 'split' }, 'selection'],
    ];

    expectations.forEach(([cue, haptic]) => {
      const descriptor = feedbackDescriptorForCue(cue);
      expect(descriptor.haptic).toBe(haptic);
      expect(descriptor.durationMs).toBeGreaterThan(0);
    });
  });

  it('builds a semantic event key only when callers provide an event id', () => {
    expect(feedbackDedupeKey('raise', 'snapshot-8:action-4')).toBe('raise:snapshot-8:action-4');
    expect(feedbackDedupeKey({ type: 'handResult', result: 'split' }, 'hand-8')).toBe(
      'handResult:split:hand-8',
    );
    expect(feedbackDedupeKey('raise')).toBeNull();
  });

  it('consumes reconnect event ids once and evicts only the oldest bounded entry', () => {
    const window = new FeedbackDedupeWindow(2);
    expect(window.consume('action:1')).toBe(true);
    expect(window.consume('action:1')).toBe(false);
    expect(window.consume('action:2')).toBe(true);
    expect(window.consume('action:3')).toBe(true);
    expect(window.consume('action:1')).toBe(true);
    expect(window.consume(null)).toBe(true);
    expect(window.consume(null)).toBe(true);
  });

  it('lets a new deal supersede delayed feedback from the prior hand', () => {
    expect(feedbackSupersedesPendingResults('newHand')).toBe(true);
    expect(feedbackSupersedesPendingResults('viewerTurn')).toBe(false);
  });
});
