import {
  AI_DIFFICULTY_OPTIONS,
  type AiDifficulty,
} from '../../domain/poker/aiProfiles';

export type LocalAiGameMode =
  | 'quick_play'
  | 'custom'
  | 'sit_and_go'
  | 'daily_challenge'
  | 'championship';

export type LocalAiModePolicy =
  | { kind: 'fixed'; difficulty: AiDifficulty }
  | { kind: 'selectable'; options: readonly AiDifficulty[] }
  | { kind: 'authored' };

export const SELECTABLE_AI_DIFFICULTIES: readonly AiDifficulty[] = AI_DIFFICULTY_OPTIONS
  .map((profile) => profile.id);

const LOCAL_AI_MODE_POLICIES: Record<LocalAiGameMode, LocalAiModePolicy> = {
  quick_play: { kind: 'fixed', difficulty: 'club' },
  custom: { kind: 'selectable', options: SELECTABLE_AI_DIFFICULTIES },
  sit_and_go: { kind: 'selectable', options: SELECTABLE_AI_DIFFICULTIES },
  daily_challenge: { kind: 'fixed', difficulty: 'club' },
  championship: { kind: 'authored' },
};

export function localAiModePolicy(mode: LocalAiGameMode): LocalAiModePolicy {
  return LOCAL_AI_MODE_POLICIES[mode];
}


/**
 * Resolves the tier copied into a newly launched table. Keeping this pure and
 * mode-owned prevents a resumed tournament from mutating the user's Custom
 * preference, while fixed and authored modes cannot accidentally inherit it.
 */
export function resolveLocalAiDifficulty({
  authoredDifficulty,
  mode,
  resumeDifficulty,
  selectedDifficulty,
}: {
  authoredDifficulty?: AiDifficulty;
  mode: LocalAiGameMode;
  resumeDifficulty?: AiDifficulty;
  selectedDifficulty?: AiDifficulty;
}): AiDifficulty {
  const policy = localAiModePolicy(mode);
  if (policy.kind === 'fixed') return policy.difficulty;
  if (mode === 'sit_and_go' && resumeDifficulty) return resumeDifficulty;
  if (policy.kind === 'authored') {
    if (!authoredDifficulty) throw new Error('An authored AI mode requires its event difficulty.');
    return authoredDifficulty;
  }
  if (!selectedDifficulty || !policy.options.includes(selectedDifficulty)) {
    // DT-09: a saved public custom difficulty that is no longer selectable
    // (e.g. an earned Nemesis value) must normalize to a visible supported tier
    // instead of producing an invisible selected state. A fully missing value
    // still fails loudly rather than silently picking a tier for the player.
    if (!selectedDifficulty) {
      throw new Error(`AI mode ${mode} requires a selectable difficulty.`);
    }
    return policy.options[policy.options.length - 1] ?? 'club';
  }
  return selectedDifficulty;
}
