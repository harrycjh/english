import type { WordRecord } from '../models/word';
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

  return [];
}

export function getExampleTranslations(word: WordRecord): string[] {
  return (word.exampleTranslations ?? [])
    .map(normalizeExample)
    .filter(Boolean)
    .slice(0, 2) as string[];
}

export function getExampleTranslationFocus(word: WordRecord): string[] {
  return (word.exampleTranslationFocus ?? [])
    .map(normalizeExample)
    .filter(Boolean)
    .slice(0, 2) as string[];
}

export interface ExamplePair {
  sentence: string;
  translation: string;
}

export function getPrimaryExamplePair(word: WordRecord): ExamplePair | null {
  const sentence = getExampleSentences(word)[0];
  if (!sentence) return null;
  return {
    sentence,
    translation: getExampleTranslations(word)[0] ?? '',
  };
}
