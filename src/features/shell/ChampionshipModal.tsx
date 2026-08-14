import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import {
  CHAMPIONSHIP_INVITATIONAL_EVENT,
  CHAMPIONSHIP_EVENTS,
  championshipCurrentEvent,
  championshipEventIsUnlocked,
  championshipEventProgress,
  championshipIsComplete,
  championshipInvitationIsComplete,
  championshipInvitationIsUnlocked,
  championshipLineupCounts,
  championshipQualifiedCount,
  type ChampionshipCheckpoint,
  type ChampionshipEvent,
  type ChampionshipProgress,
} from '../../domain/poker/championship';
import { formatChips } from '../../domain/poker/moneyFormat';
import { SIT_AND_GO_INITIAL_BIG_BLIND, SIT_AND_GO_STRUCTURES } from '../../domain/poker/tournament';
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
  const { width } = useWindowDimensions();
  const tablet = width >= 700;
  const styles = useMemo(() => createStyles(palette, tablet), [palette, tablet]);
  const qualifiedCount = championshipQualifiedCount(progress);
  const currentEvent = championshipCurrentEvent(progress);
  const complete = championshipIsComplete(progress);
  const invitationUnlocked = championshipInvitationIsUnlocked(progress);
  const invitationComplete = championshipInvitationIsComplete(progress);
  const invitationPending = invitationUnlocked && !invitationComplete;
  /** The invitation table's stack, quoted in chips like every other amount. */
  const invitationStartingChips = formatChips(
    SIT_AND_GO_STRUCTURES[currentEvent.structureId].startingStackBb * SIT_AND_GO_INITIAL_BIG_BLIND,
  );
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

          <ScrollView contentContainerStyle={[styles.content, tablet && styles.contentTablet]} showsVerticalScrollIndicator={false}>
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
                  ? t('championship.invitationNote', { stack: invitationStartingChips })
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
                  <CircuitGoal label={t('championship.circuit.cleared')} tablet={tablet} value={`${qualifiedCount}/${CHAMPIONSHIP_EVENTS.length}`} />
                  <CircuitGoal label={t('championship.circuit.podiums')} tablet={tablet} value={`${circuitPodiums}/${CHAMPIONSHIP_EVENTS.length}`} />
                  <CircuitGoal label={t('championship.circuit.wins')} tablet={tablet} value={`${circuitWins}/${CHAMPIONSHIP_EVENTS.length}`} />
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
                const lineup = championshipLineupCounts(event);
                const lineupLabel = lineup.map(({ count, difficulty }) => (
                  t('championship.lineupTier', {
                    count,
                    difficulty: t(`difficulty.${difficulty}`),
                  })
                )).join(' · ');
                return (
                  <Pressable
                    accessibilityLabel={`${eventTitle}. ${t('championship.lineupA11y', { lineup: lineupLabel })}. ${status}`}
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
                      <View style={styles.eventLineup}>
                        <Text style={[styles.eventLineupLabel, tablet && styles.eventLineupLabelTablet]}>{t('championship.lineup')}</Text>
                        {lineup.map(({ count, difficulty }) => (
                          <Text key={difficulty} style={[styles.eventLineupTier, tablet && styles.eventLineupTierTablet]}>
                            {t('championship.lineupTier', {
                              count,
                              difficulty: t(`difficulty.${difficulty}`),
                            })}
                          </Text>
                        ))}
                      </View>
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

function CircuitGoal({ label, tablet, value }: { label: string; tablet: boolean; value: string }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, tablet), [palette, tablet]);
  return (
    <View style={styles.circuitGoal}>
      <Text style={styles.circuitGoalValue}>{value}</Text>
      <Text style={styles.circuitGoalLabel}>{label}</Text>
    </View>
  );
}

