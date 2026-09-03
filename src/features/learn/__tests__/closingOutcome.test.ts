import { describe, expect, it, vi } from 'vitest';

// The review resolver builds its trainer through a builder that imports
// `secureRandom`, which pulls in `expo-crypto`. Stub the crypto entry point the
// resolver only needs (mirrors recommendedSessionPresentation.test.ts).
vi.mock('expo-crypto', () => ({ getRandomValues: () => new Uint32Array(64) }));
import { translate } from '../../../localization/core';
import {
  englishMessages,
  simplifiedChineseMessages,
  traditionalChineseMessages,
  type MessageKey,
} from '../../../localization/messages';
import type { LearningSessionRecord } from '../../../domain/learning/history';
import { applyLearningReviewUpdate, type LearningReviewItem } from '../../../domain/learning/reviewQueue';
import {
  buildClosingSummary,
  buildSessionEvidenceSnapshot,
  type GradedHandEvidence,
  type SessionStepDecisions,
} from '../../../domain/learning/sessionClosing';
import { closingOutcomeCopy } from '../closingOutcome';
import type { RecommendedSessionPlan } from '../../../domain/learning/recommendedSession';
import type { SessionLoc } from '../recommendedSessionPresentation';

const NOW = '2026-01-15T10:00:00.000Z';
const CONCEPT = 'postflop-betting';
const ACTIVITY = 'scenario-pack-betting';

const closingKeys: MessageKey[] = [
  'learn.closingPracticed',
  'learn.closingSteps',
  'learn.closingDecision',
  'learn.closingDecisions',
  'learn.closingChanged',
  'learn.closingStrengthSession',
  'learn.closingStrengthHistory',
  'learn.closingImprovement',
  'learn.closingBuildingEvidence',
  'learn.closingFocus',
  'learn.closingNext',
  'learn.closingNextReviewDue',
  'learn.closingNextReviewInOneDay',
  'learn.closingNextReviewIn',
  'learn.closingNextContinuePath',
  'learn.closingNextMoreEvidence',
  'learn.closingViewProgress',
];

function interpolationNames(message: string): string[] {
  return Array.from(message.matchAll(/\{\{(\w+)\}\}/g), ([, name]) => name!).sort();
}

function plan(): RecommendedSessionPlan {
  return {
    id: 'postflop-session',
    concept: CONCEPT,
    createdAt: '2026-01-15T09:00:00.000Z',
    completedAt: NOW,
    estimatedMinutes: 5,
    reason: 'continue-path',
    status: 'completed',
    version: 1,
    steps: [{
      id: 'step-0',
      kind: 'activity',
      reason: 'continue-path',
      concept: CONCEPT,
      estimatedMinutes: 5,
      status: 'completed',
      target: { kind: 'activity', activityId: ACTIVITY },
      titleHint: 'Postflop betting',
    }],
  };
}

function reviewItems(count: number, nextReviewAt = '2026-01-14T00:00:00.000Z'): LearningReviewItem[] {
  return applyLearningReviewUpdate(
    [],
    Array.from({ length: count }, (_, index) => ({
      activityId: ACTIVITY,
      questionId: `q-${index}`,
      source: 'trainer' as const,
    })),
    [],
    nextReviewAt,
  );
}

/** A stub `t` that echoes the key and its interpolation values so tests can pin
 * the localization contract and the accessibility-summary ordering. */
function echoT(key: string, values?: Record<string, string | number>): string {
  return values ? `${key}|${JSON.stringify(values)}` : key;
}

function loc(): SessionLoc {
  return {
    t: (key, values) => echoT(key as string, values),
    // Mirror the provider's count-aware accessor with the same echo contract.
    tCount: (key, count, values) => echoT(key as string, { ...values, count }),
    activityText: (activity) => activity.id,
    practicePackText: (pack) => pack.id,
    scenarioContent: (spot) => spot,
    trainerContent: (trainer) => trainer,
  };
}

function closeSummary(
  decisions: SessionStepDecisions,
  options: {
    history?: readonly LearningSessionRecord[];
    reviewQueue?: readonly LearningReviewItem[];
    handEvidence?: readonly GradedHandEvidence[];
    nextActivityId?: string | null;
  } = {},
) {
  return buildClosingSummary({
    snapshot: buildSessionEvidenceSnapshot(plan(), decisions, NOW),
    history: options.history ?? [],
    reviewQueue: options.reviewQueue ?? [],
    handEvidence: options.handEvidence ?? [],
    nextActivityId: options.nextActivityId ?? null,
    now: NOW,
  });
}

describe('closing-outcome localization (all three locales)', () => {
  it.each(['zh-Hans', 'zh-Hant'] as const)(
    'translates every closing key in %s (no English fallback)',
    (language) => {
      const catalog = language === 'zh-Hans' ? simplifiedChineseMessages : traditionalChineseMessages;
      closingKeys.forEach((key) => {
        expect(catalog[key], `${key} ${language}`).toBeDefined();
        expect(catalog[key], `${key} ${language}`).not.toBe(englishMessages[key]);
      });
    },
  );

  it('defines every closing key in all three catalogs', () => {
    closingKeys.forEach((key) => {
      expect(englishMessages[key], `${key} en`).toBeDefined();
      expect(simplifiedChineseMessages[key], `${key} zh-Hans`).toBeDefined();
      expect(traditionalChineseMessages[key], `${key} zh-Hant`).toBeDefined();
    });
  });

  it('keeps interpolation-variable parity across all locales', () => {
    closingKeys.forEach((key) => {
      const names = interpolationNames(englishMessages[key]);
      expect(interpolationNames(simplifiedChineseMessages[key]), `${key} zh-Hans`).toEqual(names);
      expect(interpolationNames(traditionalChineseMessages[key]), `${key} zh-Hant`).toEqual(names);
    });
  });

  it('interpolates a real closing line without leaving any braces', () => {
    const values = { concept: 'Postflop betting', count: 3, hands: 2, points: 6, days: 2, spots: 2, activity: 'Postflop betting', completed: 2, skipped: 0 };
    closingKeys.forEach((key) => {
      const rendered = translate('en', key, values);
      expect(rendered).not.toContain('{{');
    });
    expect(translate('zh-Hans', 'learn.closingStrengthSession', values)).toContain('3');
  });
});

