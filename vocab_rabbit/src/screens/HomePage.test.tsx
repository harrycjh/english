import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CONTENT_VERSION } from '../config/app-meta';
import { defaultParentSetting } from '../models/parent-setting';
import type { WordRecord } from '../models/word';
import { ReviewPage } from './HomePage';

const previewWord: WordRecord = {
  id: 'ket_dad_n',
  english: 'dad',
  partOfSpeech: 'noun',
  chinese: '爸爸',
  category: '家人和朋友',
  difficulty: 1,
  imagePath: '/content/images/words/ket_dad_n.webp',
  imageApproved: true,
  oxfordRefs: [],
};

describe('ReviewPage', () => {
  it('uses the approved word image in the today preview card', () => {
    const markup = renderToStaticMarkup(
      <ReviewPage
        payload={{
          generatedAt: '',
          sourceFile: '',
          categoryCount: 1,
          wordCount: 1,
          categories: [previewWord.category],
          words: [previewWord],
        }}
        task={{
          dateKey: '2026-06-30',
          newWordIds: [previewWord.id],
          reviewWordIds: [],
          completedAt: null,
          correctCount: 0,
          wrongCount: 0,
          totalAnswered: 0,
          answeredWordIds: [],
        }}
        setting={defaultParentSetting}
        recordsById={{}}
        selectionById={{}}
        answerEvents={[]}
        masteredCount={0}
        recentTasks={[]}
        previewWords={[previewWord]}
        localLifePhotosById={{}}
        onStart={() => undefined}
        onStartDebug={() => undefined}
        onAdvanceDay={async () => undefined}
        onSelectProfile={async () => undefined}
        onSaveSelectionStates={async () => undefined}
      />,
    );

    expect(markup).toContain(
      `src="/content/images/words/ket_dad_n.webp?v=${CONTENT_VERSION}"`,
    );
    expect(markup).not.toContain('review-day-forward-button');
  });

  it('shows the dog-only next-day control, real heatmap data, and rounded-minute estimate', () => {
    const task = {
      dateKey: '2026-06-30',
      newWordIds: Array.from({ length: 15 }, (_, index) => `new-${index}`),
      reviewWordIds: Array.from({ length: 6 }, (_, index) => `review-${index}`),
      completedAt: null,
      correctCount: 0,
      wrongCount: 0,
      totalAnswered: 1,
      answeredWordIds: ['new-0'],
    };
    const markup = renderToStaticMarkup(
      <ReviewPage
        payload={{
          generatedAt: '',
          sourceFile: '',
          categoryCount: 1,
          wordCount: 1,
          categories: [previewWord.category],
          words: [previewWord],
        }}
        task={task}
        setting={{ ...defaultParentSetting, profileId: 'stinky-dog' }}
        recordsById={{}}
        selectionById={{}}
        answerEvents={[]}
        masteredCount={0}
        recentTasks={[
          {
            ...task,
            dateKey: '2026-06-29',
            newWordIds: ['new-a'],
            reviewWordIds: ['review-a'],
            totalAnswered: 2,
            correctCount: 1,
            answeredWordIds: ['new-a', 'review-a'],
          },
          task,
        ]}
        previewWords={[previewWord]}
        localLifePhotosById={{}}
        onStart={() => undefined}
        onStartDebug={() => undefined}
        onAdvanceDay={async () => undefined}
        onSelectProfile={async () => undefined}
        onSaveSelectionStates={async () => undefined}
      />,
    );

    expect(markup).toContain('class="review-day-forward-button"');
    expect(markup).toContain('调试模式');
    expect(markup).toContain('aria-label="前往下一天，2026-07-01"');
    expect(markup).toContain('5 分钟');
    expect(markup).toContain('data-date-key="2026-06-29"');
    expect(markup).toContain('data-answered="2"');
    expect(markup).toContain('data-date-key="2026-06-30"');
    expect(markup).toContain('data-answered="1"');
  });

  it('offers debug levels zero through nine without level ten', () => {
    const markup = renderToStaticMarkup(
      <ReviewPage
        payload={{
          generatedAt: '',
          sourceFile: '',
          categoryCount: 1,
          wordCount: 1,
          categories: [previewWord.category],
          words: [previewWord],
        }}
        task={{
          dateKey: '2026-06-30',
          newWordIds: [previewWord.id],
          reviewWordIds: [],
          completedAt: null,
          correctCount: 0,
          wrongCount: 0,
          totalAnswered: 0,
          answeredWordIds: [],
        }}
        setting={{ ...defaultParentSetting, profileId: 'stinky-dog' }}
        recordsById={{}}
        selectionById={{}}
        answerEvents={[]}
        masteredCount={0}
        recentTasks={[]}
        previewWords={[previewWord]}
        localLifePhotosById={{}}
        debugPickerOpen
        onStart={() => undefined}
        onStartDebug={() => undefined}
        onAdvanceDay={async () => undefined}
        onSelectProfile={async () => undefined}
        onSaveSelectionStates={async () => undefined}
      />,
    );

    expect(markup).toContain('<strong>Lv0</strong>');
    expect(markup).toContain('<strong>Lv9</strong>');
    expect(markup).not.toContain('<strong>Lv10</strong>');
  });

  it('does not offer another review round while planned words remain unanswered', () => {
    const markup = renderToStaticMarkup(
      <ReviewPage
        payload={{
          generatedAt: '',
          sourceFile: '',
          categoryCount: 1,
          wordCount: 1,
          categories: [previewWord.category],
          words: [previewWord],
        }}
        task={{
          dateKey: '2026-07-21',
          newWordIds: [previewWord.id],
          reviewWordIds: ['review-a'],
          completedAt: '2026-07-21T08:00:00.000Z',
          correctCount: 1,
          wrongCount: 0,
          totalAnswered: 1,
          answeredWordIds: [previewWord.id],
        }}
        setting={defaultParentSetting}
        recordsById={{}}
        selectionById={{}}
        answerEvents={[]}
        masteredCount={0}
        recentTasks={[]}
        previewWords={[previewWord]}
        localLifePhotosById={{}}
        onStart={() => undefined}
        onStartDebug={() => undefined}
        onAdvanceDay={async () => undefined}
        onSelectProfile={async () => undefined}
        onSaveSelectionStates={async () => undefined}
      />,
    );

    expect(markup).toContain('继续学习');
    expect(markup).not.toContain('再复习一轮');
  });
});
