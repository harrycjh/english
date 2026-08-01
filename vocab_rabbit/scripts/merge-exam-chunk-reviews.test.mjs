import { describe, expect, it } from 'vitest';
import { mergeReviewEntries } from './merge-exam-chunk-reviews.mjs';

describe('merge exam chunk review partitions', () => {
  it('combines and sorts disjoint partitions', () => {
    expect(mergeReviewEntries([
      { entries: [{ id: 'word-b', chunks: [] }] },
      { entries: [{ id: 'word-a', chunks: [{ phrase: 'a phrase' }] }] },
    ])).toEqual([
      { id: 'word-a', chunks: [{ phrase: 'a phrase' }] },
      { id: 'word-b', chunks: [] },
    ]);
  });

  it('rejects overlapping partitions', () => {
    expect(() => mergeReviewEntries([
      { entries: [{ id: 'word-a', chunks: [] }] },
      { entries: [{ id: 'word-a', chunks: [] }] },
    ])).toThrow('Duplicate review entry: word-a');
  });
});
