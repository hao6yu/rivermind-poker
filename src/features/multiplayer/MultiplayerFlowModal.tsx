import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  PixelRatio,
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AI_DIFFICULTY_OPTIONS } from '../../domain/poker/aiProfiles';
import { formatChips } from '../../domain/poker/moneyFormat';
import {
  multiplayerSeatStatusBadge,
  multiplayerSettledCountdownCopy,
  multiplayerStalledBetweenHands,
} from './multiplayerLifecycleUi';
import { MultiplayerActionPanel } from './multiplayerSettledControls';
import { useMultiplayerSeatLiveness } from './useMultiplayerSeatLiveness';
import {
  multiplayerPlaqueVisualTreatment,
  resolveMultiplayerPlaqueRender,
} from './multiplayerPlaqueLayout';
import type { MultiwayActionRecord } from '../../domain/poker/multiway';
import type { CoachFocusArea, Street } from '../../domain/poker/types';
import {
  type MultiplayerPublicTransition,
  type MultiplayerViewerProjection,
} from '../../domain/multiplayer/contracts';
import { buildMultiplayerSessionSummary } from '../../domain/multiplayer/sessionSummary';
import { type MessageKey, useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  createMultiplayerTable,
  joinMultiplayerTable,
  loadMultiplayerHandHistory,
  MultiplayerRequestError,
  sendMultiplayerCommand,
  sendMultiplayerTableMoment,
  subscribeToMultiplayerTable,
  syncMultiplayerTable,
  type MultiplayerClientCommand,
} from '../../services/multiplayer';
import type { TableMomentEnvelope } from '../../domain/multiplayer/tableMoments';
import type { TableMomentReactionId } from '../../domain/multiplayer/tableMoments';
import { TableMomentLanesView } from './TableMomentLanesView';
import { TableAllInFlashView } from './TableAllInFlashView';
import {
  admitAllInMomentTriggers,
  detectAllInMoments,
  type AllInMomentEnvelope,
  type AllInMomentTrigger,
} from './allInMoment';
import { buildPublicPlayerRecordSnapshot, type PublicPlayerRecordSnapshot } from '../../domain/multiplayer/playerRecordSnapshot';
import { loadPlayStatistics } from '../../services/playStatistics';
import { PlayStatisticsCard } from '../profile/PlayStatisticsCard';
import { playStatisticsRecordTitle } from '../profile/playStatisticsPresentation';
import { publicPlayerRecordStatistics } from './playerRecordSnapshot';
import { TableMomentTrayView } from './TableMomentTrayView';
import type { TableMomentPreferences } from './tableMomentPreferences';
import {
  tableMomentSendOutcome,
  type TableMomentSendOutcome,
} from './tableMomentSendOutcome';
import {
  loadTableMomentPreferences,
  saveTableMomentPreferences,
} from './tableMomentPreferencesStore';
import {
  loadHumanAvatar,
  loadPlayerDisplayName,
} from '../../services/playerProfile';
import { PlayingCard } from '../../components/PlayingCard';
import { ModalBackdrop } from '../../components/ModalBackdrop';
import {
  ActionBubbleText,
  useActionBubbleAnnouncement,
} from '../../components/ActionBubbleText';
import { AiAvatar } from '../../components/AiAvatar';
import { resolveMeasuredTableLayout, type MultiwayLayoutRect } from '../table/multiwayTableLayout';
import { multiwayAiIdentityForName } from '../../domain/poker/multiwayAiProfiles';
import { buildMultiplayerTableStats } from './multiplayerTableStats';
import type { PlayStatistics } from '../../domain/stats/playStatistics';
import { AiPlayerProfile } from '../../components/AiPlayerProfile';
import { HumanAvatar } from '../../components/HumanAvatar';
import { ModalSafeArea } from '../learn/ModalSafeArea';
import { BetSizingModal } from '../table/BetSizingModal';
import { TableActivityFeed } from '../table/TableActivityFeed';
import { SharedTableBoard } from '../table/SharedTableBoard';
import {
  projectMultiwayTableActivity,
  projectTableMomentActivity,
} from '../table/tableActivity';
import { tableActivityLayout } from '../table/tableActivityLayout';
import { sharedTableVisualDensity, type SharedTableCardVariant } from '../table/tableVisualDensity';
import { TableOrientationControl } from '../table/TableOrientationControl';
import {
  LIVE_TABLE_SUPPORTED_ORIENTATIONS,
  type LiveTableOrientationControl,
} from '../table/useTableOrientation';
import { HandReplayModal } from '../table/HandReplayModal';
import { localizedStreet } from '../table/localizedGameplay';
import { SessionHistoryModal } from '../table/SessionHistoryModal';
import type { MultiwaySessionHandRecord } from '../table/sessionModels';
import {
  buildMultiplayerActionBubblePresentation,
  buildMultiplayerResultPresentation,
  multiplayerActionSeatLabel,
  multiplayerSeatRole,
  multiplayerSeatActionLabel,
  multiplayerShowsCenterTurnStatus,
  type MultiplayerActionBubblePresentation,
  type MultiplayerResultPresentation,
  type MultiplayerSeatRole,
} from './multiplayerGamePresentation';
import {
  defaultMultiplayerDraft,
  isValidMultiplayerDisplayName,
  isValidMultiplayerRoomCode,
  MULTIPLAYER_COMPACT_GAME_HORIZONTAL_PADDING,
  MULTIPLAYER_COMPACT_LOBBY_HORIZONTAL_PADDING,
  MULTIPLAYER_GAME_SHELL_MAX_WIDTH,
  MULTIPLAYER_GAME_TABLE_MAX_WIDTH,
  MULTIPLAYER_LOBBY_SHELL_MAX_WIDTH,
  MULTIPLAYER_LOBBY_TABLE_MAX_WIDTH,
  MULTIPLAYER_WIDE_GAME_HORIZONTAL_PADDING,
  MULTIPLAYER_WIDE_LOBBY_HORIZONTAL_PADDING,
  MULTIPLAYER_COMPACT_GAME_SEAT_HEIGHT,
  MULTIPLAYER_TABLET_COMPACT_GAME_SEAT_HEIGHT,
  MULTIPLAYER_WIDE_GAME_SEAT_HEIGHT,
  MULTIPLAYER_NINE_LANDSCAPE_GAME_SEAT_HEIGHT,
  multiplayerGameLaneBounds,
  multiplayerGameSeatAnchor,
  multiplayerGameTableMinHeight,
  multiplayerLobbySeatAnchor,
  multiplayerNineSeatPhonePortraitAnchor,
  multiplayerNineSeatPotInHeader,
  multiplayerCompactLiveTableBudget,
  multiplayerAiRulesPresentation,
  multiplayerSeatFootprintWidth,
  multiplayerSeatHorizontalAlignment,
  multiplayerSeatIsTopRow,
  multiplayerSeatLayoutForWidth,
  multiplayerUsesTabletSeatReadability,
  multiplayerTableWidthForScreen,
  multiplayerSeatOptions,
  multiplayerSessionOptions,
  multiplayerStackOptions,
  multiplayerTimerOptions,
  normalizeMultiplayerRoomCode,
  type MultiplayerFlowMode,
  type MultiplayerLobbySeat,
  type MultiplayerSeatCount,
  type MultiplayerTableDraft,
} from './multiplayerUx';
import {
  canStartMultiplayerSnapshot,
  multiplayerLobbySeats,
} from './multiplayerLobbyState';
import { privateTableDisplayName, privateTableTitle } from './privateTableSetup';
import {
  acceptMultiplayerSnapshot,
  createMultiplayerAsyncScopeGate,
  createMultiplayerCommandGate,
  createMultiplayerSnapshotSyncCoordinator,
  createMultiplayerTimeoutAttemptGate,
  multiplayerSnapshotSessionChanged,
} from './multiplayerSnapshotFlow';
import { canSubmitMultiplayerAction } from './multiplayerActionEligibility';
import { multiplayerFlowEscapeRoute } from './multiplayerFlowEscape';
import { resolveMultiplayerMeasuredBubbleLayout } from './multiplayerBubbleLayout';
import {
  MultiplayerReadOnlyTurnNotice,
  multiplayerReadOnlyOverlayPolicy,
} from './multiplayerReadOnlyOverlay';
import { useGameplayFeedback } from '../../services/GameplayFeedbackProvider';
import { buildMultiplayerInviteUrlIfAvailable } from '../../services/multiplayerInvite';
import {
  departMultiplayerRoomForInviteReplacement,
  isTerminalMultiplayerRecoveryError,
} from '../../services/multiplayerInviteRouting';
import {
  clearActiveMultiplayerRoom,
  saveActiveMultiplayerRoom,
  type ActiveMultiplayerRoomRecord,
} from '../../services/multiplayerRecovery';
import {
  buildMultiplayerActionFrames,
  mergeMultiplayerActionFrames,
  multiplayerActionControlsEnabled,
  pendingMultiplayerActionFrames,
  multiplayerPresentedStreet,
  multiplayerPresentedPot,
  multiplayerPresentedTurnPlayerId,
  type MultiplayerActionFrame,
  type MultiplayerPresentationTransition,
} from './multiplayerActionQueue';
import {
  advanceMultiplayerPresentationReadiness,
  advanceMultiplayerRealtimeFeedback,
  initialMultiplayerPresentationReadinessState,
  initialMultiplayerRealtimeFeedbackState,
  isLiveMultiplayerActionFrame,
  multiplayerActionFeedbackDelayMs,
  multiplayerActionFeedbackCue,
  multiplayerFeedbackPlanKey,
  multiplayerLatestLiveActionTransitionForHand,
  multiplayerLatestLiveTransitionForHand,
  multiplayerPresentationTransitionFromEnvelope,
  multiplayerRealtimeSyncPolicy,
  planMultiplayerFeedbackWhenReady,
  retainMultiplayerBoardFeedbackEvent,
  multiplayerPresentationLifecycleBoundary,
  multiplayerShouldCaptureLivePresentation,
  multiplayerResultFeedbackEventId,
  multiplayerResultFeedbackKind,
  multiplayerTimerWarningEventId,
  multiplayerTransitionIsCurrentFreshDeal,
  multiplayerTransitionMatchesHandTail,
  multiplayerVisibleTurnSeconds,
  type MultiplayerPresentationReadinessEvent,
  type MultiplayerTransportFeedbackEmission,
} from './multiplayerFeedback';
import { MultiplayerSessionSummaryModal } from './MultiplayerSessionSummaryModal';
import { multiplayerArchivesToSessionHands } from './multiplayerArchivePresentation';
import { localizedMultiplayerErrorKey } from './multiplayerErrorPresentation';
import { resumeMultiplayerProjectionForFlow } from './multiplayerResumeFlow';
import {
  type AvatarReference,
  resolveRoomAvatars,
  signedAvatarAccessor,
} from '../../services/avatarResolver';
import { avatarFileDeleter } from '../../services/avatarCleanup';
import {
  applyAvatarVisibility,
  avatarVisibility,
  isAvatarHidden,
} from '../../domain/avatarVisibility';
import { humanAvatarDisplay } from '../../domain/avatar';
import {
  DEFAULT_HUMAN_AVATAR,
  humanAvatarOrDefault,
  type HumanAvatarReference,
  type HumanAvatarSnapshot,
} from '../../domain/playerProfile';
import { supabase } from '../../services/supabase';

type FlowPage = MultiplayerFlowMode | 'lobby';
type MultiplayerTransportNotice = 'disconnect' | 'restore' | null;
const MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER = 1.4;

function multiplayerActionIsAllIn(
  hand: NonNullable<MultiplayerViewerProjection['hand']>,
  action: MultiwayActionRecord,
  historyIndex = hand.history.indexOf(action),
): boolean {
  if (action.type === 'fold' || action.type === 'check') return false;
  const context = action.decisionContext;
  if (context) {
    const chipsPaid = action.type === 'raise'
      ? Math.max(0, action.amount - context.playerStreetBetBefore)
      : action.amount;
    return chipsPaid >= context.playerStackBefore;
  }
  const laterActionByPlayer = hand.history
    .slice(Math.max(0, historyIndex) + 1)
    .some((candidate) => candidate.playerId === action.playerId);
  return !laterActionByPlayer && hand.players[action.playerId]?.allIn === true;
}

/**
 * Builds the member's bounded room-private Play record from the same
 * Profile-statistics read, or null when the read fails — a failed read never
 * publishes a synthesized record (scope 3.11E).
 */
async function buildViewerPlayRecord(displayName: string, revision: number): Promise<PublicPlayerRecordSnapshot | null> {
  try {
    const statistics = await loadPlayStatistics({ includePrivate: true });
    return buildPublicPlayerRecordSnapshot({
      displayName,
      publishedAtMs: Date.now(),
      revision,
      statistics,
    });
  } catch {
    return null;
  }
}

