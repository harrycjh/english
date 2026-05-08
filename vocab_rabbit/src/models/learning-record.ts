export interface LearningRecord {
  wordId: string;
  masteryLevel: number;
  reviewStage: number;
  correctStreak: number;
  wrongCount: number;
  lastStudiedAt: string | null;
  nextDueAt: string | null;
}