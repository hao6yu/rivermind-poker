export interface DailyChallengeProgress {
  challengeDate: string;
  challengeVersion: number;
  bestScore: number;
  bestPlace: 1 | 2 | 3;
  bestHands: number;
  attempts: number;
  completedAt: string;
  updatedAt: string;
}

export function currentDailyChallengeProgress(
  progress: readonly DailyChallengeProgress[],
  challengeDate: string,
  challengeVersion: number,
): DailyChallengeProgress | null {
  return progress.find((entry) => (
    entry.challengeDate === challengeDate
      && entry.challengeVersion === challengeVersion
  )) ?? null;
}

export function dailyChallengeStreakDatesForVersion(
  progress: readonly DailyChallengeProgress[],
  today: string,
  currentVersion: number,
): string[] {
  return progress
    .filter((entry) => (
      entry.challengeDate !== today
        || entry.challengeVersion === currentVersion
    ))
    .map((entry) => entry.challengeDate);
}

function betterResult(
  left: Pick<DailyChallengeProgress, 'bestScore' | 'bestHands'>,
  right: Pick<DailyChallengeProgress, 'bestScore' | 'bestHands'>,
): 'left' | 'right' {
  if (left.bestScore !== right.bestScore) return left.bestScore > right.bestScore ? 'left' : 'right';
  return left.bestHands <= right.bestHands ? 'left' : 'right';
}

export function mergeDailyChallengeProgress(
  local: readonly DailyChallengeProgress[],
  remote: readonly DailyChallengeProgress[],
): DailyChallengeProgress[] {
  const keys = new Set([...local, ...remote].map((result) => (
    `${result.challengeDate}:${result.challengeVersion}`
  )));
  return [...keys].map((key) => {
    const left = local.find((result) => `${result.challengeDate}:${result.challengeVersion}` === key);
    const right = remote.find((result) => `${result.challengeDate}:${result.challengeVersion}` === key);
    if (!left) return right!;
    if (!right) return left;
    const best = betterResult(left, right) === 'left' ? left : right;
    return {
      ...best,
      attempts: Math.max(left.attempts, right.attempts),
      updatedAt: left.updatedAt > right.updatedAt ? left.updatedAt : right.updatedAt,
    };
  }).sort((left, right) => (
    right.challengeDate.localeCompare(left.challengeDate)
      || right.challengeVersion - left.challengeVersion
  ));
}

export function applyDailyChallengeResult(
  previous: DailyChallengeProgress | undefined,
  result: {
    challengeDate: string;
    challengeVersion: number;
    completedAt: string;
    handsPlayed: number;
    place: 1 | 2 | 3;
    score: number;
  },
  updatedAt: string,
): DailyChallengeProgress {
  const candidate: DailyChallengeProgress = {
    challengeDate: result.challengeDate,
    challengeVersion: result.challengeVersion,
    bestScore: result.score,
    bestPlace: result.place,
    bestHands: result.handsPlayed,
    attempts: (previous?.attempts ?? 0) + 1,
    completedAt: result.completedAt,
    updatedAt,
  };
  return previous && betterResult(previous, candidate) === 'left'
    ? { ...previous, attempts: candidate.attempts, updatedAt }
    : candidate;
}
