import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  createRazAtlasPlan,
  findRazAtlasPlanChanges,
  matchWordsToRaz,
  mergeRazMediaManifest,
  normalizeRazBook,
} from './raz-media.mjs';

const run = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(projectRoot, '..');
const wordListPath = path.join(projectRoot, 'public/content/words/ket_vocabulary.json');
const mediaManifestPath = path.join(projectRoot, 'public/content/words/word_related_media.json');
const razBooksPath = path.join(repositoryRoot, 'raz/extracted/raz-books.json');
const rendererPath = path.join(projectRoot, 'tools/render_raz_atlases.py');
const reportPath = path.join(projectRoot, 'design-output/raz-media/export-report.json');

function parseArgs(argv) {
  const args = new Map(argv.map((arg) => {
    const [key, value = 'true'] = arg.split('=', 2);
    return [key, value];
  }));
  return {
    dryRun: args.has('--dry-run'),
    skipRender: args.has('--skip-render'),
    quality: Number(args.get('--quality') ?? 82),
    booksPath: path.resolve(args.get('--books') ?? razBooksPath),
  };
}

async function renderAtlases(atlasPlan, quality) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'vocab-rabbit-raz-'));
  const planPath = path.join(tempRoot, 'atlas-plan.json');
  const atlasOutputRoot = path.join(projectRoot, 'public/content/images/raz-atlases');
  try {
    const renderPlan = {
      atlases: atlasPlan.atlases.map((atlas) => ({
        atlasPath: atlas.atlasPath,
        entries: atlas.entries.map(({ page, row, column }) => ({
          row,
          column,
          pdfPath: path.join(repositoryRoot, page.sourceFile),
          pdfIndex: page.pdfIndex,
        })),
      })),
    };
    await writeFile(planPath, JSON.stringify(renderPlan));
    await rm(atlasOutputRoot, { recursive: true, force: true });
    await mkdir(atlasOutputRoot, { recursive: true });
    const { stdout } = await run('python3', [
      rendererPath,
      '--plan', planPath,
      '--public-root', path.join(projectRoot, 'public'),
      '--quality', String(quality),
    ], { maxBuffer: 4 * 1024 * 1024 });
    process.stdout.write(stdout);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!Number.isInteger(args.quality) || args.quality < 1 || args.quality > 100) {
    throw new Error(`--quality must be an integer from 1 to 100, got ${args.quality}`);
  }
  const generatedAt = new Date().toISOString();
  const [wordPayload, manifest, razPayload] = await Promise.all([
    readFile(wordListPath, 'utf8').then(JSON.parse),
    readFile(mediaManifestPath, 'utf8').then(JSON.parse),
    readFile(args.booksPath, 'utf8').then(JSON.parse),
  ]);
  const words = wordPayload.words ?? [];
  const books = (razPayload.books ?? [])
    .filter((book) => book.source === 'text')
    .map((book, order) => normalizeRazBook(book, order));
  const matches = matchWordsToRaz(words, books);
  const atlasPlan = createRazAtlasPlan(matches);
  if (args.skipRender) {
    const atlasPlanChanges = findRazAtlasPlanChanges(manifest, atlasPlan);
    if (atlasPlanChanges.length > 0) {
      const first = atlasPlanChanges[0];
      throw new Error(
        `--skip-render is unsafe because ${atlasPlanChanges.length} RAZ atlas page locations changed; `
        + `first change: ${first.pageKey}. Re-run without --skip-render.`,
      );
    }
  }
  const nextManifest = mergeRazMediaManifest(
    manifest,
    words,
    matches,
    atlasPlan,
    generatedAt,
  );
  const matchedWordIds = new Set(matches.map((match) => match.wordId));
  const report = {
    generatedAt,
    source: args.booksPath,
    rule: 'First matching story page in extracted RAZ corpus order',
    stats: {
      totalWords: words.length,
      matchedWords: matches.length,
      unmatchedWords: words.length - matches.length,
      exactMatches: matches.filter((match) => match.matchKind === 'exact').length,
      spellingMatches: matches.filter((match) => match.matchKind === 'spelling').length,
      inflectionMatches: matches.filter((match) => match.matchKind === 'inflection').length,
      uniquePages: atlasPlan.pages.length,
      atlasImages: atlasPlan.atlases.length,
    },
    unmatchedWords: words
      .filter((word) => !matchedWordIds.has(word.id))
      .map(({ id, english, partOfSpeech }) => ({ id, english, partOfSpeech })),
    matches: matches.map((match) => ({
      wordId: match.wordId,
      english: match.english,
      bookId: match.page.bookId,
      level: match.page.level,
      sequence: match.page.sequence,
      title: match.page.title,
      page: match.page.page,
      pdfIndex: match.page.pdfIndex,
      matchKind: match.matchKind,
      matchedTerm: match.matchedTerm,
      matchedForm: match.matchedForm,
      sentence: match.sentence,
    })),
  };

  if (!args.dryRun) {
    if (!args.skipRender) await renderAtlases(atlasPlan, args.quality);
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
