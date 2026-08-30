import type { QuestionKind } from '../services/question-service';
import type { LearningRecord } from './learning-record';

export type LearningAction = 'answer' | 'recognized' | 'unknown';

export interface PronunciationResult {
  targetType: 'word';
  targetText: string;
  provider: 'aliyun-ssecp';
  status: 'scored' | 'skipped' | 'unavailable';
  overallScore: number | null;
  attemptedAt: string;
  recordId?: string;
}

export interface AnswerEvent {
  id: string;
  wordId: string;
  dateKey: string;
  answeredAt: string;
  questionKind: QuestionKind;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  responseTimeMs: number;
  learningAction?: LearningAction;
  sessionKind?: 'task' | 'practice';
  isSessionRetry?: boolean;
  levelDowngrade?: boolean;
  deviceId?: string;
  schemaVersion?: number;
  generation?: number;
  learningStateBefore?: LearningRecord;
  learningStateAfter?: LearningRecord;
  pronunciation?: PronunciationResult;
}
