import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import type { AiDifficulty } from '../../domain/poker/aiProfiles';
import { SIT_AND_GO_BLIND_SPEEDS, SIT_AND_GO_INITIAL_BIG_BLIND, SIT_AND_GO_PLAYER_COUNT_OPTIONS, type SitAndGoBlindSpeed, type SitAndGoPlayerCount } from '../../domain/poker/tournament';
import { tablePlayerCountOptionsForDifficulty, type TablePace, type TablePlayerCount } from '../../domain/poker/multiwaySession';
import { formatChips } from '../../domain/poker/moneyFormat';
import type { PracticeSessionConfig, SessionHandTarget, StartingStackBb } from '../../domain/poker/session';
import { SESSION_HAND_TARGET_OPTIONS } from '../../domain/poker/session';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';

/** Practice stack presets: chips and big blinds travel together so the
 * player never translates between them (scope 3.11C). */
const PRACTICE_STACK_PRESETS = [
  { bb: 40, default: false },
  { bb: 100, default: true },
  { bb: 200, default: false },
] as const;

/** Tournament stack presets (scope 3.11C): 800/1,200/2,000 chips. */
const TOURNAMENT_STACK_PRESETS = [
  { bb: 40, default: false },
  { bb: 60, default: true },
  { bb: 100, default: false },
] as const;

const PRACTICE_PLAYER_OPTIONS: readonly TablePlayerCount[] = [2, 3, 6, 9];
// The tournament contract drives the seats the card offers, so the nine-seat
// option appears exactly when the domain supports it (Slice 3.11D).
const TOURNAMENT_PLAYER_OPTIONS: readonly SitAndGoPlayerCount[] = SIT_AND_GO_PLAYER_COUNT_OPTIONS;

const TABLE_PACE_OPTIONS: readonly TablePace[] = ['brisk', 'normal', 'relaxed'];

/** The shared presentation helper, localized here rather than imported from
 * the shell component. */
function difficultyLabel(difficulty: AiDifficulty, t: (key: never) => string): string {
  return t(`difficulty.${difficulty}` as never);
}

function paceLabel(pace: TablePace, t: (key: never) => string): string {
  return t(`pace.${pace}` as never);
}

export interface AiTournamentStart {
  playerCount: SitAndGoPlayerCount;
  startingStackBb: number;
  blindSpeed: SitAndGoBlindSpeed;
}

/**
 * The one compact **Play vs RiverMind AI** configuration surface (Slice
 * 3.11C): Format, Players, Difficulty, and Starting stack stay visible;
 * Coach, session length, table pace, and blind speed collapse behind the
 * Advanced disclosure. Practice and Tournament remain distinct game formats
 * that share this one presentation — changing format swaps only the controls
 * whose meaning differs and never touches an active table or checkpoint.
 */
