import { useMemo } from 'react';
import { HeatmapCalendar } from '../components/HeatmapCalendar';
import type { AnswerEvent } from '../models/answer-event';
import type { DailyTaskSummary } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import type { ParentSetting } from '../models/parent-setting';
import { createDefaultWordSelectionState, type WordSelectionState } from '../models/word-selection-state';
import type { WordPayload, WordRecord } from '../models/word';
import { APP_VERSION } from '../config/app-meta';
import { summarizeAnswerEvents } from '../services/answer-event-service';
import { estimateReviewLoad, getWordLearningBucket } from '../services/selection-service';

type StatsDockGlyph = 'review' | 'selection' | 'stats' | 'settings';

interface StatsPageProps {
  payload: WordPayload;
  task: DailyTaskSummary;
  recentTasks: DailyTaskSummary[];
  recordsById: Record<string, LearningRecord>;
  answerEvents: AnswerEvent[];
  selectionById: Record<string, WordSelectionState>;
  setting: ParentSetting;
  onBackHome: () => void;
  onOpenSelection: () => void;
  onOpenSettings: () => void;
  onPracticeWrongWords: () => void;
}

interface StatsDockButtonProps {
  active?: boolean;
  glyph: StatsDockGlyph;
  label: string;
  onClick: () => void;
}

/* ─── helpers ─── */

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

function getStatsDockButtonUrl(glyph: StatsDockGlyph, active: boolean) {
  if (glyph === 'stats' && active) {
    return `${import.meta.env.BASE_URL}design-reference/slices/review-dock-stats-active-transparent.png?v=2`;
  }
  const state = active ? 'active' : 'default';
  return `${import.meta.env.BASE_URL}design-reference/slices/review-dock-${glyph}-${state}-transparent.png?v=2`;
}

/* ─── DonutChart ─── */

interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

function DonutChart({ slices, total, centerLabel }: { slices: DonutSlice[]; total: number; centerLabel: string }) {
  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 54;
  const strokeWidth = 22;

  let cumulativePercent = 0;
  const paths = slices.filter((s) => s.value > 0).map((slice) => {
    const percent = total > 0 ? slice.value / total : 0;
    const startAngle = cumulativePercent * 360;
    cumulativePercent += percent;
    const endAngle = cumulativePercent * 360;

    const startRad = ((startAngle - 90) * Math.PI) / 180;
    const endRad = ((endAngle - 90) * Math.PI) / 180;
    const largeArc = percent > 0.5 ? 1 : 0;

    const x1 = cx + radius * Math.cos(startRad);
    const y1 = cy + radius * Math.sin(startRad);
    const x2 = cx + radius * Math.cos(endRad);
    const y2 = cy + radius * Math.sin(endRad);

    const d = percent >= 1
      ? `M ${cx - radius},${cy} A ${radius},${radius} 0 1,1 ${cx + radius},${cy} A ${radius},${radius} 0 1,1 ${cx - radius},${cy}`
      : `M ${x1},${y1} A ${radius},${radius} 0 ${largeArc},1 ${x2},${y2}`;

    return (
      <path
        key={slice.label}
        d={d}
        fill="none"
        stroke={slice.color}
        strokeWidth={strokeWidth}
        strokeLinecap="butt"
      />
    );
  });

  return (
    <div className="stats-donut">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#f0e8d8" strokeWidth={strokeWidth} />
        {paths}
      </svg>
      <div className="stats-donut__center">
        <span className="stats-donut__center-label">总词</span>
        <strong className="stats-donut__center-value">{centerLabel}</strong>
      </div>
    </div>
  );
}

/* ─── HorizontalBar ─── */

function HorizontalBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="stats-hbar">
      <span className="stats-hbar__label">{label}</span>
      <div className="stats-hbar__track">
        <div className="stats-hbar__fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <strong className="stats-hbar__value">{value}</strong>
    </div>
  );
}

/* ─── Dock Button ─── */

function StatsDockButton({ active = false, glyph, label, onClick }: StatsDockButtonProps) {
  const bgUrl = getStatsDockButtonUrl(glyph, active);
  return (
    <button
      className={`home-dock__button review-dock__button${active ? ' is-active' : ''}`}
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        backgroundImage: `url(${bgUrl})`,
        backgroundSize: 'contain',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <span className="review-dock__label">{label}</span>
    </button>
  );
}

/* ─── Main Page ─── */

