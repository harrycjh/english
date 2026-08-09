import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  parseRazExportArgs,
  replaceDirectoryAtomically,
} from './export-raz-media.mjs';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('RAZ export command safety', () => {
  it('recognizes help without starting an export', () => {
    expect(parseRazExportArgs(['--help'])).toMatchObject({ help: true });
  });

  it('rejects unknown arguments instead of silently exporting', () => {
    expect(() => parseRazExportArgs(['--typo'])).toThrow('Unknown argument: --typo');
  });

  it('parses the documented non-destructive options', () => {
    expect(parseRazExportArgs([
      '--dry-run',
      '--skip-render',
      '--quality=76',
      '--books=./fixtures/books.json',
    ])).toMatchObject({
      help: false,
      dryRun: true,
      skipRender: true,
      quality: 76,
      booksPath: path.resolve('./fixtures/books.json'),
    });
  });

  it('replaces a completed directory without exposing a partial result', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'raz-export-test-'));
    tempRoots.push(root);
    const target = path.join(root, 'raz-atlases');
    const staged = path.join(root, 'staged-atlases');
    await mkdir(target);
    await mkdir(staged);
    await writeFile(path.join(target, 'old.webp'), 'old');
    await writeFile(path.join(staged, 'new.webp'), 'new');

    await replaceDirectoryAtomically(staged, target);

    expect(await readFile(path.join(target, 'new.webp'), 'utf8')).toBe('new');
    await expect(readFile(path.join(target, 'old.webp'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
