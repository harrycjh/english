import type { LocalLifePhotoView } from '../models/local-media';
import { listLocalLifePhotos } from './storage-service';

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
