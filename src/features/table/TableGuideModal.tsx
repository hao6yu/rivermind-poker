import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cheatSheets } from '../../domain/learning/content';
import { type ThemePalette, useAppTheme } from '../../theme';

const actionRows = [
  { label: 'Check', detail: 'Pass the action without adding chips when nobody has bet.' },
  { label: 'Call', detail: 'Match the current bet to stay in the hand.' },
  { label: 'Bet', detail: 'Put in the first wager on this street.' },
  { label: 'Raise', detail: 'Increase a wager that another player already made.' },
  { label: 'Fold', detail: 'Give up this hand and risk no more chips.' },
];

export function TableGuideModal({ onClose, visible }: { onClose: () => void; visible: boolean }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const insets = useSafeAreaInsets();
  const references = cheatSheets.filter((sheet) => (
    sheet.id === 'sheet-hand-rankings' || sheet.id === 'sheet-percentages'
  ));

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" visible={visible}>
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back to the table" accessibilityRole="button" onPress={onClose} style={styles.iconButton}>
            <Ionicons color={palette.text} name="arrow-back" size={21} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>Available during every hand</Text>
            <Text accessibilityRole="header" style={styles.title}>Poker cheat sheet</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.tipCard}>
            <View style={styles.tipIcon}><Ionicons color={palette.aqua} name="eye-outline" size={20} /></View>
            <View style={styles.tipCopy}>
              <Text style={styles.tipTitle}>Follow the highlighted seat</Text>
              <Text style={styles.tipText}>A bright outline marks whose turn it is. The badge under each player keeps their latest action visible until the next street.</Text>
            </View>
          </View>

          <ReferenceGroup rows={actionRows} title="Actions" />
          <ReferenceGroup
            rows={[
              { label: 'BB', detail: 'Big blind—the standard unit used to compare bets and stacks.' },
              { label: 'D', detail: 'Dealer button. It moves one seat clockwise after every hand.' },
              { label: 'SB / BB', detail: 'Small blind and big blind—the forced bets that start the pot.' },
              { label: '½ pot', detail: 'A bet equal to half the chips currently in the pot.' },
              { label: 'Equity needed', detail: 'The minimum estimated win percentage a call needs to break even.' },
              { label: 'Players behind', detail: 'Players who can still respond after your action.' },
            ]}
            title="Table language"
          />

          {references.map((sheet) => (
            <View key={sheet.id} style={styles.referenceSection}>
              <Text style={styles.sectionEyebrow}>Quick reference</Text>
              <Text style={styles.sectionTitle}>{sheet.title}</Text>
              <Text style={styles.sectionDescription}>{sheet.description}</Text>
              {sheet.groups.map((group) => <ReferenceGroup key={group.title} rows={group.rows} title={group.title} />)}
              {sheet.note ? <Text style={styles.note}>{sheet.note}</Text> : null}
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Back to the hand</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function ReferenceGroup({ rows, title }: { rows: Array<{ detail: string; label: string }>; title: string }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{title}</Text>
      {rows.map((row, index) => (
        <View key={`${title}-${row.label}`} style={[styles.row, index > 0 && styles.rowBorder]}>
          <Text style={styles.rowLabel}>{row.label}</Text>
          <Text style={styles.rowDetail}>{row.detail}</Text>
        </View>
      ))}
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    header: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border, backgroundColor: palette.surface },
    iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.soft },
    headerCopy: { flex: 1, alignItems: 'center' },
    headerSpacer: { width: 44 },
    eyebrow: { color: palette.primary, fontSize: 9, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 17, fontWeight: '800', marginTop: 3 },
    content: { gap: 14, padding: 16, paddingBottom: 28 },
    tipCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 14, borderRadius: 17, backgroundColor: palette.aquaSoft },
    tipIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.surface },
    tipCopy: { flex: 1, gap: 3 },
    tipTitle: { color: palette.aquaText, fontSize: 13, fontWeight: '800' },
    tipText: { color: palette.aquaText, fontSize: 11, lineHeight: 17 },
    referenceSection: { gap: 10, paddingTop: 5 },
    sectionEyebrow: { color: palette.primary, fontSize: 9, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
    sectionTitle: { color: palette.text, fontSize: 20, fontWeight: '800' },
    sectionDescription: { color: palette.muted, fontSize: 12, lineHeight: 18 },
    group: { paddingHorizontal: 14, borderRadius: 17, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    groupTitle: { color: palette.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase', paddingTop: 14, paddingBottom: 6 },
    row: { gap: 4, paddingVertical: 11 },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
    rowLabel: { color: palette.text, fontSize: 13, fontWeight: '800' },
    rowDetail: { color: palette.muted, fontSize: 11, lineHeight: 17 },
    note: { color: palette.muted, fontSize: 11, lineHeight: 17, padding: 13, borderRadius: 14, backgroundColor: palette.soft },
    footer: { padding: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, backgroundColor: palette.surface },
    primaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.primary },
    primaryButtonText: { color: palette.primaryText, fontSize: 14, fontWeight: '800' },
  });
}