export function MultiplayerFlowModal({
  initialMode,
  initialRoomCode,
  isLaunchCurrent,
  onClose,
  onLivePlayChange,
  onPracticeFocus,
  onRecoveryRecordChange,
  resumeRecord,
  tableOrientation,
  visible,
}: {
  initialMode: MultiplayerFlowMode;
  initialRoomCode?: string;
  isLaunchCurrent?: () => boolean;
  onClose: () => void;
  onLivePlayChange?: (active: boolean) => void;
  onPracticeFocus?: (focus: Exclude<CoachFocusArea, 'none'>) => void;
  onRecoveryRecordChange?: (record: ActiveMultiplayerRoomRecord | null) => void;
  resumeRecord?: ActiveMultiplayerRoomRecord;
  tableOrientation: LiveTableOrientationControl;
  visible: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const { play: playFeedback, stopGameplayFeedback } = useGameplayFeedback();
  const { height, width } = useWindowDimensions();
  const wide = multiplayerSeatLayoutForWidth(width) === 'wide';
  const tablet = multiplayerUsesTabletSeatReadability(width, height);
  const styles = useMemo(() => createStyles(palette, wide), [palette, wide]);
  const [page, setPage] = useState<FlowPage>(initialMode);
  const [draft, setDraft] = useState<MultiplayerTableDraft>(defaultMultiplayerDraft);
  const [roomCode, setRoomCode] = useState('');
  const [lobby, setLobby] = useState<MultiplayerViewerProjection | null>(null);
  const [presentationTransitions, setPresentationTransitions] = useState<MultiplayerPresentationTransition[]>([]);
  // Bounded stream of table-moment envelopes for the current room. The lanes
  // view deduplicates and expires them; moments are never persisted anywhere
  // on the device beyond this in-memory presentation buffer.
  const [momentEnvelopes, setMomentEnvelopes] = useState<TableMomentEnvelope[]>([]);
  const [allInFlashes, setAllInFlashes] = useState<AllInMomentTrigger[]>([]);
  const presentedAllInKeys = useRef(new Set<string>());
  const enqueueAllInPresentation = useCallback((envelope: AllInMomentEnvelope) => {
    const allInTriggers = detectAllInMoments({
      envelope,
      presentedKeys: presentedAllInKeys.current,
    });
    if (allInTriggers.length === 0) return;
    setAllInFlashes((current) => {
      const { admitted, presented } = admitAllInMomentTriggers(current, allInTriggers);
      // Only admitted triggers count as presented: a burst beyond the queue
      // cap keeps its keys unmarked so a redelivery can still present them.
      for (const trigger of allInTriggers) {
        if (presented.has(trigger.key)) presentedAllInKeys.current.add(trigger.key);
      }
      return admitted;
    });
  }, []);
  const [presentationEpoch, setPresentationEpoch] = useState(0);
  const [presentationReady, setPresentationReady] = useState(true);
  const [transportNotice, setTransportNotice] = useState<MultiplayerTransportNotice>(null);
  const [busy, setBusy] = useState(false);
  const asyncScope = useRef(createMultiplayerAsyncScopeGate());
  const syncCoordinator = useRef(createMultiplayerSnapshotSyncCoordinator());
  const commandGate = useRef(createMultiplayerCommandGate());
  // Shared with the game table's refresh publishes (scope 3.11E).
  const publishedRecordRevision = useRef(0);
  const activeCommand = useRef<{
    release: () => boolean;
    roomId: string;
    version: number;
  } | null>(null);
  const lobbyRef = useRef<MultiplayerViewerProjection | null>(null);
  const realtimeFeedback = useRef(initialMultiplayerRealtimeFeedbackState);
  const presentationReadiness = useRef(initialMultiplayerPresentationReadinessState);
  const transportNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeCallback = useRef(onClose);
  const launchCurrentCallback = useRef(isLaunchCurrent);
  const recoveryChangeCallback = useRef(onRecoveryRecordChange);
  closeCallback.current = onClose;
  launchCurrentCallback.current = isLaunchCurrent;
  recoveryChangeCallback.current = onRecoveryRecordChange;

  const persistRecoverySnapshot = useCallback((
    snapshot: MultiplayerViewerProjection,
    knownRoomCode = snapshot.roomCode,
  ) => {
    const record = saveActiveMultiplayerRoom(snapshot, knownRoomCode);
    recoveryChangeCallback.current?.(record);
    return record;
  }, []);

  const flowScopeIsCurrent = useCallback((token: number) => (
    asyncScope.current.isCurrent(token)
    && (launchCurrentCallback.current?.() ?? true)
  ), []);

  const showTransportNotice = useCallback((notice: Exclude<MultiplayerTransportNotice, null>) => {
    if (transportNoticeTimer.current) clearTimeout(transportNoticeTimer.current);
    transportNoticeTimer.current = null;
    setTransportNotice(notice);
    if (notice === 'restore') {
      transportNoticeTimer.current = setTimeout(() => {
        transportNoticeTimer.current = null;
        setTransportNotice(null);
      }, 2_400);
    }
  }, []);

  const applyPresentationReadinessEvent = useCallback((
    event: MultiplayerPresentationReadinessEvent,
  ): MultiplayerTransportFeedbackEmission | null => {
    const next = advanceMultiplayerPresentationReadiness(
      presentationReadiness.current,
      event,
    );
    presentationReadiness.current = next.state;
    setPresentationReady(next.state.ready);
    return next.emission;
  }, []);

  const emitTransportFeedback = useCallback((
    roomId: string,
    emission: MultiplayerTransportFeedbackEmission,
  ) => {
    showTransportNotice(emission.cue);
    playFeedback(emission.cue, {
      eventId: `${roomId}:transport:${emission.sequence}:${emission.cue}`,
    });
  }, [playFeedback, showTransportNotice]);

  const multiplayerFeedbackScopeId = visible && page === 'lobby' && lobby
    ? lobby.roomId
    : null;

  useEffect(() => {
    if (!multiplayerFeedbackScopeId) return undefined;
    return () => {
      // Room exit owns multiplayer cleanup. Presentation-only remounts must not
      // truncate a restore that was deliberately held until foreground reseed.
      stopGameplayFeedback();
    };
  }, [multiplayerFeedbackScopeId, stopGameplayFeedback]);

  const acceptSnapshot = useCallback((
    snapshot: MultiplayerViewerProjection,
    expectedRoomId?: string,
    knownRoomCode = '',
  ) => {
    const current = lobbyRef.current;
    const next = acceptMultiplayerSnapshot(current, snapshot, {
      expectedRoomId,
      knownRoomCode,
    });
    if (multiplayerSnapshotSessionChanged(current, next)) {
      // A rematch starts hand numbering at one again. Old transition tuples
      // must never be matched against the new session's authoritative history.
      setPresentationTransitions([]);
      setPresentationEpoch((epoch) => epoch + 1);
    }
    const pendingCommand = activeCommand.current;
    if (
      next
      && pendingCommand
      && next.roomId === pendingCommand.roomId
      && next.version > pendingCommand.version
      && pendingCommand.release()
    ) {
      activeCommand.current = null;
      setBusy(false);
    }
    lobbyRef.current = next;
    setLobby(next);
    if (next) persistRecoverySnapshot(next, next.roomCode || knownRoomCode);
    return next;
  }, [persistRecoverySnapshot]);

  const rememberPresentationTransition = useCallback((input: {
    snapshot: Pick<MultiplayerViewerProjection, 'hand' | 'version'>;
    transition?: MultiplayerPublicTransition;
  } | null) => {
    if (!multiplayerShouldCaptureLivePresentation(AppState.currentState)) return;
    const entry = multiplayerPresentationTransitionFromEnvelope(input);
    if (!entry) return;
    setPresentationTransitions((current) => {
      if (current.some(({ transition }) => transition.version === entry.transition.version)) return current;
      return [...current, entry].slice(-24);
    });
  }, []);

  useEffect(() => {
    asyncScope.current.invalidate();
    syncCoordinator.current.reset();
    commandGate.current.reset();
    activeCommand.current = null;
    if (!visible) {
      // Keep retained Modal children inert while hidden. On the next open, the
      // setup reset below removes the prior room before readiness is restored.
      presentationReadiness.current = {
        deferredRestoreSequence: null,
        ready: false,
      };
      setPresentationReady(false);
      return;
    }
    presentationReadiness.current = initialMultiplayerPresentationReadinessState;
    setPresentationReady(true);
    setPage(resumeRecord ? 'lobby' : initialMode);
    setDraft({
      ...defaultMultiplayerDraft,
      playerName: privateTableDisplayName(loadPlayerDisplayName()),
      seatCount: initialMode === 'join' ? 6 : defaultMultiplayerDraft.seatCount,
    });
    setRoomCode(normalizeMultiplayerRoomCode(
      initialRoomCode ?? resumeRecord?.roomCode ?? '',
    ));
    setLobby(null);
    lobbyRef.current = null;
    setPresentationTransitions([]);
    setPresentationEpoch((current) => current + 1);
    if (transportNoticeTimer.current) clearTimeout(transportNoticeTimer.current);
    transportNoticeTimer.current = null;
    setTransportNotice(null);
    realtimeFeedback.current = initialMultiplayerRealtimeFeedbackState;
    setBusy(Boolean(resumeRecord));
  }, [initialMode, initialRoomCode, resumeRecord, visible]);

  useEffect(() => () => {
    asyncScope.current.invalidate();
    commandGate.current.reset();
    syncCoordinator.current.reset();
  }, []);

  useEffect(() => {
    if (!visible || !resumeRecord) return undefined;
    let disposed = false;
    const scopeToken = asyncScope.current.capture();
    const knownRoomCode = normalizeMultiplayerRoomCode(
      initialRoomCode ?? resumeRecord.roomCode ?? '',
    );

    const resume = async () => {
      setBusy(true);
      try {
        const snapshot = await resumeMultiplayerProjectionForFlow(
          resumeRecord.roomId,
          () => !disposed && flowScopeIsCurrent(scopeToken),
          {
            reconnect: async (current) => {
              const result = await sendMultiplayerCommand(
                current.roomId,
                current.version,
                { connection: 'online', type: 'set-connection' },
              );
              return result.snapshot ?? current;
            },
            sync: syncMultiplayerTable,
          },
        );
        if (!snapshot) return;
        const next = acceptMultiplayerSnapshot(null, snapshot, { knownRoomCode });
        if (!next) throw new MultiplayerRequestError(
          'multiplayer_invalid_response',
          'The table returned an invalid update. Try again.',
          true,
        );
        applyPresentationReadinessEvent({ type: 'inactive' });
        setRoomCode(next.roomCode || knownRoomCode);
        lobbyRef.current = next;
        setLobby(next);
        persistRecoverySnapshot(next, next.roomCode || knownRoomCode);
        setPresentationTransitions([]);
        setPresentationEpoch((current) => current + 1);
        setPage('lobby');
        setBusy(false);
      } catch (error) {
        if (disposed || !flowScopeIsCurrent(scopeToken)) return;
        setBusy(false);
        const code = error instanceof MultiplayerRequestError ? error.code : null;
        const terminal = code !== null
          && ['room_access', 'room_forbidden', 'room_not_found', 'multiplayer_update_required'].includes(code);
        if (terminal) {
          clearActiveMultiplayerRoom();
          recoveryChangeCallback.current?.(null);
        }
        Alert.alert(
          t('multiplayer.resume.errorTitle'),
          t(code === 'multiplayer_update_required'
            ? 'multiplayer.error.updateRequired'
            : terminal ? 'multiplayer.resume.expired' : 'multiplayer.resume.network'),
          [{ onPress: () => closeCallback.current(), text: t('common.done') }],
        );
      }
    };

    void resume();
    return () => { disposed = true; };
  }, [applyPresentationReadinessEvent, flowScopeIsCurrent, initialRoomCode, persistRecoverySnapshot, resumeRecord, t, visible]);

  useEffect(() => {
    if (!visible || page !== 'lobby' || !lobby?.roomId) return undefined;
    const activeRoomId = lobby.roomId;
    realtimeFeedback.current = initialMultiplayerRealtimeFeedbackState;
    syncCoordinator.current.reset();
    applyPresentationReadinessEvent({ type: 'inactive' });
    let disposed = false;
    let desiredVersion = lobby.version;
    let retryAttempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let activeSync: Promise<void> | null = null;
    let updateRequiredNotified = false;
    let reseedAfterNextSync = true;
    let transportSubscribed = false;
    let subscriptionGeneration = 0;
    let lastAppState = AppState.currentState;
    if (lastAppState !== 'active') {
      reseedAfterNextSync = true;
    }

    const scheduleRetry = () => {
      if (disposed || retryTimer || AppState.currentState !== 'active') return;
      const delayMs = Math.min(8_000, 500 * (2 ** Math.min(retryAttempt, 4)));
      retryAttempt += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        requestSync(desiredVersion);
      }, delayMs);
    };
    const requestSync = (targetVersion: number) => {
      if (disposed) return;
      desiredVersion = Math.max(desiredVersion, targetVersion);
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      const startedSubscribed = transportSubscribed;
      const startedSubscriptionGeneration = subscriptionGeneration;
      const task = syncCoordinator.current.request(
        desiredVersion,
        () => syncMultiplayerTable(activeRoomId),
        (snapshot) => {
          acceptSnapshot(snapshot, activeRoomId, roomCode);
        },
      );
      if (activeSync === task) return;
      activeSync = task;
      void task.then(
        () => {
          if (disposed || activeSync !== task) return;
          activeSync = null;
          const syncedOnCurrentSubscription = startedSubscribed
            && transportSubscribed
            && startedSubscriptionGeneration === subscriptionGeneration;
          const policy = multiplayerRealtimeSyncPolicy({
            appActive: AppState.currentState === 'active',
            reseedPending: reseedAfterNextSync,
            syncedOnCurrentSubscription,
            transportSubscribed,
          });
          if (policy.completeReseed) {
            retryAttempt = 0;
            reseedAfterNextSync = false;
            setPresentationTransitions([]);
            setPresentationEpoch((current) => current + 1);
            const deferredTransport = applyPresentationReadinessEvent({
              type: 'sync-succeeded',
            });
            if (deferredTransport) {
              emitTransportFeedback(activeRoomId, deferredTransport);
            }
          }
          if (policy.keepPolling) {
            if (transportSubscribed) requestSync(lobbyRef.current?.version ?? desiredVersion);
            else scheduleRetry();
          }
        },
        (syncError) => {
          if (disposed || activeSync !== task) return;
          activeSync = null;
          // A newer-protocol table can never be joined by this build: surface
          // the update-required result once and stop retrying instead of
          // polling forever against a room this client cannot parse.
          if (syncError instanceof MultiplayerRequestError
            && syncError.code === 'multiplayer_update_required') {
            if (!updateRequiredNotified) {
              updateRequiredNotified = true;
              showError(syncError);
            }
            return;
          }
          scheduleRetry();
        },
      );
    };

    // A fresh room must never inherit the previous room's moment or all-in
    // buffers: both presentations are per-room and per-hand.
    setMomentEnvelopes([]);
    setAllInFlashes([]);
    presentedAllInKeys.current.clear();
    const unsubscribe = subscribeToMultiplayerTable(activeRoomId, (envelope) => {
      if (lobbyRef.current?.roomId !== activeRoomId) return;
      rememberPresentationTransition(envelope);
      // The sub-900ms all-in flash fires straight from the broadcast envelope
      // (not from a later sync): detect it here, deduplicated per seat and
      // hand, so animation and sound never wait on the settlement chain.
      enqueueAllInPresentation({
        snapshot: envelope?.snapshot ?? null,
        transition: envelope?.transition ?? null,
      });
      const targetVersion = envelope?.snapshot.version ?? lobbyRef.current?.version ?? 0;
      requestSync(targetVersion);
    }, (status) => {      if (disposed) return;
      if (status === 'SUBSCRIBED') {
        if (!transportSubscribed) subscriptionGeneration += 1;
        transportSubscribed = true;
      } else {
        transportSubscribed = false;
      }
      if (status !== 'SUBSCRIBED' && AppState.currentState === 'active') {
        reseedAfterNextSync = true;
        applyPresentationReadinessEvent({ type: 'inactive' });
      }
      const feedback = advanceMultiplayerRealtimeFeedback(
        realtimeFeedback.current,
        status,
        AppState.currentState === 'active',
      );
      realtimeFeedback.current = feedback.state;
      if (feedback.cue) {
        const transport = applyPresentationReadinessEvent({
          cue: feedback.cue,
          sequence: feedback.state.sequence,
          type: 'transport',
        });
        if (transport) emitTransportFeedback(activeRoomId, transport);
      } else if (status === 'SUBSCRIBED' && !feedback.state.disconnected) {
        if (transportNoticeTimer.current) clearTimeout(transportNoticeTimer.current);
        transportNoticeTimer.current = null;
        setTransportNotice(null);
      }
      if (status === 'SUBSCRIBED') {
        retryAttempt = 0;
        requestSync(lobbyRef.current?.version ?? desiredVersion);
      } else {
        scheduleRetry();
      }
    }, (moment) => {
      if (disposed || lobbyRef.current?.roomId !== activeRoomId) return;
      // Keep a small bounded buffer for the lanes presentation; the lanes
      // view expires and deduplicates, and nothing here is ever persisted.
      setMomentEnvelopes((current) => (
        current.length >= 24 ? [...current.slice(-23), moment] : [...current, moment]
      ));
    });
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (multiplayerPresentationLifecycleBoundary(lastAppState, state)) {
        setPresentationTransitions([]);
        setMomentEnvelopes([]);
        setAllInFlashes([]);
        if (state !== 'active') {
          applyPresentationReadinessEvent({ type: 'inactive' });
          setPresentationEpoch((current) => current + 1);
        }
      }
      lastAppState = state;
      if (state !== 'active' || lobbyRef.current?.roomId !== activeRoomId) {
        if (state !== 'active') reseedAfterNextSync = true;
        return;
      }
      retryAttempt = 0;
      requestSync(lobbyRef.current.version);
    });
    // Catch updates that landed between the initial command response and the
    // Realtime channel reaching SUBSCRIBED.
    requestSync(lobby.version);
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (transportNoticeTimer.current) clearTimeout(transportNoticeTimer.current);
      transportNoticeTimer.current = null;
      appStateSubscription.remove();
      unsubscribe();
      syncCoordinator.current.reset();
    };
  }, [acceptSnapshot, applyPresentationReadinessEvent, emitTransportFeedback, enqueueAllInPresentation, lobby?.roomId, page, rememberPresentationTransition, roomCode, visible]);

  // Fill the device-local avatar registry from the room-authorized accessor so
  // each uploaded seat renders from the local cache (never a signed URL).
  // Cache-first means a cache hit is a no-op: only the first-time resolution or
  // new uploads hit the worker. The signed token and bucket path never leave
  // this effect. Re-resolving on version changes is cheap (only new uploads
  // resolve); a seat without a token simply renders from the cache or the
  // descriptor.
  useEffect(() => {
    if (!lobby?.roomId) return;
    const roomId = lobby.roomId;
    const references: AvatarReference[] = [];
    for (const seat of lobby.seats) {
      const avatar = seat.avatar;
      if (avatar && avatar.kind === 'uploaded') {
        references.push({ avatarId: avatar.avatarId, version: avatar.version });
      }
    }
    if (references.length === 0) return;
    void (async () => {
      if (!supabase) return;
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session || !data.session.access_token) return;
      // Fill the local registry from the room-authorized accessor. This persists
      // to the device cache but does not touch React state, so seats (which read
      // the registry in `HumanAvatar` during render) would keep the initials
      // fallback until something re-renders. Bump the lobby reference to force
      // that re-render — the identity surfaces pick up the resolved image —
      // without changing `lobby.version`, so the effect does not re-fire.
      // The file deleter removes a cached image superseded by a re-resolution
      // (same avatar id, fresh bytes) so the device cache never accumulates
      // unreferenced avatar files.
      const fileDeleter = await avatarFileDeleter();
      await resolveRoomAvatars(
        roomId,
        references,
        signedAvatarAccessor(data.session.access_token),
        null,
        fileDeleter ? { deleteCachedAvatarFile: (uri) => fileDeleter.deleteAvatarFile(uri) } : undefined,
      );
      setLobby((current) => (current ? { ...current } : current));
    })();
  }, [lobby?.roomId, lobby?.version]);

  const continueEnabled = isValidMultiplayerDisplayName(draft.playerName)
    && (page !== 'join' || isValidMultiplayerRoomCode(roomCode));

  const showError = (error: unknown) => {
    const key = error instanceof MultiplayerRequestError
      ? localizedMultiplayerErrorKey(error.code)
      : 'multiplayer.error.generic';
    Alert.alert(t('multiplayer.error.title'), t(key));
  };

  const abandonObsoleteRoom = (roomId: string) => {
    void departMultiplayerRoomForInviteReplacement(roomId, {
      leave: async (latestRoomId, version) => {
        await sendMultiplayerCommand(latestRoomId, version, { type: 'leave' });
      },
      sync: syncMultiplayerTable,
    });
  };

  const enterLobby = async () => {
    if (!continueEnabled || page === 'lobby' || busy) return;
    const releaseSetup = commandGate.current.tryAcquire();
    if (!releaseSetup) return;
    const scopeToken = asyncScope.current.capture();
    // Setup carries the identity the player already saved and never writes one.
    // Creating a table cannot rename the profile, and backing out of setup
    // cannot leave a name change behind either.
    const displayName = privateTableDisplayName(loadPlayerDisplayName());
    setDraft((current) => ({ ...current, playerName: displayName }));
    setBusy(true);
    try {
      const playRecord = await buildViewerPlayRecord(displayName, 1);
      publishedRecordRevision.current = playRecord?.revision ?? 0;
      const result = page === 'create'
        ? await createMultiplayerTable({
          avatar: humanAvatarOrDefault(loadHumanAvatar()),
          config: {
            aiDifficulty: draft.aiDifficulty,
            bigBlindChips: 20,
            handTarget: draft.sessionLength,
            seatCount: draft.seatCount,
            smallBlindChips: 10,
            startingStackChips: draft.startingStackChips,
            turnSeconds: draft.turnSeconds,
          },
          displayName,
          ...(playRecord ? { playRecord } : {}),
        })
        : await joinMultiplayerTable({
          avatar: humanAvatarOrDefault(loadHumanAvatar()),
          displayName,
          ...(playRecord ? { playRecord } : {}),
          roomCode: normalizeMultiplayerRoomCode(roomCode),
        });
      if (!flowScopeIsCurrent(scopeToken)) {
        // The server may have accepted create/join just as this flow closed.
        // Best-effort departure prevents an invisible human seat lingering.
        abandonObsoleteRoom(result.snapshot.roomId);
        return;
      }
      const next = { ...result.snapshot, roomCode: result.roomCode };
      applyPresentationReadinessEvent({ type: 'inactive' });
      setRoomCode(result.roomCode);
      setPresentationTransitions([]);
      lobbyRef.current = next;
      setLobby(next);
      persistRecoverySnapshot(next, result.roomCode);
      setPage('lobby');
    } catch (error) {
      if (flowScopeIsCurrent(scopeToken)) showError(error);
    } finally {
      releaseSetup();
      if (flowScopeIsCurrent(scopeToken)) setBusy(false);
    }
  };

  const sendLobbyCommand = async (command: MultiplayerClientCommand): Promise<boolean> => {
    if (!lobby || !presentationReadiness.current.ready) return false;
    const scopeToken = asyncScope.current.capture();
    const origin = lobby;
    const releaseCommand = commandGate.current.tryAcquire();
    if (!releaseCommand) return false;
    const current = lobbyRef.current?.roomId === origin.roomId
      ? lobbyRef.current
      : origin;
    if (command.type === 'action' && !canSubmitMultiplayerAction(current, command, {
      roomId: origin.roomId,
      version: origin.version,
    })) {
      releaseCommand();
      return false;
    }
    activeCommand.current = {
      release: releaseCommand,
      roomId: current.roomId,
      version: current.version,
    };
    let accepted = false;
    setBusy(true);
    try {
      const result = await sendMultiplayerCommand(current.roomId, current.version, command);
      if (!flowScopeIsCurrent(scopeToken)) return false;
      const { snapshot } = result;
      if (!snapshot || lobbyRef.current?.roomId !== current.roomId) return false;
      rememberPresentationTransition({ snapshot, transition: result.transition });
      // Realtime broadcasts do not guarantee a self-echo. Feed the accepted
      // response through the same detector so the player who shoved sees the
      // all-in flash too; the per-seat/hand key dedupes a later broadcast.
      enqueueAllInPresentation({
        snapshot,
        transition: result.transition ?? null,
      });
      acceptSnapshot(snapshot, current.roomId, current.roomCode || roomCode);
      accepted = snapshot.version > current.version;
    } catch (error) {
      if (!flowScopeIsCurrent(scopeToken)) return false;
      if (command.type === 'tick' || (error instanceof MultiplayerRequestError && error.code === 'room_stale')) {
        try {
          const snapshot = await syncMultiplayerTable(current.roomId);
          if (!flowScopeIsCurrent(scopeToken)) return false;
          acceptSnapshot(snapshot, current.roomId, current.roomCode || roomCode);
          accepted = command.type === 'tick' && snapshot.version > current.version;
        } catch {
          // The original stable error is more useful to the player.
        }
      }
      const superseded = lobbyRef.current?.roomId === current.roomId
        && lobbyRef.current.version > current.version;
      if (command.type !== 'tick' && !superseded) showError(error);
    } finally {
      if (releaseCommand() && flowScopeIsCurrent(scopeToken)) setBusy(false);
      if (activeCommand.current?.release === releaseCommand) activeCommand.current = null;
    }
    return accepted;
  };

  useMultiplayerSeatLiveness({
    enabled: visible && page === 'lobby',
    room: lobby,
    onReconnect: () => sendLobbyCommand({ connection: 'online', type: 'set-connection' }),
  });

  const activeGame = page === 'lobby' && lobby !== null && lobby.status !== 'lobby';
  useEffect(() => {
    onLivePlayChange?.(visible && activeGame);
  }, [activeGame, onLivePlayChange, visible]);
  useEffect(() => () => onLivePlayChange?.(false), [onLivePlayChange]);
  const leaveRoom = async (afterLeave: () => void) => {
    if (busy) return;
    const releaseLeave = commandGate.current.tryAcquire();
    if (!releaseLeave) return;
    const scopeToken = asyncScope.current.capture();
    const current = lobbyRef.current;
    if (!current) {
      releaseLeave();
      afterLeave();
      return;
    }
    setBusy(true);
    const finishLocalLeave = () => {
      setLobby(null);
      lobbyRef.current = null;
      setPresentationTransitions([]);
      clearActiveMultiplayerRoom();
      recoveryChangeCallback.current?.(null);
      afterLeave();
    };
    try {
      try {
        await sendMultiplayerCommand(current.roomId, current.version, { type: 'leave' });
        if (!flowScopeIsCurrent(scopeToken)) return;
      } catch (error) {
        if (!flowScopeIsCurrent(scopeToken)) return;
        if (!(error instanceof MultiplayerRequestError) || error.code !== 'room_stale') throw error;
        const latest = await syncMultiplayerTable(current.roomId);
        if (!flowScopeIsCurrent(scopeToken)) return;
        lobbyRef.current = latest;
        await sendMultiplayerCommand(latest.roomId, latest.version, { type: 'leave' });
        if (!flowScopeIsCurrent(scopeToken)) return;
      }
      finishLocalLeave();
    } catch (error) {
      if (!flowScopeIsCurrent(scopeToken)) return;
      if (isTerminalMultiplayerRecoveryError(error)) finishLocalLeave();
      else showError(error);
    } finally {
      releaseLeave();
      if (flowScopeIsCurrent(scopeToken)) setBusy(false);
    }
  };
  const closeFlowNow = () => {
    asyncScope.current.invalidate();
    commandGate.current.reset();
    activeCommand.current = null;
    setBusy(false);
    closeCallback.current();
  };
  const goBack = () => {
    if (resumeRecord && !lobbyRef.current) {
      closeFlowNow();
      return;
    }
    if (page !== 'lobby') {
      closeFlowNow();
      return;
    }
    void leaveRoom(() => setPage(initialMode));
  };
  const requestSetupClose = () => {
    if (resumeRecord && !lobbyRef.current) {
      closeFlowNow();
      return;
    }
    if (page === 'lobby') void leaveRoom(closeFlowNow);
    else closeFlowNow();
  };
  const requestGameExit = () => {
    if (!activeGame) {
      closeFlowNow();
      return;
    }
    Alert.alert(
      t('multiplayer.game.exitTitle'),
      t('multiplayer.game.exitDetail'),
      [
        { style: 'cancel', text: t('multiplayer.game.stay') },
        {
          onPress: () => { void leaveRoom(closeFlowNow); },
          style: 'destructive',
          text: t('multiplayer.game.leave'),
        },
      ],
    );
  };

  // One dismissal route for every escape affordance — hardware Back (Android),
  // the top-left Back, and the iOS VoiceOver accessibility escape — classified
  // by the pure route decision so they can never drift apart: setup closes to
  // Play without creating or mutating a room, the lobby walks the existing
  // leave-room boundary, and a live game stays behind the guarded confirmation.
  const requestFlowDismiss = () => {
    if (multiplayerFlowEscapeRoute({ activeGame, page }) === 'game-exit-confirmation') {
      requestGameExit();
      return;
    }
    requestSetupClose();
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={requestFlowDismiss}
      presentationStyle="fullScreen"
      supportedOrientations={LIVE_TABLE_SUPPORTED_ORIENTATIONS}
      visible={visible}
    >
      <ModalSafeArea>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.screen}
        >
          <View accessibilityViewIsModal onAccessibilityEscape={requestFlowDismiss} style={styles.screen}>
            {!activeGame && (
              <FlowHeader
                onBack={goBack}
                onClose={requestSetupClose}
                page={page}
              />
            )}
            <MultiplayerTransportBanner status={activeGame && !wide ? null : transportNotice} wide={wide} />
            {page === 'create' ? (
              <CreateTableForm
                busy={busy}
                draft={draft}
                enabled={continueEnabled}
                onChange={setDraft}
                onContinue={enterLobby}
                tablet={tablet}
                wide={wide}
              />
            ) : page === 'join' ? (
              <JoinTableForm
                busy={busy}
                draft={draft}
                enabled={continueEnabled}
                onChange={setDraft}
                onCodeChange={(value) => setRoomCode(normalizeMultiplayerRoomCode(value))}
                onContinue={enterLobby}
                roomCode={roomCode}
              />
            ) : (
              lobby ? lobby.status === 'lobby' ? (
                <LobbyPreview
                  busy={busy || !presentationReady}
                  height={height}
                  onCommand={sendLobbyCommand}
                  room={lobby}
                  tablet={tablet}
                  wide={wide}
                />
              ) : (
              <MultiplayerGameTable
                publishedRecordRevision={publishedRecordRevision}
                  busy={busy}
                  key={`${lobby.roomId}:${presentationEpoch}`}
                  allInFlashes={allInFlashes}
                  moments={momentEnvelopes}
                  onAllInPresented={(key) => {
                    setAllInFlashes((current) => current.filter((trigger) => trigger.key !== key));
                  }}
                  onCommand={sendLobbyCommand}
                  onExit={requestGameExit}
                  onPracticeFocus={onPracticeFocus}
                  orientation={tableOrientation}
                  presentationReady={presentationReady}
                  presentationTransitions={presentationTransitions}
                  room={lobby}
                  tablet={tablet}
                  transportNotice={!wide ? transportNotice : null}
                  wide={wide}
                />
              ) : resumeRecord ? (
                <ResumeTableLoading wide={wide} />
              ) : null
            )}
          </View>
        </KeyboardAvoidingView>
      </ModalSafeArea>
    </Modal>
  );
}

