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
  return {
    foldToThreeBetLabel: foldRate === null ? null : percent(foldRate),
    foldToThreeBetReady: foldRate !== null,
    handsObservedLabel: t('opponentTendencies.handsObserved', { count: tendencies.handsObserved }),
    sectionVisible,
    showdownFrequencyLabel: showdownRate === null ? null : percent(showdownRate),
    showdownReady: showdownRate !== null,
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
  const foldFloorNote = t('opponentTendencies.needsOpportunities', {
    count: OPPONENT_TENDENCY_OPPORTUNITY_FLOOR,
  });
  const showdownFloorNote = t('opponentTendencies.needsOpportunities', {
    count: OPPONENT_TENDENCY_OPPORTUNITY_FLOOR,
  });
  return [
    {
      label: t('opponentTendencies.foldToThreeBet'),
      ready: localized.foldToThreeBetReady,
      value: localized.foldToThreeBetLabel ?? foldFloorNote,
    },
    {
      label: t('opponentTendencies.showdownFrequency'),
      ready: localized.showdownReady,
      value: localized.showdownFrequencyLabel ?? showdownFloorNote,
    },
  ];
}
