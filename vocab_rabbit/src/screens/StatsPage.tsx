import { useMemo } from 'react';
import { HeatmapCalendar } from '../components/HeatmapCalendar';
import type { DailyTaskSummary } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import type { ParentSetting } from '../models/parent-setting';
import { createDefaultWordSelectionState, type WordSelectionState } from '../models/word-selection-state';
import type { WordPayload, WordRecord } from '../models/word';
import { APP_VERSION } from '../config/app-meta';
import { estimateReviewLoad, getWordLearningBucket } from '../services/selection-service';

type StatsDockGlyph = 'review' | 'selection' | 'stats' | 'settings';

interface StatsPageProps {
  payload: WordPayload;
  task: DailyTaskSummary;
  recentTasks: DailyTaskSummary[];
  recordsById: Record<string, LearningRecord>;
  selectionById: Record<string, WordSelectionState>;
  setting: ParentSetting;
  onBackHome: () => void;
  onOpenSelection: () => void;
  onOpenSettings: () => void;
}

interface StatsDockButtonProps {
  active?: boolean;
  glyph: StatsDockGlyph;
  label: string;
  onClick: () => void;
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

function getPrimaryLevel(word: WordRecord): number | null {
  return word.oxfordRefs[0]?.level ?? null;
}

function formatDateKey(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  });
}

