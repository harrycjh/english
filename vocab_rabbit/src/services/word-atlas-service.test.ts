import { describe, expect, it } from 'vitest';
import type { WordImageAtlasManifest, WordPayload } from '../models/word';
import {
  getWordAtlasStyle,
  mergeWordAtlasManifest,
  readWordAtlasManifestResponse,
} from './word-atlas-service';

const payload: WordPayload = {
  generatedAt: '',
  sourceFile: '',
  categoryCount: 1,
  wordCount: 2,
  categories: ['family'],
  words: [
    {
      id: 'ket_dad_n',
      english: 'dad',
      partOfSpeech: 'n',
      chinese: '爸爸',
      category: 'family',
      difficulty: 1,
      imagePath: '/content/images/words/ket_dad_n.webp',
      imageApproved: true,
      oxfordRefs: [],
    },
    {
      id: 'ket_mum_n',
      english: 'mum',
      partOfSpeech: 'n',
      chinese: '妈妈',
      category: 'family',
      difficulty: 1,
      imagePath: '/content/images/words/ket_mum_n.webp',
      imageApproved: true,
      oxfordRefs: [],
    },
  ],
};

const manifest: WordImageAtlasManifest = {
  schemaVersion: 1,
  generatedAt: '2026-07-09T00:00:00.000Z',
  grid: { columns: 3, rows: 3, cellSize: 512 },
  stats: { sourceImages: 1, atlasImages: 1 },
  entries: [
    {
      imagePath: '/content/images/words/ket_dad_n.webp',
      atlasPath: '/content/images/word-atlases/category-000/atlas-000.webp',
      row: 1,
      column: 2,
    },
  ],
};

describe('mergeWordAtlasManifest', () => {
  it('adds matching atlas entries without changing uncovered words', () => {
    const merged = mergeWordAtlasManifest(payload, manifest);

    expect(merged.words[0].imageAtlas).toEqual({
      atlasPath: '/content/images/word-atlases/category-000/atlas-000.webp',
      row: 1,
      column: 2,
    });
    expect(merged.words[1].imageAtlas).toBeUndefined();
  });
});

describe('getWordAtlasStyle', () => {
  it('maps a 3x3 cell to percentage background coordinates', () => {
    expect(getWordAtlasStyle(manifest.entries[0], manifest.grid)).toMatchObject({
      backgroundSize: '300% 300%',
      backgroundPosition: '100% 50%',
    });
  });
});

describe('readWordAtlasManifestResponse', () => {
  it('treats an HTML SPA fallback as an unavailable optional manifest', async () => {
    const response = new Response('<!doctype html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    await expect(readWordAtlasManifestResponse(response)).resolves.toBeNull();
  });
});
