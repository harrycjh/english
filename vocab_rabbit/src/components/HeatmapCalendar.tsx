import type { DailyTaskSummary } from '../models/daily-task';
import { createStudyDateKey } from '../services/study-day';

interface HeatmapCalendarProps {
  tasks: DailyTaskSummary[];
  endDateKey?: string;
}

export interface HeatmapDay {
  dateKey: string;
  task?: DailyTaskSummary;
  answered: number;
  correct: number;
  intensity: 0 | 1 | 2 | 3;
  weekdayLabel: string;
}

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const;

function buildRecentDates(endDateKey: string, length: number): string[] {
  const dates: string[] = [];
  const endDate = new Date(`${endDateKey}T12:00:00.000Z`);
  for (let offset = length - 1; offset >= 0; offset -= 1) {
    const current = new Date(endDate);
    current.setUTCDate(endDate.getUTCDate() - offset);
    dates.push(current.toISOString().slice(0, 10));
  }
  return dates;
}

export function buildHeatmapDays(
  tasks: DailyTaskSummary[],
  endDateKey: string,
  length = 14,
): HeatmapDay[] {
  const taskMap = new Map(tasks.map((task) => [task.dateKey, task]));
  const recentDates = buildRecentDates(endDateKey, length);
  const maxAnswered = Math.max(0, ...recentDates.map((dateKey) => taskMap.get(dateKey)?.totalAnswered ?? 0));

  return recentDates.map((dateKey) => {
    const task = taskMap.get(dateKey);
    const answered = task?.totalAnswered ?? 0;
    const ratio = maxAnswered > 0 ? answered / maxAnswered : 0;
    const intensity: HeatmapDay['intensity'] = answered === 0 ? 0 : ratio <= 1 / 3 ? 1 : ratio <= 2 / 3 ? 2 : 3;
    const weekday = new Date(`${dateKey}T12:00:00.000Z`).getUTCDay();
    return {
      dateKey,
      task,
      answered,
      correct: task?.correctCount ?? 0,
      intensity,
      weekdayLabel: WEEKDAY_LABELS[weekday],
    };
  });
}

export function HeatmapCalendar({ tasks, endDateKey = createStudyDateKey() }: HeatmapCalendarProps) {
  const days = buildHeatmapDays(tasks, endDateKey);

  return (
    <div className="heatmap" aria-label="学习热力图">
      {days.map((day) => {
        return (
          <span
            key={day.dateKey}
            className={`heatmap__cell heatmap__cell--${day.intensity}`}
            data-date-key={day.dateKey}
            data-answered={day.answered}
            title={`${day.dateKey}${day.answered > 0 ? ` · 已答 ${day.answered} 题 · 正确 ${day.correct} 题` : ' · 未学习'}`}
          />
        );
      })}
    </div>
  );
}
