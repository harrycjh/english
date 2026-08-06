import { describe, expect, it, afterEach } from 'vitest';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  BUILD_ONLY_WORD_FIELDS,
  SHIPPED_TEACHING_CHUNK_FIELDS,
  SHIPPED_USAGE_FREQUENCY_FIELDS,
  shrinkDistWordPayload,
  shrinkWordPayload,
  // @ts-expect-error -- plain build script, no type declarations
} from './shrink-word-payload.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createDist(payload: unknown): Promise<string> {
  const distDir = await mkdtemp(path.join(tmpdir(), 'vocab-rabbit-shrink-'));
  temporaryDirectories.push(distDir);
  const contentDir = path.join(distDir, 'content/words');
  await mkdir(contentDir, { recursive: true });
  await writeFile(
    path.join(contentDir, 'ket_vocabulary.json'),
    JSON.stringify(payload, null, 2),
  );
  return distDir;
}

describe('shrinkWordPayload', () => {
  it('drops the fields only the build scripts read', () => {
    const shrunk = shrinkWordPayload({
      wordCount: 1,
      words: [{ id: 'w1', english: 'apple', examChunks: [{ phrase: 'an apple a day' }] }],
    });

    expect(shrunk.words[0]).not.toHaveProperty('examChunks');
  });

  it('keeps everything the app actually renders', () => {
    const word = {
      id: 'w1',
      english: 'apple',
      chinese: '苹果',
      teachingChunks: [{ phrase: 'eat an apple', chinese: '吃一个苹果' }],
      examples: ['I eat an apple.'],
      imagePath: '/content/images/words/w1.webp',
      examChunks: [{ phrase: 'an apple a day' }],
    };

    const shrunk = shrinkWordPayload({ words: [word] });

    expect(shrunk.words[0]).toEqual({
      id: 'w1',
      english: 'apple',
      chinese: '苹果',
      teachingChunks: [{ phrase: 'eat an apple', chinese: '吃一个苹果', usageFrequency: {} }],
      examples: ['I eat an apple.'],
      imagePath: '/content/images/words/w1.webp',
    });
  });

  it('leaves the top-level metadata alone', () => {
    const shrunk = shrinkWordPayload({
      generatedAt: '2026-05-08T08:37:14.831036Z',
      categories: ['家人和朋友'],
      words: [],
    });

    expect(shrunk.generatedAt).toBe('2026-05-08T08:37:14.831036Z');
    expect(shrunk.categories).toEqual(['家人和朋友']);
  });

  it('does not mutate the payload it was handed', () => {
    const payload = { words: [{ id: 'w1', examChunks: [{ phrase: 'x' }] }] };

    shrinkWordPayload(payload);

    expect(payload.words[0]).toHaveProperty('examChunks');
  });

  it('refuses a payload without a words array', () => {
    expect(() => shrinkWordPayload({ words: 'nope' })).toThrow(/words array/);
  });

  it('names examChunks as build-only so the intent is checkable', () => {
    expect(BUILD_ONLY_WORD_FIELDS).toContain('examChunks');
  });
});

describe('shrinkDistWordPayload', () => {
  it('rewrites the built payload without indentation and reports the saving', async () => {
    const distDir = await createDist({
      wordCount: 2,
      words: [
        { id: 'w1', english: 'apple', examChunks: [{ phrase: 'an apple a day keeps you well' }] },
        { id: 'w2', english: 'bus', examChunks: [{ phrase: 'catch the bus in the morning' }] },
      ],
    });

    const result = await shrinkDistWordPayload({ distDir });
    const written = await readFile(path.join(distDir, 'content/words/ket_vocabulary.json'), 'utf8');

    expect(written).not.toContain('\n');
    expect(written).not.toContain('examChunks');
    expect(JSON.parse(written).words).toHaveLength(2);
    expect(result.after).toBeLessThan(result.before);
    expect(result.words).toBe(2);
  });
});

const authoredChunk = {
  phrase: 'give someone a hand',
  chinese: '帮助某人;搭把手',
  sense: 'help someone',
  type: 'fixed_expression',
  cefr: 'A2',
  sources: ['phrase-list'],
  usageFrequency: {
    zipf: 4.8,
    selectionScore: 6.1,
    source: 'wordfreq-estimate',
    phraseListPer100Million: 12,
    phaveRank: 340,
  },
};

