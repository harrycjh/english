import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { buildOxfordAtlases } from './build-oxford-atlases.mjs';

const temporaryDirectories: string[] = [];

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function createDist(): Promise<string> {
  const distDir = await mkdtemp(path.join(tmpdir(), 'vocab-rabbit-oxford-atlas-'));
  temporaryDirectories.push(distDir);
  const imageRoot = path.join(distDir, 'content/images/oxford-tree/level-1/book-1');
  const wordsRoot = path.join(distDir, 'content/words');
  await mkdir(imageRoot, { recursive: true });
  await mkdir(wordsRoot, { recursive: true });

  for (const [page, color] of [[3, '#e8b46f'], [4, '#87b9df']] as const) {
    await sharp({
      create: { width: 900, height: 1200, channels: 3, background: color },
    })
      .webp()
      .toFile(path.join(imageRoot, `page-${page}.webp`));
  }

  const firstPage = '/content/images/oxford-tree/level-1/book-1/page-3.webp';
  const secondPage = '/content/images/oxford-tree/level-1/book-1/page-4.webp';
  await writeFile(
    path.join(wordsRoot, 'word_related_media.json'),
    JSON.stringify({
      schemaVersion: 3,
      generatedAt: '2026-08-09T00:00:00.000Z',
      stats: { uniqueOxfordImages: 2 },
      entries: [
        {
          wordId: 'word-1',
          relatedMedia: {
            oxford: { imagePath: firstPage, label: 'Page 3', level: 1, book: 1, page: 3 },
          },
        },
        {
          wordId: 'word-2',
          relatedMedia: {
            oxford: { imagePath: secondPage, label: 'Page 4', level: 1, book: 1, page: 4 },
          },
        },
        {
          wordId: 'word-3',
          relatedMedia: {
            oxford: { imagePath: firstPage, label: 'Page 3', level: 1, book: 1, page: 3 },
          },
        },
      ],
    }),
  );
  return distDir;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

describe('buildOxfordAtlases', () => {
  it('deduplicates pages, rewrites media entries, and removes individual images', async () => {
    const distDir = await createDist();

    const result = await buildOxfordAtlases({ distDir, maxFiles: 2000 });
    const manifest = JSON.parse(
      await readFile(path.join(distDir, 'content/words/word_related_media.json'), 'utf8'),
    );
    const first = manifest.entries[0].relatedMedia.oxford;
    const duplicate = manifest.entries[2].relatedMedia.oxford;

    expect(result).toMatchObject({ sourceImages: 2, atlasImages: 1 });
    expect(first).toMatchObject({
      atlasPath: '/content/images/oxford-atlases/atlas-000.webp',
      row: 0,
      column: 0,
    });
    expect(first.imagePath).toBeUndefined();
    expect(duplicate).toMatchObject({
      atlasPath: first.atlasPath,
      row: first.row,
      column: first.column,
    });
    expect(manifest.oxfordAtlasGrid).toEqual({ columns: 3, rows: 3, cellSize: 512 });
    expect(manifest.stats.oxfordAtlases).toBe(1);
    expect(await pathExists(path.join(distDir, 'content/images/oxford-tree'))).toBe(false);
    expect(await sharp(path.join(
      distDir,
      'content/images/oxford-atlases/atlas-000.webp',
    )).metadata()).toMatchObject({ width: 1536, height: 1536 });
  });
});
