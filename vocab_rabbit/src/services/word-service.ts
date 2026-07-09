import type {
  OxfordRef,
  WordImageAtlasManifest,
  WordPayload,
  WordRecord,
  WordRelatedMediaManifest,
} from '../models/word';
import { CONTENT_VERSION } from '../config/app-meta';
import {
  mergeWordAtlasManifest,
  readWordAtlasManifestResponse,
} from './word-atlas-service';

let payloadPromise: Promise<WordPayload> | null = null;

export function getWordPayloadUrl(): string {
  return `${import.meta.env.BASE_URL}content/words/ket_vocabulary.json?v=${CONTENT_VERSION}`;
}

export function getWordRelatedMediaUrl(): string {
  return `${import.meta.env.BASE_URL}content/words/word_related_media.json?v=${CONTENT_VERSION}`;
}

export function getWordImageAtlasUrl(): string {
  return `${import.meta.env.BASE_URL}content/words/word_image_atlas.json?v=${CONTENT_VERSION}`;
}

export function mergeRelatedMedia(payload: WordPayload, manifest: WordRelatedMediaManifest | null): WordPayload {
  const relatedByWordId = new Map(
    (manifest?.entries ?? []).map((entry) => [entry.wordId, entry.relatedMedia])
  );

  return {
    ...payload,
    words: payload.words.map((word) => {
      const relatedMedia = relatedByWordId.get(word.id);
      return relatedMedia ? { ...word, relatedMedia } : word;
    }),
  };
}

async function loadWordRelatedMediaManifest(): Promise<WordRelatedMediaManifest | null> {
  const response = await fetch(getWordRelatedMediaUrl());
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error('无法加载关联图片清单。请先运行关联图片导出脚本。');
  }
  return (await response.json()) as WordRelatedMediaManifest;
}

async function loadWordImageAtlasManifest(): Promise<WordImageAtlasManifest | null> {
  const response = await fetch(getWordImageAtlasUrl());
  return readWordAtlasManifestResponse(response);
}

export async function loadWordPayload(): Promise<WordPayload> {
  if (!payloadPromise) {
    payloadPromise = Promise.all([
      fetch(getWordPayloadUrl()).then(async (response) => {
        if (!response.ok) {
          throw new Error('无法加载词表 JSON。请先运行构建脚本。');
        }
        return (await response.json()) as WordPayload;
      }),
      loadWordRelatedMediaManifest(),
      loadWordImageAtlasManifest(),
    ]).then(([payload, relatedMediaManifest, atlasManifest]) => (
      mergeWordAtlasManifest(mergeRelatedMedia(payload, relatedMediaManifest), atlasManifest)
    ));
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
  return `${getAssetUrl(imagePath)}?v=${CONTENT_VERSION}`;
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
