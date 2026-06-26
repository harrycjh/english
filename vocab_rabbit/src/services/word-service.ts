import type { OxfordRef, WordPayload, WordRecord } from '../models/word';
import { APP_VERSION } from '../config/app-meta';

let payloadPromise: Promise<WordPayload> | null = null;

export function getWordPayloadUrl(): string {
  return `${import.meta.env.BASE_URL}content/words/ket_vocabulary.json?v=${APP_VERSION}`;
}

export async function loadWordPayload(): Promise<WordPayload> {
  if (!payloadPromise) {
    payloadPromise = fetch(getWordPayloadUrl()).then(async (response) => {
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

export function getAssetUrl(assetPath: string): string {
  return `${import.meta.env.BASE_URL}${assetPath.replace(/^\//, '')}`;
}

export function getWordImageUrl(imagePath: string): string {
  return getAssetUrl(imagePath);
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
