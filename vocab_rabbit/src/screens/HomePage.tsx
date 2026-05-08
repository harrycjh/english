import type { DailyTaskSummary } from '../models/daily-task';
import type { WordPayload } from '../models/word';
import { HeatmapCalendar } from '../components/HeatmapCalendar';
import { WordCard } from '../components/WordCard';

interface HomePageProps {
  payload: WordPayload;
  task: DailyTaskSummary;
  masteredCount: number;
  recentTasks: DailyTaskSummary[];
  previewWords: WordPayload['words'];
  onStart: () => void;
}

export function HomePage({ payload, task, masteredCount, recentTasks, previewWords, onStart }: HomePageProps) {
  const plannedCount = task.newWordIds.length + task.reviewWordIds.length;

  return (
    <main className="page page--home">
      <section className="hero-card">
        <div>
          <span className="hero-card__eyebrow">iPad 优先 · PWA 骨架</span>
          <h1>VocaRabbit</h1>
          <p>
            今天安排 {task.newWordIds.length} 个新词、{task.reviewWordIds.length} 个复习词，词库共 {payload.wordCount} 词，
            已掌握 {masteredCount} 词。
          </p>
        </div>
        <button className="primary-button" type="button" onClick={onStart}>
          {task.completedAt ? '重新打开今日任务' : '开始今日学习'}
        </button>
      </section>

      <section className="dashboard-grid">
        <article className="stat-card">
          <span>今日任务</span>
          <strong>{plannedCount}</strong>
          <small>{task.completedAt ? '今天已经完成，可再次回看' : '建议一次学完'}</small>
        </article>
        <article className="stat-card">
          <span>分类数量</span>
          <strong>{payload.categoryCount}</strong>
          <small>儿童友好细分主题</small>
        </article>
        <article className="stat-card">
          <span>最近 14 天</span>
          <HeatmapCalendar tasks={recentTasks} />
        </article>
      </section>

      <section className="section-block">
        <div className="section-block__header">
          <h2>今日预览</h2>
          <p>先看看要学的词，熟悉一下主题和难度。</p>
        </div>
        <div className="card-grid">
          {previewWords.map((word) => (
            <WordCard key={word.id} word={word} />
          ))}
        </div>
      </section>
    </main>
  );
}