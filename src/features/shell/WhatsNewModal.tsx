import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useLocalization } from '../../localization';
import { RELEASE_NOTICE_ID } from '../../services/releaseNotice';
import { type ThemePalette, useAppTheme } from '../../theme';
import { CONTROL_HEIGHT, RADIUS, SPACING, TYPOGRAPHY } from '../../theme/designTokens';
import { ModalSafeArea } from '../learn/ModalSafeArea';

export function WhatsNewModal({ onClose, visible }: { onClose: () => void; visible: boolean }) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Modal animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={onClose} visible={visible}>
      <ModalSafeArea>
        <View accessibilityViewIsModal style={styles.screen} testID="releaseNotice">
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.eyebrow}>RiverMind Poker</Text>
            <Text accessibilityRole="header" style={styles.title}>
              {t('releaseNotice.title', { version: RELEASE_NOTICE_ID })}
            </Text>
            <View style={styles.reset}>
              <Text accessibilityRole="header" style={styles.heading}>{t('releaseNotice.resetTitle')}</Text>
              <Text style={styles.body}>{t('releaseNotice.resetBody')}</Text>
              <Text style={styles.body}>{t('releaseNotice.keptBody')}</Text>
            </View>
            {(['tutorial', 'opponents', 'tables'] as const).map((item) => (
              <View key={item} style={styles.feature}>
                <Text accessibilityRole="header" style={styles.heading}>{t(`releaseNotice.${item}Title`)}</Text>
                <Text style={styles.body}>{t(`releaseNotice.${item}Body`)}</Text>
              </View>
            ))}
            <Text style={styles.note}>{t('releaseNotice.reopen')}</Text>
          </ScrollView>
          <View style={styles.footer}>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.button} testID="releaseNotice.dismiss">
              <Text style={styles.buttonText}>{t('releaseNotice.dismiss')}</Text>
            </Pressable>
          </View>
        </View>
      </ModalSafeArea>
    </Modal>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    screen: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center' },
    content: { padding: SPACING.xxl, gap: SPACING.xl },
    eyebrow: { ...TYPOGRAPHY.eyebrow, color: palette.primary, fontWeight: '700' },
    title: { ...TYPOGRAPHY.pageTitle, color: palette.text, fontWeight: '800' },
    reset: { padding: SPACING.lg, borderRadius: RADIUS.lg, backgroundColor: palette.accentSoft, gap: SPACING.md },
    feature: { gap: SPACING.sm },
    heading: { ...TYPOGRAPHY.sectionTitle, color: palette.text, fontWeight: '700' },
    body: { ...TYPOGRAPHY.bodyLarge, color: palette.text },
    note: { ...TYPOGRAPHY.body, color: palette.muted },
    footer: { padding: SPACING.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
    button: { minHeight: CONTROL_HEIGHT.primary, padding: SPACING.md, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.primary },
    buttonText: { ...TYPOGRAPHY.bodyLarge, color: palette.primaryText, fontWeight: '700' },
  });
}
