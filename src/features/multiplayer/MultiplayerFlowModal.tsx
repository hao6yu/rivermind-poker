import { Ionicons } from '@expo/vector-icons';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
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

import { AI_DIFFICULTY_OPTIONS } from '../../domain/poker/aiProfiles';
import { formatChips } from '../../domain/poker/moneyFormat';
import type { MultiwayActionRecord } from '../../domain/poker/multiway';
import {
  type MultiplayerViewerProjection,
} from '../../domain/multiplayer/contracts';
import { type MessageKey, useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import {
  createMultiplayerTable,
  joinMultiplayerTable,
  MultiplayerRequestError,
  sendMultiplayerCommand,
  subscribeToMultiplayerTable,
  syncMultiplayerTable,
  type MultiplayerClientCommand,
} from '../../services/multiplayer';
import { PlayingCard } from '../../components/PlayingCard';
import { ModalSafeArea } from '../learn/ModalSafeArea';
import { BetSizingModal } from '../table/BetSizingModal';
import { localizedStreet } from '../table/localizedGameplay';
import {
  buildMultiplayerResultPresentation,
  multiplayerActionLabel,
  multiplayerSeatActionLabel,
  type MultiplayerResultPresentation,
} from './multiplayerGamePresentation';
import {
  defaultMultiplayerDraft,
  isValidMultiplayerDisplayName,
  isValidMultiplayerRoomCode,
  multiplayerSeatAnchor,
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

type FlowPage = MultiplayerFlowMode | 'lobby';

export function MultiplayerFlowModal({
  initialMode,
  onClose,
  visible,
}: {
  initialMode: MultiplayerFlowMode;
  onClose: () => void;
  visible: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const { height, width } = useWindowDimensions();
  const wide = width >= 700;
  const styles = useMemo(() => createStyles(palette, wide), [palette, wide]);
  const [page, setPage] = useState<FlowPage>(initialMode);
  const [draft, setDraft] = useState<MultiplayerTableDraft>(defaultMultiplayerDraft);
  const [roomCode, setRoomCode] = useState('');
  const [lobby, setLobby] = useState<MultiplayerViewerProjection | null>(null);
  const [busy, setBusy] = useState(false);
  const syncing = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setPage(initialMode);
    setDraft({
      ...defaultMultiplayerDraft,
      seatCount: initialMode === 'join' ? 6 : defaultMultiplayerDraft.seatCount,
    });
    setRoomCode('');
    setLobby(null);
    setBusy(false);
    syncing.current = false;
  }, [initialMode, visible]);

  useEffect(() => {
    if (!visible || page !== 'lobby' || !lobby?.roomId) return undefined;
    const activeRoomId = lobby.roomId;
    return subscribeToMultiplayerTable(activeRoomId, () => {
      if (syncing.current) return;
      syncing.current = true;
      void syncMultiplayerTable(activeRoomId)
        .then((snapshot) => setLobby((current) => current && snapshot.version >= current.version
          ? { ...snapshot, roomCode: current.roomCode || roomCode }
          : current))
        .catch(() => undefined)
        .finally(() => { syncing.current = false; });
    });
  }, [lobby?.roomId, page, roomCode, visible]);

  const continueEnabled = isValidMultiplayerDisplayName(draft.playerName)
    && (page !== 'join' || isValidMultiplayerRoomCode(roomCode));

  const showError = (error: unknown) => {
    const message = error instanceof MultiplayerRequestError
      ? error.message
      : 'The multiplayer table could not complete that request.';
    Alert.alert(t('multiplayer.error.title'), message);
  };

  const enterLobby = async () => {
    if (!continueEnabled || page === 'lobby' || busy) return;
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
          displayName: draft.playerName,
        })
        : await joinMultiplayerTable({
          displayName: draft.playerName,
          roomCode: normalizeMultiplayerRoomCode(roomCode),
        });
      setRoomCode(result.roomCode);
      setLobby({ ...result.snapshot, roomCode: result.roomCode });
      setPage('lobby');
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  };

  const sendLobbyCommand = async (command: MultiplayerClientCommand) => {
    if (!lobby || busy) return;
    const current = lobby;
    setBusy(true);
    try {
      const snapshot = await sendMultiplayerCommand(current.roomId, current.version, command);
      setLobby({ ...snapshot, roomCode: current.roomCode || roomCode });
    } catch (error) {
      if (command.type === 'tick' || (error instanceof MultiplayerRequestError && error.code === 'room_stale')) {
        try {
          const snapshot = await syncMultiplayerTable(current.roomId);
          setLobby({ ...snapshot, roomCode: current.roomCode || roomCode });
        } catch {
          // The original stable error is more useful to the player.
        }
      }
      if (command.type !== 'tick') showError(error);
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => {
    if (page === 'lobby') setPage(initialMode);
    else onClose();
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" visible={visible}>
      <ModalSafeArea>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.screen}
        >
          <View accessibilityViewIsModal style={styles.screen}>
            <FlowHeader onBack={goBack} onClose={onClose} page={page} />
            {page === 'create' ? (
              <CreateTableForm
                busy={busy}
                draft={draft}
                enabled={continueEnabled}
                onChange={setDraft}
                onContinue={enterLobby}
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
                  busy={busy}
                  height={height}
                  onCommand={sendLobbyCommand}
                  room={lobby}
                  wide={wide}
                />
              ) : (
                <MultiplayerGameTable
                  busy={busy}
                  height={height}
                  onCommand={sendLobbyCommand}
                  room={lobby}
                  wide={wide}
                />
              ) : null
            )}
          </View>
        </KeyboardAvoidingView>
      </ModalSafeArea>
    </Modal>
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
      <Pressable
        accessibilityLabel={t('multiplayer.back')}
        accessibilityRole="button"
        onPress={onBack}
        style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
      >
        <Ionicons color={palette.text} name="arrow-back" size={20} />
      </Pressable>
      <View style={styles.headerProgress}>
        <View style={[styles.progressDot, styles.progressDotActive]} />
        <View style={styles.progressLine} />
        <View style={[styles.progressDot, page === 'lobby' && styles.progressDotActive]} />
      </View>
      <Pressable
        accessibilityLabel={t('multiplayer.close')}
        accessibilityRole="button"
        onPress={onClose}
        style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
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
  wide,
}: {
  busy: boolean;
  draft: MultiplayerTableDraft;
  enabled: boolean;
  onChange: (draft: MultiplayerTableDraft) => void;
  onContinue: () => void;
  wide: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, wide), [palette, wide]);
  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>{t('multiplayer.create.eyebrow')}</Text>
          <Text accessibilityRole="header" style={styles.title}>{t('multiplayer.create.title')}</Text>
          <Text style={styles.description}>{t('multiplayer.create.description')}</Text>
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
          />
          <OptionGroup
            label={t('multiplayer.create.stack')}
            onSelect={(startingStackChips) => onChange({ ...draft, startingStackChips })}
            options={multiplayerStackOptions}
            selected={draft.startingStackChips}
            valueLabel={(value) => t('multiplayer.option.chips', { amount: formatChips(value) })}
          />
          <OptionGroup
            label={t('multiplayer.create.session')}
            onSelect={(sessionLength) => onChange({ ...draft, sessionLength })}
            options={multiplayerSessionOptions}
            selected={draft.sessionLength}
            valueLabel={(value) => value === 'open'
              ? t('multiplayer.option.open')
              : t('multiplayer.option.hands', { count: value })}
          />
          <OptionGroup
            label={t('multiplayer.create.timer')}
            onSelect={(turnSeconds) => onChange({ ...draft, turnSeconds })}
            options={multiplayerTimerOptions}
            selected={draft.turnSeconds}
            valueLabel={(value) => t('multiplayer.option.seconds', { count: value })}
          />
          <OptionGroup
            label={t('multiplayer.create.ai')}
            onSelect={(aiDifficulty) => onChange({ ...draft, aiDifficulty })}
            options={AI_DIFFICULTY_OPTIONS.map((option) => option.id)}
            selected={draft.aiDifficulty}
            valueLabel={(value) => t(`difficulty.${value}` as MessageKey)}
          />
          <View style={styles.noteStack}>
            <InfoNote icon="hardware-chip-outline" text={t('multiplayer.create.aiNote')} />
            <InfoNote icon="sparkles-outline" text={t('multiplayer.create.coachNote')} />
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
      >
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>{t('multiplayer.join.eyebrow')}</Text>
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
        <View style={styles.joinTrustRow}>
          <InfoNote icon="lock-closed-outline" text={t('multiplayer.play.privateCode')} />
          <InfoNote icon="people-outline" text={t('multiplayer.play.mixedSeats')} />
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
        autoCapitalize="words"
        autoCorrect={false}
        maxLength={18}
        onChangeText={onChange}
        placeholder={t('multiplayer.name.placeholder')}
        placeholderTextColor={palette.muted}
        returnKeyType="done"
        style={styles.input}
        value={value}
      />
    </View>
  );
}

