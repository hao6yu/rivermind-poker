import type { OpponentTableTendencies } from './opponentTableTendencies';
import {
  OPPONENT_TENDENCY_OPPORTUNITY_FLOOR,
  OPPONENT_TENDENCY_SAMPLE_FLOOR,
  opponentTendenciesAboveSampleFloor,
  opponentTendencyRate,
} from './opponentTableTendencies';
import type { TranslationValues } from '../../localization/core';
import type { MessageKey } from '../../localization/messages';

type Translator = (key: MessageKey, values?: TranslationValues) => string;

/**
 * P18-038 presentation — "this table" scope, sample floors, and rates that
 * never impersonate a persona description. A persona label says how an
 * opponent is BUILT; these numbers say what they DID at this table. The two
 * never render as one claim.
 */

export interface LocalizedOpponentTableTendencies {
  /** One formatted percent, or null while the rate is under its floor. */
  foldToThreeBetLabel: string | null;
  foldToThreeBetReady: boolean;
  handsObservedLabel: string;
  /** The metric rows in render order, each with its own remaining count. */
  rows: Array<{ label: string; ready: boolean; value: string }>;
  sectionVisible: boolean;
  showdownFrequencyLabel: string | null;
  showdownReady: boolean;
  /** The scope note: these numbers describe THIS table only. */
  scopeLabel: string;
  /** The below-floor note naming the sample still needed. */
  sampleNoteLabel: string | null;
}

export function localizeOpponentTableTendencies(
  tendencies: OpponentTableTendencies,
  t: Translator,
): LocalizedOpponentTableTendencies {
  const sectionVisible = opponentTendenciesAboveSampleFloor(tendencies);
  const foldRate = opponentTendencyRate(tendencies.foldsFacingThreeBet, tendencies.facedThreeBets);
  const showdownRate = opponentTendencyRate(tendencies.showdowns, tendencies.handsSeenFlop);
  const percent = (rate: number): string => `${Math.round(rate * 100)}%`;
  const foldReady = foldRate !== null;
  const showdownReady = showdownRate !== null;
  // Each below-floor row names its OWN remaining chances (finding 3).
  const rows = [
    {
      label: t('opponentTendencies.foldToThreeBet'),
      ready: foldReady,
      value: foldReady
        ? percent(foldRate!)
        : t('opponentTendencies.needsOpportunities', {
          remaining: Math.max(
            1,
            remainingChances(tendencies.facedThreeBets) || OPPONENT_TENDENCY_OPPORTUNITY_FLOOR,
          ),
        }),
    },
    {
      label: t('opponentTendencies.showdownFrequency'),
      ready: showdownReady,
      value: showdownReady
        ? percent(showdownRate!)
        : t('opponentTendencies.needsOpportunities', {
          remaining: Math.max(
            1,
            remainingChances(tendencies.handsSeenFlop) || OPPONENT_TENDENCY_OPPORTUNITY_FLOOR,
          ),
        }),
    },
  ];
  return {
    foldToThreeBetLabel: foldRate === null ? null : percent(foldRate),
    foldToThreeBetReady: foldReady,
    handsObservedLabel: t('opponentTendencies.handsObserved', { count: tendencies.handsObserved }),
    sectionVisible,
    rows,
    showdownFrequencyLabel: showdownRate === null ? null : percent(showdownRate),
    showdownReady,
    scopeLabel: t('opponentTendencies.scope'),
    sampleNoteLabel: sectionVisible
      ? null
      : t('opponentTendencies.sampleNote', {
        count: tendencies.handsObserved,
        remaining: OPPONENT_TENDENCY_SAMPLE_FLOOR - tendencies.handsObserved,
      }),
  };
}

/** The metric rows in render order, each with its floor-gated readiness. */
export function opponentTendencyRows(
  localized: LocalizedOpponentTableTendencies,
  t: Translator,
): Array<{ label: string; ready: boolean; value: string }> {
  return localized.rows;
}

/**
 * How many MORE chances one rate needs, always relative to its own current
 * opportunity count (review finding 3): a player with two faced 3-bets sees
 * "one more", not the bare threshold.
 */
function remainingChances(opportunities: number): number {
  return Math.max(0, OPPONENT_TENDENCY_OPPORTUNITY_FLOOR - opportunities);
}
