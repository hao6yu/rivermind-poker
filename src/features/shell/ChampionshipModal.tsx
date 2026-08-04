import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  CHAMPIONSHIP_INVITATIONAL_EVENT,
  CHAMPIONSHIP_EVENTS,
  championshipCurrentEvent,
  championshipEventIsUnlocked,
  championshipEventProgress,
  championshipIsComplete,
  championshipInvitationIsComplete,
  championshipInvitationIsUnlocked,
  championshipQualifiedCount,
  type ChampionshipCheckpoint,
  type ChampionshipEvent,
  type ChampionshipProgress,
} from '../../domain/poker/championship';
import { championshipEventText } from '../../localization/championship';
import { useLocalization } from '../../localization';
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
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const qualifiedCount = championshipQualifiedCount(progress);
  const currentEvent = championshipCurrentEvent(progress);
  const complete = championshipIsComplete(progress);
  const invitationUnlocked = championshipInvitationIsUnlocked(progress);
  const invitationComplete = championshipInvitationIsComplete(progress);
  const invitationPending = invitationUnlocked && !invitationComplete;
  const displayedEvents = invitationUnlocked
    ? [...CHAMPIONSHIP_EVENTS, CHAMPIONSHIP_INVITATIONAL_EVENT]
    : CHAMPIONSHIP_EVENTS;
  const circuitPodiums = progress.events.filter((event) => event.bestPlace <= 2).length;
  const circuitWins = progress.events.filter((event) => event.bestPlace === 1).length;

  return (
    <Modal animationType="slide" onRequestClose={recordVisible ? onCloseRecord : onClose} visible={visible}>
      <ModalSafeArea>
        {recordVisible ? (
          <ChampionshipRecordView onClose={onCloseRecord} progress={progress} />
        ) : (
          <View accessibilityViewIsModal style={styles.screen}>
          <View style={styles.header}>
            <Pressable accessibilityLabel={t('championship.close')} accessibilityRole="button" onPress={onClose} style={styles.iconButton}>
              <Ionicons color={palette.text} name="arrow-back" size={20} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{t('championship.journey')}</Text>
              <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>{t('championship.title')}</Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.progressCard}>
              <View style={styles.progressTopRow}>
                <View style={styles.trophyIcon}>
                  <Ionicons color={palette.primary} name={invitationPending ? 'mail-open-outline' : complete ? 'trophy' : 'trophy-outline'} size={24} />
                </View>
                <View style={styles.progressCopy}>
                  <Text style={styles.progressEyebrow}>{t(invitationPending ? 'championship.invitation' : complete ? 'championship.tourComplete' : 'championship.currentStop')}</Text>
                  <Text numberOfLines={2} style={styles.progressTitle}>{invitationPending ? championshipEventText(currentEvent, 'title', t) : complete ? t('summary.champion') : championshipEventText(currentEvent, 'title', t)}</Text>
                </View>
                <Text style={styles.progressValue}>{qualifiedCount}/{CHAMPIONSHIP_EVENTS.length}</Text>
              </View>
              <View
                accessibilityLabel={t('championship.progressA11y', { qualified: qualifiedCount, total: CHAMPIONSHIP_EVENTS.length })}
                accessibilityRole="progressbar"
                style={styles.progressTrack}
              >
                <View style={[styles.progressFill, { width: `${(qualifiedCount / CHAMPIONSHIP_EVENTS.length) * 100}%` }]} />
              </View>
              <Text style={styles.progressNote}>
                {invitationPending
                  ? t('championship.invitationNote')
                  : invitationComplete
                    ? t('championship.invitationCompleteNote')
                    : complete
                      ? t('championship.replayNote')
                  : t('championship.qualifyNote', { place: t('summary.placeNumber', { place: currentEvent.qualifyingPlace }) })}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={onOpenRecord}
                style={({ pressed }) => [styles.recordButton, pressed && styles.pressed]}
              >
                <Ionicons color={palette.primary} name="ribbon-outline" size={17} />
                <Text numberOfLines={2} style={styles.recordButtonText}>{t('championship.viewRecord')}</Text>
                <Ionicons color={palette.primary} name="chevron-forward" size={15} />
              </Pressable>
            </View>

            {complete ? (
              <View style={styles.circuitCard}>
                <View style={styles.circuitHeader}>
                  <View style={styles.circuitIcon}>
                    <Ionicons color={palette.aqua} name="infinite-outline" size={21} />
                  </View>
                  <View style={styles.circuitCopy}>
                    <Text style={styles.circuitTitle}>{t('championship.circuit.title')}</Text>
                    <Text style={styles.circuitDescription}>{t('championship.circuit.description')}</Text>
                  </View>
                </View>
                <View style={styles.circuitGoals}>
                  <CircuitGoal label={t('championship.circuit.cleared')} value={`${qualifiedCount}/${CHAMPIONSHIP_EVENTS.length}`} />
                  <CircuitGoal label={t('championship.circuit.podiums')} value={`${circuitPodiums}/${CHAMPIONSHIP_EVENTS.length}`} />
                  <CircuitGoal label={t('championship.circuit.wins')} value={`${circuitWins}/${CHAMPIONSHIP_EVENTS.length}`} />
                </View>
              </View>
            ) : null}

            <View style={styles.eventList}>
              {displayedEvents.map((event, index) => {
                const eventProgress = championshipEventProgress(progress, event.id);
                const unlocked = championshipEventIsUnlocked(progress, event.id);
                const qualified = Boolean(eventProgress?.qualifiedAt);
                const saved = checkpoint?.eventId === event.id;
                const active = event.id === currentEvent.id && (!complete || event.invitational);
                const status = qualified
                  ? t('championship.bestRuns', { count: eventProgress!.attempts, place: t('summary.placeNumber', { place: eventProgress!.bestPlace }) })
                  : saved
                    ? t('championship.continueHand', { hand: checkpoint.tournament.nextHandNumber })
                    : unlocked
                      ? event.invitational
                        ? t('championship.invitationStatus')
                        : t('championship.qualifyStatus', { place: t('summary.placeNumber', { place: event.qualifyingPlace }) })
                      : t('championship.previousStop');
                const eventTitle = championshipEventText(event, 'title', t);
                return (
                  <Pressable
                    accessibilityLabel={`${eventTitle}. ${status}`}
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
                          : event.invitational
                            ? <Ionicons color={palette.primaryText} name="flame-outline" size={17} />
                            : <Text style={[styles.eventNumberText, active && styles.eventNumberTextActive]}>{index + 1}</Text>}
                    </View>
                    <View style={styles.eventCopy}>
                      <View style={styles.eventTitleRow}>
                        <Text numberOfLines={2} style={styles.eventTitle}>{eventTitle}</Text>
                        {saved && <Text style={styles.savedBadge}>{t('championship.saved')}</Text>}
                      </View>
                      <Text style={styles.eventDescription}>{championshipEventText(event, 'description', t)}</Text>
                      <Text style={styles.eventMeta}>{t('championship.eventMeta', { count: event.playerCount })}</Text>
                      <Text style={[styles.eventStatus, qualified && styles.eventStatusQualified]}>{status}</Text>
                    </View>
                    {unlocked && <Ionicons color={active || qualified ? palette.primary : palette.muted} name="chevron-forward" size={18} />}
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.fairNote}>
              <Ionicons color={palette.aqua} name="shield-checkmark-outline" size={19} />
              <Text style={styles.fairNoteText}>{t('championship.fairNote')}</Text>
            </View>
          </ScrollView>
          </View>
        )}
      </ModalSafeArea>
    </Modal>
  );
}

