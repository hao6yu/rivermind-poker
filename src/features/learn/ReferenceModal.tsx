import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SuitAwareText } from '../../components/SuitAwareText';
import type { CheatSheetDefinition } from '../../domain/learning/types';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import { ModalSafeArea } from './ModalSafeArea';
import { PreflopRangeExplorer } from './PreflopRangeExplorer';

export function ReferenceModal({
  onClose,
  sheet,
}: {
  onClose: () => void;
  sheet: CheatSheetDefinition | null;
}) {
  const { palette } = useAppTheme();
  const { cheatSheetContent, t } = useLocalization();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const displayedSheet = useMemo(() => sheet ? cheatSheetContent(sheet) : null, [cheatSheetContent, sheet]);

  return (
    <Modal animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} presentationStyle="fullScreen" visible={Boolean(sheet)}>
      <ModalSafeArea>
        {sheet && displayedSheet && (
          <View style={styles.screen}>
            <View style={styles.header}>
              <Pressable
                accessibilityHint={t('learn.backHint')}
                accessibilityLabel={t('learn.backToLearn')}
                accessibilityRole="button"
                hitSlop={12}
                onPress={onClose}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                <Ionicons color={palette.text} name="arrow-back" size={21} />
              </Pressable>
              <View style={styles.headerCopy}>
                <Text maxFontSizeMultiplier={1.5} style={styles.eyebrow}>{t('learn.quickReference')}</Text>
                <Text numberOfLines={2} style={styles.title}>{displayedSheet.title}</Text>
              </View>
              <View style={styles.headerSpacer} />
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              {displayedSheet.id !== 'sheet-hand-rankings' ? <Text style={styles.description}>{displayedSheet.description}</Text> : null}
              {displayedSheet.id === 'sheet-preflop' ? <PreflopRangeExplorer /> : null}
              {displayedSheet.groups.map((group) => (
                <View key={group.title} style={styles.group}>
                  <Text style={styles.groupTitle}>{group.title}</Text>
                  {group.rows.map((row, index) => (
                    <View key={`${group.title}-${row.label}`} style={[styles.row, index > 0 && styles.rowBorder]}>
                      <View style={styles.rowHeading}>
                        <Text style={styles.label}>{row.label}</Text>
                        {row.probability ? <Text style={styles.probability}>{row.probability}</Text> : null}
                      </View>
                      <Text style={styles.detail}>{row.detail}</Text>
                      {row.example ? (
                        <View style={styles.examplePill}>
                          <Text style={styles.exampleLabel}>{t('learn.example')}</Text>
                          <SuitAwareText style={styles.exampleCards} text={row.example} />
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              ))}
              {displayedSheet.note && (
                <View style={styles.note}>
                  <Ionicons color={palette.aqua} name="information-circle-outline" size={19} />
                  <Text style={styles.noteText}>{displayedSheet.note}</Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.footer}>
              <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                <Text maxFontSizeMultiplier={1.4} numberOfLines={2} style={styles.primaryButtonText}>{t('common.done')}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ModalSafeArea>
    </Modal>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    screen: { flex: 1 },
    header: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border, backgroundColor: palette.surface },
    iconButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.soft },
    headerCopy: { flex: 1, minWidth: 0, alignItems: 'center' },
    headerSpacer: { width: 44 },
    eyebrow: { color: palette.primary, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 16, lineHeight: 20, fontWeight: '700', textAlign: 'center', marginTop: 3 },
    content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 18, paddingBottom: 30, gap: 14 },
    description: { color: palette.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
    group: { paddingHorizontal: 15, borderRadius: 18, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    groupTitle: { color: palette.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', paddingTop: 15, paddingBottom: 7 },
    row: { paddingVertical: 13, gap: 5 },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
    rowHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    label: { flex: 1, minWidth: 0, color: palette.text, fontSize: 14.5, lineHeight: 19, fontWeight: '700' },
    probability: { color: palette.aquaText, fontSize: 10, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: palette.aquaSoft, overflow: 'hidden' },
    detail: { color: palette.muted, fontSize: 13, lineHeight: 19 },
    examplePill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 5, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10, backgroundColor: palette.soft },
    exampleLabel: { color: palette.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.6 },
    exampleCards: { color: palette.text, fontSize: 12, fontWeight: '800' },
    note: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 14, borderRadius: 15, backgroundColor: palette.aquaSoft },
    noteText: { flex: 1, color: palette.aquaText, fontSize: 12.5, lineHeight: 19 },
    footer: { padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, backgroundColor: palette.surface },
    primaryButton: { width: '100%', maxWidth: 720, alignSelf: 'center', minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.primary },
    primaryButtonText: { color: palette.primaryText, fontSize: 14, fontWeight: '700' },
    pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  });
}
