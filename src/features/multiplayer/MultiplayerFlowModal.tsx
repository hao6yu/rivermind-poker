import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
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
  subscribeToMultiplayerTable,
  syncMultiplayerTable,
  type MultiplayerClientCommand,
} from '../../services/multiplayer';
import {
  loadPlayerDisplayName,
  PLAYER_DISPLAY_NAME_MAX_LENGTH,
  savePlayerDisplayName,
} from '../../services/playerProfile';
import { PlayingCard } from '../../components/PlayingCard';
import { ModalBackdrop } from '../../components/ModalBackdrop';
import {
  ActionBubbleText,
  useActionBubbleAnnouncement,
} from '../../components/ActionBubbleText';
import { AiAvatar } from '../../components/AiAvatar';
import { ModalSafeArea } from '../learn/ModalSafeArea';
import { BetSizingModal } from '../table/BetSizingModal';
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
  multiplayerGameSeatAnchor,
  multiplayerGameTableMinHeight,
  multiplayerSeatAnchor,
  multiplayerAiRulesPresentation,
  multiplayerSeatFootprintWidth,
  multiplayerSeatHorizontalAlignment,
  multiplayerSeatIsTopRow,
  multiplayerSeatLayoutForWidth,
  multiplayerUsesTabletSeatReadability,
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
import {
  acceptMultiplayerSnapshot,
  createMultiplayerAsyncScopeGate,
  createMultiplayerCommandGate,
  createMultiplayerSnapshotSyncCoordinator,
  createMultiplayerTimeoutAttemptGate,
  multiplayerSnapshotSessionChanged,
} from './multiplayerSnapshotFlow';
import { canSubmitMultiplayerAction } from './multiplayerActionEligibility';
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