function OptionGroup<T extends string | number>({
  label,
  onSelect,
  options,
  selected,
  valueLabel,
}: {
  label: string;
  onSelect: (value: T) => void;
  options: readonly T[];
  selected: T;
  valueLabel: (value: T) => string;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, false), [palette]);
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
              <Text numberOfLines={1} style={[styles.optionText, isSelected && styles.optionTextSelected]}>
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
  text,
}: {
  icon: 'hardware-chip-outline' | 'lock-closed-outline' | 'people-outline' | 'sparkles-outline';
  text: string;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, false), [palette]);
  return (
    <View style={styles.infoNote}>
      <Ionicons color={palette.aqua} name={icon} size={16} />
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
  wide,
}: {
  busy: boolean;
  height: number;
  onCommand: (command: MultiplayerClientCommand) => Promise<void>;
  room: MultiplayerViewerProjection;
  wide: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, wide), [palette, wide]);
  const seats = multiplayerLobbySeats(room, room.viewerPlayerId);
  const viewer = seats.find((seat) => seat.isViewer);
  const viewerReady = Boolean(viewer?.ready);
  const hostMode = Boolean(viewer?.isHost);
  const canStart = canStartMultiplayerSnapshot(room);
  const tableHeight = wide
    ? Math.min(390, Math.max(300, height * 0.48))
    : Math.min(250, Math.max(215, height * 0.36));
  const sessionLabel = room.config.handTarget === 'open'
    ? t('multiplayer.option.open')
    : t('multiplayer.option.hands', { count: room.config.handTarget });
  const primaryLabel = !viewerReady
    ? t('multiplayer.lobby.readyUp')
    : hostMode ? t('multiplayer.lobby.start') : t('multiplayer.lobby.cancelReady');
  const primaryEnabled = !viewerReady || !hostMode || canStart;
  const note = viewerReady && hostMode && !canStart ? t('multiplayer.lobby.startHint') : undefined;
  const seatHint = (
    <View style={styles.lobbyHint}>
      <Ionicons color={palette.aqua} name={hostMode ? 'hardware-chip-outline' : 'shield-checkmark-outline'} size={wide ? 20 : 17} />
      <Text style={styles.lobbyHintText}>{t(hostMode
        ? 'multiplayer.lobby.seatHintHost'
        : 'multiplayer.lobby.seatHintGuest')}</Text>
    </View>
  );

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

  const shareInvite = () => {
    void Share.share({ message: t('multiplayer.lobby.shareMessage', { code: room.roomCode }) });
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.lobbyContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.lobbyTop, wide && styles.lobbyTopWide]}>
          <View style={styles.intro}>
            <Text style={styles.eyebrow}>{t('multiplayer.lobby.eyebrow')}</Text>
            <Text accessibilityRole="header" style={styles.title}>{t('multiplayer.lobby.title')}</Text>
            <Text style={styles.description}>
              {t('multiplayer.lobby.tableSummary', {
                count: room.config.seatCount,
                hands: sessionLabel,
                stack: formatChips(room.config.startingStackChips),
              })}
            </Text>
          </View>
          <View style={styles.codeCard}>
            <View>
              <Text style={styles.codeLabel}>{t('multiplayer.lobby.roomCode')}</Text>
              <Text accessibilityLabel={`${t('multiplayer.lobby.roomCode')} ${room.roomCode}`} style={styles.codeValue}>
                {room.roomCode}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={t('multiplayer.lobby.share')}
              accessibilityRole="button"
              onPress={shareInvite}
              style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}
            >
              <Ionicons color={palette.primary} name="share-outline" size={18} />
              <Text style={styles.shareText}>{t('multiplayer.lobby.share')}</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.lobbyTableWrap, { height: tableHeight }]}>
          <View style={styles.lobbyTable}>
            <View style={styles.lobbyTableInner} />
            <View style={styles.lobbyCenterCopy}>
              <View style={styles.privatePill}>
                <Ionicons color={palette.tableText} name="lock-closed" size={wide ? 14 : 11} />
                <Text style={styles.privatePillText}>{t('multiplayer.lobby.coachingOff')}</Text>
              </View>
              <Text style={styles.waitingText}>{t('multiplayer.lobby.waiting')}</Text>
            </View>
            {seats.map((seat) => (
              <LobbySeat
                anchorSeat={((seat.seat - (viewer?.seat ?? 0) + room.config.seatCount) % room.config.seatCount) as number}
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
                wide={wide}
              />
            ))}
          </View>
        </View>

        {wide && seatHint}
      </ScrollView>
      {!wide && <View style={styles.lobbyHintDock}>{seatHint}</View>}
      <BottomAction busy={busy} enabled={primaryEnabled} label={primaryLabel} note={note} onPress={handlePrimary} />
    </>
  );
}