function MultiplayerTransportBanner({
  inline,
  status,
  wide,
}: {
  inline?: boolean;
  status: MultiplayerTransportNotice;
  wide: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, wide), [palette, wide]);
  const message = status === 'disconnect'
    ? t('multiplayer.transport.disconnected')
    : status === 'restore'
      ? t('multiplayer.transport.restored')
      : '';
  useActionBubbleAnnouncement(status ?? '', message);
  if (!status) return null;
  return (
    <View
      accessibilityLabel={message}
      accessibilityLiveRegion="polite"
      accessible
      pointerEvents="none"
      style={[
        styles.transportBanner,
        status === 'disconnect' ? styles.transportBannerDisconnected : styles.transportBannerRestored,
        inline && styles.transportBannerInline,
      ]}
    >
      <Ionicons
        color={status === 'disconnect' ? palette.primaryText : palette.aquaText}
        name={status === 'disconnect' ? 'cloud-offline-outline' : 'checkmark-circle-outline'}
        size={wide ? 18 : 15}
      />
      <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={inline ? 2 : 1} style={[
        styles.transportBannerText,
        status === 'restore' && styles.transportBannerTextRestored,
        inline && styles.transportBannerTextInline,
      ]}>{message}</Text>
    </View>
  );
}

function ResumeTableLoading({ wide }: { wide: boolean }) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, wide), [palette, wide]);
  return (
    <View
      accessibilityLabel={t('multiplayer.resume.loading')}
      accessibilityLiveRegion="polite"
      accessible
      style={styles.resumeLoading}
    >
      <View style={styles.resumeLoadingIcon}>
        <ActivityIndicator color={palette.primary} size={wide ? 'large' : 'small'} />
      </View>
      <Text accessibilityRole="header" style={styles.resumeLoadingTitle}>
        {t('multiplayer.resume.loading')}
      </Text>
    </View>
  );
}

function FlowHeader({
  onBack,
  onClose,
  page,
}: {
  onBack: () => void;
  onClose: () => void;
  page: FlowPage;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, false), [palette]);
  // The close (X) belongs to the lobby, where leaving means departing a room.
  // Every other setup page offers only the top-left back action — the one route
  // that returns to Play without creating or mutating a room — so the header
  // never presents a control that looks like it would abandon a table. Android
  // hardware Back and the accessibility escape arrive at the same handler.
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel={t('multiplayer.back')}
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
      >
        <Ionicons color={palette.text} name="arrow-back" size={20} />
      </Pressable>
      {page === 'lobby' ? (
        <Pressable
          accessibilityLabel={t('multiplayer.close')}
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.headerButton, styles.headerCloseButton, pressed && styles.pressed]}
        >
          <Ionicons color={palette.text} name="close" size={21} />
        </Pressable>
      ) : <View style={styles.headerButtonSpacer} />}
    </View>
  );
}

function CreateTableForm({
  busy,
  draft,
  enabled,
  onChange,
  onContinue,
  tablet,
  wide,
}: {
  busy: boolean;
  draft: MultiplayerTableDraft;
  enabled: boolean;
  onChange: (draft: MultiplayerTableDraft) => void;
  onContinue: () => void;
  tablet: boolean;
  wide: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, wide, tablet), [palette, tablet, wide]);
  const aiRules = multiplayerAiRulesPresentation(draft.aiDifficulty, draft.turnSeconds);
  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.formScroll}
      >
        <View style={styles.intro}>
          <Text accessibilityRole="header" style={styles.title}>{t('multiplayer.create.title')}</Text>
        </View>
        <View style={[styles.form, wide && styles.formWide]}>
          <View style={styles.fullWidth}>
            <IdentityRow displayName={draft.playerName} tablet={tablet} />
          </View>
          <OptionGroup
            label={t('multiplayer.create.seats')}
            onSelect={(seatCount) => onChange({ ...draft, seatCount })}
            options={multiplayerSeatOptions}
            selected={draft.seatCount}
            valueLabel={(value) => String(value)}
            optionA11yLabel={(value) => t('common.players', { count: value })}
            tablet={tablet}
            wide={wide}
          />
          <OptionGroup
            label={t('multiplayer.create.stack')}
            onSelect={(startingStackChips) => onChange({ ...draft, startingStackChips })}
            options={multiplayerStackOptions}
            selected={draft.startingStackChips}
            valueLabel={(value) => t('multiplayer.option.chips', { amount: formatChips(value) })}
            tablet={tablet}
            wide={wide}
          />
          <OptionGroup
            label={t('multiplayer.create.session')}
            onSelect={(sessionLength) => onChange({ ...draft, sessionLength })}
            options={multiplayerSessionOptions}
            selected={draft.sessionLength}
            valueLabel={(value) => value === 'open'
              ? t('multiplayer.option.open')
              : t('multiplayer.option.hands', { count: value })}
            tablet={tablet}
            wide={wide}
          />
          <OptionGroup
            label={t('multiplayer.create.timer')}
            onSelect={(turnSeconds) => onChange({ ...draft, turnSeconds })}
            options={multiplayerTimerOptions}
            selected={draft.turnSeconds}
            valueLabel={(value) => t('multiplayer.option.seconds', { count: value })}
            tablet={tablet}
            wide={wide}
          />
          <OptionGroup
            label={t('multiplayer.create.ai')}
            onSelect={(aiDifficulty) => onChange({ ...draft, aiDifficulty })}
            options={AI_DIFFICULTY_OPTIONS.map((option) => option.id)}
            selected={draft.aiDifficulty}
            valueLabel={(value) => t(`difficulty.${value}` as MessageKey)}
            tablet={tablet}
            wide={wide}
          />
          <View style={styles.noteStack}>
            {/* The chosen difficulty chip already names itself, so this line adds
                only what the chip cannot say instead of repeating it. */}
            <Text maxFontSizeMultiplier={1.5} style={styles.captionNote}>
              {t(aiRules.difficultySummaryKey as MessageKey)}
            </Text>
            <Text maxFontSizeMultiplier={1.5} style={styles.captionNote}>
              {t('multiplayer.create.coachNote')}
            </Text>
          </View>
        </View>
      </ScrollView>
      <BottomAction busy={busy} enabled={enabled} label={t('multiplayer.create.continue')} onPress={onContinue} />
    </>
  );
}

function JoinTableForm({
  busy,
  draft,
  enabled,
  onChange,
  onCodeChange,
  onContinue,
  roomCode,
}: {
  busy: boolean;
  draft: MultiplayerTableDraft;
  enabled: boolean;
  onChange: (draft: MultiplayerTableDraft) => void;
  onCodeChange: (value: string) => void;
  onContinue: () => void;
  roomCode: string;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, false), [palette]);
  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.content, styles.joinContent]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.formScroll}
      >
        <View style={styles.intro}>
          <Text accessibilityRole="header" style={styles.title}>{t('multiplayer.join.title')}</Text>
          <Text style={styles.description}>{t('multiplayer.join.description')}</Text>
        </View>
        <View style={styles.joinCard}>
          <Text style={styles.fieldLabel}>{t('multiplayer.join.code')}</Text>
          <TextInput
            accessibilityLabel={t('multiplayer.join.codeA11y')}
            autoCorrect={false}
            keyboardType="number-pad"
            maxLength={6}
            onChangeText={onCodeChange}
            placeholder={t('multiplayer.join.placeholder')}
            placeholderTextColor={palette.muted}
            returnKeyType="done"
            style={[styles.input, styles.codeInput]}
            value={roomCode}
          />
          <Text style={styles.fieldHint}>{t('multiplayer.join.hint')}</Text>
          <View style={styles.fieldDivider} />
          <IdentityRow displayName={draft.playerName} />
        </View>
      </ScrollView>
      <BottomAction busy={busy} enabled={enabled} label={t('multiplayer.join.continue')} onPress={onContinue} />
    </>
  );
}

/**
 * The one identity a private table uses: the display name saved in the profile,
 * shown read-only. Setup never edits an identity, so cancelling setup cannot
 * leave a name change behind, and there is no second "table nickname" to keep
 * in step with the profile.
 */
function IdentityRow({ displayName, tablet = false }: { displayName: string; tablet?: boolean }) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, false, tablet), [palette, tablet]);
  const [avatar] = useState<HumanAvatarReference>(() => loadHumanAvatar() ?? DEFAULT_HUMAN_AVATAR);
  return (
    <View style={styles.identityRow}>
      <HumanAvatar avatar={avatar} displayName={displayName} size={tablet ? 44 : 38} />
      <View style={styles.identityCopy}>
        <Text maxFontSizeMultiplier={1.4} numberOfLines={1} style={styles.identityName}>
          {displayName}
        </Text>
        <Text maxFontSizeMultiplier={1.5} numberOfLines={2} style={styles.identityNote}>
          {t('multiplayer.identity.note')}
        </Text>
      </View>
    </View>
  );
}

