import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useMemo } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import {
  CHAMPIONSHIP_EVENTS,
  championshipAchievements,
  championshipCurrentEvent,
  championshipIsComplete,
  championshipInvitationIsComplete,
  championshipInvitationIsUnlocked,
  championshipStats,
  championshipUndertowIsPending,
  type ChampionshipAchievementId,
  type ChampionshipProgress,
} from '../../domain/poker/championship';
import { formatChips } from '../../domain/poker/moneyFormat';
import { SIT_AND_GO_INITIAL_BIG_BLIND, SIT_AND_GO_STRUCTURES } from '../../domain/poker/tournament';
import { championshipAchievementAccessibilityLabel, championshipAchievementDisplay, championshipEventText } from '../../localization/championship';
import { useLocalization } from '../../localization';
import { championshipPalette as palette } from '../../themePalette';
import { TYPOGRAPHY } from '../../theme/designTokens';
import { ChampionshipVenuePreview } from './ChampionshipVenuePreview';
import { ModalSafeArea } from '../learn/ModalSafeArea';
import { useReducedMotion } from '../../hooks/useReducedMotion';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface ChampionshipRecordModalProps {
  onClose: () => void;
  progress: ChampionshipProgress;
  visible: boolean;
}

interface ChampionshipRecordViewProps {
  onClose: () => void;
  progress: ChampionshipProgress;
}

const achievementIcons: Record<ChampionshipAchievementId, IconName> = {
  first_run: 'flag-outline',
  first_qualification: 'navigate-outline',
  full_table: 'people-outline',
  five_runs: 'repeat-outline',
  masters_qualifier: 'ribbon-outline',
  rivermind_champion: 'trophy-outline',
  below_conqueror: 'flame-outline',
  undertow_conqueror: 'water-outline',
};

export function ChampionshipRecordModal({
  onClose,
  progress,
  visible,
}: ChampionshipRecordModalProps) {
  const reduceMotion = useReducedMotion();
  return (
    <Modal supportedOrientations={['portrait', 'landscape-left', 'landscape-right']} animationType={reduceMotion ? 'none' : "slide"} onRequestClose={onClose} visible={visible}>
      <ModalSafeArea backgroundColor={palette.background}>
        {visible && <StatusBar style="light" />}
        <ChampionshipRecordView onClose={onClose} progress={progress} />
      </ModalSafeArea>
    </Modal>
  );
}

