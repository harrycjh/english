import { describe, expect, it } from 'vitest';
import {
  buildRazSearchTerms,
  buildRazWordForms,
  createRazAtlasPlan,
  findRazAtlasPlanChanges,
  matchWordsToRaz,
  mergeRazMediaManifest,
  normalizeRazBook,
} from './raz-media.mjs';

const books = [
  normalizeRazBook({
    id: 'E01',
    level: 'E',
    sequence: 1,
    title: 'The First Book',
    file: 'raz/E级别-pdf/E01-The First Book.pdf',
    pages: [
      { page: 3, pdfIndex: 2, kind: 'toc', text: 'Table of Contents' },
      { page: 4, pdfIndex: 3, kind: 'story', text: 'The neighbors have red hands.' },
      { page: 5, pdfIndex: 4, kind: 'story', text: 'A hand holds the red ball.' },
    ],
  }, 0),
  normalizeRazBook({
    id: 'E02',
    level: 'E',
    sequence: 2,
    title: 'The Second Book',
    file: 'raz/E级别-pdf/E02-The Second Book.pdf',
    pages: [
      { page: 3, pdfIndex: 2, kind: 'story', text: 'My hand is clean.' },
    ],
  }, 1),
];

describe('RAZ first-occurrence matching', () => {
  it('checks only story text and returns the first page in corpus order', () => {
    const matches = matchWordsToRaz([
      { id: 'hand', english: 'hand', partOfSpeech: 'n' },
    ], books);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      wordId: 'hand',
      matchKind: 'inflection',
      matchedForm: 'hands',
      sentence: 'The neighbors have red hands.',
      page: { bookId: 'E01', page: 4, pdfIndex: 3 },
    });
  });

  it('maps British spellings to their American RAZ spelling', () => {
    expect(buildRazSearchTerms('neighbour')).toEqual(
      expect.arrayContaining(['neighbour', 'neighbor']),
    );
    const matches = matchWordsToRaz([
      { id: 'neighbour', english: 'neighbour', partOfSpeech: 'n' },
    ], books);
    expect(matches[0]).toMatchObject({
      matchKind: 'inflection',
      matchedTerm: 'neighbor',
      matchedForm: 'neighbors',
      page: { bookId: 'E01', page: 4 },
    });
  });

  it('expands optional letters and trailing phrase completions without mining fragments', () => {
    expect(buildRazSearchTerms('gram(me)')).toEqual(expect.arrayContaining(['gram', 'gramme']));
    expect(buildRazSearchTerms('gram(me)')).not.toContain('me');
    expect(buildRazSearchTerms('listen (to)')).toEqual(['listen', 'listen to']);
    expect(buildRazSearchTerms('listen (to)')).not.toContain('to');
    expect(buildRazSearchTerms('performance (ENTERTAINMENT)')).toEqual(['performance']);
    expect(buildRazSearchTerms('poor thing/you')).toEqual(['poor thing', 'poor you']);
    expect(buildRazSearchTerms('give somebody a call/ring')).toEqual([
      'give somebody a call',
      'give somebody a ring',
    ]);
    expect(buildRazSearchTerms('all right/alright')).toEqual(['all right', 'alright']);
    expect(buildRazSearchTerms('v/versus')).toEqual(['versus']);
  });

  it('never mines table-of-contents pages', () => {
    const matches = matchWordsToRaz([
      { id: 'contents', english: 'contents', partOfSpeech: 'n' },
    ], books);
    expect(matches).toEqual([]);
  });

  it('handles irregular noun plurals and every declared part of speech', () => {
    expect(buildRazWordForms('person', 'n')).toContain('people');
    expect(buildRazWordForms('tooth', 'n')).toContain('teeth');
    expect(buildRazWordForms('dress', 'n & v')).toEqual(
      expect.arrayContaining(['dresses', 'dressed', 'dressing']),
    );
    expect(buildRazWordForms('steal', 'v')).toEqual(
      expect.arrayContaining(['steal', 'stole', 'stolen']),
    );
    expect(buildRazWordForms('take part', 'phr v')).toContain('took part');
    expect(buildRazWordForms('traffic light', 'n')).toContain('traffic lights');
    expect(buildRazWordForms('for sale', 'n')).toEqual(['for sale']);
  });

  it('does not invent suffix forms for titles or adjectives', () => {
    expect(buildRazWordForms('mr', 'n')).toEqual(['mr']);
    expect(buildRazWordForms('strange', 'adj')).toEqual(['strange']);
  });

  it('treats a possessive as an occurrence of the noun', () => {
    const possessiveBooks = [
      normalizeRazBook({
        id: 'E01',
        level: 'E',
        sequence: 1,
        title: 'Market',
        file: 'market.pdf',
        pages: [
          { page: 3, pdfIndex: 2, kind: 'story', text: 'This is the farmer’s market.' },
          { page: 4, pdfIndex: 3, kind: 'story', text: 'The farmer sells corn.' },
        ],
      }, 0),
    ];
    const matches = matchWordsToRaz([
      { id: 'farmer', english: 'farmer', partOfSpeech: 'n' },
    ], possessiveBooks);
    expect(matches[0].page.page).toBe(3);
  });

  it('treats a word after an opening quote as a standalone occurrence', () => {
    const quotedBooks = [
      normalizeRazBook({
        id: 'E01',
        level: 'E',
        sequence: 1,
        title: 'Dialogue',
        file: 'dialogue.pdf',
        pages: [
          { page: 3, pdfIndex: 2, kind: 'story', text: '‘Come here,’ said Tom.' },
          { page: 4, pdfIndex: 3, kind: 'story', text: 'Come with me.' },
        ],
      }, 0),
    ];
    const matches = matchWordsToRaz([
      { id: 'come', english: 'come', partOfSpeech: 'v' },
    ], quotedBooks);
    expect(matches[0].page.page).toBe(3);
  });

  it('does not turn contractions into acronyms', () => {
    const contractionBooks = [
      normalizeRazBook({
        id: 'E01',
        level: 'E',
        sequence: 1,
        title: 'Jobs',
        file: 'jobs.pdf',
        pages: [
          { page: 3, pdfIndex: 2, kind: 'story', text: 'I’d like to be a pilot.' },
          { page: 4, pdfIndex: 3, kind: 'story', text: 'Show your ID card.' },
        ],
      }, 0),
    ];
    const matches = matchWordsToRaz([
      { id: 'id', english: 'ID', partOfSpeech: 'n' },
    ], contractionBooks);
    expect(matches[0].page.page).toBe(4);
  });

  it('keeps acronyms, titles, and ambiguous month names case aware', () => {
    const ambiguousBooks = [
      normalizeRazBook({
        id: 'E01',
        level: 'E',
        sequence: 1,
        title: 'Ambiguous Words',
        file: 'ambiguous.pdf',
        pages: [
          {
            page: 3,
            pdfIndex: 2,
            kind: 'story',
            text: 'It may rain, he misses the sun, and Maddy marches home.',
          },
          { page: 4, pdfIndex: 3, kind: 'story', text: 'May I help Miss Lee with IT?' },
          { page: 5, pdfIndex: 4, kind: 'story', text: 'Every March, we plan a visit in May.' },
        ],
      }, 0),
    ];
    const matches = matchWordsToRaz([
      { id: 'it-tech', english: 'IT', partOfSpeech: 'n' },
      { id: 'miss-title', english: 'Miss', partOfSpeech: 'n' },
      { id: 'may-month', english: 'May', partOfSpeech: 'n' },
      { id: 'march-month', english: 'March', partOfSpeech: 'n' },
    ], ambiguousBooks);
    expect(matches.find((match) => match.wordId === 'it-tech')?.page.page).toBe(4);
    expect(matches.find((match) => match.wordId === 'miss-title')?.page.page).toBe(4);
    expect(matches.find((match) => match.wordId === 'may-month')?.page.page).toBe(5);
    expect(matches.find((match) => match.wordId === 'march-month')?.page.page).toBe(5);
  });

  it('keeps hyphenated compounds from becoming standalone word matches', () => {
    const compoundBooks = [
      normalizeRazBook({
        id: 'E01',
        level: 'E',
        sequence: 1,
        title: 'Compounds',
        file: 'compounds.pdf',
        pages: [
          { page: 3, pdfIndex: 2, kind: 'story', text: 'The code is Arb-ad-ac-arb-a.' },
          { page: 4, pdfIndex: 3, kind: 'story', text: 'This newspaper ad is short.' },
        ],
      }, 0),
    ];
    const matches = matchWordsToRaz([
      { id: 'ad', english: 'ad', partOfSpeech: 'n' },
    ], compoundBooks);
    expect(matches[0].page.page).toBe(4);
  });

  it('keeps case-sensitive terms inside hyphenated compounds from matching', () => {
    const compoundBooks = [
      normalizeRazBook({
        id: 'E01',
        level: 'E',
        sequence: 1,
        title: 'Case-Sensitive Compounds',
        file: 'compounds.pdf',
        pages: [
          { page: 3, pdfIndex: 2, kind: 'story', text: 'A near-Miss-incident stopped play.' },
          { page: 4, pdfIndex: 3, kind: 'story', text: 'Miss Lee restarted the game.' },
          { page: 5, pdfIndex: 4, kind: 'story', text: 'The known-IT-consultant arrived.' },
          { page: 6, pdfIndex: 5, kind: 'story', text: 'She works in IT.' },
        ],
      }, 0),
    ];
    const matches = matchWordsToRaz([
      { id: 'miss-title', english: 'Miss', partOfSpeech: 'n' },
      { id: 'it-tech', english: 'IT', partOfSpeech: 'n' },
    ], compoundBooks);
    expect(matches.find((match) => match.wordId === 'miss-title')?.page.page).toBe(4);
    expect(matches.find((match) => match.wordId === 'it-tech')?.page.page).toBe(6);
  });

  it('requires qualifying context for ambiguous senses', () => {
    const senseBooks = [
      normalizeRazBook({
        id: 'E01',
        level: 'E',
        sequence: 1,
        title: 'Smart Animals',
        file: 'smart.pdf',
        pages: [
          { page: 3, pdfIndex: 2, kind: 'story', text: 'The smart fox found food.' },
          { page: 4, pdfIndex: 3, kind: 'story', text: 'She wore a smart suit.' },
        ],
      }, 0),
    ];
    const matches = matchWordsToRaz([
      { id: 'smart-stylish', english: 'smart (stylish)', partOfSpeech: 'adj' },
    ], senseBooks);
    expect(matches[0].page.page).toBe(4);
  });

  it('does not treat the historical AD date marker as an advertisement', () => {
    const adBooks = [
      normalizeRazBook({
        id: 'E01',
        level: 'E',
        sequence: 1,
        title: 'Two Uses of Ad',
        file: 'ad.pdf',
        pages: [
          { page: 3, pdfIndex: 2, kind: 'story', text: 'The city began around AD 385.' },
          { page: 4, pdfIndex: 3, kind: 'story', text: 'The newspaper ad was easy to read.' },
        ],
      }, 0),
    ];
    const matches = matchWordsToRaz([
      { id: 'ad', english: 'ad', partOfSpeech: 'n' },
    ], adBooks);
    expect(matches[0].page.page).toBe(4);
  });

  it('requires the requested sense or part of speech for common homographs', () => {
    const homographBooks = [
      normalizeRazBook({
        id: 'E01',
        level: 'E',
        sequence: 1,
        title: 'Homographs',
        file: 'homographs.pdf',
        pages: [
          {
            page: 3,
            pdfIndex: 2,
            kind: 'story',
            text: 'The river bank was flat. The toucan had a long bill. The bubbles went pop.',
          },
          {
            page: 4,
            pdfIndex: 3,
            kind: 'story',
            text: 'I put money in my bank account, paid the phone bill, heard pop music, and live in a flat.',
          },
          {
            page: 5,
            pdfIndex: 4,
            kind: 'story',
            text: 'We visit friends and make a mean face that sounds funny.',
          },
          {
            page: 6,
            pdfIndex: 5,
            kind: 'story',
            text: 'Our next visit will be fun. What does this word mean? The alarm sounds loud.',
          },
        ],
      }, 0),
    ];
    const matches = matchWordsToRaz([
      { id: 'ket_bank_n', english: 'bank', partOfSpeech: 'n' },
      { id: 'ket_bill_n', english: 'bill', partOfSpeech: 'n' },
      { id: 'ket_flat_n', english: 'flat', partOfSpeech: 'n' },
      { id: 'ket_pop_n', english: 'pop', partOfSpeech: 'n' },
      { id: 'ket_visit_n', english: 'visit', partOfSpeech: 'n' },
      { id: 'ket_mean_v', english: 'mean', partOfSpeech: 'v' },
      { id: 'ket_sound_v', english: 'sound', partOfSpeech: 'v' },
    ], homographBooks);
    expect(Object.fromEntries(matches.map((match) => [match.wordId, match.page.page]))).toEqual({
      ket_bank_n: 4,
      ket_bill_n: 4,
      ket_flat_n: 4,
      ket_pop_n: 4,
      ket_visit_n: 6,
      ket_mean_v: 6,
      ket_sound_v: 6,
    });
  });

  it('skips RAZ uses with the wrong taught sense or part of speech', () => {
    const senseBooks = [
      normalizeRazBook({
        id: 'E01',
        level: 'E',
        sequence: 1,
        title: 'Different Uses',
        file: 'different-uses.pdf',
        pages: [
          {
            page: 3,
            pdfIndex: 2,
            kind: 'story',
            text: [
              'Coco likes the hard c.',
              'Fossils can form when living things die.',
              '“I can snowboard,” says Uzzle.',
              'The monsters do not notice.',
            ].join(' '),
          },
          {
            page: 4,
            pdfIndex: 3,
            kind: 'story',
            text: [
              'This puzzle is hard to solve.',
              'Please fill out the form.',
              'She got on her snowboard.',
              'I read the notice on the wall.',
            ].join(' '),
          },
        ],
      }, 0),
    ];
    const matches = matchWordsToRaz([
      { id: 'ket_hard_adj_adv', english: 'hard', partOfSpeech: 'adj & adv' },
      { id: 'ket_form_n', english: 'form', partOfSpeech: 'n' },
      { id: 'ket_snowboard_n', english: 'snowboard', partOfSpeech: 'n' },
      { id: 'ket_notice_n', english: 'notice', partOfSpeech: 'n' },
    ], senseBooks);

    expect(Object.fromEntries(matches.map((match) => [match.wordId, match.page.page]))).toEqual({
      ket_hard_adj_adv: 4,
      ket_form_n: 4,
      ket_snowboard_n: 4,
      ket_notice_n: 4,
    });
    expect(Object.fromEntries(matches.map((match) => [match.wordId, match.sentence]))).toEqual({
      ket_hard_adj_adv: 'This puzzle is hard to solve.',
      ket_form_n: 'Please fill out the form.',
      ket_snowboard_n: 'She got on her snowboard.',
      ket_notice_n: 'I read the notice on the wall.',
    });
  });

  it('skips common surface-form matches that teach a different sense', () => {
    const senseBooks = [
      normalizeRazBook({
        id: 'E01',
        level: 'E',
        sequence: 1,
        title: 'Ambiguous Everyday Words',
        file: 'ambiguous-everyday-words.pdf',
        pages: [
          {
            page: 3,
            pdfIndex: 2,
            kind: 'story',
            text: [
              'Right now, the children are ready.',
              'Use your right hand to hold the lace.',
              'Plants need water in order to live.',
              'Students earn belts in a certain order. The class begins.',
              'The captain ordered the sailors to drop the anchor.',
              'The costume makes him look like a rabbit.',
              'Her cub is missing.',
              'Use materials that match the shapes.',
            ].join(' '),
          },
          {
            page: 4,
            pdfIndex: 3,
            kind: 'story',
            text: [
              'Your answer is right.',
              'I want to order a pizza.',
              'Look at the bright red kite.',
              'Do not miss the bus.',
              'We watched a football match.',
            ].join(' '),
          },
        ],
      }, 0),
    ];
    const matches = matchWordsToRaz([
      {
        id: 'ket_right_n_adj_adv',
        english: 'right',
        partOfSpeech: 'n, adj & adv',
        studySense: { partOfSpeech: 'adj', chinese: '正确的' },
      },
      {
        id: 'ket_order_n_v',
        english: 'order',
        partOfSpeech: 'n & v',
        studySense: { partOfSpeech: 'v', chinese: '点餐；订购' },
      },
      { id: 'ket_look_v', english: 'look', partOfSpeech: 'v' },
      { id: 'ket_miss_v', english: 'miss', partOfSpeech: 'v' },
      {
        id: 'ket_match_n',
        english: 'match',
        partOfSpeech: 'n',
        studySense: { partOfSpeech: 'n', chinese: '比赛' },
      },
    ], senseBooks);

    expect(Object.fromEntries(matches.map((match) => [match.wordId, match.page.page]))).toEqual({
      ket_right_n_adj_adv: 4,
      ket_order_n_v: 4,
      ket_look_v: 4,
      ket_miss_v: 4,
      ket_match_n: 4,
    });
  });

  it('removes list markers from complete bullet sentences', () => {
    const bulletBooks = [
      normalizeRazBook({
        id: 'H44',
        level: 'H',
        sequence: 44,
        title: 'Pizza!',
        file: 'pizza.pdf',
        pages: [{
          page: 15,
          pdfIndex: 14,
          kind: 'story',
          text: [
            'Pizza Facts!',
            '• People in the United States eat',
            'about 350 slices of pizza every',
            'second.',
            '• October is National Pizza Month.',
          ].join('\n'),
        }],
      }, 0),
    ];
    const matches = matchWordsToRaz([
      { id: 'slice', english: 'slice', partOfSpeech: 'n' },
      { id: 'national', english: 'national', partOfSpeech: 'adj' },
    ], bulletBooks);

    expect(matches.find((match) => match.wordId === 'slice')?.sentence).toBe(
      'People in the United States eat about 350 slices of pizza every second.',
    );
    expect(matches.find((match) => match.wordId === 'national')?.sentence).toBe(
      'October is National Pizza Month.',
    );
  });

  it('does not attach a short bullet fragment to the following sentence', () => {
    const listBooks = [
      normalizeRazBook({
        id: 'I18',
        level: 'I',
        sequence: 18,
        title: 'How to Make Paper',
        file: 'paper.pdf',
        pages: [{
          page: 15,
          pdfIndex: 14,
          kind: 'story',
          text: [
            'You can use:',
            '• grass',
            '• flowers',
            '• leaves',
            'Place the plants onto the pulp',
            'after the steps on page 13.',
          ].join('\n'),
        }],
      }, 0),
    ];
    const [match] = matchWordsToRaz([
      { id: 'page', english: 'page', partOfSpeech: 'n' },
    ], listBooks);

    expect(match.sentence).toBe(
      'Place the plants onto the pulp after the steps on page 13.',
    );
  });

  it('does not attach a longer bullet fragment to the following instruction', () => {
    const listBooks = [
      normalizeRazBook({
        id: 'K10',
        level: 'K',
        sequence: 10,
        title: 'Make a Telephone',
        file: 'telephone.pdf',
        pages: [{
          page: 12,
          pdfIndex: 11,
          kind: 'story',
          text: [
            'You will need:',
            '• a very long string',
            'Step 1: Cut off a 4-foot piece of string.',
          ].join('\n'),
        }],
      }, 0),
    ];
    const [match] = matchWordsToRaz([
      { id: 'step', english: 'step', partOfSpeech: 'n' },
    ], listBooks);

    expect(match.sentence).toBe('Step 1: Cut off a 4-foot piece of string.');
  });

  it('keeps a lowercase dialogue tag with the quoted sentence', () => {
    const dialogueBooks = [
      normalizeRazBook({
        id: 'E61',
        level: 'E',
        sequence: 61,
        title: 'Again!',
        file: 'again.pdf',
        pages: [{
          page: 12,
          pdfIndex: 11,
          kind: 'story',
          text: '“ Let’s do that again!” the kids say.',
        }],
      }, 0),
    ];
    const [match] = matchWordsToRaz([
      { id: 'kids', english: 'kid(s)', partOfSpeech: 'n' },
    ], dialogueBooks);

    expect(match.sentence).toBe('“Let’s do that again!” the kids say.');
  });

  it('repairs a lowercase continuation split after punctuation inside a title', () => {
    const titleBooks = [
      normalizeRazBook({
        id: 'F44',
        level: 'F',
        sequence: 44,
        title: 'Double It!',
        file: 'double-it.pdf',
        pages: [{
          page: 3,
          pdfIndex: 2,
          kind: 'story',
          text: 'Mia found a box with\nDouble It! written on the side.',
        }],
      }, 0),
    ];
    const [match] = matchWordsToRaz([
      { id: 'side', english: 'side', partOfSpeech: 'n' },
    ], titleBooks);

    expect(match.sentence).toBe('Mia found a box with Double It! written on the side.');
  });

  it('keeps an abbreviated title and name in a dialogue tag', () => {
    const dialogueBooks = [
      normalizeRazBook({
        id: 'E33',
        level: 'E',
        sequence: 33,
        title: 'The Bread',
        file: 'bread.pdf',
        pages: [{
          page: 11,
          pdfIndex: 10,
          kind: 'story',
          text: '“Oh, no!” cried Mrs. Beaver.',
        }],
      }, 0),
    ];
    const [match] = matchWordsToRaz([
      { id: 'cry', english: 'cry', partOfSpeech: 'v' },
    ], dialogueBooks);

    expect(match.sentence).toBe('“Oh, no!” cried Mrs. Beaver.');
  });

  it('still splits a sentence after a lowercase time abbreviation', () => {
    const timeBooks = [
      normalizeRazBook({
        id: 'H01',
        level: 'H',
        sequence: 1,
        title: 'Night Work',
        file: 'night-work.pdf',
        pages: [{
          page: 3,
          pdfIndex: 2,
          kind: 'story',
          text: 'It’s 2 a.m. Time to get up.',
        }],
      }, 0),
    ];
    const [match] = matchWordsToRaz([
      { id: 'a-m', english: 'a.m.', partOfSpeech: 'adv' },
    ], timeBooks);

    expect(match.sentence).toBe('It’s 2 a.m.');
  });

  it('does not glue an unpunctuated section heading to the next sentence', () => {
    const headingBooks = [
      normalizeRazBook({
        id: 'H12',
        level: 'H',
        sequence: 12,
        title: 'Water',
        file: 'water.pdf',
        pages: [{
          page: 7,
          pdfIndex: 6,
          kind: 'story',
          text: [
            'Different Forms of Water',
            'Most of the water we see is a liquid.',
            'Liquid water takes the shape of its container.',
          ].join('\n'),
        }],
      }, 0),
    ];
    const [match] = matchWordsToRaz([
      { id: 'ket_form_n', english: 'form', partOfSpeech: 'n' },
    ], headingBooks);

    expect(match.page.page).toBe(7);
    expect(match.sentence).toBeNull();
  });
});