function OptionGroup<T extends string | number>({
  label,
  onSelect,
  options,
  selected,
  tablet = false,
  valueLabel,
  optionA11yLabel,
  wide = false,
}: {
  label: string;
  onSelect: (value: T) => void;
  options: readonly T[];
  selected: T;
  tablet?: boolean;
  valueLabel: (value: T) => string;
  /** Lets a compact numeric chip still say what the number means. */
  optionA11yLabel?: (value: T) => string;
  wide?: boolean;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, wide, tablet), [palette, tablet, wide]);
  return (
    <View style={styles.optionGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View accessibilityRole="radiogroup" style={styles.optionRow}>
        {options.map((option) => {
          const isSelected = option === selected;
          const optionLabel = valueLabel(option);
          return (
            <Pressable
              accessibilityLabel={optionA11yLabel ? optionA11yLabel(option) : optionLabel}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              key={String(option)}
              onPress={() => onSelect(option)}
              style={({ pressed }) => [
                styles.option,
                isSelected && styles.optionSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text
                maxFontSizeMultiplier={wide ? 1.35 : 1.25}
                numberOfLines={2}
                style={[styles.optionText, optionA11yLabel && styles.optionTextNumeric, isSelected && styles.optionTextSelected]}
              >
                {optionLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function BottomAction({
  busy = false,
  enabled,
  label,
  note,
  onPress,
}: {
  busy?: boolean;
  enabled: boolean;
  label: string;
  note?: string;
  onPress: () => void;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, false), [palette]);
  return (
    <View style={styles.bottomBar}>
      {note && <Text style={styles.bottomNote}>{note}</Text>}
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ busy, disabled: !enabled || busy }}
        disabled={!enabled || busy}
        onPress={onPress}
        style={({ pressed }) => [styles.bottomButton, (!enabled || busy) && styles.disabled, pressed && enabled && !busy && styles.pressed]}
      >
        {busy ? <ActivityIndicator color={palette.primaryText} size="small" /> : (
          <>
            <Text style={styles.bottomButtonText}>{label}</Text>
            <Ionicons color={palette.primaryText} name="arrow-forward" size={18} />
          </>
        )}
      </Pressable>
    </View>
  );
}

function LobbyPreview({
  busy,
  height,
  onCommand,
  room,
  tablet,
  wide,
}: {
  busy: boolean;
  height: number;
  onCommand: (command: MultiplayerClientCommand) => Promise<boolean>;
  room: MultiplayerViewerProjection;
  tablet: boolean;
  wide: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, wide, tablet), [palette, tablet, wide]);
  const [inviteVisible, setInviteVisible] = useState(false);
  const inviteAvailable = isValidMultiplayerRoomCode(room.roomCode);
  const seats = multiplayerLobbySeats(room, room.viewerPlayerId);
  const viewer = seats.find((seat) => seat.isViewer);
  const viewerReady = Boolean(viewer?.ready);
  // The table is named for whoever owns it, at render time, in the player's own
  // language. Nothing possessive is ever stored or sent: the room carries the
  // owner's seat identity, and each locale phrases it as it should read.
  const tableTitle = privateTableTitle(seats, t);
  const hostMode = Boolean(viewer?.isHost);
  const canStart = canStartMultiplayerSnapshot(room);
  // Slice 3.11E: the lobby felt resolves from its MEASURED width with the
  // shared bounded-aspect contract — the fixed 215–270 clamps are gone. The
  // status copy lives in the info hierarchy, never on the seat map.
  const [lobbyFeltWidth, setLobbyFeltWidth] = useState<number | null>(null);
  const lobbyOrientation = wide ? 'landscape' as const : 'portrait' as const;
  const ninePortraitPhone = room.config.seatCount === 9 && !tablet && !wide;
  const lobbyLayout = useMemo(() => {
    if (!lobbyFeltWidth) return null;
    return resolveMeasuredTableLayout({
      activityFeedMode: 'hidden',
      contentHeight: Math.round(lobbyFeltWidth / (wide ? 1.85 : 1.2)),
      contentWidth: lobbyFeltWidth,
      insets: { bottom: 0, left: 0, right: 0, top: 0 },
      orientation: lobbyOrientation,
      seatCount: room.config.seatCount,
      surface: 'lobby',
      textScale: Math.max(1, PixelRatio.getFontScale()),
    });
  }, [lobbyFeltWidth, lobbyOrientation, room.config.seatCount, wide]);
  const lobbySeatByRingIndex = new Map((lobbyLayout?.seats ?? []).map((seat) => [seat.ringIndex, seat]));
  const sessionLabel = room.config.handTarget === 'open'
    ? t('multiplayer.option.open')
    : t('multiplayer.option.hands', { count: room.config.handTarget });
  const aiRules = multiplayerAiRulesPresentation(room.config.aiDifficulty, room.config.turnSeconds);
  const aiDifficultyLabel = t(aiRules.difficultyKey as MessageKey);
  const aiDifficultySummary = t(aiRules.difficultySummaryKey as MessageKey);
  const primaryLabel = !viewerReady
    ? t('multiplayer.lobby.readyUp')
    : hostMode ? t('multiplayer.lobby.start') : t('multiplayer.lobby.cancelReady');
  const primaryEnabled = !viewerReady || !hostMode || canStart;
  const note = viewerReady && hostMode && !canStart ? t('multiplayer.lobby.startHint') : undefined;
  useEffect(() => {
    if (!inviteAvailable) setInviteVisible(false);
  }, [inviteAvailable]);

  const handlePrimary = () => {
    if (!viewerReady) {
      void onCommand({ ready: true, type: 'set-ready' });
      return;
    }
    if (!hostMode) {
      void onCommand({ ready: false, type: 'set-ready' });
      return;
    }
    if (canStart) void onCommand({ type: 'start' });
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.lobbyContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.lobbyTop, wide && styles.lobbyTopWide]}>
          <View style={styles.intro}>
            <Text accessibilityRole="header" style={styles.title}>{tableTitle}</Text>
            <Text style={styles.description}>
              {t('multiplayer.lobby.tableSummary', {
                count: room.config.seatCount,
                hands: sessionLabel,
                stack: formatChips(room.config.startingStackChips),
              })}
            </Text>
            <View
              accessible
              accessibilityLabel={`${t('multiplayer.lobby.aiRules', {
                difficulty: aiDifficultyLabel,
                seconds: aiRules.turnSeconds,
              })}. ${aiDifficultySummary}`}
              style={styles.lobbyRules}
            >
              <Ionicons color={palette.muted} name="hardware-chip-outline" size={wide || tablet ? 16 : 14} />
              <View style={styles.lobbyRulesCopy}>
                <Text style={styles.lobbyRulesTitle}>
                  {t('multiplayer.lobby.aiRules', {
                    difficulty: aiDifficultyLabel,
                    seconds: aiRules.turnSeconds,
                  })}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.codeCard}>
            <View>
              <Text style={styles.codeLabel}>{t('multiplayer.lobby.roomCode')}</Text>
              {inviteAvailable ? (
                <Text accessibilityLabel={`${t('multiplayer.lobby.roomCode')} ${room.roomCode}`} style={styles.codeValue}>
                  {room.roomCode}
                </Text>
              ) : (
                <Text accessibilityLiveRegion="polite" style={styles.codeUnavailable}>
                  {t('multiplayer.invite.unavailable')}
                </Text>
              )}
            </View>
            {inviteAvailable ? (
              <Pressable
                accessibilityLabel={t('multiplayer.lobby.share')}
                accessibilityRole="button"
                onPress={() => setInviteVisible(true)}
                style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}
              >
                <Ionicons color={palette.primary} name="share-outline" size={18} />
                <Text style={styles.shareText}>{t('multiplayer.lobby.share')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <View
          onLayout={(event) => {
            const { width } = event.nativeEvent.layout;
            setLobbyFeltWidth((previous) => previous === Math.round(width) ? previous : Math.round(width));
          }}
          style={[styles.lobbyTableWrap, lobbyLayout ? { height: Math.ceil(lobbyLayout.pane.height) } : styles.lobbyTableWrapPending]}
        >
          <View style={styles.lobbyTable}>
            {seats.map((seat) => (
              <LobbySeat
                anchorSeat={((seat.seat - (viewer?.seat ?? 0) + room.config.seatCount) % room.config.seatCount) as number}
                busy={busy}
                frame={ninePortraitPhone ? undefined : (() => {
                  const slot = lobbySeatByRingIndex.get(((seat.seat - (viewer?.seat ?? 0) + room.config.seatCount) % room.config.seatCount) || 0);
                  return lobbyLayout && slot
                    ? {
                        height: slot.height,
                        left: slot.x - lobbyLayout.pane.left,
                        top: slot.y - lobbyLayout.pane.top,
                        width: slot.width,
                      }
                    : undefined;
                })()}
                hostMode={hostMode}
                key={seat.seat}
                onPress={() => {
                  if (!hostMode || seat.kind === 'human') return;
                  void onCommand({
                    seat: seat.seat,
                    type: seat.kind === 'ai' ? 'remove-ai' : 'add-ai',
                  });
                }}
                roomId={room.roomId}
                seat={seat}
                seatCount={room.config.seatCount}
                ninePortrait={ninePortraitPhone}
                tablet={tablet}
                wide={wide}
              />
            ))}
          </View>
        </View>
        <View style={styles.lobbyStatusRow}>
          <Ionicons color={palette.muted} name="hourglass-outline" size={14} />
          <Text style={styles.lobbyStatusText}>{t('multiplayer.lobby.waiting')}</Text>
        </View>

      </ScrollView>
      <BottomAction busy={busy} enabled={primaryEnabled} label={primaryLabel} note={note} onPress={handlePrimary} />
      {inviteAvailable ? (
        <MultiplayerInviteSheet
          onClose={() => setInviteVisible(false)}
          roomCode={room.roomCode}
          visible={inviteVisible}
          wide={wide}
        />
      ) : null}
    </>
  );
}

function MultiplayerInviteSheet({
  onClose,
  roomCode,
  visible,
  wide,
}: {
  onClose: () => void;
  roomCode: string;
  visible: boolean;
  wide: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(palette, wide), [palette, wide]);
  const [copied, setCopied] = useState(false);
  const inviteUrl = useMemo(() => buildMultiplayerInviteUrlIfAvailable(roomCode), [roomCode]);
  const inviteMessage = t('multiplayer.invite.shareMessage', { code: roomCode, url: inviteUrl ?? '' });

  useEffect(() => {
    if (!visible) setCopied(false);
  }, [visible]);

  if (!inviteUrl) return null;

  const copyInvite = async () => {
    try {
      await Clipboard.setStringAsync(inviteMessage);
      setCopied(true);
    } catch {
      // Native Share remains available if the system clipboard is unavailable.
    }
  };
  const shareInvite = () => {
    void Share.share({ message: inviteMessage });
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={[styles.inviteScrim, { paddingBottom: Math.max(12, insets.bottom + 8) }]}>
        <ModalBackdrop accessibilityLabel={t('multiplayer.invite.close')} onPress={onClose} />
        <View accessibilityViewIsModal style={styles.inviteSheet}>
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.inviteSheetContent}
            showsVerticalScrollIndicator={false}
            style={styles.inviteSheetScroll}
          >
            <View style={styles.inviteHeader}>
              <View style={styles.inviteHeaderCopy}>
                <Text style={styles.inviteEyebrow}>{t('multiplayer.invite.eyebrow')}</Text>
                <Text accessibilityRole="header" style={styles.inviteTitle}>{t('multiplayer.invite.title')}</Text>
              </View>
              <Pressable
                accessibilityLabel={t('multiplayer.invite.close')}
                accessibilityRole="button"
                onPress={onClose}
                style={({ pressed }) => [styles.inviteCloseButton, pressed && styles.pressed]}
              >
                <Ionicons color={palette.text} name="close" size={20} />
              </Pressable>
            </View>
            <Text style={styles.inviteDescription}>{t('multiplayer.invite.description')}</Text>

            <View accessible accessibilityLabel={`${t('multiplayer.invite.scan')}. ${roomCode}`} style={styles.inviteQrCard}>
              <QRCode
                backgroundColor="#FFFFFF"
                color="#0A2730"
                size={wide ? 210 : 174}
                value={inviteUrl}
              />
              <View style={styles.inviteCodeWrap}>
                <Text style={styles.inviteScanLabel}>{t('multiplayer.invite.scan')}</Text>
                <Text style={styles.inviteCode}>{roomCode}</Text>
              </View>
            </View>

            <View style={styles.inviteActions}>
              <Pressable
                accessibilityLabel={copied ? t('multiplayer.invite.copied') : t('multiplayer.invite.copy')}
                accessibilityRole="button"
                onPress={() => { void copyInvite(); }}
                style={({ pressed }) => [styles.inviteSecondaryButton, pressed && styles.pressed]}
              >
                <Ionicons color={palette.primary} name={copied ? 'checkmark' : 'copy-outline'} size={18} />
                <Text style={styles.inviteSecondaryText}>
                  {t(copied ? 'multiplayer.invite.copied' : 'multiplayer.invite.copy')}
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel={t('multiplayer.invite.share')}
                accessibilityRole="button"
                onPress={shareInvite}
                style={({ pressed }) => [styles.invitePrimaryButton, pressed && styles.pressed]}
              >
                <Ionicons color={palette.primaryText} name="share-outline" size={18} />
                <Text style={styles.invitePrimaryText}>{t('multiplayer.invite.share')}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function MultiplayerGameTable({
  allInFlashes,
  busy,
  publishedRecordRevision,
  moments,
  onAllInPresented,
  onCommand,
  onExit,
  onPracticeFocus,
  orientation,
  presentationReady,
  presentationTransitions,
  room,
  tablet,
  transportNotice,
  wide,
}: {
  allInFlashes: AllInMomentTrigger[];
  busy: boolean;
  moments: TableMomentEnvelope[];
  onAllInPresented: (key: string) => void;
  onCommand: (command: MultiplayerClientCommand) => Promise<boolean>;
  onExit: () => void;
  onPracticeFocus?: (focus: Exclude<CoachFocusArea, 'none'>) => void;
  orientation: LiveTableOrientationControl;
  /** Shared revision counter with the create/join publish (scope 3.11E). */
  publishedRecordRevision: { current: number };
  presentationReady: boolean;
  presentationTransitions: MultiplayerPresentationTransition[];
  room: MultiplayerViewerProjection;
  tablet: boolean;
  transportNotice: MultiplayerTransportNotice;
  wide: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const { play: playFeedback } = useGameplayFeedback();
  const reduceMotion = useReducedMotion();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const activityLayout = tableActivityLayout(windowWidth, windowHeight);
  const visualDensity = sharedTableVisualDensity(room.config.seatCount, windowWidth, windowHeight);
  const styles = useMemo(() => createStyles(palette, wide, tablet), [palette, tablet, wide]);
  // Nine-seat phones use an oval portrait ring. The legacy landscape layout
  // remains defensive for an in-flight orientation transition, but the flow
  // no longer asks a player to rotate their phone.
  const nineSeat = room.config.seatCount === 9;
  const ninePortraitPhone = nineSeat && !tablet && windowHeight >= windowWidth;
  const nineLandscape = nineSeat && !tablet && windowWidth > windowHeight;
  const ninePotInHeader = nineLandscape && multiplayerNineSeatPotInHeader(windowHeight);
  const nineLandscapeTableHeight = multiplayerCompactLiveTableBudget(windowHeight);
  const nineLandscapeLanes = nineLandscape
    ? multiplayerGameLaneBounds(
      nineLandscapeTableHeight,
      'compact',
      false,
      'live',
      9,
      true,
      ninePotInHeader,
    )
    : null;
  // DT-12 private-table measurement: the pane, protected center lane, and
  // occupied plaque frames all come from native layout. Action bubbles use
  // these real coordinates instead of percentage-anchor guesses.
  const [gameTablePane, setGameTablePane] = useState<MultiwayLayoutRect | null>(null);
  const [gameBoardRect, setGameBoardRect] = useState<MultiwayLayoutRect | null>(null);
  const [gameSeatRects, setGameSeatRects] = useState<Record<string, MultiwayLayoutRect>>({});
  const recordGameSeatRect = useCallback((playerId: string, rect: MultiwayLayoutRect) => {
    setGameSeatRects((current) => {
      const previous = current[playerId];
      if (previous
        && previous.left === rect.left
        && previous.top === rect.top
        && previous.right === rect.right
        && previous.bottom === rect.bottom) return current;
      return { ...current, [playerId]: rect };
    });
  }, []);
  const [nowMs, setNowMs] = useState(Date.now());
  const [betSizingVisible, setBetSizingVisible] = useState(false);
  const [sessionSummaryVisible, setSessionSummaryVisible] = useState(false);
  const [sessionHistoryVisible, setSessionHistoryVisible] = useState(false);
  const [sessionHistoryLoading, setSessionHistoryLoading] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<MultiwaySessionHandRecord[]>([]);
  const [replayHand, setReplayHand] = useState<MultiwaySessionHandRecord | null>(null);
  const historyRequestId = useRef(0);
  const [actionQueue, setActionQueue] = useState<MultiplayerActionFrame[]>([]);
  const [pendingBoardFeedback, setPendingBoardFeedback] = useState<import('./multiplayerFeedback').MultiplayerBoardFeedbackEvent | null>(null);
  // The viewer's per-seat privacy choices: which uploaded avatars are hidden
  // behind initials. This is a hide-only local control — it changes what THIS
  // device renders and nothing else; there is no moderation-report transport,
  // and the UI makes no such claim. Kept in-memory so a reload does not
  // persist a viewer's privacy choice.
  const [hiddenAvatars, setHiddenAvatars] = useState<ReadonlySet<string>>(new Set());
  const [privacyFeedback, setPrivacyFeedback] = useState<string | null>(null);
  const privacyFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hide applies to uploaded avatars only — authored assets and AI seats are
  // product imagery, not personal content, so those seats expose no privacy
  // action at all (see `canToggleAvatarPrivacy` on the seat plaque).
  const seatAvatarIdentity = (seat: MultiplayerViewerProjection['seats'][number]): { avatarId: string; version: number } | null => {
    const display = humanAvatarDisplay(seat.avatar ?? DEFAULT_HUMAN_AVATAR);
    if (display.mode === 'uploaded' && display.avatarId && display.version) {
      return { avatarId: display.avatarId, version: display.version };
    }
    return null;
  };
  const seatPrivacyVisibility = (seat: MultiplayerViewerProjection['seats'][number]): 'show' | 'hide' => {
    const identity = seatAvatarIdentity(seat);
    return identity
      ? avatarVisibility(hiddenAvatars, identity)
      : 'show';
  };
  const toggleSeatPrivacy = (seat: MultiplayerViewerProjection['seats'][number]): void => {
    const identity = seatAvatarIdentity(seat);
    if (!identity) return;
    const wasHidden = isAvatarHidden(hiddenAvatars, identity.avatarId, identity.version);
    setHiddenAvatars(applyAvatarVisibility(hiddenAvatars, wasHidden
      ? { type: 'show', avatarId: identity.avatarId, version: identity.version }
      : { type: 'hide', avatarId: identity.avatarId, version: identity.version }));
    // Hide-only: the only effect is local rendering. The feedback states the
    // truth — the avatar was hidden/shown on this device, nothing was sent.
    setPrivacyFeedback(wasHidden
      ? t('multiplayer.game.avatarShown')
      : t('multiplayer.game.avatarHidden'));
    if (privacyFeedbackTimer.current) clearTimeout(privacyFeedbackTimer.current);
    privacyFeedbackTimer.current = setTimeout(() => setPrivacyFeedback(null), 1600);
  };

  const timeoutAttemptGate = useRef(createMultiplayerTimeoutAttemptGate());
  const roomVersionRef = useRef(room.version);
  roomVersionRef.current = room.version;
  const observedHistory = useRef<{ handNumber: number; length: number } | null>(null);
  const consumedTransitionVersions = useRef(new Set<number>());
  const presentedActionIds = useRef(new Set<string>());
  const hand = room.hand;
  const tableMomentPlayerNames = useMemo(() => Object.fromEntries(
    Object.values(hand?.players ?? {}).map((player) => [player.id, player.name]),
  ), [hand?.players]);
  const [momentPreferences, setMomentPreferences] = useState<TableMomentPreferences>(
    () => loadTableMomentPreferences(),
  );
  useEffect(() => {
    saveTableMomentPreferences(momentPreferences);
  }, [momentPreferences]);
  // Locally accepted moments are offered to the lanes immediately; the
  // realtime echo is deduplicated by the lanes' recent-id window.
  const [localMomentEnvelopes, setLocalMomentEnvelopes] = useState<TableMomentEnvelope[]>([]);
  const activityEvents = useMemo(() => hand
    ? [
      ...projectMultiwayTableActivity(hand),
      ...projectTableMomentActivity(
        [...moments, ...localMomentEnvelopes],
        tableMomentPlayerNames,
        hand.handNumber,
        nowMs,
      ),
    ]
    : [], [hand, localMomentEnvelopes, moments, nowMs, tableMomentPlayerNames]);
  const handleSendMoment = useCallback(
    async (reactionId: TableMomentReactionId, momentId: string): Promise<TableMomentSendOutcome> => {
      if (!hand) return { status: 'error' };
      try {
        const envelope = await sendMultiplayerTableMoment(room.roomId, reactionId, momentId, hand.handNumber);
        setLocalMomentEnvelopes((current) => (
          current.length >= 24 ? [...current.slice(-23), envelope] : [...current, envelope]
        ));
        return { status: 'accepted' };
      } catch (error) {
        return tableMomentSendOutcome(error);
      }
    },
    [hand, room.roomId],
  );
  const previousPresentedBoard = useRef({
    count: 0,
    handNumber: hand?.handNumber,
  });
  const viewerFeedbackTurn = useRef(false);
  const lastTimerWarningFeedback = useRef<string | null>(null);
  const viewerSeat = room.seats.find((seat) => seat.playerId === room.viewerPlayerId);
  // The late-return Rebuy action: a sitting-out seat with a zero settled
  // stack can rebuy at any later between-hands boundary (scope 3.11F/H06).
  const viewerRebuyPending = room.status === 'between-hands'
    && viewerSeat?.kind === 'human'
    && (viewerSeat.participation === 'rebuy-pending'
      || (viewerSeat.participation === 'sitting-out'
        && (viewerSeat.ledger?.settledStack ?? 1) === 0));
  // Return next hand (scope 3.11F/R3): a CONNECTED sitting-out human with a
  // positive settled stack rejoins the next deal explicitly — reconnect
  // toggling is never a substitute for the Return action.
  const viewerMayReturnNextHand = room.status === 'between-hands'
    && viewerSeat?.kind === 'human'
    && viewerSeat.participation === 'sitting-out'
    && viewerSeat.connection === 'online'
    && viewerSeat.control === 'human'
    && (viewerSeat.ledger?.settledStack ?? 0) > 0;
  // Stalled between-hands room (scope 3.11F): no deal countdown is armed and
  // fewer than two active funded participants remain, so the session waits
  // while a human can return. Only the host can end it.
  const stalledBetweenHands = multiplayerStalledBetweenHands(
    room.status,
    room.nextHandAtMs,
    room.seats,
  );
  const viewerMayEndStalledSession = stalledBetweenHands
    && room.hostPlayerId === room.viewerPlayerId
    && viewerSeat?.kind === 'human'
    && viewerSeat.connection === 'online'
    && viewerSeat.control === 'human';
  /** Room-private Play records published by member seats (scope 3.11E). */
  const publicRecords = useMemo(
    () => Object.fromEntries(room.seats
      .filter((seat) => seat.playRecord)
      .map((seat) => [seat.playerId, seat.playRecord!])) as Partial<Record<string, PublicPlayerRecordSnapshot>>,
    [room.seats],
  );
  const viewerDisplayName = useMemo(
    () => viewerSeat?.displayName ?? (loadPlayerDisplayName() || t('common.you')),
    [t, viewerSeat?.displayName],
  );
  const hostMode = room.hostPlayerId === room.viewerPlayerId;
  const hostSeat = room.seats.find((seat) => seat.playerId === room.hostPlayerId);
  const hostCanRematch = hostSeat?.kind === 'human'
    && hostSeat.connection === 'online'
    && hostSeat.control === 'human';
  const viewerMayRematch = room.status === 'complete'
    && viewerSeat?.kind === 'human'
    && viewerSeat.connection === 'online'
    && viewerSeat.control === 'human'
    && (hostMode || !hostCanRematch);
  const viewerCanRematch = presentationReady && viewerMayRematch;
  const viewerCanDeal = room.status === 'between-hands'
    && presentationReady
    && viewerSeat?.kind === 'human'
    && viewerSeat.connection === 'online'
    && viewerSeat.control === 'human'
    && (hostMode || !hostCanRematch);
  const sessionSummary = buildMultiplayerSessionSummary(room, room.viewerPlayerId);
  const handResult = hand
    ? buildMultiplayerResultPresentation(hand, room.viewerPlayerId, t)
    : null;
  const secondsLeft = room.turnDeadlineAtMs === null
    ? null
    : Math.max(0, Math.ceil((room.turnDeadlineAtMs - nowMs) / 1_000));
  const actingPlayer = hand?.toAct ? hand.players[hand.toAct] : null;
  const actingSeat = hand?.toAct
    ? room.seats.find((seat) => seat.playerId === hand.toAct)
    : null;
  const viewerMayAct = room.status === 'playing'
    && viewerSeat?.kind === 'human'
    && viewerSeat.connection === 'online'
    && viewerSeat.control === 'human'
    && hand?.toAct === room.viewerPlayerId
    && room.legalActions !== null;
  const pendingActionFrames = pendingMultiplayerActionFrames({
    consumedTransitionVersions: consumedTransitionVersions.current,
    currentHand: hand,
    observedHistory: observedHistory.current,
    presentedActionIds: presentedActionIds.current,
    roomVersion: room.version,
    transitions: presentationTransitions,
  });
  // Render the first authoritative pending frame immediately. The layout
  // effect then adopts it into the timed queue before native paint, but this
  // synchronous fallback keeps the visual actor aligned even if scheduling
  // changes in a future React Native release.
  const visibleActionFrame = actionQueue[0] ?? pendingActionFrames[0];
  const pendingActionPresentation = pendingActionFrames.length > 0;
  const viewerTurn = viewerMayAct;
  const actionControlsEnabled = presentationReady

    && viewerMayAct
    && multiplayerActionControlsEnabled(
      room,
      visibleActionFrame,
      pendingActionPresentation,
    );
  const readOnlyOverlayPolicy = multiplayerReadOnlyOverlayPolicy({
    actionControlsEnabled,
    viewerTurn,
  });
  // Tap-to-open player profiles (scope 3.11E): the viewer's own plaque shows
  // their full record, another human's shows the room snapshot with the
  // observer heading, and an authored AI shows the shared character sheet.
  // Read-only profiles stay openable during the viewer's turn. The live clock
  // continues independently and the sheet carries a compact turn notice.
  const [profileSeat, setProfileSeat] = useState<{ kind: 'ai' | 'human'; playerId: string } | null>(null);
  // The live Table stats sheet follows the same read-only policy.
  const [statsVisible, setStatsVisible] = useState(false);
  const lastSettledHandNumber = useMemo(
    () => room.seats.reduce((last, seat) => Math.max(last, seat.ledger?.settledHandNumber ?? 0), 0),
    [room.seats],
  );
  const statsPanel = useMemo(
    () => buildMultiplayerTableStats(
      room.seats,
      // Frozen through the LAST SETTLED hand: an active hand's number never
      // implies its chips are accounted (scope 3.11F/H09).
      lastSettledHandNumber > 0 ? lastSettledHandNumber : null,
      t,
    ),
    [lastSettledHandNumber, room.seats, t],
  );
  // The member's own room-private Play record (scope 3.11E): published on
  // create/join and refreshed after each completed hand and on foreground —
  // converging with the room's copy by monotonic revision.
  const publishedRecordHand = useRef<string | null>(null);
  const publishPlayRecord = useCallback(async (): Promise<void> => {
    const viewer = room.seats.find((seat) => seat.playerId === room.viewerPlayerId);
    if (!viewer || viewer.kind !== 'human') return;
    const record = await buildViewerPlayRecord(viewer.displayName, publishedRecordRevision.current + 1);
    if (!record) return;
    publishedRecordRevision.current = record.revision;
    await onCommand({ type: 'update-play-record', record });
  }, [onCommand, publishedRecordRevision, room]);
  // Refresh after each completed private-room hand (scope 3.11E): the
  // settlement boundary is when the record's numbers change.
  useEffect(() => {
    const settledKey = hand?.outcome ? `${hand.handNumber}:settled` : null;
    if (!settledKey || publishedRecordHand.current === settledKey) return;
    publishedRecordHand.current = settledKey;
    void publishPlayRecord();
  }, [hand?.handNumber, hand?.outcome, publishPlayRecord]);
  // Foreground refresh: the profile read may have changed while backgrounded.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void publishPlayRecord();
    });
    return () => subscription.remove();
  }, [publishPlayRecord]);
  // Rebuy-decision expiry scheduler (scope 3.11F/H05): the server publishes
  // the decision deadline; the client schedules the tick that resolves it.
  // The transition is idempotent server-side, so a retry is safe.
  const decisionDeadline = room.rebuyDecisionDeadlineAtMs;
  useEffect(() => {
    if (decisionDeadline === null) return;
    const check = () => {
      if (Date.now() < decisionDeadline) return;
      void onCommand({ type: 'tick' }).catch(() => undefined);
    };
    const timer = setInterval(check, 1_000);
    return () => clearInterval(timer);
  }, [decisionDeadline, onCommand]);
  const profileSeatTitle = profileSeat
    ? room.seats.find((s) => s.playerId === profileSeat.playerId)?.displayName
      ?? (profileSeat.playerId === room.viewerPlayerId ? viewerDisplayName : t('common.opponent'))
    : '';

  const [viewerRecord, setViewerRecord] = useState<PlayStatistics | null>(null);
  const [viewerRecordLoading, setViewerRecordLoading] = useState(false);
  useEffect(() => {
    if (profileSeat?.playerId !== room.viewerPlayerId) return;
    let cancelled = false;
    setViewerRecordLoading(true);
    void loadPlayStatistics({ includePrivate: true }).then((statistics) => {
      if (!cancelled) {
        setViewerRecord(statistics);
        setViewerRecordLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setViewerRecordLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [profileSeat]);
  const spotlightAction = visibleActionFrame?.action ?? null;
  const spotlightSeat = spotlightAction
    ? room.seats.find((seat) => seat.playerId === spotlightAction.playerId)
    : null;
  const spotlightHistoryIndex = visibleActionFrame?.historyIndex;
  const spotlightAllIn = spotlightAction && hand
    ? multiplayerActionIsAllIn(hand, spotlightAction, spotlightHistoryIndex)
    : false;
  const spotlightLabel = spotlightAction && hand
    ? multiplayerActionSeatLabel(hand, spotlightAction, t, spotlightHistoryIndex)
    : null;
  const spotlightPresentation = spotlightAction && hand
    ? buildMultiplayerActionBubblePresentation(hand, spotlightAction, t, {
      allIn: spotlightAllIn,
      historyIndex: spotlightHistoryIndex,
      isAi: spotlightSeat?.kind === 'ai',
    })
    : null;
  const presentedTurnPlayerId = multiplayerPresentedTurnPlayerId(hand?.toAct ?? null, visibleActionFrame);
  const presentedStreet = hand ? multiplayerPresentedStreet(hand.street, visibleActionFrame) : 'preflop';
  const presentedPot = multiplayerPresentedPot(handResult?.totalPot ?? hand?.pot ?? 0, visibleActionFrame);
  // The deadline is authoritative, but showing its countdown while delayed
  // live-action presentation is still catching up makes the controls look
  // available before they are. Reveal it together with the viewer controls.
  const visibleSecondsLeft = multiplayerVisibleTurnSeconds({
    actionPresentationPending: Boolean(visibleActionFrame) || pendingActionPresentation,
    presentationReady,
    secondsLeft,
    turnIsHumanControlled: actingSeat?.kind === 'human' && actingSeat.control === 'human',
  });
  const visibleHandResult = visibleActionFrame ? null : handResult;
  const displayedBoard = visibleActionFrame?.board ?? hand?.board ?? [];
  const latestLiveTransition = multiplayerLatestLiveTransitionForHand(
    presentationTransitions,
    hand?.handNumber,
    room.version,
  );
  const latestLiveActionTransition = multiplayerLatestLiveActionTransitionForHand(
    presentationTransitions,
    hand?.handNumber,
    room.version,
  );
  const liveTransitionMatchesHandTail = multiplayerTransitionMatchesHandTail(
    latestLiveActionTransition,
    hand,
  );
  const freshDealAtCurrentVersion = multiplayerTransitionIsCurrentFreshDeal(
    latestLiveTransition,
    room.version,
  );
  const liveResultProvenance = liveTransitionMatchesHandTail
    || Boolean(freshDealAtCurrentVersion && hand?.outcome);
  const previousBoardSnapshot = previousPresentedBoard.current;
  const boardRevealThisRender = Boolean(
    hand
    && displayedBoard.length > 0
    && (
      (previousBoardSnapshot.handNumber === hand.handNumber
        && displayedBoard.length > previousBoardSnapshot.count)
      || (freshDealAtCurrentVersion && previousBoardSnapshot.handNumber !== hand.handNumber)
    )
    && (
      isLiveMultiplayerActionFrame(visibleActionFrame)
      || liveTransitionMatchesHandTail
      || freshDealAtCurrentVersion
    )
  );
  const liveActionCue = visibleActionFrame && isLiveMultiplayerActionFrame(visibleActionFrame)
    ? multiplayerActionFeedbackCue(visibleActionFrame.action, Boolean(spotlightAllIn))
    : null;
  const liveActionEventId = visibleActionFrame && liveActionCue
    ? `${room.roomId}:hand:${hand?.handNumber ?? 0}:action:${visibleActionFrame.id}`
    : undefined;
  const liveActionDelayMs = liveActionCue
    ? multiplayerActionFeedbackDelayMs(freshDealAtCurrentVersion)
    : 0;
  const detectedBoardEvent = boardRevealThisRender && hand
    ? {
      boardCount: displayedBoard.length,
      eventId: `${room.roomId}:hand:${hand.handNumber}:street:${presentedStreet}:${displayedBoard.length}`,
      handNumber: hand.handNumber,
    }
    : null;
  const boardEvent = retainMultiplayerBoardFeedbackEvent({
    boardCount: displayedBoard.length,
    detected: detectedBoardEvent,
    handNumber: hand?.handNumber,
    pending: pendingBoardFeedback,
  });
  const boardEventId = boardEvent?.eventId ?? null;
  const viewerReady = viewerTurn && actionControlsEnabled;
  const viewerBecameReady = viewerReady && !viewerFeedbackTurn.current;
  const viewerTurnEventId = viewerBecameReady
    && !freshDealAtCurrentVersion
    && liveTransitionMatchesHandTail
    && hand
    ? `${room.roomId}:hand:${hand.handNumber}:turn:${hand.history.length}:${room.turnDeadlineAtMs ?? 0}`
    : null;
  const timerWarningEventId = multiplayerTimerWarningEventId({
    actingPlayerId: hand?.toAct,
    deadlineAtMs: room.turnDeadlineAtMs,
    handNumber: hand?.handNumber,
    roomId: room.roomId,
    secondsLeft: viewerReady ? visibleSecondsLeft : null,
  });
  const freshTimerWarningEventId = timerWarningEventId !== lastTimerWarningFeedback.current
    ? timerWarningEventId
    : null;
  const resultFeedback = visibleHandResult && hand && liveResultProvenance
    ? {
      cue: { type: 'handResult' as const, result: multiplayerResultFeedbackKind(visibleHandResult.tone) },
      eventId: multiplayerResultFeedbackEventId(room.roomId, hand.handNumber, visibleHandResult),
    }
    : null;
  const freshDealEventId = freshDealAtCurrentVersion && latestLiveTransition
    ? `${room.roomId}:hand:${hand?.handNumber ?? 0}:deal:${latestLiveTransition.transition.version}`
    : null;
  const feedbackPlan = planMultiplayerFeedbackWhenReady(presentationReady, {
    action: liveActionCue && liveActionEventId && visibleActionFrame
      ? {
        cue: liveActionCue,
        delayMs: liveActionDelayMs,
        eventId: liveActionEventId,
        viewerActed: visibleActionFrame.action.playerId === room.viewerPlayerId,
      }
      : null,
    boardEventId,
    freshDealEventId,
    result: resultFeedback,
    timerEventId: freshTimerWarningEventId,
    viewerTurnEventId,
  });
  const feedbackPlanKey = multiplayerFeedbackPlanKey(feedbackPlan);
  const winningPlayerIds = new Set(visibleHandResult?.payouts.map(({ playerId }) => playerId) ?? []);

  useLayoutEffect(() => {
    if (!hand) {
      observedHistory.current = null;
      setActionQueue([]);
      return;
    }
    const previous = observedHistory.current;
    const sameHand = previous?.handNumber === hand.handNumber;
    const transitions = presentationTransitions
      .filter(({ handNumber, transition }) => (
        handNumber === hand.handNumber
        && transition.version <= room.version
        && !consumedTransitionVersions.current.has(transition.version)
      ))
      .sort((left, right) => left.transition.version - right.transition.version);
    transitions.forEach(({ transition }) => {
      consumedTransitionVersions.current.add(transition.version);
    });
    const additions = buildMultiplayerActionFrames({
      currentHand: hand,
      previousHistoryLength: previous?.length ?? 0,
      sameHand,
      transitions,
    });
    observedHistory.current = { handNumber: hand.handNumber, length: hand.history.length };
    const unseenAdditions = additions.filter(({ id }) => {
      if (presentedActionIds.current.has(id)) return false;
      presentedActionIds.current.add(id);
      return true;
    });
    setActionQueue((current) => sameHand
      ? mergeMultiplayerActionFrames(current, unseenAdditions, hand)
      : unseenAdditions);
  }, [hand?.handNumber, hand?.history.length, hand?.street, presentationTransitions, room.version]);

  useEffect(() => {
    if (!actionQueue[0]) return undefined;
    const timer = setTimeout(
      () => setActionQueue((current) => current.slice(1)),
      actionQueue[0].durationMs,
    );
    return () => clearTimeout(timer);
  }, [actionQueue[0]?.key]);

  useEffect(() => {
    const next = { count: displayedBoard.length, handNumber: hand?.handNumber };
    previousPresentedBoard.current = next;
    if (detectedBoardEvent) setPendingBoardFeedback(detectedBoardEvent);
    else if (
      pendingBoardFeedback
      && (pendingBoardFeedback.handNumber !== next.handNumber
        || pendingBoardFeedback.boardCount !== next.count)
    ) setPendingBoardFeedback(null);
  }, [detectedBoardEvent?.eventId, displayedBoard.length, hand?.handNumber, pendingBoardFeedback]);

  useEffect(() => {
    viewerFeedbackTurn.current = viewerReady;
  }, [viewerReady]);

  useEffect(() => {
    if (timerWarningEventId) lastTimerWarningFeedback.current = timerWarningEventId;
    else if (visibleSecondsLeft === null || visibleSecondsLeft > 10) lastTimerWarningFeedback.current = null;
  }, [timerWarningEventId, visibleSecondsLeft]);

  useEffect(() => {
    if (!feedbackPlanKey) return undefined;
    feedbackPlan.forEach((step) => {
      playFeedback(step.cue, {
        delayMs: step.delayMs,
        eventId: step.eventId,
        haptic: step.haptic,
      });
    });
    const boardStep = feedbackPlan.find((step) => step.kind === 'streetReveal');
    if (boardStep) {
      setPendingBoardFeedback((current) => current?.eventId === boardStep.eventId ? null : current);
    }
    return undefined;
  // The stable semantic key deliberately excludes countdown and render-only
  // state so delayed street/result cues survive unrelated rerenders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedbackPlanKey, playFeedback]);

  useEffect(() => {
    if (!viewerTurn || !actionControlsEnabled) setBetSizingVisible(false);
  }, [actionControlsEnabled, viewerTurn]);

  useEffect(() => {
    if (room.status !== 'complete') setSessionSummaryVisible(false);
  }, [room.status]);

  useEffect(() => {
    historyRequestId.current += 1;
    setSessionHistory([]);
    setSessionHistoryVisible(false);
    setReplayHand(null);
  }, [room.roomId, room.sessionNumber]);

  useEffect(() => {
    const clockNeeded = room.status === 'playing' && room.turnDeadlineAtMs !== null
      || room.status === 'between-hands' && room.nextHandAtMs !== null;
    if (!clockNeeded) return undefined;
    const interval = setInterval(() => setNowMs(Date.now()), 500);
    return () => clearInterval(interval);
  }, [room.nextHandAtMs, room.status, room.turnDeadlineAtMs]);

  useEffect(() => {
    timeoutAttemptGate.current.reset();
  }, [room.roomId]);

  useEffect(() => {
    if (
      room.status !== 'playing'
      || !presentationReady
      || room.turnDeadlineAtMs === null
      || room.turnDeadlineAtMs > nowMs
      || busy
    ) return;
    const completeAttempt = timeoutAttemptGate.current.begin(room.version, nowMs);
    if (!completeAttempt) return;
    void onCommand({ type: 'tick' }).then(
      (success) => {
        completeAttempt({
          completedAtMs: Date.now(),
          latestVersion: Math.max(
            roomVersionRef.current,
            success ? room.version + 1 : room.version,
          ),
          success,
        });
      },
      () => {
        completeAttempt({
          completedAtMs: Date.now(),
          latestVersion: roomVersionRef.current,
          success: false,
        });
      },
    );
  }, [busy, nowMs, onCommand, presentationReady, room.status, room.turnDeadlineAtMs, room.version]);

  // Between hands the recoverable next-hand countdown deals automatically:
  // fire one due tick per deadline, and allow a retry when that tick was
  // refused (the snapshot then converges on the authoritative outcome).
  const countdownTickedDeadline = useRef<number | null>(null);
  const countdownTickBackoffMs = useRef(0);
  useEffect(() => {
    if (room.status !== 'between-hands' || !presentationReady || busy) return;
    // Mirror the coordinator's tick gate: an AI-controlled or offline seat
    // is refused every time, so it must never keep retrying the deadline.
    if (viewerSeat?.control !== 'human' || viewerSeat.connection !== 'online') return;
    const deadline = room.nextHandAtMs;
    if (deadline === null || nowMs < deadline) return;
    if (countdownTickedDeadline.current === deadline) return;
    // A device clock ahead of the server can fire early and be refused;
    // back off briefly instead of hammering the refused deadline.
    if (Date.now() < countdownTickBackoffMs.current) return;
    countdownTickedDeadline.current = deadline;
    void onCommand({ type: 'tick' }).then((accepted) => {
      if (!accepted) {
        countdownTickedDeadline.current = null;
        countdownTickBackoffMs.current = Date.now() + 2_000;
      }
    });
  }, [busy, nowMs, onCommand, presentationReady, room.nextHandAtMs, room.status, viewerSeat?.connection, viewerSeat?.control]);

  const openSessionHistory = async (): Promise<void> => {
    if (sessionHistoryLoading) return;
    if (sessionHistory.length > 0) {
      setSessionSummaryVisible(false);
      setSessionHistoryVisible(true);
      return;
    }
    const requestId = ++historyRequestId.current;
    setSessionHistoryLoading(true);
    try {
      const archives = await loadMultiplayerHandHistory({
        roomId: room.roomId,
        sessionNumber: room.sessionNumber,
      });
      if (historyRequestId.current !== requestId) return;
      const hands = multiplayerArchivesToSessionHands(archives);
      setSessionHistory(hands);
      if (hands.length === 0) {
        Alert.alert(
          t('multiplayer.session.historyTitle'),
          t('multiplayer.session.historyEmpty'),
        );
        return;
      }
      setSessionSummaryVisible(false);
      setSessionHistoryVisible(true);
    } catch {
      if (historyRequestId.current !== requestId) return;
      Alert.alert(
        t('multiplayer.session.historyTitle'),
        t('multiplayer.session.historyError'),
        [
          { style: 'cancel', text: t('common.cancel') },
          { onPress: () => { void openSessionHistory(); }, text: t('multiplayer.session.historyRetry') },
        ],
      );
    } finally {
      if (historyRequestId.current === requestId) setSessionHistoryLoading(false);
    }
  };

  const actionPanel = (() => {
    if (!presentationReady) {
      return (
        <View style={styles.gameStatePanel}>
          <ActivityIndicator color={palette.primary} size="small" />
          <Text style={styles.gameStateTitle}>{t('multiplayer.game.settling')}</Text>
        </View>
      );
    }
    if (room.status === 'paused') {
      return (
        <View style={styles.gameStatePanel}>
          <Text style={styles.gameStateTitle}>{t('multiplayer.game.paused')}</Text>
          <BottomAction
            busy={busy}
            enabled
            label={t('multiplayer.game.reconnect')}
            onPress={() => { void onCommand({ connection: 'online', type: 'set-connection' }); }}
          />
        </View>
      );
    }
    if (visibleActionFrame) {
      return (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.gameStateSpacer} />
      );
    }
    if (visibleHandResult) {
      // Scope 3.11F retired the reclaim path: a human seat is never handed to
      // AI, so there is no take-back affordance to render.
      const canDeal = viewerCanDeal;
      const canViewSession = room.status === 'complete' && sessionSummary !== null;
      const countdownSeconds = room.status === 'between-hands' && room.nextHandAtMs !== null
        ? Math.max(0, Math.ceil((room.nextHandAtMs - nowMs) / 1_000))
        : null;
      const countdownLabel = room.status === 'between-hands' && viewerSeat?.control === 'human'
        ? room.nextHandAtMs === null
          ? t(multiplayerSettledCountdownCopy(stalledBetweenHands))
          : t('multiplayer.game.nextHandIn', { seconds: String(countdownSeconds ?? 0) })
        : undefined;
      return (
        <>
        {viewerMayReturnNextHand ? (
          <BottomAction
            busy={busy}
            enabled
            label={t('multiplayer.game.returnNextHand')}
            onPress={() => { void onCommand({ type: 'return-next-hand' }); }}
          />
        ) : null}
        {viewerRebuyPending ? (
          <View style={styles.rebuyDecisionCard}>
            <Text maxFontSizeMultiplier={1.3} style={styles.rebuyDecisionText}>{t('multiplayer.rebuy.pending')}</Text>
            <View style={styles.rebuyDecisionActions}>
              <Pressable
                accessibilityLabel={t('multiplayer.rebuy.actionA11y', { amount: '4,000' })}
                accessibilityRole="button"
                onPress={() => { void onCommand({ type: 'rebuy' }); }}
                style={({ pressed }) => [styles.rebuyDecisionPrimary, pressed && styles.pressed]}
              >
                <Text maxFontSizeMultiplier={1.2} style={styles.rebuyDecisionPrimaryText}>{t('multiplayer.rebuy.action', { amount: '4,000' })}</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={t('multiplayer.rebuy.sitOutA11y')}
                accessibilityRole="button"
                onPress={() => { void onCommand({ type: 'sit-out' }); }}
                style={({ pressed }) => [styles.rebuyDecisionSecondary, pressed && styles.pressed]}
              >
                <Text maxFontSizeMultiplier={1.2} style={styles.rebuyDecisionSecondaryText}>{t('multiplayer.rebuy.sitOut')}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        <MultiplayerHandResultPanel
          busy={busy}
          countdownLabel={countdownLabel}
          onCountdownPress={canDeal
            ? () => { void onCommand({
              type: room.nextHandAtMs === null ? 'resume' : 'pause',
            }); }
            : undefined}
          countdownActionLabel={canDeal
            ? room.nextHandAtMs === null
              ? t('multiplayer.game.resumeCountdown')
              : t('multiplayer.game.pauseCountdown')
            : undefined}
          note={room.status === 'complete'
            ? t('multiplayer.game.completeDetail')
            : stalledBetweenHands ? t('multiplayer.game.waitingForPlayers')
              : !canDeal ? t('multiplayer.result.waitingForHost') : undefined}
          onPress={canDeal
            ? () => { void onCommand({ type: 'deal-now' }); }
            : canViewSession ? () => setSessionSummaryVisible(true) : undefined}
          primaryLabel={canDeal
            ? t('multiplayer.game.nextHand')
            : canViewSession ? t('multiplayer.session.viewStandings') : undefined}
          result={visibleHandResult}
          wide={wide}
        />
        </>
      );
    }
    if (room.status === 'complete') {
      // Scope 3.11F retired reclaim: a completed room always routes to the
      // standings view — a human seat is never handed to AI, so there is no
      // take-back affordance.
      return (
        <View style={styles.gameStatePanel}>
          <Text style={styles.gameStateTitle}>{t('multiplayer.game.complete')}</Text>
          <Text style={styles.gameStateCopy}>{t('multiplayer.game.completeDetail')}</Text>
          {sessionSummary ? (
            <BottomAction
              busy={busy}
              enabled
              label={t('multiplayer.session.viewStandings')}
              onPress={() => setSessionSummaryVisible(true)}
            />
          ) : null}
        </View>
      );
    }
    if (room.status === 'between-hands') {
      // Scope 3.11F retired reclaim between hands too: a human seat is never
      // AI-controlled, so the between-hands panel routes to deal/pause, the
      // explicit Return action, or the host-only end of a stalled session.
      if (viewerCanDeal || viewerMayReturnNextHand || viewerMayEndStalledSession) {
        return (
          <View style={styles.gameStatePanel}>
            {stalledBetweenHands ? (
              <Text style={styles.gameStateCopy}>{t('multiplayer.game.waitingForReturn')}</Text>
            ) : null}
            {viewerMayReturnNextHand ? (
              <BottomAction
                busy={busy}
                enabled
                label={t('multiplayer.game.returnNextHand')}
                onPress={() => { void onCommand({ type: 'return-next-hand' }); }}
              />
            ) : null}
            {viewerCanDeal ? (
              <BottomAction
                busy={busy}
                enabled
                label={t('multiplayer.game.nextHand')}
                onPress={() => { void onCommand({ type: 'deal-now' }); }}
              />
            ) : null}
          </View>
        );
      }
      return (
        <View style={styles.gameStatePanel}>
          {stalledBetweenHands ? (
            <Text style={styles.gameStateCopy}>{t('multiplayer.game.waitingForReturn')}</Text>
          ) : null}
          <ActivityIndicator color={palette.primary} size="small" />
          <Text style={styles.gameStateCopy}>{t('multiplayer.game.waiting')}</Text>
        </View>
      );
    }
    const legal = room.legalActions;
    if (!viewerTurn || !legal || !actionControlsEnabled) {
      return (
        <View style={styles.gameStateSpacer}>
          {busy && <ActivityIndicator color={palette.primary} size="small" />}
        </View>
      );
    }
    return (
      <View style={styles.gameActions}>
        <GameActionButton
          danger
          disabled={busy || !legal.canFold}
          label={t('poker.action.fold')}
          onPress={() => { void onCommand({ action: { type: 'fold' }, type: 'action' }); }}
          wide={wide}
        />
        <GameActionButton
          disabled={busy || (!legal.canCheck && !legal.canCall)}
          label={legal.canCheck
            ? t('poker.action.check')
            : t('poker.action.callAmount', { amount: formatChips(legal.toCall) })}
          onPress={() => { void onCommand({
            action: { type: legal.canCheck ? 'check' : 'call' },
            type: 'action',
          }); }}
          wide={wide}
        />
        <GameActionButton
          disabled={busy || !legal.canRaise}
          icon="options-outline"
          label={t(hand?.currentBet === 0 ? 'poker.action.bet' : 'poker.action.raise')}
          onPress={() => setBetSizingVisible(true)}
          primary
          wide={wide}
        />
      </View>
    );
  })();

  return (
    <View style={styles.gameScreen}>
      <View style={styles.gameHeader}>
        <Pressable
          accessibilityLabel={t('multiplayer.game.leave')}
          accessibilityRole="button"
          disabled={busy}
          onPress={onExit}
          style={({ pressed }) => [styles.gameExitButton, busy && styles.disabled, pressed && styles.pressed]}
        >
          <Ionicons color={palette.text} name="close" size={wide ? 23 : 20} />
        </Pressable>
        {transportNotice ? (
          <MultiplayerTransportBanner inline status={transportNotice} wide={false} />
        ) : (
          <>
            <View pointerEvents="none" style={styles.gameHeaderTitleWrap}>
              <Text adjustsFontSizeToFit maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} minimumFontScale={0.76} numberOfLines={1} style={styles.gameHeaderTitle}>
                {hand
                  ? `${t('multiplayer.game.hand', { count: hand.handNumber })} · ${localizedStreet(presentedStreet, t)}`
                  : t('multiplayer.lobby.title')}
              </Text>
            </View>
            <View style={styles.gameHeaderTrailing}>
              <Pressable
                accessibilityLabel={t('multiplayer.stats.a11y')}
                accessibilityRole="button"
                onPress={() => setStatsVisible(true)}
                style={({ pressed }) => [styles.gameStatsButton, pressed && styles.pressed]}
              >
                <Ionicons color={palette.primary} name="stats-chart-outline" size={20} />
              </Pressable>
              <TableOrientationControl control={orientation} />
              {ninePotInHeader && hand && (
                <View pointerEvents="none" style={styles.gameHeaderPotPill}>
                  <Text maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} numberOfLines={1} style={styles.gameHeaderPotText}>
                    {t('multiplayer.game.pot', { amount: formatChips(presentedPot) })}
                  </Text>
                </View>
              )}
              {visibleSecondsLeft !== null && room.status === 'playing' && (
                <View style={[styles.timerPill, visibleSecondsLeft <= 10 && styles.timerPillUrgent]}>
                  <Ionicons color={visibleSecondsLeft <= 10 ? palette.danger : palette.primary} name="timer-outline" size={wide ? 17 : 15} />
                  <Text maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} style={[styles.timerText, visibleSecondsLeft <= 10 && styles.timerTextUrgent]}>
                    {t('multiplayer.game.seconds', { count: visibleSecondsLeft })}
                  </Text>
                </View>
              )}
            </View>
          </>
        )}
      </View>

      <View style={[styles.gameBody, activityLayout.mode === 'rail' && styles.gameBodyLandscape]}>
      <View style={[
        styles.gameTableWrap,
        visibleHandResult && styles.gameTableWrapResult,
        nineLandscape && styles.gameTableWrapNineLandscape,
        activityLayout.mode === 'rail' && styles.gameTableWrapLandscape,
      ]}>
        {privacyFeedback ? (
          // A live region must be exposed to accessibility services for the
          // polite announcement to fire; `accessibilityElementsHidden` or
          // `no-hide-descendants` would suppress exactly what this announces.
          <View
            accessibilityLabel={privacyFeedback}
            accessibilityLiveRegion="polite"
            pointerEvents="none"
            style={styles.avatarPrivacyFeedback}
          >
            <Text
              accessibilityLiveRegion="polite"
              accessibilityElementsHidden={false}
              importantForAccessibility="yes"
              style={styles.avatarPrivacyFeedbackText}
            >
              {privacyFeedback}
            </Text>
          </View>
        ) : null}
        <View
          onLayout={(event) => {
            const { height, width } = event.nativeEvent.layout;
            const next = { bottom: height, left: 0, right: width, top: 0 };
            setGameTablePane((previous) => previous
              && previous.right === next.right
              && previous.bottom === next.bottom
              ? previous
              : next);
          }}
          style={styles.gameTable}
        >
            <View style={[
              styles.gameCenter,
              nineLandscape && styles.gameCenterNineLandscape,
              nineLandscape && nineLandscapeLanes && { top: nineLandscapeLanes.board.top },
            ]}
            onLayout={(event) => {
              const { height, width, x, y } = event.nativeEvent.layout;
              const next = { bottom: y + height, left: x, right: x + width, top: y };
              setGameBoardRect((previous) => previous
                && previous.left === next.left
                && previous.top === next.top
                && previous.right === next.right
                && previous.bottom === next.bottom
                ? previous
                : next);
            }}>
              {!ninePotInHeader && (
                <View style={styles.potPill}>
                  <Text maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} style={styles.potText}>{t('multiplayer.game.pot', {
                    amount: formatChips(presentedPot),
                  })}</Text>
                </View>
              )}
              <MultiplayerBoard board={visibleActionFrame?.board ?? hand?.board ?? []} street={presentedStreet} variant={visualDensity.boardCard} wide={wide} />
              {!ninePotInHeader && multiplayerShowsCenterTurnStatus({
                actionPresented: Boolean(spotlightAction),
                handResultVisible: Boolean(visibleHandResult || handResult),
              }) && (
                <View
                  accessibilityLiveRegion="polite"
                  style={[styles.turnPill, nineLandscape && styles.turnPillNineLandscape, viewerTurn && actionControlsEnabled && styles.turnPillViewer]}
                >
                  <View style={[styles.turnDot, viewerTurn && actionControlsEnabled && styles.turnDotViewer]} />
                  <Text maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} style={[styles.turnCopy, nineLandscape && styles.turnCopyNineLandscape, viewerTurn && actionControlsEnabled && styles.turnCopyViewer]}>{viewerTurn
                      ? t('multiplayer.game.yourTurn')
                      : actingPlayer
                        ? t('multiplayer.game.playerTurn', { name: actingPlayer.name })
                        : t('multiplayer.game.waiting')}</Text>
                </View>
              )}
            </View>
            {(!nineLandscape || !visibleHandResult) && room.seats.map((seat) => {
              const player = hand?.players[seat.playerId];
              if (!player) return null;
              const presentingPlayerAction = spotlightAction?.playerId === player.id;
              const relativeSeat = ((seat.seat - (viewerSeat?.seat ?? 0) + room.config.seatCount)
                % room.config.seatCount) as number;
              return (
                <MultiplayerGameSeat
                  anchorSeat={relativeSeat}
                  actionBubble={presentingPlayerAction ? spotlightPresentation : null}
                  actionKey={presentingPlayerAction ? visibleActionFrame?.key ?? '' : ''}
                  bubbleBoard={gameBoardRect}
                  bubblePane={gameTablePane}
                  canToggleAvatarPrivacy={seatAvatarIdentity(seat) !== null}
                  currentTurn={presentedTurnPlayerId === player.id}
                  handComplete={hand?.street === 'complete'}
                  justActed={presentingPlayerAction}
                  key={player.id}
                  latestAction={presentingPlayerAction
                    ? spotlightLabel
                    : hand ? multiplayerSeatActionLabel(hand, player.id, t) : null}
                  nineLandscape={nineLandscape}
                  ninePortrait={ninePortraitPhone}
                  onMeasuredFrame={(rect) => recordGameSeatRect(player.id, rect)}
                  onToggleSeatPrivacy={toggleSeatPrivacy}
                  player={player}
                  presentedAction={presentingPlayerAction ? spotlightAction : null}
                  presentedAllIn={presentingPlayerAction && spotlightAllIn}
                  role={hand ? multiplayerSeatRole(hand, player.id) : null}
                  roomId={room.roomId}
                  seat={seat}
                  seatCount={room.config.seatCount}
                  tablet={tablet}
                  onOpenProfile={readOnlyOverlayPolicy.openable
                    ? () => setProfileSeat({
                        playerId: player.id,
                        kind: seat.kind,
                      })
                    : undefined}
                  seatFrame={gameSeatRects[player.id] ?? null}
                  viewer={player.id === room.viewerPlayerId}
                  visibility={seatPrivacyVisibility(seat)}
                  wide={wide}
                  winner={winningPlayerIds.has(player.id)}
                />
              );
            })}
            <TableMomentLanesView
              incoming={[...moments, ...localMomentEnvelopes].filter(
                (envelope) => envelope.handNumber === hand?.handNumber,
              )}
              playerNames={tableMomentPlayerNames}
              preferences={momentPreferences}
              reducedMotion={reduceMotion}
            />
            <TableAllInFlashView
              flashes={allInFlashes}
              onPresented={onAllInPresented}
              reduceMotion={reduceMotion}
              soundEnabled
            />
          </View>
      </View>
      <View style={[
        styles.gameSideRail,
        activityLayout.mode === 'rail' && styles.gameSideRailLandscape,
        activityLayout.mode === 'rail' && { width: activityLayout.railWidth },
      ]}>
      <TableActivityFeed
        events={activityEvents}
        handKey={`private:${room.roomId}:${hand?.handNumber ?? 'lobby'}`}
        mode={activityLayout.mode}
      />
      <View style={styles.gameControlRail}>
        <View style={styles.gameControlRailMain}>
          <MultiplayerActionPanel
            room={room}
            busy={busy}
            presentationReady={presentationReady}
            actionPending={Boolean(visibleActionFrame)}
            onEndStalledSession={() => { void onCommand({ type: 'end-stalled-session' }); }}
          >
            {actionPanel}
          </MultiplayerActionPanel>
        </View>
        <TableMomentTrayView
          compact={nineLandscape || nineSeat}
          inline
          key={hand?.handNumber ?? 'lobby'}
          onSendMoment={handleSendMoment}
          queueScope={`${room.roomId}:${hand?.handNumber ?? 'lobby'}`}
        />
      </View>
      </View>
      </View>
      {profileSeat ? (
        <Modal animationType="slide" onRequestClose={() => setProfileSeat(null)} transparent visible>
          <View style={styles.profileSheetScrim}>
            <Pressable accessibilityLabel={t('multiway.dialog.close')} accessibilityRole="button" onPress={() => setProfileSeat(null)} style={StyleSheet.absoluteFill} />
            <View accessibilityViewIsModal style={[styles.profileSheetCard, { paddingBottom: 26 }]}>
              <View style={styles.profileSheetHeader}>
                <View style={styles.profileSheetHeaderCopy}>
                  <Text style={styles.profileSheetEyebrow}>{t('profile.eyebrow')}</Text>
                  <Text accessibilityRole="header" numberOfLines={2} style={styles.profileSheetTitle}>{profileSeatTitle}</Text>
                </View>
                <Pressable
                  accessibilityLabel={t('multiway.dialog.close')}
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => setProfileSeat(null)}
                  style={({ pressed }) => [styles.profileSheetClose, pressed && styles.pressed]}
                >
                  <Ionicons color={palette.text} name="close" size={20} />
                </Pressable>
              </View>
              <MultiplayerReadOnlyTurnNotice
                secondsLeft={visibleSecondsLeft}
                visible={readOnlyOverlayPolicy.showTurnNotice}
              />
              <ScrollView showsVerticalScrollIndicator={false} style={styles.profileSheetScroll}>
                {profileSeat.kind === 'ai' ? (
                  (() => {
                    const seat = room.seats.find((s) => s.playerId === profileSeat.playerId);
                    const identity = multiwayAiIdentityForName(seat?.displayName ?? '');
                    return identity ? <AiPlayerProfile identity={identity} size="large" /> : null;
                  })()
                ) : (
                  <>
                    <View style={styles.profileIdentityRow}>
                      <HumanAvatar
                        avatar={humanAvatarOrDefault(room.seats.find((s) => s.playerId === profileSeat.playerId)?.avatar)}
                        displayName={room.seats.find((s) => s.playerId === profileSeat.playerId)?.displayName ?? viewerDisplayName}
                        roomId={room.roomId}
                        size={64}
                      />
                      <Text maxFontSizeMultiplier={1.2} style={styles.profileIdentityPill}>{t('multiplayer.profile.human')}</Text>
                    </View>
                    {profileSeat.playerId === room.viewerPlayerId ? (
                      <PlayStatisticsCard
                        large
                        loading={viewerRecordLoading}
                        statistics={viewerRecord}
                        title={playStatisticsRecordTitle(viewerDisplayName, true, t)}
                      />
                    ) : (
                      <PlayStatisticsCard
                        large
                        loading={false}
                        statistics={publicRecords[profileSeat.playerId] ? publicPlayerRecordStatistics(publicRecords[profileSeat.playerId]!) : null}
                        title={playStatisticsRecordTitle(
                          room.seats.find((s) => s.playerId === profileSeat.playerId)?.displayName ?? t('common.opponent'),
                          false,
                          t,
                        )}
                      />
                    )}
                  </>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
      {statsVisible ? (
        <Modal animationType="slide" onRequestClose={() => setStatsVisible(false)} transparent visible>
          <View style={styles.profileSheetScrim}>
            <Pressable accessibilityLabel={t('multiway.dialog.close')} accessibilityRole="button" onPress={() => setStatsVisible(false)} style={StyleSheet.absoluteFill} />
            <View accessibilityViewIsModal style={[styles.profileSheetCard, { paddingBottom: 26 }]}>
              <View style={styles.profileSheetHeader}>
                <View style={styles.profileSheetHeaderCopy}>
                  <Text style={styles.profileSheetEyebrow}>{t('multiplayer.stats.throughHand', { hand: hand?.handNumber ?? 0 })}</Text>
                  <Text accessibilityRole="header" numberOfLines={2} style={styles.profileSheetTitle}>{t('multiplayer.stats.title')}</Text>
                </View>
                <Pressable
                  accessibilityLabel={t('multiway.dialog.close')}
                  accessibilityRole="button"
                  hitSlop={10}
                  onPress={() => setStatsVisible(false)}
                  style={({ pressed }) => [styles.profileSheetClose, pressed && styles.pressed]}
                >
                  <Ionicons color={palette.text} name="close" size={20} />
                </Pressable>
              </View>
              <MultiplayerReadOnlyTurnNotice
                secondsLeft={visibleSecondsLeft}
                visible={readOnlyOverlayPolicy.showTurnNotice}
              />
              <ScrollView showsVerticalScrollIndicator={false} style={styles.profileSheetScroll}>
                {statsPanel.rows.map((row) => (
                  <View
                    accessibilityLabel={row.accessibilityLabel}
                    key={row.seat}
                    style={styles.statsRow}
                  >
                    <View style={styles.statsRowCopy}>
                      <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.statsRowName}>
                        {room.seats.find((seat) => seat.seat === row.seat)?.displayName ?? row.seat}
                      </Text>
                      <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.statsRowMeta}>
                        {row.identityLabel}{row.qualifierLabel ? ` · ${row.qualifierLabel}` : ''} · {t('multiplayer.stats.rebuys', { count: 0 }) === row.rebuyCountLabel ? row.rebuyCountLabel : row.rebuyCountLabel}
                      </Text>
                      <Text maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.statsRowMeta}>
                        {t('multiplayer.stats.stack', { amount: row.stackLabel })} · {t('multiplayer.stats.buyIn', { amount: row.totalBuyInLabel })}
                      </Text>
                    </View>
                    <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={styles.statsRowResult}>{row.resultLabel}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
      {hand && room.legalActions?.canRaise && actionControlsEnabled ? (
        <BetSizingModal
          bigBlind={hand.bigBlind}
          currentBet={hand.currentBet}
          legal={room.legalActions}
          onClose={() => setBetSizingVisible(false)}
          onConfirm={(target) => {
            setBetSizingVisible(false);
            if (!actionControlsEnabled) return;
            void onCommand({ action: { amount: target, type: 'raise' }, type: 'action' });
          }}
          playerStreetBet={hand.players[room.viewerPlayerId]?.streetBet ?? 0}
          pot={hand.pot}
          visible={betSizingVisible && actionControlsEnabled}
        />
      ) : null}
      {sessionSummary ? (
        <MultiplayerSessionSummaryModal
          busy={busy || sessionHistoryLoading || !presentationReady}
          onClose={() => setSessionSummaryVisible(false)}
          onRematch={viewerMayRematch ? () => {
            void onCommand({ type: 'rematch' }).then((success) => {
              if (success) setSessionSummaryVisible(false);
            });
          } : undefined}
          onReviewHands={() => { void openSessionHistory(); }}
          roomId={room.roomId}
          summary={sessionSummary}
          visible={sessionSummaryVisible}
          wide={wide}
        />
      ) : null}
      <SessionHistoryModal
        hands={sessionHistory}
        onClose={() => setSessionHistoryVisible(false)}
        onPracticeFocus={onPracticeFocus}
        onReplay={(record) => {
          if (record.mode !== 'multiway') return;
          setSessionHistoryVisible(false);
          setReplayHand(record);
        }}
        visible={sessionHistoryVisible}
      />
      <HandReplayModal
        hand={replayHand}
        onClose={() => {
          setReplayHand(null);
          setSessionHistoryVisible(sessionHistory.length > 0);
        }}
      />
    </View>
  );
}

function MultiplayerBoard({
  board,
  street,
  variant,
  wide,
}: {
  board: NonNullable<MultiplayerViewerProjection['hand']>['board'];
  street: Street;
  variant: SharedTableCardVariant;
  wide: boolean;
}) {
  const { palette } = useAppTheme();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(palette, wide), [palette, wide]);
  const progress = useRef(new Animated.Value(1)).current;
  const boardStage = board.length >= 5 ? 'river' : board.length === 4 ? 'turn' : board.length >= 3 ? 'flop' : 'preflop';
  const presentationStage = street === 'complete' ? boardStage : street;
  const visibleBoardCount = presentationStage === 'preflop'
    ? 0
    : presentationStage === 'flop' ? 3 : presentationStage === 'turn' ? 4 : 5;

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return undefined;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      duration: 180,
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [presentationStage, progress, reduceMotion]);

  return (
    <Animated.View
      style={[
        styles.boardCards,
        {
          opacity: progress,
          transform: [{
            translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-4, 0] }),
          }],
        },
      ]}
    >
      <SharedTableBoard
        board={board}
        gap={wide ? 5 : 3}
        variant={variant}
        visibleCount={visibleBoardCount}
      />
    </Animated.View>
  );
}

function MultiplayerGameSeat({
  actionBubble,
  actionKey,
  anchorSeat,
  bubbleBoard,
  bubblePane,
  canToggleAvatarPrivacy,
  currentTurn,
  handComplete,
  justActed,
  latestAction,
  nineLandscape = false,
  ninePortrait = false,
  onMeasuredFrame,
  onOpenProfile,
  onToggleSeatPrivacy,
  player,
  presentedAction,
  presentedAllIn,
  role,
  roomId,
  seat,
  seatCount,
  seatFrame,
  tablet,
  viewer,
  visibility,
  wide,
  winner,
}: {
  actionBubble: MultiplayerActionBubblePresentation | null;
  actionKey: string;
  anchorSeat: number;
  /** Protected center lane and measured safe felt pane in table coordinates. */
  bubbleBoard: MultiwayLayoutRect | null;
  bubblePane: MultiwayLayoutRect | null;
  /** True only when the seat carries an uploaded avatar; only then is the
   * hide/show long-press action (and its accessibility hint) exposed. */
  canToggleAvatarPrivacy: boolean;
  currentTurn: boolean;
  handComplete: boolean;
  justActed: boolean;
  latestAction: string | null;
  /** Nine-seat phone-landscape compact row: cards and label share one line in
   * a 72-point seat, so the transient bubble and the role badge step aside and
   * the persistent action meta line carries the last action instead. */
  nineLandscape?: boolean;
  /** Nine-seat phone portrait ring; keeps all seats visible without rotating. */
  ninePortrait?: boolean;
  /** Single tap opens the shared player profile; absent while the viewer
   * plaque has no authored identity to present. */
  onOpenProfile?: () => void;
  onMeasuredFrame: (frame: MultiwayLayoutRect) => void;
  onToggleSeatPrivacy: (seat: MultiplayerViewerProjection['seats'][number]) => void;
  player: NonNullable<MultiplayerViewerProjection['hand']>['players'][string];
  presentedAction: MultiwayActionRecord | null;
  presentedAllIn: boolean;
  role: MultiplayerSeatRole;
  /** The room this seat renders in; authorizes a foreign uploaded avatar's cached image. */
  roomId: string;
  seat: MultiplayerViewerProjection['seats'][number];
  seatCount: MultiplayerSeatCount;
  seatFrame: MultiwayLayoutRect | null;
  tablet: boolean;
  viewer: boolean;
  visibility: 'show' | 'hide';
  wide: boolean;
  winner: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const { width } = useWindowDimensions();
  // The responsive plaque drives the rendered footprint, the identity copy, the
  // base font sizes, and the single-line stack label. Compute it before the
  // styles so the seat geometry can borrow the footprint below.
  const plaque = useMemo(
    () => resolveMultiplayerPlaqueRender({
      seatCount,
      playerStack: player.stack,
      usableTableWidth: multiplayerTableWidthForScreen(width, 'game', wide ? 'wide' : 'compact'),
      layout: wide ? 'wide' : 'compact',
      tablet,
      viewer,
      hasRole: role != null,
    }),
    [player.stack, seatCount, width, wide, tablet, viewer, role],
  );
  const styles = useMemo(() => createStyles(palette, wide, tablet), [palette, tablet, wide]);
  const plaqueVisual = multiplayerPlaqueVisualTreatment(seat.kind, winner);
  const anchor = ninePortrait
    ? multiplayerNineSeatPhonePortraitAnchor(anchorSeat)
    : multiplayerGameSeatAnchor(seatCount, anchorSeat, wide ? 'wide' : 'compact');
  const topRow = multiplayerSeatIsTopRow(seatCount, anchorSeat);
  const presentingHistoryFrame = presentedAction !== null;
  // A server transition can contain several actions and even a street change.
  // While replaying one frame, keep that actor's compact plaque aligned with
  // the frame instead of leaking its later folded/all-in/current-turn state.
  const displayFolded = !handComplete && (presentingHistoryFrame
    ? presentedAction.type === 'fold'
    : player.folded);
  const displayAllIn = !handComplete && (presentingHistoryFrame ? presentedAllIn : player.allIn);
  const displayCurrentTurn = !handComplete && !presentingHistoryFrame && currentTurn;
  // Human participation states are explicit and localized (scope 3.11F/E):
  // disconnected, sitting-out, rebuy-pending, and permanently departed seats
  // are never imitated by an AI identity, and a human is never shown as
  // AI-controlled (the retired fallback is gone).
  const status = multiplayerSeatStatusBadge(seat, {
    allIn: displayAllIn,
    currentTurn: displayCurrentTurn,
    folded: displayFolded,
    handComplete,
    stack: player.stack,
    viewer,
  }, t);
  // Keep the exact current-street action beneath every non-folded seat even
  // while its transient bubble is telling the same moment with personality.
  const persistentAction = !displayFolded && !handComplete ? latestAction : null;
  const displayName = viewer ? t('multiplayer.lobby.you') : player.name;
  const roleAccessibilityLabel = role === 'D'
    ? t('guide.dealer')
    : role === 'SB' ? t('guide.sb') : role === 'BB' ? t('guide.bb') : null;
  const cards = (
    <View style={[styles.gameSeatCards, nineLandscape && styles.gameSeatCardsNineLandscape]}>
      {Array.from({ length: 2 }, (_, index) => (
        <PlayingCard
          card={player.holeCards[index]}
          compact={wide}
          hidden={!player.holeCards[index]}
          key={`${player.id}-card-${index}`}
          medium={tablet && !wide}
          mini={nineLandscape}
          small={!wide && !tablet && !nineLandscape}
        />
      ))}
    </View>
  );
  const avatarControl = (
    <Pressable
      {...(canToggleAvatarPrivacy
        ? {
            // Touch path: long-press toggles the seat's avatar privacy. The
            // grouped plaque exposes the same toggle as an accessibility
            // action (see the label View above), which is how VoiceOver
            // users activate it.
            accessibilityHint: t('multiplayer.game.avatarPrivacyHint'),
            accessibilityLabel: t('multiplayer.game.avatarPrivacy'),
            accessibilityRole: 'button' as const,
            onLongPress: () => onToggleSeatPrivacy(seat),
          }
        : {
            // Nothing this control could do (authored asset / AI seat).
            accessibilityElementsHidden: true,
            importantForAccessibility: 'no-hide-descendants' as const,
          })}
      hitSlop={8}
      style={[styles.gameSeatAvatar, nineLandscape && styles.gameSeatAvatarNineLandscape, seat.kind === 'ai' && styles.gameSeatAvatarImage]}
    >
      {seat.kind === 'ai' ? (
        <AiAvatar name={player.name} size={nineLandscape ? 14 : wide ? 32 : tablet ? 26 : 20} />
      ) : (
        <HumanAvatar
          avatar={humanAvatarOrDefault(seat.avatar)}
          displayName={player.name}
          roomId={roomId}
          size={nineLandscape ? 14 : wide ? 32 : tablet ? 26 : 20}
          visibility={visibility}
        />
      )}
    </Pressable>
  );
  const metaLine = (persistentAction || status) && (
    <Text adjustsFontSizeToFit maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} minimumFontScale={0.72} numberOfLines={1} style={[styles.gameSeatMeta, { fontSize: plaque.metaFontSize }]}>
      {persistentAction ? <Text style={styles.gameSeatAction}>{persistentAction}</Text> : null}
      {persistentAction && status ? <Text style={styles.gameSeatMetaDivider}> · </Text> : null}
      {status ? <Text style={styles.gameSeatStatus}>{status}</Text> : null}
    </Text>
  );
  const label = (
    <View
      accessibilityActions={[
        ...(canToggleAvatarPrivacy
          ? [{ name: 'toggleAvatarPrivacy', label: t('multiplayer.game.avatarPrivacy') }]
          : []),
      ]}
      accessibilityLabel={[
        displayName,
        seat.kind === 'ai' ? t('multiplayer.lobby.ai') : null,
        winner ? t('multiway.result.opponentWins', { player: displayName }) : null,
        roleAccessibilityLabel,
        formatChips(player.stack),
        persistentAction,
        status,
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={onOpenProfile ? t('multiway.seat.openProfileHint') : undefined}
      accessible
      onAccessibilityAction={(event) => {
        // The plaque is a single grouped accessibility element, so controls
        // inside it cannot be independently reachable children. The privacy
        // action lives on the group instead: activation runs the same toggle
        // as the touch path, which VoiceOver users otherwise could not reach.
        if (event.nativeEvent.actionName === 'toggleAvatarPrivacy') {
          onToggleSeatPrivacy(seat);
        }
      }}
      style={[
        styles.gameSeatLabel,
        nineLandscape && styles.gameSeatLabelNineLandscape,
        plaqueVisual.borderStyle === 'dashed' && styles.gameSeatLabelAi,
        displayCurrentTurn && styles.gameSeatLabelActive,
        justActed && styles.gameSeatLabelJustActed,
        plaqueVisual.tone === 'winner' && styles.gameSeatLabelWinner,
      ]}
    >
      {nineLandscape ? (
        <>
          <View style={styles.gameSeatNameRowNineLandscape}>
            {avatarControl}
            <Text adjustsFontSizeToFit maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} minimumFontScale={0.72} numberOfLines={1} style={[styles.gameSeatName, { flex: 1, fontSize: plaque.nameFontSize }]}>{displayName}</Text>
            <Text adjustsFontSizeToFit maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} minimumFontScale={0.72} numberOfLines={1} style={[styles.gameSeatStack, { fontSize: plaque.stackFontSize }]}>{plaque.stackLabel}</Text>
          </View>
          {metaLine}
        </>
      ) : (
        <>
          {role && (
            <View style={styles.gameRoleBadge}>
              <Text maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} style={styles.gameRoleBadgeText}>{role}</Text>
            </View>
          )}
          {avatarControl}
          <View style={[styles.gameSeatIdentityCopy, role && styles.gameSeatIdentityCopyWithRole]}>
            <View style={styles.gameSeatNameRow}>
              <Text adjustsFontSizeToFit maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} minimumFontScale={0.72} numberOfLines={1} style={[styles.gameSeatName, { fontSize: plaque.nameFontSize }]}>{displayName}</Text>
            </View>
            <Text adjustsFontSizeToFit maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} style={[styles.gameSeatStack, { fontSize: plaque.stackFontSize }]} minimumFontScale={0.72} numberOfLines={1}>{plaque.stackLabel}</Text>
            {metaLine}
          </View>
        </>
      )}
    </View>
  );
  return (
    <Pressable
      disabled={!onOpenProfile}
      onLayout={(event) => {
        const { height, width, x, y } = event.nativeEvent.layout;
        onMeasuredFrame({ bottom: y + height, left: x, right: x + width, top: y });
      }}
      onPress={onOpenProfile}
      style={[
      styles.gameSeat,
      anchor,
      viewer && styles.gameSeatViewer,
      nineLandscape && styles.gameSeatNineLandscape,
      // The responsive plaque defines the rendered footprint, so the seat widens
      // on larger screens while the 33% seat anchors keep its lane non-overlapping.
      { width: plaque.footprintWidth },
      displayCurrentTurn && styles.gameSeatActive,
      justActed && styles.gameSeatJustActed,
      winner && styles.gameSeatWinner,
      displayFolded && styles.gameSeatFolded,
    ]}>
      {nineLandscape ? (
        <>
          {cards}
          {label}
        </>
      ) : (
        <>
          {topRow ? label : cards}
          {topRow ? cards : label}
        </>
      )}
      {actionBubble && !nineLandscape && (
        <MultiplayerSeatActionBubble
          actionKey={actionKey}
          actorName={viewer ? t('common.you') : player.name}
          board={bubbleBoard}
          horizontal={multiplayerSeatHorizontalAlignment(seatCount, anchorSeat, wide ? 'wide' : 'compact')}
          pane={bubblePane}
          presentation={actionBubble}
          seatFrame={seatFrame}
          tablet={tablet}
          topRow={topRow}
          wide={wide}
        />
      )}
    </Pressable>
  );
}

function MultiplayerSeatActionBubble({
  actionKey,
  actorName,
  board,
  horizontal,
  pane,
  presentation,
  seatFrame,
  tablet,
  topRow,
  wide,
}: {
  actionKey: string;
  actorName: string;
  board: MultiwayLayoutRect | null;
  horizontal: 'center' | 'left' | 'right';
  pane: MultiwayLayoutRect | null;
  presentation: MultiplayerActionBubblePresentation;
  seatFrame: MultiwayLayoutRect | null;
  tablet: boolean;
  topRow: boolean;
  wide: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(palette, wide, tablet), [palette, tablet, wide]);
  const progress = useRef(new Animated.Value(0)).current;
  const [bubbleContentSize, setBubbleContentSize] = useState<{ height: number; width: number } | null>(null);
  const accessibilityMessage = `${t('multiplayer.game.actionHistory')}. ${actorName}. ${presentation.text}`;
  useActionBubbleAnnouncement(actionKey, accessibilityMessage);

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return undefined;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      duration: 140,
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [actionKey, progress, reduceMotion]);

  useEffect(() => {
    setBubbleContentSize(null);
  }, [actionKey]);

  const maxBubbleWidth = wide ? 224 : tablet ? 190 : 148;
  const fallbackBubbleHeight = wide ? 50 : tablet ? 46 : 36;
  const tailSize = wide ? 9 : tablet ? 8 : 7;
  // Six points on every side contain the border, shadow, and rotated tail in
  // the frame passed to the measured resolver; the text/card itself is
  // measured by native layout after localization and font scaling.
  const bubbleWidth = Math.min(maxBubbleWidth, bubbleContentSize?.width ?? maxBubbleWidth) + 12;
  const bubbleHeight = (bubbleContentSize?.height ?? fallbackBubbleHeight) + 12;
  const measuredLayout = pane && seatFrame && bubbleContentSize
    ? resolveMultiplayerMeasuredBubbleLayout({
        board,
        bubbleHeight,
        bubbleWidth,
        horizontal,
        pane,
        prefer: topRow ? 'below' : 'above',
        seat: seatFrame,
        tailSize,
      })
    : null;
  const below = measuredLayout ? measuredLayout.placement === 'below' : topRow;

  return (
    <Animated.View
      accessibilityLabel={accessibilityMessage}
      accessibilityLiveRegion="polite"
      accessible
      pointerEvents="none"
      style={[
        styles.seatActionBubbleAnchor,
        measuredLayout
          ? measuredLayout.localStyle
          : [
              { width: maxBubbleWidth },
              horizontal === 'left'
                ? styles.seatActionBubbleAlignLeft
                : horizontal === 'right' ? styles.seatActionBubbleAlignRight : styles.seatActionBubbleAlignCenter,
              topRow ? styles.seatActionBubbleBelow : styles.seatActionBubbleAbove,
            ],
        {
          opacity: progress,
          transform: [{
            scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }),
          }, {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [below ? -6 : 6, 0],
            }),
          }],
        },
      ]}
    >
      <View style={[
        styles.seatActionBubble,
        measuredLayout && (below ? styles.seatActionBubbleMeasuredBelow : styles.seatActionBubbleMeasuredAbove),
        presentation.tone === 'fold' && styles.seatActionBubbleFold,
        presentation.tone === 'check' && styles.seatActionBubbleCheck,
        presentation.tone === 'call' && styles.seatActionBubbleCall,
        presentation.tone === 'aggressive' && styles.seatActionBubbleAggressive,
        presentation.tone === 'all-in' && styles.seatActionBubbleAllIn,
      ]}
      onLayout={(event) => {
        const { height, width } = event.nativeEvent.layout;
        setBubbleContentSize((previous) => previous
          && previous.width === width
          && previous.height === height
          ? previous
          : { height, width });
      }}>
        <ActionBubbleText
          emphasis={presentation.emphasis}
          maxFontSizeMultiplier={1}
          numberOfLines={2}
          style={styles.seatActionBubbleText}
          text={presentation.text}
        />
      </View>
      <View style={[
        styles.seatActionBubbleTail,
        measuredLayout
          ? [
              { left: measuredLayout.tailLeft },
              below ? styles.seatActionBubbleTailTopMeasured : styles.seatActionBubbleTailBottomMeasured,
            ]
          : topRow ? styles.seatActionBubbleTailTop : styles.seatActionBubbleTailBottom,
      ]} />
    </Animated.View>
  );
}

