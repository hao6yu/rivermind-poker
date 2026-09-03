import { Ionicons } from '@expo/vector-icons';
import { useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ComponentRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiPlayerProfile } from '../../components/AiPlayerProfile';
import { ModalBackdrop } from '../../components/ModalBackdrop';
import {
  multiwayAiRosterForDisplay,
  type MultiwayAiIdentity,
} from '../../domain/poker/multiwayAiProfiles';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * Everyone who can take a seat at your table, at a size you can read.
 *
 * Slice 3.11E: tapping ANY entry — featured tile or regular row — opens the
 * same AI presentation as a popup above a dimmed, stationary roster. The
 * roster itself never resizes, reorders, or scrolls: the in-place expansion
 * patterns are gone. The popup closes on outside tap, the 44-point close
 * target, or platform Back/Escape, and dismissal returns accessibility focus
 * to the entry that opened it. There are no stats here on purpose: the app
 * does not track per-opponent results yet, so the only honest things to show
 * are the name and the authored title.
 */
export function AiRosterModal({ onClose, visible }: { onClose: () => void; visible: boolean }) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const reduceMotion = useReducedMotion();
  const [selectedName, setSelectedName] = useState<string | null>(null);
  /** Originating entries by name, so closing the popup restores focus. */
  const entryRefs = useRef(new Map<string, ComponentRef<typeof Pressable> | null>());

  const roster = useMemo(() => multiwayAiRosterForDisplay(), []);
  const featured = useMemo(() => roster.filter((identity) => identity.title), [roster]);
  const others = useMemo(() => roster.filter((identity) => !identity.title), [roster]);
  const selectedIdentity = useMemo(
    () => roster.find((identity) => identity.name === selectedName) ?? null,
    [roster, selectedName],
  );

  const registerEntry = (name: string) => (instance: ComponentRef<typeof Pressable> | null) => {
    if (instance) entryRefs.current.set(name, instance);
    else entryRefs.current.delete(name);
  };

  const dismissPopup = () => {
    const origin = selectedName ? entryRefs.current.get(selectedName) : null;
    setSelectedName(null);
    // Restore accessibility focus to the exact tile or row that opened the
    // popup (best effort — focus() is a no-op when the platform refuses).
    origin?.focus?.();
  };

  const close = () => {
    if (selectedName) {
      dismissPopup();
      return;
    }
    onClose();
  };

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
            onPress={() => setSelectedName(identity.name)}
            ref={registerEntry(identity.name)}
            selected={selectedName === identity.name}
          />
        ))}
      </View>
    </View>
  );

  const renderSection = (label: string, identities: readonly MultiwayAiIdentity[]) => (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{label}</Text>
      <View style={styles.list}>
        {identities.map((identity, index) => (
          <RosterEntry
            first={index === 0}
            identity={identity}
            key={identity.name}
            onPress={() => setSelectedName(identity.name)}
            ref={registerEntry(identity.name)}
            selected={selectedName === identity.name}
          />
        ))}
      </View>
    </View>
  );

  return (
    <Modal animationType={reduceMotion ? 'none' : "slide"} onRequestClose={close} transparent visible={visible}>
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
        {selectedIdentity ? (
          <View style={styles.popupScrim}>
            {/* The backdrop closes the popup; taps inside the card do not. */}
            <Pressable
              accessibilityLabel={t('multiway.dialog.close')}
              accessibilityRole="button"
              onPress={dismissPopup}
              style={styles.popupBackdrop}
            />
            <View accessibilityViewIsModal style={styles.popupCard}>
              <Text style={styles.popupEyebrow}>{t('profile.eyebrow')}</Text>
              <ScrollView showsVerticalScrollIndicator={false} style={styles.popupScroll}>
                <AiPlayerProfile identity={selectedIdentity} size="large" />
              </ScrollView>
              <Pressable
                accessibilityLabel={t('multiway.dialog.close')}
                accessibilityRole="button"
                onPress={dismissPopup}
                style={({ pressed }) => [styles.popupClose, pressed && styles.pressed]}
              >
                <Ionicons color={palette.text} name="close" size={22} />
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function RosterTile({
  identity,
  onPress,
  ref,
  selected,
}: {
  identity: MultiwayAiIdentity;
  onPress: () => void;
  ref?: (instance: ComponentRef<typeof Pressable> | null) => void;
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
      ref={ref}
      style={({ pressed }) => [styles.tile, selected && styles.tileSelected, pressed && styles.pressed]}
    >
      <AiPlayerProfile identity={identity} size="tile" />
    </Pressable>
  );
}

function RosterEntry({
  first,
  identity,
  onPress,
  ref,
  selected,
}: {
  first: boolean;
  identity: MultiwayAiIdentity;
  onPress: () => void;
  ref?: (instance: ComponentRef<typeof Pressable> | null) => void;
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
      ref={ref}
      style={({ pressed }) => [
        styles.entry,
        !first && styles.entryBorder,
        selected && styles.entryExpanded,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.rowLine}>
        <View style={styles.rowProfile}>
          <AiPlayerProfile identity={identity} size="row" />
        </View>
        <Ionicons color={palette.muted} name="chevron-forward" size={17} />
      </View>
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
    entryExpanded: { paddingVertical: 11 },
    rowLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rowProfile: { flex: 1, minWidth: 0 },
    // The popup floats above the stationary roster with its own dimmer.
    popupScrim: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 24 },
    popupBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: palette.scrim },
    popupCard: { maxHeight: '78%', width: '100%', maxWidth: 460, borderRadius: 22, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, padding: 18, gap: 8 },
    popupScroll: { flexGrow: 0 },
    popupEyebrow: { color: palette.primary, fontSize: 9, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', textAlign: 'center' },
    popupClose: { alignSelf: 'center', width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: palette.soft },
    pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  });
}
