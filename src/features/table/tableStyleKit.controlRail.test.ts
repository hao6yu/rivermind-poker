import { describe, expect, it, vi } from 'vitest';

import type { ThemePalette } from '../../theme';
import { CONTROL_HEIGHT } from '../../theme/designTokens';
import { sharedLocalTableCoachStyles } from './tableStyleKit';

// The kit imports StyleSheet from react-native; the contract test only needs
// the plain-object passthrough, not the native package.
vi.mock('react-native', () => ({
  StyleSheet: { create: <T,>(value: T): T => value },
}));

const PALETTE = {
  accentSoft: '#eef', aqua: '#3aa', aquaSoft: '#cde', background: '#101418',
  border: '#2a2f3a', muted: '#8a90a0', primary: '#4c7dff', primaryText: '#fff',
  soft: '#1a1f29', surface: '#161b24', text: '#f2f4f8',
} as unknown as ThemePalette;

/**
 * P1 (v1.3.1 regression contract): the tournament HUD stacks in a column
 * wrapper (`tableControlStack`) ABOVE the row-style control rail. Shipping the
 * HUD as the first child of the `flexDirection: 'row'` rail let its
 * `width: '100%'` host (Yoga default `flexShrink: 0`) starve the `flex: 1`
 * action rail to zero width, hiding fold/call/raise on every portrait
 * tournament table in the v1.3 TestFlight build. These pins keep the three
 * boxes honest: stack = column band, rail = [actions | feed] row, landscape
 * override = column.
 */
describe('shared local-table control rail geometry (v1.3.1 regression contract)', () => {
  const styles = sharedLocalTableCoachStyles(PALETTE, false, false);

  it('wraps the HUD in a full-width, non-shrinking column band', () => {
    expect(styles.tableControlStack.width).toBe('100%');
    expect(styles.tableControlStack.flexShrink).toBe(0);
    expect(styles.tableControlStack.flexDirection).not.toBe('row');
  });

  it('keeps the control rail the [actions | feed] row', () => {
    expect(styles.tableControlRail.flexDirection).toBe('row');
    expect(styles.tableControlRail.width).toBe('100%');
  });

  it('gives the action rail a growing, floored main column', () => {
    expect(styles.tableControlRailMain.flex).toBe(1);
    expect(styles.tableControlRailMain.minWidth).toBe(0);
    expect(styles.tableControlRailMain.minHeight).toBe(CONTROL_HEIGHT.primary);
  });

  it('stacks HUD above actions in the landscape rail column', () => {
    expect(styles.tableControlRailLandscape.flexDirection).toBe('column');
  });
});
