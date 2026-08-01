import type { WordRecord } from '../models/word';

interface ExampleRotation {
  count: number;
  remaining: number[];
  lastIndex: number | null;
}

const exampleRotations = new Map<string, ExampleRotation>();

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
    return curated;
  }

  return [];
}

export function getExampleTranslations(word: WordRecord): string[] {
  return (word.exampleTranslations ?? [])
    .map(normalizeExample)
    .map((translation) => translation ?? '');
}

export function getExampleTranslationFocus(word: WordRecord): string[] {
  return (word.exampleTranslationFocus ?? [])
    .map(normalizeExample)
    .map((focus) => focus ?? '');
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

function shuffleIndexes(count: number, random: () => number): number[] {
  const indexes = Array.from({ length: count }, (_, index) => index);
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [indexes[index], indexes[swapIndex]] = [indexes[swapIndex], indexes[index]];
  }
  return indexes;
}

export function getNextExampleIndex(word: WordRecord, random: () => number = Math.random): number {
  const count = getExampleSentences(word).length;
  if (count <= 1) return 0;
  let rotation = exampleRotations.get(word.id);
  if (!rotation || rotation.count !== count || rotation.remaining.length === 0) {
    const lastIndex = rotation?.count === count ? rotation.lastIndex : null;
    const remaining = shuffleIndexes(count, random);
    if (lastIndex !== null && remaining[0] === lastIndex) {
      [remaining[0], remaining[1]] = [remaining[1], remaining[0]];
    }
    rotation = { count, remaining, lastIndex };
    exampleRotations.set(word.id, rotation);
  }
  const index = rotation.remaining.shift() ?? 0;
  rotation.lastIndex = index;
  return index;
}

export function resetExampleRotations(): void {
  exampleRotations.clear();
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

export function getExamplePairForLevel(
  word: WordRecord,
  level: number,
  preferredIndex?: number,
): ExamplePair | null {
  return getExamplePairAt(word, preferredIndex ?? getExampleSlotForLevel(level));
}