function StatsDockButton({ active = false, glyph, label, onClick }: StatsDockButtonProps) {
  return (
    <button
      className={`home-dock__button review-dock__button${active ? ' is-active' : ''}`}
      type="button"
      onClick={onClick}
    >
      <span className={`review-dock__glyph review-dock__glyph--${glyph}`} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

export function StatsPage({
  payload,
  task,
  recentTasks,
  recordsById,
  selectionById,
  setting,
  onBackHome,
  onOpenSelection,
  onOpenSettings,
}: StatsPageProps) {
  const plannedCount = task.newWordIds.length + task.reviewWordIds.length;
  const reviewLoad = useMemo(() => estimateReviewLoad(recordsById, selectionById, setting), [recordsById, selectionById, setting]);

  const librarySummary = useMemo(() => {
    const bucketCounts = {
      new: 0,
      learning: 0,
      mastered: 0,
      paused: 0,
      disabled: 0,
      active: 0,
      studied: 0,
      dueNow: 0,
    };
    const categoryCounts = new Map<string, number>();
    const levelCounts = new Map<string, number>();
    const nowTime = Date.now();

    for (const word of payload.words) {
      const selectionState = selectionById[word.id] ?? createDefaultWordSelectionState(word.id);
      const record = recordsById[word.id];
      const bucket = getWordLearningBucket(word.id, record, selectionState);

      bucketCounts[bucket] += 1;
      if (record?.lastStudiedAt) {
        bucketCounts.studied += 1;
      }

      if (selectionState.isEnabled && !selectionState.isPaused) {
        bucketCounts.active += 1;
        categoryCounts.set(word.category, (categoryCounts.get(word.category) ?? 0) + 1);

        const levelLabel = getPrimaryLevel(word) === null ? '未回填' : `Level ${getPrimaryLevel(word)}`;
        levelCounts.set(levelLabel, (levelCounts.get(levelLabel) ?? 0) + 1);

        if (record?.nextDueAt && new Date(record.nextDueAt).getTime() <= nowTime) {
          bucketCounts.dueNow += 1;
        }
      }
    }

    return {
      bucketCounts,
      topCategories: [...categoryCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 6),
      topLevels: [...levelCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 6),
    };
  }, [payload.words, recordsById, selectionById]);

  const recentSummary = useMemo(() => {
    const taskMap = new Map(recentTasks.map((recentTask) => [recentTask.dateKey, recentTask]));
    const completedTasks = recentTasks.filter((recentTask) => recentTask.completedAt);
    const totalAnswered = recentTasks.reduce((sum, recentTask) => sum + recentTask.totalAnswered, 0);
    const totalCorrect = recentTasks.reduce((sum, recentTask) => sum + recentTask.correctCount, 0);
    const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
    const averageAnswered = completedTasks.length > 0 ? Math.round(totalAnswered / completedTasks.length) : 0;

    let completionStreak = 0;
    for (const dateKey of buildRecentDates(14).reverse()) {
      if (taskMap.get(dateKey)?.completedAt) {
        completionStreak += 1;
      } else {
        break;
      }
    }

    const recentRows = buildRecentDates(5).reverse().map((dateKey) => ({
      dateKey,
      task: taskMap.get(dateKey),
    }));

    return {
      completedDays: completedTasks.length,
      totalAnswered,
      accuracy,
      averageAnswered,
      completionStreak,
      recentRows,
    };
  }, [recentTasks]);

  const todayStatus = task.completedAt ? '今日已完成' : task.totalAnswered > 0 ? '今日进行中' : '今日未开始';
  const focusTitle = reviewLoad.riskLevel === '过高'
    ? '先给未来减压'
    : recentSummary.completionStreak > 0
      ? `连续 ${recentSummary.completionStreak} 天`
      : task.completedAt
        ? '今日已完成'
        : '节奏正常';
  const focusText = reviewLoad.riskLevel === '过高'
    ? `未来 3 天预计有 ${reviewLoad.dueInThreeDaysCount} 个复习到期，已经超过当前上限。`
    : task.completedAt
      ? '今天任务已经收尾，适合回看趋势和薄弱区，不急着继续加量。'
      : task.totalAnswered > 0
        ? `今天已经答了 ${task.totalAnswered} 题，还可以按当前节奏继续完成。`
        : `未来 3 天预计有 ${reviewLoad.dueInThreeDaysCount} 个复习到期，当前压力 ${reviewLoad.riskLevel}。`;

  return (
    <main className="page page--home page--stats">
      <div className="stats-mockup-frame">
        <div className="stats-shell__chrome">
          <div className="stats-shell__brand">
            <span className="stats-shell__brand-mark" aria-hidden="true" />
            <span>VocaRabbit</span>
            <span className="app-version-badge">{APP_VERSION}</span>
          </div>
          <div className="stats-shell__profile">小树的家长版</div>
        </div>

        <section className="hero-card stats-hero">
          <div className="stats-hero__art" aria-hidden="true" />
          <div className="stats-hero__content">
            <span className="hero-card__eyebrow">统计页 · 学习节奏看板</span>
            <h1>把学习节奏看成一张图，而不是一堆按钮</h1>
            <p>
              词库共 {payload.wordCount} 词，当前启用 {librarySummary.bucketCounts.active} 词，
              已掌握 {librarySummary.bucketCounts.mastered} 词，已有 {librarySummary.bucketCounts.studied} 词留下学习记录。
            </p>
            <div className="review-pill-row" aria-label="统计页摘要">
              <span className="review-pill">启用 {librarySummary.bucketCounts.active}</span>
              <span className="review-pill">学习中 {librarySummary.bucketCounts.learning}</span>
              <span className="review-pill">已掌握 {librarySummary.bucketCounts.mastered}</span>
              <span className="review-pill">连续 {recentSummary.completionStreak} 天</span>
            </div>
          </div>
          <div className="stats-hero__aside">
            <span className="settings-hero__label">当前节奏</span>
            <strong>{focusTitle}</strong>
            <p>{focusText}</p>
            <div className="review-pill-row">
              <span className="review-pill">{todayStatus}</span>
              <span className="review-pill">
                {setting.dailyNewWordCount} 新词 / {setting.dailyReviewLimit} 复习
              </span>
            </div>
            <div className="stats-hero__focus-art" aria-hidden="true" />
          </div>
        </section>

        <section className="dashboard-grid review-dashboard">
        <article className="stat-card stat-card--planned">
          <span>今日任务</span>
          <strong>{plannedCount}</strong>
          <small>{task.completedAt ? '今天任务已完成' : task.totalAnswered > 0 ? `已答 ${task.totalAnswered} 题` : '尚未开始今天任务'}</small>
        </article>
        <article className="stat-card stat-card--active">
          <span>启用词库</span>
          <strong>{librarySummary.bucketCounts.active}</strong>
          <small>当前会真实参与学习计划的词</small>
        </article>
        <article className="stat-card stat-card--mastered">
          <span>已掌握</span>
          <strong>{librarySummary.bucketCounts.mastered}</strong>
          <small>掌握等级达到 4 及以上</small>
        </article>
        <article className="stat-card stat-card--accuracy">
          <span>14 天正确率</span>
          <strong>{recentSummary.totalAnswered > 0 ? `${recentSummary.accuracy}%` : '--'}</strong>
          <small>{recentSummary.totalAnswered > 0 ? `最近 14 天共作答 ${recentSummary.totalAnswered} 题` : '最近 14 天还没有作答记录'}</small>
        </article>
        </section>

        <section className="settings-panel-grid stats-panel-grid">
        <section className="section-block settings-panel stats-panel stats-panel--progress">
          <div className="section-block__header">
            <h2>词库进度分布</h2>
            <p>先看词库处在哪个阶段，再决定是加量还是减压。</p>
          </div>
          <div className="stats-card-grid">
            <article className="stats-breakdown-card">
              <span>未学</span>
              <strong>{librarySummary.bucketCounts.new}</strong>
            </article>
            <article className="stats-breakdown-card">
              <span>学习中</span>
              <strong>{librarySummary.bucketCounts.learning}</strong>
            </article>
            <article className="stats-breakdown-card">
              <span>已掌握</span>
              <strong>{librarySummary.bucketCounts.mastered}</strong>
            </article>
            <article className="stats-breakdown-card">
              <span>已暂停</span>
              <strong>{librarySummary.bucketCounts.paused}</strong>
            </article>
            <article className="stats-breakdown-card">
              <span>未启用</span>
              <strong>{librarySummary.bucketCounts.disabled}</strong>
            </article>
            <article className="stats-breakdown-card">
              <span>已有记录</span>
              <strong>{librarySummary.bucketCounts.studied}</strong>
            </article>
          </div>
        </section>

        <section className="section-block settings-panel stats-panel stats-panel--pressure">
          <div className="section-block__header">
            <h2>未来几天压力</h2>
            <p>只统计当前启用且未暂停的词，避免被无效词量干扰。</p>
          </div>
          <div className="stats-card-grid stats-card-grid--compact">
            <article className="stats-breakdown-card">
              <span>已到期</span>
              <strong>{librarySummary.bucketCounts.dueNow}</strong>
            </article>
            <article className="stats-breakdown-card">
              <span>明天到期</span>
              <strong>{reviewLoad.dueTomorrowCount}</strong>
            </article>
            <article className="stats-breakdown-card">
              <span>3 天内</span>
              <strong>{reviewLoad.dueInThreeDaysCount}</strong>
            </article>
            <article className="stats-breakdown-card">
              <span>7 天内</span>
              <strong>{reviewLoad.dueInSevenDaysCount}</strong>
            </article>
          </div>
          <p className="stats-inline-note">
            当前压力标签为 {reviewLoad.riskLevel}。按现在的设置，家长每天默认允许 {setting.dailyNewWordCount} 个新词，
            每天复习上限 {setting.dailyReviewLimit} 个。
          </p>
        </section>

        <section className="section-block settings-panel stats-panel stats-panel--heatmap">
          <div className="section-block__header">
            <h2>最近 14 天</h2>
            <p>热力图只回答一个问题：最近有没有稳定完成，而不是看上去很忙。</p>
          </div>
          <HeatmapCalendar tasks={recentTasks} />
          <div className="stats-card-grid stats-card-grid--compact">
            <article className="stats-breakdown-card">
              <span>完成天数</span>
              <strong>{recentSummary.completedDays}</strong>
            </article>
            <article className="stats-breakdown-card">
              <span>累计作答</span>
              <strong>{recentSummary.totalAnswered}</strong>
            </article>
            <article className="stats-breakdown-card">
              <span>平均每次</span>
              <strong>{recentSummary.averageAnswered}</strong>
            </article>
            <article className="stats-breakdown-card">
              <span>连续完成</span>
              <strong>{recentSummary.completionStreak}</strong>
            </article>
          </div>
          <ul className="stats-task-list">
            {recentSummary.recentRows.map(({ dateKey, task: recentTask }) => {
              const resultText = !recentTask
                ? '暂无任务'
                : recentTask.completedAt
                  ? `${recentTask.correctCount}/${recentTask.totalAnswered}`
                  : recentTask.totalAnswered > 0
                    ? `已答 ${recentTask.totalAnswered}`
                    : `${recentTask.newWordIds.length + recentTask.reviewWordIds.length} 词`;
              const statusText = !recentTask
                ? '还没有生成记录'
                : recentTask.completedAt
                  ? '当天已完成'
                  : recentTask.totalAnswered > 0
                    ? '当天进行中'
                    : '当天未完成';

              return (
                <li key={dateKey}>
                  <div>
                    <strong>{formatDateKey(dateKey)}</strong>
                    <small>{statusText}</small>
                  </div>
                  <span>{resultText}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="section-block settings-panel stats-panel stats-panel--coverage">
          <div className="section-block__header">
            <h2>启用词库分布</h2>
            <p>这一版先看启用范围落在哪些主题和 Level，判断范围有没有失衡。</p>
          </div>
          <div className="stats-list-grid">
            <section className="stats-list-panel stats-list-panel--categories">
              <h3>分类占比</h3>
              {librarySummary.topCategories.length > 0 ? (
                <ul className="stats-list">
                  {librarySummary.topCategories.map(([category, count]) => (
                    <li key={category}>
                      <span>{category}</span>
                      <strong>{count}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="stats-inline-note">当前没有启用中的词。</p>
              )}
            </section>

            <section className="stats-list-panel stats-list-panel--levels">
              <h3>Level 覆盖</h3>
              {librarySummary.topLevels.length > 0 ? (
                <ul className="stats-list">
                  {librarySummary.topLevels.map(([level, count]) => (
                    <li key={level}>
                      <span>{level}</span>
                      <strong>{count}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="stats-inline-note">当前没有可统计的 Level 数据。</p>
              )}
            </section>
          </div>
        </section>
        </section>

        <nav className="home-dock review-dock stats-dock" aria-label="主页面导航">
          <StatsDockButton glyph="review" label="复习" onClick={onBackHome} />
          <StatsDockButton glyph="selection" label="选词" onClick={onOpenSelection} />
          <StatsDockButton active glyph="stats" label="统计" onClick={() => {}} />
          <StatsDockButton glyph="settings" label="设置" onClick={onOpenSettings} />
        </nav>
      </div>
    </main>
  );
}