export function AiPlayConfigurator({
  aiDifficulty,
  coachEnabled,
  onCoachChange,
  onDifficultyChange,
  onStartPractice,
  onStartTournament,
  onTablePaceChange,
  tablePace,
}: {
  aiDifficulty: AiDifficulty;
  coachEnabled: boolean;
  onCoachChange: (value: boolean) => void;
  onDifficultyChange: (difficulty: AiDifficulty) => void;
  onStartPractice: (config: PracticeSessionConfig, playerCount: TablePlayerCount) => void;
  onStartTournament: (start: AiTournamentStart) => void;
  onTablePaceChange: (pace: TablePace) => void;
  tablePace: TablePace;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);

  const [format, setFormat] = useState<'practice' | 'tournament'>('practice');
  const [practicePlayers, setPracticePlayers] = useState<TablePlayerCount>(2);
  const [tournamentPlayers, setTournamentPlayers] = useState<SitAndGoPlayerCount>(3);
  const [practiceStackBb, setPracticeStackBb] = useState(100);
  const [tournamentStackBb, setTournamentStackBb] = useState(60);
  const [practiceHandTarget, setPracticeHandTarget] = useState<SessionHandTarget>(2);
  const [blindSpeed, setBlindSpeed] = useState<SitAndGoBlindSpeed>('standard');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // A difficulty that cannot fill a ring never offers it; the seat selection
  // falls back to the largest ring the roster can seat with distinct names.
  const practiceOptions = useMemo(
    () => PRACTICE_PLAYER_OPTIONS.filter((count) => tablePlayerCountOptionsForDifficulty(aiDifficulty).includes(count)),
    [aiDifficulty],
  );
  const effectivePracticePlayers = practiceOptions.includes(practicePlayers)
    ? practicePlayers
    : practiceOptions[practiceOptions.length - 1] ?? 2;

  const playerOptions: readonly number[] = format === 'practice' ? practiceOptions : TOURNAMENT_PLAYER_OPTIONS;
  const selectedPlayers = format === 'practice' ? effectivePracticePlayers : tournamentPlayers;
  const stackPresets: ReadonlyArray<{ bb: number; default: boolean }> = format === 'practice'
    ? PRACTICE_STACK_PRESETS
    : TOURNAMENT_STACK_PRESETS;
  const selectedStackBb = format === 'practice' ? practiceStackBb : tournamentStackBb;

  const selectFormat = (next: 'practice' | 'tournament'): void => setFormat(next);
  const selectPlayerCount = (count: number): void => {
    if (format === 'practice') setPracticePlayers(count as TablePlayerCount);
    else setTournamentPlayers(count as SitAndGoPlayerCount);
  };
  const selectStack = (bb: number): void => {
    if (format === 'practice') setPracticeStackBb(bb);
    else setTournamentStackBb(bb);
  };
  const selectBlindSpeed = (speed: SitAndGoBlindSpeed): void => setBlindSpeed(speed);

  const start = (): void => {
    if (format === 'practice') {
      onStartPractice(
        { startingStackBb: selectedStackBb as StartingStackBb, handTarget: practiceHandTarget },
        effectivePracticePlayers,
      );
      return;
    }
    onStartTournament({ playerCount: tournamentPlayers, startingStackBb: selectedStackBb, blindSpeed });
  };

  const stackChips = (bb: number): string => formatChips(bb * SIT_AND_GO_INITIAL_BIG_BLIND);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons color={palette.primaryText} name="hardware-chip-outline" size={20} />
        </View>
        <Text accessibilityRole="header" style={styles.title}>{t('play.aiCard.title')}</Text>
      </View>

      <ConfigRow label={t('play.aiCard.format')}>
        <SegmentedChips
          accessibilityLabel={t('play.aiCard.format')}
          options={[
            { value: 'practice', label: t('play.aiCard.formatPractice') },
            { value: 'tournament', label: t('play.aiCard.formatTournament') },
          ]}
          onSelect={(value) => selectFormat(value as 'practice' | 'tournament')}
          selected={format}
        />
      </ConfigRow>

      <ConfigRow label={t('play.aiCard.players')}>
        <SegmentedChips
          accessibilityLabel={t('play.aiCard.players')}
          options={playerOptions.map((count) => ({ value: String(count), label: String(count) }))}
          onSelect={(value) => selectPlayerCount(Number(value))}
          selected={String(selectedPlayers)}
        />
      </ConfigRow>

      <ConfigRow label={t('play.aiCard.difficulty')}>
        <SegmentedChips
          accessibilityLabel={t('play.aiCard.difficulty')}
          options={(['friendly', 'club', 'sharp', 'elite', 'nemesis'] as const).map((difficulty) => ({
            value: difficulty,
            label: difficultyLabel(difficulty, t),
          }))}
          onSelect={(value) => onDifficultyChange(value as AiDifficulty)}
          selected={aiDifficulty}
        />
      </ConfigRow>

      <ConfigRow label={t('play.aiCard.stack')}>
        <SegmentedChips
          accessibilityLabel={t('play.aiCard.stack')}
          options={stackPresets.map((preset) => ({
            value: String(preset.bb),
            label: `${stackChips(preset.bb)} · ${t('common.bigBlinds', { count: preset.bb })}`,
          }))}
          onSelect={(value) => selectStack(Number(value))}
          selected={String(selectedStackBb)}
        />
      </ConfigRow>

      <Pressable
        accessibilityLabel={t('play.aiCard.advanced')}
        accessibilityRole="button"
        accessibilityState={{ expanded: advancedOpen }}
        onPress={() => setAdvancedOpen((open) => !open)}
        style={({ pressed }) => [styles.advancedHead, pressed && styles.pressed]}
      >
        <Ionicons color={palette.primary} name={advancedOpen ? 'chevron-up' : 'chevron-down'} size={16} />
        <Text style={styles.advancedText}>{t('play.aiCard.advanced')}</Text>
      </Pressable>
      {advancedOpen ? (
        <View style={styles.advancedBody}>
          {format === 'practice' ? (
            <>
              <View style={styles.advancedRow}>
                <Text style={styles.advancedLabel}>{t('setup.coach')}</Text>
                <Switch
                  accessibilityLabel={t('setup.coachA11y')}
                  onValueChange={onCoachChange}
                  trackColor={{ false: palette.soft, true: palette.primary }}
                  thumbColor={palette.surface}
                  value={coachEnabled}
                />
              </View>
              <ConfigRow label={t('setup.sessionLength')}>
                <SegmentedChips
                  accessibilityLabel={t('setup.sessionLength')}
                  options={SESSION_HAND_TARGET_OPTIONS.map((target) => ({
                    value: String(target),
                    label: target === 'open' ? t('setup.open') : String(target),
                  }))}
                  onSelect={(value) => setPracticeHandTarget(value === 'open' ? 'open' : Number(value) as SessionHandTarget)}
                  selected={String(practiceHandTarget)}
                />
              </ConfigRow>
              <ConfigRow label={t('pace.label')}>
                <SegmentedChips
                  accessibilityLabel={t('pace.label')}
                  options={TABLE_PACE_OPTIONS.map((pace) => ({ value: pace, label: paceLabel(pace, t) }))}
                  onSelect={(value) => onTablePaceChange(value as TablePace)}
                  selected={tablePace}
                />
              </ConfigRow>
            </>
          ) : (
            <ConfigRow label={t('play.aiCard.blindSpeed')}>
              <SegmentedChips
                accessibilityLabel={t('play.aiCard.blindSpeed')}
                options={SIT_AND_GO_BLIND_SPEEDS.map((speed) => ({ value: speed, label: t(`play.aiCard.blindSpeed.${speed}`) }))}
                onSelect={(value) => selectBlindSpeed(value as SitAndGoBlindSpeed)}
                selected={blindSpeed}
              />
            </ConfigRow>
          )}
        </View>
      ) : null}

      <Pressable
        accessibilityLabel={format === 'practice'
          ? t('play.aiCard.startPracticeA11y')
          : t('play.aiCard.startTournamentA11y')}
        accessibilityRole="button"
        onPress={start}
        style={({ pressed }) => [styles.start, pressed && styles.pressed]}
      >
        <Text style={styles.startText}>
          {format === 'practice' ? t('play.aiCard.startPractice') : t('play.aiCard.startTournament')}
        </Text>
      </Pressable>
    </View>
  );
}

