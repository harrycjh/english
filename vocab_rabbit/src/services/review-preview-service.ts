import type { DailyTaskSummary } from '../models/daily-task';
import type { WordPayload, WordRecord } from '../models/word';
import { hasLifePhotoSource } from './word-service';

const PREVIEW_WORD_LIMIT = 12;

export function getPreviewSourceTagWeight(
  word: WordRecord,
  localLifePhotoWordIds: ReadonlySet<string> = new Set(),
): number {
  const relatedMedia = word.relatedMedia;
  const regularTagCount = Number(Boolean(relatedMedia?.raz))
    + Number(Boolean(relatedMedia?.oxford))
    + Number(Boolean(relatedMedia?.redRocket));
  const hasLifePhoto = hasLifePhotoSource(word) || localLifePhotoWordIds.has(word.id);
  return regularTagCount + (hasLifePhoto ? 2 : 0);
}

function rankWordGroup(
  wordIds: string[],
  wordsById: ReadonlyMap<string, WordRecord>,
  localLifePhotoWordIds: ReadonlySet<string>,
): WordRecord[] {
  return wordIds
    .map((wordId, originalIndex) => ({ word: wordsById.get(wordId), originalIndex }))
    .filter((item): item is { word: WordRecord; originalIndex: number } => Boolean(item.word))
    .sort((left, right) => (
      getPreviewSourceTagWeight(right.word, localLifePhotoWordIds)
      - getPreviewSourceTagWeight(left.word, localLifePhotoWordIds)
      || left.originalIndex - right.originalIndex
    ))
    .map((item) => item.word);
}

export function buildReviewPreviewWords(
  payload: WordPayload | null,
  task: DailyTaskSummary | null,
  localLifePhotoWordIds: ReadonlySet<string> = new Set(),
): WordRecord[] {
  if (!payload || !task) return [];

  const wordsById = new Map(payload.words.map((word) => [word.id, word]));
  const newWords = rankWordGroup(task.newWordIds, wordsById, localLifePhotoWordIds);
  const reviewWords = rankWordGroup(task.reviewWordIds, wordsById, localLifePhotoWordIds);
  return [...newWords, ...reviewWords].slice(0, PREVIEW_WORD_LIMIT);
}
