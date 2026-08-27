import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../../theme';
import { useLocalization } from '../../localization';

interface JourneyBannerProps {
  /** The concept label, e.g. "Postflop Betting". */
  eyebrow: string;
  /** The compact progress, e.g. "Step 2 of 3 steps". */
  progress: string;
  /** End the session early from within the modal. */
  onEndEarly: () => void;
}

/**
 * A compact progress banner that rides the top of a full-screen modal so the
 * journey's concept, "step X of Y" progress, and an end-early control are visible
 * during a step — the modals cover the controller's own header, so the journey
 * progress must live inside the modal to reach the learner.
 */
export function JourneyBanner({ eyebrow, progress, onEndEarly }: JourneyBannerProps): React.ReactElement {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <View style={styles.banner}>
      <View style={styles.info}>
        <Text style={[styles.eyebrow, { color: palette.primary }]}>{eyebrow}</Text>
        <Text style={[styles.progress, { color: palette.muted }]}>{progress}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityHint={t('learn.endSessionEarlyHint')}
        onPress={onEndEarly}
        style={[styles.endButton, { borderColor: palette.border }]}
      >
        <Text style={[styles.endButtonLabel, { color: palette.muted }]}>{t('learn.endSessionEarly')}</Text>
      </Pressable>
    </View>
  );
}

function createStyles(palette: ReturnType<typeof useAppTheme>['palette']) {
  return StyleSheet.create({
    banner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8, backgroundColor: palette.soft, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
    info: { gap: 1, flexShrink: 1, minWidth: 0 },
    eyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
    progress: { fontSize: 10, fontWeight: '700' },
    endButton: { minHeight: 28, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, justifyContent: 'center' },
    endButtonLabel: { fontSize: 11, fontWeight: '700' },
  });
}
