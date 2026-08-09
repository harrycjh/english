import type { WordRecord } from '../models/word';
import { BACKPACK_ITEMS } from './backpack';
import { getAssetUrl, getWordImageUrl } from './word-service';

export const OFFLINE_IMAGE_CACHE_NAME = 'vocab-rabbit-images-v2';

const OFFLINE_DOWNLOAD_HEADER = 'X-VocaRabbit-Offline-Download';
// 8, not 4. The list is ~1500 images over HTTP/2, where the cost is round
// trips rather than bandwidth per connection, and this only ever runs on the
// fallback path -- the worker does its own.
const DOWNLOAD_CONCURRENCY = 8;
const PROGRESS_UPDATE_INTERVAL = 8;
const YIELD_INTERVAL = 6;

const STATIC_IMAGE_URLS = [
  '/design-reference/slices/review-bunny-scene.png?v=4',
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

/**
 * Backpack art, straight from the catalogue. Listing these by hand is how the
 * 主题 scenes came to be missing from an offline download that calls itself
 * 全部 -- and the free scene is the one every child sees on the review page.
 */
function backpackArtUrls(): string[] {
  return BACKPACK_ITEMS
    .filter((item) => item.artFile)
    .map((item) => getAssetUrl(`/design-reference/slices/${item.artFile}?v=1`));
}

export function collectOfflineImageUrls(words: WordRecord[]): string[] {
  const urls = [...STATIC_IMAGE_URLS.map(getAssetUrl), ...backpackArtUrls()];

  for (let level = 1; level <= 9; level += 1) {
    urls.push(getAssetUrl(`/content/images/ui/mastery-levels/level-${level}.webp?v=2`));
  }

  for (const word of words) {
    urls.push(getWordImageUrl(word.imageAtlas?.atlasPath ?? word.imagePath));

    const oxfordPath = (
      word.relatedMedia?.oxford?.imagePath
      ?? word.relatedMedia?.oxford?.atlasPath
    );
    if (oxfordPath) {
      urls.push(getWordImageUrl(oxfordPath));
    }

    const redRocketPath = (
      word.relatedMedia?.redRocket?.imagePath
      ?? word.relatedMedia?.redRocket?.atlasPath
    );
    if (redRocketPath) {
      urls.push(getWordImageUrl(redRocketPath));
    }

    const razPath = word.relatedMedia?.raz?.atlasPath;
    if (razPath) {
      urls.push(getWordImageUrl(razPath));
    }
  }

  return uniqueUrls(urls);
}

function normalizeCacheUrl(input: RequestInfo | URL): string {
  const value = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url;
  const baseUrl = typeof location === 'undefined'
    ? 'https://vocab-rabbit.local/'
    : location.href;
  return new URL(value, baseUrl).href;
}

async function getCachedUrlSet(cache: Cache): Promise<Set<string>> {
  const requests = await cache.keys();
  return new Set(requests.map((request) => normalizeCacheUrl(request)));
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

export async function getOfflineImageCacheStatus(
  urls: string[],
  cacheStorage: CacheStorage = caches,
): Promise<{ cached: number; total: number }> {
  const unique = uniqueUrls(urls);
  const cache = await cacheStorage.open(OFFLINE_IMAGE_CACHE_NAME);
  const cachedUrls = await getCachedUrlSet(cache);
  return {
    cached: unique.filter((url) => cachedUrls.has(normalizeCacheUrl(url))).length,
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
  const cachedUrls = await getCachedUrlSet(cache);
  const missing = unique.filter((url) => !cachedUrls.has(normalizeCacheUrl(url)));
  const cached = unique.length - missing.length;

  let downloaded = 0;
  let failed = 0;
  let nextIndex = 0;
  let lastReportedCompleted = -1;
  const reportProgress = (force = false) => {
    const completed = cached + downloaded + failed;
    if (
      !force
      && completed !== unique.length
      && completed - lastReportedCompleted < PROGRESS_UPDATE_INTERVAL
    ) {
      return;
    }
    lastReportedCompleted = completed;
    options.onProgress?.({
      completed,
      total: unique.length,
      failed,
    });
  };
  reportProgress(true);

  async function worker() {
    let completedSinceYield = 0;
    while (nextIndex < missing.length) {
      if (options.signal?.aborted) {
        throw new DOMException('下载已停止。', 'AbortError');
      }
      const url = missing[nextIndex];
      nextIndex += 1;
      try {
        // Without `cache: 'no-store'`: the point is to have the image
        // available offline, and an image the browser already holds is one we
        // should not make a child's phone download a second time.
        const response = await fetcher(url, {
          headers: { [OFFLINE_DOWNLOAD_HEADER]: '1' },
          signal: options.signal,
        });
        if (!response.ok) {
          throw new Error(`图片下载失败（${response.status}）`);
        }
        // No clone: nothing else reads this body, and cloning one buffers the
        // whole image twice.
        await cache.put(url, response);
        downloaded += 1;
      } catch (caughtError) {
        if (options.signal?.aborted) {
          throw caughtError;
        }
        failed += 1;
      }
      reportProgress();
      completedSinceYield += 1;
      if (completedSinceYield >= YIELD_INTERVAL) {
        completedSinceYield = 0;
        await yieldToMainThread();
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, missing.length) }, () => worker()),
  );
  reportProgress(true);

  return {
    cached,
    downloaded,
    failed,
    total: unique.length,
  };
}
