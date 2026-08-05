import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiPlayerProfile } from '../../components/AiPlayerProfile';
import { ModalBackdrop } from '../../components/ModalBackdrop';
import {
  multiwayAiRosterForDisplay,
  type MultiwayAiIdentity,
} from '../../domain/poker/multiwayAiProfiles';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';

/**
 * Everyone who can take a seat at your table, at a size you can read.
 *
 * Tapping an entry expands it in place into the large presentation. There are
 * no stats here on purpose: the app does not track per-opponent results yet,
 * so the only honest things to show are the name and the authored title.
 */
export function AiRosterModal({ onClose, visible }: { onClose: () => void; visible: boolean }) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [expandedName, setExpandedName] = useState<string | null>(null);

  const roster = useMemo(() => multiwayAiRosterForDisplay(), []);
  const featured = useMemo(() => roster.filter((identity) => identity.title), [roster]);
  const others = useMemo(() => roster.filter((identity) => !identity.title), [roster]);

  const close = () => {
    setExpandedName(null);
    onClose();
  };

  const toggle = (name: string) => setExpandedName((current) => current === name ? null : name);
  const expandedIdentity = useMemo(
    () => featured.find((identity) => identity.name === expandedName) ?? null,
    [expandedName, featured],
  );

  const renderGrid = (label: string, identities: readonly MultiwayAiIdentity[]) => (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{label}</Text>
      {/* Three across so all twelve regulars land on one screen — faces in a
          grid also scan far faster than faces in a column. */}
      <View style={styles.grid}>
        {identities.map((identity) => (
          <RosterTile
            identity={identity}
            key={identity.name}
            onPress={() => toggle(identity.name)}
            selected={expandedName === identity.name}
          />
        ))}
      </View>
      {/* The tapped face opens below the grid rather than pushing tiles around,
          so the twelve stay put while you browse them. */}
      {expandedIdentity ? (
        <View style={styles.detail}>
          <Text style={styles.expandedEyebrow}>{t('profile.eyebrow')}</Text>
          <AiPlayerProfile identity={expandedIdentity} size="large" />
        </View>
      ) : null}
    </View>
  );

  const renderSection = (label: string, identities: readonly MultiwayAiIdentity[]) => (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{label}</Text>
      <View style={styles.list}>
        {identities.map((identity, index) => (
          <RosterEntry
            expanded={expandedName === identity.name}
            first={index === 0}
            identity={identity}
            key={identity.name}
            onPress={() => toggle(identity.name)}
          />
        ))}
      </View>
    </View>
  );

  return (
    <Modal animationType="slide" onRequestClose={close} transparent visible={visible}>
      <View style={styles.scrim}>
        <ModalBackdrop accessibilityLabel={t('multiway.dialog.close')} onPress={close} />
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(18, insets.bottom + 8) }]}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderCopy}>
              <Text numberOfLines={2} style={styles.sheetEyebrow}>{t('roster.eyebrow')}</Text>
              <Text accessibilityRole="header" numberOfLines={2} style={styles.sheetTitle}>{t('roster.title')}</Text>
            </View>
            <Pressable
              accessibilityLabel={t('multiway.dialog.close')}
              accessibilityRole="button"
              hitSlop={10}
              onPress={close}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <Ionicons color={palette.text} name="close" size={20} />
            </Pressable>
          </View>
          <Text style={styles.count}>{t('roster.count', { count: roster.length })}</Text>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {featured.length > 0 ? renderGrid(t('roster.featured'), featured) : null}
            {others.length > 0 ? renderSection(t('roster.others'), others) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function RosterTile({
  identity,
  onPress,
  selected,
}: {
  identity: MultiwayAiIdentity;
  onPress: () => void;
  selected: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <Pressable
      accessibilityHint={t('multiway.seat.openProfileHint')}
      accessibilityLabel={[identity.name, identity.title].filter(Boolean).join('. ')}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, selected && styles.tileSelected, pressed && styles.pressed]}
    >
      <AiPlayerProfile identity={identity} size="tile" />
    </Pressable>
  );
}

function RosterEntry({
  expanded,
  first,
  identity,
  onPress,
}: {
  expanded: boolean;
  first: boolean;
  identity: MultiwayAiIdentity;
  onPress: () => void;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <Pressable
      accessibilityHint={t('multiway.seat.openProfileHint')}
      accessibilityLabel={[identity.name, identity.title].filter(Boolean).join('. ')}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.entry,
        !first && styles.entryBorder,
        expanded && styles.entryExpanded,
        pressed && styles.pressed,
      ]}
    >
      {expanded ? (
        <View style={styles.expandedCopy}>
          <Text style={styles.expandedEyebrow}>{t('profile.eyebrow')}</Text>
          <AiPlayerProfile identity={identity} size="large" />
        </View>
      ) : (
        <View style={styles.rowLine}>
          <View style={styles.rowProfile}>
            <AiPlayerProfile identity={identity} size="row" />
          </View>
          <Ionicons color={palette.muted} name="chevron-forward" size={17} />
        </View>
      )}
    </Pressable>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    // Three columns: each tile takes a third of the row minus its share of the
    // two 8px gaps. Percentage width keeps it correct on every screen size.
    tile: { width: '31.7%', paddingVertical: 10, paddingHorizontal: 4, borderRadius: 14, backgroundColor: palette.soft, borderWidth: 1, borderColor: 'transparent' },
    tileSelected: { borderColor: palette.primary, backgroundColor: palette.accentSoft },
    detail: { marginTop: 12, padding: 14, borderRadius: 16, backgroundColor: palette.soft, alignItems: 'center', gap: 4 },
    scrim: { flex: 1, justifyContent: 'flex-end', padding: 12, backgroundColor: palette.scrim },
    sheet: { maxHeight: '90%', gap: 12, padding: 18, borderRadius: 24, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sheetHeaderCopy: { flex: 1, minWidth: 0, paddingRight: 8 },
    sheetEyebrow: { color: palette.primary, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    sheetTitle: { color: palette.text, fontSize: 21, fontWeight: '700', marginTop: 3 },
    iconButton: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.soft },
    count: { color: palette.muted, fontSize: 11, fontWeight: '600' },
    content: { gap: 14, paddingBottom: 6 },
    section: { gap: 8 },
    sectionTitle: { color: palette.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', paddingHorizontal: 2 },
    list: { paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceRaised },
    entry: { paddingVertical: 11 },
    entryBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
    entryExpanded: { paddingVertical: 16 },
    expandedCopy: { alignItems: 'center', gap: 4 },
    expandedEyebrow: { color: palette.primary, fontSize: 9, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
    rowLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowProfile: { flex: 1, minWidth: 0 },
    pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  });
}
