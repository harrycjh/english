import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { inspectLifePhotoPackage } from './local-media-service';

function createZip(entries: Record<string, Uint8Array>) {
  const bytes = zipSync(entries);
  return new File([bytes], 'photos.zip', { type: 'application/zip' });
}

function createManifest(imagePath = '/life-photos/ket_dad_n.webp') {
  return {
    schemaVersion: 1,
    generatedAt: '2026-07-09T10:00:00.000Z',
    stats: { totalWords: 1693, withLifePhoto: 1 },
    entries: [
      {
        wordId: 'ket_dad_n',
        relatedMedia: {
          lifePhoto: {
            imagePath,
            caption: 'Dad',
            photoId: 'photo-1',
            match: 'primary',
            confidence: 0.9,
          },
        },
      },
    ],
  };
}

describe('inspectLifePhotoPackage', () => {
  it('reports the package contents before replacing local photos', async () => {
    const file = createZip({
      'word_related_media.json': strToU8(JSON.stringify(createManifest())),
      'life-photos/ket_dad_n.webp': new Uint8Array([1, 2, 3]),
    });

    const inspected = await inspectLifePhotoPackage(file);

    expect(inspected.photos).toHaveLength(1);
    expect(inspected.skipped).toBe(0);
  });

  it('distinguishes an unreadable zip file', async () => {
    const file = new File([strToU8('not a zip')], 'broken.zip', { type: 'application/zip' });

    await expect(inspectLifePhotoPackage(file)).rejects.toThrow('无法解压');
  });

  it('distinguishes invalid manifest JSON', async () => {
    const file = createZip({ 'word_related_media.json': strToU8('{broken') });

    await expect(inspectLifePhotoPackage(file)).rejects.toThrow('清单不是有效的 JSON');
  });

  it('rejects unsupported package manifests', async () => {
    const manifest = createManifest();
    manifest.schemaVersion = 2;
    const file = createZip({ 'word_related_media.json': strToU8(JSON.stringify(manifest)) });

    await expect(inspectLifePhotoPackage(file)).rejects.toThrow('不支持的照片包版本');
  });

  it('reports missing image files with an actionable message', async () => {
    const file = createZip({
      'word_related_media.json': strToU8(JSON.stringify(createManifest())),
    });

    await expect(inspectLifePhotoPackage(file)).rejects.toThrow('没有找到任何可导入的照片');
  });
});
