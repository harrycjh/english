import { describe, expect, it } from 'vitest';
import { APP_VERSION, CONTENT_VERSION } from '../config/app-meta';
import type { WordPayload } from '../models/word';
import {
  getLifePhotoCoverageUrl,
  getWordImageAtlasUrl,
  getWordImageUrl,
  getWordPayloadUrl,
  getWordRelatedMediaUrl,
  mergeLifePhotoCoverage,
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

describe('getLifePhotoCoverageUrl', () => {
  it('adds the content version to the privacy-safe life-photo coverage index', () => {
    expect(getLifePhotoCoverageUrl()).toBe(
      `/content/words/life_photo_coverage.json?v=${CONTENT_VERSION}`,
    );
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
      schemaVersion: 2,
      generatedAt: '2026-07-08T00:00:00.000Z',
      redRocketAtlasGrid: { columns: 3, rows: 3, cellSize: 512 },
      stats: {
        totalWords: 2,
        entries: 1,
        withOxford: 1,
        withLifePhoto: 0,
        uniqueOxfordImages: 1,
        lifePhotoPackageImages: 0,
        withRedRocket: 1,
        uniqueRedRocketImages: 1,
        redRocketAtlases: 1,
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
            redRocket: {
              atlasPath: '/content/images/red-rocket-atlases/atlas-000.webp',
              row: 1,
              column: 2,
              label: 'Early Level 1, My Hands, Page 4',
              level: 'Early Level 1',
              title: 'My Hands',
              page: 4,
              matchKind: 'exact',
              matchedTerm: 'dad',
              confidence: 0.94,
            },
          },
        },
      ],
    });

    expect(merged.words[0].relatedMedia?.oxford?.label).toBe('Level 1, Book 1, Page 3');
    expect(merged.words[0].relatedMedia?.redRocket?.title).toBe('My Hands');
    expect(merged.words[1].relatedMedia).toBeUndefined();
  });
});

describe('mergeLifePhotoCoverage', () => {
  it('marks only words listed in the life-photo coverage index', () => {
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

    const merged = mergeLifePhotoCoverage(payload, {
      schemaVersion: 1,
      generatedAt: '2026-07-14T00:00:00.000Z',
      count: 1,
      wordIds: ['ket_dad_n'],
    });

    expect(merged.words[0].hasLifePhoto).toBe(true);
    expect(merged.words[1].hasLifePhoto).toBeUndefined();
  });
});
