import { useCallback, useEffect, useState } from 'react';

import type { LearningSessionInput } from '../../domain/learning/history';
import {
  recordLearningSnapshot,
  scoreSkillCalibration,
  selectLearningGoal,
  skipLearningSetup,
  type CalibrationAnswer,
  type CalibrationKind,
  type LearningGoalId,
} from '../../domain/learning/guidedProgress';
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
import {
  clearLearningProfile,
  loadLearningProfile,
  saveLearningProfile,
} from '../../services/learningProfile';

export function useLearningProgress() {
  const [progress, setProgress] = useState<LearningProgressEntry[]>(loadCachedLearningProgress);
  const [history, setHistory] = useState(loadCachedLearningHistory);
  const [profile, setProfile] = useState(loadLearningProfile);
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

  const chooseGoal = useCallback((goal: LearningGoalId) => {
    setProfile((current) => saveLearningProfile(selectLearningGoal(current, goal)));
  }, []);

  const skipSetup = useCallback(() => {
    setProfile((current) => saveLearningProfile(skipLearningSetup(current)));
  }, []);

  const recordCalibration = useCallback((answers: readonly CalibrationAnswer[], kind: CalibrationKind) => {
    const snapshot = scoreSkillCalibration(answers, kind, history.length);
    setProfile((current) => saveLearningProfile(recordLearningSnapshot(current, snapshot)));
    return snapshot;
  }, [history.length]);

  const clearProgress = useCallback(async () => {
    await deleteAllLearningProgress();
    clearLearningHistory();
    clearLearningReviewQueue();
    clearLearningProfile();
    setHistory([]);
    setProgress([]);
    setProfile(loadLearningProfile());
  }, []);

  return {
    chooseGoal,
    clearProgress,
    history,
    loading,
    profile,
    progress,
    recordCalibration,
    recordResult,
    recordReviewSession,
    skipSetup,
  };
}
