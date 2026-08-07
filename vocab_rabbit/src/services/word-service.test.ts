import { describe, expect, it } from 'vitest';
import { APP_VERSION, CONTENT_VERSION } from '../config/app-meta';
import type { WordPayload } from '../models/word';
import {
  hasLifePhotoSource,
  getLifePhotoCoverageUrl,
  getStudyChinese,
  getStudyPartOfSpeech,
  getWordImageAtlasUrl,
  getWordImageUrl,
  getWordPayloadUrl,
  getWordRelatedMediaUrl,
  mergeLifePhotoCoverage,
  mergeRelatedMedia,
} from './word-service';

describe('study sense helpers', () => {
  const word = {
    chinese: '能；会；罐；罐头',
    partOfSpeech: 'n & mv',
    studySense: {
      chinese: '能；会',
      partOfSpeech: 'mv',
      examples: ['The boy can ride a bike.'],
    },
  };

  it('uses the study sense when a word has several meanings', () => {
    expect(getStudyChinese(word)).toBe('能；会');
    expect(getStudyPartOfSpeech(word)).toBe('mv');
  });

  it('falls back to the original fields for ordinary words', () => {
    expect(getStudyChinese({ chinese: '猫' })).toBe('猫');
    expect(getStudyPartOfSpeech({ partOfSpeech: 'n' })).toBe('n');
  });
});

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
      schemaVersion: 3,
      generatedAt: '2026-07-08T00:00:00.000Z',
      redRocketAtlasGrid: { columns: 3, rows: 3, cellSize: 512 },
      razAtlasGrid: { columns: 3, rows: 3, cellSize: 512 },
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
        withRaz: 1,
        uniqueRazImages: 1,
        razAtlases: 1,
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
            raz: {
              atlasPath: '/content/images/raz-atlases/atlas-000.webp',
              row: 0,
              column: 1,
              label: 'Level E, E01 Hugs, Page 4',
              bookId: 'E01',
              level: 'E',
              sequence: 1,
              title: 'Hugs',
              page: 4,
              matchKind: 'exact',
              matchedTerm: 'dad',
              matchedForm: 'dad',
            },
          },
        },
      ],
    });

    expect(merged.words[0].relatedMedia?.oxford?.label).toBe('Level 1, Book 1, Page 3');
    expect(merged.words[0].relatedMedia?.redRocket?.title).toBe('My Hands');
    expect(merged.words[0].relatedMedia?.raz?.bookId).toBe('E01');
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

  it('recognizes private coverage markers without exposing a public photo path', () => {
    expect(hasLifePhotoSource({ hasLifePhoto: true })).toBe(true);
    expect(hasLifePhotoSource({
      relatedMedia: {
        lifePhoto: {
          imagePath: '/private/photo.webp',
          caption: '家庭照片',
          photoId: 'photo-1',
          match: 'primary',
          confidence: 1,
        },
      },
    })).toBe(true);
    expect(hasLifePhotoSource({})).toBe(false);
  });
});
