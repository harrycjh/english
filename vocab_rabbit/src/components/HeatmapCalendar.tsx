import type { DailyTaskSummary } from '../models/daily-task';

interface HeatmapCalendarProps {
  tasks: DailyTaskSummary[];
}

function buildRecentDates(length: number): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let offset = length - 1; offset >= 0; offset -= 1) {
    const current = new Date(today);
    current.setDate(today.getDate() - offset);
    dates.push(current.toISOString().slice(0, 10));
  }
  return dates;
}

export function HeatmapCalendar({ tasks }: HeatmapCalendarProps) {
  const taskMap = new Map(tasks.map((task) => [task.dateKey, task]));
  const recentDates = buildRecentDates(14);

  return (
    <div className="heatmap" aria-label="最近 14 天学习热力图">
      {recentDates.map((dateKey) => {
        const task = taskMap.get(dateKey);
        const intensity = task?.completedAt ? Math.min(Math.max(task.correctCount, 1), 5) : 0;
        return (
          <span
            key={dateKey}
            className={`heatmap__cell heatmap__cell--${intensity}`}
            title={`${dateKey}${task?.completedAt ? ` · ${task.correctCount}/${task.totalAnswered}` : ' · 未完成'}`}
          />
        );
      })}
    </div>
  );
}