describe('shrinking teaching chunks', () => {
  function shrinkOne(chunk: unknown) {
    return shrinkWordPayload({
      wordCount: 1,
      words: [{ id: 'w1', english: 'hand', teachingChunks: [chunk] }],
    }).words[0].teachingChunks[0];
  }

  it('keeps the phrase and the translation, which are what the drawer renders', () => {
    expect(shrinkOne(authoredChunk)).toMatchObject({
      phrase: 'give someone a hand',
      chinese: '帮助某人;搭把手',
    });
  });

  it('drops the selection reasoning nothing renders', () => {
    const shrunk = shrinkOne(authoredChunk);

    for (const field of ['sense', 'type', 'cefr', 'sources']) {
      expect(shrunk).not.toHaveProperty(field);
    }
  });

  // The drawer sorts on these at render time, and the authored file is only
  // mostly in that order -- dropping them would reorder 63 words in production
  // and not in dev, where the authored file is served untouched.
  it('keeps the two numbers the drawer sorts on', () => {
    expect(shrinkOne(authoredChunk).usageFrequency).toEqual({ zipf: 4.8, selectionScore: 6.1 });
  });

  it('drops the provenance buried inside usageFrequency', () => {
    const shrunk = shrinkOne(authoredChunk);

    for (const field of ['source', 'phraseListPer100Million', 'phaveRank']) {
      expect(shrunk.usageFrequency).not.toHaveProperty(field);
    }
  });

  it('leaves a word without chunks alone', () => {
    const shrunk = shrinkWordPayload({ wordCount: 1, words: [{ id: 'w1', english: 'hand' }] });

    expect(shrunk.words[0]).not.toHaveProperty('teachingChunks');
  });

  it('survives a chunk with no usageFrequency at all', () => {
    expect(shrinkOne({ phrase: 'by hand', chinese: '用手' }).usageFrequency).toEqual({});
  });
});

/**
 * The grep guard used for whole-word fields cannot work here: `type`, `sources`
 * and `sense` are ordinary words that appear all over src. What protects these
 * instead is the TypeScript declaration -- if `TeachingChunk` only admits what
 * ships, reading a stripped field stops compiling. So the thing worth pinning
 * is that the declaration and the strip list still agree.
 */
describe('the shipped chunk type matches what the build actually ships', () => {
  async function teachingChunkDeclaration(): Promise<string> {
    const source = await readFile(path.resolve('src/models/word.ts'), 'utf8');
    const body = /export interface TeachingChunk \{([\s\S]*?)\n\}/.exec(source)?.[1];
    if (!body) throw new Error('TeachingChunk interface not found in src/models/word.ts');
    return body;
  }

  it('declares exactly the chunk fields the build keeps', async () => {
    const body = await teachingChunkDeclaration();
    const topLevel = [...body.matchAll(/^ {2}(\w+)[?]?:/gm)].map((match) => match[1]);

    expect(topLevel).toEqual([...SHIPPED_TEACHING_CHUNK_FIELDS, 'usageFrequency']);
  });

  it('declares exactly the usageFrequency fields the build keeps', async () => {
    const body = await teachingChunkDeclaration();
    const nested = [...body.matchAll(/^ {4}(\w+)[?]?:/gm)].map((match) => match[1]);

    expect(nested).toEqual([...SHIPPED_USAGE_FREQUENCY_FIELDS]);
  });
});

// Stripping a field at build time is only safe while the app genuinely never
// reads it. Nothing at runtime would fail loudly if that stopped being true --
// the field would simply be undefined on every word -- so the guard has to live
// here, next to the list that does the stripping.
describe('the stripped fields stay build-time only', () => {
  async function sourceFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(
      entries.map(async (entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return sourceFiles(full);
        return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
      }),
    );
    return files.flat();
  }

  it('lists at least one field, so the guard below cannot pass vacuously', () => {
    expect(BUILD_ONLY_WORD_FIELDS.length).toBeGreaterThan(0);
  });

  it('is not read anywhere in src, apart from the type declaration', async () => {
    const files = await sourceFiles(path.resolve('src'));
    expect(files.length).toBeGreaterThan(100);

    const offenders: string[] = [];
    for (const file of files) {
      // The optional property on the Word interface is the one allowed mention:
      // the authored file really does carry the field, build scripts read it.
      if (file.endsWith(path.join('models', 'word.ts'))) continue;
      const source = await readFile(file, 'utf8');
      for (const field of BUILD_ONLY_WORD_FIELDS) {
        if (source.includes(field)) offenders.push(`${path.relative(process.cwd(), file)} -> ${field}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
