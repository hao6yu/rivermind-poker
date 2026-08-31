import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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
import { type ThemePalette, useAppTheme } from '../../theme';
import { ModalSafeArea } from '../learn/ModalSafeArea';

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
  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <ModalSafeArea>
        <ChampionshipRecordView onClose={onClose} progress={progress} />
      </ModalSafeArea>
    </Modal>
  );
}

export function ChampionshipRecordView({
  onClose,
  progress,
}: ChampionshipRecordViewProps) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
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
              <Ionicons color={palette.text} name="arrow-back" size={20} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{t('championship.record.saved')}</Text>
              <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>{t('championship.record.title')}</Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.metrics}>
              <RecordMetric label={t('championship.record.runs')} value={stats.totalRuns} />
              <RecordMetric label={t('championship.record.stops')} value={`${stats.qualifiedEvents}/${CHAMPIONSHIP_EVENTS.length}`} />
              <RecordMetric label={t('championship.record.best')} value={stats.bestPlace === null ? '—' : t('summary.placeNumber', { place: stats.bestPlace })} />
              <RecordMetric label={t('championship.record.badges')} value={`${unlockedCount}/${achievements.length}`} />
            </View>

            <View style={styles.nextCard}>
              <View style={styles.nextIcon}>
                <Ionicons color={palette.primary} name={nextGoalPending ? 'mail-open-outline' : complete ? 'trophy-outline' : 'navigate-outline'} size={21} />
              </View>
              <View style={styles.nextCopy}>
                <Text style={styles.nextLabel}>{t(nextGoalPending ? 'championship.invitation' : complete ? 'championship.record.complete' : 'championship.record.nextGoal')}</Text>
                <Text numberOfLines={2} style={styles.nextTitle}>{nextGoalPending || !complete ? championshipEventText(currentEvent, 'title', t) : t('championship.record.replay')}</Text>
                <Text style={styles.nextDescription}>
                  {nextGoalPending
                    ? t(undertowPending ? 'championship.undertowNote' : 'championship.invitationNote', { stack: invitationStartingChips })
                    : complete
                    ? t('championship.record.completeDetail')
                    : t('championship.record.goalDetail', { place: t('summary.placeNumber', { place: currentEvent.qualifyingPlace }) })}
                </Text>
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
                      <Ionicons
                        color={achievement.unlocked ? palette.primaryText : palette.muted}
                        name={achievement.unlocked ? achievementIcons[achievement.id] : 'lock-closed-outline'}
                        size={19}
                      />
                    </View>
                    <View style={styles.achievementCopy}>
                      <View style={styles.achievementTitleRow}>
                        <Text numberOfLines={2} style={styles.achievementTitle}>{copy.title}</Text>
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

function RecordMetric({ label, value }: { label: string; value: number | string }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.metric}>
      <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={styles.metricValue}>{value}</Text>
      <Text numberOfLines={2} style={styles.metricLabel}>{label}</Text>
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
    content: { padding: 18, paddingBottom: 32, gap: 16 },
    metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
    metric: { width: '48.5%', minHeight: 84, justifyContent: 'space-between', padding: 14, borderRadius: 17, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    metricValue: { color: palette.text, fontSize: 23, fontWeight: '800' },
    metricLabel: { color: palette.muted, fontSize: 10, lineHeight: 14 },
    nextCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 15, borderRadius: 18, backgroundColor: palette.accentSoft },
    nextIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.surface },
    nextCopy: { flex: 1, minWidth: 0, gap: 3 },
    nextLabel: { color: palette.primary, fontSize: 9, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
    nextTitle: { color: palette.text, fontSize: 15, fontWeight: '800' },
    nextDescription: { color: palette.muted, fontSize: 10, lineHeight: 15 },
    sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 2 },
    sectionEyebrow: { color: palette.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
    sectionTitle: { color: palette.text, fontSize: 18, fontWeight: '800', marginTop: 2 },
    sectionCount: { color: palette.primary, fontSize: 12, fontWeight: '800' },
    achievementList: { gap: 8 },
    achievementCard: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: 17, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.aqua },
    achievementCardLocked: { borderColor: palette.border },
    achievementIcon: { width: 39, height: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.soft },
    achievementIconUnlocked: { backgroundColor: palette.primary },
    achievementCopy: { flex: 1, minWidth: 0, gap: 4 },
    achievementTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    achievementTitle: { flexShrink: 1, color: palette.text, fontSize: 13, lineHeight: 17, fontWeight: '800' },
    achievementDescription: { color: palette.muted, fontSize: 10, lineHeight: 14 },
    unlockedBadge: { color: palette.aquaText, fontSize: 7, fontWeight: '900', letterSpacing: 0.5, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: palette.aquaSoft, overflow: 'hidden' },
    runMixCard: { gap: 11, padding: 15, borderRadius: 18, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    runMixTitle: { color: palette.text, fontSize: 13, fontWeight: '800' },
    runMixRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    runMixLabel: { color: palette.muted, fontSize: 11 },
    runMixValue: { color: palette.text, fontSize: 12, fontWeight: '800' },
    runMixDivider: { height: StyleSheet.hairlineWidth, backgroundColor: palette.border },
    privacyNote: { color: palette.muted, fontSize: 9, lineHeight: 14, textAlign: 'center', paddingHorizontal: 12 },
  });
}
