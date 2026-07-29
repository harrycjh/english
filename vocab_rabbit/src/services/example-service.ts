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
    return curated.slice(0, 3);
  }

  return [];
}

export function getExampleTranslations(word: WordRecord): string[] {
  return (word.exampleTranslations ?? [])
    .map(normalizeExample)
    .filter(Boolean)
    .slice(0, 3) as string[];
}

export function getExampleTranslationFocus(word: WordRecord): string[] {
  return (word.exampleTranslationFocus ?? [])
    .map(normalizeExample)
    .filter(Boolean)
    .slice(0, 3) as string[];
}

export interface ExamplePair {
  sentence: string;
  translation: string;
}

export function getPrimaryExamplePair(word: WordRecord): ExamplePair | null {
  return getExamplePairAt(word, 0);
}

export function getExampleSlotForLevel(level: number): number {
  if ([2, 5, 8].includes(level)) return 1;
  if ([3, 6, 9].includes(level)) return 2;
  return 0;
}

export function getExamplePairAt(word: WordRecord, preferredIndex: number): ExamplePair | null {
  const sentences = getExampleSentences(word);
  if (sentences.length === 0) return null;
  const index = Math.max(0, Math.min(preferredIndex, sentences.length - 1));
  const sentence = sentences[index];
  if (!sentence) return null;
  return {
    sentence,
    translation: getExampleTranslations(word)[index] ?? '',
  };
}

export function getExamplePairForLevel(word: WordRecord, level: number): ExamplePair | null {
  return getExamplePairAt(word, getExampleSlotForLevel(level));
}
