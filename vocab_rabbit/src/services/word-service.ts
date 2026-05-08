import type { OxfordRef, WordPayload, WordRecord } from '../models/word';

let payloadPromise: Promise<WordPayload> | null = null;

export async function loadWordPayload(): Promise<WordPayload> {
  if (!payloadPromise) {
    payloadPromise = fetch('/content/words/ket_vocabulary.json').then(async (response) => {
      if (!response.ok) {
        throw new Error('无法加载词表 JSON。请先运行构建脚本。');
      }
      return (await response.json()) as WordPayload;
    });
  }

  return payloadPromise;
}

export function getStudyText(word: Pick<WordRecord, 'english'>): string {
  return word.english
    .replace(/\s+\([^)]*\)$/g, '')
    .replace(/\(([^)]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getOxfordRefLabel(ref: OxfordRef): string {
  return `Level ${ref.level},${ref.book},${ref.page}`;
}

export function getOxfordRefLabels(word: WordRecord, limit: number = 2): string[] {
  return word.oxfordRefs.slice(0, limit).map(getOxfordRefLabel);
}

export function getPrimaryOxfordRefLabel(word: WordRecord): string | null {
  const firstRef = word.oxfordRefs[0];
  if (!firstRef) {
    return null;
  }
  return getOxfordRefLabel(firstRef);
}

export function indexWordsById(words: WordRecord[]): Map<string, WordRecord> {
  return new Map(words.map((word) => [word.id, word]));
}