export function StatsPage({
  payload,
  task,
  recentTasks,
  recordsById,
  answerEvents,
  selectionById,
  setting,
  onBackHome,
  onOpenSelection,
  onOpenSettings,
  onPracticeWrongWords,
}: StatsPageProps) {
  const plannedCount = task.newWordIds.length + task.reviewWordIds.length;
  const reviewLoad = useMemo(() => estimateReviewLoad(recordsById, selectionById, setting), [recordsById, selectionById, setting]);
  const wordsById = useMemo(() => new Map(payload.words.map((word) => [word.id, word])), [payload.words]);
  const answerSummary = useMemo(() => summarizeAnswerEvents(answerEvents), [answerEvents]);

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
    const levelCounts = new Map<number, number>();
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

        const level = getPrimaryLevel(word);
        if (level !== null) {
          levelCounts.set(level, (levelCounts.get(level) ?? 0) + 1);
        }

        if (record?.nextDueAt && new Date(record.nextDueAt).getTime() <= nowTime) {
          bucketCounts.dueNow += 1;
        }
      }
    }

    const difficultyBuckets = [
      { label: 'Lv.1 基础', levels: [1, 2, 3], color: '#8bc34a' },
      { label: 'Lv.2 进阶', levels: [4, 5, 6], color: '#ffc107' },
      { label: 'Lv.3 提升', levels: [7, 8, 9, 10], color: '#ff9800' },
      { label: 'Lv.4+ 高级', levels: [11, 12, 13, 14, 15, 16], color: '#42a5f5' },
    ];

    const difficultyData = difficultyBuckets.map((bucket) => ({
      ...bucket,
      count: bucket.levels.reduce((sum, lvl) => sum + (levelCounts.get(lvl) ?? 0), 0),
    }));

    return {
      bucketCounts,
      topCategories: [...categoryCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 6),
      difficultyData,
    };
  }, [payload.words, recordsById, selectionById]);

  const recentSummary = useMemo(() => {
    const taskMap = new Map(recentTasks.map((recentTask) => [recentTask.dateKey, recentTask]));
    const completedTasks = recentTasks.filter((recentTask) => recentTask.completedAt);
    const eventTotalAnswered = answerEvents.length;
    const eventTotalCorrect = answerEvents.filter((event) => event.isCorrect).length;
    const totalAnswered = eventTotalAnswered || recentTasks.reduce((sum, recentTask) => sum + recentTask.totalAnswered, 0);
    const totalCorrect = eventTotalAnswered ? eventTotalCorrect : recentTasks.reduce((sum, recentTask) => sum + recentTask.correctCount, 0);
    const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

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
      completionStreak,
      recentRows,
    };
  }, [answerEvents, recentTasks]);

  const focusTitle = reviewLoad.riskLevel === '过高'
    ? '压力偏高'
    : '节奏正常';
  const focusText = reviewLoad.riskLevel === '过高'
    ? `未来 3 天预计有 ${reviewLoad.dueInThreeDaysCount} 个复习到期，建议暂缓新词。`
    : '今天复习负担适中，继续保持稳定节奏，效果会更好哦！';

  const donutTotal = librarySummary.bucketCounts.active;
  const donutSlices: DonutSlice[] = [
    { label: '已掌握', value: librarySummary.bucketCounts.mastered, color: '#66bb6a' },
    { label: '学习中', value: librarySummary.bucketCounts.learning, color: '#42a5f5' },
    { label: '待复习', value: librarySummary.bucketCounts.dueNow, color: '#ffa726' },
    { label: '新加入', value: librarySummary.bucketCounts.new, color: '#bdbdbd' },
  ];

  const pressureMax = Math.max(reviewLoad.dueInSevenDaysCount, 30);
  const pressureBars = [
    { label: '明日', value: reviewLoad.dueTomorrowCount, color: '#ffa726' },
    { label: '2 天内', value: Math.round(reviewLoad.dueInThreeDaysCount * 0.7), color: '#ffb74d' },
    { label: '3 天内', value: reviewLoad.dueInThreeDaysCount, color: '#ff9800' },
    { label: '5 天内', value: Math.round((reviewLoad.dueInThreeDaysCount + reviewLoad.dueInSevenDaysCount) / 2), color: '#f57c00' },
    { label: '本周内', value: reviewLoad.dueInSevenDaysCount, color: '#e65100' },
  ];

  const categoryMax = librarySummary.topCategories.length > 0 ? librarySummary.topCategories[0][1] : 1;
  const difficultyMax = Math.max(...librarySummary.difficultyData.map((d) => d.count), 1);
  const topWrongWords = answerSummary.wrongWordRanking.slice(0, 6);
  const questionKindLabels: Record<string, string> = {
    'image-choice': '图片选择',
    'text-choice': '文字选择',
    'fill-blank': '拼写填空',
  };

  return (
    <main className="page page--home page--stats">
      <div className="stats-mockup-frame">
        <div className="stats-shell__chrome">
          <div className="stats-shell__brand">
            <span className="stats-shell__brand-mark" aria-hidden="true" />
            <span>VocaRabbit</span>
            <span className="app-version-badge">{APP_VERSION}</span>
          </div>
          <div className="stats-shell__profile">小雨的家长</div>
        </div>

        {/* ─── Hero ─── */}
        <section className="hero-card stats-hero">
          <div className="stats-hero__art" aria-hidden="true" />
          <div className="stats-hero__content">
            <span className="hero-card__eyebrow">统计页 · 学习节奏看板</span>
            <h1>把学习节奏看成一张图，<br />而不是一堆按钮</h1>
            <p>
              当前已启用 {librarySummary.bucketCounts.active} 词，已掌握 {librarySummary.bucketCounts.mastered} 词，
              学习中 {librarySummary.bucketCounts.learning} 词，继续保持节奏！
            </p>
            <div className="review-pill-row" aria-label="统计页摘要">
              <span className="review-pill">启用 {librarySummary.bucketCounts.active}</span>
              <span className="review-pill">学习中 {librarySummary.bucketCounts.learning}</span>
              <span className="review-pill">已掌握 {librarySummary.bucketCounts.mastered}</span>
              <span className="review-pill">连续天数 {recentSummary.completionStreak}</span>
            </div>
          </div>
          <div className="stats-hero__aside">
            <span className="settings-hero__label">当前节奏</span>
            <strong>{focusTitle}</strong>
            <p>{focusText}</p>
            <div className="review-pill-row">
              <span className="review-pill">新词 {setting.dailyNewWordCount}</span>
              <span className="review-pill">复习 {setting.dailyReviewLimit}</span>
              <span className="review-pill">预计时长 {plannedCount * 2} 分钟</span>
            </div>
            <div className="stats-hero__focus-art" aria-hidden="true" />
          </div>
        </section>

        {/* ─── 4 Stat Cards ─── */}
        <section className="dashboard-grid review-dashboard">
          <article className="stat-card stat-card--planned">
            <span>今日任务</span>
            <strong>{plannedCount}<small className="stat-card__unit">个</small></strong>
            <small>新词 {task.newWordIds.length} · 复习 {task.reviewWordIds.length}</small>
          </article>
          <article className="stat-card stat-card--active">
            <span>启用词库</span>
            <strong>{librarySummary.bucketCounts.active}<small className="stat-card__unit">个</small></strong>
            <small>已启用 {librarySummary.bucketCounts.active} · 已暂停 {librarySummary.bucketCounts.paused}</small>
          </article>
          <article className="stat-card stat-card--mastered">
            <span>已掌握词汇</span>
            <strong>{librarySummary.bucketCounts.mastered}<small className="stat-card__unit">个</small></strong>
            <small>掌握率 {donutTotal > 0 ? `${Math.round((librarySummary.bucketCounts.mastered / donutTotal) * 1000) / 10}%` : '--'}</small>
          </article>
          <article className="stat-card stat-card--accuracy">
            <span>14 天学习正确率</span>
            <strong>{recentSummary.totalAnswered > 0 ? `${recentSummary.accuracy}` : '--'}<small className="stat-card__unit">%</small></strong>
            <small>{recentSummary.totalAnswered > 0 ? `共作答 ${recentSummary.totalAnswered} 题` : '暂无作答记录'}</small>
          </article>
        </section>

        {/* ─── 4-Column Panel Grid ─── */}
        <section className="settings-panel-grid stats-panel-grid">
          {/* Col 1: 词汇学习阶段分布 */}
          <section className="section-block settings-panel stats-panel stats-panel--progress">
            <div className="section-block__header">
              <h2>词汇学习阶段分布</h2>
            </div>
            <DonutChart slices={donutSlices} total={donutTotal} centerLabel={`${donutTotal}个`} />
            <ul className="stats-donut-legend">
              {donutSlices.map((slice) => {
                const pct = donutTotal > 0 ? Math.round((slice.value / donutTotal) * 100) : 0;
                return (
                  <li key={slice.label}>
                    <span className="stats-donut-legend__dot" style={{ background: slice.color }} />
                    <span className="stats-donut-legend__label">{slice.label}</span>
                    <span className="stats-donut-legend__value">{slice.value}个</span>
                    <span className="stats-donut-legend__pct">{pct}%</span>
                  </li>
                );
              })}
            </ul>
            <p className="stats-inline-note stats-inline-note--encourage">
              {librarySummary.bucketCounts.mastered > 0 ? '继续保持！已掌握词汇占比很棒' : '加油！坚持学习很快就会有成果'}
            </p>
          </section>

          {/* Col 2: 未来复习压力 */}
          <section className="section-block settings-panel stats-panel stats-panel--pressure">
            <div className="section-block__header">
              <h2>未来复习压力 ⓘ</h2>
              <p>根据艾宾浩斯遗忘曲线预测</p>
            </div>
            <div className="stats-pressure-bars">
              {pressureBars.map((bar) => (
                <HorizontalBar key={bar.label} label={bar.label} value={bar.value} max={pressureMax} color={bar.color} />
              ))}
            </div>
            <div className="stats-pressure-summary">
              <span className="stats-pressure-summary__icon" aria-hidden="true">🌿</span>
              <div>
                <strong>压力{reviewLoad.riskLevel === '正常' ? '适中' : reviewLoad.riskLevel} · {reviewLoad.riskLevel === '正常' ? '很好' : '注意'}</strong>
                <p>保持当前节奏，效果更稳定</p>
              </div>
            </div>
          </section>

          {/* Col 3: 14 天学习热力图 */}
          <section className="section-block settings-panel stats-panel stats-panel--heatmap">
            <div className="section-block__header">
              <h2>14 天学习热力图 ⓘ</h2>
            </div>
            <HeatmapCalendar tasks={recentTasks} />
            <div className="stats-recent-activity">
              <h3>近期学习动态</h3>
              <ul className="stats-activity-list">
                {recentSummary.recentRows.slice(0, 3).map(({ dateKey, task: recentTask }) => {
                  if (!recentTask) return null;
                  const isCompleted = !!recentTask.completedAt;
                  const acc = recentTask.totalAnswered > 0
                    ? Math.round((recentTask.correctCount / recentTask.totalAnswered) * 100)
                    : 0;
                  return (
                    <li key={dateKey} className={isCompleted ? 'is-completed' : ''}>
                      <span className="stats-activity__status">{isCompleted ? '✅' : '⏳'}</span>
                      <span className="stats-activity__date">{formatDateKey(dateKey)}</span>
                      <span className="stats-activity__detail">
                        完成 {recentTask.newWordIds.length} 个 · 复习 {recentTask.reviewWordIds.length} 个
                      </span>
                      <span className="stats-activity__acc">准确率 {acc}%</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          {/* Col 4: 活跃词库分布 */}
          <section className="section-block settings-panel stats-panel stats-panel--coverage">
            <div className="section-block__header">
              <h2>活跃词库分布</h2>
            </div>
            <div className="stats-coverage-section">
              <h3>按主题分布</h3>
              <div className="stats-coverage-bars">
                {librarySummary.topCategories.map(([category, count]) => (
                  <HorizontalBar key={category} label={category} value={count} max={categoryMax} color="#ffa726" />
                ))}
                {librarySummary.topCategories.length === 0 && (
                  <p className="stats-inline-note">暂无数据</p>
                )}
              </div>
            </div>
            <div className="stats-coverage-section">
              <h3>按难度分布</h3>
              <div className="stats-coverage-bars">
                {librarySummary.difficultyData.map((item) => (
                  <HorizontalBar key={item.label} label={item.label} value={item.count} max={difficultyMax} color={item.color} />
                ))}
              </div>
            </div>
          </section>
        </section>

        <section className="settings-panel-grid stats-panel-grid stats-panel-grid--events">
          <section className="section-block settings-panel stats-panel">
            <div className="section-block__header">
              <h2>高频错词</h2>
              <p>根据逐题答题记录统计。</p>
            </div>
            {topWrongWords.length > 0 ? (
              <>
                <ul className="stats-activity-list">
                  {topWrongWords.map((item) => {
                    const word = wordsById.get(item.wordId);
                    return (
                      <li key={item.wordId}>
                        <span className="stats-activity__status">!</span>
                        <span className="stats-activity__date">{word?.english ?? item.wordId}</span>
                        <span className="stats-activity__detail">{word?.chinese ?? '未知单词'}</span>
                        <span className="stats-activity__acc">错 {item.wrongCount}/{item.totalCount}</span>
                      </li>
                    );
                  })}
                </ul>
                <button className="primary-button" type="button" onClick={onPracticeWrongWords}>
                  练习高频错词
                </button>
                <button className="secondary-button" type="button" onClick={onOpenSelection}>
                  去选词页调整
                </button>
              </>
            ) : (
              <p className="stats-inline-note">暂无错题记录。</p>
            )}
          </section>

          <section className="section-block settings-panel stats-panel">
            <div className="section-block__header">
              <h2>题型正确率</h2>
              <p>用于判断图片题、选择题和拼写题的难度。</p>
            </div>
            <div className="stats-coverage-bars">
              {answerSummary.byQuestionKind.length > 0 ? answerSummary.byQuestionKind.map((item) => (
                <HorizontalBar
                  key={item.questionKind}
                  label={`${questionKindLabels[item.questionKind] ?? item.questionKind} ${item.accuracy}%`}
                  value={item.correctCount}
                  max={item.totalCount}
                  color={item.accuracy >= 80 ? '#66bb6a' : item.accuracy >= 50 ? '#ffa726' : '#ef5350'}
                />
              )) : (
                <p className="stats-inline-note">完成几题后会显示题型趋势。</p>
              )}
            </div>
          </section>
        </section>

        {/* ─── Dock ─── */}
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
