import { describe, expect, it } from 'vitest';
import { APP_VERSION, CONTENT_VERSION } from '../config/app-meta';
import type { WordPayload } from '../models/word';
import {
  getWordImageAtlasUrl,
  getWordImageUrl,
  getWordPayloadUrl,
  getWordRelatedMediaUrl,
  mergeRelatedMedia,
} from './word-service';

describe('getWordPayloadUrl', () => {
  it('adds the app version to avoid stale cached vocabulary payloads', () => {
    expect(getWordPayloadUrl()).toBe(`/content/words/ket_vocabulary.json?v=${APP_VERSION}`);
  });
});

describe('getWordImageUrl', () => {
  it('adds the deployed content version so replaced images bypass stale caches', () => {
    expect(getWordImageUrl('/content/images/words/ket_dad_n.webp')).toBe(
      `/content/images/words/ket_dad_n.webp?v=${CONTENT_VERSION}`,
    );
  });
});

describe('getWordRelatedMediaUrl', () => {
  it('adds the content version to the related media manifest', () => {
    expect(getWordRelatedMediaUrl()).toBe(`/content/words/word_related_media.json?v=${CONTENT_VERSION}`);
  });
});

describe('getWordImageAtlasUrl', () => {
  it('adds the content version to the optional atlas manifest', () => {
    expect(getWordImageAtlasUrl()).toBe(
      `/content/words/word_image_atlas.json?v=${CONTENT_VERSION}`,
    );
  });
});

describe('mergeRelatedMedia', () => {
  it('adds related media to matching words without changing uncovered words', () => {
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

    const merged = mergeRelatedMedia(payload, {
      schemaVersion: 1,
      generatedAt: '2026-07-08T00:00:00.000Z',
      stats: {
        totalWords: 2,
        entries: 1,
        withOxford: 1,
        withLifePhoto: 0,
        uniqueOxfordImages: 1,
        lifePhotoPackageImages: 0,
      },
      entries: [
        {
          wordId: 'ket_dad_n',
          relatedMedia: {
            oxford: {
              imagePath: '/content/images/oxford-tree/level-1/book-1/page-3.webp',
              label: 'Level 1, Book 1, Page 3',
              level: 1,
              book: 1,
              page: 3,
            },
          },
        },
      ],
    });

    expect(merged.words[0].relatedMedia?.oxford?.label).toBe('Level 1, Book 1, Page 3');
    expect(merged.words[1].relatedMedia).toBeUndefined();
  });
});
