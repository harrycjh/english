import { describe, expect, it } from 'vitest';
import type { DailyTaskSummary } from '../models/daily-task';
import type { WordPayload, WordRecord } from '../models/word';
import { buildReviewPreviewWords } from './review-preview-service';

function word(id: string, media: WordRecord['relatedMedia'] = {}, hasLifePhoto = false): WordRecord {
  return {
    id,
    english: id,
    partOfSpeech: 'noun',
    chinese: id,
    category: '测试',
    difficulty: 1,
    imagePath: `/words/${id}.webp`,
    imageApproved: true,
    hasLifePhoto,
    oxfordRefs: [],
    relatedMedia: media,
  };
}

function payload(words: WordRecord[]): WordPayload {
  return {
    generatedAt: '',
    sourceFile: '',
    categoryCount: 1,
    wordCount: words.length,
    categories: ['测试'],
    words,
  };
}

function task(newWordIds: string[], reviewWordIds: string[]): DailyTaskSummary {
  return {
    dateKey: '2026-08-17',
    newWordIds,
    reviewWordIds,
    completedAt: null,
    checkedInAt: null,
    correctCount: 0,
    wrongCount: 0,
    totalAnswered: 0,
    answeredWordIds: [],
  };
}

describe('review preview ordering', () => {
  it('keeps new words first and ranks each group by weighted source-tag count', () => {
    const words = [
      word('new-oxford', { oxford: { label: '', level: 1, book: 1, page: 1 } }),
      word('new-local-photo'),
      word('new-three-tags', {
        oxford: { label: '', level: 1, book: 1, page: 1 },
        redRocket: {
          atlasPath: '', row: 0, column: 0, label: '', level: '', title: '', page: 1,
          matchKind: 'exact', matchedTerm: '', confidence: 1,
        },
        raz: {
          atlasPath: '', row: 0, column: 0, label: '', bookId: '', level: '', sequence: 1,
          title: '', page: 1, matchKind: 'exact', matchedTerm: '', matchedForm: '',
        },
      }),
      word('review-all-tags', {
        oxford: { label: '', level: 1, book: 1, page: 1 },
        redRocket: {
          atlasPath: '', row: 0, column: 0, label: '', level: '', title: '', page: 1,
          matchKind: 'exact', matchedTerm: '', confidence: 1,
        },
        raz: {
          atlasPath: '', row: 0, column: 0, label: '', bookId: '', level: '', sequence: 1,
          title: '', page: 1, matchKind: 'exact', matchedTerm: '', matchedForm: '',
        },
      }, true),
    ];

    const result = buildReviewPreviewWords(
      payload(words),
      task(['new-oxford', 'new-local-photo', 'new-three-tags'], ['review-all-tags']),
      new Set(['new-local-photo']),
    );

    expect(result.map((item) => item.id)).toEqual([
      'new-three-tags',
      'new-local-photo',
      'new-oxford',
      'review-all-tags',
    ]);
  });

  it('preserves the daily-plan order when tag scores are equal', () => {
    const words = [word('first', {}, true), word('second', {}, true)];
    const result = buildReviewPreviewWords(payload(words), task(['first', 'second'], []));
    expect(result.map((item) => item.id)).toEqual(['first', 'second']);
  });
});
