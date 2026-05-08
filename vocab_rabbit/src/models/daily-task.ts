export interface DailyTaskSummary {
  dateKey: string;
  newWordIds: string[];
  reviewWordIds: string[];
  completedAt: string | null;
  correctCount: number;
  totalAnswered: number;
}

export interface SessionResult {
  totalAnswered: number;
  correctCount: number;
  wrongCount: number;
}