import { useMemo } from 'react';
import { Pressable, ScrollView, Switch, Text, View, useWindowDimensions } from 'react-native';

import type { AiDifficulty } from '../../../domain/poker/aiProfiles';
import {
  CASH_GAME_BIG_BLIND,
  SESSION_HAND_TARGET_OPTIONS,
  STARTING_STACK_OPTIONS,
  type PracticeSessionConfig,
} from '../../../domain/poker/session';
import {
  tablePlayerCountOptionsForDifficulty,
  type TablePace,
  type TablePlayerCount,
} from '../../../domain/poker/multiwaySession';
import { formatChips } from '../../../domain/poker/moneyFormat';
import { useLocalization } from '../../../localization';
import { useAppTheme } from '../../../theme';
import { SELECTABLE_AI_DIFFICULTIES, aiDifficultyPickerLayout } from '../aiGameModePolicy';
import { TABLE_PACE_OPTIONS, difficultyLabel, paceLabel } from '../playPresentation';
import { BackHeader, PrimaryButton, difficultySummary, localizedSessionLength } from '../shellChrome';
import { createStyles } from '../shellStyles';

export function GameSetupScreen({
  aiDifficulty,
  coachEnabled,
  onBack,
  onAiDifficultyChange,
  onCoachEnabledChange,
  onSessionConfigChange,
  onPlayerCountChange,
  onStart,
  onTablePaceChange,
  playerCount,
  sessionConfig,
  tablePace,
}: {
  aiDifficulty: AiDifficulty;
  coachEnabled: boolean;
  onBack: () => void;
  onAiDifficultyChange: (difficulty: AiDifficulty) => void;
  onCoachEnabledChange: (value: boolean) => void;
  onSessionConfigChange: (config: PracticeSessionConfig) => void;
  onPlayerCountChange: (count: TablePlayerCount) => void;
  onStart: () => void;
  onTablePaceChange: (pace: TablePace) => void;
  playerCount: TablePlayerCount;
  sessionConfig: PracticeSessionConfig;
  tablePace: TablePace;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const { width } = useWindowDimensions();
  const pickerLayout = aiDifficultyPickerLayout(width);
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.screenContent,
          pickerLayout.tablet && styles.screenContentTablet,
          styles.setupScreenContent,
        ]}
        showsVerticalScrollIndicator={false}
        style={styles.setupScroll}
      >
        <BackHeader large={pickerLayout.tablet} title={t('setup.title')} onBack={onBack} />
        <View style={[styles.surface, styles.setupGroup, pickerLayout.tablet && styles.setupSurfaceTablet]}>
          <View>
            <Text style={[styles.fieldLabel, pickerLayout.tablet && styles.setupFieldLabelTablet]}>{t('setup.tableSize')}</Text>
            <View style={styles.difficultyOptions}>
              {tablePlayerCountOptionsForDifficulty(aiDifficulty).map((count) => {
                const selected = playerCount === count;
                return (
                  <Pressable
                    accessibilityLabel={t('setup.totalPlayersA11y', { count })}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={count}
                    onPress={() => onPlayerCountChange(count)}
                    style={[
                      styles.difficultyOption,
                      pickerLayout.tablet && styles.difficultyOptionTablet,
                      selected && styles.difficultyOptionSelected,
                    ]}
                  >
                    <Text style={[
                      styles.difficultyLabel,
                      pickerLayout.tablet && styles.setupDifficultyLabelTablet,
                      selected && styles.difficultyLabelSelected,
                    ]}>{t('common.players', { count })}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View>
            <Text style={[styles.fieldLabel, pickerLayout.tablet && styles.setupFieldLabelTablet]}>{t('setup.startingStack')}</Text>
            <View style={styles.difficultyOptions}>
              {STARTING_STACK_OPTIONS.map((stackBb) => {
                const selected = sessionConfig.startingStackBb === stackBb;
                const stackChips = formatChips(stackBb * CASH_GAME_BIG_BLIND);
                return (
                  <Pressable
                    accessibilityLabel={t('setup.startingStackA11y', { stack: stackChips })}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={stackBb}
                    onPress={() => onSessionConfigChange({ ...sessionConfig, startingStackBb: stackBb })}
                    style={[
                      styles.difficultyOption,
                      pickerLayout.tablet && styles.difficultyOptionTablet,
                      selected && styles.difficultyOptionSelected,
                    ]}
                  >
                    <Text style={[
                      styles.difficultyLabel,
                      pickerLayout.tablet && styles.setupDifficultyLabelTablet,
                      selected && styles.difficultyLabelSelected,
                    ]}>{stackChips}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View>
            <Text style={[styles.fieldLabel, pickerLayout.tablet && styles.setupFieldLabelTablet]}>{t('setup.sessionLength')}</Text>
            <View style={styles.difficultyOptions}>
              {SESSION_HAND_TARGET_OPTIONS.map((target) => {
                const selected = sessionConfig.handTarget === target;
                const label = target === 'open' ? t('setup.open') : String(target);
                return (
                  <Pressable
                    accessibilityLabel={localizedSessionLength(target, t)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={target}
                    onPress={() => onSessionConfigChange({ ...sessionConfig, handTarget: target })}
                    style={[
                      styles.difficultyOption,
                      pickerLayout.tablet && styles.difficultyOptionTablet,
                      selected && styles.difficultyOptionSelected,
                    ]}
                  >
                    <Text style={[
                      styles.difficultyLabel,
                      pickerLayout.tablet && styles.setupDifficultyLabelTablet,
                      selected && styles.difficultyLabelSelected,
                    ]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.setupNotice, pickerLayout.tablet && styles.setupNoticeTablet]}>{t('setup.sessionLengthDescription')}</Text>
          </View>
        </View>
        <View style={[styles.surface, styles.setupGroup, pickerLayout.tablet && styles.setupSurfaceTablet]}>
          <View style={styles.spaceBetween}>
            <View style={styles.flexShrink}>
              <Text style={[styles.surfaceTitle, pickerLayout.tablet && styles.setupSurfaceTitleTablet]}>{t('setup.coach')}</Text>
              <Text style={[styles.secondaryText, pickerLayout.tablet && styles.setupSecondaryTextTablet]}>{t('setup.coachDescription')}</Text>
            </View>
            <Switch
              accessibilityLabel={t('setup.coachA11y')}
              onValueChange={onCoachEnabledChange}
              trackColor={{ false: palette.soft, true: palette.primary }}
              thumbColor={palette.surface}
              value={coachEnabled}
            />
          </View>
          <View style={[styles.preferenceDivider, pickerLayout.tablet && styles.preferenceDividerTablet]} />
          <AiDifficultyRadioGroup
            difficulty={aiDifficulty}
            label={t('setup.difficulty')}
            onChange={onAiDifficultyChange}
          />
          <View style={[styles.preferenceDivider, pickerLayout.tablet && styles.preferenceDividerTablet]} />
          <Text style={[styles.fieldLabel, {
            fontSize: pickerLayout.labelFontSize,
            lineHeight: pickerLayout.labelLineHeight,
          }]}>{t('pace.label')}</Text>
          <View
            accessibilityLabel={t('pace.label')}
            accessibilityRole="radiogroup"
            style={[styles.difficultyOptions, pickerLayout.tablet && styles.difficultyOptionsTablet]}
          >
            {TABLE_PACE_OPTIONS.map((pace) => {
              const selected = pace === tablePace;
              return (
                <Pressable
                  accessibilityLabel={paceLabel(pace, t)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={pace}
                  onPress={() => onTablePaceChange(pace)}
                  style={[
                    styles.difficultyOption,
                    { minHeight: pickerLayout.optionMinHeight },
                    pickerLayout.tablet && styles.difficultyOptionTablet,
                    selected && styles.difficultyOptionSelected,
                  ]}
                >
                  <Text style={[
                    styles.difficultyLabel,
                    {
                      fontSize: pickerLayout.labelFontSize,
                      lineHeight: pickerLayout.labelLineHeight,
                    },
                    selected && styles.difficultyLabelSelected,
                  ]}>{paceLabel(pace, t)}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[
            styles.setupNotice,
            {
              fontSize: pickerLayout.summaryFontSize,
              lineHeight: pickerLayout.summaryLineHeight,
            },
          ]}>{t('pace.description')}</Text>
        </View>
      </ScrollView>
      <View style={[styles.setupActionBar, pickerLayout.tablet && styles.setupActionBarTablet]}>
        <PrimaryButton label={t('setup.startGame')} onPress={onStart} />
      </View>
    </View>
  );
}

export function AiDifficultyRadioGroup({
  difficulty,
  label,
  onChange,
}: {
  difficulty: AiDifficulty;
  label: string;
  onChange: (difficulty: AiDifficulty) => void;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const { width } = useWindowDimensions();
  const layout = aiDifficultyPickerLayout(width);
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View>
      <Text style={[styles.fieldLabel, {
        fontSize: layout.labelFontSize,
        lineHeight: layout.labelLineHeight,
      }]}>{label}</Text>
      <View
        accessibilityLabel={label}
        accessibilityRole="radiogroup"
        style={[styles.difficultyOptions, layout.tablet && styles.difficultyOptionsTablet]}
      >
        {SELECTABLE_AI_DIFFICULTIES.map((option) => {
          const selected = option === difficulty;
          const summary = difficultySummary(option, t);
          return (
            <Pressable
              accessibilityHint={summary}
              accessibilityLabel={difficultyLabel(option, t)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={option}
              onPress={() => onChange(option)}
              style={[
                styles.difficultyOption,
                { minHeight: layout.optionMinHeight },
                layout.tablet && styles.difficultyOptionTablet,
                selected && styles.difficultyOptionSelected,
              ]}
            >
              <Text
                style={[
                  styles.difficultyLabel,
                  { fontSize: layout.labelFontSize, lineHeight: layout.labelLineHeight },
                  selected && styles.difficultyLabelSelected,
                ]}
              >
                {difficultyLabel(option, t)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[
        styles.setupNotice,
        { fontSize: layout.summaryFontSize, lineHeight: layout.summaryLineHeight },
      ]}>{difficultySummary(difficulty, t)}</Text>
    </View>
  );
}
