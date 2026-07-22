import type { LearningRecord } from '../models/learning-record';
import type { ParentSetting } from '../models/parent-setting';
import {
  createDefaultWordSelectionState,
  type WordSelectionState,
} from '../models/word-selection-state';
import type { WordRecord } from '../models/word';
import { MAX_MASTERY_LEVEL } from './spaced-repetition';

export type LearningBucket = 'new' | 'learning' | 'mastered' | 'paused' | 'disabled';

interface ReviewLoadEstimate {
  dueTomorrowCount: number;
  dueInThreeDaysCount: number;
  dueInSevenDaysCount: number;
  riskLevel: '正常' | '偏高' | '过高';
}

function isWithinDays(targetDateText: string | null, startDate: Date, days: number): boolean {
  if (!targetDateText) {
    return false;
  }

  const targetTime = new Date(targetDateText).getTime();
  const startTime = startDate.getTime();
  const endTime = startTime + days * 24 * 60 * 60 * 1000;
  return targetTime > startTime && targetTime <= endTime;
}

export function ensureSelectionStateMap(
  words: Pick<WordRecord, 'id'>[],
  selectionById: Record<string, WordSelectionState>
): {
  nextSelectionById: Record<string, WordSelectionState>;
  missingStates: WordSelectionState[];
} {
  const nextSelectionById = { ...selectionById };
  const missingStates: WordSelectionState[] = [];

  for (const word of words) {
    if (!nextSelectionById[word.id]) {
      const nextState = createDefaultWordSelectionState(word.id);
      nextSelectionById[word.id] = nextState;
      missingStates.push(nextState);
    }
  }

  return {
    nextSelectionById,
    missingStates,
  };
}

export function isWordEnabledForStudy(
  wordId: string,
  selectionById: Record<string, WordSelectionState>
): boolean {
  const selectionState = selectionById[wordId];
  if (!selectionState) {
    return true;
  }

  return selectionState.isEnabled && !selectionState.isPaused;
}

export function getActiveStudyWords(
  words: WordRecord[],
  selectionById: Record<string, WordSelectionState>
): WordRecord[] {
  if (Object.keys(selectionById).length === 0) {
    return words;
  }

  return words.filter((word) => isWordEnabledForStudy(word.id, selectionById));
}

export function getWordLearningBucket(
  wordId: string,
  record: LearningRecord | undefined,
  selectionState: WordSelectionState | undefined
): LearningBucket {
  if (selectionState?.isPaused) {
    return 'paused';
  }

  if (selectionState && !selectionState.isEnabled) {
    return 'disabled';
  }

  if (!record) {
    return 'new';
  }

  if (record.masteryLevel >= MAX_MASTERY_LEVEL) {
    return 'mastered';
  }

  return 'learning';
}

export function estimateReviewLoad(
  recordsById: Record<string, LearningRecord>,
  selectionById: Record<string, WordSelectionState>,
  setting: ParentSetting,
  date: Date = new Date()
): ReviewLoadEstimate {
  const activeWordIds = Object.values(selectionById)
    .filter((selectionState) => selectionState.isEnabled && !selectionState.isPaused)
    .map((selectionState) => selectionState.wordId);

  const relevantRecords = (activeWordIds.length > 0 ? activeWordIds : Object.keys(recordsById))
    .map((wordId) => recordsById[wordId])
    .filter(Boolean) as LearningRecord[];

  const dueTomorrowCount = relevantRecords.filter((record) => isWithinDays(record.nextDueAt, date, 1)).length;
  const dueInThreeDaysCount = relevantRecords.filter((record) => isWithinDays(record.nextDueAt, date, 3)).length;
  const dueInSevenDaysCount = relevantRecords.filter((record) => isWithinDays(record.nextDueAt, date, 7)).length;
  const averageThreeDayLoad = dueInThreeDaysCount / 3;

  let riskLevel: ReviewLoadEstimate['riskLevel'] = '正常';
  if (averageThreeDayLoad > setting.dailyReviewLimit * 1.5) {
    riskLevel = '过高';
  } else if (averageThreeDayLoad > setting.dailyReviewLimit) {
    riskLevel = '偏高';
  }

  return {
    dueTomorrowCount,
    dueInThreeDaysCount,
    dueInSevenDaysCount,
    riskLevel,
  };
}
