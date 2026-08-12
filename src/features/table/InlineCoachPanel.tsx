import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocalization } from '../../localization/LocalizationProvider';
import { type ThemePalette, useAppTheme } from '../../theme';

export interface InlineCoachMetric {
  label: string;
  value: string;
}

interface InlineCoachPanelProps {
  alternativeHeadline?: string;
  detail: string;
  headline: string;
  metrics: readonly InlineCoachMetric[];
  onPress: () => void;
}

export function InlineCoachPanel({
  alternativeHeadline,
  detail,
  headline,
  metrics,
  onPress,
}: InlineCoachPanelProps) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <Pressable
      accessibilityLabel={`${t('multiway.coach.title')}. ${headline}. ${detail}. ${t('common.details')}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.panel, pressed && styles.panelPressed]}
    >
      <View style={styles.header}>
        <View style={styles.icon}>
          <Ionicons color={palette.aqua} name="sparkles-outline" size={20} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{t('multiway.coach.publicOnly')}</Text>
          <Text numberOfLines={1} style={styles.headline}>{headline}</Text>
        </View>
        <View style={styles.detailsHint}>
          <Text style={styles.detailsText}>{t('common.details')}</Text>
          <Ionicons color={palette.primary} name="chevron-forward" size={17} />
        </View>
      </View>

      <Text numberOfLines={2} style={styles.detail}>{detail}</Text>

      <View style={styles.footer}>
        <View style={styles.metrics}>
          {metrics.map((metric) => (
            <View key={metric.label} style={styles.metric}>
              <Text numberOfLines={1} style={styles.metricValue}>{metric.value}</Text>
              <Text numberOfLines={1} style={styles.metricLabel}>{metric.label}</Text>
            </View>
          ))}
        </View>
        {alternativeHeadline ? (
          <View style={styles.alternative}>
            <Text style={styles.alternativeLabel}>{t('table.insight.compare')}</Text>
            <Text numberOfLines={1} style={styles.alternativeValue}>{alternativeHeadline}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    panel: { minHeight: 142, gap: 9, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 18, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 2 },
    panelPressed: { opacity: 0.92 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    icon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.aquaSoft },
    headerCopy: { flex: 1, minWidth: 0, gap: 2 },
    eyebrow: { color: palette.aquaText, fontSize: 8.5, lineHeight: 11, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
    headline: { color: palette.text, fontSize: 17, lineHeight: 21, fontWeight: '800' },
    detailsHint: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 8 },
    detailsText: { color: palette.primary, fontSize: 10, lineHeight: 13, fontWeight: '800' },
    detail: { color: palette.muted, fontSize: 10.5, lineHeight: 15 },
    footer: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
    metrics: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 6 },
    metric: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 1, paddingHorizontal: 8, paddingVertical: 7, borderRadius: 10, backgroundColor: palette.soft },
    metricValue: { color: palette.text, fontSize: 12.5, lineHeight: 15, fontWeight: '800' },
    metricLabel: { color: palette.muted, fontSize: 7.5, lineHeight: 10, fontWeight: '600' },
    alternative: { width: '28%', minWidth: 150, justifyContent: 'center', gap: 2, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: palette.accentSoft },
    alternativeLabel: { color: palette.muted, fontSize: 7.5, lineHeight: 10, fontWeight: '700' },
    alternativeValue: { color: palette.primary, fontSize: 11, lineHeight: 14, fontWeight: '800' },
  });
}
