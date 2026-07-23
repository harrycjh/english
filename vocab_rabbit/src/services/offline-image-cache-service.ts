import type { WordRecord } from '../models/word';
import { getAssetUrl, getWordImageUrl } from './word-service';

export const OFFLINE_IMAGE_CACHE_NAME = 'vocab-rabbit-images-v2';

const OFFLINE_DOWNLOAD_HEADER = 'X-VocaRabbit-Offline-Download';
const DOWNLOAD_CONCURRENCY = 4;

const STATIC_IMAGE_URLS = [
  '/design-reference/slices/review-bunny-scene.png?v=4',
  '/design-reference/slices/review-focus-art.png?v=5',
  '/design-reference/slices/review-oxford-tree-icon.png?v=1',
  '/design-reference/slices/review-book-art.png?v=4',
  '/design-reference/slices/review-bars-art.png?v=4',
  '/design-reference/slices/review-bag-art.png?v=4',
  '/design-reference/slices/review-preview-body-art.png?v=4',
  '/design-reference/slices/review-preview-family-art.png?v=4',
  '/design-reference/slices/review-preview-hello-art.png?v=4',
  '/design-reference/slices/review-preview-spark-art.png?v=4',
  '/design-reference/slices/selection-plan-house-background.webp?v=1',
  '/design-reference/slices/stats-rabbit-art-v4.png?v=4',
  '/design-reference/slices/stats-focus-art-v3.png?v=5',
  '/design-reference/slices/stats-rabbit-hero-crop.png?v=2',
  '/design-reference/slices/stats-rabbit-reading-v1.webp?v=1',
  '/design-reference/slices/stats-rhythm-house-v1.webp?v=1',
  '/design-reference/slices/settings-rabbit-art-v2.png?v=4',
  '/design-reference/slices/settings-focus-art-v2.png?v=4',
  '/design-reference/slices/settings-cyber-rabbit-hero.webp?v=1',
  '/design-reference/slices/settings-task-impact-doghouse-v1.webp?v=1',
  '/design-reference/slices/brand-rabbit-outline-v1.png?v=1',
  '/design-reference/slices/brand-dog-outline-v1.png?v=1',
  '/design-reference/slices/review-junjun-cutout-v1.webp?v=1',
  '/design-reference/slices/review-dog-scene-v1.webp?v=1',
  '/design-reference/slices/stats-dog-reading-v1.webp?v=1',
  '/design-reference/slices/settings-cyber-dog-hero-v1.webp?v=1',
];

export interface OfflineImageProgress {
  completed: number;
  total: number;
  failed: number;
}

export interface OfflineImageDownloadResult {
  cached: number;
  downloaded: number;
  failed: number;
  total: number;
}

interface OfflineImageDownloadOptions {
  signal?: AbortSignal;
  onProgress?: (progress: OfflineImageProgress) => void;
  cacheStorage?: CacheStorage;
  fetcher?: typeof fetch;
}

function uniqueUrls(urls: string[]): string[] {
  return [...new Set(urls)];
}

export function collectOfflineImageUrls(words: WordRecord[]): string[] {
  const urls = STATIC_IMAGE_URLS.map(getAssetUrl);

  for (let level = 1; level <= 9; level += 1) {
    urls.push(getAssetUrl(`/content/images/ui/mastery-levels/level-${level}.webp?v=2`));
  }

  for (const word of words) {
    urls.push(getWordImageUrl(word.imageAtlas?.atlasPath ?? word.imagePath));

    const oxfordPath = word.relatedMedia?.oxford?.imagePath;
    if (oxfordPath) {
      urls.push(getWordImageUrl(oxfordPath));
    }

    const redRocketPath = word.relatedMedia?.redRocket?.atlasPath;
    if (redRocketPath) {
      urls.push(getWordImageUrl(redRocketPath));
    }
  }

  return uniqueUrls(urls);
}

async function findCachedResponse(
  cacheStorage: CacheStorage,
  cache: Cache,
  url: string,
): Promise<Response | undefined> {
  const imageCacheResponse = await cache.match(url);
  if (imageCacheResponse) {
    return imageCacheResponse;
  }

  if (typeof cacheStorage.match !== 'function') {
    return undefined;
  }

  const existingResponse = await cacheStorage.match(url);
  if (existingResponse) {
    await cache.put(url, existingResponse.clone());
  }
  return existingResponse;
}

export async function getOfflineImageCacheStatus(
  urls: string[],
  cacheStorage: CacheStorage = caches,
): Promise<{ cached: number; total: number }> {
  const unique = uniqueUrls(urls);
  const cache = await cacheStorage.open(OFFLINE_IMAGE_CACHE_NAME);
  const matches = await Promise.all(unique.map((url) => findCachedResponse(cacheStorage, cache, url)));
  return {
    cached: matches.filter(Boolean).length,
    total: unique.length,
  };
}

export async function requestPersistentImageStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return false;
  }
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function downloadOfflineImages(
  urls: string[],
  options: OfflineImageDownloadOptions = {},
): Promise<OfflineImageDownloadResult> {
  const cacheStorage = options.cacheStorage ?? caches;
  const fetcher = options.fetcher ?? fetch;
  const unique = uniqueUrls(urls);
  const cache = await cacheStorage.open(OFFLINE_IMAGE_CACHE_NAME);
  const missing: string[] = [];
  let cached = 0;

  for (const url of unique) {
    if (options.signal?.aborted) {
      throw new DOMException('下载已停止。', 'AbortError');
    }
    if (await findCachedResponse(cacheStorage, cache, url)) {
      cached += 1;
    } else {
      missing.push(url);
    }
  }

  let downloaded = 0;
  let failed = 0;
  let nextIndex = 0;
  const reportProgress = () => options.onProgress?.({
    completed: cached + downloaded + failed,
    total: unique.length,
    failed,
  });
  reportProgress();

  async function worker() {
    while (nextIndex < missing.length) {
      const url = missing[nextIndex];
      nextIndex += 1;
      try {
        const response = await fetcher(url, {
          cache: 'no-store',
          headers: { [OFFLINE_DOWNLOAD_HEADER]: '1' },
          signal: options.signal,
        });
        if (!response.ok) {
          throw new Error(`图片下载失败（${response.status}）`);
        }
        await cache.put(url, response.clone());
        downloaded += 1;
      } catch (caughtError) {
        if (options.signal?.aborted) {
          throw caughtError;
        }
        failed += 1;
      }
      reportProgress();
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, missing.length) }, () => worker()),
  );

  return {
    cached,
    downloaded,
    failed,
    total: unique.length,
  };
}