export function MultiplayerFlowModal({
  initialMode,
  initialRoomCode,
  isLaunchCurrent,
  onClose,
  onPracticeFocus,
  onRecoveryRecordChange,
  resumeRecord,
  visible,
}: {
  initialMode: MultiplayerFlowMode;
  initialRoomCode?: string;
  isLaunchCurrent?: () => boolean;
  onClose: () => void;
  onPracticeFocus?: (focus: Exclude<CoachFocusArea, 'none'>) => void;
  onRecoveryRecordChange?: (record: ActiveMultiplayerRoomRecord | null) => void;
  resumeRecord?: ActiveMultiplayerRoomRecord;
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
  const [presentationEpoch, setPresentationEpoch] = useState(0);
  const [presentationReady, setPresentationReady] = useState(true);
  const [transportNotice, setTransportNotice] = useState<MultiplayerTransportNotice>(null);
  const [busy, setBusy] = useState(false);
  const asyncScope = useRef(createMultiplayerAsyncScopeGate());
  const syncCoordinator = useRef(createMultiplayerSnapshotSyncCoordinator());
  const commandGate = useRef(createMultiplayerCommandGate());
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
      playerName: loadPlayerDisplayName(),
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
        const terminal = error instanceof MultiplayerRequestError
          && ['room_access', 'room_forbidden', 'room_not_found'].includes(error.code);
        if (terminal) {
          clearActiveMultiplayerRoom();
          recoveryChangeCallback.current?.(null);
        }
        Alert.alert(
          t('multiplayer.resume.errorTitle'),
          t(terminal ? 'multiplayer.resume.expired' : 'multiplayer.resume.network'),
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
        () => {
          if (disposed || activeSync !== task) return;
          activeSync = null;
          scheduleRetry();
        },
      );
    };

    const unsubscribe = subscribeToMultiplayerTable(activeRoomId, (envelope) => {
      if (lobbyRef.current?.roomId !== activeRoomId) return;
      rememberPresentationTransition(envelope);
      const targetVersion = envelope?.snapshot.version ?? lobbyRef.current?.version ?? 0;
      requestSync(targetVersion);
    }, (status) => {
      if (disposed) return;
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
    });
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (multiplayerPresentationLifecycleBoundary(lastAppState, state)) {
        setPresentationTransitions([]);
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
  }, [acceptSnapshot, applyPresentationReadinessEvent, emitTransportFeedback, lobby?.roomId, page, rememberPresentationTransition, roomCode, visible]);

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
    const displayName = savePlayerDisplayName(draft.playerName);
    setDraft((current) => ({ ...current, playerName: displayName }));
    setBusy(true);
    try {
      const result = page === 'create'
        ? await createMultiplayerTable({
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
        })
        : await joinMultiplayerTable({
          displayName,
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

  const activeGame = page === 'lobby' && lobby !== null && lobby.status !== 'lobby';
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

  return (
    <Modal
      animationType="slide"
      onRequestClose={activeGame ? requestGameExit : requestSetupClose}
      presentationStyle="fullScreen"
      visible={visible}
    >
      <ModalSafeArea>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.screen}
        >
          <View accessibilityViewIsModal style={styles.screen}>
            {!activeGame && <FlowHeader onBack={goBack} onClose={requestSetupClose} page={page} />}
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
                  busy={busy}
                  key={`${lobby.roomId}:${presentationEpoch}`}
                  onCommand={sendLobbyCommand}
                  onExit={requestGameExit}
                  onPracticeFocus={onPracticeFocus}
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
  return (
    <View style={styles.header}>
      {page === 'lobby' ? (
        <Pressable
          accessibilityLabel={t('multiplayer.back')}
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
        >
          <Ionicons color={palette.text} name="arrow-back" size={20} />
        </Pressable>
      ) : <View style={styles.headerButtonSpacer} />}
      <Pressable
        accessibilityLabel={t('multiplayer.close')}
        accessibilityRole="button"
        onPress={onClose}
        style={({ pressed }) => [styles.headerButton, styles.headerCloseButton, pressed && styles.pressed]}
      >
        <Ionicons color={palette.text} name="close" size={21} />
      </Pressable>
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
            <NameField value={draft.playerName} onChange={(playerName) => onChange({ ...draft, playerName })} />
          </View>
          <OptionGroup
            label={t('multiplayer.create.seats')}
            onSelect={(seatCount) => onChange({ ...draft, seatCount })}
            options={multiplayerSeatOptions}
            selected={draft.seatCount}
            valueLabel={(value) => t('common.players', { count: value })}
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
            <InfoNote
              icon="hardware-chip-outline"
              tablet={tablet}
              text={t('multiplayer.create.aiNote', {
                difficulty: t(aiRules.difficultyKey as MessageKey),
                summary: t(aiRules.difficultySummaryKey as MessageKey),
              })}
              wide={wide}
            />
            <InfoNote
              icon="sparkles-outline"
              tablet={tablet}
              text={t('multiplayer.create.coachNote')}
              wide={wide}
            />
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
  const nameInputRef = useRef<TextInput>(null);
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
            onSubmitEditing={() => nameInputRef.current?.focus()}
            placeholder={t('multiplayer.join.placeholder')}
            placeholderTextColor={palette.muted}
            returnKeyType="next"
            style={[styles.input, styles.codeInput]}
            value={roomCode}
          />
          <Text style={styles.fieldHint}>{t('multiplayer.join.hint')}</Text>
          <View style={styles.fieldDivider} />
          <NameField
            inputRef={nameInputRef}
            value={draft.playerName}
            onChange={(playerName) => onChange({ ...draft, playerName })}
          />
        </View>
      </ScrollView>
      <BottomAction busy={busy} enabled={enabled} label={t('multiplayer.join.continue')} onPress={onContinue} />
    </>
  );
}

function NameField({
  inputRef,
  onChange,
  value,
}: {
  inputRef?: RefObject<TextInput | null>;
  onChange: (value: string) => void;
  value: string;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, false), [palette]);
  return (
    <View>
      <Text style={styles.fieldLabel}>{t('multiplayer.name.label')}</Text>
      <TextInput
        ref={inputRef}
        accessibilityLabel={t('multiplayer.name.label')}
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={PLAYER_DISPLAY_NAME_MAX_LENGTH}
        onChangeText={onChange}
        placeholder={t('multiplayer.name.placeholder')}
        placeholderTextColor={palette.muted}
        returnKeyType="done"
        style={styles.input}
        value={value}
      />
      <Text style={styles.fieldHint}>{t('multiplayer.name.remembered')}</Text>
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
  wide = false,
}: {
  label: string;
  onSelect: (value: T) => void;
  options: readonly T[];
  selected: T;
  tablet?: boolean;
  valueLabel: (value: T) => string;
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
              accessibilityLabel={optionLabel}
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
              <Text numberOfLines={2} style={[styles.optionText, isSelected && styles.optionTextSelected]}>
                {optionLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function InfoNote({
  icon,
  tablet = false,
  text,
  wide = false,
}: {
  icon: 'hardware-chip-outline' | 'lock-closed-outline' | 'people-outline' | 'sparkles-outline';
  tablet?: boolean;
  text: string;
  wide?: boolean;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, wide, tablet), [palette, tablet, wide]);
  return (
    <View style={styles.infoNote}>
      <Ionicons color={palette.muted} name={icon} size={16} />
      <Text style={styles.infoNoteText}>{text}</Text>
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
  const hostMode = Boolean(viewer?.isHost);
  const canStart = canStartMultiplayerSnapshot(room);
  const tableHeight = wide
    ? Math.min(390, Math.max(300, height * 0.48))
    : Math.min(
      room.config.seatCount === 6 ? 270 : 250,
      Math.max(room.config.seatCount === 6 ? 235 : 215, height * 0.36),
    );
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
            <Text accessibilityRole="header" style={styles.title}>{t('multiplayer.lobby.title')}</Text>
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

        <View style={[styles.lobbyTableWrap, { height: tableHeight }]}>
          <View style={styles.lobbyTable}>
            <View style={styles.lobbyCenterCopy}>
              <Text style={styles.waitingText}>{t('multiplayer.lobby.waiting')}</Text>
            </View>
            {seats.map((seat) => (
              <LobbySeat
                anchorSeat={((seat.seat - (viewer?.seat ?? 0) + room.config.seatCount) % room.config.seatCount) as number}
                busy={busy}
                hostMode={hostMode}
                key={seat.seat}
                onPress={() => {
                  if (!hostMode || seat.kind === 'human') return;
                  void onCommand({
                    seat: seat.seat,
                    type: seat.kind === 'ai' ? 'remove-ai' : 'add-ai',
                  });
                }}
                seat={seat}
                seatCount={room.config.seatCount}
                tablet={tablet}
                wide={wide}
              />
            ))}
          </View>
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
  busy,
  onCommand,
  onExit,
  onPracticeFocus,
  presentationReady,
  presentationTransitions,
  room,
  tablet,
  transportNotice,
  wide,
}: {
  busy: boolean;
  onCommand: (command: MultiplayerClientCommand) => Promise<boolean>;
  onExit: () => void;
  onPracticeFocus?: (focus: Exclude<CoachFocusArea, 'none'>) => void;
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
  const styles = useMemo(() => createStyles(palette, wide, tablet), [palette, tablet, wide]);
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

  const timeoutAttemptGate = useRef(createMultiplayerTimeoutAttemptGate());
  const roomVersionRef = useRef(room.version);
  roomVersionRef.current = room.version;
  const observedHistory = useRef<{ handNumber: number; length: number } | null>(null);
  const consumedTransitionVersions = useRef(new Set<number>());
  const presentedActionIds = useRef(new Set<string>());
  const hand = room.hand;
  const previousPresentedBoard = useRef({
    count: 0,
    handNumber: hand?.handNumber,
  });
  const viewerFeedbackTurn = useRef(false);
  const lastTimerWarningFeedback = useRef<string | null>(null);
  const viewerSeat = room.seats.find((seat) => seat.playerId === room.viewerPlayerId);
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
    if (room.status !== 'playing' || room.turnDeadlineAtMs === null) return undefined;
    const interval = setInterval(() => setNowMs(Date.now()), 500);
    return () => clearInterval(interval);
  }, [room.status, room.turnDeadlineAtMs]);

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
      const reclaim = (room.status === 'between-hands' || room.status === 'complete')
        && viewerSeat?.control === 'ai';
      const canDeal = viewerCanDeal && !reclaim;
      const canViewSession = room.status === 'complete' && sessionSummary !== null;
      return (
        <MultiplayerHandResultPanel
          busy={busy}
          note={room.status === 'complete'
            ? t('multiplayer.game.completeDetail')
            : !canDeal && !reclaim ? t('multiplayer.result.waitingForHost') : undefined}
          onPress={reclaim
            ? () => { void onCommand({ type: 'reclaim' }); }
            : canDeal
              ? () => { void onCommand({ type: 'next-hand' }); }
              : canViewSession ? () => setSessionSummaryVisible(true) : undefined}
          primaryLabel={reclaim
            ? t('multiplayer.game.reclaim')
            : canDeal
              ? t('multiplayer.game.nextHand')
              : canViewSession ? t('multiplayer.session.viewStandings') : undefined}
          result={visibleHandResult}
          wide={wide}
        />
      );
    }
    if (room.status === 'complete') {
      if (viewerSeat?.control === 'ai') {
        return (
          <View style={styles.gameStatePanel}>
            <Text style={styles.gameStateTitle}>{t('multiplayer.game.complete')}</Text>
            <BottomAction
              busy={busy}
              enabled={presentationReady}
              label={t('multiplayer.game.reclaim')}
              onPress={() => { void onCommand({ type: 'reclaim' }); }}
            />
          </View>
        );
      }
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
      if (viewerSeat?.control === 'ai') {
        return (
          <BottomAction
            busy={busy}
            enabled
            label={t('multiplayer.game.reclaim')}
            onPress={() => { void onCommand({ type: 'reclaim' }); }}
          />
        );
      }
      return viewerCanDeal ? (
        <BottomAction
          busy={busy}
          enabled
          label={t('multiplayer.game.nextHand')}
          onPress={() => { void onCommand({ type: 'next-hand' }); }}
        />
      ) : (
        <View style={styles.gameStatePanel}>
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

      <View style={[styles.gameTableWrap, visibleHandResult && styles.gameTableWrapResult]}>
        <View style={styles.gameTable}>
          <View style={styles.gameCenter}>
            <View style={styles.potPill}>
              <Text maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} style={styles.potText}>{t('multiplayer.game.pot', {
                amount: formatChips(presentedPot),
              })}</Text>
            </View>
            <MultiplayerBoard board={visibleActionFrame?.board ?? hand?.board ?? []} street={presentedStreet} wide={wide} />
            {multiplayerShowsCenterTurnStatus({
              actionPresented: Boolean(spotlightAction),
              handResultVisible: Boolean(visibleHandResult || handResult),
            }) && (
              <View
                accessibilityLiveRegion="polite"
                style={[styles.turnPill, viewerTurn && actionControlsEnabled && styles.turnPillViewer]}
              >
                <View style={[styles.turnDot, viewerTurn && actionControlsEnabled && styles.turnDotViewer]} />
                <Text maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} style={[styles.turnCopy, viewerTurn && actionControlsEnabled && styles.turnCopyViewer]}>{viewerTurn
                    ? t('multiplayer.game.yourTurn')
                    : actingPlayer
                      ? t('multiplayer.game.playerTurn', { name: actingPlayer.name })
                      : t('multiplayer.game.waiting')}</Text>
              </View>
            )}
          </View>
          {room.seats.map((seat) => {
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
                currentTurn={presentedTurnPlayerId === player.id}
                handComplete={hand?.street === 'complete'}
                justActed={presentingPlayerAction}
                key={player.id}
                latestAction={presentingPlayerAction
                  ? spotlightLabel
                  : hand ? multiplayerSeatActionLabel(hand, player.id, t) : null}
                player={player}
                presentedAction={presentingPlayerAction ? spotlightAction : null}
                presentedAllIn={presentingPlayerAction && spotlightAllIn}
                role={hand ? multiplayerSeatRole(hand, player.id) : null}
                seat={seat}
                seatCount={room.config.seatCount}
                tablet={tablet}
                viewer={player.id === room.viewerPlayerId}
                wide={wide}
                winner={winningPlayerIds.has(player.id)}
              />
            );
          })}
        </View>
      </View>
      {actionPanel}
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
  wide,
}: {
  board: NonNullable<MultiplayerViewerProjection['hand']>['board'];
  street: Street;
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
      {Array.from({ length: 5 }, (_, index) => (
        <PlayingCard
          card={index < visibleBoardCount ? board[index] : undefined}
          key={`board-${index}`}
          medium={!wide}
        />
      ))}
    </Animated.View>
  );
}

