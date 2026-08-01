import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  CHAMPIONSHIP_EVENTS,
  championshipCurrentEvent,
  championshipEventIsUnlocked,
  championshipEventProgress,
  championshipIsComplete,
  championshipQualifiedCount,
  type ChampionshipCheckpoint,
  type ChampionshipEvent,
  type ChampionshipProgress,
} from '../../domain/poker/championship';
import { aiStrategyProfile } from '../../domain/poker/aiProfiles';
import { type ThemePalette, useAppTheme } from '../../theme';
import { ModalSafeArea } from '../learn/ModalSafeArea';
import { ChampionshipRecordView } from './ChampionshipRecordModal';

interface ChampionshipModalProps {
  checkpoint: ChampionshipCheckpoint | null;
  onClose: () => void;
  onCloseRecord: () => void;
  onOpenRecord: () => void;
  onSelectEvent: (event: ChampionshipEvent) => void;
  progress: ChampionshipProgress;
  recordVisible: boolean;
  visible: boolean;
}

function ordinal(place: number): string {
  const remainder = place % 100;
  if (remainder >= 11 && remainder <= 13) return `${place}th`;
  if (place % 10 === 1) return `${place}st`;
  if (place % 10 === 2) return `${place}nd`;
  if (place % 10 === 3) return `${place}rd`;
  return `${place}th`;
}

