import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import {
  getHeadwordVariants,
  normalizePhrase,
  parsePhaveText,
  parsePhraseListText,
} from './exam-chunk-sources.mjs';

const execFileAsync = promisify(execFile);

describe('exam chunk source parsing', () => {
  it('normalizes punctuation without changing phrase content', () => {
    expect(normalizePhrase('  look   after. ')).toBe('look after');
  });

  it('expands slash and inline-parenthetical headwords', () => {
    expect(getHeadwordVariants({ english: 'barbecue/barbeque' })).toEqual([
      'barbecue',
      'barbeque',
    ]);
    expect(getHeadwordVariants({ english: 'grand(d)ad' })).toEqual([
      'granddad',
      'grandad',
    ]);
  });

  it('parses all 150 PHaVE entries from the source PDF', async () => {
    const pdfPath = '/tmp/vocarabbit-phave.pdf';
    await fs.access(pdfPath);
    const { stdout } = await execFileAsync('pdftotext', ['-layout', pdfPath, '-'], {
      maxBuffer: 64 * 1024 * 1024,
    });
    const entries = parsePhaveText(stdout);
    expect(entries).toHaveLength(150);
    expect(entries[0]).toMatchObject({ phrase: 'go on', rank: 1 });
    expect(entries.at(-1)).toMatchObject({ phrase: 'set about', rank: 150 });
  });

  it('parses all 505 PHRASE List entries from the source PDF', async () => {
    const pdfPath = '/tmp/vocarabbit-phrase-list.pdf';
    await fs.access(pdfPath);
    const { stdout } = await execFileAsync('pdftotext', ['-layout', pdfPath, '-'], {
      maxBuffer: 64 * 1024 * 1024,
    });
    const entries = parsePhraseListText(stdout);
    expect(entries).toHaveLength(505);
    expect(entries[0]).toMatchObject({
      phrase: 'have to',
      rank: 107,
      frequencyPer100Million: 83092,
    });
    expect(entries.at(-1)).toMatchObject({ phrase: 'come about', rank: 5504 });
  });
});
