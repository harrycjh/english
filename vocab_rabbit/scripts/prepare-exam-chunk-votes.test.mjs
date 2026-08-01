import { describe, expect, it } from 'vitest';
import { buildVoteEntries, excludeAcceptedVotes } from './prepare-exam-chunk-votes.mjs';

const chunk = (phrase, sources) => ({
  phrase,
  chinese: '测试',
  sense: 'test',
  type: 'fixed_expression',
  cefr: 'B1',
  sources,
});

describe('exam chunk vote preparation', () => {
  it('sends only uncertain single-source candidates to independent models', () => {
    expect(buildVoteEntries([{
      id: 'ket_after_adv_prep',
      chunks: [
        chunk('look after', ['phrase-list']),
        chunk('after all', ['oewn-2025', 'wiktionary-kaikki']),
        chunk('after you', ['wiktionary-kaikki']),
        chunk('day after day', ['wiktionary-kaikki']),
      ],
    }])).toEqual([{
      id: 'ket_after_adv_prep',
      chunks: [
        chunk('after you', ['wiktionary-kaikki']),
      ],
    }]);
  });

  it('removes candidates already accepted by an earlier OR vote', () => {
    expect(excludeAcceptedVotes([{
      id: 'ket_good_adj',
      chunks: [
        chunk('good at', ['wiktionary-kaikki']),
        chunk('good weather', ['wiktionary-kaikki']),
      ],
    }], [{
      id: 'ket_good_adj',
      chunks: [{ phrase: 'be good at' }],
    }])).toEqual([{
      id: 'ket_good_adj',
      chunks: [
        chunk('good weather', ['wiktionary-kaikki']),
      ],
    }]);
  });
});
