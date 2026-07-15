import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  RED_ROCKET_ATLAS_COLUMNS,
  RED_ROCKET_ATLAS_ROWS,
  RED_ROCKET_CELL_SIZE,
  createRedRocketAtlasPlan,
  filterRejectedRedRocketMatches,
  matchWordsToRedRocket,
  mergeRedRocketMediaManifest,
  normalizeRedRocketText,
} from './red-rocket-media.mjs';

const run = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultSourceRoot = path.resolve(projectRoot, '..', 'red-rocket');
const wordListPath = path.join(projectRoot, 'public/content/words/ket_vocabulary.json');
const mediaManifestPath = path.join(projectRoot, 'public/content/words/word_related_media.json');
const atlasOutputRoot = path.join(projectRoot, 'public/content/images/red-rocket-atlases');
const reportPath = path.join(projectRoot, 'design-output/red-rocket-media/export-report.json');
const rejectedMatchesPath = path.join(projectRoot, 'scripts/red-rocket-rejected-matches.json');

async function loadBooks(sourceRoot) {
  const extractedRoot = path.join(sourceRoot, 'extracted');
  const levels = (await readdir(extractedRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const books = [];

  for (const level of levels) {
    const levelRoot = path.join(extractedRoot, level);
    const jsonFiles = (await readdir(levelRoot)).filter((file) => file.endsWith('.json')).sort();
    for (const jsonFile of jsonFiles) {
      const data = JSON.parse(await readFile(path.join(levelRoot, jsonFile), 'utf8'));
      const sourceFile = path.basename(jsonFile, '.json');
      const title = data.title || sourceFile;
      const pdfPath = path.join(sourceRoot, level, `${sourceFile}.pdf`);
      const pages = (data.pages ?? []).map((page) => {
        const normalizedText = normalizeRedRocketText(page.text ?? '');
        return {
          level,
          title,
          sourceFile,
          pdfPath,
          page: Number(page.page_number),
          pageType: page.page_type ?? 'body',
          normalizedText,
          tokenCount: normalizedText ? normalizedText.split(' ').length : Number.MAX_SAFE_INTEGER,
        };
      });
      books.push({ level, title, normalizedTitle: normalizeRedRocketText(title), pages });
    }
  }

  return books;
}

async function renderPageCell(page, tempRoot) {
  const prefix = path.join(tempRoot, 'page');
  await run('pdftoppm', [
    '-f', String(page.page),
    '-l', String(page.page),
    '-png',
    '-singlefile',
    '-r', '110',
    page.pdfPath,
    prefix,
  ], { maxBuffer: 4 * 1024 * 1024 });
  return sharp(`${prefix}.png`)
    .rotate()
    .resize(RED_ROCKET_CELL_SIZE, RED_ROCKET_CELL_SIZE, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toBuffer();
}

async function renderAtlases(plan, quality) {
  await rm(atlasOutputRoot, { recursive: true, force: true });
  await mkdir(atlasOutputRoot, { recursive: true });
  const atlasSize = RED_ROCKET_CELL_SIZE * RED_ROCKET_ATLAS_COLUMNS;

  for (const [atlasNumber, atlas] of plan.atlases.entries()) {
    const composites = [];
    for (const entry of atlas.entries) {
      const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'vocab-rabbit-red-rocket-'));
      try {
        const input = await renderPageCell(entry.page, tempRoot);
        composites.push({
          input,
          left: entry.column * RED_ROCKET_CELL_SIZE,
          top: entry.row * RED_ROCKET_CELL_SIZE,
        });
      } finally {
        await rm(tempRoot, { recursive: true, force: true });
      }
    }

    const outputPath = path.join(projectRoot, 'public', atlas.atlasPath.replace(/^\/+/, ''));
    await sharp({
      create: {
        width: atlasSize,
        height: RED_ROCKET_CELL_SIZE * RED_ROCKET_ATLAS_ROWS,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite(composites)
      .webp({ quality })
      .toFile(outputPath);

    if ((atlasNumber + 1) % 10 === 0 || atlasNumber + 1 === plan.atlases.length) {
      console.log(`Rendered Red Rocket atlases ${atlasNumber + 1}/${plan.atlases.length}`);
    }
  }
}

async function main() {
  const args = new Map(process.argv.slice(2).map((arg) => {
    const [key, value = 'true'] = arg.split('=', 2);
    return [key, value];
  }));
  const sourceRoot = path.resolve(args.get('--source-root') ?? defaultSourceRoot);
  const dryRun = args.has('--dry-run');
  const quality = Number(args.get('--quality') ?? 82);
  const generatedAt = new Date().toISOString();
  const [wordPayload, manifest, books, rejectedPayload] = await Promise.all([
    readFile(wordListPath, 'utf8').then(JSON.parse),
    readFile(mediaManifestPath, 'utf8').then(JSON.parse),
    loadBooks(sourceRoot),
    readFile(rejectedMatchesPath, 'utf8').then(JSON.parse),
  ]);
  const words = wordPayload.words ?? [];
  const unfilteredMatches = matchWordsToRedRocket(words, books);
  const matches = filterRejectedRedRocketMatches(unfilteredMatches, rejectedPayload.matches ?? []);
  const matchedWordIds = new Set(matches.map((match) => match.wordId));
  const rejectedMatches = unfilteredMatches.filter((match) => !matchedWordIds.has(match.wordId));
  const atlasPlan = createRedRocketAtlasPlan(matches);
  const nextManifest = mergeRedRocketMediaManifest(manifest, words, matches, atlasPlan, generatedAt);
  const report = {
    generatedAt,
    sourceRoot,
    stats: {
      totalWords: words.length,
      matchedWords: matches.length,
      unmatchedWords: words.length - matches.length,
      rejectedMatches: rejectedMatches.length,
      exactMatches: matches.filter((match) => match.matchKind === 'exact').length,
      inflectionMatches: matches.filter((match) => match.matchKind === 'inflection').length,
      titleMatches: matches.filter((match) => match.matchKind === 'title').length,
      uniquePages: atlasPlan.pages.length,
      atlasImages: atlasPlan.atlases.length,
    },
    unmatchedWords: words
      .filter((word) => !matchedWordIds.has(word.id))
      .map(({ id, english, partOfSpeech }) => ({ id, english, partOfSpeech })),
    rejectedMatches: rejectedMatches.map((match) => ({
      wordId: match.wordId,
      english: match.english,
      level: match.page.level,
      title: match.page.title,
      page: match.page.page,
      matchKind: match.matchKind,
    })),
    matches: matches.map((match) => ({
      wordId: match.wordId,
      english: match.english,
      level: match.page.level,
      title: match.page.title,
      page: match.page.page,
      matchKind: match.matchKind,
      matchedTerm: match.matchedTerm,
      matchedForm: match.matchedForm,
      confidence: match.confidence,
      candidateCount: match.candidateCount,
    })),
  };

  if (!dryRun) {
    await renderAtlases(atlasPlan, quality);
    await writeFile(mediaManifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(JSON.stringify(report.stats, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
