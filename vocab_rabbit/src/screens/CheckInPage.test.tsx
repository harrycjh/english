import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DailyTaskSummary } from '../models/daily-task';
import { CheckInPage } from './CheckInPage';

function createTask(dateKey: string, checkedIn: boolean): DailyTaskSummary {
  return {
    dateKey,
    newWordIds: ['word-a'],
    reviewWordIds: [],
    completedAt: null,
    checkedInAt: checkedIn ? `${dateKey}T09:00:00.000Z` : null,
    correctCount: 0,
    wrongCount: 0,
    totalAnswered: 0,
    answeredWordIds: [],
  };
}

describe('CheckInPage', () => {
  it('renders a full-page manual check-in action', () => {
    const markup = renderToStaticMarkup(
      <CheckInPage
        tasks={[createTask('2026-08-06', false)]}
        todayKey="2026-08-06"
        onCheckIn={async () => undefined}
        onBackHome={() => undefined}
      />,
    );

    expect(markup).toContain('class="page page--check-in"');
    expect(markup).toContain('确认签到');
    expect(markup).toContain('今天还没签到');
    expect(markup).not.toContain('VocaRabbit');
    expect(markup).not.toContain('8 月 6 日');
    expect(markup).not.toContain('new-word-queue-backdrop');
    expect(markup).toContain('接下来的奖励');
    expect(markup).toContain('第 7 天');
    expect(markup).toContain('第 14 天');
    expect(markup).toContain('aria-label="放大查看北京"');
    expect(markup).toContain('/design-reference/slices/scene-beijing.webp');
    expect(markup).not.toContain('aria-label="放大查看青草坡屋"');
    expect(markup).not.toContain('aria-label="放大查看星夜特工"');
    expect(markup).toMatch(/aria-label="全部签到奖励，可横向拖动"/);
    expect(markup.match(/data-reward-day=/g)).toHaveLength(23);
  });

  it('always renders six calendar rows so the month controls stay in place', () => {
    const markup = renderToStaticMarkup(
      <CheckInPage
        tasks={[]}
        todayKey="2026-02-01"
        onCheckIn={async () => undefined}
        onBackHome={() => undefined}
      />,
    );
    const grid = /<div class="check-in-calendar__grid">([\s\S]*?)<\/div>/.exec(markup)?.[1] ?? '';

    expect(grid.match(/class="check-in-calendar__(?:blank|day)/g)).toHaveLength(42);
  });

  it('shows the completed learning result when opened after the last word', () => {
    const markup = renderToStaticMarkup(
      <CheckInPage
        tasks={[createTask('2026-08-06', false)]}
        todayKey="2026-08-06"
        sessionResult={{ totalAnswered: 12, correctCount: 10, wrongCount: 2 }}
        onCheckIn={async () => undefined}
        onBackHome={() => undefined}
      />,
    );

    expect(markup).toContain('今日单词全部完成');
    expect(markup).toContain('答对 10');
    expect(markup).toContain('答错 2');
  });

  it('stamps only explicitly checked-in days and disables a duplicate stamp', () => {
    const markup = renderToStaticMarkup(
      <CheckInPage
        tasks={[
          createTask('2026-08-05', true),
          createTask('2026-08-06', true),
        ]}
        todayKey="2026-08-06"
        onCheckIn={async () => undefined}
        onBackHome={() => undefined}
      />,
    );

    expect(markup).toContain('今天已签到');
    expect(markup).toMatch(/data-date-key="2026-08-05"[^>]*title="2026-08-05 · 已签到"/);
    expect(markup).toMatch(/class="check-in-page__stamp-button is-checked"[^>]*disabled/);
  });

  it('keeps earned rewards on the timeline and shows total check-in progress', () => {
    const tasks = Array.from({ length: 7 }, (_, index) => (
      createTask(`2026-08-0${index + 1}`, true)
    ));
    const markup = renderToStaticMarkup(
      <CheckInPage
        tasks={tasks}
        todayKey="2026-08-07"
        onCheckIn={async () => undefined}
        onBackHome={() => undefined}
      />,
    );
    const beijing = /<button[^>]*data-reward-day="7"[\s\S]*?<\/button>/.exec(markup)?.[0] ?? '';

    expect(beijing).toContain('is-earned');
    expect(beijing).toContain('<strong>第 7 天</strong><em>已得到</em><small>北京</small>');
    expect(beijing).not.toContain('（已得到）');
    expect(markup).not.toContain('lucide-zoom-in');
    expect(markup).toContain('aria-label="签到进度：已签到7天"');
    expect(markup).toContain('>已签到7天</strong>');
    expect(markup).not.toContain('/ 161 天');
    expect(markup.match(/data-reward-day=/g)).toHaveLength(23);
  });

  it('maps eight real check-ins just beyond the first reward even when all art is unlocked', () => {
    const tasks = Array.from({ length: 8 }, (_, index) => (
      createTask(`2026-08-0${index + 1}`, true)
    ));
    const markup = renderToStaticMarkup(
      <CheckInPage
        tasks={tasks}
        todayKey="2026-08-08"
        unlockAll
        onCheckIn={async () => undefined}
        onBackHome={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="签到进度：已签到8天"');
    expect(markup).toContain('>已签到8天</strong>');
    expect(markup).not.toContain('/ 161 天');
    expect(markup).toContain('style="width:4.968944099378882%"');
  });

  it('allows the calendar to page forward from the current month', () => {
    const markup = renderToStaticMarkup(
      <CheckInPage
        tasks={[createTask('2026-08-06', false)]}
        todayKey="2026-08-06"
        onCheckIn={async () => undefined}
        onBackHome={() => undefined}
      />,
    );
    const nextButton = /aria-label="下个月"[^>]*/.exec(markup)?.[0] ?? '';

    expect(nextButton).not.toContain('disabled');
  });
});
