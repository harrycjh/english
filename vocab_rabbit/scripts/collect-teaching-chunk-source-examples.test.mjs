import { describe, expect, it } from 'vitest';
import {
  buildSourceExampleEntries,
  normalizeChunkPhrase,
  parsePhaveExamples,
  parsePhraseListExamples,
  selectSourceExample,
} from './collect-teaching-chunk-source-examples.mjs';

const chunk = {
  phrase: 'take place',
  chinese: '发生；举行',
  sense: 'happen or be held',
};

describe('teaching chunk source examples', () => {
  it('extracts the example column from PHRASE List text', () => {
    const rows = parsePhraseListExamples(`
1169   TAKE PLACE         10556   ***   ***   **    No one was sure exactly why it took place there.
1299   PICK UP            9252    ***   **    x     She dropped by to pick up her friend.
`);
    expect(rows).toEqual([
      expect.objectContaining({
        phrase: 'take place',
        sentence: 'No one was sure exactly why it took place there.',
        source: 'phrase-list',
      }),
      expect.objectContaining({ phrase: 'pick up' }),
    ]);
  });

  it('extracts sense-linked PHaVE examples', () => {
    const rows = parsePhaveExamples(`
1. GO ON

1. Happen, take place (64.5%)

           There is a debate going on right now between the two parties.

2. (+ To) Proceed to do STH after doing STH else (13%)

           Does anyone have questions before I go on to the next chapter?
`);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      phrase: 'go on',
      sentence: 'There is a debate going on right now between the two parties.',
      source: 'phave',
    });
  });

  it('prefers a short PHRASE example and rejects unsuitable content', () => {
    const selected = selectSourceExample(chunk, [
      { source: 'oewn-2025', sentence: 'The meeting will take place after school.' },
      { source: 'phrase-list', sentence: 'The war took place many years ago.' },
      { source: 'phrase-list', sentence: 'The school show took place on Friday.' },
    ]);
    expect(selected).toMatchObject({
      source: 'phrase-list',
      sentence: 'The school show took place on Friday.',
    });
  });

  it('rejects a broad dictionary example from the wrong sense', () => {
    const selected = selectSourceExample({
      phrase: 'take a bath',
      sense: 'wash your body in a bath',
    }, [{
      source: 'wiktionary-kaikki',
      sentence: 'Shareholders took a bath when the company went bankrupt.',
      sense: 'To lose a large amount of money in an investment.',
    }]);
    expect(selected).toBeNull();
  });

  it('rejects adult or unsuitable context even when its sense overlaps', () => {
    const selected = selectSourceExample({
      phrase: 'good girl',
      sense: 'used to praise a girl for behaving well',
    }, [{
      source: 'wiktionary-kaikki',
      sentence: "You're a good girl, standing by your man even when he gets you in trouble.",
      sense: 'An obedient child or someone who behaves like one.',
    }]);
    expect(selected).toBeNull();
  });

  it('rejects source sentences that introduce unnecessarily difficult vocabulary', () => {
    const selected = selectSourceExample(chunk, [{
      source: 'wiktionary-kaikki',
      sentence: 'The event took place amid extraordinary chutzpah.',
      sense: 'happen or be held',
    }], {
      tokenFrequencies: {
        the: 7,
        event: 5,
        took: 5,
        place: 6,
        amid: 4,
        extraordinary: 4,
        chutzpah: 2.32,
      },
    });
    expect(selected).toBeNull();
  });

  it('rejects multi-speaker dialogue fragments', () => {
    const selected = selectSourceExample({ phrase: 'thank you', sense: 'express gratitude' }, [{
      source: 'wiktionary-kaikki',
      sentence: '—May I help you? —Yes, thank you.',
      sense: 'express gratitude',
    }]);
    expect(selected).toBeNull();
  });

  it('records explicit missing rows for later Qwen fallback', () => {
    const entries = buildSourceExampleEntries([{
      id: 'ket_take_v',
      teachingChunks: [chunk],
    }], new Map([[normalizeChunkPhrase(chunk.phrase), []]]));
    expect(entries).toEqual([{
      id: 'ket_take_v',
      examples: [{ phrase: 'take place', status: 'missing', candidateCount: 0 }],
    }]);
  });
});