function MultiplayerGameTable({
  busy,
  height,
  onCommand,
  room,
  wide,
}: {
  busy: boolean;
  height: number;
  onCommand: (command: MultiplayerClientCommand) => Promise<void>;
  room: MultiplayerViewerProjection;
  wide: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, wide), [palette, wide]);
  const [nowMs, setNowMs] = useState(Date.now());
  const [betSizingVisible, setBetSizingVisible] = useState(false);
  const [actionQueue, setActionQueue] = useState<Array<{
    action: MultiwayActionRecord;
    historyIndex: number;
    key: string;
  }>>([]);
  const timeoutVersion = useRef<number | null>(null);
  const observedHistory = useRef<{ handNumber: number; length: number } | null>(null);
  const hand = room.hand;
  const viewerSeat = room.seats.find((seat) => seat.playerId === room.viewerPlayerId);
  const hostMode = room.hostPlayerId === room.viewerPlayerId;
  const handResult = hand
    ? buildMultiplayerResultPresentation(hand, room.viewerPlayerId, t)
    : null;
  const tableHeight = wide
    ? Math.min(
      room.config.seatCount === 6 ? handResult ? 720 : 760 : handResult ? 620 : 680,
      Math.max(room.config.seatCount === 6 ? 560 : 500, height * (handResult ? 0.62 : 0.72)),
    )
    : Math.min(
      room.config.seatCount === 6 ? 470 : 430,
      Math.max(330, height * (handResult ? 0.54 : 0.61)),
    );
  const secondsLeft = room.turnDeadlineAtMs === null
    ? null
    : Math.max(0, Math.ceil((room.turnDeadlineAtMs - nowMs) / 1_000));
  const actingPlayer = hand?.toAct ? hand.players[hand.toAct] : null;
  const viewerTurn = hand?.toAct === room.viewerPlayerId && room.legalActions !== null;
  const spotlightAction = actionQueue[0]?.action ?? null;

  useEffect(() => {
    if (!hand) {
      observedHistory.current = null;
      setActionQueue([]);
      return;
    }
    const previous = observedHistory.current;
    const sameHand = previous?.handNumber === hand.handNumber;
    const start = sameHand ? Math.min(previous.length, hand.history.length) : 0;
    const additions = hand.history.slice(start).map((action, offset) => ({
      action,
      historyIndex: start + offset,
      key: `${hand.handNumber}:${start + offset}:${action.playerId}:${action.type}`,
    }));
    observedHistory.current = { handNumber: hand.handNumber, length: hand.history.length };
    if (additions.length > 0) {
      setActionQueue((current) => sameHand ? [...current, ...additions] : additions);
    } else if (!sameHand) {
      setActionQueue([]);
    }
  }, [hand?.handNumber, hand?.history.length]);

  useEffect(() => {
    if (!actionQueue[0]) return undefined;
    const timer = setTimeout(() => setActionQueue((current) => current.slice(1)), 950);
    return () => clearTimeout(timer);
  }, [actionQueue[0]?.key]);

  useEffect(() => {
    if (!viewerTurn) setBetSizingVisible(false);
  }, [viewerTurn]);

  useEffect(() => {
    if (room.status !== 'playing' || room.turnDeadlineAtMs === null) return undefined;
    const interval = setInterval(() => setNowMs(Date.now()), 500);
    return () => clearInterval(interval);
  }, [room.status, room.turnDeadlineAtMs]);

  useEffect(() => {
    if (
      room.status !== 'playing'
      || room.turnDeadlineAtMs === null
      || room.turnDeadlineAtMs > nowMs
      || busy
      || timeoutVersion.current === room.version
    ) return;
    timeoutVersion.current = room.version;
    void onCommand({ type: 'tick' });
  }, [busy, nowMs, onCommand, room.status, room.turnDeadlineAtMs, room.version]);

  const actionPanel = (() => {
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
    if (handResult) {
      const reclaim = room.status === 'between-hands' && viewerSeat?.control === 'ai';
      const canDeal = room.status === 'between-hands' && hostMode && !reclaim;
      return (
        <MultiplayerHandResultPanel
          busy={busy}
          note={room.status === 'complete'
            ? t('multiplayer.game.completeDetail')
            : !canDeal && !reclaim ? t('multiplayer.result.waitingForHost') : undefined}
          onPress={reclaim
            ? () => { void onCommand({ type: 'reclaim' }); }
            : canDeal ? () => { void onCommand({ type: 'next-hand' }); } : undefined}
          primaryLabel={reclaim
            ? t('multiplayer.game.reclaim')
            : canDeal ? t('multiplayer.game.nextHand') : undefined}
          result={handResult}
          wide={wide}
        />
      );
    }
    if (room.status === 'complete') {
      return (
        <View style={styles.gameStatePanel}>
          <Text style={styles.gameStateTitle}>{t('multiplayer.game.complete')}</Text>
          <Text style={styles.gameStateCopy}>{t('multiplayer.game.completeDetail')}</Text>
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
      return hostMode ? (
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
    if (!viewerTurn || !legal) {
      return (
        <View style={styles.gameStatePanel}>
          {busy && <ActivityIndicator color={palette.primary} size="small" />}
          <Text style={styles.gameStateTitle}>{actingPlayer
            ? t('multiplayer.game.playerTurn', { name: actingPlayer.name })
            : t('multiplayer.game.waiting')}</Text>
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
      <View style={styles.gameMetaRow}>
        <View>
          <Text style={styles.eyebrow}>{hand
            ? t('multiplayer.game.hand', { count: hand.handNumber })
            : t('multiplayer.lobby.title')}</Text>
          <Text style={styles.gameStreet}>{hand ? localizedStreet(hand.street, t) : room.status}</Text>
        </View>
        {secondsLeft !== null && room.status === 'playing' && (
          <View style={[styles.timerPill, secondsLeft <= 8 && styles.timerPillUrgent]}>
            <Ionicons color={secondsLeft <= 8 ? palette.danger : palette.primary} name="timer-outline" size={16} />
            <Text style={[styles.timerText, secondsLeft <= 8 && styles.timerTextUrgent]}>
              {t('multiplayer.game.seconds', { count: secondsLeft })}
            </Text>
          </View>
        )}
      </View>

      <View style={[styles.gameTableWrap, { height: tableHeight }]}>
        <View style={styles.gameTable}>
          <View style={styles.gameTableInner} />
          <View style={styles.gameCenter}>
            <View style={styles.potPill}>
              <Text style={styles.potText}>{t('multiplayer.game.pot', {
                amount: formatChips(handResult?.totalPot ?? hand?.pot ?? 0),
              })}</Text>
            </View>
            <View style={styles.boardCards}>
              {Array.from({ length: 5 }, (_, index) => (
                <PlayingCard card={hand?.board[index]} compact={wide} key={`board-${index}`} mini={!wide} />
              ))}
            </View>
            {handResult ? (
              <View style={styles.tableResultPill}>
                <Ionicons color={palette.aqua} name="trophy" size={wide ? 16 : 12} />
                <Text numberOfLines={2} style={styles.tableResultText}>{handResult.title}</Text>
              </View>
            ) : spotlightAction && hand ? (
              <MultiplayerActionSpotlight
                actionKey={actionQueue[0]?.key ?? ''}
                label={multiplayerActionLabel(
                  hand,
                  spotlightAction,
                  room.viewerPlayerId,
                  t,
                  actionQueue[0]?.historyIndex,
                )}
                wide={wide}
              />
            ) : (
              <Text style={styles.turnCopy}>{viewerTurn
                ? t('multiplayer.game.yourTurn')
                : actingPlayer
                  ? t('multiplayer.game.playerTurn', { name: actingPlayer.name })
                  : t('multiplayer.game.waiting')}</Text>
            )}
          </View>
          {room.seats.map((seat) => {
            const player = hand?.players[seat.playerId];
            if (!player) return null;
            const relativeSeat = ((seat.seat - (viewerSeat?.seat ?? 0) + room.config.seatCount)
              % room.config.seatCount) as number;
            return (
              <MultiplayerGameSeat
                anchorSeat={relativeSeat}
                currentTurn={hand?.toAct === player.id}
                justActed={spotlightAction?.playerId === player.id}
                key={player.id}
                latestAction={hand ? multiplayerSeatActionLabel(hand, player.id, t) : null}
                player={player}
                seat={seat}
                seatCount={room.config.seatCount}
                viewer={player.id === room.viewerPlayerId}
                wide={wide}
              />
            );
          })}
        </View>
      </View>
      {actionPanel}
      {hand && room.legalActions ? (
        <BetSizingModal
          bigBlind={hand.bigBlind}
          currentBet={hand.currentBet}
          legal={room.legalActions}
          onClose={() => setBetSizingVisible(false)}
          onConfirm={(target) => {
            setBetSizingVisible(false);
            void onCommand({ action: { amount: target, type: 'raise' }, type: 'action' });
          }}
          playerStreetBet={hand.players[room.viewerPlayerId]?.streetBet ?? 0}
          pot={hand.pot}
          visible={betSizingVisible}
        />
      ) : null}
    </View>
  );
}

function MultiplayerGameSeat({
  anchorSeat,
  currentTurn,
  justActed,
  latestAction,
  player,
  seat,
  seatCount,
  viewer,
  wide,
}: {
  anchorSeat: number;
  currentTurn: boolean;
  justActed: boolean;
  latestAction: string | null;
  player: NonNullable<MultiplayerViewerProjection['hand']>['players'][string];
  seat: MultiplayerViewerProjection['seats'][number];
  seatCount: MultiplayerSeatCount;
  viewer: boolean;
  wide: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, wide), [palette, wide]);
  const anchor = multiplayerSeatAnchor(seatCount, anchorSeat);
  const status = seat.connection === 'offline'
    ? t('multiplayer.game.offline')
    : seat.control === 'ai' && seat.kind === 'human'
      ? t('multiplayer.game.aiControl')
      : player.folded
        ? t('multiway.state.folded')
        : player.allIn
          ? t('multiway.state.allIn')
          : currentTurn ? viewer ? t('multiplayer.game.yourTurn') : t('table.acting') : null;
  const role = player.id === seat.playerId && player.position ? player.position : null;
  return (
    <View style={[
      styles.gameSeat,
      anchor,
      viewer && styles.gameSeatViewer,
      currentTurn && styles.gameSeatActive,
      justActed && styles.gameSeatJustActed,
      player.folded && styles.gameSeatFolded,
    ]}>
      <View style={styles.gameSeatCards}>
        {Array.from({ length: 2 }, (_, index) => (
          <PlayingCard
            card={player.holeCards[index]}
            hidden={!player.holeCards[index]}
            key={`${player.id}-card-${index}`}
            mini={!wide}
          />
        ))}
      </View>
      <View style={[styles.gameSeatLabel, justActed && styles.gameSeatLabelJustActed]}>
        <View style={styles.gameSeatNameRow}>
          <Text numberOfLines={1} style={styles.gameSeatName}>{viewer ? t('multiplayer.lobby.you') : player.name}</Text>
          {role && <Text style={styles.gameRole}>{role}</Text>}
        </View>
        <Text style={styles.gameSeatStack}>{formatChips(player.stack)}</Text>
        {(status ?? latestAction) && (
          <Text numberOfLines={1} style={styles.gameSeatStatus}>{status ?? latestAction}</Text>
        )}
      </View>
    </View>
  );
}

function MultiplayerActionSpotlight({
  actionKey,
  label,
  wide,
}: {
  actionKey: string;
  label: string;
  wide: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, wide), [palette, wide]);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.spring(progress, {
      damping: 16,
      mass: 0.7,
      stiffness: 220,
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [actionKey, progress]);

  return (
    <Animated.View
      accessibilityLabel={`${t('multiplayer.game.actionHistory')}. ${label}`}
      accessibilityLiveRegion="polite"
      style={[
        styles.actionSpotlight,
        {
          opacity: progress,
          transform: [{
            scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }),
          }],
        },
      ]}
    >
      <View style={styles.actionSpotlightDot} />
      <Text numberOfLines={2} style={styles.actionSpotlightText}>{label}</Text>
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
        accessibilityLabel={`${result.title}. ${result.detail} ${t('multiplayer.result.finalPot', {
          amount: formatChips(result.totalPot),
        })}`}
        accessibilityLiveRegion="polite"
        accessible
        style={styles.resultCopy}
      >
        <Text numberOfLines={wide ? 1 : 2} style={styles.resultTitle}>{result.title}</Text>
        <Text numberOfLines={2} style={styles.resultDetail}>{result.detail}</Text>
        <View style={styles.resultPayouts}>
          <Text style={styles.resultPot}>{t('multiplayer.result.finalPot', {
            amount: formatChips(result.totalPot),
          })}</Text>
          {result.payouts.slice(0, wide ? 3 : 2).map((payout) => (
            <Text key={payout.playerId} numberOfLines={1} style={styles.resultPayout}>
              {t('multiplayer.result.payout', {
                amount: formatChips(payout.amount),
                player: payout.label,
              })}
            </Text>
          ))}
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
              <Text numberOfLines={1} style={styles.resultButtonText}>{primaryLabel}</Text>
              <Ionicons color={palette.primaryText} name="arrow-forward" size={wide ? 18 : 16} />
            </>
          )}
        </Pressable>
      ) : note ? <Text numberOfLines={2} style={styles.resultNote}>{note}</Text> : null}
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
      <Text numberOfLines={1} style={[
        styles.gameActionText,
        danger && styles.gameActionTextDanger,
        primary && styles.gameActionTextPrimary,
      ]}>{label}</Text>
    </Pressable>
  );
}

