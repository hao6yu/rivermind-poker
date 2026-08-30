import { describe, expect, it } from 'vitest';

import { TABLE_MOMENT_REACTION_IDS, TABLE_MOMENT_VISIBLE_REACTION_IDS } from '../../domain/multiplayer/tableMoments';
import { tableMomentMenuLayout } from './tableMomentTrayLayout';

describe('table moment menu layout (3.11E)', () => {
  it('uses one text column in portrait and fits the narrowest viewport', () => {
    expect(tableMomentMenuLayout(320, 568)).toEqual({ columns: 1, rowHeight: 44, width: 260 });
  });

  it('splits to two columns on short landscape surfaces with 44-point rows', () => {
    const layout = tableMomentMenuLayout(568, 320);
    expect(layout.columns).toBe(2);
    expect(layout.rowHeight).toBeGreaterThanOrEqual(44);
    // Eight rows in two columns fill four rows of the anchored menu.
    expect(TABLE_MOMENT_VISIBLE_REACTION_IDS.length / layout.columns).toBe(4);
  });

  it('never exposes more than the eight approved phrases while all twelve protocol ids exist', () => {
    expect(TABLE_MOMENT_VISIBLE_REACTION_IDS).toHaveLength(8);
    for (const reactionId of TABLE_MOMENT_VISIBLE_REACTION_IDS) {
      expect(TABLE_MOMENT_REACTION_IDS).toContain(reactionId);
    }
    // The four protocol-only ids stay renderable for mixed-version rooms.
    const visible = new Set<string>(TABLE_MOMENT_VISIBLE_REACTION_IDS);
    expect(TABLE_MOMENT_REACTION_IDS.filter((id) => !visible.has(id))).toEqual([
      'thinking', 'disappointed', 'goodLuck', 'bigMove',
    ]);
  });
});