function MultiplayerGameSeat({
  actionBubble,
  actionKey,
  anchorSeat,
  currentTurn,
  handComplete,
  justActed,
  latestAction,
  player,
  presentedAction,
  presentedAllIn,
  role,
  seat,
  seatCount,
  tablet,
  viewer,
  wide,
  winner,
}: {
  actionBubble: MultiplayerActionBubblePresentation | null;
  actionKey: string;
  anchorSeat: number;
  currentTurn: boolean;
  handComplete: boolean;
  justActed: boolean;
  latestAction: string | null;
  player: NonNullable<MultiplayerViewerProjection['hand']>['players'][string];
  presentedAction: MultiwayActionRecord | null;
  presentedAllIn: boolean;
  role: MultiplayerSeatRole;
  seat: MultiplayerViewerProjection['seats'][number];
  seatCount: MultiplayerSeatCount;
  tablet: boolean;
  viewer: boolean;
  wide: boolean;
  winner: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, wide, tablet), [palette, tablet, wide]);
  const anchor = multiplayerGameSeatAnchor(seatCount, anchorSeat, wide ? 'wide' : 'compact');
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
  const status = handComplete
    ? player.stack === 0 ? t('multiway.state.out') : null
    : displayFolded
      ? t('multiway.state.folded')
      : seat.connection === 'offline'
        ? t('multiplayer.game.offline')
        : displayAllIn
          ? t('multiway.state.allIn')
          : displayCurrentTurn
            ? viewer ? t('multiplayer.game.yourTurn') : t('table.acting')
            : seat.control === 'ai' && seat.kind === 'human'
              ? t('multiplayer.game.aiControl')
              : null;
  // Keep the exact current-street action beneath every non-folded seat even
  // while its transient bubble is telling the same moment with personality.
  const persistentAction = !displayFolded && !handComplete ? latestAction : null;
  const displayName = viewer ? t('multiplayer.lobby.you') : player.name;
  const playerInitial = player.name.trim().slice(0, 1).toLocaleUpperCase() || '?';
  const roleAccessibilityLabel = role === 'D'
    ? t('guide.dealer')
    : role === 'SB' ? t('guide.sb') : role === 'BB' ? t('guide.bb') : null;
  const cards = (
    <View style={styles.gameSeatCards}>
      {Array.from({ length: 2 }, (_, index) => (
        <PlayingCard
          card={player.holeCards[index]}
          compact={wide}
          hidden={!player.holeCards[index]}
          key={`${player.id}-card-${index}`}
          medium={tablet && !wide}
          small={!wide && !tablet}
        />
      ))}
    </View>
  );
  const label = (
    <View style={[
      styles.gameSeatLabel,
      displayCurrentTurn && styles.gameSeatLabelActive,
      justActed && styles.gameSeatLabelJustActed,
      winner && styles.gameSeatLabelWinner,
    ]}
      accessibilityLabel={[displayName, roleAccessibilityLabel, formatChips(player.stack), persistentAction, status]
        .filter(Boolean)
        .join(', ')}
      accessible
    >
      {role && (
        <View style={styles.gameRoleBadge}>
          <Text maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} style={styles.gameRoleBadgeText}>{role}</Text>
        </View>
      )}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.gameSeatAvatar, seat.kind === 'ai' && styles.gameSeatAvatarImage]}
      >
        {seat.kind === 'ai' ? (
          <AiAvatar name={player.name} size={wide ? 32 : tablet ? 26 : 20} />
        ) : (
          <Text maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} style={styles.gameSeatAvatarInitial}>{playerInitial}</Text>
        )}
      </View>
      <View style={[styles.gameSeatIdentityCopy, role && styles.gameSeatIdentityCopyWithRole]}>
        <View style={styles.gameSeatNameRow}>
          {winner && <Ionicons color={palette.aqua} name="trophy" size={wide ? 14 : tablet ? 12 : 10} />}
          <Text adjustsFontSizeToFit maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} minimumFontScale={0.72} numberOfLines={1} style={styles.gameSeatName}>{displayName}</Text>
        </View>
        <Text maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} style={styles.gameSeatStack}>{formatChips(player.stack)}</Text>
        {(persistentAction || status) && (
          <Text adjustsFontSizeToFit maxFontSizeMultiplier={MULTIPLAYER_DENSE_MAX_FONT_SIZE_MULTIPLIER} minimumFontScale={0.72} numberOfLines={1} style={styles.gameSeatMeta}>
            {persistentAction ? <Text style={styles.gameSeatAction}>{persistentAction}</Text> : null}
            {persistentAction && status ? <Text style={styles.gameSeatMetaDivider}> · </Text> : null}
            {status ? <Text style={styles.gameSeatStatus}>{status}</Text> : null}
          </Text>
        )}
      </View>
    </View>
  );
  return (
    <View style={[
      styles.gameSeat,
      anchor,
      viewer && styles.gameSeatViewer,
      displayCurrentTurn && styles.gameSeatActive,
      justActed && styles.gameSeatJustActed,
      winner && styles.gameSeatWinner,
      displayFolded && styles.gameSeatFolded,
    ]}>
      {topRow ? label : cards}
      {topRow ? cards : label}
      {actionBubble && (
        <MultiplayerSeatActionBubble
          actionKey={actionKey}
          actorName={viewer ? t('common.you') : player.name}
          horizontal={multiplayerSeatHorizontalAlignment(seatCount, anchorSeat, wide ? 'wide' : 'compact')}
          presentation={actionBubble}
          tablet={tablet}
          topRow={topRow}
          wide={wide}
        />
      )}
    </View>
  );
}