export function ChampionshipModal({
  checkpoint,
  onClose,
  onCloseRecord,
  onOpenRecord,
  onSelectEvent,
  progress,
  recordVisible,
  visible,
}: ChampionshipModalProps) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const qualifiedCount = championshipQualifiedCount(progress);
  const currentEvent = championshipCurrentEvent(progress);
  const complete = championshipIsComplete(progress);

  return (
    <Modal animationType="slide" onRequestClose={recordVisible ? onCloseRecord : onClose} visible={visible}>
      <ModalSafeArea>
        {recordVisible ? (
          <ChampionshipRecordView onClose={onCloseRecord} progress={progress} />
        ) : (
          <View accessibilityViewIsModal style={styles.screen}>
          <View style={styles.header}>
            <Pressable accessibilityLabel="Close Championship" accessibilityRole="button" onPress={onClose} style={styles.iconButton}>
              <Ionicons color={palette.text} name="arrow-back" size={20} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>Five-event journey</Text>
              <Text accessibilityRole="header" style={styles.title}>RiverMind Championship</Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.progressCard}>
              <View style={styles.progressTopRow}>
                <View style={styles.trophyIcon}>
                  <Ionicons color={palette.primary} name={complete ? 'trophy' : 'trophy-outline'} size={24} />
                </View>
                <View style={styles.progressCopy}>
                  <Text style={styles.progressEyebrow}>{complete ? 'Tour complete' : 'Current stop'}</Text>
                  <Text style={styles.progressTitle}>{complete ? 'RiverMind Champion' : currentEvent.title}</Text>
                </View>
                <Text style={styles.progressValue}>{qualifiedCount}/{CHAMPIONSHIP_EVENTS.length}</Text>
              </View>
              <View
                accessibilityLabel={`Championship ${qualifiedCount} of ${CHAMPIONSHIP_EVENTS.length} events qualified`}
                accessibilityRole="progressbar"
                style={styles.progressTrack}
              >
                <View style={[styles.progressFill, { width: `${(qualifiedCount / CHAMPIONSHIP_EVENTS.length) * 100}%` }]} />
              </View>
              <Text style={styles.progressNote}>
                {complete
                  ? 'Every stop is open for replay. Your best finishes remain saved on this device.'
                  : `Finish ${ordinal(currentEvent.qualifyingPlace)} or better to unlock the next stop.`}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={onOpenRecord}
                style={({ pressed }) => [styles.recordButton, pressed && styles.pressed]}
              >
                <Ionicons color={palette.primary} name="ribbon-outline" size={17} />
                <Text style={styles.recordButtonText}>View record & achievements</Text>
                <Ionicons color={palette.primary} name="chevron-forward" size={15} />
              </Pressable>
            </View>

            <View style={styles.eventList}>
              {CHAMPIONSHIP_EVENTS.map((event, index) => {
                const eventProgress = championshipEventProgress(progress, event.id);
                const unlocked = championshipEventIsUnlocked(progress, event.id);
                const qualified = Boolean(eventProgress?.qualifiedAt);
                const saved = checkpoint?.eventId === event.id;
                const active = event.id === currentEvent.id && !complete;
                const status = qualified
                  ? `Best ${ordinal(eventProgress!.bestPlace)} · ${eventProgress!.attempts} ${eventProgress!.attempts === 1 ? 'run' : 'runs'}`
                  : saved
                    ? `Continue hand ${checkpoint.tournament.nextHandNumber}`
                    : unlocked
                      ? `Finish ${ordinal(event.qualifyingPlace)} or better`
                      : 'Qualify at the previous stop';
                return (
                  <Pressable
                    accessibilityLabel={`${event.title}. ${status}`}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !unlocked }}
                    disabled={!unlocked}
                    key={event.id}
                    onPress={() => onSelectEvent(event)}
                    style={({ pressed }) => [
                      styles.eventCard,
                      active && styles.eventCardActive,
                      qualified && styles.eventCardQualified,
                      !unlocked && styles.eventCardLocked,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={[styles.eventNumber, (active || qualified) && styles.eventNumberActive]}>
                      {qualified
                        ? <Ionicons color={palette.primaryText} name="checkmark" size={17} />
                        : !unlocked
                          ? <Ionicons color={palette.muted} name="lock-closed" size={14} />
                          : <Text style={[styles.eventNumberText, active && styles.eventNumberTextActive]}>{index + 1}</Text>}
                    </View>
                    <View style={styles.eventCopy}>
                      <View style={styles.eventTitleRow}>
                        <Text style={styles.eventTitle}>{event.title}</Text>
                        {saved && <Text style={styles.savedBadge}>SAVED</Text>}
                      </View>
                      <Text style={styles.eventDescription}>{event.shortDescription}</Text>
                      <Text style={styles.eventMeta}>
                        {event.playerCount} players · {aiStrategyProfile(event.aiDifficulty).label} AI · Coach off
                      </Text>
                      <Text style={[styles.eventStatus, qualified && styles.eventStatusQualified]}>{status}</Text>
                    </View>
                    {unlocked && <Ionicons color={active || qualified ? palette.primary : palette.muted} name="chevron-forward" size={18} />}
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.fairNote}>
              <Ionicons color={palette.aqua} name="shield-checkmark-outline" size={19} />
              <Text style={styles.fairNoteText}>Championship runs use fixed difficulty and no coaching. Cards are freshly shuffled, and AI seats never see hidden cards.</Text>
            </View>
          </ScrollView>
          </View>
        )}
      </ModalSafeArea>
    </Modal>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    header: { minHeight: 66, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
    iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    headerCopy: { flex: 1, alignItems: 'center' },
    headerSpacer: { width: 38 },
    eyebrow: { color: palette.primary, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 16, fontWeight: '700', marginTop: 2 },
    content: { padding: 18, paddingBottom: 30, gap: 14 },
    progressCard: { gap: 13, padding: 18, borderRadius: 21, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
    progressTopRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    trophyIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.accentSoft },
    progressCopy: { flex: 1, gap: 2 },
    progressEyebrow: { color: palette.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
    progressTitle: { color: palette.text, fontSize: 17, fontWeight: '800' },
    progressValue: { color: palette.primary, fontSize: 18, fontWeight: '800' },
    progressTrack: { height: 6, borderRadius: 4, backgroundColor: palette.soft, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 4, backgroundColor: palette.aqua },
    progressNote: { color: palette.muted, fontSize: 11, lineHeight: 16 },
    recordButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 13, backgroundColor: palette.accentSoft },
    recordButtonText: { flex: 1, color: palette.primary, fontSize: 11, fontWeight: '800' },
    eventList: { gap: 9 },
    eventCard: { minHeight: 118, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderRadius: 18, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    eventCardActive: { borderColor: palette.primary, backgroundColor: palette.accentSoft },
    eventCardQualified: { borderColor: palette.aqua },
    eventCardLocked: { opacity: 0.54, backgroundColor: palette.soft },
    eventNumber: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: palette.soft },
    eventNumberActive: { backgroundColor: palette.primary },
    eventNumberText: { color: palette.muted, fontSize: 13, fontWeight: '800' },
    eventNumberTextActive: { color: palette.primaryText },
    eventCopy: { flex: 1, gap: 3 },
    eventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    eventTitle: { color: palette.text, fontSize: 14, fontWeight: '800' },
    savedBadge: { color: palette.aquaText, fontSize: 7, fontWeight: '900', letterSpacing: 0.6, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: palette.aquaSoft, overflow: 'hidden' },
    eventDescription: { color: palette.muted, fontSize: 10, lineHeight: 14 },
    eventMeta: { color: palette.text, fontSize: 9, lineHeight: 13, fontWeight: '600' },
    eventStatus: { color: palette.primary, fontSize: 9, lineHeight: 13, fontWeight: '800' },
    eventStatusQualified: { color: palette.aquaText },
    fairNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 16, backgroundColor: palette.aquaSoft },
    fairNoteText: { flex: 1, color: palette.aquaText, fontSize: 10, lineHeight: 15, fontWeight: '600' },
    pressed: { opacity: 0.74, transform: [{ scale: 0.99 }] },
  });
}
