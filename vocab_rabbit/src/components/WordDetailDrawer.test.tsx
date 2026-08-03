import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AnswerEvent } from '../models/answer-event';
import type { LearningRecord } from '../models/learning-record';
import { defaultParentSetting } from '../models/parent-setting';
import type { WordRecord } from '../models/word';
import { WordDetailDrawer } from './WordDetailDrawer';

const word: WordRecord = {
  id: 'ket_hand_n',
  english: 'hand',
  partOfSpeech: 'n',
  chinese: '手',
  category: '身体部位',
  difficulty: 1,
  imagePath: '/content/images/words/ket_hand_n.webp',
  imageApproved: true,
  oxfordRefs: [],
  examples: ['This is my hand.'],
  teachingChunks: [
    {
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
      },
    },
    {
      phrase: 'by hand',
      chinese: '用手;手工',
      sense: 'made or done manually',
      type: 'fixed_expression',
      cefr: 'A2',
      sources: ['oewn-2025'],
      usageFrequency: {
        zipf: 4.5,
        selectionScore: 4.5,
        source: 'wordfreq-estimate',
      },
    },
  ],
  relatedMedia: {
    oxford: {
      imagePath: '/content/images/oxford-tree/level-1/book-1/page-4.webp',
      label: 'Level 1, Book 1, Page 4',
      level: 1,
      book: 1,
      page: 4,
    },
    redRocket: {
      atlasPath: '/content/images/red-rocket-atlases/atlas-001.webp',
      row: 1,
      column: 2,
      label: 'Early Level 1, My Hands, Page 4',
      level: 'Early Level 1',
      title: 'My Hands',
      page: 4,
      matchKind: 'exact',
      matchedTerm: 'hand',
      confidence: 0.94,
    },
  },
};

const levelFourRecord: LearningRecord = {
  wordId: word.id,
  masteryLevel: 4,
  reviewStage: 4,
  correctStreak: 0,
  wrongCount: 3,
  lastStudiedAt: '2026-07-22T08:02:00.000Z',
  nextDueAt: '2026-07-21T20:00:00.000Z',
};

const levelHistoryEvents: AnswerEvent[] = [
  {
    id: 'correct-level-five',
    wordId: word.id,
    dateKey: '2026-07-21',
    answeredAt: '2026-07-21T08:00:00.000Z',
    questionKind: 'text-choice',
    selectedAnswer: '手',
    correctAnswer: '手',
    isCorrect: true,
    responseTimeMs: 900,
    learningStateBefore: { ...levelFourRecord, masteryLevel: 4, reviewStage: 4 },
    learningStateAfter: { ...levelFourRecord, masteryLevel: 5, reviewStage: 5 },
  },
  {
    id: 'downgrade-level-four',
    wordId: word.id,
    dateKey: '2026-07-22',
    answeredAt: '2026-07-22T08:02:00.000Z',
    questionKind: 'fill-blank',
    selectedAnswer: 'hend',
    correctAnswer: 'hand',
    isCorrect: false,
    responseTimeMs: 1200,
    levelDowngrade: true,
    learningStateBefore: { ...levelFourRecord, masteryLevel: 5, reviewStage: 5 },
    learningStateAfter: levelFourRecord,
  },
];

