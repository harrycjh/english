import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DailyTaskSummary } from '../models/daily-task';
import { CheckInCalendarDrawer } from './CheckInCalendarDrawer';

function createTask(dateKey: string, completed: boolean): DailyTaskSummary {
  return {
    dateKey,
    newWordIds: ['word-a'],
    reviewWordIds: [],
    completedAt: completed ? `${dateKey}T09:00:00.000Z` : null,
    correctCount: completed ? 1 : 0,
    wrongCount: 0,
    totalAnswered: completed ? 1 : 0,
    answeredWordIds: completed ? ['word-a'] : [],
  };
}

/** 2026-08-03 to 08-05 signed in, 08-06 opened but unfinished. */
const tasks = [
  createTask('2026-08-03', true),
  createTask('2026-08-04', true),
  createTask('2026-08-05', true),
  createTask('2026-08-06', false),
];

function render(todayKey: string, taskList = tasks): string {
  return renderToStaticMarkup(
    <CheckInCalendarDrawer isOpen tasks={taskList} todayKey={todayKey} onClose={() => {}} />,
  );
}

describe('CheckInCalendarDrawer', () => {
  it('stays out of the way until it is opened', () => {
    const markup = renderToStaticMarkup(
      <CheckInCalendarDrawer isOpen={false} tasks={tasks} todayKey="2026-08-06" onClose={() => {}} />,
    );

    expect(markup).toBe('');
  });

  it('stamps the signed-in days and leaves the rest blank', () => {
    const markup = render('2026-08-06');

    expect(markup).toContain('data-date-key="2026-08-04"');
    expect(markup).toMatch(/data-date-key="2026-08-04"[^>]*title="2026-08-04 · 已签到"/);
    expect(markup).toMatch(/data-date-key="2026-08-06"[^>]*title="2026-08-06 · 未完成"/);
  });

  it('starts the grid on the weekday the month starts on', () => {
    // 2026-08-01 is a Saturday, so six blanks come first.
    const markup = render('2026-08-06');
    const blanks = markup.match(/check-in-calendar__blank/g) ?? [];

    expect(blanks).toHaveLength(6);
  });

  it('shows the whole month, however long it is', () => {
    const markup = render('2026-08-06');

    expect(markup).toContain('data-date-key="2026-08-31"');
    expect(markup).not.toContain('data-date-key="2026-08-32"');
    expect(markup).toContain('2026 年 8 月');
  });

  it('counts a run that has not been broken, even before today is finished', () => {
    const markup = render('2026-08-06');

    expect(markup).toContain('今天还没签到');
    expect(markup).toContain('>3<');
    expect(markup).toContain('累计签到');
  });

  it('reads today as signed in once the plan is done', () => {
    const markup = render('2026-08-06', [...tasks.slice(0, 3), createTask('2026-08-06', true)]);

    expect(markup).toContain('今天已经签到');
  });

  it('names how far off the next item is', () => {
    // Three signed-in days, and the first unlock is priced at five.
    const markup = render('2026-08-06');

    expect(markup).toContain('还差 2 天');
  });

  it('cannot page into a month that has not happened yet', () => {
    const markup = render('2026-08-06');
    const nextButton = /aria-label="下个月"[^>]*/.exec(markup)?.[0] ?? '';

    expect(nextButton).toContain('disabled');
  });
});
