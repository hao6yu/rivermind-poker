import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ModalBackdrop } from '../ModalBackdrop';
import { useLocalization } from '../../localization';
import { elevationForScheme } from '../../theme/designTokens';
import { RADIUS, SPACING } from '../../theme/designTokens';
import { type ThemePalette, useAppTheme } from '../../theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * The shared bottom sheet (S8/P18-047): the scrim, slide-up surface, safe-area
 * padding, close affordance, and reduced-motion behavior every modal shares.
 *
 * The sheet owns no chrome beyond the header row it renders from props —
 * screens keep composing their own content. `accessibilityCloseLabel`
 * defaults to the shared catalog close string. Stable test IDs:
 * `ui.sheet` (surface), `ui.sheet.close` (header close), `ui.sheet.scrim`.
 */
export function Sheet({
  children,
  onClose,
  testID = 'ui.sheet',
  closeAccessibilityLabel,
  showClose = true,
  title,
  eyebrow,
}: {
  children: React.ReactNode;
  onClose: () => void;
  testID?: string;
  closeAccessibilityLabel?: string;
  /** `false` when the sheet body provides its own exit affordance. */
  showClose?: boolean;
  /** Optional header title; the sheet renders a standard header when set. */
  title?: string;
  /** Optional small header eyebrow above the title. */
  eyebrow?: string;
}) {
  const { palette, scheme } = useAppTheme();
  const { t } = useLocalization();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(palette, scheme), [palette, scheme]);
  const closeLabel = closeAccessibilityLabel ?? t('common.close');

  return (
    <Modal
      animationType={reduceMotion ? 'none' : 'slide'}
      onRequestClose={onClose}
      transparent
      visible
    >
      <View style={styles.scrimRoot}>
        <Pressable
          accessibilityLabel={closeLabel}
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
          testID={`${testID}.scrim`}
        />
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.sm) }]}
          testID={testID}
        >
          {(title !== undefined || showClose) ? (
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
                {title !== undefined ? (
                  <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>
                    {title}
                  </Text>
                ) : null}
              </View>
              {showClose ? (
                <Pressable
                  accessibilityLabel={closeLabel}
                  accessibilityRole="button"
                  hitSlop={SPACING.sm}
                  onPress={onClose}
                  style={styles.closeButton}
                  testID={`${testID}.close`}
                >
                  <Ionicons color={palette.text} name="close" size={20} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

function createStyles(palette: ThemePalette, scheme: 'light' | 'dark') {
  const elevation = elevationForScheme(scheme, palette.shadow).level3;
  return StyleSheet.create({
    scrimRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: palette.scrim },
    sheet: {
      backgroundColor: palette.surface,
      borderTopLeftRadius: RADIUS.xl,
      borderTopRightRadius: RADIUS.xl,
      paddingTop: SPACING.md,
      paddingHorizontal: SPACING.lg,
      ...elevation,
    },
    header: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: SPACING.sm,
      marginBottom: SPACING.xs,
    },
    headerCopy: { flex: 1, minWidth: 0, gap: 2 },
    eyebrow: {
      color: palette.muted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    title: { color: palette.text, fontSize: 17, fontWeight: '800' },
    closeButton: {
      alignItems: 'center',
      backgroundColor: palette.soft,
      borderRadius: RADIUS.md,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
  });
}
