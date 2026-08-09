import { existsSync } from 'node:fs';
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
const phavePdfPath = process.env.PHAVE_PDF_PATH ?? '/tmp/vocarabbit-phave.pdf';
const phraseListPdfPath = process.env.PHRASE_LIST_PDF_PATH ?? '/tmp/vocarabbit-phrase-list.pdf';

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

  it('parses a complete PHaVE-shaped text fixture without an external PDF', () => {
    const lines = Array.from({ length: 150 }, (_, index) => (
      `${index + 1}. ${index === 0 ? 'GO ON' : index === 149 ? 'SET ABOUT' : `TEST PHRASE ${index + 1}`}`
    ));
    const entries = parsePhaveText(lines.join('\n'));
    expect(entries).toHaveLength(150);
    expect(entries[0]).toMatchObject({ phrase: 'go on', rank: 1 });
    expect(entries.at(-1)).toMatchObject({ phrase: 'set about', rank: 150 });
  });

  it('parses a complete PHRASE-List-shaped text fixture without an external PDF', () => {
    const middle = Array.from({ length: 503 }, (_, index) => (
      `${1000 + index} test phrase ${index + 1} ${10000 + index}`
    ));
    const entries = parsePhraseListText([
      '107 have to 83092',
      ...middle,
      '5504 come about 1000',
    ].join('\n'));
    expect(entries).toHaveLength(505);
    expect(entries[0]).toMatchObject({ phrase: 'have to', rank: 107, frequencyPer100Million: 83092 });
    expect(entries.at(-1)).toMatchObject({ phrase: 'come about', rank: 5504 });
  });

  it.runIf(existsSync(phavePdfPath))('parses all 150 PHaVE entries from the optional source PDF', async () => {
    const { stdout } = await execFileAsync('pdftotext', ['-layout', phavePdfPath, '-'], {
      maxBuffer: 64 * 1024 * 1024,
    });
    const entries = parsePhaveText(stdout);
    expect(entries).toHaveLength(150);
    expect(entries[0]).toMatchObject({ phrase: 'go on', rank: 1 });
    expect(entries.at(-1)).toMatchObject({ phrase: 'set about', rank: 150 });
  });

  it.runIf(existsSync(phraseListPdfPath))('parses all 505 PHRASE List entries from the optional source PDF', async () => {
    const { stdout } = await execFileAsync('pdftotext', ['-layout', phraseListPdfPath, '-'], {
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
