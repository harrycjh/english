import type { QuestionKind } from '../services/question-service';

export const DEBUG_QUESTION_LIMIT = 10;

export function isQuestionKindForDebugLevel(level: number, kind: QuestionKind): boolean {
  const normalizedLevel = Math.min(10, Math.max(0, Math.floor(level)));
  if (normalizedLevel === 0) return kind === 'recognition';
  if (normalizedLevel === 1) return kind === 'image-choice';
  if (normalizedLevel === 2) return kind === 'image-english-choice';
  if (normalizedLevel === 3) return kind === 'image-answer-choice';
  if (normalizedLevel === 4) return kind === 'text-choice';
  if (normalizedLevel === 5) return kind === 'sentence-choice';
  if (normalizedLevel === 6) return kind === 'letter-choice';
  return kind === 'fill-blank';
}

export function sampleDebugWordIds(
  wordIds: string[],
  limit = DEBUG_QUESTION_LIMIT,
): string[] {
  const shuffled = [...wordIds];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled.slice(0, limit);
}
