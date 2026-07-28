import { describe, expect, it, vi } from 'vitest';
import { createOssPhotoService } from './oss-photo-service.mjs';

describe('OSS private photo signing', () => {
  it('signs only photos that exist in the private manifest', async () => {
    const client = {
      signatureUrlV4: vi.fn(async (_method, _ttl, _options, objectKey) => (
        `https://private.example/${objectKey}`
      )),
    };
    const manifest = new Map([[
      'ket_family_n',
      {
        wordId: 'ket_family_n',
        objectKey: 'life-photos/ket_family_n.webp',
        caption: '一家三口。',
        photoId: 'photo-1',
        match: 'primary',
        confidence: 1,
      },
    ]]);
    const service = createOssPhotoService(client, { manifest, ttlSeconds: 3600 });

    const result = await service.sign(['ket_family_n', 'ket_missing_n']);

    expect(result.photos).toEqual([
      expect.objectContaining({
        wordId: 'ket_family_n',
        url: 'https://private.example/life-photos/ket_family_n.webp',
      }),
    ]);
    expect(client.signatureUrlV4).toHaveBeenCalledWith(
      'GET',
      3600,
      { headers: {} },
      'life-photos/ket_family_n.webp',
    );
  });
});
