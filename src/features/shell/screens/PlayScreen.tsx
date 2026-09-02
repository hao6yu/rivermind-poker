import { useMemo } from 'react';
import { View, useWindowDimensions } from 'react-native';

import type { ChampionshipCheckpoint, ChampionshipProgress } from '../../../domain/poker/championship';
import {
  dailyChallengeDate,
  dailyChallengeDisplayDate,
  type DailyChallengeCheckpoint,
} from '../../../domain/poker/dailyChallenge';
import type { TablePace, TablePlayerCount } from '../../../domain/poker/multiwaySession';
import type { PracticeSessionConfig } from '../../../domain/poker/session';
import { useLocalization } from '../../../localization';
import type { DailyChallengeProgress } from '../../../services/dailyChallengeProgress';
import type { ActiveMultiplayerRoomRecord } from '../../../services/multiplayerRecovery';
import { useAppTheme } from '../../../theme';
import { MultiplayerEntryCard } from '../../multiplayer/MultiplayerEntryCard';
import { MultiplayerFlowModal } from '../../multiplayer/MultiplayerFlowModal';
import type { LiveTableOrientationControl } from '../../table/useTableOrientation';
import { resolveLocalAiDifficulty } from '../aiGameModePolicy';
import { AiPlayConfigurator, type AiTournamentStart } from '../AiPlayConfigurator';
import { ChampionshipEntryCard } from '../ChampionshipEntryCard';
import { playGroupTitle } from '../playNavigation';
import { difficultyLabel } from '../playPresentation';
import { MenuRow, PlayGroup, ScreenHeader, ScreenScroll, localizedOrdinal, type MultiplayerLaunch, type ProfileIdentity, type Translator } from '../shellChrome';
import { createStyles } from '../shellStyles';
import { useAppTheme as _useAppTheme } from '../../../theme';
import type { CoachFocusArea } from '../../../domain/poker/types';
import type { AiDifficulty } from '../../../domain/poker/aiProfiles';
import type { MultiplayerFlowMode } from '../../multiplayer/multiplayerUx';
import type { SessionHandRecord } from '../../table/sessionModels';

