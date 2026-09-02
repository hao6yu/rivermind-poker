import { formatChips } from '../../domain/poker/moneyFormat';
import {
  parsePlaySpotKey,
  playSpotBigBlindsPer100,
  playStatisticsIsEmpty,
  PLAY_SPOT_SAMPLE_FLOOR,
  type PlayStatistics,
} from '../../domain/stats/playStatistics';
import type { MessageKey } from '../../localization';

/**
 * Copy rules for the spot-level Progress rows (Phase 18 S6 / P18-037),
 * separated from the component so every truthfulness rule is testable
 * without a render.
 *
 * D05 rules encoded here:
 * - the normalized unit is big blinds per 100 hands, computed against each
 *   hand's own big blind, with the chip result alongside and explicit
 *   play-money wording;
 * - a spot below the 30-hand sample floor shows sample progress only — never
 *   a rate that could be read as a judgment;
 * - a window comparison exists only when both named windows independently
 *   clear the floor, and it is phrased as two window facts, never as an
 *   "improving"/"declining" verdict;
 * - no figure implies real money or statistical certainty.
 */

export type Translate = (key: MessageKey, params?: Record<string, string | number>) => string;

export interface SpotProgressRow {
  handsLabel: string;
  /** BB/100 over the whole window, or null below the sample floor. */
  rate: string | null;
  accessibilityLabel: string;
  /** The chips result alongside the normalized unit (play money). */
  chipsLabel: string;
  id: string;
  label: string;
}

export interface SpotProgressPanel {
  isEmpty: boolean;
  /** True when counted hands exist but none carried spot facts (legacy data). */
  isPartial: boolean;
  notes: string[];
  rows: SpotProgressRow[];
  titleKey: MessageKey;
}

/** How many spots are shown: the most-played rows first, bounded for focus. */
export const SPOT_PROGRESS_ROW_LIMIT = 4;

export function describeSpotProgress(
  statistics: PlayStatistics | null,
  t: Translate,
): SpotProgressPanel {
  if (statistics === null || playStatisticsIsEmpty(statistics)) {
    return {
      isEmpty: true,
      isPartial: false,
      notes: [t('stats.spots.emptyNote')],
      rows: [],
      titleKey: 'stats.spots.title',
    };
  }

  const rows = Object.entries(statistics.spots)
    .map(([key, aggregate]) => {
      const parsed = parsePlaySpotKey(key);
      if (!parsed) return null;
      const rate = playSpotBigBlindsPer100(aggregate);
      const label = t('stats.spots.spotLabel', {
        family: t(`stats.spots.family.${parsed.family}` as MessageKey),
        position: t(`stats.spots.position.${parsed.position}` as MessageKey),
        street: t(`stats.spots.street.${parsed.street}` as MessageKey),
      });
      // P18-008 family: the count label conjugates for one hand.
      const handsLabel = aggregate.hands === 1
        ? t('stats.spots.handsOne')
        : t('stats.spots.hands', { count: aggregate.hands });
      const rateLabel = rate === null
        ? t('stats.spots.belowFloor', { floor: PLAY_SPOT_SAMPLE_FLOOR })
        : t('stats.spots.bb100', { value: rate.toFixed(1) });
      const chipsLabel = t('stats.spots.chips', { chips: formatChips(aggregate.netChips) });
      const row: SpotProgressRow = {
        accessibilityLabel: `${label}. ${handsLabel}. ${rateLabel}. ${chipsLabel}. ${t('stats.spots.playMoney')}`,
        chipsLabel,
        handsLabel,
        id: key,
        label,
        rate: rateLabel,
      };
      return row;
    })
    .filter((row): row is SpotProgressRow => row !== null)
    .sort((left, right) => {
      const leftHands = statistics.spots[left.id]?.hands ?? 0;
      const rightHands = statistics.spots[right.id]?.hands ?? 0;
      return rightHands - leftHands || left.id.localeCompare(right.id);
    })
    .slice(0, SPOT_PROGRESS_ROW_LIMIT);

  const spotHands = Object.values(statistics.spots).reduce((total, aggregate) => total + aggregate.hands, 0);
  const isPartial = spotHands < statistics.hands;

  return {
    isEmpty: false,
    isPartial,
    notes: [
      t('stats.spots.playMoneyNote'),
      ...(isPartial ? [t('stats.spots.partialNote')] : []),
    ],
    rows,
    titleKey: 'stats.spots.title',
  };
}
