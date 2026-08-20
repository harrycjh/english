import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CONTENT_VERSION } from '../config/app-meta';
import { defaultParentSetting } from '../models/parent-setting';
import type { WordRecord } from '../models/word';
import { ReviewPage } from './HomePage';
import { BACKPACK_ITEMS } from '../services/backpack';

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
    const previewWordWithMedia: WordRecord = {
      ...previewWord,
      relatedMedia: {
        redRocket: {
          atlasPath: '/content/images/red-rocket-atlases/atlas-001.webp',
          row: 0,
          column: 0,
          label: 'Early Level 1, Dad, Page 3',
          level: 'Early Level 1',
          title: 'Dad',
          page: 3,
          matchKind: 'exact',
          matchedTerm: 'dad',
          confidence: 1,
        },
        oxford: {
          imagePath: '/content/images/oxford-tree/level-1/book-1/page-1.webp',
          label: 'Level 1, Book 1, Page 1',
          level: 1,
          book: 1,
          page: 1,
        },
      },
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
        task={{
          dateKey: '2026-06-30',
          newWordIds: [previewWord.id],
          reviewWordIds: [],
          completedAt: null,
          correctCount: 6,
          wrongCount: 1,
          totalAnswered: 7,
          answeredWordIds: [previewWord.id],
        }}
        setting={defaultParentSetting}
        recordsById={{}}
        selectionById={{}}
        answerEvents={[]}
        masteredCount={0}
        recentTasks={[]}
        previewWords={[previewWordWithMedia]}
        localLifePhotosById={{
          [previewWord.id]: {
            wordId: previewWord.id,
            objectUrl: 'blob:dad-life-photo',
            caption: 'Dad',
            photoId: 'dad-photo',
            match: 'primary',
            confidence: 1,
            importedAt: '2026-08-07T00:00:00.000Z',
          },
        }}
        onStart={() => undefined}
        onStartDebug={() => undefined}
        onAdvanceDay={async () => undefined}
        onSelectProfile={async () => undefined}
        onSaveSelectionStates={async () => undefined}
        onOpenStats={() => undefined}
      />,
    );

    expect(markup).toContain(
      `src="/content/images/words/ket_dad_n.webp?v=${CONTENT_VERSION}"`,
    );
    expect(markup).toContain('draggable="false"');
    expect(markup).toContain('class="review-preview-card__headline" data-auto-fit="true"');
    expect(markup).toContain('aria-label="红火箭：有例图"');
    expect(markup).toContain('aria-label="牛津树：有例图"');
    expect(markup).toContain('aria-label="生活照片：有例图"');
    expect(markup).not.toContain('aria-label="RAZ：');
    expect(markup).toContain('review-preview-card__source-tag--green');
    expect(markup).toContain('review-preview-card__source-tag--red');
    expect(markup).toContain('review-preview-card__source-tag--blue');
    expect(markup).toMatch(/>OXF<\/span>.*>RED<\/span>.*>LIF<\/span>/);
    expect(markup).not.toContain('review-day-forward-button');
    expect(markup).toContain('review-metric-card review-metric-card--task is-actionable');
    expect(markup).toContain('review-advice-card review-advice-card--bars is-actionable');
    expect(markup).toContain('review-advice-card review-advice-card--bag is-actionable');
    expect(markup).toContain('review-advice-card review-advice-card--accuracy is-actionable');
    expect(markup).toContain('今日胜率');
    expect(markup).toContain('86%');
    expect(markup).toContain('lucide-rabbit');
    // Every advice card now opens something, so all four carry the chevron.
    expect(markup).toContain('review-advice-card review-advice-card--tea is-actionable');
    expect(markup).toContain('lucide-calendar-days');
    expect(markup).not.toContain('review-advice-card__art');
    // The heatmap opens nothing, so it must not advertise a tap — and without
    // the chevron its picture gets the whole card to sit in.
    expect(markup).toMatch(/class="review-metric-card review-metric-card--heatmap"/);
    expect(markup).not.toMatch(/review-metric-card--heatmap[^"]*is-actionable/);
    expect(markup).toContain('今日复习');
    expect(markup).toContain('计划 0 · 已完成 0');
    expect(markup).not.toContain('预览主题');
  });

  it('renders additional preview words on horizontally swipeable pages', () => {
    const previewWords = Array.from({ length: 5 }, (_, index) => ({
      ...previewWord,
      id: `preview-${index + 1}`,
      english: `word-${index + 1}`,
    }));
    const markup = renderToStaticMarkup(
      <ReviewPage
        payload={{
          generatedAt: '',
          sourceFile: '',
          categoryCount: 1,
          wordCount: previewWords.length,
          categories: [previewWord.category],
          words: previewWords,
        }}
        task={{
          dateKey: '2026-08-17',
          newWordIds: previewWords.map((word) => word.id),
          reviewWordIds: [],
          completedAt: null,
          checkedInAt: null,
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
        previewWords={previewWords}
        localLifePhotosById={{}}
        onStart={() => undefined}
        onStartDebug={() => undefined}
        onAdvanceDay={async () => undefined}
        onSelectProfile={async () => undefined}
        onSaveSelectionStates={async () => undefined}
      />,
    );

    expect(markup).toContain('class="review-preview-carousel has-overflow"');
    expect(markup).toContain('aria-label="今日预览，可左右滑动，共 5 个词"');
    expect(markup).toContain('data-preview-page="1"');
    expect(markup).toContain('data-preview-page="2"');
    expect(markup.match(/class="review-preview-card /g)).toHaveLength(5);
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
    // 20 words still to answer at the 20s prior is 6.7 minutes, rounded to 7.
    expect(markup).toContain('7 分钟');
    expect(markup).toContain('data-date-key="2026-06-29"');
    expect(markup).toContain('data-answered="2"');
    expect(markup).toContain('data-date-key="2026-06-30"');
    expect(markup).toContain('data-answered="1"');
  });

  it('estimates the session from the child measured pace instead of a fixed guess', () => {
    const task = {
      dateKey: '2026-06-30',
      newWordIds: Array.from({ length: 15 }, (_, index) => `new-${index}`),
      reviewWordIds: Array.from({ length: 6 }, (_, index) => `review-${index}`),
      completedAt: null,
      correctCount: 0,
      wrongCount: 0,
      totalAnswered: 0,
      answeredWordIds: [],
    };
    // 40 answers a steady 30s apart, so the measured pace is far above the prior.
    const answerEvents = Array.from({ length: 40 }, (_, index) => {
      const seconds = index * 30;
      const clock = [
        String(9 + Math.floor(seconds / 3600)).padStart(2, '0'),
        String(Math.floor((seconds % 3600) / 60)).padStart(2, '0'),
        String(seconds % 60).padStart(2, '0'),
      ].join(':');
      return {
        id: `event-${index}`,
        wordId: `word-${index}`,
        dateKey: '2026-06-29',
        answeredAt: `2026-06-29T${clock}.000Z`,
        questionKind: 'text-choice' as const,
        selectedAnswer: '',
        correctAnswer: '',
        isCorrect: true,
        responseTimeMs: 30_000,
      };
    });

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
        setting={defaultParentSetting}
        recordsById={{}}
        selectionById={{}}
        answerEvents={answerEvents}
        masteredCount={0}
        recentTasks={[task]}
        previewWords={[previewWord]}
        localLifePhotosById={{}}
        onStart={() => undefined}
        onStartDebug={() => undefined}
        onAdvanceDay={async () => undefined}
        onSelectProfile={async () => undefined}
        onSaveSelectionStates={async () => undefined}
      />,
    );

    // 21 words at the blended ~26.7s pace, not the 5 minutes the flat guess gives.
    expect(markup).toContain('9 分钟');
    expect(markup).not.toContain('5 分钟');
  });

  it('counts the estimate down to the words the child has not answered yet', () => {
    const plannedIds = Array.from({ length: 20 }, (_, index) => `new-${index}`);
    const renderWith = (answeredWordIds: string[]) => renderToStaticMarkup(
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
          newWordIds: plannedIds,
          reviewWordIds: [],
          completedAt: null,
          correctCount: answeredWordIds.length,
          wrongCount: 0,
          totalAnswered: answeredWordIds.length,
          answeredWordIds,
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

    // Untouched: all 20 words at the 20s prior is 6.7 minutes.
    expect(renderWith([])).toContain('7 分钟');

    // Twelve done: only the remaining 8 words count, which is 2.7 minutes.
    const midway = renderWith(plannedIds.slice(0, 12));
    expect(midway).toContain('3 分钟');
    expect(midway).not.toContain('7 分钟');
    expect(midway).toContain('继续就能接上刚才节奏');

    // Nothing left to do, so the card must not still promise work — and must
    // not read `0 分钟`, which looks like a broken measurement.
    const finished = renderWith(plannedIds);
    expect(finished).toContain('已完成');
    expect(finished).not.toContain('0 分钟');
    expect(finished).toContain('今天的任务已经完成');
  });

  it('reports what the day took once it is finished, and stays tappable', () => {
    const plannedIds = ['w-0', 'w-1', 'w-2'];
    const answeredAt = (seconds: number) => {
      const total = (10 * 3600) + seconds;
      const clock = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60]
        .map((part) => String(part).padStart(2, '0')).join(':');
      return `2026-06-30T${clock}.000Z`;
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
        task={{
          dateKey: '2026-06-30',
          newWordIds: plannedIds,
          reviewWordIds: [],
          completedAt: '2026-06-30T10:05:00.000Z',
          correctCount: 3,
          wrongCount: 0,
          totalAnswered: 3,
          answeredWordIds: plannedIds,
        }}
        setting={defaultParentSetting}
        recordsById={{}}
        selectionById={{}}
        answerEvents={plannedIds.map((wordId, index) => ({
          id: `e-${index}`,
          wordId,
          dateKey: '2026-06-30',
          answeredAt: answeredAt(index * 45),
          questionKind: 'text-choice' as const,
          selectedAnswer: '',
          correctAnswer: '',
          isCorrect: true,
          responseTimeMs: 12_000,
        }))}
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

    // 12s think time on the first question, then two 45s gaps: 102s, shown as 2 分钟.
    expect(markup).toContain('已完成');
    expect(markup).toContain('今天用了 2 分钟');
    // Still a button, so the pace breakdown stays reachable after the last word.
    expect(markup).toContain('review-metric-card review-metric-card--time is-actionable');
  });

  it('offers fixed debug levels zero through nine plus the full progression', () => {
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
    expect(markup).toContain('<strong>Lv0 到 Lv10</strong>');
    expect(markup).toContain('完整升级流程');
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

  it('gives the debug profile the whole backpack so new art can be seen the day it lands', () => {
    const renderFor = (profileId: 'cute-junjun' | 'stinky-dog') => renderToStaticMarkup(
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
          reviewWordIds: [],
          completedAt: null,
          correctCount: 0,
          wrongCount: 0,
          totalAnswered: 0,
          answeredWordIds: [],
        }}
        setting={{ ...defaultParentSetting, profileId }}
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

    const total = BACKPACK_ITEMS.length;
    expect(renderFor('stinky-dog')).toContain(`${total} / ${total} 件道具`);
    // Nobody else gets a shortcut: one day of study buys the free items only.
    const earned = BACKPACK_ITEMS.filter((item) => item.requiredDays === 0).length;
    expect(earned).toBeLessThan(total);
    expect(renderFor('cute-junjun')).toContain(`${earned} / ${total} 件道具`);
  });

  it('spans the summary pill body across the whole pill so its text shares the icon midline', () => {
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
          dateKey: '2026-07-22',
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

    const bodies = [...markup.matchAll(/<span class="review-summary-pill__body" style="([^"]*)"/g)].map(
      (match) => match[1],
    );

    expect(bodies).toHaveLength(3);
    for (const style of bodies) {
      expect(style).toContain('top:0');
      expect(style).toContain('height:100%');
      // The authored 42px textSafe box must no longer drive the vertical placement.
      expect(style).not.toContain('height:42px');
      expect(style).not.toContain('top:12px');
    }
  });

  it('anchors the advice icon and text where the layout authors them', () => {
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
          dateKey: '2026-07-23',
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

    const icons = [...markup.matchAll(/<span class="review-advice-card__icon"[^>]*style="([^"]*)"/g)]
      .map((match) => match[1]);
    const bodies = [...markup.matchAll(/<div class="review-advice-card__body" style="([^"]*)"/g)]
      .map((match) => match[1]);

    expect(icons).toHaveLength(4);
    expect(bodies).toHaveLength(4);

    for (const style of icons) {
      // All three icons are authored at the same 14px card inset.
      expect(style).toContain('left:14px');
      expect(style).toContain('width:44px');
      expect(style).toContain('height:44px');
      expect(style).toContain('top:50%');
      expect(style).toContain('translateY(-50%)');
    }

    // The text starts clear of the icon and keeps the authored right edge, so
    // the longest headline stays on one line instead of overflowing the card.
    expect(bodies.map((style) => /left:([\d.]+)px/.exec(style)?.[1])).toEqual(['72', '72', '72', '72']);
    expect(bodies.map((style) => /width:([\d.]+)px/.exec(style)?.[1])).toEqual(['163.25', '163.25', '163.25', '163.25']);
    for (const style of bodies) {
      expect(style).toContain('top:50%');
      expect(style).toContain('translateY(-50%)');
      // The old placement came from the narrower textSafe box.
      expect(style).not.toContain('left:54px');
    }

    // 今日签到 and 背包 both open a drawer, so they earn the chevron; 未来压力
    // is only given a handler by the real app, so here it stays plain.
    expect(markup).toMatch(/review-advice-card--tea is-actionable/);
    expect(markup).toMatch(/review-advice-card--bag is-actionable/);
    expect(markup).not.toMatch(/review-advice-card--bars is-actionable/);
    expect(markup).toContain('lucide-dog');
    expect(markup).toContain('>--</strong>');
  });
});