function MultiplayerSeatActionBubble({
  actionKey,
  actorName,
  horizontal,
  presentation,
  tablet,
  topRow,
  wide,
}: {
  actionKey: string;
  actorName: string;
  horizontal: 'center' | 'left' | 'right';
  presentation: MultiplayerActionBubblePresentation;
  tablet: boolean;
  topRow: boolean;
  wide: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(palette, wide, tablet), [palette, tablet, wide]);
  const progress = useRef(new Animated.Value(0)).current;
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

  return (
    <Animated.View
      accessibilityLabel={accessibilityMessage}
      accessibilityLiveRegion="polite"
      accessible
      pointerEvents="none"
      style={[
        styles.seatActionBubbleAnchor,
        horizontal === 'left'
          ? styles.seatActionBubbleAlignLeft
          : horizontal === 'right' ? styles.seatActionBubbleAlignRight : styles.seatActionBubbleAlignCenter,
        topRow ? styles.seatActionBubbleBelow : styles.seatActionBubbleAbove,
        {
          opacity: progress,
          transform: [{
            scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }),
          }, {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [topRow ? -6 : 6, 0],
            }),
          }],
        },
      ]}
    >
      <View style={[
        styles.seatActionBubble,
        presentation.tone === 'fold' && styles.seatActionBubbleFold,
        presentation.tone === 'check' && styles.seatActionBubbleCheck,
        presentation.tone === 'call' && styles.seatActionBubbleCall,
        presentation.tone === 'aggressive' && styles.seatActionBubbleAggressive,
        presentation.tone === 'all-in' && styles.seatActionBubbleAllIn,
      ]}>
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
        topRow ? styles.seatActionBubbleTailTop : styles.seatActionBubbleTailBottom,
      ]} />
    </Animated.View>
  );
}

