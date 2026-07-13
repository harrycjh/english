import { describe, expect, it } from 'vitest';
import {
  buildRedRocketSearchTerms,
  buildRedRocketWordForms,
  createRedRocketAtlasPlan,
  matchWordsToRedRocket,
  mergeRedRocketMediaManifest,
  normalizeRedRocketText,
} from './red-rocket-media.mjs';

const books = [
  {
    level: 'Early Level 1',
    title: 'My Hands',
    normalizedTitle: 'my hands',
    pages: [
      {
        level: 'Early Level 1',
        title: 'My Hands',
        sourceFile: 'My Hands',
        pdfPath: '/books/My Hands.pdf',
        page: 4,
        pageType: 'body',
        normalizedText: 'my hands are good for lifting',
        tokenCount: 7,
      },
    ],
  },
  {
    level: 'Emergent Level',
    title: 'Brave Grace',
    normalizedTitle: 'brave grace',
    pages: [
      {
        level: 'Emergent Level',
        title: 'Brave Grace',
        sourceFile: 'Brave Grace',
        pdfPath: '/books/Brave Grace.pdf',
        page: 4,
        pageType: 'body',
        normalizedText: 'grace went outside',
        tokenCount: 3,
      },
    ],
  },
];

describe('Red Rocket matching', () => {
  it('normalizes OCR punctuation and expands useful parenthetical variants', () => {
    expect(normalizeRedRocketText('Hands—are “good”!')).toBe('hands are good');
    expect(buildRedRocketSearchTerms('grand(d)ad')).toEqual(expect.arrayContaining(['grandad', 'granddad']));
    expect(buildRedRocketSearchTerms('mum (n)')).toContain('mum');
    expect(buildRedRocketSearchTerms('mobile (phone)')).toEqual(expect.arrayContaining(['mobile', 'mobile phone', 'phone']));
  });

  it('adds controlled inflections without changing phrases', () => {
    expect(buildRedRocketWordForms('lift', 'v')).toEqual(expect.arrayContaining(['lift', 'lifts', 'lifted', 'lifting']));
    expect(buildRedRocketWordForms('my hand', 'n')).toEqual(['my hand']);
  });

  it('uses body text first and a matching book title only as fallback', () => {
    const matches = matchWordsToRedRocket([
      { id: 'hand', english: 'hand', partOfSpeech: 'n' },
      { id: 'lift', english: 'lift', partOfSpeech: 'v' },
      { id: 'brave', english: 'brave', partOfSpeech: 'adj' },
      { id: 'missing', english: 'spaceship', partOfSpeech: 'n' },
    ], books);

    expect(matches.map((match) => [match.wordId, match.matchKind])).toEqual([
      ['hand', 'inflection'],
      ['lift', 'inflection'],
      ['brave', 'title'],
    ]);
  });
});

describe('Red Rocket atlas plan', () => {
  it('deduplicates shared pages and assigns stable 3x3 cells', () => {
    const sharedPage = books[0].pages[0];
    const plan = createRedRocketAtlasPlan([
      { wordId: 'hand', page: sharedPage },
      { wordId: 'lift', page: sharedPage },
    ]);

    expect(plan.pages).toHaveLength(1);
    expect(plan.atlases).toHaveLength(1);
    expect(plan.atlases[0].entries[0]).toMatchObject({ row: 0, column: 0 });
  });

  it('merges Red Rocket metadata without removing Oxford metadata', () => {
    const matches = matchWordsToRedRocket([{ id: 'hand', english: 'hand', partOfSpeech: 'n' }], books);
    const plan = createRedRocketAtlasPlan(matches);
    const merged = mergeRedRocketMediaManifest({
      schemaVersion: 1,
      generatedAt: '',
      stats: {},
      entries: [{ wordId: 'hand', relatedMedia: { oxford: { imagePath: '/oxford.webp' } } }],
    }, [{ id: 'hand' }], matches, plan, '2026-07-13T00:00:00.000Z');

    expect(merged.schemaVersion).toBe(2);
    expect(merged.entries[0].relatedMedia.oxford).toBeDefined();
    expect(merged.entries[0].relatedMedia.redRocket).toMatchObject({
      level: 'Early Level 1',
      title: 'My Hands',
      page: 4,
      row: 0,
      column: 0,
    });
  });
});
