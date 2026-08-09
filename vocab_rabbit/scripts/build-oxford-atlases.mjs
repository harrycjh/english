import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

export const OXFORD_ATLAS_COLUMNS = 3;
export const OXFORD_ATLAS_ROWS = 3;
export const OXFORD_CELL_SIZE = 512;

const ENTRIES_PER_ATLAS = OXFORD_ATLAS_COLUMNS * OXFORD_ATLAS_ROWS;
const ATLAS_SIZE = OXFORD_CELL_SIZE * OXFORD_ATLAS_COLUMNS;

function resolveDistPath(distDir, publicPath) {
  return path.join(distDir, publicPath.replace(/^\/+/, ''));
}

async function countFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const counts = await Promise.all(entries.map((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? countFiles(entryPath) : 1;
  }));
  return counts.reduce((total, count) => total + count, 0);
}

export function createOxfordAtlasPlan(manifest) {
  const uniqueImagePaths = [];
  const seen = new Set();
  for (const entry of manifest.entries ?? []) {
    const imagePath = entry.relatedMedia?.oxford?.imagePath;
    if (!imagePath || seen.has(imagePath)) continue;
    seen.add(imagePath);
    uniqueImagePaths.push(imagePath);
  }

  const atlases = [];
  const entries = [];
  for (let start = 0; start < uniqueImagePaths.length; start += ENTRIES_PER_ATLAS) {
    const atlasIndex = Math.floor(start / ENTRIES_PER_ATLAS);
    const atlasPath = `/content/images/oxford-atlases/atlas-${String(atlasIndex).padStart(3, '0')}.webp`;
    const atlasEntries = uniqueImagePaths
      .slice(start, start + ENTRIES_PER_ATLAS)
      .map((imagePath, cellIndex) => {
        const row = Math.floor(cellIndex / OXFORD_ATLAS_COLUMNS);
        const column = cellIndex % OXFORD_ATLAS_COLUMNS;
        const entry = {
          imagePath,
          atlasPath,
          row,
          column,
          x: column * OXFORD_CELL_SIZE,
          y: row * OXFORD_CELL_SIZE,
        };
        entries.push(entry);
        return entry;
      });
    atlases.push({ atlasPath, entries: atlasEntries });
  }
  return { atlases, entries };
}

async function renderCell(distDir, imagePath) {
  return sharp(resolveDistPath(distDir, imagePath))
    .rotate()
    .resize(OXFORD_CELL_SIZE, OXFORD_CELL_SIZE, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
}

async function writeAtlas(distDir, atlas) {
  const outputPath = resolveDistPath(distDir, atlas.atlasPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const cells = await Promise.all(atlas.entries.map(async (entry) => ({
    input: await renderCell(distDir, entry.imagePath),
    left: entry.x,
    top: entry.y,
  })));
  await sharp({
    create: {
      width: ATLAS_SIZE,
      height: OXFORD_CELL_SIZE * OXFORD_ATLAS_ROWS,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite(cells)
    .webp({ quality: 90 })
    .toFile(outputPath);
}

export async function buildOxfordAtlases({ distDir, maxFiles = 2000 }) {
  const manifestPath = path.join(distDir, 'content/words/word_related_media.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const plan = createOxfordAtlasPlan(manifest);
  const atlasByImagePath = new Map(plan.entries.map((entry) => [entry.imagePath, entry]));

  for (const atlas of plan.atlases) await writeAtlas(distDir, atlas);

  for (const entry of manifest.entries ?? []) {
    const oxford = entry.relatedMedia?.oxford;
    const atlasEntry = atlasByImagePath.get(oxford?.imagePath);
    if (!oxford || !atlasEntry) continue;
    oxford.atlasPath = atlasEntry.atlasPath;
    oxford.row = atlasEntry.row;
    oxford.column = atlasEntry.column;
    delete oxford.imagePath;
  }
  manifest.oxfordAtlasGrid = {
    columns: OXFORD_ATLAS_COLUMNS,
    rows: OXFORD_ATLAS_ROWS,
    cellSize: OXFORD_CELL_SIZE,
  };
  manifest.stats = { ...manifest.stats, oxfordAtlases: plan.atlases.length };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await rm(path.join(distDir, 'content/images/oxford-tree'), { recursive: true, force: true });

  const outputFiles = await countFiles(distDir);
  if (outputFiles >= maxFiles) {
    throw new Error(
      `ESA output contains ${outputFiles} files after Oxford atlas build; expected fewer than ${maxFiles}`,
    );
  }
  return { sourceImages: plan.entries.length, atlasImages: plan.atlases.length, outputFiles };
}

const isMainModule = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const distDir = path.resolve(process.argv[2] ?? 'dist');
  buildOxfordAtlases({ distDir })
    .then(({ sourceImages, atlasImages, outputFiles }) => {
      console.log(
        `ESA Oxford atlases: ${sourceImages} sources -> ${atlasImages} atlases; ${outputFiles} total files`,
      );
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