export function PlayScreen({
  activeMultiplayerRoom,
  championshipCheckpoint,
  championshipProgress,
  coachEnabled,
  dailyChallengeDate,
  dailyCheckpoint,
  dailyProgress,
  isMultiplayerLaunchCurrent,
  onDailyChallenge,
  onChampionship,
  onCoachEnabledChange,
  onMultiplayerClose,
  onMultiplayerCreate,
  onMultiplayerJoin,
  onMultiplayerLivePlayChange,
  onMultiplayerPracticeFocus,
  onMultiplayerRecoveryChange,
  onMultiplayerResume,
  onOpenChampionshipRecord,
  onOpenProfile,
  onOpenSetup,
  onOpenScenario,
  onSitAndGoDifficultyChange,
  onStartPractice,
  onStartTournament,
  onTablePaceChange,
  sitAndGoDifficulty,
  multiplayerLaunch,
  profileIdentity,
  tableOrientation,
  tablePace,
}: {
  activeMultiplayerRoom: ActiveMultiplayerRoomRecord | null;
  championshipCheckpoint: ChampionshipCheckpoint | null;
  championshipProgress: ChampionshipProgress;
  coachEnabled: boolean;
  dailyChallengeDate: string;
  dailyCheckpoint: DailyChallengeCheckpoint | null;
  dailyProgress: DailyChallengeProgress | null;
  isMultiplayerLaunchCurrent: (launchId: number) => boolean;
  onDailyChallenge: () => void;
  onChampionship: () => void;
  onCoachEnabledChange: (value: boolean) => void;
  onMultiplayerClose: () => void;
  onMultiplayerCreate: () => void;
  onMultiplayerJoin: () => void;
  onMultiplayerLivePlayChange: (active: boolean) => void;
  onMultiplayerPracticeFocus: (focus: Exclude<CoachFocusArea, 'none'>) => void;
  onMultiplayerRecoveryChange: (record: ActiveMultiplayerRoomRecord | null) => void;
  onMultiplayerResume: () => void;
  onOpenChampionshipRecord: () => void;
  onOpenProfile: () => void;
  onOpenSetup: () => void;
  onOpenScenario: () => void;
  onSitAndGoDifficultyChange: (difficulty: AiDifficulty) => void;
  onStartPractice: (config: PracticeSessionConfig, playerCount: TablePlayerCount) => void;
  onStartTournament: (start: AiTournamentStart) => void;
  onTablePaceChange: (pace: TablePace) => void;
  sitAndGoDifficulty: AiDifficulty;
  multiplayerLaunch: MultiplayerLaunch | null;
  profileIdentity: ProfileIdentity;
  tableOrientation: LiveTableOrientationControl;
  tablePace: TablePace;
}) {
  const { palette } = useAppTheme();
  const { language, t } = useLocalization();
  const { width } = useWindowDimensions();
  const tablet = width >= 700;
  const styles = useMemo(() => createStyles(palette), [palette]);
  const gamesBand = playGroupTitle('games');
  const setupBand = playGroupTitle('setup');
  return (
    <>
      <ScreenScroll compact tablet={tablet}>
        <ScreenHeader
          eyebrow={t('play.eyebrow')}
          identity={profileIdentity}
          title={t('play.title')}
          onProfile={onOpenProfile}
        />
        {/* Slice 3.11C order: Play together, Championship, AI configurator,
            Daily Challenge, then training/custom behind a quiet disclosure. */}
        <MultiplayerEntryCard
          onCreate={onMultiplayerCreate}
          onJoin={onMultiplayerJoin}
          onResume={activeMultiplayerRoom ? onMultiplayerResume : undefined}
        />
        <ChampionshipEntryCard
          activeEvent={championshipCheckpoint !== null}
          onOpen={onChampionship}
          progress={championshipProgress}
        />
        <AiPlayConfigurator
          aiDifficulty={sitAndGoDifficulty}
          coachEnabled={coachEnabled}
          onCoachChange={onCoachEnabledChange}
          onDifficultyChange={onSitAndGoDifficultyChange}
          onStartPractice={onStartPractice}
          onStartTournament={onStartTournament}
          onTablePaceChange={onTablePaceChange}
          tablePace={tablePace}
        />
        <PlayGroup defaultOpen={gamesBand.startsOpen} label={t(gamesBand.titleKey)}>
          <View style={styles.flatList}>
            <MenuRow
              badge={t('play.fixedAiBadge', {
                difficulty: difficultyLabel(resolveLocalAiDifficulty({ mode: 'daily_challenge' }), t),
              })}
              compact
              icon="today-outline"
              label={t('home.dailyChallenge')}
              description={dailyCheckpoint
                ? t('play.savedHandCoachingOff', { hand: dailyCheckpoint.tournament.nextHandNumber })
                : dailyProgress
                  ? t('play.dailyResult', {
                    attempts: dailyProgress.attempts,
                    place: localizedOrdinal(dailyProgress.bestPlace, language),
                    score: dailyProgress.bestScore,
                  })
                  : t('play.dailyNew', { date: dailyChallengeDisplayDate(dailyChallengeDate, language) })}
              flat
              onPress={onDailyChallenge}
            />
          </View>
        </PlayGroup>
        <PlayGroup defaultOpen={setupBand.startsOpen} label={t(setupBand.titleKey)}>
          <View style={styles.flatList}>
            <MenuRow
              compact
              icon="hardware-chip-outline"
              label={t('play.customGame')}
              description={t('play.customGameDescription')}
              flat
              onPress={onOpenSetup}
            />
            <MenuRow
              compact
              icon="locate-outline"
              label={t('play.scenarioTraining')}
              description={t('play.scenarioDescription')}
              flat
              onPress={onOpenScenario}
            />
          </View>
        </PlayGroup>
      </ScreenScroll>
      <MultiplayerFlowModal
        initialMode={multiplayerLaunch?.initialMode ?? 'create'}
        initialRoomCode={multiplayerLaunch?.initialRoomCode}
        isLaunchCurrent={multiplayerLaunch
          ? () => isMultiplayerLaunchCurrent(multiplayerLaunch.id)
          : undefined}
        key={multiplayerLaunch?.id ?? 'closed-multiplayer'}
        onClose={onMultiplayerClose}
        onLivePlayChange={onMultiplayerLivePlayChange}
        onPracticeFocus={onMultiplayerPracticeFocus}
        onRecoveryRecordChange={onMultiplayerRecoveryChange}
        resumeRecord={multiplayerLaunch?.resumeRecord}
        tableOrientation={tableOrientation}
        visible={multiplayerLaunch !== null}
      />
    </>
  );
}
