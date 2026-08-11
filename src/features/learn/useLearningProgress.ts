import { useCallback, useEffect, useState } from 'react';

import type { LearningSessionInput } from '../../domain/learning/history';
import { applyLearningResult, mergeLearningProgress } from '../../domain/learning/progress';
import type { LearningProgressEntry, LearningResultInput } from '../../domain/learning/types';
import {
  clearLearningHistory,
  loadCachedLearningHistory,
  recordLearningSession,
} from '../../services/learningHistory';
import {
  deleteAllLearningProgress,
  loadCachedLearningProgress,
  loadLearningProgress,
  saveLearningResult,
} from '../../services/learningProgress';
import { clearLearningReviewQueue } from '../../services/learningReviewQueue';

export function useLearningProgress() {
  const [progress, setProgress] = useState<LearningProgressEntry[]>(loadCachedLearningProgress);
  const [history, setHistory] = useState(loadCachedLearningHistory);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void loadLearningProgress().then((loaded) => {
      if (active) {
        setProgress(loaded);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const recordResult = useCallback((input: LearningResultInput) => {
    const updatedAt = new Date().toISOString();
    setHistory(recordLearningSession({
      activityId: input.activityId,
      kind: input.activityType === 'lesson' ? 'lesson' : 'practice',
      score: input.score,
    }, updatedAt));
    setProgress((current) => applyLearningResult(current, input, updatedAt));
    void saveLearningResult(input, updatedAt).then((saved) => {
      setProgress((current) => mergeLearningProgress(current, [saved]));
    });
  }, []);

  const recordReviewSession = useCallback((input: Omit<LearningSessionInput, 'kind'>) => {
    setHistory(recordLearningSession({ ...input, kind: 'review' }));
  }, []);

  const clearProgress = useCallback(async () => {
    await deleteAllLearningProgress();
    clearLearningHistory();
    clearLearningReviewQueue();
    setHistory([]);
    setProgress([]);
  }, []);

  return { clearProgress, history, loading, progress, recordResult, recordReviewSession };
}