export function ChampionshipRecordView({
  onClose,
  progress,
}: ChampionshipRecordViewProps) {
  const { t } = useLocalization();
  const { width, fontScale } = useWindowDimensions();
  const wide = width >= 700 && fontScale < 1.5;
  const styles = useMemo(() => createStyles(wide), [wide]);
  const stats = championshipStats(progress);
  const achievements = championshipAchievements(progress);
  const unlockedCount = achievements.filter((achievement) => achievement.unlocked).length;
  const currentEvent = championshipCurrentEvent(progress);
  const complete = championshipIsComplete(progress);
  const invitationPending = championshipInvitationIsUnlocked(progress)
    && !championshipInvitationIsComplete(progress);
  // A revealed-but-unconquered Undertow is still the journey's current goal:
  // the record must not read "complete" while the hidden chain is open.
  const undertowPending = championshipUndertowIsPending(progress);
  const nextGoalPending = invitationPending || undertowPending;
  /** The invitation table's stack, quoted in chips like every other amount. */
  const invitationStartingChips = formatChips(
    SIT_AND_GO_STRUCTURES[currentEvent.structureId].startingStackBb * SIT_AND_GO_INITIAL_BIG_BLIND,
  );

  return (
    <View accessibilityViewIsModal style={styles.screen}>
          <View style={styles.header}>
            <Pressable accessibilityLabel={t('championship.record.back')} accessibilityRole="button" onPress={onClose} style={styles.iconButton}>
              <Ionicons accessible={false} color={palette.text} name="arrow-back" size={20} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{t('championship.record.saved')}</Text>
              <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>{t('championship.record.title')}</Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.metrics}>
              <RecordMetric wide={wide} icon="flag-outline" label={t('championship.record.runs')} value={stats.totalRuns} />
              <RecordMetric wide={wide} icon="navigate-outline" label={t('championship.record.stops')} value={`${stats.qualifiedEvents}/${CHAMPIONSHIP_EVENTS.length}`} />
              <RecordMetric wide={wide} icon="podium-outline" label={t('championship.record.best')} value={stats.bestPlace === null ? '—' : t('summary.placeNumber', { place: stats.bestPlace })} />
              <RecordMetric wide={wide} icon="ribbon-outline" label={t('championship.record.badges')} value={`${unlockedCount}/${achievements.length}`} />
            </View>

            <View style={styles.nextCard}>
              {wide && <View style={styles.venue}><ChampionshipVenuePreview selection={currentEvent.id} /></View>}
              <View style={styles.nextBody}>
                <View style={styles.nextIcon}>
                  <Ionicons accessible={false} color={palette.primary} name={nextGoalPending ? 'mail-open-outline' : complete ? 'trophy-outline' : 'navigate-outline'} size={21} />
                </View>
                <View style={styles.nextCopy}>
                  <Text style={styles.nextLabel}>{t(nextGoalPending ? 'championship.invitation' : complete ? 'championship.record.complete' : 'championship.record.nextGoal')}</Text>
                  <Text style={styles.nextTitle}>{nextGoalPending || !complete ? championshipEventText(currentEvent, 'title', t) : t('championship.record.replay')}</Text>
                  <Text style={styles.nextDescription}>
                    {nextGoalPending
                      ? t(undertowPending ? 'championship.undertowNote' : 'championship.invitationNote', { stack: invitationStartingChips })
                      : complete
                      ? t('championship.record.completeDetail')
                      : t('championship.record.goalDetail', { place: t('summary.placeNumber', { place: currentEvent.qualifyingPlace }) })}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>{t('championship.record.milestones')}</Text>
                <Text style={styles.sectionTitle}>{t('championship.record.achievements')}</Text>
              </View>
              <Text style={styles.sectionCount}>{unlockedCount}/{achievements.length}</Text>
            </View>

            <View style={styles.achievementList}>
              {achievements.map((achievement) => {
                // Hidden-aware display copy and accessibility label: a hidden
                // achievement (The Undertow before it unlocks) shows only the
                // neutral placeholder in BOTH paths.
                const copy = championshipAchievementDisplay(achievement, t);
                const accessibilityLabel = championshipAchievementAccessibilityLabel(achievement, t);
                return (
                  <View
                    accessibilityLabel={accessibilityLabel}
                    key={achievement.id}
                    style={[styles.achievementCard, !achievement.unlocked && styles.achievementCardLocked]}
                  >
                    <View style={[styles.achievementIcon, achievement.unlocked && styles.achievementIconUnlocked]}>
                      <Ionicons accessible={false}
                        color={achievement.unlocked ? palette.primaryText : palette.muted}
                        name={achievement.hidden ? 'help-outline' : achievementIcons[achievement.id]}
                        size={24}
                      />
                      {!achievement.unlocked && <View style={styles.medalLock}><Ionicons accessible={false} name="lock-closed" color={palette.muted} size={10} /></View>}
                    </View>
                    <View style={styles.achievementCopy}>
                      <View style={styles.achievementTitleRow}>
                        <Text style={styles.achievementTitle}>{copy.title}</Text>
                        {achievement.unlocked && <Text style={styles.unlockedBadge}>{t('championship.record.unlocked')}</Text>}
                      </View>
                      <Text style={styles.achievementDescription}>{copy.description}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <View style={styles.runMixCard}>
              <Text style={styles.runMixTitle}>{t('championship.record.tableExperience')}</Text>
              <View style={styles.runMixRow}>
                <Text style={styles.runMixLabel}>{t('championship.record.threePlayer')}</Text>
                <Text style={styles.runMixValue}>{stats.threePlayerRuns}</Text>
              </View>
              <View style={styles.runMixDivider} />
              <View style={styles.runMixRow}>
                <Text style={styles.runMixLabel}>{t('championship.record.sixPlayer')}</Text>
                <Text style={styles.runMixValue}>{stats.sixPlayerRuns}</Text>
              </View>
              <View style={styles.runMixDivider} />
              <View style={styles.runMixRow}>
                <Text style={styles.runMixLabel}>{t('championship.record.ninePlayer')}</Text>
                <Text style={styles.runMixValue}>{stats.ninePlayerRuns}</Text>
              </View>
            </View>

            <Text style={styles.privacyNote}>
              {t('championship.record.privacy')}
            </Text>
          </ScrollView>
    </View>
  );
}

function RecordMetric({ label, value, icon, wide }: { label: string; value: number | string; icon: IconName; wide: boolean }) {
  const styles = useMemo(() => createStyles(wide), [wide]);
  return (
    <View style={styles.metric}>
      <View style={styles.metricTop}>
        <Ionicons accessible={false} name={icon} color={palette.primary} size={20} />
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={styles.metricValue}>{value}</Text>
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function createStyles(wide: boolean) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
    iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    headerCopy: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 8 },
    headerSpacer: { width: 44 },
    eyebrow: { color: palette.primary, ...TYPOGRAPHY.micro, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    title: { color: palette.text, ...TYPOGRAPHY.sectionTitle, fontWeight: '700', marginTop: 4 },
    content: { padding: 16, paddingBottom: 32, gap: 16, width: '100%', maxWidth: 1200, alignSelf: 'center' },
    metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    metric: { width: wide ? '23%' : '46%', flexGrow: 1, minHeight: 96, justifyContent: 'space-between', gap: 8, padding: 16, borderRadius: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    metricTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    metricValue: { flexShrink: 1, color: palette.primary, ...TYPOGRAPHY.display, fontWeight: '800' },
    metricLabel: { color: palette.muted, ...TYPOGRAPHY.caption },
    nextCard: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 12, borderRadius: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.primary },
    venue: { width: '32%' },
    nextBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8 },
    nextIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.goldOverlay },
    nextCopy: { flex: 1, minWidth: 0, gap: 8 },
    nextLabel: { color: palette.primary, ...TYPOGRAPHY.micro, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
    nextTitle: { color: palette.text, ...TYPOGRAPHY.pageTitle, fontWeight: '800' },
    nextDescription: { color: palette.muted, ...TYPOGRAPHY.body },
    sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 4 },
    sectionEyebrow: { color: palette.primary, ...TYPOGRAPHY.micro, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
    sectionTitle: { color: palette.text, ...TYPOGRAPHY.pageTitle, fontWeight: '800', marginTop: 4 },
    sectionCount: { color: palette.primary, ...TYPOGRAPHY.body, fontWeight: '800' },
    achievementList: { gap: 12, flexDirection: 'row', flexWrap: 'wrap' },
    achievementCard: { width: wide ? '48%' : '100%', flexGrow: 1, minHeight: 100, flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16, borderRadius: 16, backgroundColor: palette.goldOverlay, borderWidth: 1, borderColor: palette.primary },
    achievementCardLocked: { backgroundColor: palette.surface, borderColor: palette.border },
    achievementIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: palette.soft, borderWidth: 1, borderColor: palette.border },
    achievementIconUnlocked: { backgroundColor: palette.primary, borderColor: palette.primary },
    medalLock: { position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    achievementCopy: { flex: 1, minWidth: 0, gap: 8 },
    achievementTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    achievementTitle: { flexShrink: 1, color: palette.text, ...TYPOGRAPHY.bodyLarge, fontWeight: '800' },
    achievementDescription: { color: palette.muted, ...TYPOGRAPHY.caption },
    unlockedBadge: { color: palette.primary, ...TYPOGRAPHY.micro, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: palette.surface, overflow: 'hidden' },
    runMixCard: { gap: 12, padding: 16, borderRadius: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    runMixTitle: { color: palette.primary, ...TYPOGRAPHY.bodyLarge, fontWeight: '800' },
    runMixRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    runMixLabel: { color: palette.muted, ...TYPOGRAPHY.caption, flexShrink: 1 },
    runMixValue: { color: palette.text, ...TYPOGRAPHY.body, fontWeight: '800' },
    runMixDivider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.border },
    privacyNote: { color: palette.muted, ...TYPOGRAPHY.micro, textAlign: 'center', paddingHorizontal: 12 },
  });
}