describe('WordDetailDrawer', () => {
  it('uses the right-side companion layer when opened from a queue', () => {
    const markup = renderToStaticMarkup(
      <WordDetailDrawer
        isOpen
        word={word}
        record={undefined}
        selectionState={undefined}
        setting={{ ...defaultParentSetting, enableAudio: false }}
        context="review"
        queueCompanion
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain('word-detail-drawer-backdrop--queue-companion');
  });

  it('uses the existing compact layout in review context', () => {
    const markup = renderToStaticMarkup(
      <WordDetailDrawer
        isOpen
        word={word}
        record={undefined}
        selectionState={undefined}
        setting={{ ...defaultParentSetting, enableAudio: false }}
        context="review"
        onClose={() => undefined}
      />,
    );

    expect(markup).not.toContain('word-detail-drawer--selection');
    expect(markup).not.toContain('word-detail-drawer__selection-overview');
  });

  it('uses the review layout in selection context', () => {
    const markup = renderToStaticMarkup(
      <WordDetailDrawer
        isOpen
        word={word}
        record={undefined}
        selectionState={undefined}
        setting={{ ...defaultParentSetting, enableAudio: false }}
        context="selection"
        onClose={() => undefined}
      />,
    );

    expect(markup).not.toContain('word-detail-drawer--selection');
    expect(markup).not.toContain('word-detail-drawer__selection-overview');
    expect(markup).not.toContain('word-detail-drawer__inline-examples');
    expect(markup).toContain('word-detail-drawer__hero');
    expect(markup).toContain('关联图片');
    expect(markup).toContain('牛津树图');
    expect(markup).toContain('红火箭图');
    expect(markup).toContain('This is my hand.');
    expect(markup.indexOf('牛津树图')).toBeLessThan(markup.indexOf('例句'));
  });

  it('renders translated teaching chunks before related media', () => {
    const markup = renderToStaticMarkup(
      <WordDetailDrawer
        isOpen
        word={word}
        record={undefined}
        selectionState={undefined}
        setting={{ ...defaultParentSetting, enableAudio: false }}
        context="review"
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain('高频固定搭配');
    expect(markup).toContain('2 条');
    expect(markup).toContain('give someone a hand');
    expect(markup).toContain('帮助某人；搭把手');
    expect(markup).toContain('by hand');
    expect(markup).toContain('用手；手工');
    expect(markup.indexOf('高频固定搭配')).toBeLessThan(markup.indexOf('关联图片'));
  });

  it('shows only the three highest-frequency chunks until the player expands the list', () => {
    const baseChunk = word.teachingChunks![0];
    const rankedWord: WordRecord = {
      ...word,
      teachingChunks: [
        ['fourth phrase', 4],
        ['highest phrase', 10],
        ['fifth phrase', 2],
        ['second phrase', 8],
        ['third phrase', 6],
      ].map(([phrase, selectionScore]) => ({
        ...baseChunk,
        phrase: String(phrase),
        chinese: `${phrase}译文`,
        usageFrequency: {
          ...baseChunk.usageFrequency,
          selectionScore: Number(selectionScore),
        },
      })),
    };
    const markup = renderToStaticMarkup(
      <WordDetailDrawer
        isOpen
        word={rankedWord}
        record={undefined}
        selectionState={undefined}
        setting={{ ...defaultParentSetting, enableAudio: false }}
        context="review"
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain('5 条');
    expect(markup).toContain('highest phrase');
    expect(markup).toContain('second phrase');
    expect(markup).toContain('third phrase');
    expect(markup).not.toContain('fourth phrase');
    expect(markup).not.toContain('fifth phrase');
    expect(markup).toContain('展开其余 2 条');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup.indexOf('highest phrase')).toBeLessThan(markup.indexOf('second phrase'));
    expect(markup.indexOf('second phrase')).toBeLessThan(markup.indexOf('third phrase'));
  });

  it('does not render an empty teaching-chunk panel', () => {
    const markup = renderToStaticMarkup(
      <WordDetailDrawer
        isOpen
        word={{ ...word, teachingChunks: [] }}
        record={undefined}
        selectionState={undefined}
        setting={{ ...defaultParentSetting, enableAudio: false }}
        context="review"
        onClose={() => undefined}
      />,
    );

    expect(markup).not.toContain('高频固定搭配');
  });

  it('renders the Red Rocket atlas cell and source location', () => {
    const markup = renderToStaticMarkup(
      <WordDetailDrawer
        isOpen
        word={word}
        record={undefined}
        selectionState={undefined}
        setting={{ ...defaultParentSetting, enableAudio: false }}
        context="review"
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain('红火箭图');
    expect(markup).toContain('Early Level 1, My Hands, Page 4');
    expect(markup).toContain('background-size:300% 300%');
    expect(markup).toContain('background-position:100% 50%');
    expect(markup).toContain('red-rocket-atlases/atlas-001.webp');
  });

  it('renders a visually corrected standalone Red Rocket page instead of the old atlas cell', () => {
    const correctedWord = {
      ...word,
      relatedMedia: {
        ...word.relatedMedia,
        redRocket: {
          ...word.relatedMedia!.redRocket!,
          imagePath: '/content/images/red-rocket-pages/corrected.webp',
        },
      },
    };
    const markup = renderToStaticMarkup(
      <WordDetailDrawer
        isOpen
        word={correctedWord}
        record={undefined}
        selectionState={undefined}
        setting={{ ...defaultParentSetting, enableAudio: false }}
        context="review"
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain('red-rocket-pages/corrected.webp');
    expect(markup).not.toContain('red-rocket-atlases/atlas-001.webp');
  });

  it('renders the word mastery-level history and marks downgrade points', () => {
    const markup = renderToStaticMarkup(
      <WordDetailDrawer
        isOpen
        word={word}
        record={levelFourRecord}
        selectionState={undefined}
        answerEvents={levelHistoryEvents}
        setting={{ ...defaultParentSetting, enableAudio: false }}
        context="review"
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain('等级变化');
    expect(markup).toContain('该单词的学习等级变化历史');
    expect(markup).toContain('word-detail-drawer__level-line');
    expect(markup).toContain('is-downgrade');
    expect(markup).toContain('等级 4');
  });
});
