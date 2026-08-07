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