function LobbySeat({
  anchorSeat,
  hostMode,
  onPress,
  seat,
  seatCount,
  wide,
}: {
  anchorSeat: number;
  hostMode: boolean;
  onPress: () => void;
  seat: MultiplayerLobbySeat;
  seatCount: MultiplayerSeatCount;
  wide: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, wide), [palette, wide]);
  const anchor = multiplayerSeatAnchor(seatCount, anchorSeat);
  const label = seat.kind === 'open'
    ? t('multiplayer.lobby.openSeat')
    : seat.displayName ?? t('common.opponent');
  const status = seat.kind === 'ai'
    ? t('multiplayer.lobby.ai')
    : seat.kind === 'open'
      ? t('multiplayer.lobby.addAi')
      : seat.isViewer
        ? t('multiplayer.lobby.you')
        : seat.isHost
          ? t('multiplayer.lobby.host')
          : seat.ready ? t('multiplayer.lobby.ready') : t('multiplayer.lobby.notReady');
  const enabled = hostMode && seat.kind !== 'human';
  return (
    <Pressable
      accessibilityLabel={`${label}. ${status}`}
      accessibilityRole={enabled ? 'button' : undefined}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.lobbySeat,
        anchor,
        seat.kind === 'open' && styles.lobbySeatOpen,
        seat.isViewer && styles.lobbySeatViewer,
        pressed && styles.pressed,
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
          size={wide ? 20 : 15}
        />
      </View>
      <View style={styles.seatCopy}>
        <Text numberOfLines={1} style={[styles.seatName, seat.kind === 'open' && styles.seatNameOpen]}>{label}</Text>
        <Text numberOfLines={1} style={[
          styles.seatStatus,
          seat.kind === 'open' && styles.seatStatusOpen,
          seat.ready && styles.seatStatusReady,
        ]}>{status}</Text>
      </View>
      {seat.isHost && <Ionicons color={palette.aqua} name="star" size={wide ? 13 : 10} style={styles.hostStar} />}
    </Pressable>
  );
}