function MultiplayerHandResultPanel({
  busy,
  note,
  onPress,
  primaryLabel,
  result,
  wide,
}: {
  busy: boolean;
  note?: string;
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
  hostMode,
  onPress,
  seat,
  seatCount,
  tablet,
  wide,
}: {
  anchorSeat: number;
  busy: boolean;
  hostMode: boolean;
  onPress: () => void;
  seat: MultiplayerLobbySeat;
  seatCount: MultiplayerSeatCount;
  tablet: boolean;
  wide: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, wide, tablet), [palette, tablet, wide]);
  const anchor = multiplayerSeatAnchor(seatCount, anchorSeat, wide ? 'wide' : 'compact', 'lobby');
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
        anchor,
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
        <Ionicons
          color={seat.kind === 'open' ? palette.aqua : seat.kind === 'ai' ? palette.primary : palette.aqua}
          name={seat.kind === 'open' ? 'add' : seat.kind === 'ai' ? 'hardware-chip' : 'person'}
          size={wide ? 20 : tablet ? 18 : 15}
        />
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
    fieldLabel: { color: palette.text, fontSize: wide ? 14 : tablet ? 13 : 12, fontWeight: '800', marginBottom: 8 },
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
    noteStack: { width: '100%', gap: 8 },
    infoNote: { flex: 1, minHeight: wide || tablet ? 38 : 32, flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 2, paddingVertical: 4 },
    infoNoteText: { flex: 1, color: palette.muted, fontSize: wide ? 13 : tablet ? 12 : 10.5, lineHeight: wide ? 19 : tablet ? 18 : 15, fontWeight: '600' },
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
    inviteQrCard: { alignSelf: 'center', alignItems: 'center', gap: wide ? 14 : 11, padding: wide ? 18 : 14, borderRadius: wide ? 22 : 18, borderWidth: 1, borderColor: palette.border, backgroundColor: '#FFFFFF' },
    inviteCodeWrap: { alignItems: 'center', gap: 3 },
    inviteScanLabel: { color: '#53636B', fontSize: wide ? 11 : 9.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.75 },
    inviteCode: { color: '#0A2730', fontSize: wide ? 24 : 20, fontWeight: '900', letterSpacing: wide ? 5 : 4, fontVariant: ['tabular-nums'] },
    inviteActions: { flexDirection: 'row', gap: wide ? 10 : 8 },
    inviteSecondaryButton: { flex: 1, minHeight: wide ? 52 : 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    inviteSecondaryText: { color: palette.primary, fontSize: wide ? 13 : 11.5, fontWeight: '900', textAlign: 'center' },
    invitePrimaryButton: { flex: 1, minHeight: wide ? 52 : 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10, borderRadius: 14, backgroundColor: palette.primary },
    invitePrimaryText: { color: palette.primaryText, fontSize: wide ? 13 : 11.5, fontWeight: '900', textAlign: 'center' },
    lobbyTableWrap: { width: '100%', maxWidth: MULTIPLAYER_LOBBY_TABLE_MAX_WIDTH, alignSelf: 'center' },
    lobbyTable: { flex: 1, overflow: 'hidden', borderRadius: wide ? 22 : 18, borderWidth: 2, borderColor: palette.tableLine, backgroundColor: palette.table },
    lobbyCenterCopy: { position: 'absolute', left: '27%', right: '27%', top: '45%', alignItems: 'center' },
    waitingText: { color: palette.tableText, fontSize: wide ? 14 : 11, fontWeight: '800', textAlign: 'center' },
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
    gameTable: { flex: 1, overflow: 'hidden', borderRadius: wide ? 22 : 18, borderWidth: 2, borderColor: palette.tableLine, backgroundColor: palette.table },
    gameCenter: { position: 'absolute', left: wide ? '24%' : '16%', right: wide ? '24%' : '16%', top: '37%', alignItems: 'center', gap: wide ? 10 : 6 },
    potPill: { minHeight: wide ? 31 : 25, alignItems: 'center', justifyContent: 'center', paddingHorizontal: wide ? 13 : 9, borderRadius: 99, borderWidth: 1, borderColor: palette.tableLine, backgroundColor: palette.tableDeep },
    potText: { color: palette.tableText, fontSize: wide ? 12 : 10, fontWeight: '900' },
    boardCards: { flexDirection: 'row', justifyContent: 'center', gap: wide ? 5 : 3 },
    turnPill: { minHeight: wide ? 29 : 24, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wide ? 6 : 5, paddingHorizontal: wide ? 10 : 8, paddingVertical: wide ? 5 : 4, borderRadius: 99, backgroundColor: palette.tableDeep },
    turnPillViewer: { borderWidth: 1, borderColor: palette.aqua, backgroundColor: palette.table },
    turnDot: { width: wide ? 6 : 5, height: wide ? 6 : 5, borderRadius: 99, backgroundColor: palette.tableLine },
    turnDotViewer: { backgroundColor: palette.aqua },
    turnCopy: { flexShrink: 1, color: palette.tableText, fontSize: wide ? 12 : 9.5, fontWeight: '900', textAlign: 'center' },
    turnCopyViewer: { color: palette.aqua },
    gameSeat: { position: 'absolute', width: multiplayerSeatFootprintWidth(wide ? 'wide' : 'compact', 'game', false, tablet && !wide), height: wide ? MULTIPLAYER_WIDE_GAME_SEAT_HEIGHT : tablet ? MULTIPLAYER_TABLET_COMPACT_GAME_SEAT_HEIGHT : MULTIPLAYER_COMPACT_GAME_SEAT_HEIGHT, alignItems: 'center', justifyContent: 'flex-start', gap: wide ? 7 : tablet ? 5 : 4 },
    gameSeatViewer: { width: multiplayerSeatFootprintWidth(wide ? 'wide' : 'compact', 'game', true, tablet && !wide) },
    gameSeatActive: { zIndex: 2 },
    gameSeatJustActed: { zIndex: 3 },
    gameSeatWinner: { zIndex: 4 },
    gameSeatFolded: { opacity: 0.62 },
    gameSeatCards: { height: wide ? 62 : tablet ? 54 : 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wide ? 6 : tablet ? 4 : 3, zIndex: 2 },
    gameSeatLabel: { position: 'relative', width: '100%', minHeight: wide ? 73 : tablet ? 64 : 51, alignItems: 'center', justifyContent: 'center', gap: wide ? 2 : tablet ? 1.5 : 1, paddingHorizontal: wide ? 12 : tablet ? 8 : 5, paddingVertical: wide ? 8 : tablet ? 7 : 5, borderRadius: wide ? 14 : tablet ? 13 : 11, borderWidth: 1.5, borderColor: palette.tableLine, backgroundColor: palette.tableDeep },
    gameSeatLabelActive: { borderColor: palette.aqua, borderWidth: 2, backgroundColor: palette.table },
    gameSeatLabelJustActed: { borderColor: palette.primary, backgroundColor: palette.table },
    gameSeatLabelWinner: { borderColor: palette.aqua, borderWidth: 2.5, backgroundColor: palette.table, shadowColor: palette.aqua, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.38, shadowRadius: 9, elevation: 5 },
    gameSeatAvatar: { position: 'absolute', zIndex: 3, left: wide ? 9 : tablet ? 7 : 5, top: wide ? 20 : tablet ? 19 : 15, width: wide ? 32 : tablet ? 26 : 20, height: wide ? 32 : tablet ? 26 : 20, alignItems: 'center', justifyContent: 'center', borderRadius: wide ? 16 : tablet ? 13 : 10, borderWidth: 1, borderColor: palette.tableLine, backgroundColor: palette.aquaSoft, overflow: 'hidden' },
    gameSeatAvatarImage: { borderWidth: 0, backgroundColor: 'transparent' },
    gameSeatAvatarInitial: { color: palette.aquaText, fontSize: wide ? 14 : tablet ? 11 : 9, fontWeight: '900' },
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
    seatActionBubbleAnchor: { position: 'absolute', width: wide ? 224 : tablet ? 190 : 148, zIndex: 8, alignItems: 'center' },
    seatActionBubbleAlignLeft: { left: 0 },
    seatActionBubbleAlignCenter: { left: wide ? -12 : tablet ? -26 : -22 },
    seatActionBubbleAlignRight: { right: 0 },
    seatActionBubbleBelow: { top: '100%', marginTop: wide ? 6 : tablet ? 5 : 4 },
    seatActionBubbleAbove: { bottom: '100%', marginBottom: wide ? 6 : tablet ? 5 : 4 },
    seatActionBubble: { maxWidth: '100%', height: wide ? 50 : tablet ? 46 : 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: wide ? 12 : tablet ? 10 : 7, paddingVertical: wide ? 7 : tablet ? 6 : 5, borderRadius: wide ? 12 : tablet ? 11 : 10, borderWidth: 1.5, borderColor: palette.tableLine, backgroundColor: palette.surfaceRaised, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.14, shadowRadius: 7, elevation: 4 },
    seatActionBubbleFold: { borderColor: palette.tableLine },
    seatActionBubbleCheck: { borderColor: palette.aqua },
    seatActionBubbleCall: { borderColor: palette.primary },
    seatActionBubbleAggressive: { borderColor: palette.primary, borderWidth: 2 },
    seatActionBubbleAllIn: { borderColor: palette.danger, borderWidth: 2, shadowColor: palette.danger, shadowOpacity: 0.3 },
    seatActionBubbleText: { color: palette.text, fontSize: wide ? 12 : tablet ? 11 : 9, lineHeight: wide ? 16 : tablet ? 15 : 11, fontWeight: '600', textAlign: 'center' },
    seatActionBubbleTail: { position: 'absolute', width: wide ? 9 : tablet ? 8 : 7, height: wide ? 9 : tablet ? 8 : 7, borderWidth: 1, borderColor: palette.tableLine, backgroundColor: palette.surfaceRaised, transform: [{ rotate: '45deg' }] },
    seatActionBubbleTailTop: { top: wide ? -4 : tablet ? -4 : -3 },
    seatActionBubbleTailBottom: { bottom: wide ? -4 : tablet ? -4 : -3 },
    gameActions: { width: '100%', maxWidth: 880, minHeight: wide ? 66 : 54, alignSelf: 'center', flexDirection: 'row', gap: wide ? 10 : 7, padding: wide ? 5 : 0, borderRadius: wide ? 18 : 0, backgroundColor: wide ? palette.soft : 'transparent' },
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
    resultButton: { minWidth: wide ? 178 : 106, minHeight: wide ? 50 : 42, flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: wide ? 15 : 10, borderRadius: wide ? 13 : 11, backgroundColor: palette.primary },
    resultButtonText: { color: palette.primaryText, fontSize: wide ? 12.5 : 9.5, fontWeight: '900' },
    resultNote: { maxWidth: wide ? 190 : 100, flexShrink: 1, color: palette.muted, fontSize: wide ? 10.5 : 7.5, lineHeight: wide ? 15 : 10, fontWeight: '700', textAlign: 'center' },
    pressed: { opacity: 0.74, transform: [{ scale: 0.99 }] },
    disabled: { opacity: 0.42 },
  });
}
