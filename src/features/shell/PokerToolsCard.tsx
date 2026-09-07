import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ReferenceModal } from '../learn/ReferenceModal';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import { TYPOGRAPHY } from '../../theme/designTokens';
import type { CheatSheetDefinition } from '../../domain/learning/types';
import type { BeginnerTutorialEntryStatus } from '../../services/beginnerTutorial';
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
export interface PokerToolsCardProps {
  /** Drives the beginner row's label: start, resume, or replay. */
  beginnerTutorialStatus?: BeginnerTutorialEntryStatus;
  onOpenBeginnerTutorial?: () => void;
}

export function PokerToolsCard({
  beginnerTutorialStatus,
  onOpenBeginnerTutorial,
}: PokerToolsCardProps = {}) {
  const { palette } = useAppTheme();
  const { activityText, t } = useLocalization();
  const [expanded, setExpanded] = useState(false);
  const [activeSheet, setActiveSheet] = useState<CheatSheetDefinition | null>(null);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const toolIds = homePokerToolIds(expanded);

  const openSheet = (id: HomePokerToolId) => setActiveSheet(homePokerToolSheet(id));

  const beginnerCopy = beginnerTutorialStatus === 'in-progress'
    ? { label: t('tutorial.entry.resumeLabel'), description: t('tutorial.entry.resumeDescription'), testID: 'home.tutorial.resume' }
    : beginnerTutorialStatus === 'completed'
      ? { label: t('tutorial.entry.replayLabel'), description: t('tutorial.entry.replayDescription'), testID: 'home.tutorial.replay' }
      : { label: t('tutorial.entry.pokerBasics'), description: t('tutorial.entry.description'), testID: 'home.tutorial.start' };

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
        <View style={styles.headerLabel}>
          <Ionicons accessible={false} color={palette.primary} name="construct-outline" size={16} />
          <Text maxFontSizeMultiplier={1.4} style={styles.title}>{t('home.pokerTools')}</Text>
        </View>
        <View style={styles.headerToggle}>
          <Ionicons accessible={false} color={palette.muted} name={expanded ? 'chevron-up' : 'chevron-down'} size={16} />
        </View>
      </Pressable>

      <View accessibilityLabel={t('home.pokerTools')} style={styles.list}>
        {onOpenBeginnerTutorial ? (
          <Pressable
            accessibilityHint={t('tutorial.entry.description')}
            accessibilityLabel={beginnerCopy.label}
            accessibilityRole="button"
            onPress={onOpenBeginnerTutorial}
            style={({ pressed }) => [styles.toolRow, styles.toolRowBorder, styles.beginnerRow, pressed && styles.pressed]}
            testID={beginnerCopy.testID}
          >
            <View style={styles.beginnerIcon}>
              <Ionicons color={palette.primaryText} name="school-outline" size={16} />
            </View>
            <View style={styles.toolCopy}>
              <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.beginnerTitle}>{beginnerCopy.label}</Text>
              <Text numberOfLines={2} style={styles.toolDescription}>{beginnerCopy.description}</Text>
            </View>
            <Ionicons color={palette.muted} name="chevron-forward" size={16} />
          </Pressable>
        ) : null}
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
    card: { borderRadius: 16, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, marginTop: 16 },
    header: { minHeight: 44, marginTop: -24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12 },
    headerLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, backgroundColor: palette.surface, borderRadius: 8, paddingHorizontal: 8 },
    headerToggle: { backgroundColor: palette.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    title: { flexShrink: 1, color: palette.muted, ...TYPOGRAPHY.body, fontWeight: '800' },
    list: { paddingHorizontal: 12, paddingBottom: 12 },
    toolRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 6, paddingVertical: 9 },
    toolRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
    beginnerRow: { borderTopWidth: 0, minHeight: 56 },
    beginnerIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: palette.primary },
    beginnerTitle: { color: palette.text, fontSize: 13, lineHeight: 18, fontWeight: '800' },
    toolIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: palette.aquaSoft },
    toolCopy: { flex: 1, gap: 1 },
    toolTitle: { color: palette.text, fontSize: 13, lineHeight: 18, fontWeight: '700' },
    toolDescription: { color: palette.muted, fontSize: 11, lineHeight: 15 },
    pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  });
}
