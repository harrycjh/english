import { useState } from 'react';
import { defaultParentSetting } from '../models/parent-setting';
import type { DailyTaskSummary } from '../models/daily-task';
import type { WordPayload } from '../models/word';
import { HeatmapCalendar } from '../components/HeatmapCalendar';
import { WordCard } from '../components/WordCard';

type HomeDockAction = 'review' | 'pick' | 'stats' | 'settings';

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
  const [activeDockAction, setActiveDockAction] = useState<HomeDockAction>('review');

  function scrollToSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleDockAction(action: HomeDockAction) {
    setActiveDockAction(action);

    if (action === 'review') {
      onStart();
      return;
    }

    if (action === 'pick') {
      scrollToSection('word-picker-section');
      return;
    }

    if (action === 'stats') {
      scrollToSection('stats-section');
      return;
    }

    scrollToSection('settings-section');
  }

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

      <section className="dashboard-grid" id="stats-section">
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

      <section className="section-block" id="word-picker-section">
        <div className="section-block__header">
          <h2>今日预览</h2>
          <p>四个单词并排先看一眼，熟悉主题后再开始。</p>
        </div>
        <div className="card-grid card-grid--preview">
          {previewWords.map((word) => (
            <WordCard key={word.id} word={word} />
          ))}
        </div>
      </section>

      <section className="section-block" id="settings-section">
        <div className="section-block__header">
          <h2>学习设置</h2>
          <p>先放常用设置摘要，后面可以继续做成可编辑面板。</p>
        </div>
        <div className="settings-grid">
          <article className="setting-pill-card">
            <span>发音</span>
            <strong>{defaultParentSetting.enableAudio ? '已开启' : '已关闭'}</strong>
          </article>
          <article className="setting-pill-card">
            <span>新词数量</span>
            <strong>{defaultParentSetting.dailyNewWordCount} / 天</strong>
          </article>
          <article className="setting-pill-card">
            <span>复习上限</span>
            <strong>{defaultParentSetting.dailyReviewLimit} / 天</strong>
          </article>
        </div>
      </section>

      <nav className="home-dock" aria-label="首页快捷操作">
        <button
          className={`home-dock__button${activeDockAction === 'review' ? ' is-active' : ''}`}
          type="button"
          onClick={() => handleDockAction('review')}
        >
          复习
        </button>
        <button
          className={`home-dock__button${activeDockAction === 'pick' ? ' is-active' : ''}`}
          type="button"
          onClick={() => handleDockAction('pick')}
        >
          选词
        </button>
        <button
          className={`home-dock__button${activeDockAction === 'stats' ? ' is-active' : ''}`}
          type="button"
          onClick={() => handleDockAction('stats')}
        >
          统计
        </button>
        <button
          className={`home-dock__button${activeDockAction === 'settings' ? ' is-active' : ''}`}
          type="button"
          onClick={() => handleDockAction('settings')}
        >
          设置
        </button>
      </nav>
    </main>
  );
}