describe('RAZ atlas planning and manifest merge', () => {
  it('deduplicates a shared first page into one stable atlas cell', () => {
    const matches = matchWordsToRaz([
      { id: 'hand', english: 'hand', partOfSpeech: 'n' },
      { id: 'red', english: 'red', partOfSpeech: 'adj' },
    ], books);
    const plan = createRazAtlasPlan(matches);
    expect(plan.pages).toHaveLength(1);
    expect(plan.atlases).toHaveLength(1);
    expect(plan.atlases[0].entries[0]).toMatchObject({ row: 0, column: 0 });
  });

  it('adds RAZ without removing Oxford or Red Rocket media', () => {
    const words = [{ id: 'hand', english: 'hand', partOfSpeech: 'n' }];
    const matches = matchWordsToRaz(words, books);
    const plan = createRazAtlasPlan(matches);
    const merged = mergeRazMediaManifest({
      schemaVersion: 2,
      generatedAt: '',
      stats: {},
      entries: [{
        wordId: 'hand',
        relatedMedia: {
          oxford: { imagePath: '/oxford.webp' },
          redRocket: { atlasPath: '/rocket.webp' },
        },
      }],
    }, words, matches, plan, '2026-08-07T00:00:00.000Z');

    expect(merged.schemaVersion).toBe(3);
    expect(merged.entries[0].relatedMedia.oxford).toBeDefined();
    expect(merged.entries[0].relatedMedia.redRocket).toBeDefined();
    expect(merged.entries[0].relatedMedia.raz).toMatchObject({
      bookId: 'E01',
      level: 'E',
      page: 4,
      row: 0,
      column: 0,
      sentence: 'The neighbors have red hands.',
    });
  });

  it('detects when a new page shifts cells in an existing atlas manifest', () => {
    const initialWords = [
      { id: 'hand', english: 'hand', partOfSpeech: 'n' },
      { id: 'clean', english: 'clean', partOfSpeech: 'adj' },
    ];
    const initialMatches = matchWordsToRaz(initialWords, books);
    const initialPlan = createRazAtlasPlan(initialMatches);
    const initialManifest = mergeRazMediaManifest(
      { schemaVersion: 2, generatedAt: '', stats: {}, entries: [] },
      initialWords,
      initialMatches,
      initialPlan,
      '2026-08-07T00:00:00.000Z',
    );
    const nextWords = [
      ...initialWords,
      { id: 'ball', english: 'ball', partOfSpeech: 'n' },
    ];
    const nextPlan = createRazAtlasPlan(matchWordsToRaz(nextWords, books));

    expect(findRazAtlasPlanChanges(initialManifest, nextPlan)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageKey: 'E01|5',
          previous: null,
          next: { atlasPath: '/content/images/raz-atlases/atlas-000.webp', row: 0, column: 1 },
        }),
        expect.objectContaining({
          pageKey: 'E02|3',
          previous: { atlasPath: '/content/images/raz-atlases/atlas-000.webp', row: 0, column: 1 },
          next: { atlasPath: '/content/images/raz-atlases/atlas-000.webp', row: 0, column: 2 },
        }),
      ]),
    );
  });
});
