import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import {
  CHAMPIONSHIP_EVENTS,
  CHAMPIONSHIP_INVITATION_EVENTS,
  championshipCurrentEvent,
  championshipUndertowIsPending,
  championshipUndertowIsUnlocked,
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
import { useReducedMotion } from '../../hooks/useReducedMotion';

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
  const reduceMotion = useReducedMotion();
  const qualifiedCount = championshipQualifiedCount(progress);
  const currentEvent = championshipCurrentEvent(progress);
  const complete = championshipIsComplete(progress);
  const invitationUnlocked = championshipInvitationIsUnlocked(progress);
  const invitationComplete = championshipInvitationIsComplete(progress);
  const invitationPending = invitationUnlocked && !invitationComplete;
  // A revealed-but-unconquered Undertow is still the journey's current goal;
  // the map must not read "tour complete" while the hidden chain is open.
  const undertowPending = championshipUndertowIsPending(progress);
  const nextGoalPending = invitationPending || undertowPending;
  /** The invitation table's stack, quoted in chips like every other amount. */
  const invitationStartingChips = formatChips(
    SIT_AND_GO_STRUCTURES[currentEvent.structureId].startingStackBb * SIT_AND_GO_INITIAL_BIG_BLIND,
  );
  // The invitation chain reveals in order: The River Below after the Final,
  // The Undertow only after The River Below is won. Locked invitations are
  // never listed, so their names cannot leak (scope 3.11D).
  const displayedEvents: readonly ChampionshipEvent[] = [
    ...CHAMPIONSHIP_EVENTS,
    ...CHAMPIONSHIP_INVITATION_EVENTS.filter((invitation, index) => (
      index === 0 ? invitationUnlocked : championshipUndertowIsUnlocked(progress)
    )),
  ];
  const circuitPodiums = progress.events.filter((event) => event.bestPlace <= 2).length;
  const circuitWins = progress.events.filter((event) => event.bestPlace === 1).length;

  return (
    <Modal animationType={reduceMotion ? 'none' : "slide"} onRequestClose={recordVisible ? onCloseRecord : onClose} visible={visible}>
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
                  <Ionicons color={palette.primary} name={nextGoalPending ? 'mail-open-outline' : complete ? 'trophy' : 'trophy-outline'} size={24} />
                </View>
                <View style={styles.progressCopy}>
                  <Text style={styles.progressEyebrow}>{t(nextGoalPending ? 'championship.invitation' : complete ? 'championship.tourComplete' : 'championship.currentStop')}</Text>
                  {!complete || undertowPending ? (
                    <Text numberOfLines={1} style={styles.progressTitle}>
                      {championshipEventText(currentEvent, 'title', t)}
                    </Text>
                  ) : null}
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
                  : undertowPending
                    ? t('championship.undertowNote', { stack: invitationStartingChips })
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
                    testID={`championship.event.${event.id}`}
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
                      <Text style={styles.eventLineupText}>{t('championship.lineupA11y', { lineup: lineupLabel })}</Text>
                      <Text style={[styles.eventStatus, qualified && styles.eventStatusQualified]}>{status}</Text>
                    </View>
                    {unlocked && <Ionicons color={active || qualified ? palette.primary : palette.muted} name="chevron-forward" size={18} />}
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.fairNote}>
              <Ionicons color={palette.muted} name="shield-checkmark-outline" size={19} />
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
    iconButton: { width: tablet ? 48 : 44, height: tablet ? 48 : 44, alignItems: 'center', justifyContent: 'center', borderRadius: tablet ? 15 : 14, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    headerCopy: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 8 },
    headerSpacer: { width: tablet ? 48 : 44 },
    eyebrow: { color: palette.primary, fontSize: tablet ? 12 : 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: tablet ? 21 : 16, lineHeight: tablet ? 27 : 21, fontWeight: '700', marginTop: 2 },
    content: { padding: 18, paddingBottom: 30, gap: 14 },
    contentTablet: { width: '100%', maxWidth: 860, alignSelf: 'center', paddingHorizontal: 28, paddingTop: 24, paddingBottom: 44, gap: 18 },
    progressCard: { gap: tablet ? 17 : 13, padding: tablet ? 23 : 18, borderRadius: tablet ? 25 : 21, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
    progressTopRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    trophyIcon: { width: tablet ? 54 : 44, height: tablet ? 54 : 44, alignItems: 'center', justifyContent: 'center', borderRadius: tablet ? 17 : 14, backgroundColor: palette.accentSoft },
    progressCopy: { flex: 1, minWidth: 0, gap: 2 },
    progressEyebrow: { color: palette.muted, fontSize: tablet ? 12 : 10.5, lineHeight: tablet ? 17 : 14, fontWeight: '800', letterSpacing: 0.55, textTransform: 'uppercase' },
    progressTitle: { color: palette.text, fontSize: tablet ? 16 : 13, lineHeight: tablet ? 21 : 17, fontWeight: '800' },
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
    circuitGoalLabel: { color: palette.muted, fontSize: tablet ? 11 : 10, lineHeight: tablet ? 15 : 14 },
    eventList: { gap: tablet ? 13 : 9 },
    eventCard: { minHeight: tablet ? 150 : 118, flexDirection: 'row', alignItems: 'center', gap: tablet ? 15 : 11, padding: tablet ? 20 : 14, borderRadius: tablet ? 22 : 18, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    eventCardActive: { borderColor: palette.primary },
    eventCardQualified: { borderColor: palette.aqua },
    eventCardLocked: { opacity: 0.54, backgroundColor: palette.soft },
    eventNumber: { width: tablet ? 44 : 34, height: tablet ? 44 : 34, alignItems: 'center', justifyContent: 'center', borderRadius: tablet ? 14 : 11, backgroundColor: palette.soft },
    eventNumberActive: { backgroundColor: palette.primary },
    eventNumberText: { color: palette.muted, fontSize: tablet ? 17 : 13, fontWeight: '800' },
    eventNumberTextActive: { color: palette.primaryText },
    eventCopy: { flex: 1, minWidth: 0, gap: 3 },
    eventTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
    eventTitle: { flexShrink: 1, color: palette.text, fontSize: tablet ? 18 : 14, lineHeight: tablet ? 24 : 18, fontWeight: '800' },
    savedBadge: { color: palette.aquaText, fontSize: tablet ? 10 : 9.5, lineHeight: tablet ? 14 : 13, fontWeight: '900', letterSpacing: 0.5, paddingHorizontal: tablet ? 9 : 7, paddingVertical: tablet ? 4 : 3, borderRadius: tablet ? 8 : 7, backgroundColor: palette.aquaSoft, overflow: 'hidden' },
    eventDescription: { color: palette.muted, fontSize: tablet ? 14 : 11, lineHeight: tablet ? 20 : 16 },
    eventLineupText: { color: palette.muted, fontSize: tablet ? 14 : 10.5, lineHeight: tablet ? 20 : 15, fontWeight: '600', marginTop: 2 },
    eventStatus: { color: palette.primary, fontSize: tablet ? 13 : 11, lineHeight: tablet ? 18 : 15, fontWeight: '800' },
    eventStatusQualified: { color: palette.aquaText },
    fairNote: { flexDirection: 'row', alignItems: 'flex-start', gap: tablet ? 11 : 9, paddingHorizontal: tablet ? 4 : 2, paddingVertical: tablet ? 8 : 6 },
    fairNoteText: { flex: 1, color: palette.muted, fontSize: tablet ? 14 : 11, lineHeight: tablet ? 20 : 16, fontWeight: '600' },
    pressed: { opacity: 0.74, transform: [{ scale: 0.99 }] },
  });
}
