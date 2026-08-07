import { describe, expect, it, vi } from 'vitest';
import type { WordRecord } from '../models/word';
import { CONTENT_VERSION } from '../config/app-meta';
import { BACKPACK_ITEMS } from './backpack';
import {
  collectOfflineImageUrls,
  downloadOfflineImages,
  getOfflineImageCacheStatus,
  OFFLINE_IMAGE_CACHE_NAME,
} from './offline-image-cache-service';

function createWord(overrides: Partial<WordRecord> = {}): WordRecord {
  return {
    id: 'ket_family_n',
    english: 'family',
    partOfSpeech: 'n',
    chinese: '家庭',
    category: 'family',
    difficulty: 1,
    imagePath: '/content/images/words/ket_family_n.webp',
    imageApproved: true,
    oxfordRefs: [],
    ...overrides,
  };
}

function cacheKey(input: RequestInfo | URL): string {
  const value = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
  return new URL(value, 'https://vocab-rabbit.local/').href;
}

describe('collectOfflineImageUrls', () => {
  it('collects displayed image resources once and prefers generated-image atlases', () => {
    const words = [
      createWord({
        imageAtlas: {
          atlasPath: '/content/images/word-atlases/family/atlas-000.webp',
          row: 0,
          column: 0,
        },
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
            row: 0,
            column: 0,
            label: 'Early Level 1, Family, Page 1',
            level: 'Early Level 1',
            title: 'Family',
            page: 1,
            matchKind: 'exact',
            matchedTerm: 'family',
            confidence: 1,
          },
          raz: {
            atlasPath: '/content/images/raz-atlases/atlas-000.webp',
            row: 0,
            column: 2,
            label: 'Level E, E01 Family, Page 4',
            bookId: 'E01',
            level: 'E',
            sequence: 1,
            title: 'Family',
            page: 4,
            matchKind: 'exact',
            matchedTerm: 'family',
            matchedForm: 'family',
          },
        },
      }),
      createWord({
        id: 'ket_friend_n',
        imagePath: '/content/images/words/ket_friend_n.webp',
        relatedMedia: {
          redRocket: {
            imagePath: '/content/images/red-rocket-pages/corrected.webp',
            atlasPath: '/content/images/red-rocket-atlases/atlas-000.webp',
            row: 0,
            column: 1,
            label: 'Early Level 1, Family, Page 2',
            level: 'Early Level 1',
            title: 'Family',
            page: 2,
            matchKind: 'exact',
            matchedTerm: 'friend',
            confidence: 1,
          },
        },
      }),
    ];

    const urls = collectOfflineImageUrls(words);

    expect(urls).toContain(
      `/content/images/word-atlases/family/atlas-000.webp?v=${CONTENT_VERSION}`,
    );
    expect(urls).toContain(
      `/content/images/words/ket_friend_n.webp?v=${CONTENT_VERSION}`,
    );
    expect(urls).not.toContain(
      `/content/images/words/ket_family_n.webp?v=${CONTENT_VERSION}`,
    );
    expect(urls).toContain(
      `/content/images/oxford-tree/level-1/book-1/page-3.webp?v=${CONTENT_VERSION}`,
    );
    expect(urls.filter((url) => url.includes('red-rocket-atlases/atlas-000.webp'))).toHaveLength(1);
    expect(urls.filter((url) => url.includes('raz-atlases/atlas-000.webp'))).toHaveLength(1);
    expect(urls).toContain(
      `/content/images/red-rocket-pages/corrected.webp?v=${CONTENT_VERSION}`,
    );
    expect(urls).toContain('/content/images/ui/mastery-levels/level-9.webp?v=2');
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('collects every 主题 scene, so an offline backpack is not full of blanks', () => {
    const urls = new Set(collectOfflineImageUrls([]));

    for (const item of BACKPACK_ITEMS) {
      if (!item.artFile) continue;
      const matching = [...urls].filter((url) => url.includes(item.artFile!));
      expect(matching, `${item.id} art is not downloaded`).toHaveLength(1);
    }
  });
});

describe('downloadOfflineImages', () => {
  it('skips cached images and reports progress while caching missing images', async () => {
    const entries = new Map<string, Response>([
      [cacheKey('/cached.webp'), new Response('cached', { status: 200 })],
    ]);
    const cache = {
      match: vi.fn(async (input: RequestInfo | URL) => entries.get(cacheKey(input))),
      put: vi.fn(async (input: RequestInfo | URL, response: Response) => {
        entries.set(cacheKey(input), response);
      }),
      keys: vi.fn(async () => [...entries.keys()].map((url) => new Request(url))),
      delete: vi.fn(async () => true),
    };
    const cacheStorage = {
      open: vi.fn(async () => cache),
    };
    const fetcher = vi.fn(async () => new Response('downloaded', { status: 200 }));
    const progress: Array<{ completed: number; total: number; failed: number }> = [];

    const result = await downloadOfflineImages(['/cached.webp', '/missing.webp'], {
      cacheStorage: cacheStorage as unknown as CacheStorage,
      fetcher: fetcher as unknown as typeof fetch,
      onProgress: (nextProgress) => progress.push(nextProgress),
    });

    expect(cacheStorage.open).toHaveBeenCalledWith(OFFLINE_IMAGE_CACHE_NAME);
    expect(fetcher).toHaveBeenCalledTimes(1);
    // Not `cache: 'no-store'`: an image the browser already holds should not be
    // downloaded a second time onto a child's phone.
    expect(fetcher).toHaveBeenCalledWith('/missing.webp', expect.not.objectContaining({ cache: 'no-store' }));
    expect(fetcher).toHaveBeenCalledWith(
      '/missing.webp',
      expect.objectContaining({ headers: { 'X-VocaRabbit-Offline-Download': '1' } }),
    );
    expect(cache.put).toHaveBeenCalledWith('/missing.webp', expect.any(Response));
    expect(result).toEqual({ cached: 1, downloaded: 1, failed: 0, total: 2 });
    expect(progress.at(-1)).toEqual({ completed: 2, total: 2, failed: 0 });
  });

  it('checks cache status from cache keys without matching every image', async () => {
    const cache = {
      keys: vi.fn(async () => [
        new Request('https://vocab-rabbit.local/cached.webp'),
      ]),
      match: vi.fn(),
    };
    const cacheStorage = {
      open: vi.fn(async () => cache),
    };

    const result = await getOfflineImageCacheStatus(
      ['/cached.webp', '/missing.webp'],
      cacheStorage as unknown as CacheStorage,
    );

    expect(result).toEqual({ cached: 1, total: 2 });
    expect(cache.match).not.toHaveBeenCalled();
  });
});
