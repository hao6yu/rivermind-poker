import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { cheatSheets } from '../../domain/learning/content';
import type { CheatSheetDefinition } from '../../domain/learning/types';
import type { Street } from '../../domain/poker/types';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import { PreflopRangeExplorer } from '../learn/PreflopRangeExplorer';

export function TableGuideModal({ onClose, street, visible }: { onClose: () => void; street: Street; visible: boolean }) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const insets = useSafeAreaInsets();
  const references = cheatSheets.filter((sheet) => (
    sheet.id === 'sheet-hand-rankings' || sheet.id === 'sheet-percentages' || sheet.id === 'sheet-preflop'
  ));
  const preflopReference = references.find((sheet) => sheet.id === 'sheet-preflop');
  const actionRows = [
    { label: t('poker.action.check'), detail: t('guide.checkDetail') },
    { label: t('poker.action.call'), detail: t('guide.callDetail') },
    { label: t('poker.action.bet'), detail: t('guide.betDetail') },
    { label: t('poker.action.raise'), detail: t('guide.raiseDetail') },
    { label: t('poker.action.fold'), detail: t('guide.foldDetail') },
  ];
  const positionRows = [
    { label: t('guide.utg'), detail: t('guide.utgDetail') },
    { label: t('guide.hj'), detail: t('guide.hjDetail') },
    { label: t('guide.co'), detail: t('guide.coDetail') },
    { label: t('guide.dealer'), detail: t('guide.dealerDetail') },
    { label: t('guide.sb'), detail: t('guide.sbDetail') },
    { label: t('guide.bb'), detail: t('guide.bbDetail') },
  ];

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" visible={visible}>
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Pressable accessibilityLabel={t('guide.backA11y')} accessibilityRole="button" onPress={onClose} style={styles.iconButton}>
            <Ionicons color={palette.text} name="arrow-back" size={21} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{t('guide.eyebrow')}</Text>
            <Text accessibilityRole="header" style={styles.title}>{t('guide.title')}</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.tipCard}>
            <View style={styles.tipIcon}><Ionicons color={palette.aqua} name="eye-outline" size={20} /></View>
            <View style={styles.tipCopy}>
              <Text style={styles.tipTitle}>{t('guide.tipTitle')}</Text>
              <Text style={styles.tipText}>{t('guide.tipText')}</Text>
            </View>
          </View>

          {street === 'preflop' && preflopReference ? <ReferenceSection sheet={preflopReference} /> : null}

          <ReferenceGroup rows={actionRows} title={t('guide.actions')} />
          <ReferenceGroup rows={positionRows} title={t('guide.positions')} />
          <ReferenceGroup
            rows={[
              { label: t('guide.chipsUnit'), detail: t('guide.chipsUnitDetail') },
              { label: '½ pot', detail: t('guide.halfPotDetail') },
              { label: t('guide.equityNeeded'), detail: t('guide.equityNeededDetail') },
              { label: t('guide.playersBehind'), detail: t('guide.playersBehindDetail') },
            ]}
            title={t('guide.tableLanguage')}
          />

          {references
            .filter((sheet) => street !== 'preflop' || sheet.id !== 'sheet-preflop')
            .map((sheet) => <ReferenceSection key={sheet.id} sheet={sheet} />)}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{t('guide.backToHand')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function ReferenceSection({ sheet }: { sheet: CheatSheetDefinition }) {
  const { palette } = useAppTheme();
  const { cheatSheetContent, t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const displayedSheet = useMemo(() => cheatSheetContent(sheet), [cheatSheetContent, sheet]);
  return (
    <View style={styles.referenceSection}>
      <Text style={styles.sectionEyebrow}>{t('guide.quickReference')}</Text>
      <Text style={styles.sectionTitle}>{displayedSheet.title}</Text>
      {displayedSheet.id !== 'sheet-hand-rankings' ? <Text style={styles.sectionDescription}>{displayedSheet.description}</Text> : null}
      {displayedSheet.id === 'sheet-preflop'
        ? <PreflopRangeExplorer />
        : displayedSheet.groups.map((group) => <ReferenceGroup key={group.title} rows={group.rows} title={group.title} />)}
      {displayedSheet.note ? <Text style={styles.note}>{displayedSheet.note}</Text> : null}
    </View>
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
    headerCopy: { flex: 1, minWidth: 0, alignItems: 'center' },
    headerSpacer: { width: 44 },
    eyebrow: { color: palette.primary, fontSize: 9, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 17, fontWeight: '800', marginTop: 3 },
    content: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 14, padding: 16, paddingBottom: 28 },
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
    rowLabel: { flexShrink: 1, color: palette.text, fontSize: 13, fontWeight: '800' },
    rowDetail: { color: palette.muted, fontSize: 11, lineHeight: 17 },
    note: { color: palette.muted, fontSize: 11, lineHeight: 17, padding: 13, borderRadius: 14, backgroundColor: palette.soft },
    footer: { padding: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, backgroundColor: palette.surface },
    primaryButton: { width: '100%', maxWidth: 720, alignSelf: 'center', minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.primary },
    primaryButtonText: { color: palette.primaryText, fontSize: 14, fontWeight: '800' },
  });
}