function createStyles(palette: ThemePalette, wide: boolean) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background },
    header: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: wide ? 28 : 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
    headerButton: { width: 39, height: 39, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    headerProgress: { flexDirection: 'row', alignItems: 'center' },
    progressDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: palette.border, backgroundColor: palette.background },
    progressDotActive: { borderColor: palette.primary, backgroundColor: palette.primary },
    progressLine: { width: 34, height: 1.5, backgroundColor: palette.border },
    content: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: 22, paddingHorizontal: wide ? 30 : 18, paddingTop: wide ? 26 : 20, paddingBottom: 28 },
    joinContent: { maxWidth: 560, paddingTop: wide ? 58 : 32 },
    intro: { gap: 5 },
    eyebrow: { color: palette.primary, fontSize: 10.5, fontWeight: '800', letterSpacing: 1.05, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: wide ? 30 : 25, lineHeight: wide ? 37 : 31, fontWeight: '800', letterSpacing: -0.65 },
    description: { maxWidth: 590, color: palette.muted, fontSize: 13, lineHeight: 19 },
    form: { gap: 20 },
    formWide: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18 },
    fullWidth: { width: '100%' },
    fieldLabel: { color: palette.text, fontSize: 12, fontWeight: '800', marginBottom: 8 },
    fieldHint: { color: palette.muted, fontSize: 10.5, lineHeight: 15, marginTop: 6 },
    input: { minHeight: 49, paddingHorizontal: 14, borderRadius: 13, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, color: palette.text, fontSize: 15, fontWeight: '600' },
    codeInput: { height: 64, textAlign: 'center', fontSize: 26, fontWeight: '900', letterSpacing: 7, color: palette.primary },
    fieldDivider: { height: StyleSheet.hairlineWidth, marginVertical: 18, backgroundColor: palette.border },
    optionGroup: { flexGrow: 1, flexBasis: wide ? '47%' : '100%' },
    optionRow: { flexDirection: 'row', gap: 7 },
    option: { flex: 1, minHeight: 43, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    optionSelected: { borderColor: palette.primary, backgroundColor: palette.primary },
    optionText: { color: palette.muted, fontSize: 11, fontWeight: '800' },
    optionTextSelected: { color: palette.primaryText },
    noteStack: { width: '100%', gap: 8 },
    infoNote: { flex: 1, minHeight: 40, flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 10, borderRadius: 12, backgroundColor: palette.aquaSoft },
    infoNoteText: { flex: 1, color: palette.aquaText, fontSize: 10.5, lineHeight: 15, fontWeight: '600' },
    joinCard: { padding: 18, borderRadius: 19, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceRaised, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.07, shadowRadius: 20, elevation: 2 },
    joinTrustRow: { flexDirection: wide ? 'row' : 'column', gap: 8 },
    bottomBar: { gap: 7, paddingHorizontal: wide ? 30 : 18, paddingTop: 10, paddingBottom: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, backgroundColor: palette.background },
    bottomNote: { color: palette.muted, fontSize: 10.5, lineHeight: 14, textAlign: 'center' },
    bottomButton: { width: '100%', maxWidth: 700, minHeight: 50, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18, borderRadius: 14, backgroundColor: palette.primary, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 2 },
    bottomButtonText: { color: palette.primaryText, fontSize: 14, fontWeight: '800' },
    lobbyContent: { width: '100%', maxWidth: 820, alignSelf: 'center', gap: wide ? 16 : 13, paddingHorizontal: wide ? 30 : 12, paddingTop: wide ? 16 : 12, paddingBottom: 12 },
    lobbyTop: { gap: 13, paddingHorizontal: wide ? 0 : 6 },
    lobbyTopWide: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 },
    codeCard: { minWidth: wide ? 300 : undefined, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 18, padding: 12, borderRadius: 15, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    codeLabel: { color: palette.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
    codeValue: { color: palette.text, fontSize: 20, fontWeight: '900', letterSpacing: 3, marginTop: 2 },
    shareButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, borderRadius: 11, backgroundColor: palette.accentSoft },
    shareText: { color: palette.primary, fontSize: 11, fontWeight: '800' },
    lobbyTableWrap: { width: '100%', maxWidth: 720, alignSelf: 'center' },
    lobbyTable: { flex: 1, overflow: 'hidden', borderRadius: wide ? 42 : 34, borderWidth: 3, borderColor: palette.tableLine, backgroundColor: palette.table, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 4 },
    lobbyTableInner: { position: 'absolute', left: 11, right: 11, top: 11, bottom: 11, borderRadius: wide ? 34 : 26, borderWidth: 1, borderColor: palette.tableLine },
    lobbyCenterCopy: { position: 'absolute', left: '27%', right: '27%', top: '42%', alignItems: 'center', gap: 7 },
    privatePill: { minHeight: wide ? 32 : 25, flexDirection: 'row', alignItems: 'center', gap: wide ? 7 : 5, paddingHorizontal: wide ? 12 : 9, borderRadius: 99, backgroundColor: palette.tableDeep },
    privatePillText: { color: palette.tableText, fontSize: wide ? 10.5 : 8.5, fontWeight: '800' },
    waitingText: { color: palette.tableText, fontSize: wide ? 14 : 11, fontWeight: '800', textAlign: 'center' },
    lobbySeat: { position: 'absolute', width: wide ? 180 : 92, minHeight: wide ? 80 : 54, flexDirection: 'row', alignItems: 'center', gap: wide ? 10 : 7, padding: wide ? 12 : 7, borderRadius: wide ? 17 : 14, borderWidth: 1.5, borderColor: palette.tableLine, backgroundColor: palette.tableDeep },
    lobbySeatOpen: { borderColor: palette.aqua, borderStyle: 'dashed', backgroundColor: palette.tableDeep },
    lobbySeatViewer: { borderColor: palette.aqua, borderWidth: 2 },
    seatAvatar: { width: wide ? 40 : 26, height: wide ? 40 : 26, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: wide ? 20 : 15, backgroundColor: palette.aquaSoft },
    seatAvatarAi: { backgroundColor: palette.accentSoft },
    seatAvatarOpen: { borderWidth: 1, borderColor: palette.tableLine, backgroundColor: palette.table },
    seatCopy: { flex: 1, minWidth: 0, gap: 1 },
    seatName: { color: palette.tableText, fontSize: wide ? 15 : 9.5, fontWeight: '800' },
    seatNameOpen: { color: palette.tableText },
    seatStatus: { color: palette.tableLine, fontSize: wide ? 11 : 7.5, fontWeight: '700' },
    seatStatusOpen: { color: palette.aqua },
    seatStatusReady: { color: palette.aqua },
    hostStar: { position: 'absolute', right: wide ? 7 : 5, top: wide ? 6 : 4 },
    lobbyHintDock: { paddingHorizontal: wide ? 30 : 12, paddingBottom: 2, backgroundColor: palette.background },
    lobbyHint: { width: '100%', maxWidth: 720, minHeight: wide ? 52 : 44, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: wide ? 11 : 9, paddingHorizontal: wide ? 15 : 12, borderRadius: 13, backgroundColor: palette.aquaSoft },
    lobbyHintText: { flex: 1, color: palette.aquaText, fontSize: wide ? 13 : 10.5, lineHeight: wide ? 18 : 15, fontWeight: '600' },
    gameScreen: { flex: 1, width: '100%', maxWidth: 980, alignSelf: 'center', gap: wide ? 12 : 8, paddingHorizontal: wide ? 28 : 8, paddingTop: wide ? 12 : 7, paddingBottom: 8 },
    gameMetaRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: wide ? 8 : 6 },
    gameStreet: { color: palette.text, fontSize: wide ? 18 : 15, fontWeight: '900', textTransform: 'capitalize', marginTop: 1 },
    timerPill: { minWidth: 68, minHeight: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 12, backgroundColor: palette.accentSoft },
    timerPillUrgent: { borderWidth: 1, borderColor: palette.danger },
    timerText: { color: palette.primary, fontSize: 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
    timerTextUrgent: { color: palette.danger },
    gameTableWrap: { width: '100%', maxWidth: 880, alignSelf: 'center' },
    gameTable: { flex: 1, overflow: 'hidden', borderRadius: wide ? 30 : 25, borderWidth: 3, borderColor: palette.tableLine, backgroundColor: palette.table, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 4 },
    gameTableInner: { position: 'absolute', left: 10, right: 10, top: 10, bottom: 10, borderRadius: wide ? 22 : 18, borderWidth: 1, borderColor: palette.tableLine },
    gameCenter: { position: 'absolute', left: wide ? '25%' : '20%', right: wide ? '25%' : '20%', top: wide ? '40%' : '37%', alignItems: 'center', gap: wide ? 10 : 6 },
    potPill: { minHeight: wide ? 31 : 25, alignItems: 'center', justifyContent: 'center', paddingHorizontal: wide ? 13 : 9, borderRadius: 99, borderWidth: 1, borderColor: palette.tableLine, backgroundColor: palette.tableDeep },
    potText: { color: palette.tableText, fontSize: wide ? 12 : 9, fontWeight: '900' },
    boardCards: { flexDirection: 'row', justifyContent: 'center', gap: wide ? 5 : 3 },
    turnCopy: { color: palette.aqua, fontSize: wide ? 12 : 9, fontWeight: '900', textAlign: 'center' },
    actionSpotlight: { maxWidth: '100%', minHeight: wide ? 34 : 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wide ? 7 : 5, paddingHorizontal: wide ? 12 : 8, paddingVertical: wide ? 7 : 5, borderRadius: wide ? 11 : 9, borderWidth: 1, borderColor: palette.aqua, backgroundColor: palette.tableDeep },
    actionSpotlightDot: { width: wide ? 7 : 5, height: wide ? 7 : 5, borderRadius: 99, backgroundColor: palette.aqua },
    actionSpotlightText: { flexShrink: 1, color: palette.tableText, fontSize: wide ? 11.5 : 8.5, lineHeight: wide ? 15 : 11, fontWeight: '900', textAlign: 'center' },
    tableResultPill: { maxWidth: '100%', minHeight: wide ? 36 : 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wide ? 7 : 5, paddingHorizontal: wide ? 12 : 8, paddingVertical: wide ? 7 : 5, borderRadius: wide ? 11 : 9, borderWidth: 1, borderColor: palette.aqua, backgroundColor: palette.tableDeep },
    tableResultText: { flexShrink: 1, color: palette.tableText, fontSize: wide ? 12 : 8.5, lineHeight: wide ? 16 : 11, fontWeight: '900', textAlign: 'center' },
    gameSeat: { position: 'absolute', width: wide ? 200 : 94, minHeight: wide ? 150 : 67, alignItems: 'center', justifyContent: 'flex-end' },
    gameSeatViewer: { width: wide ? 220 : 104 },
    gameSeatActive: { zIndex: 2 },
    gameSeatJustActed: { zIndex: 3 },
    gameSeatFolded: { opacity: 0.48 },
    gameSeatCards: { height: wide ? 74 : 30, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: wide ? 6 : 2, marginBottom: -7, zIndex: 2 },
    gameSeatLabel: { width: '100%', minHeight: wide ? 74 : 43, alignItems: 'center', justifyContent: 'center', gap: wide ? 2 : 1, paddingHorizontal: wide ? 12 : 5, paddingVertical: wide ? 9 : 4, borderRadius: wide ? 14 : 10, borderWidth: 1.5, borderColor: palette.tableLine, backgroundColor: palette.tableDeep },
    gameSeatLabelJustActed: { borderColor: palette.primary, backgroundColor: palette.table },
    gameSeatNameRow: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
    gameSeatName: { maxWidth: wide ? 138 : 63, color: palette.tableText, fontSize: wide ? 16 : 9, fontWeight: '900' },
    gameRole: { color: palette.aqua, fontSize: wide ? 10 : 6.5, fontWeight: '900' },
    gameSeatStack: { color: palette.tableText, fontSize: wide ? 14 : 8, fontWeight: '800' },
    gameSeatStatus: { color: palette.aqua, fontSize: wide ? 11.5 : 7, fontWeight: '800' },
    gameActions: { width: '100%', maxWidth: 880, minHeight: wide ? 66 : 54, alignSelf: 'center', flexDirection: 'row', gap: wide ? 10 : 7, padding: wide ? 5 : 0, borderRadius: wide ? 18 : 0, backgroundColor: wide ? palette.soft : 'transparent' },
    gameAction: { flex: 1, minHeight: wide ? 56 : 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wide ? 7 : 5, paddingHorizontal: 7, borderRadius: wide ? 13 : 11, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    gameActionDanger: { borderColor: palette.danger },
    gameActionPrimary: { borderColor: palette.primary, backgroundColor: palette.primary },
    gameActionText: { color: palette.text, fontSize: wide ? 14 : 11, fontWeight: '900', textAlign: 'center' },
    gameActionTextDanger: { color: palette.danger },
    gameActionTextPrimary: { color: palette.primaryText },
    gameStatePanel: { minHeight: wide ? 62 : 54, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    gameStateTitle: { color: palette.text, fontSize: wide ? 13 : 11, fontWeight: '900', textAlign: 'center' },
    gameStateCopy: { color: palette.muted, fontSize: wide ? 11 : 9.5, fontWeight: '600', textAlign: 'center' },
    resultPanel: { width: '100%', maxWidth: 880, minHeight: wide ? 104 : 88, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: wide ? 14 : 9, padding: wide ? 14 : 10, borderRadius: wide ? 18 : 14, borderWidth: 1.5, backgroundColor: palette.surface },
    resultPanelWide: { paddingHorizontal: 16 },
    resultIcon: { width: wide ? 48 : 38, height: wide ? 48 : 38, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: wide ? 15 : 12 },
    resultCopy: { flex: 1, minWidth: 0, gap: wide ? 3 : 2 },
    resultTitle: { color: palette.text, fontSize: wide ? 16 : 12, fontWeight: '900' },
    resultDetail: { color: palette.muted, fontSize: wide ? 11.5 : 8.5, lineHeight: wide ? 16 : 12, fontWeight: '600' },
    resultPayouts: { flexDirection: 'row', flexWrap: 'wrap', gap: wide ? 7 : 4, marginTop: wide ? 3 : 1 },
    resultPot: { color: palette.text, fontSize: wide ? 10.5 : 7.5, fontWeight: '900' },
    resultPayout: { maxWidth: wide ? 150 : 100, color: palette.aqua, fontSize: wide ? 10.5 : 7.5, fontWeight: '900' },
    resultButton: { minWidth: wide ? 178 : 106, minHeight: wide ? 50 : 42, flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: wide ? 15 : 10, borderRadius: wide ? 13 : 11, backgroundColor: palette.primary },
    resultButtonText: { color: palette.primaryText, fontSize: wide ? 12.5 : 9.5, fontWeight: '900' },
    resultNote: { maxWidth: wide ? 190 : 100, flexShrink: 1, color: palette.muted, fontSize: wide ? 10.5 : 7.5, lineHeight: wide ? 15 : 10, fontWeight: '700', textAlign: 'center' },
    pressed: { opacity: 0.74, transform: [{ scale: 0.99 }] },
    disabled: { opacity: 0.42 },
  });
}