function MultiplayerHandResultPanel({
  busy,
  countdownActionLabel,
  countdownLabel,
  note,
  onCountdownPress,
  onPress,
  primaryLabel,
  result,
  wide,
}: {
  busy: boolean;
  countdownActionLabel?: string;
  countdownLabel?: string;
  note?: string;
  onCountdownPress?: () => void;
  onPress?: () => void;
  primaryLabel?: string;
  result: MultiplayerResultPresentation;
  wide: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, wide), [palette, wide]);
  const accent = result.tone === 'win'
    ? palette.aqua
    : result.tone === 'split' ? palette.primary : palette.danger;
  const payoutAccessibility = result.payouts.map((payout) => t('multiplayer.result.payout', {
    amount: formatChips(payout.amount),
    player: payout.label,
  })).join('. ');
  return (
    <View style={[styles.resultPanel, wide && styles.resultPanelWide, { borderColor: accent }]}>
      <View style={[styles.resultIcon, { backgroundColor: result.tone === 'win' ? palette.aquaSoft : palette.accentSoft }]}>
        <Ionicons
          color={accent}
          name={result.tone === 'split' ? 'git-compare-outline' : 'trophy-outline'}
          size={wide ? 25 : 20}
        />
      </View>
      <View
        accessibilityLabel={`${result.title}. ${result.detail} ${payoutAccessibility}. ${t('multiplayer.result.finalPot', {
          amount: formatChips(result.totalPot),
        })}`}
        accessibilityLiveRegion="polite"
        accessible
        style={styles.resultCopy}
      >
        <View style={styles.resultHeadline}>
          <Text adjustsFontSizeToFit maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} minimumFontScale={0.76} numberOfLines={1} style={styles.resultTitle}>{result.title}</Text>
          {result.headlineAmount !== null && (
            <Text maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} numberOfLines={1} style={styles.resultAmount}>{formatChips(result.headlineAmount)}</Text>
          )}
        </View>
        <Text maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} numberOfLines={2} style={styles.resultDetail}>{result.detail}</Text>
        <View style={styles.resultPayouts}>
          {result.payouts.map((payout) => (
            <Text adjustsFontSizeToFit key={payout.playerId} maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} minimumFontScale={0.7} numberOfLines={1} style={styles.resultPayout}>
              {t('multiplayer.result.payout', {
                amount: formatChips(payout.amount),
                player: payout.label,
              })}
            </Text>
          ))}
          <Text maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} style={styles.resultPot}>{t('multiplayer.result.finalPot', {
            amount: formatChips(result.totalPot),
          })}</Text>
        </View>
        {countdownLabel ? (
          <Pressable
            accessibilityLabel={countdownActionLabel
              ? `${countdownLabel}. ${countdownActionLabel}`
              : countdownLabel}
            accessibilityRole={onCountdownPress ? 'button' : undefined}
            accessibilityState={onCountdownPress ? { disabled: busy } : undefined}
            disabled={busy || !onCountdownPress}
            onPress={onCountdownPress}
            style={({ pressed }) => [
              styles.resultCountdown,
              busy && styles.disabled,
              pressed && !busy && styles.pressed,
            ]}
          >
            <Ionicons color={palette.primary} name="timer-outline" size={13} />
            <Text maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} numberOfLines={1} style={styles.resultCountdownText}>
              {countdownLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {primaryLabel && onPress ? (
        <Pressable
          accessibilityLabel={primaryLabel}
          accessibilityRole="button"
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          onPress={onPress}
          style={({ pressed }) => [styles.resultButton, busy && styles.disabled, pressed && !busy && styles.pressed]}
        >
          {busy ? <ActivityIndicator color={palette.primaryText} size="small" /> : (
            <>
              <Text adjustsFontSizeToFit maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} minimumFontScale={0.72} numberOfLines={1} style={styles.resultButtonText}>{primaryLabel}</Text>
              <Ionicons color={palette.primaryText} name="arrow-forward" size={wide ? 18 : 16} />
            </>
          )}
        </Pressable>
      ) : note ? <Text maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} numberOfLines={2} style={styles.resultNote}>{note}</Text> : null}
    </View>
  );
}

