import type { QuestionKind } from '../services/question-service';

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
}