function CircuitGoal({ label, value }: { label: string; value: string }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.circuitGoal}>
      <Text style={styles.circuitGoalValue}>{value}</Text>
      <Text style={styles.circuitGoalLabel}>{label}</Text>
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    header: { minHeight: 66, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
    iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    headerCopy: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 8 },
    headerSpacer: { width: 38 },
    eyebrow: { color: palette.primary, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 16, fontWeight: '700', marginTop: 2 },
    content: { padding: 18, paddingBottom: 30, gap: 14 },
    progressCard: { gap: 13, padding: 18, borderRadius: 21, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
    progressTopRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    trophyIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.accentSoft },
    progressCopy: { flex: 1, minWidth: 0, gap: 2 },
    progressEyebrow: { color: palette.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
    progressTitle: { color: palette.text, fontSize: 17, fontWeight: '800' },
    progressValue: { color: palette.primary, fontSize: 18, fontWeight: '800' },
    progressTrack: { height: 6, borderRadius: 4, backgroundColor: palette.soft, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 4, backgroundColor: palette.aqua },
    progressNote: { color: palette.muted, fontSize: 11, lineHeight: 16 },
    recordButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 13, backgroundColor: palette.accentSoft },
    recordButtonText: { flex: 1, color: palette.primary, fontSize: 11, fontWeight: '800' },
    circuitCard: { gap: 12, padding: 15, borderRadius: 18, backgroundColor: palette.aquaSoft, borderWidth: 1, borderColor: palette.aqua },
    circuitHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    circuitIcon: { width: 39, height: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.surface },
    circuitCopy: { flex: 1, gap: 2 },
    circuitTitle: { color: palette.aquaText, fontSize: 14, fontWeight: '800' },
    circuitDescription: { color: palette.aquaText, fontSize: 10, lineHeight: 14, opacity: 0.82 },
    circuitGoals: { flexDirection: 'row', gap: 7 },
    circuitGoal: { flex: 1, gap: 2, paddingHorizontal: 9, paddingVertical: 8, borderRadius: 11, backgroundColor: palette.surface },
    circuitGoalValue: { color: palette.text, fontSize: 14, fontWeight: '800' },
    circuitGoalLabel: { color: palette.muted, fontSize: 8 },
    eventList: { gap: 9 },
    eventCard: { minHeight: 106, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderRadius: 18, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    eventCardActive: { borderColor: palette.primary, backgroundColor: palette.accentSoft },
    eventCardQualified: { borderColor: palette.aqua },
    eventCardLocked: { opacity: 0.54, backgroundColor: palette.soft },
    eventNumber: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: palette.soft },
    eventNumberActive: { backgroundColor: palette.primary },
    eventNumberText: { color: palette.muted, fontSize: 13, fontWeight: '800' },
    eventNumberTextActive: { color: palette.primaryText },
    eventCopy: { flex: 1, minWidth: 0, gap: 3 },
    eventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    eventTitle: { flexShrink: 1, color: palette.text, fontSize: 14, lineHeight: 18, fontWeight: '800' },
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