describe('closing-outcome accessibility summary', () => {
  it('orders concept, evidence statement, focus, and next action in a single label', () => {
    const summary = closeSummary(
      { decisionsScored: 3, costlyMistakes: 0 },
      { reviewQueue: reviewItems(2) },
    );
    expect(summary.statement).toBe('strength');
    expect(summary.focus).not.toBeNull();

    const copy = closingOutcomeCopy(summary, 'completed', loc());
    const label = copy.accessibilityLabel;
    const markers = [
      'concept.postflopBetting',
      'learn.closingStrengthSession',
      'learn.closingFocus',
      'learn.closingNextReviewDue',
    ];
    const indices = markers.map((marker) => label.indexOf(marker));
    indices.forEach((index, markerIndex) => {
      expect(index, `marker ${markers[markerIndex]}`).toBeGreaterThan(-1);
      if (markerIndex > 0) {
        expect(index, `${markers[markerIndex]} after ${markers[markerIndex - 1]}`).toBeGreaterThan(indices[markerIndex - 1]!);
      }
    });
    // The quiet route and the primary action are separate controls, so they stay
    // out of the card's ordered summary.
    expect(label).not.toContain('learn.closingViewProgress');
    expect(label).not.toContain('learn.finish');
    // The view title is its own announced header, so it must not be repeated in
    // the composed summary (no double-announcement of the title).
    expect(label).not.toContain('learn.sessionComplete');
    expect(label).not.toContain('learn.sessionEnded');
  });

  it('carries the quiet progress route and Finish as their own labels', () => {
    const summary = closeSummary({ decisionsScored: 1, costlyMistakes: 0 }, { nextActivityId: ACTIVITY });
    const copy = closingOutcomeCopy(summary, 'completed', loc());
    expect(copy.progressRoute).toBe('learn.closingViewProgress');
    expect(copy.finish).toBe('learn.finish');
  });

  it('reflects a paused (abandoned) session in the title', () => {
    const summary = closeSummary({ decisionsScored: 1, costlyMistakes: 0 });
    const copy = closingOutcomeCopy(summary, 'abandoned', loc());
    expect(copy.title).toBe('learn.sessionEnded');
  });

  it('resolves the continue-path next action to a localizable activity title', () => {
    const lessonId = 'lesson-postflop-board-texture';
    const summary = closeSummary({ decisionsScored: 1, costlyMistakes: 0 }, { nextActivityId: lessonId });
    expect(summary.next).toEqual({ kind: 'continue-path', daysUntilReview: null, activityId: lessonId });
    const copy = closingOutcomeCopy(summary, 'completed', loc());
    // The stub activityText returns the activity id, proving the id was resolved
    // through the activity title resolver rather than falling back to concept.
    expect(copy.nextAction).toContain(lessonId);
  });
});

describe('closing-outcome singular grammar', () => {
  it('delegates the reviewed-decision count to the plural catalog', () => {
    // The singular/plural selection now lives in the locale plural catalogs
    // (one/other), so the copy layer passes the count through tCount instead
    // of branching on it.
    const summary = closeSummary({ decisionsScored: 1, costlyMistakes: 0 });
    const copy = closingOutcomeCopy(summary, 'completed', loc());
    expect(copy.practicedDecisions).toBe('learn.closingDecisions|{"count":1}');
    expect(closingOutcomeCopy(closeSummary({ decisionsScored: 0, costlyMistakes: 0 }), 'completed', loc()).practicedDecisions)
      .toBe('learn.closingDecisions|{"count":0}');
    expect(closingOutcomeCopy(closeSummary({ decisionsScored: 3, costlyMistakes: 0 }), 'completed', loc()).practicedDecisions)
      .toBe('learn.closingDecisions|{"count":3}');
  });

  it('reads a one-day review in the singular', () => {
    // A review scheduled one day from now uses the dedicated one-day key, not the
    // plural "in N days" template with days=1.
    const inOneDay = '2026-01-16T10:00:00.000Z'; // NOW + 1 day
    const summary = closeSummary({ decisionsScored: 1, costlyMistakes: 0 }, { reviewQueue: reviewItems(1, inOneDay) });
    expect(summary.next).toEqual({ kind: 'review', daysUntilReview: 1, activityId: null });
    expect(closingOutcomeCopy(summary, 'completed', loc()).nextAction).toBe('learn.closingNextReviewInOneDay|{"concept":"concept.postflopBetting"}');
  });

  it('still reads a multi-day review with the plural template', () => {
    const inThreeDays = '2026-01-18T10:00:00.000Z'; // NOW + 3 days
    const summary = closeSummary({ decisionsScored: 1, costlyMistakes: 0 }, { reviewQueue: reviewItems(1, inThreeDays) });
    expect(summary.next).toEqual({ kind: 'review', daysUntilReview: 3, activityId: null });
    expect(closingOutcomeCopy(summary, 'completed', loc()).nextAction).toContain('learn.closingNextReviewIn');
  });
});
