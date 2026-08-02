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

function getAllExampleSentences(word: WordRecord): string[] {
  return [...(word.examples ?? []), word.example]
    .map(normalizeExample)
    .filter(Boolean) as string[];
}

export function getExampleSourceIndexes(word: WordRecord): number[] {
  const sentences = getAllExampleSentences(word);
  if (!word.studySense) return sentences.map((_, index) => index);

  const explicit = word.studySense.exampleIndexes?.filter((index) => (
    Number.isInteger(index) && index >= 0 && index < sentences.length
  ));
  if (explicit?.length) return [...new Set(explicit)];

  const used = new Set<number>();
  const matched = (word.studySense.examples ?? []).flatMap((example) => {
    const normalized = normalizeExample(example);
    const index = sentences.findIndex((sentence, candidateIndex) => (
      !used.has(candidateIndex) && sentence === normalized
    ));
    if (index < 0) return [];
    used.add(index);
    return [index];
  });
  return matched;
}

export function getExampleSourceIndex(word: WordRecord, preferredIndex: number): number {
  const indexes = getExampleSourceIndexes(word);
  if (indexes.length === 0) return 0;
  return indexes[Math.max(0, Math.min(preferredIndex, indexes.length - 1))] ?? 0;
}

export function getExampleSentences(word: WordRecord): string[] {
  const sentences = getAllExampleSentences(word);
  const indexes = getExampleSourceIndexes(word);
  const curated = indexes.length > 0
    ? indexes.map((index) => sentences[index]).filter(Boolean)
    : (word.studySense?.examples ?? []).map(normalizeExample).filter(Boolean) as string[];

  if (curated.length > 0) {
    return curated;
  }

  return [];
}

export function getExampleTranslations(word: WordRecord): string[] {
  const translations = (word.exampleTranslations ?? [])
    .map(normalizeExample)
    .map((translation) => translation ?? '');
  const indexes = getExampleSourceIndexes(word);
  return indexes.length > 0 ? indexes.map((index) => translations[index] ?? '') : translations;
}

export function getExampleTranslationFocus(word: WordRecord): string[] {
  const focuses = (word.exampleTranslationFocus ?? [])
    .map(normalizeExample)
    .map((focus) => focus ?? '');
  const indexes = getExampleSourceIndexes(word);
  return indexes.length > 0 ? indexes.map((index) => focuses[index] ?? '') : focuses;
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
