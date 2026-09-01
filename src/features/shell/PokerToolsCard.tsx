import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ReferenceModal } from '../learn/ReferenceModal';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import type { CheatSheetDefinition } from '../../domain/learning/types';
import {
  homePokerToolIds,
  homePokerToolSheet,
  type HomePokerToolId,
} from './homePokerTools';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Icon assigned to each Home Poker tool, keyed by sheet id. */
const HOME_POKER_TOOL_ICONS: Record<string, IconName> = {
  'sheet-hand-rankings': 'albums-outline',
  'sheet-preflop': 'compass-outline',
  'sheet-percentages': 'pie-chart-outline',
  'sheet-advanced-math': 'calculator-outline',
};

/**
 * The compact collapsible **Poker tools** card (DT-10). It replaces the Home
 * two-step cheat-sheet route: collapsed it shows Hand rankings and the Preflop
 * range explorer; expanding adds Common percentages and Advanced decision math.
 * Every item opens the exact existing Learn reference sheet in one tap and
 * returns to Home, and Learn's own catalog continues to work unchanged. All
 * content and state come from the shared authored reference collection and the
 * existing ReferenceModal — nothing is cloned.
 */
export function PokerToolsCard() {
  const { palette } = useAppTheme();
  const { activityText, t } = useLocalization();
  const [expanded, setExpanded] = useState(false);
  const [activeSheet, setActiveSheet] = useState<CheatSheetDefinition | null>(null);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const toolIds = homePokerToolIds(expanded);

  const openSheet = (id: HomePokerToolId) => setActiveSheet(homePokerToolSheet(id));

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityHint={expanded ? t('home.pokerToolsCollapseA11y') : t('home.pokerToolsExpandA11y')}
        accessibilityLabel={t('home.pokerTools')}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <View style={styles.headerIcon}>
          <Ionicons color={palette.primary} name="construct-outline" size={19} />
        </View>
        <View style={styles.headerCopy}>
          <Text maxFontSizeMultiplier={1.4} style={styles.title}>{t('home.pokerTools')}</Text>
          <Text numberOfLines={2} style={styles.description}>{t('home.pokerToolsDescription')}</Text>
        </View>
        <Ionicons color={palette.muted} name={expanded ? 'chevron-up' : 'chevron-down'} size={19} />
      </Pressable>

      <View accessibilityLabel={t('home.pokerTools')} style={styles.list}>
        {toolIds.map((id, index) => {
          const sheet = homePokerToolSheet(id);
          return (
            <Pressable
              accessibilityHint={t('learn.quickReference')}
              accessibilityLabel={activityText(sheet, 'title')}
              accessibilityRole="button"
              key={id}
              onPress={() => openSheet(id)}
              style={({ pressed }) => [
                styles.toolRow,
                index > 0 && styles.toolRowBorder,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.toolIcon}>
                <Ionicons color={palette.aqua} name={HOME_POKER_TOOL_ICONS[id] ?? 'albums-outline'} size={16} />
              </View>
              <View style={styles.toolCopy}>
                <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.toolTitle}>{activityText(sheet, 'title')}</Text>
                <Text numberOfLines={2} style={styles.toolDescription}>{activityText(sheet, 'description')}</Text>
              </View>
              <Ionicons color={palette.muted} name="chevron-forward" size={16} />
            </Pressable>
          );
        })}
      </View>

      <ReferenceModal onClose={() => setActiveSheet(null)} sheet={activeSheet} />
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    card: { borderRadius: 17, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, overflow: 'hidden' },
    header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
    headerIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.soft },
    headerCopy: { flex: 1, gap: 2 },
    title: { color: palette.text, fontSize: 15, lineHeight: 20, fontWeight: '800' },
    description: { color: palette.muted, fontSize: 12, lineHeight: 16 },
    list: { paddingHorizontal: 11, paddingBottom: 11 },
    toolRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 6, paddingVertical: 9 },
    toolRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
    toolIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: palette.aquaSoft },
    toolCopy: { flex: 1, gap: 1 },
    toolTitle: { color: palette.text, fontSize: 13, lineHeight: 18, fontWeight: '700' },
    toolDescription: { color: palette.muted, fontSize: 11, lineHeight: 15 },
    pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  });
}
