export interface DailyTaskSummary {
  dateKey: string;
  newWordIds: string[];
  reviewWordIds: string[];
  completedAt: string | null;
  /** Optional only for records written before manual check-in was introduced. */
  checkedInAt?: string | null;
  correctCount: number;
  wrongCount: number;
  totalAnswered: number;
  answeredWordIds: string[];
}

export interface SessionResult {
  totalAnswered: number;
  correctCount: number;
  wrongCount: number;
}

function normalizeWordIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(
    (wordId): wordId is string => typeof wordId === 'string' && wordId.trim().length > 0,
  ))];
}

function normalizeCount(value: unknown, fallback = 0): number {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : fallback;
}

export function normalizeDailyTaskSummary(task: DailyTaskSummary): DailyTaskSummary {
  const completedAt = typeof task.completedAt === 'string' ? task.completedAt : null;
  const correctCount = normalizeCount(task.correctCount);
  const totalAnswered = normalizeCount(task.totalAnswered);
  return {
    ...task,
    newWordIds: normalizeWordIds(task.newWordIds),
    reviewWordIds: normalizeWordIds(task.reviewWordIds),
    completedAt,
    checkedInAt: task.checkedInAt === undefined
      ? completedAt
      : typeof task.checkedInAt === 'string' ? task.checkedInAt : null,
    correctCount,
    wrongCount: normalizeCount(task.wrongCount, Math.max(totalAnswered - correctCount, 0)),
    totalAnswered,
    answeredWordIds: normalizeWordIds(task.answeredWordIds),
  };
}