/** One labelled row of compact choice chips. */
function ConfigRow({ children, label }: { children: React.ReactNode; label: string }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}

/** A horizontal row of compact selectable chips (44pt targets). */
function SegmentedChips({
  accessibilityLabel,
  onSelect,
  options,
  selected,
}: {
  accessibilityLabel: string;
  onSelect: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  selected: string;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View accessibilityLabel={accessibilityLabel} accessibilityRole="radiogroup" style={styles.chipRow}>
      {options.map((option) => {
        const active = option.value === selected;
        return (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            key={option.value}
            onPress={() => onSelect(option.value)}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipSelected,
              pressed && styles.pressed,
            ]}
          >
            <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={[styles.chipText, active && styles.chipTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    card: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
      padding: 14,
      gap: 12,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.primary,
    },
    title: { color: palette.text, fontSize: 15, fontWeight: '900' },
    row: { gap: 6 },
    rowLabel: { color: palette.muted, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      minHeight: 44,
      paddingHorizontal: 13,
      paddingVertical: 9,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.soft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipSelected: { backgroundColor: palette.primary, borderColor: palette.primary },
    chipText: { color: palette.text, fontSize: 13, fontWeight: '800' },
    chipTextSelected: { color: palette.primaryText },
    advancedHead: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    advancedText: { color: palette.primary, fontSize: 13, fontWeight: '800' },
    advancedBody: { gap: 12, paddingTop: 2 },
    advancedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    advancedLabel: { color: palette.text, fontSize: 13, fontWeight: '700' },
    start: {
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 13,
      backgroundColor: palette.primary,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    startText: { color: palette.primaryText, fontSize: 15, fontWeight: '800' },
    pressed: { opacity: 0.75 },
  });
}
