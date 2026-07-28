import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadPrivateLifePhotos } from './private-life-photo-service';
import {
  clearLocalDeviceData,
  getOrCreateSyncMetadata,
  listLocalLifePhotos,
  saveDeviceToken,
} from './storage-service';

describe('private life photo downloads', () => {
  beforeEach(async () => {
    await clearLocalDeviceData();
    await getOrCreateSyncMetadata();
    await saveDeviceToken('device-token');
  });

  it('signs, downloads, and stores a life photo in IndexedDB', async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/api/media/sign')) {
        return new Response(JSON.stringify({
          expiresAt: '2026-07-28T12:00:00.000Z',
          photos: [{
            wordId: 'ket_family_n',
            objectKey: 'life-photos/ket_family_n.webp',
            url: 'https://private.example/ket_family_n.webp',
            caption: '一家三口。',
            photoId: 'photo-1',
            match: 'primary',
            confidence: 1,
          }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(new Blob(['webp'], { type: 'image/webp' }), {
        status: 200,
        headers: { 'Content-Type': 'image/webp' },
      });
    });

    const result = await downloadPrivateLifePhotos(['ket_family_n'], { fetcher });
    const stored = await listLocalLifePhotos();

    expect(result).toMatchObject({ downloaded: 1, failed: 0, total: 1 });
    expect(stored.ket_family_n).toMatchObject({
      caption: '一家三口。',
      photoId: 'photo-1',
    });
  });

  it('does not download a photo that already exists locally', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await downloadPrivateLifePhotos(['ket_family_n'], {
      fetcher: async (input) => {
        if (String(input).endsWith('/api/media/sign')) {
          return new Response(JSON.stringify({
            expiresAt: '2026-07-28T12:00:00.000Z',
            photos: [{
              wordId: 'ket_family_n',
              objectKey: 'life-photos/ket_family_n.webp',
              url: 'https://private.example/ket_family_n.webp',
              caption: '一家三口。',
              photoId: 'photo-1',
              match: 'primary',
              confidence: 1,
            }],
          }), { status: 200 });
        }
        return new Response(new Blob(['webp'], { type: 'image/webp' }), { status: 200 });
      },
    });

    const result = await downloadPrivateLifePhotos(['ket_family_n'], { fetcher });

    expect(result).toMatchObject({ existing: 1, downloaded: 0, failed: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
