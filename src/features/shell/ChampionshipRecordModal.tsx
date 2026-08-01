import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  CHAMPIONSHIP_EVENTS,
  championshipAchievements,
  championshipCurrentEvent,
  championshipIsComplete,
  championshipStats,
  type ChampionshipAchievementId,
  type ChampionshipProgress,
} from '../../domain/poker/championship';
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
};

function ordinal(place: number): string {
  const remainder = place % 100;
  if (remainder >= 11 && remainder <= 13) return `${place}th`;
  if (place % 10 === 1) return `${place}st`;
  if (place % 10 === 2) return `${place}nd`;
  if (place % 10 === 3) return `${place}rd`;
  return `${place}th`;
}

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
  const styles = useMemo(() => createStyles(palette), [palette]);
  const stats = championshipStats(progress);
  const achievements = championshipAchievements(progress);
  const unlockedCount = achievements.filter((achievement) => achievement.unlocked).length;
  const currentEvent = championshipCurrentEvent(progress);
  const complete = championshipIsComplete(progress);

  return (
    <View accessibilityViewIsModal style={styles.screen}>
          <View style={styles.header}>
            <Pressable accessibilityLabel="Back from Championship record" accessibilityRole="button" onPress={onClose} style={styles.iconButton}>
              <Ionicons color={palette.text} name="arrow-back" size={20} />
            </Pressable>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>Saved on this device</Text>
              <Text accessibilityRole="header" style={styles.title}>Championship record</Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.metrics}>
              <RecordMetric label="Runs" value={stats.totalRuns} />
              <RecordMetric label="Stops cleared" value={`${stats.qualifiedEvents}/${CHAMPIONSHIP_EVENTS.length}`} />
              <RecordMetric label="Best finish" value={stats.bestPlace === null ? '—' : ordinal(stats.bestPlace)} />
              <RecordMetric label="Badges" value={`${unlockedCount}/${achievements.length}`} />
            </View>

            <View style={styles.nextCard}>
              <View style={styles.nextIcon}>
                <Ionicons color={palette.primary} name={complete ? 'trophy-outline' : 'navigate-outline'} size={21} />
              </View>
              <View style={styles.nextCopy}>
                <Text style={styles.nextLabel}>{complete ? 'Journey complete' : 'Next goal'}</Text>
                <Text style={styles.nextTitle}>{complete ? 'Replay any stop' : currentEvent.title}</Text>
                <Text style={styles.nextDescription}>
                  {complete
                    ? 'All five events remain open, and your best finishes stay on the record.'
                    : `Finish ${ordinal(currentEvent.qualifyingPlace)} or better to move forward.`}
                </Text>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>Milestones</Text>
                <Text style={styles.sectionTitle}>Achievements</Text>
              </View>
              <Text style={styles.sectionCount}>{unlockedCount}/{achievements.length}</Text>
            </View>

            <View style={styles.achievementList}>
              {achievements.map((achievement) => (
                <View
                  accessibilityLabel={`${achievement.title}. ${achievement.unlocked ? 'Unlocked' : 'Locked'}. ${achievement.description}`}
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
                      <Text style={styles.achievementTitle}>{achievement.title}</Text>
                      {achievement.unlocked && <Text style={styles.unlockedBadge}>UNLOCKED</Text>}
                    </View>
                    <Text style={styles.achievementDescription}>{achievement.description}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={styles.runMixCard}>
              <Text style={styles.runMixTitle}>Table experience</Text>
              <View style={styles.runMixRow}>
                <Text style={styles.runMixLabel}>Three-player runs</Text>
                <Text style={styles.runMixValue}>{stats.threePlayerRuns}</Text>
              </View>
              <View style={styles.runMixDivider} />
              <View style={styles.runMixRow}>
                <Text style={styles.runMixLabel}>Six-player runs</Text>
                <Text style={styles.runMixValue}>{stats.sixPlayerRuns}</Text>
              </View>
            </View>

            <Text style={styles.privacyNote}>
              This is a personal practice record, not a global ranking. It stays on this device and is removed with saved history.
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
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
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
    content: { padding: 18, paddingBottom: 32, gap: 16 },
    metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
    metric: { width: '48.5%', minHeight: 84, justifyContent: 'space-between', padding: 14, borderRadius: 17, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    metricValue: { color: palette.text, fontSize: 23, fontWeight: '800' },
    metricLabel: { color: palette.muted, fontSize: 10, lineHeight: 14 },
    nextCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 15, borderRadius: 18, backgroundColor: palette.accentSoft },
    nextIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.surface },
    nextCopy: { flex: 1, gap: 3 },
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
    achievementCopy: { flex: 1, gap: 4 },
    achievementTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    achievementTitle: { color: palette.text, fontSize: 13, fontWeight: '800' },
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
