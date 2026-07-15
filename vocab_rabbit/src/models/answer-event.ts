import type { QuestionKind } from '../services/question-service';
import type { LearningRecord } from './learning-record';

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
  deviceId?: string;
  schemaVersion?: number;
  generation?: number;
  learningStateBefore?: LearningRecord;
  learningStateAfter?: LearningRecord;
}
