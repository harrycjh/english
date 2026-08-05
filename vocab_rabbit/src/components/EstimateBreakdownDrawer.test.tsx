import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AnswerEvent } from '../models/answer-event';
import { EstimateBreakdownDrawer } from './EstimateBreakdownDrawer';

/** One study day where every word sat at `level` when it was first asked. */
function levelDay(
  dateKey: string,
  level: number,
  wordIds: string[],
  gapSeconds: number,
  startSeconds = 0,
): AnswerEvent[] {
  return wordIds.map((wordId, index) => {
    const total = (10 * 3600) + startSeconds + (index * gapSeconds);
    const clock = [
      Math.floor(total / 3600),
      Math.floor((total % 3600) / 60),
      total % 60,
    ].map((part) => String(part).padStart(2, '0')).join(':');
    return {
      id: `${dateKey}-${level}-${wordId}`,
      wordId,
      dateKey,
      answeredAt: `${dateKey}T${clock}.000Z`,
      questionKind: 'text-choice' as const,
      selectedAnswer: '',
      correctAnswer: '',
      isCorrect: true,
      responseTimeMs: 8_000,
      learningStateBefore: {
        wordId,
        masteryLevel: level,
        reviewStage: level,
        correctStreak: 0,
        wrongCount: 0,
        lastStudiedAt: null,
        nextDueAt: null,
      },
    };
  });
}

const history = [
  ...levelDay('2026-08-01', 0, Array.from({ length: 10 }, (_, i) => `new-${i}`), 40),
  ...levelDay('2026-08-01', 9, Array.from({ length: 10 }, (_, i) => `old-${i}`), 10, 3_600),
];

describe('EstimateBreakdownDrawer', () => {
  it('renders nothing while closed', () => {
    const markup = renderToStaticMarkup(
      <EstimateBreakdownDrawer
        isOpen={false}
        wordLevels={[0, 9]}
        answerEvents={history}
        onClose={() => undefined}
      />,
    );

    expect(markup).toBe('');
  });

  it('shows the multiplication for each level, not just the answer', () => {
    const markup = renderToStaticMarkup(
      <EstimateBreakdownDrawer
        isOpen
        wordLevels={[0, 0, 0, 9, 9]}
        answerEvents={history}
        onClose={() => undefined}
      />,
    );

    // Lv0 measured 31.8s a word, Lv9 only 13.8s — the point of the drawer.
    expect(markup).toContain('3 个 × 31.8 秒');
    expect(markup).toContain('2 个 × 13.8 秒');
    expect(markup).toContain('合计 5 个词');
    // 3 x 31750 + 2 x 13750 = 122750ms, shown at the top and again as the total.
    expect(markup).toContain('<strong class="estimate-breakdown__headline">2 分钟</strong>');
    expect(markup.match(/2 分钟/g)?.length).toBe(3);
  });

  it('skips the total when there is only one level to add up', () => {
    const markup = renderToStaticMarkup(
      <EstimateBreakdownDrawer
        isOpen
        wordLevels={[0, 0, 0]}
        answerEvents={history}
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain('3 个 × 31.8 秒');
    expect(markup).not.toContain('合计');
  });

  it('says which levels it had to guess at', () => {
    const markup = renderToStaticMarkup(
      <EstimateBreakdownDrawer
        isOpen
        wordLevels={[4]}
        answerEvents={history}
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain('（无近期记录，按整体速度）');
    expect(markup).toContain('最近没练到');
  });

  it('lists every level so a fast one can be compared with a slow one', () => {
    const markup = renderToStaticMarkup(
      <EstimateBreakdownDrawer
        isOpen
        wordLevels={[0]}
        answerEvents={history}
        onClose={() => undefined}
      />,
    );

    expect(markup.match(/mastery-level-icon mastery-level-icon--level-/g)?.length).toBe(12);
    expect(markup).toContain('最近 7 天一共有 20 个词可以计时');
  });

  it('does not pretend to know a pace with no history', () => {
    const markup = renderToStaticMarkup(
      <EstimateBreakdownDrawer
        isOpen
        wordLevels={[0, 3]}
        answerEvents={[]}
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain('最近还没有可以计时的记录');
    expect(markup).toContain('1 个 × 20.0 秒');
  });

  it('has nothing to break down once the day is answered', () => {
    const markup = renderToStaticMarkup(
      <EstimateBreakdownDrawer
        isOpen
        wordLevels={[]}
        answerEvents={history}
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain('今天的词已经全部答完了。');
    expect(markup).not.toContain('合计');
  });
});