function GameActionButton({
  danger = false,
  disabled,
  icon,
  label,
  onPress,
  primary = false,
  wide,
}: {
  danger?: boolean;
  disabled: boolean;
  icon?: 'options-outline';
  label: string;
  onPress: () => void;
  primary?: boolean;
  wide: boolean;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, wide), [palette, wide]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.gameAction,
        danger && styles.gameActionDanger,
        primary && styles.gameActionPrimary,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      {icon ? <Ionicons color={primary ? palette.primaryText : palette.text} name={icon} size={wide ? 19 : 16} /> : null}
      <Text adjustsFontSizeToFit maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} minimumFontScale={0.72} numberOfLines={1} style={[
        styles.gameActionText,
        danger && styles.gameActionTextDanger,
        primary && styles.gameActionTextPrimary,
      ]}>{label}</Text>
    </Pressable>
  );
}

function LobbySeat({
  anchorSeat,
  busy,
  frame,
  hostMode,
  onPress,
  roomId,
  seat,
  seatCount,
  ninePortrait,
  tablet,
  wide,
}: {
  anchorSeat: number;
  busy: boolean;
  /** Measured felt-relative pixel frame from the layout resolver; when absent
   * the seat falls back to its percentage anchor for the first frame. */
  frame?: { height: number; left: number; top: number; width: number };
  hostMode: boolean;
  onPress: () => void;
  roomId: string;
  seat: MultiplayerLobbySeat;
  seatCount: MultiplayerSeatCount;
  /** The prepared nine-seat phone room previews the exact live-game ring. */
  ninePortrait: boolean;
  tablet: boolean;
  wide: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, wide, tablet), [palette, tablet, wide]);
  const anchor = multiplayerLobbySeatAnchor(
    seatCount,
    anchorSeat,
    wide ? 'wide' : 'compact',
    ninePortrait,
  );
  const containerSize = wide ? 40 : tablet ? 32 : 22;
  const label = seat.kind === 'open'
    ? t('multiplayer.lobby.openSeat')
    : seat.displayName ?? t('common.opponent');
  const status: string | null = seat.kind === 'ai'
    ? t(hostMode ? 'multiplayer.lobby.removeAi' : 'multiplayer.lobby.ai')
    : seat.kind === 'open'
      ? hostMode ? t('multiplayer.lobby.addAi') : null
      : seat.isViewer
        ? t('multiplayer.lobby.you')
        : seat.isHost
          ? t('multiplayer.lobby.host')
          : seat.ready ? t('multiplayer.lobby.ready') : t('multiplayer.lobby.notReady');
  const enabled = !busy && hostMode && seat.kind !== 'human';
  return (
    <Pressable
      accessibilityHint={enabled ? status ?? undefined : undefined}
      accessibilityLabel={[label, status].filter(Boolean).join('. ')}
      accessibilityRole={enabled ? 'button' : undefined}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.lobbySeat,
        frame ?? anchor,
        seat.kind === 'open' && styles.lobbySeatOpen,
        seat.isViewer && styles.lobbySeatViewer,
        pressed && enabled && styles.pressed,
      ]}
    >
      <View style={[
        styles.seatAvatar,
        seat.kind === 'ai' && styles.seatAvatarAi,
        seat.kind === 'open' && styles.seatAvatarOpen,
      ]}>
        {seat.kind === 'human' ? (
          <HumanAvatar
            accessibilityLabel={label}
            avatar={humanAvatarOrDefault(seat.avatar)}
            displayName={seat.displayName ?? undefined}
            roomId={roomId}
            size={containerSize}
          />
        ) : seat.kind === 'ai' ? (
          <AiAvatar
            name={seat.displayName ?? t('common.opponent')}
            size={containerSize}
          />
        ) : (
          <Ionicons
            color={palette.aqua}
            name={seat.kind === 'open' ? 'add' : 'person'}
            size={wide ? 20 : tablet ? 18 : 15}
          />
        )}
      </View>
      <View style={styles.seatCopy}>
        <Text adjustsFontSizeToFit maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} minimumFontScale={0.72} numberOfLines={1} style={[styles.seatName, seat.kind === 'open' && styles.seatNameOpen]}>{label}</Text>
        {status ? (
          <Text maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} numberOfLines={1} style={[
            styles.seatStatus,
            seat.kind === 'open' && styles.seatStatusOpen,
            seat.ready && styles.seatStatusReady,
          ]}>{status}</Text>
        ) : null}
      </View>
      {seat.isHost && <Ionicons color={palette.aqua} name="star" size={wide ? 13 : tablet ? 12 : 10} style={styles.hostStar} />}
    </Pressable>
  );
}

