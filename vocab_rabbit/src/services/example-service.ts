import type { WordRecord } from '../models/word';
import { getStudyText } from './word-service';

function normalizeExample(example: string | undefined): string | null {
  const trimmed = example?.trim();
  return trimmed ? trimmed : null;
}

export function getExampleSentences(word: WordRecord): string[] {
  const curated = [
    ...(word.examples ?? []),
    word.example,
  ].map(normalizeExample).filter(Boolean) as string[];

  if (curated.length > 0) {
    return curated.slice(0, 2);
  }

  const studyText = getStudyText(word);
  if (word.partOfSpeech.includes('adj')) {
    return [`This is ${studyText}.`];
  }

  if (word.partOfSpeech.includes('v')) {
    return [`I can ${studyText}.`];
  }

  return [`I can see ${studyText}.`];
}
