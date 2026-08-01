import { useCallback, useEffect, useState } from 'react';

import { applyLearningResult, mergeLearningProgress } from '../../domain/learning/progress';
import type { LearningProgressEntry, LearningResultInput } from '../../domain/learning/types';
import {
  deleteAllLearningProgress,
  loadCachedLearningProgress,
  loadLearningProgress,
  saveLearningResult,
} from '../../services/learningProgress';

export function useLearningProgress() {
  const [progress, setProgress] = useState<LearningProgressEntry[]>(loadCachedLearningProgress);
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
    setProgress((current) => applyLearningResult(current, input, updatedAt));
    void saveLearningResult(input, updatedAt).then((saved) => {
      setProgress((current) => mergeLearningProgress(current, [saved]));
    });
  }, []);

  const clearProgress = useCallback(async () => {
    await deleteAllLearningProgress();
    setProgress([]);
  }, []);

  return { clearProgress, loading, progress, recordResult };
}
