import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  getGameFeedbackPreferences,
  setHapticsEnabled,
  useGameFeedbackPreferences,
} from './gameFeedbackPreferences';
import {
  feedbackDedupeKey,
  feedbackDescriptorForCue,
  FeedbackDedupeWindow,
  feedbackSupersedesPendingResults,
  GameplayFeedbackScopeScheduler,
  type GameplayFeedbackCue,
} from './gameplayFeedback';
import { playFeedbackHaptic } from './gameplayHaptics';

export interface PlayGameplayFeedbackOptions {
  /** Provider-owned delay; pending work is canceled on background or unmount. */
  delayMs?: number;
  /** Stable hand/action/result id. Reconnect snapshots with the same id stay quiet. */
  eventId?: string;
  /** Set false when another visible event already owns the haptic for this transition. */
  haptic?: boolean;
}

export interface GameplayFeedbackController {
  hapticsEnabled: boolean;
  play: (cue: GameplayFeedbackCue, options?: PlayGameplayFeedbackOptions) => void;
  setHapticsEnabled: typeof setHapticsEnabled;
  stopGameplayFeedback: () => void;
}

const defaultController: GameplayFeedbackController = {
  hapticsEnabled: true,
  play: () => undefined,
  setHapticsEnabled,
  stopGameplayFeedback: () => undefined,
};

const GameplayFeedbackContext = createContext<GameplayFeedbackController>(defaultController);

/**
 * Routes semantic gameplay events to optional tactile feedback. The semantic
 * contract, deduplication, and timing stay independent of the output channel,
 * so a future audio pass can be added without changing table event producers.
 */
export function GameplayFeedbackProvider({ children }: PropsWithChildren) {
  const preferences = useGameFeedbackPreferences();
  const appActiveRef = useRef(AppState.currentState === 'active');
  const scheduledWorkRef = useRef(new GameplayFeedbackScopeScheduler());
  const seenEventsRef = useRef(new FeedbackDedupeWindow());

  const stopGameplayFeedback = useCallback(() => {
    scheduledWorkRef.current.cancelAll();
  }, []);

  const playNow = useCallback((
    cue: GameplayFeedbackCue,
    options: PlayGameplayFeedbackOptions = {},
  ) => {
    if (
      !appActiveRef.current
      || options.haptic === false
      || !getGameFeedbackPreferences().hapticsEnabled
    ) {
      return;
    }
    playFeedbackHaptic(feedbackDescriptorForCue(cue).haptic);
  }, []);

  const play = useCallback((
    cue: GameplayFeedbackCue,
    options: PlayGameplayFeedbackOptions = {},
  ) => {
    if (feedbackSupersedesPendingResults(cue)) {
      // A newly dealt hand invalidates every delayed cue from the previous one.
      scheduledWorkRef.current.cancelAll();
    }
    const key = feedbackDedupeKey(cue, options.eventId);
    if (!seenEventsRef.current.consume(key)) return;
    // Remember background events as consumed. A foreground reconnect must not
    // replay tactile feedback for history that arrived while the app was idle.
    if (!appActiveRef.current) return;
    if (options.haptic === false || !getGameFeedbackPreferences().hapticsEnabled) return;

    const delayMs = Math.max(0, options.delayMs ?? 0);
    if (delayMs === 0) {
      playNow(cue, options);
      return;
    }
    scheduledWorkRef.current.schedule(() => playNow(cue, options), delayMs);
  }, [playNow]);

  useEffect(() => {
    const updateLifecycle = (state: AppStateStatus) => {
      appActiveRef.current = state === 'active';
      if (!appActiveRef.current) stopGameplayFeedback();
    };
    const subscription = AppState.addEventListener('change', updateLifecycle);
    return () => {
      subscription.remove();
      stopGameplayFeedback();
    };
  }, [stopGameplayFeedback]);

  const value = useMemo<GameplayFeedbackController>(() => ({
    hapticsEnabled: preferences.hapticsEnabled,
    play,
    setHapticsEnabled,
    stopGameplayFeedback,
  }), [play, preferences.hapticsEnabled, stopGameplayFeedback]);

  return (
    <GameplayFeedbackContext.Provider value={value}>
      {children}
    </GameplayFeedbackContext.Provider>
  );
}

export function useGameplayFeedback(): GameplayFeedbackController {
  return useContext(GameplayFeedbackContext);
}
