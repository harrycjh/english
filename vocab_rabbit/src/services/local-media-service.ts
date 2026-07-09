import { strFromU8, unzip } from 'fflate';
import type { LocalLifePhotoRecord, LocalLifePhotoView } from '../models/local-media';
import type { LifePhotoPackageManifest, RelatedLifePhoto } from '../models/word';
import { listLocalLifePhotos, replaceLocalLifePhotos } from './storage-service';

export interface LifePhotoImportResult {
  imported: number;
  skipped: number;
  totalInManifest: number;
  importedAt: string;
}

export interface InspectedLifePhotoPackage {
  photos: LocalLifePhotoRecord[];
  skipped: number;
  totalInManifest: number;
  importedAt: string;
}

function unzipFile(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((resolve, reject) => {
    unzip(data, (error, unzipped) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(unzipped);
    });
  });
}

function normalizeZipPath(path: string): string {
  return path.replace(/^\/+/, '');
}

function basename(path: string): string {
  return normalizeZipPath(path).split('/').pop() ?? path;
}

function findManifestFile(unzipped: Record<string, Uint8Array>): Uint8Array | null {
  return (
    unzipped['word_related_media.json'] ??
    unzipped['content/words/word_related_media.json'] ??
    unzipped['public/content/words/word_related_media.json'] ??
    null
  );
}

function findImageFile(
  unzipped: Record<string, Uint8Array>,
  wordId: string,
  lifePhoto: RelatedLifePhoto
): { path: string; bytes: Uint8Array } | null {
  const paths = [
    normalizeZipPath(lifePhoto.imagePath),
    `life-photos/${wordId}.webp`,
    `content/images/life-photos/${wordId}.webp`,
    `public/content/images/life-photos/${wordId}.webp`,
    basename(lifePhoto.imagePath),
  ];

  for (const path of paths) {
    const bytes = unzipped[path];
    if (bytes) {
      return { path, bytes };
    }
  }

  return null;
}

export async function importLifePhotoPackage(file: File): Promise<LifePhotoImportResult> {
  const inspected = await inspectLifePhotoPackage(file);
  await replaceLocalLifePhotos(inspected.photos);

  return {
    imported: inspected.photos.length,
    skipped: inspected.skipped,
    totalInManifest: inspected.totalInManifest,
    importedAt: inspected.importedAt,
  };
}

export async function inspectLifePhotoPackage(file: File): Promise<InspectedLifePhotoPackage> {
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = await unzipFile(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error('照片包无法解压，请确认选择的是完整的 ZIP 文件。');
  }

  const manifestFile = findManifestFile(unzipped);
  if (!manifestFile) {
    throw new Error('照片包里没有找到 word_related_media.json。');
  }

  let manifest: LifePhotoPackageManifest;
  try {
    manifest = JSON.parse(strFromU8(manifestFile)) as LifePhotoPackageManifest;
  } catch {
    throw new Error('照片包清单不是有效的 JSON，请重新生成照片包。');
  }
  if (manifest.schemaVersion !== 1) {
    throw new Error(`不支持的照片包版本：${String(manifest.schemaVersion)}。`);
  }
  if (!Array.isArray(manifest.entries)) {
    throw new Error('照片包清单缺少 entries 列表。');
  }

  const entries = manifest.entries;
  const importedAt = new Date().toISOString();
  const photos: LocalLifePhotoRecord[] = [];

  for (const entry of entries) {
    if (!entry?.wordId || !entry.relatedMedia?.lifePhoto?.imagePath) {
      continue;
    }
    const lifePhoto = entry.relatedMedia.lifePhoto;

    const image = findImageFile(unzipped, entry.wordId, lifePhoto);
    if (!image) {
      continue;
    }

    const imageBuffer = new ArrayBuffer(image.bytes.byteLength);
    new Uint8Array(imageBuffer).set(image.bytes);

    photos.push({
      wordId: entry.wordId,
      blob: new Blob([imageBuffer], { type: 'image/webp' }),
      contentType: 'image/webp',
      fileName: basename(image.path),
      caption: lifePhoto.caption,
      photoId: lifePhoto.photoId,
      match: lifePhoto.match,
      confidence: lifePhoto.confidence,
      importedAt,
    });
  }

  if (photos.length === 0) {
    throw new Error(
      entries.length === 0
        ? '照片包清单中没有可导入的照片。'
        : '照片包里没有找到任何可导入的照片，请检查 ZIP 是否包含 life-photos 文件夹。',
    );
  }
  return {
    photos,
    skipped: entries.length - photos.length,
    totalInManifest: entries.length,
    importedAt,
  };
}

export async function loadLocalLifePhotoViews(): Promise<Record<string, LocalLifePhotoView>> {
  const recordsById = await listLocalLifePhotos();
  return Object.fromEntries(
    Object.values(recordsById).map((record) => [
      record.wordId,
      {
        wordId: record.wordId,
        objectUrl: URL.createObjectURL(record.blob),
        caption: record.caption,
        photoId: record.photoId,
        match: record.match,
        confidence: record.confidence,
        importedAt: record.importedAt,
      },
    ])
  );
}

export function revokeLocalLifePhotoViews(viewsById: Record<string, LocalLifePhotoView>): void {
  for (const view of Object.values(viewsById)) {
    URL.revokeObjectURL(view.objectUrl);
  }
}
