import { StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

import type { ThemePalette } from '../../theme';

/**
 * Phase 18.5 (S8/P18-048) — the shared table style kit.
 *
 * The three live-table surfaces (heads-up `PokerTableScreen`, local multiway
 * `MultiwayPokerTableScreen`, and the private table inside
 * `MultiplayerFlowModal`) render the same seat action bubbles, coach copy,
 * and identity pills. These builders own those definitions once; each
 * screen's `createStyles` spreads them in. Screen-specific geometry stays
 * local — only definitions that were previously byte-identical across files
 * move here, and `tableStyleDuplication.test.ts` fails when an identical
 * cross-table definition reappears.
 */

/** The seat action bubble tone treatments shared by all three tables. */
export interface SeatActionBubbleToneStyles {
  seatActionBubbleFold: ViewStyle;
  seatActionBubbleCheck: ViewStyle;
  seatActionBubbleCall: ViewStyle;
  seatActionBubbleAggressive: ViewStyle;
  seatActionBubbleAllIn: ViewStyle;
}

export function sharedSeatActionBubbleTones(palette: ThemePalette): SeatActionBubbleToneStyles {
  return {
    seatActionBubbleFold: { borderColor: palette.tableLine },
    seatActionBubbleCheck: { borderColor: palette.aqua },
    seatActionBubbleCall: { borderColor: palette.primary },
    seatActionBubbleAggressive: { borderColor: palette.primary, borderWidth: 2 },
    seatActionBubbleAllIn: { borderColor: palette.danger, borderWidth: 2, shadowColor: palette.danger, shadowOpacity: 0.3 },
  };
}

/** Measured bubble alignment/tail offsets shared by the multiway ring and the
 * private table (both place bubbles around the same measured seats). */
export interface SeatBubblePlacementStyles {
  seatActionBubbleAlignLeft: ViewStyle;
  seatActionBubbleAlignRight: ViewStyle;
  seatActionBubbleMeasuredBelow: ViewStyle;
  seatActionBubbleMeasuredAbove: ViewStyle;
  seatActionBubbleTailTopMeasured: ViewStyle;
  seatActionBubbleTailBottomMeasured: ViewStyle;
}

export function sharedSeatBubblePlacementStyles(): SeatBubblePlacementStyles {
  return {
    seatActionBubbleAlignLeft: { left: 0 },
    seatActionBubbleAlignRight: { right: 0 },
    seatActionBubbleMeasuredBelow: { marginTop: 6 },
    seatActionBubbleMeasuredAbove: { marginBottom: 6 },
    seatActionBubbleTailTopMeasured: { top: 2 },
    seatActionBubbleTailBottomMeasured: { bottom: 2 },
  };
}

export interface LocalTableCoachStyles {
  sessionCount: TextStyle;
  coachIconToggleActive: ViewStyle;
  tableBody: ViewStyle;
  tableControlRail: ViewStyle;
  tableControlRailLandscape: ViewStyle;
  tableControlRailMain: ViewStyle;
  coachCopy: ViewStyle;
  recommendationAction: TextStyle;
  recommendationBasis: TextStyle;
  coachFootnote: TextStyle;
  primarySheetButton: ViewStyle;
}

/**
 * The local-table coach/shell chrome shared by the heads-up and local
 * multiway tables (both take the same compact/tablet flags).
 */
export function sharedLocalTableCoachStyles(
  palette: ThemePalette,
  compact: boolean,
  tablet: boolean,
): LocalTableCoachStyles {
  return {
    sessionCount: { color: palette.text, fontSize: tablet ? 12 : 10, fontWeight: '700' },
    coachIconToggleActive: { borderColor: palette.primary, backgroundColor: palette.accentSoft },
    tableBody: { flex: 1, gap: compact ? 6 : 9 },
    tableControlRail: { width: '100%', flexDirection: 'row', alignItems: 'stretch', gap: 6 },
    tableControlRailLandscape: { flexDirection: 'column' },
    tableControlRailMain: { flex: 1, minWidth: 0 },
    coachCopy: { flex: 1, minWidth: 0 },
    recommendationAction: { color: palette.aquaText, fontSize: 20, fontWeight: '800' },
    recommendationBasis: { color: palette.aquaText, fontSize: 9, lineHeight: 13, fontWeight: '600', opacity: 0.78, marginTop: 2 },
    coachFootnote: { color: palette.muted, fontSize: 9, lineHeight: 13, textAlign: 'center', paddingHorizontal: 10 },
    primarySheetButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.primary },
  };
}

export interface ProfileIdentityStyles {
  profileIdentityRow: ViewStyle;
  profileIdentityPill: TextStyle;
}

/**
 * The tap-a-seat identity pill shared by the local multiway table and the
 * private table seat sheet.
 */
export function sharedProfileIdentityStyles(palette: ThemePalette): ProfileIdentityStyles {
  return {
    profileIdentityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 4 },
    profileIdentityPill: { color: palette.muted, fontSize: 11, fontWeight: '900', letterSpacing: 0.5, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: palette.soft, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
  };
}
