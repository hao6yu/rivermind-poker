import { describe, expect, it } from 'vitest';

import {
  buildPlayStatistics,
  PLAY_SPOT_SAMPLE_FLOOR,
  type PlayHandRecord,
} from '../../domain/stats/playStatistics';
import { describeSpotProgress } from './spotProgressPresentation';

const t = (key: string, params?: Record<string, string | number>) => {
  const templates: Record<string, string> = {
    'stats.spots.bb100': 'About {{value}} big blinds per 100 hands',
    'stats.spots.belowFloor': 'Needs {{floor}} hands at this spot before a per-100-hand reading is shown',
    'stats.spots.chips': '{{chips}} chips',
    'stats.spots.emptyNote': 'Finish a few hands and your spots will start appearing here.',
    'stats.spots.family.facing-open': 'facing an open',
    'stats.spots.hands': '{{count}} hands seen',
    'stats.spots.partialNote': 'Some counted hands predate spot tracking and appear in the totals only.',
    'stats.spots.playMoney': 'Play-money chips only.',
    'stats.spots.playMoneyNote': 'Normalized as big blinds per 100 hands. Play-money chips only.',
    'stats.spots.spotLabel': '{{position}} · {{street}} · {{family}}',
    'stats.spots.title': 'Progress by spot',
  };
  let out = templates[key] ?? key;
  for (const [name, value] of Object.entries(params ?? {})) {
    out = out.replaceAll(`{{${name}}}`, String(value));
  }
  return out;
};

function record(
  handId: string,
  spot: { netChips: number; family?: 'big-pot' | 'facing-open' } | null,
): PlayHandRecord {
  return {
    completed: true,
    handId,
    result: 'won',
    source: 'local',
    tableId: 'session',
    ...(spot ? {
      spot: {
        bigBlind: 20,
        family: spot.family ?? 'facing-open',
        netChips: spot.netChips,
        position: 'late' as const,
        street: 'preflop' as const,
      },
    } : {}),
  };
}

describe('spot progress presentation (P18-037, D05)', () => {
  it('shows the empty state before any hands exist', () => {
    const panel = describeSpotProgress(buildPlayStatistics([], { local: 'complete' }), t);
    expect(panel.isEmpty).toBe(true);
    expect(panel.rows).toHaveLength(0);
    expect(panel.notes[0]).toContain('Finish a few hands');
  });

  it('never shows a rate below the sample floor — sample progress only', () => {
    const statistics = buildPlayStatistics(
      Array.from({ length: PLAY_SPOT_SAMPLE_FLOOR - 1 }, (_, index) => record(`h:${index}`, { netChips: 10 })),
      { local: 'complete' },
    );
    const [row] = describeSpotProgress(statistics, t).rows;
    expect(row!.rate).toContain(`Needs ${PLAY_SPOT_SAMPLE_FLOOR} hands`);
    expect(row!.rate).not.toContain('big blinds per 100');
    // Chips alongside, play-money wording attached to the spoken row.
    expect(row!.chipsLabel).toContain('chips');
    expect(row!.accessibilityLabel).toContain('Play-money chips only.');
  });

  it('shows BB/100 with chips alongside once the floor is reached', () => {
    const statistics = buildPlayStatistics(
      Array.from({ length: PLAY_SPOT_SAMPLE_FLOOR }, (_, index) => record(`h:${index}`, { netChips: 20 })),
      { local: 'complete' },
    );
    const [row] = describeSpotProgress(statistics, t).rows;
    // 20 chips at BB 20 = 1 BB per hand = 100 BB/100.
    expect(row!.rate).toBe('About 100.0 big blinds per 100 hands');
  });

  it('reports partial spot coverage when legacy hands lack spot facts', () => {
    const statistics = buildPlayStatistics(
      [...Array.from({ length: 5 }, (_, index) => record(`h:${index}`, { netChips: 10 })), record('legacy:hand:1', null)],
      { local: 'complete' },
    );
    const panel = describeSpotProgress(statistics, t);
    expect(panel.isPartial).toBe(true);
    expect(panel.notes.some((note) => note.includes('predate spot tracking'))).toBe(true);
  });

  it('marks full coverage when every counted hand carried a spot', () => {
    const statistics = buildPlayStatistics(
      Array.from({ length: 3 }, (_, index) => record(`h:${index}`, { netChips: 10 })),
      { local: 'complete' },
    );
    expect(describeSpotProgress(statistics, t).isPartial).toBe(false);
  });

  it('orders rows by hands seen and bounds the visible list', () => {
    const hands = [
      ...Array.from({ length: 9 }, (_, index) => record(`big:${index}`, { netChips: 5 })),
      ...Array.from({ length: 3 }, (_, index) => record(`small:${index}`, { netChips: 5, family: 'big-pot' })),
    ];
    const statistics = buildPlayStatistics(hands, { local: 'complete' });
    const rows = describeSpotProgress(statistics, t).rows;
    expect(rows[0]!.handsLabel).toContain('9');
  });
});
