import type { LocalLifePhotoRecord } from '../models/local-media';
import { signPrivateLifePhotos } from './cloud-sync-service';
import {
  getOrCreateSyncMetadata,
  listLocalLifePhotos,
  saveDeviceToken,
  saveLocalLifePhotos,
} from './storage-service';

const SIGN_BATCH_SIZE = 40;
const DOWNLOAD_CONCURRENCY = 4;

export interface PrivateLifePhotoDownloadProgress {
  completed: number;
  total: number;
  failed: number;
}

export interface PrivateLifePhotoDownloadResult {
  existing: number;
  downloaded: number;
  failed: number;
  total: number;
}

export interface PrivateLifePhotoDownloadOptions {
  signal?: AbortSignal;
  onProgress?: (progress: PrivateLifePhotoDownloadProgress) => void;
  fetcher?: typeof fetch;
}

function uniqueWordIds(wordIds: string[]): string[] {
  return [...new Set(wordIds.filter(Boolean))];
}

export async function downloadPrivateLifePhotos(
  wordIds: string[],
  options: PrivateLifePhotoDownloadOptions = {},
): Promise<PrivateLifePhotoDownloadResult> {
  const requestedWordIds = uniqueWordIds(wordIds);
  const [metadata, existingById] = await Promise.all([
    getOrCreateSyncMetadata(),
    listLocalLifePhotos(),
  ]);
  if (!metadata.deviceToken) {
    throw new Error('请先使用家庭验证码连接学习进度，再下载私密生活照片。');
  }

  const missingWordIds = requestedWordIds.filter((wordId) => !existingById[wordId]);
  const total = requestedWordIds.length;
  let downloaded = 0;
  let failed = 0;
  const reportProgress = () => options.onProgress?.({
    completed: total - missingWordIds.length + downloaded + failed,
    total,
    failed,
  });
  reportProgress();

  for (let offset = 0; offset < missingWordIds.length; offset += SIGN_BATCH_SIZE) {
    if (options.signal?.aborted) {
      throw new DOMException('下载已停止。', 'AbortError');
    }
    const batchWordIds = missingWordIds.slice(offset, offset + SIGN_BATCH_SIZE);
    const signed = await signPrivateLifePhotos(batchWordIds, metadata.deviceToken, options.fetcher);
    if (signed.deviceToken && signed.deviceToken !== metadata.deviceToken) {
      metadata.deviceToken = signed.deviceToken;
      await saveDeviceToken(signed.deviceToken);
    }
    const records: LocalLifePhotoRecord[] = [];
    let nextIndex = 0;

    async function worker() {
      while (nextIndex < signed.photos.length) {
        const photo = signed.photos[nextIndex];
        nextIndex += 1;
        try {
          const response = await (options.fetcher ?? fetch)(photo.url, {
            cache: 'no-store',
            signal: options.signal,
          });
          if (!response.ok) {
            throw new Error(`生活照片下载失败（${response.status}）`);
          }
          const blob = await response.blob();
          records.push({
            wordId: photo.wordId,
            blob,
            contentType: response.headers.get('content-type') || blob.type || 'image/webp',
            fileName: photo.objectKey.split('/').pop() ?? `${photo.wordId}.webp`,
            caption: photo.caption,
            photoId: photo.photoId,
            match: photo.match,
            confidence: photo.confidence,
            importedAt: new Date().toISOString(),
          });
          downloaded += 1;
        } catch (error) {
          if (options.signal?.aborted) throw error;
          failed += 1;
        }
        reportProgress();
      }
    }

    await Promise.all(
      Array.from(
        { length: Math.min(DOWNLOAD_CONCURRENCY, signed.photos.length) },
        () => worker(),
      ),
    );
    await saveLocalLifePhotos(records);

    const unsignedCount = batchWordIds.length - signed.photos.length;
    failed += unsignedCount;
    reportProgress();
  }

  return {
    existing: total - missingWordIds.length,
    downloaded,
    failed,
    total,
  };
}