function createStyles(palette: ThemePalette, tablet: boolean) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    header: { minHeight: tablet ? 82 : 66, flexDirection: 'row', alignItems: 'center', paddingHorizontal: tablet ? 28 : 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
    iconButton: { width: tablet ? 48 : 38, height: tablet ? 48 : 38, alignItems: 'center', justifyContent: 'center', borderRadius: tablet ? 15 : 13, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    headerCopy: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 8 },
    headerSpacer: { width: tablet ? 48 : 38 },
    eyebrow: { color: palette.primary, fontSize: tablet ? 12 : 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: tablet ? 21 : 16, lineHeight: tablet ? 27 : 21, fontWeight: '700', marginTop: 2 },
    content: { padding: 18, paddingBottom: 30, gap: 14 },
    contentTablet: { width: '100%', maxWidth: 860, alignSelf: 'center', paddingHorizontal: 28, paddingTop: 24, paddingBottom: 44, gap: 18 },
    progressCard: { gap: tablet ? 17 : 13, padding: tablet ? 23 : 18, borderRadius: tablet ? 25 : 21, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
    progressTopRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    trophyIcon: { width: tablet ? 54 : 44, height: tablet ? 54 : 44, alignItems: 'center', justifyContent: 'center', borderRadius: tablet ? 17 : 14, backgroundColor: palette.accentSoft },
    progressCopy: { flex: 1, minWidth: 0, gap: 2 },
    progressEyebrow: { color: palette.muted, fontSize: tablet ? 12 : 9, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
    progressTitle: { color: palette.text, fontSize: tablet ? 22 : 17, lineHeight: tablet ? 28 : 22, fontWeight: '800' },
    progressValue: { color: palette.primary, fontSize: tablet ? 22 : 18, fontWeight: '800' },
    progressTrack: { height: tablet ? 8 : 6, borderRadius: 4, backgroundColor: palette.soft, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 4, backgroundColor: palette.aqua },
    progressNote: { color: palette.muted, fontSize: tablet ? 14 : 11, lineHeight: tablet ? 20 : 16 },
    recordButton: { minHeight: tablet ? 52 : 44, flexDirection: 'row', alignItems: 'center', gap: tablet ? 11 : 8, paddingHorizontal: tablet ? 16 : 12, borderRadius: tablet ? 16 : 13, backgroundColor: palette.accentSoft },
    recordButtonText: { flex: 1, color: palette.primary, fontSize: tablet ? 14 : 11, lineHeight: tablet ? 19 : 15, fontWeight: '800' },
    circuitCard: { gap: tablet ? 16 : 12, padding: tablet ? 20 : 15, borderRadius: tablet ? 22 : 18, backgroundColor: palette.aquaSoft, borderWidth: 1, borderColor: palette.aqua },
    circuitHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    circuitIcon: { width: tablet ? 49 : 39, height: tablet ? 49 : 39, alignItems: 'center', justifyContent: 'center', borderRadius: tablet ? 16 : 13, backgroundColor: palette.surface },
    circuitCopy: { flex: 1, gap: 2 },
    circuitTitle: { color: palette.aquaText, fontSize: tablet ? 18 : 14, lineHeight: tablet ? 24 : 19, fontWeight: '800' },
    circuitDescription: { color: palette.aquaText, fontSize: tablet ? 14 : 10, lineHeight: tablet ? 20 : 14, opacity: 0.82 },
    circuitGoals: { flexDirection: 'row', gap: 7 },
    circuitGoal: { flex: 1, gap: tablet ? 3 : 2, paddingHorizontal: tablet ? 13 : 9, paddingVertical: tablet ? 11 : 8, borderRadius: tablet ? 14 : 11, backgroundColor: palette.surface },
    circuitGoalValue: { color: palette.text, fontSize: tablet ? 18 : 14, fontWeight: '800' },
    circuitGoalLabel: { color: palette.muted, fontSize: tablet ? 11 : 8, lineHeight: tablet ? 15 : 11 },
    eventList: { gap: tablet ? 13 : 9 },
    eventCard: { minHeight: tablet ? 150 : 118, flexDirection: 'row', alignItems: 'center', gap: tablet ? 15 : 11, padding: tablet ? 20 : 14, borderRadius: tablet ? 22 : 18, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    eventCardActive: { borderColor: palette.primary, backgroundColor: palette.accentSoft },
    eventCardQualified: { borderColor: palette.aqua },
    eventCardLocked: { opacity: 0.54, backgroundColor: palette.soft },
    eventNumber: { width: tablet ? 44 : 34, height: tablet ? 44 : 34, alignItems: 'center', justifyContent: 'center', borderRadius: tablet ? 14 : 11, backgroundColor: palette.soft },
    eventNumberActive: { backgroundColor: palette.primary },
    eventNumberText: { color: palette.muted, fontSize: tablet ? 17 : 13, fontWeight: '800' },
    eventNumberTextActive: { color: palette.primaryText },
    eventCopy: { flex: 1, minWidth: 0, gap: 3 },
    eventTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
    eventTitle: { flexShrink: 1, color: palette.text, fontSize: tablet ? 18 : 14, lineHeight: tablet ? 24 : 18, fontWeight: '800' },
    savedBadge: { color: palette.aquaText, fontSize: tablet ? 10 : 7, fontWeight: '900', letterSpacing: 0.6, paddingHorizontal: tablet ? 9 : 6, paddingVertical: tablet ? 4 : 3, borderRadius: tablet ? 8 : 6, backgroundColor: palette.aquaSoft, overflow: 'hidden' },
    eventDescription: { color: palette.muted, fontSize: tablet ? 14 : 10, lineHeight: tablet ? 20 : 14 },
    eventMeta: { color: palette.text, fontSize: tablet ? 13 : 9, lineHeight: tablet ? 18 : 13, fontWeight: '600' },
    eventLineup: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 2 },
    eventLineupLabel: { color: palette.muted, fontSize: 8.5, lineHeight: 12, fontWeight: '700' },
    eventLineupLabelTablet: { fontSize: 12, lineHeight: 17 },
    eventLineupTier: { color: palette.primary, fontSize: 8.5, lineHeight: 12, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 7, backgroundColor: palette.accentSoft, overflow: 'hidden' },
    eventLineupTierTablet: { fontSize: 12, lineHeight: 17, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9 },
    eventStatus: { color: palette.primary, fontSize: tablet ? 13 : 9, lineHeight: tablet ? 18 : 13, fontWeight: '800' },
    eventStatusQualified: { color: palette.aquaText },
    fairNote: { flexDirection: 'row', alignItems: 'flex-start', gap: tablet ? 13 : 10, padding: tablet ? 19 : 14, borderRadius: tablet ? 20 : 16, backgroundColor: palette.aquaSoft },
    fairNoteText: { flex: 1, color: palette.aquaText, fontSize: tablet ? 14 : 10, lineHeight: tablet ? 20 : 15, fontWeight: '600' },
    pressed: { opacity: 0.74, transform: [{ scale: 0.99 }] },
  });
}
