import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { buildWordAtlases } from './build-word-atlases.mjs';

const temporaryDirectories: string[] = [];

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function createDist(imageCount: number, invalidLastImage = false): Promise<string> {
  const distDir = await mkdtemp(path.join(tmpdir(), 'vocab-rabbit-atlas-'));
  temporaryDirectories.push(distDir);

  const wordsDir = path.join(distDir, 'content/images/words');
  const contentDir = path.join(distDir, 'content/words');
  await mkdir(wordsDir, { recursive: true });
  await mkdir(contentDir, { recursive: true });

  const words = Array.from({ length: imageCount }, (_, index) => ({
    id: `word-${index}`,
    english: `word ${index}`,
    category: '测试分类',
    imagePath: `/content/images/words/word-${index}.webp`,
  }));
  await writeFile(
    path.join(contentDir, 'ket_vocabulary.json'),
    JSON.stringify({ words }),
  );

  for (let index = 0; index < imageCount; index += 1) {
    const width = invalidLastImage && index === imageCount - 1 ? 511 : 512;
    await sharp({
      create: {
        width,
        height: 512,
        channels: 3,
        background: { r: index * 10, g: 100, b: 180 },
      },
    })
      .webp()
      .toFile(path.join(wordsDir, `word-${index}.webp`));
  }

  return distDir;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
});

describe('buildWordAtlases', () => {
  it('writes complete atlases and removes individual word images', async () => {
    const distDir = await createDist(10);

    const result = await buildWordAtlases({ distDir, maxFiles: 2000 });
    const manifest = JSON.parse(
      await readFile(path.join(distDir, 'content/words/word_image_atlas.json'), 'utf8'),
    );

    expect(result).toMatchObject({ sourceImages: 10, atlasImages: 2 });
    expect(manifest.entries).toHaveLength(10);
    expect(await pathExists(path.join(distDir, 'content/images/words'))).toBe(false);
  });

  it('rejects source images that are not 512x512', async () => {
    const distDir = await createDist(2, true);

    await expect(buildWordAtlases({ distDir, maxFiles: 2000 })).rejects.toThrow(
      'Expected 512x512',
    );
  });
});
