import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  ATLAS_COLUMNS,
  ATLAS_ROWS,
  CELL_SIZE,
  createWordAtlasPlan,
} from './word-atlas-plan.mjs';

const ATLAS_SIZE = CELL_SIZE * ATLAS_COLUMNS;

async function countFiles(directory) {
  const directoryEntries = await readdir(directory, { withFileTypes: true });
  const counts = await Promise.all(directoryEntries.map((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? countFiles(entryPath) : 1;
  }));
  return counts.reduce((total, count) => total + count, 0);
}

function resolveDistPath(distDir, publicPath) {
  return path.join(distDir, publicPath.replace(/^\/+/, ''));
}

async function validateSourceImages(distDir, entries) {
  const seenPaths = new Set();

  for (const entry of entries) {
    if (seenPaths.has(entry.imagePath)) {
      throw new Error(`Duplicate word image path: ${entry.imagePath}`);
    }
    seenPaths.add(entry.imagePath);

    const metadata = await sharp(resolveDistPath(distDir, entry.imagePath)).metadata();
    if (metadata.width !== CELL_SIZE || metadata.height !== CELL_SIZE) {
      throw new Error(
        `Expected 512x512 word image at ${entry.imagePath}, received ${metadata.width}x${metadata.height}`,
      );
    }
  }
}

async function writeAtlas(distDir, atlas) {
  const outputPath = resolveDistPath(distDir, atlas.atlasPath);
  await mkdir(path.dirname(outputPath), { recursive: true });

  const composites = atlas.entries.map((entry) => ({
    input: resolveDistPath(distDir, entry.imagePath),
    left: entry.x,
    top: entry.y,
  }));

  await sharp({
    create: {
      width: ATLAS_SIZE,
      height: CELL_SIZE * ATLAS_ROWS,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    },
  })
    .composite(composites)
    .webp({ quality: 90 })
    .toFile(outputPath);
}

export async function buildWordAtlases({ distDir, maxFiles = 2000 }) {
  const payloadPath = path.join(distDir, 'content/words/ket_vocabulary.json');
  const payload = JSON.parse(await readFile(payloadPath, 'utf8'));
  const words = payload.words ?? [];
  const plan = createWordAtlasPlan(words);

  if (plan.entries.length !== words.length) {
    throw new Error(
      `Atlas coverage mismatch: planned ${plan.entries.length} of ${words.length} word images`,
    );
  }

  await validateSourceImages(distDir, plan.entries);

  for (const atlas of plan.atlases) {
    await writeAtlas(distDir, atlas);
  }

  const manifestEntries = plan.entries.map((entry) => ({
    imagePath: entry.imagePath,
    atlasPath: entry.atlasPath,
    row: entry.row,
    column: entry.column,
  }));
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    grid: {
      columns: ATLAS_COLUMNS,
      rows: ATLAS_ROWS,
      cellSize: CELL_SIZE,
    },
    stats: {
      sourceImages: words.length,
      atlasImages: plan.atlases.length,
    },
    entries: manifestEntries,
  };
  const manifestPath = path.join(distDir, 'content/words/word_image_atlas.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  await rm(path.join(distDir, 'content/images/words'), { recursive: true });

  const outputFiles = await countFiles(distDir);
  if (outputFiles >= maxFiles) {
    throw new Error(
      `ESA output contains ${outputFiles} files; expected fewer than ${maxFiles}`,
    );
  }

  return {
    sourceImages: words.length,
    atlasImages: plan.atlases.length,
    outputFiles,
  };
}

const isMainModule = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const distDir = path.resolve(process.argv[2] ?? 'dist');
  buildWordAtlases({ distDir })
    .then(({ sourceImages, atlasImages, outputFiles }) => {
      console.log(
        `ESA word atlases: ${sourceImages} sources -> ${atlasImages} atlases; ${outputFiles} total files`,
      );
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
