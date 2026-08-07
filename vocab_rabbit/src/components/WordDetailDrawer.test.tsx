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
  // The shipped shape, not the authored one: the build strips everything the
  // drawer does not render, so a fixture carrying sense/type/cefr/sources would
  // be testing against data the component never actually sees.
  teachingChunks: [
    {
      phrase: 'give someone a hand',
      chinese: '帮助某人;搭把手',
      usageFrequency: { zipf: 4.8, selectionScore: 6.1 },
    },
    {
      phrase: 'by hand',
      chinese: '用手;手工',
      usageFrequency: { zipf: 4.5, selectionScore: 4.5 },
    },
  ],
  relatedMedia: {
    oxford: {
      imagePath: '/content/images/oxford-tree/level-1/book-1/page-4.webp',
      label: 'Level 1, Book 1, Page 4',
      level: 1,
      book: 1,
      page: 4,
      sentence: 'She held both hands up.',
      sentenceTranslation: '她举起了双手。',
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
      sentence: 'It is as big as your hand.',
      sentenceTranslation: '它和你的手一样大。',
    },
    raz: {
      atlasPath: '/content/images/raz-atlases/atlas-000.webp',
      row: 2,
      column: 0,
      label: 'Level E, E01 Hugs, Page 4',
      bookId: 'E01',
      level: 'E',
      sequence: 1,
      title: 'Hugs',
      page: 4,
      matchKind: 'exact',
      matchedTerm: 'hand',
      matchedForm: 'hand',
      sentence: 'Hands help us pick things up.',
      sentenceTranslation: '手帮助我们拿起东西。',
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
    expect(markup).not.toContain('身体部位');
    expect(markup).not.toContain('尚未开始');
    expect(markup).not.toContain('当前已启用');
    expect(markup).toContain('word-detail-chip--stars');
  });

  it('shows the current mastery Level immediately after the difficulty stars', () => {
    const markup = renderToStaticMarkup(
      <WordDetailDrawer
        isOpen
        word={word}
        record={levelFourRecord}
        selectionState={undefined}
        setting={{ ...defaultParentSetting, enableAudio: false }}
        context="review"
        onClose={() => undefined}
      />,
    );
    const metaStrip = /<div class="word-detail-drawer__meta-strip">([\s\S]*?)<\/div>/.exec(markup)?.[1] ?? '';

    expect(metaStrip).toContain('aria-label="词库难度 1 星"');
    expect(metaStrip).toContain('aria-label="学习等级 4"');
    expect(metaStrip).toContain('Lv.4');
    expect(metaStrip.indexOf('词库难度 1 星')).toBeLessThan(metaStrip.indexOf('学习等级 4'));
  });

  it('uses the review layout in selection context', () => {
    const markup = renderToStaticMarkup(
      <WordDetailDrawer
        isOpen
        word={word}
        record={undefined}
        selectionState={undefined}
        setting={{ ...defaultParentSetting, enableAudio: false }}
        localLifePhoto={{
          wordId: word.id,
          objectUrl: 'blob:hand-photo',
          caption: '小朋友伸出一只手。',
          photoId: 'hand-photo',
          match: 'primary',
          confidence: 0.96,
          importedAt: '2026-08-07T00:00:00.000Z',
        }}
        context="selection"
        onClose={() => undefined}
      />,
    );

    expect(markup).not.toContain('word-detail-drawer--selection');
    expect(markup).not.toContain('word-detail-drawer__selection-overview');
    expect(markup).not.toContain('word-detail-drawer__inline-examples');
    expect(markup).toContain('word-detail-drawer__hero');
    expect(markup).toContain('关联图片');
    expect(markup).toContain('<strong>牛津树</strong><span>Level 1</span>');
    expect(markup).toContain('<strong>红火箭</strong><span>Early Level 1</span>');
    expect(markup).toContain('<strong>RAZ</strong><span>Level E</span>');
    expect(markup).not.toContain('牛津树图');
    expect(markup).not.toContain('红火箭图');
    expect(markup).not.toContain('RAZ 图');
    expect(markup).not.toContain('Book 1, Page 4');
    expect(markup).not.toContain('My Hands, Page 4');
    expect(markup).not.toContain('E01 Hugs, Page 4');
    expect(markup).toContain(
      'She held both <mark class="word-detail-drawer__related-word">hands</mark> up.',
    );
    expect(markup).toContain(
      'It is as big as your <mark class="word-detail-drawer__related-word">hand</mark>.',
    );
    expect(markup).toContain(
      '<mark class="word-detail-drawer__related-word">Hands</mark> help us pick things up.',
    );
    expect(markup).toContain(
      '她举起了双<mark class="word-detail-drawer__related-word">手</mark>。',
    );
    expect(markup).toContain(
      '它和你的<mark class="word-detail-drawer__related-word">手</mark>一样大。',
    );
    expect(markup).toContain(
      '<mark class="word-detail-drawer__related-word">手</mark>帮助我们拿起东西。',
    );
    expect(markup).toContain('生活照片');
    expect(markup).not.toContain('小朋友伸出一只手。');
    expect(markup).toContain('This is my hand.');
    expect(markup.indexOf('<strong>牛津树</strong>')).toBeLessThan(markup.indexOf('例句'));
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

  it('renders the Red Rocket atlas cell with level-only metadata', () => {
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

    expect(markup).toContain('<strong>红火箭</strong><span>Early Level 1</span>');
    expect(markup).not.toContain('Early Level 1, My Hands, Page 4');
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