function createStyles(palette: ThemePalette, wide: boolean, tablet = wide) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    resumeLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: wide ? 18 : 13, paddingHorizontal: 28 },
    resumeLoadingIcon: { width: wide ? 76 : 58, height: wide ? 76 : 58, alignItems: 'center', justifyContent: 'center', borderRadius: wide ? 24 : 19, backgroundColor: palette.accentSoft },
    resumeLoadingTitle: { color: palette.text, fontSize: wide ? 18 : 14, lineHeight: wide ? 24 : 20, fontWeight: '800', textAlign: 'center' },
    transportBanner: { zIndex: 50, width: '100%', minHeight: wide ? 38 : 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wide ? 8 : 6, paddingHorizontal: wide ? 13 : 9 },
    transportBannerDisconnected: { backgroundColor: palette.danger },
    transportBannerRestored: { borderWidth: 1, borderColor: palette.aqua, backgroundColor: palette.aquaSoft },
    transportBannerText: { flexShrink: 1, color: palette.primaryText, fontSize: wide ? 12 : 10, fontWeight: '900', textAlign: 'center' },
    transportBannerTextRestored: { color: palette.aquaText },
    transportBannerInline: { flex: 1, width: 'auto', minHeight: 44, alignSelf: 'center', marginLeft: 7, borderRadius: 12, paddingHorizontal: 8 },
    transportBannerTextInline: { fontSize: 10, lineHeight: 12 },
    header: { height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: wide ? 28 : 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
    headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    headerCloseButton: { marginLeft: 'auto' },
    headerButtonSpacer: { width: 44, height: 44 },
    identityRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    identityCopy: { flex: 1, gap: 1 },
    identityName: { color: palette.text, fontSize: 15, lineHeight: 20, fontWeight: '800' },
    identityNote: { color: palette.muted, fontSize: 11, lineHeight: 15 },
    captionNote: { color: palette.muted, fontSize: 11.5, lineHeight: 17 },
    formScroll: { flex: 1, minHeight: 0 },
    content: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 22, paddingHorizontal: wide ? 30 : 18, paddingTop: wide ? 26 : 20, paddingBottom: 28 },
    joinContent: { maxWidth: 560, paddingTop: wide ? 58 : 32 },
    intro: { flex: wide ? 1 : undefined, minWidth: 0, gap: 5 },
    eyebrow: { color: palette.primary, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.05, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: wide ? 30 : tablet ? 28 : 25, lineHeight: wide ? 37 : tablet ? 35 : 31, fontWeight: '800', letterSpacing: -0.65 },
    description: { maxWidth: 590, color: palette.muted, fontSize: wide ? 15 : tablet ? 14 : 13, lineHeight: wide ? 22 : tablet ? 21 : 19 },
    form: { gap: 20 },
    formWide: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18 },
    fullWidth: { width: '100%' },
    fieldLabel: { color: palette.text, fontSize: wide ? 14 : tablet ? 13 : 12, fontWeight: '800', marginBottom: 6 },
    fieldHint: { color: palette.muted, fontSize: 10.5, lineHeight: 15, marginTop: 6 },
    input: { minHeight: 49, paddingHorizontal: 14, borderRadius: 13, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, color: palette.text, fontSize: 15, fontWeight: '600' },
    codeInput: { height: 64, textAlign: 'center', fontSize: 26, fontWeight: '900', letterSpacing: 7, color: palette.primary },
    fieldDivider: { height: StyleSheet.hairlineWidth, marginVertical: 18, backgroundColor: palette.border },
    optionGroup: { flexGrow: 1, flexBasis: wide ? '47%' : '100%' },
    optionRow: { flexDirection: 'row', gap: 7 },
    option: { flex: 1, minHeight: wide || tablet ? 48 : 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    optionSelected: { borderColor: palette.primary, backgroundColor: palette.primary },
    optionText: { color: palette.muted, fontSize: wide ? 13.5 : tablet ? 12.5 : 11, lineHeight: wide ? 18 : tablet ? 17 : 14, fontWeight: '800', textAlign: 'center' },
    optionTextSelected: { color: palette.primaryText },
    optionTextNumeric: { fontSize: wide ? 18 : tablet ? 17 : 16, lineHeight: wide ? 24 : tablet ? 22 : 21 },
    noteStack: { width: '100%', gap: 8 },
    joinCard: { padding: 18, borderRadius: 19, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceRaised, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.07, shadowRadius: 20, elevation: 2 },
    bottomBar: { flexShrink: 0, gap: 7, paddingHorizontal: wide ? 30 : 18, paddingTop: 10, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, backgroundColor: palette.background },
    bottomNote: { color: palette.muted, fontSize: 10.5, lineHeight: 14, textAlign: 'center' },
    bottomButton: { width: '100%', maxWidth: 700, minHeight: 50, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18, borderRadius: 14, backgroundColor: palette.primary, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 2 },
    bottomButtonText: { color: palette.primaryText, fontSize: 14, fontWeight: '800' },
    lobbyContent: { width: '100%', maxWidth: MULTIPLAYER_LOBBY_SHELL_MAX_WIDTH, alignSelf: 'center', gap: wide ? 16 : 13, paddingHorizontal: wide ? MULTIPLAYER_WIDE_LOBBY_HORIZONTAL_PADDING : MULTIPLAYER_COMPACT_LOBBY_HORIZONTAL_PADDING, paddingTop: wide ? 16 : 12, paddingBottom: 12 },
    lobbyTop: { gap: 13, paddingHorizontal: wide ? 0 : 6 },
    lobbyTopWide: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 },
    lobbyRules: { width: wide ? '100%' : undefined, maxWidth: wide ? 520 : tablet ? 560 : undefined, flexDirection: 'row', alignItems: 'center', gap: wide || tablet ? 8 : 6, marginTop: wide ? 5 : 3 },
    lobbyRulesCopy: { flex: 1, minWidth: 0, gap: 1 },
    lobbyRulesTitle: { color: palette.muted, fontSize: wide || tablet ? 12.5 : 10.5, lineHeight: wide || tablet ? 17 : 14, fontWeight: '800' },
    codeCard: { minWidth: wide ? 300 : undefined, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 18, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    codeLabel: { color: palette.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
    codeValue: { color: palette.text, fontSize: 20, fontWeight: '900', letterSpacing: 3, marginTop: 2 },
    codeUnavailable: { maxWidth: wide ? 300 : 240, color: palette.muted, fontSize: wide ? 11.5 : 10, lineHeight: wide ? 17 : 14, marginTop: 3 },
    shareButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, borderRadius: 12, backgroundColor: palette.accentSoft },
    shareText: { color: palette.primary, fontSize: 11, fontWeight: '800' },
    inviteScrim: { flex: 1, alignItems: 'center', justifyContent: wide ? 'center' : 'flex-end', paddingHorizontal: wide ? 24 : 12, paddingTop: 12, backgroundColor: palette.scrim },
    inviteSheet: { width: '100%', maxWidth: wide ? 520 : 460, maxHeight: '94%', borderRadius: wide ? 26 : 22, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceRaised, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.2, shadowRadius: 28, elevation: 8 },
    inviteSheetScroll: { flexShrink: 1, width: '100%' },
    inviteSheetContent: { gap: wide ? 16 : 13, padding: wide ? 24 : 18 },
    inviteHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    inviteHeaderCopy: { flex: 1, minWidth: 0, gap: 3 },
    inviteEyebrow: { color: palette.primary, fontSize: wide ? 11 : 9.5, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
    inviteTitle: { color: palette.text, fontSize: wide ? 25 : 21, lineHeight: wide ? 31 : 27, fontWeight: '900', letterSpacing: -0.4 },
    inviteCloseButton: { width: 40, height: 40, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.soft },
    inviteDescription: { color: palette.muted, fontSize: wide ? 13 : 11.5, lineHeight: wide ? 19 : 17 },
    // The QR card stays white in both themes so the camera can scan it.
    inviteQrCard: { alignSelf: 'center', alignItems: 'center', gap: wide ? 14 : 11, padding: wide ? 18 : 14, borderRadius: wide ? 22 : 18, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.qrSurface },
    inviteCodeWrap: { alignItems: 'center', gap: 3 },
    inviteScanLabel: { color: palette.qrMuted, fontSize: wide ? 11 : 9.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.75 },
    inviteCode: { color: palette.qrText, fontSize: wide ? 24 : 20, fontWeight: '900', letterSpacing: wide ? 5 : 4, fontVariant: ['tabular-nums'] },
    inviteActions: { flexDirection: 'row', gap: wide ? 10 : 8 },
    inviteSecondaryButton: { flex: 1, minHeight: wide ? 52 : 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    inviteSecondaryText: { color: palette.primary, fontSize: wide ? 13 : 11.5, fontWeight: '900', textAlign: 'center' },
    invitePrimaryButton: { flex: 1, minHeight: wide ? 52 : 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10, borderRadius: 14, backgroundColor: palette.primary },
    invitePrimaryText: { color: palette.primaryText, fontSize: wide ? 13 : 11.5, fontWeight: '900', textAlign: 'center' },
    lobbyTableWrap: { width: '100%', maxWidth: MULTIPLAYER_LOBBY_TABLE_MAX_WIDTH, alignSelf: 'center' },
    lobbyTable: { flex: 1, overflow: 'hidden', borderRadius: wide ? 22 : 18, borderWidth: 2, borderColor: palette.tableLine, backgroundColor: palette.table },
    rebuyDecisionCard: { gap: 10, padding: 14, borderRadius: 16, backgroundColor: palette.accentSoft, borderWidth: 1, borderColor: palette.primary },
    rebuyDecisionText: { color: palette.text, fontSize: 12.5, lineHeight: 17, fontWeight: '700' },
    rebuyDecisionActions: { flexDirection: 'row', gap: 8 },
    rebuyDecisionPrimary: { minHeight: 44, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.primary, paddingHorizontal: 12 },
    rebuyDecisionPrimaryText: { color: palette.primaryText, fontSize: 13, fontWeight: '800' },
    rebuyDecisionSecondary: { minHeight: 44, flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, paddingHorizontal: 12 },
    rebuyDecisionSecondaryText: { color: palette.text, fontSize: 13, fontWeight: '800' },
    gameStatsButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.soft },
    statsRow: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between', paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
    statsRowCopy: { flex: 1, minWidth: 0, gap: 1 },
    statsRowName: { color: palette.text, fontSize: 13, fontWeight: '800' },
    statsRowMeta: { color: palette.muted, fontSize: 10.5, fontWeight: '600' },
    statsRowResult: { color: palette.primary, fontSize: 13, fontWeight: '800' },
    profileSheetScrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: palette.scrim },
    profileSheetCard: { maxHeight: '86%', gap: 12, padding: 18, borderRadius: 24, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    profileSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    profileSheetHeaderCopy: { flex: 1, minWidth: 0, paddingRight: 8 },
    profileSheetEyebrow: { color: palette.primary, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    profileSheetTitle: { color: palette.text, fontSize: 21, fontWeight: '700', marginTop: 3 },
    profileSheetClose: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.soft },
    profileSheetScroll: { flexGrow: 0 },
    profileIdentityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 4 },
    profileIdentityPill: { color: palette.muted, fontSize: 11, fontWeight: '900', letterSpacing: 0.5, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: palette.soft, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
    lobbyStatusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 24, paddingHorizontal: 12 },
    lobbyStatusText: { color: palette.muted, fontSize: 12, fontWeight: '700', textAlign: 'center' },
    lobbyTableWrapPending: { minHeight: 200 },
    lobbySeat: { position: 'absolute', width: multiplayerSeatFootprintWidth(wide ? 'wide' : 'compact', 'lobby', false, tablet && !wide), minHeight: wide ? 80 : tablet ? 68 : 56, flexDirection: 'row', alignItems: 'center', gap: wide ? 10 : tablet ? 7 : 4, padding: wide ? 12 : tablet ? 8 : 5, borderRadius: wide ? 17 : tablet ? 15 : 14, borderWidth: 1.5, borderColor: palette.tableLine, backgroundColor: palette.tableDeep },
    lobbySeatOpen: { borderColor: palette.aqua, borderStyle: 'dashed', backgroundColor: palette.tableDeep },
    lobbySeatViewer: { borderColor: palette.aqua, borderWidth: 2 },
    seatAvatar: { width: wide ? 40 : tablet ? 32 : 22, height: wide ? 40 : tablet ? 32 : 22, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: wide ? 20 : tablet ? 16 : 11, backgroundColor: palette.aquaSoft },
    seatAvatarAi: { backgroundColor: palette.accentSoft },
    seatAvatarOpen: { borderWidth: 1, borderColor: palette.tableLine, backgroundColor: palette.table },
    seatCopy: { flex: 1, minWidth: 0, gap: 1 },
    seatName: { color: palette.tableText, fontSize: wide ? 15 : tablet ? 12.5 : 9.5, fontWeight: '800' },
    seatNameOpen: { color: palette.tableText },
    seatStatus: { color: palette.tableLine, fontSize: wide ? 11 : tablet ? 9.5 : 7.5, fontWeight: '700' },
    seatStatusOpen: { color: palette.aqua },
    seatStatusReady: { color: palette.aqua },
    hostStar: { position: 'absolute', right: wide ? 7 : tablet ? 6 : 5, top: wide ? 6 : tablet ? 5 : 4 },
    gameScreen: { flex: 1, width: '100%', maxWidth: MULTIPLAYER_GAME_SHELL_MAX_WIDTH, alignSelf: 'center', gap: wide ? 10 : 6, paddingHorizontal: wide ? MULTIPLAYER_WIDE_GAME_HORIZONTAL_PADDING : MULTIPLAYER_COMPACT_GAME_HORIZONTAL_PADDING, paddingTop: wide ? 6 : 3, paddingBottom: 7 },
    gameBody: { flex: 1, gap: wide ? 10 : 6 },
    gameBodyLandscape: { alignItems: 'stretch', flexDirection: 'row' },
    gameHeader: { minHeight: wide ? 56 : 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: wide ? 7 : 5 },
    gameExitButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    gameHeaderTitleWrap: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: wide ? 12 : 7 },
    gameHeaderTitle: { color: palette.text, fontSize: wide ? 18 : 14, fontWeight: '900', textAlign: 'center' },
    gameHeaderTrailing: { minWidth: wide ? 132 : 104, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: wide ? 7 : 4 },
    timerPill: { minWidth: wide ? 82 : 62, minHeight: wide ? 38 : 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wide ? 6 : 4, paddingHorizontal: wide ? 11 : 7, borderRadius: wide ? 13 : 11, backgroundColor: palette.accentSoft },
    timerPillUrgent: { borderWidth: 1, borderColor: palette.danger },
    timerText: { color: palette.primary, fontSize: wide ? 14 : 12, fontWeight: '900', fontVariant: ['tabular-nums'] },
    timerTextUrgent: { color: palette.danger },
    gameTableWrap: { flex: 1, width: '100%', minHeight: multiplayerGameTableMinHeight(wide ? 'wide' : 'compact', tablet && !wide), maxWidth: MULTIPLAYER_GAME_TABLE_MAX_WIDTH, alignSelf: 'center' },
    gameTableWrapResult: { minHeight: multiplayerGameTableMinHeight(wide ? 'wide' : 'compact', tablet && !wide, 'result') },
    // Nine-seat phone landscape tables take exactly the compact live budget
    // (as low as 198pt on a 320-point phone), so the fixed 420/340 minima must
    // step aside for the flex remainder.
    gameTableWrapNineLandscape: { minHeight: 0 },
    gameTableWrapLandscape: { minHeight: 0 },
    gameTable: { flex: 1, position: 'relative', overflow: 'hidden', borderRadius: wide ? 22 : 18, borderWidth: 2, borderColor: palette.tableLine, backgroundColor: palette.table },
    gameCenter: { position: 'absolute', left: wide ? '24%' : '16%', right: wide ? '24%' : '16%', top: '37%', alignItems: 'center', gap: wide ? 10 : 6 },
    // Nine-seat landscape reserves a 99-point center lane (status pill + cards
    // + turn pill with 3-point gaps), so the column's own gap tightens to keep
    // the turn pill inside the lane instead of overlapping the seat rows.
    gameCenterNineLandscape: { gap: 3 },
    gameHeaderPotPill: { minHeight: 26, maxWidth: 110, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: 99, borderWidth: 1, borderColor: palette.tableLine, backgroundColor: palette.tableDeep },
    gameHeaderPotText: { color: palette.tableText, fontSize: 9.5, fontWeight: '900' },
    potPill: { minHeight: wide ? 31 : 25, alignItems: 'center', justifyContent: 'center', paddingHorizontal: wide ? 13 : 9, borderRadius: 99, borderWidth: 1, borderColor: palette.tableLine, backgroundColor: palette.tableDeep },
    potText: { color: palette.tableText, fontSize: wide ? 12 : 10, fontWeight: '900' },
    boardCards: { flexDirection: 'row', justifyContent: 'center', gap: wide ? 5 : 3 },
    turnPill: { minHeight: wide ? 29 : 24, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wide ? 6 : 5, paddingHorizontal: wide ? 10 : 8, paddingVertical: wide ? 5 : 4, borderRadius: 99, backgroundColor: palette.tableDeep },
    // The nine-seat landscape lane fits the turn pill at 20pt; the standard
    // 24pt pill would spill into the bottom seat row on a 375-point phone.
    turnPillNineLandscape: { minHeight: 20, paddingHorizontal: 7, paddingVertical: 2, gap: 4 },
    turnPillViewer: { borderWidth: 1, borderColor: palette.aqua, backgroundColor: palette.table },
    turnDot: { width: wide ? 6 : 5, height: wide ? 6 : 5, borderRadius: 99, backgroundColor: palette.tableLine },
    turnDotViewer: { backgroundColor: palette.aqua },
    turnCopy: { flexShrink: 1, color: palette.tableText, fontSize: wide ? 12 : 9.5, fontWeight: '900', textAlign: 'center' },
    turnCopyNineLandscape: { fontSize: 8.5 },
    turnCopyViewer: { color: palette.aqua },
    gameSeat: { position: 'absolute', width: multiplayerSeatFootprintWidth(wide ? 'wide' : 'compact', 'game', false, tablet && !wide), height: wide ? MULTIPLAYER_WIDE_GAME_SEAT_HEIGHT : tablet ? MULTIPLAYER_TABLET_COMPACT_GAME_SEAT_HEIGHT : MULTIPLAYER_COMPACT_GAME_SEAT_HEIGHT, alignItems: 'center', justifyContent: 'flex-start', gap: wide ? 7 : tablet ? 5 : 4 },
    gameSeatNineLandscape: { height: MULTIPLAYER_NINE_LANDSCAPE_GAME_SEAT_HEIGHT, flexDirection: 'column', gap: 2, paddingHorizontal: 4 },
    gameSeatViewer: { width: multiplayerSeatFootprintWidth(wide ? 'wide' : 'compact', 'game', true, tablet && !wide) },
    gameSeatActive: { zIndex: 2 },
    gameSeatJustActed: { zIndex: 3 },
    gameSeatWinner: { zIndex: 4 },
    gameSeatFolded: { opacity: 0.62 },
    gameSeatCards: { height: wide ? 62 : tablet ? 54 : 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wide ? 6 : tablet ? 4 : 3, zIndex: 2 },
    gameSeatCardsNineLandscape: { height: 41 },
    gameSeatLabel: { position: 'relative', width: '100%', minHeight: wide ? 73 : tablet ? 64 : 51, alignItems: 'center', justifyContent: 'center', gap: wide ? 2 : tablet ? 1.5 : 1, paddingHorizontal: wide ? 12 : tablet ? 8 : 5, paddingVertical: wide ? 8 : tablet ? 7 : 5, borderRadius: wide ? 14 : tablet ? 13 : 11, borderWidth: 1.5, borderColor: palette.tableLine, backgroundColor: palette.tableDeep },
    // Nine-landscape labels stack under the cards in the 72-point seat:
    // avatar + name + stack share one row, the persistent action/status meta
    // line sits beneath it, and the label never shrinks its copy to fit beside
    // the cards (there is no room in the fifth-lane row).
    gameSeatLabelNineLandscape: { width: '100%', minHeight: 0, gap: 1, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 10 },
    gameSeatNameRowNineLandscape: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 2 },
    // AI identity is carried by a dashed plaque outline plus the authored AI
    // avatar and accessibility label. It never consumes the player-name lane.
    gameSeatLabelAi: { borderColor: palette.muted, borderStyle: 'dashed' },
    gameSeatLabelActive: { borderColor: palette.aqua, borderWidth: 2, backgroundColor: palette.table },
    gameSeatLabelJustActed: { borderColor: palette.primary, backgroundColor: palette.table },
    // The result panel already carries the trophy. On the felt, a gold
    // outline/glow identifies winners without placing a cup over their name.
    gameSeatLabelWinner: { borderColor: '#F6C453', borderWidth: 2.5, backgroundColor: palette.table, shadowColor: '#E0A72A', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.46, shadowRadius: 9, elevation: 5 },
    gameSeatAvatar: { position: 'absolute', zIndex: 3, left: wide ? 9 : tablet ? 7 : 5, top: wide ? 20 : tablet ? 19 : 15, width: wide ? 32 : tablet ? 26 : 20, height: wide ? 32 : tablet ? 26 : 20, alignItems: 'center', justifyContent: 'center', borderRadius: wide ? 16 : tablet ? 13 : 10, borderWidth: 1, borderColor: palette.tableLine, backgroundColor: palette.aquaSoft, overflow: 'hidden' },
    gameSeatAvatarNineLandscape: { position: 'relative', left: 0, top: 0, width: 14, height: 14, borderRadius: 7 },
    gameSeatAvatarImage: { borderWidth: 0, backgroundColor: 'transparent' },
    // Avatar-privacy feedback sits above the plaque without changing its
    // stable identity geometry.
    avatarPrivacyFeedback: { position: 'absolute', left: 0, right: 0, top: 0, alignItems: 'center', zIndex: 20,
      backgroundColor: palette.primaryText, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 4, elevation: 4 },
    avatarPrivacyFeedbackText: { color: palette.primary, fontWeight: '800', fontSize: wide ? 14 : 11 },
    gameSeatIdentityCopy: { width: '100%', maxWidth: '100%', alignItems: 'center', paddingLeft: wide ? 39 : tablet ? 33 : 27, paddingRight: wide ? 7 : tablet ? 6 : 5 },
    gameSeatIdentityCopyWithRole: { paddingRight: wide ? 40 : tablet ? 34 : 29 },
    gameSeatNameRow: { width: '100%', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wide ? 4 : 2 },
    gameSeatName: { flexShrink: 1, maxWidth: '100%', color: palette.tableText, fontSize: wide ? 16 : tablet ? 12.5 : 10.5, fontWeight: '900' },
    gameRoleBadge: { position: 'absolute', zIndex: 3, top: wide ? 6 : tablet ? 5 : 4, right: wide ? 7 : tablet ? 6 : 5, minWidth: wide ? 31 : tablet ? 27 : 23, minHeight: wide ? 23 : tablet ? 20 : 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: wide ? 7 : tablet ? 5 : 4, borderRadius: wide ? 8 : tablet ? 7 : 6, borderWidth: 1, borderColor: palette.tableText, backgroundColor: palette.primary },
    gameRoleBadgeText: { color: palette.primaryText, fontSize: wide ? 10 : tablet ? 9 : 7.5, fontWeight: '900', letterSpacing: 0.25 },
    gameSeatStack: { color: palette.tableText, fontSize: wide ? 14 : tablet ? 11.5 : 9.5, fontWeight: '800' },
    gameSeatMeta: { maxWidth: '100%', color: palette.tableLine, fontSize: wide ? 11.5 : tablet ? 10 : 8.5, fontWeight: '800', textAlign: 'center' },
    gameSeatAction: { color: palette.aqua, fontWeight: '900' },
    gameSeatMetaDivider: { color: palette.tableLine, fontWeight: '800' },
    gameSeatStatus: { color: palette.tableLine, fontWeight: '800' },
    nineRotateWrap: { position: 'relative', flex: 1, alignItems: 'center', justifyContent: 'center', gap: 9, padding: 18 },
    nineRotateArrow: { position: 'absolute', top: wide ? 58 : 48, transform: [{ rotate: '90deg' }] },
    nineRotateTitle: { color: palette.text, fontSize: wide ? 18 : 15, fontWeight: '900', textAlign: 'center' },
    nineRotateDetail: { color: palette.muted, fontSize: wide ? 13 : 11.5, fontWeight: '600', textAlign: 'center', maxWidth: 260 },
    nineRotateCards: { flexDirection: 'row', gap: 6, marginTop: 4 },
    seatActionBubbleAnchor: { position: 'absolute', zIndex: 8, alignItems: 'center' },
    seatActionBubbleAlignLeft: { left: 0 },
    seatActionBubbleAlignCenter: { left: wide ? -12 : tablet ? -26 : -22 },
    seatActionBubbleAlignRight: { right: 0 },
    seatActionBubbleBelow: { top: '100%', marginTop: wide ? 6 : tablet ? 5 : 4 },
    seatActionBubbleAbove: { bottom: '100%', marginBottom: wide ? 6 : tablet ? 5 : 4 },
    seatActionBubble: { maxWidth: '100%', height: wide ? 50 : tablet ? 46 : 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: wide ? 12 : tablet ? 10 : 7, paddingVertical: wide ? 7 : tablet ? 6 : 5, borderRadius: wide ? 12 : tablet ? 11 : 10, borderWidth: 1.5, borderColor: palette.tableLine, backgroundColor: palette.surfaceRaised, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.14, shadowRadius: 7, elevation: 4 },
    seatActionBubbleMeasuredBelow: { marginTop: 6 },
    seatActionBubbleMeasuredAbove: { marginBottom: 6 },
    seatActionBubbleFold: { borderColor: palette.tableLine },
    seatActionBubbleCheck: { borderColor: palette.aqua },
    seatActionBubbleCall: { borderColor: palette.primary },
    seatActionBubbleAggressive: { borderColor: palette.primary, borderWidth: 2 },
    seatActionBubbleAllIn: { borderColor: palette.danger, borderWidth: 2, shadowColor: palette.danger, shadowOpacity: 0.3 },
    seatActionBubbleText: { color: palette.text, fontSize: wide ? 12 : tablet ? 11 : 9, lineHeight: wide ? 16 : tablet ? 15 : 11, fontWeight: '600', textAlign: 'center' },
    seatActionBubbleTail: { position: 'absolute', width: wide ? 9 : tablet ? 8 : 7, height: wide ? 9 : tablet ? 8 : 7, borderWidth: 1, borderColor: palette.tableLine, backgroundColor: palette.surfaceRaised, transform: [{ rotate: '45deg' }] },
    seatActionBubbleTailTop: { top: wide ? -4 : tablet ? -4 : -3 },
    seatActionBubbleTailBottom: { bottom: wide ? -4 : tablet ? -4 : -3 },
    seatActionBubbleTailTopMeasured: { top: 2 },
    seatActionBubbleTailBottomMeasured: { bottom: 2 },
    gameActions: { width: '100%', maxWidth: 880, minHeight: wide ? 66 : 54, alignSelf: 'center', flexDirection: 'row', gap: wide ? 10 : 7, padding: wide ? 5 : 0, borderRadius: wide ? 18 : 0, backgroundColor: wide ? palette.soft : 'transparent' },
    gameControlRail: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 6 },
    gameControlRailMain: { flex: 1, minWidth: 0 },
    gameSideRail: { flexShrink: 0, gap: 6 },
    gameSideRailLandscape: { minWidth: 190, maxWidth: 360 },
    gameAction: { flex: 1, minHeight: wide ? 56 : 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wide ? 7 : 5, paddingHorizontal: 7, borderRadius: wide ? 13 : 11, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    gameActionDanger: { borderColor: palette.danger },
    gameActionPrimary: { borderColor: palette.primary, backgroundColor: palette.primary },
    gameActionText: { flexShrink: 1, color: palette.text, fontSize: wide ? 14 : 12, fontWeight: '900', textAlign: 'center' },
    gameActionTextDanger: { color: palette.danger },
    gameActionTextPrimary: { color: palette.primaryText },
    gameStatePanel: { minHeight: wide ? 62 : 54, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    gameStateSpacer: { minHeight: wide ? 62 : 54, alignItems: 'center', justifyContent: 'center' },
    gameStateTitle: { color: palette.text, fontSize: wide ? 13 : 11, fontWeight: '900', textAlign: 'center' },
    gameStateCopy: { color: palette.muted, fontSize: wide ? 11 : 9.5, fontWeight: '600', textAlign: 'center' },
    resultPanel: { width: '100%', maxWidth: 880, minHeight: wide ? 104 : 86, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: wide ? 14 : 9, padding: wide ? 14 : 9, borderRadius: wide ? 18 : 14, borderWidth: 1.5, backgroundColor: palette.surface },
    resultPanelWide: { paddingHorizontal: 16 },
    resultIcon: { width: wide ? 48 : 38, height: wide ? 48 : 38, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: wide ? 15 : 12 },
    resultCopy: { flex: 1, minWidth: 0, gap: wide ? 3 : 2 },
    resultHeadline: { minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: wide ? 8 : 5 },
    resultTitle: { flexShrink: 1, color: palette.text, fontSize: wide ? 16 : 13, fontWeight: '900' },
    resultAmount: { color: palette.primary, fontSize: wide ? 16 : 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
    resultDetail: { color: palette.muted, fontSize: wide ? 11.5 : 10, lineHeight: wide ? 16 : 14, fontWeight: '600' },
    resultPayouts: { flexDirection: 'row', flexWrap: 'wrap', gap: wide ? 7 : 4, marginTop: wide ? 3 : 1 },
    resultPot: { color: palette.muted, fontSize: wide ? 10.5 : 9, fontWeight: '800' },
    resultPayout: { maxWidth: wide ? 180 : 115, color: palette.aqua, fontSize: wide ? 11.5 : 9.5, fontWeight: '900' },
    resultCountdown: { alignSelf: 'flex-start', minHeight: 20, flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, paddingRight: 7, borderRadius: 8 },
    resultCountdownText: { color: palette.primary, fontSize: wide ? 10.5 : 9, fontWeight: '800', fontVariant: ['tabular-nums'] },
    resultButton: { minWidth: wide ? 178 : 106, minHeight: wide ? 50 : 42, flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: wide ? 15 : 10, borderRadius: wide ? 13 : 11, backgroundColor: palette.primary },
    resultButtonText: { color: palette.primaryText, fontSize: wide ? 12.5 : 9.5, fontWeight: '900' },
    resultNote: { maxWidth: wide ? 190 : 100, flexShrink: 1, color: palette.muted, fontSize: wide ? 10.5 : 7.5, lineHeight: wide ? 15 : 10, fontWeight: '700', textAlign: 'center' },
    pressed: { opacity: 0.74, transform: [{ scale: 0.99 }] },
    disabled: { opacity: 0.42 },
  });
}
