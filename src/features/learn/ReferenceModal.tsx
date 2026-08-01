import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CheatSheetDefinition } from '../../domain/learning/types';
import { type ThemePalette, useAppTheme } from '../../theme';

export function ReferenceModal({
  onClose,
  sheet,
}: {
  onClose: () => void;
  sheet: CheatSheetDefinition | null;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={Boolean(sheet)}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        {sheet && (
          <View style={styles.screen}>
            <View style={styles.header}>
              <Pressable accessibilityLabel="Close cheat sheet" accessibilityRole="button" onPress={onClose} style={styles.iconButton}>
                <Ionicons color={palette.text} name="close" size={21} />
              </Pressable>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>Quick reference</Text>
                <Text style={styles.title}>{sheet.title}</Text>
              </View>
              <View style={styles.headerSpacer} />
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <Text style={styles.description}>{sheet.description}</Text>
              {sheet.groups.map((group) => (
                <View key={group.title} style={styles.group}>
                  <Text style={styles.groupTitle}>{group.title}</Text>
                  {group.rows.map((row, index) => (
                    <View key={`${group.title}-${row.label}`} style={[styles.row, index > 0 && styles.rowBorder]}>
                      <Text style={styles.label}>{row.label}</Text>
                      <Text style={styles.detail}>{row.detail}</Text>
                    </View>
                  ))}
                </View>
              ))}
              {sheet.note && (
                <View style={styles.note}>
                  <Ionicons color={palette.aqua} name="information-circle-outline" size={19} />
                  <Text style={styles.noteText}>{sheet.note}</Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.footer}>
              <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                <Text style={styles.primaryButtonText}>Done</Text>
              </Pressable>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: palette.background },
    screen: { flex: 1 },
    header: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border, backgroundColor: palette.surface },
    iconButton: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.soft },
    headerCopy: { flex: 1, alignItems: 'center' },
    headerSpacer: { width: 40 },
    eyebrow: { color: palette.primary, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 16, fontWeight: '700', marginTop: 3 },
    content: { padding: 18, paddingBottom: 30, gap: 14 },
    description: { color: palette.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
    group: { paddingHorizontal: 15, borderRadius: 18, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    groupTitle: { color: palette.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', paddingTop: 15, paddingBottom: 7 },
    row: { paddingVertical: 12, gap: 4 },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
    label: { color: palette.text, fontSize: 13, fontWeight: '700' },
    detail: { color: palette.muted, fontSize: 12, lineHeight: 17 },
    note: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 14, borderRadius: 15, backgroundColor: palette.aquaSoft },
    noteText: { flex: 1, color: palette.aquaText, fontSize: 11, lineHeight: 17 },
    footer: { padding: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, backgroundColor: palette.surface },
    primaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.primary },
    primaryButtonText: { color: palette.primaryText, fontSize: 14, fontWeight: '700' },
    pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  });
}
