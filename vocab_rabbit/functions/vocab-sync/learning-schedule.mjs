export const MAX_MASTERY_LEVEL = 9;
export const REVIEW_INTERVAL_DAYS = [0, 1, 2, 3, 5, 8, 13, 21, 30];
const HOUR_MS = 60 * 60 * 1000;
const STUDY_TIME_ZONE_OFFSET_HOURS = 8;
const STUDY_DAY_REFRESH_HOUR = 4;

function createStudyDateKey(date) {
  const studyDayOffsetHours = STUDY_TIME_ZONE_OFFSET_HOURS - STUDY_DAY_REFRESH_HOUR;
  return new Date(date.getTime() + studyDayOffsetHours * HOUR_MS).toISOString().slice(0, 10);
}

function addDaysToDateKey(dateKey, days) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getReviewDueAt(answeredAt, delayDays) {
  const dueDateKey = addDaysToDateKey(createStudyDateKey(answeredAt), delayDays);
  return new Date(`${dueDateKey}T04:00:00.000+08:00`);
}

export function getMasteredReviewDelayDays(wordId, answeredAt) {
  const seed = `${wordId}|${answeredAt.toISOString().slice(0, 10)}|mastered`;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  }
  return 60 + ((hash >>> 0) % 31);
}

export function evaluateLearningRecord(current, event) {
  const answeredAt = new Date(event.answeredAt);
  const currentLevel = Math.min(Math.max(current.masteryLevel, 0), MAX_MASTERY_LEVEL);
  const masteryLevel = event.isCorrect
    ? Math.min(currentLevel + 1, MAX_MASTERY_LEVEL)
    : event.levelDowngrade
      ? Math.max(currentLevel - 1, 0)
      : currentLevel;

  const delayDays = !event.isCorrect
    ? 0
    : masteryLevel >= MAX_MASTERY_LEVEL
      ? getMasteredReviewDelayDays(current.wordId, answeredAt)
      : REVIEW_INTERVAL_DAYS[masteryLevel];
  return {
    ...current,
    masteryLevel,
    reviewStage: masteryLevel,
    correctStreak: event.isCorrect ? current.correctStreak + 1 : 0,
    wrongCount: event.isCorrect ? current.wrongCount : current.wrongCount + 1,
    lastStudiedAt: event.answeredAt,
    nextDueAt: getReviewDueAt(answeredAt, delayDays).toISOString(),
  };
}
