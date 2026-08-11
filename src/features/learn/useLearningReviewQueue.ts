import { useCallback, useState } from 'react';

import type { LearningReviewCapture, LearningReviewOutcome } from '../../domain/learning/reviewQueue';
import {
  loadCachedLearningReviewQueue,
  updateLearningReviewQueue,
} from '../../services/learningReviewQueue';

export function useLearningReviewQueue() {
  const [items, setItems] = useState(loadCachedLearningReviewQueue);

  const record = useCallback((
    captures: readonly LearningReviewCapture[],
    outcomes: readonly LearningReviewOutcome[] = [],
  ) => {
    setItems(updateLearningReviewQueue(captures, outcomes));
  }, []);

  return { items, record };
}
