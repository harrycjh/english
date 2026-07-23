import type { WordRecord } from '../models/word';
import { getStudyPartOfSpeech, getStudyText } from './word-service';

function normalizeExample(example: string | undefined): string | null {
  const trimmed = example?.trim();
  return trimmed ? trimmed : null;
}

export function getExampleSentences(word: WordRecord): string[] {
  const senseExamples = word.studySense?.examples;
  const curated = (
    senseExamples
      ? senseExamples
      : [...(word.examples ?? []), word.example]
  ).map(normalizeExample).filter(Boolean) as string[];

  if (curated.length > 0) {
    return curated.slice(0, 2);
  }

  const studyText = getStudyText(word);
  const partOfSpeech = getStudyPartOfSpeech(word);
  if (partOfSpeech.includes('adj')) {
    return [`This is ${studyText}.`];
  }

  if (partOfSpeech.includes('v')) {
    return [`I can ${studyText}.`];
  }

  return [`I can see ${studyText}.`];
}
