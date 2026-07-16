import { useMemo, useState } from 'react';
import { Activity, BrainCircuit, CalendarRange, ShieldCheck } from 'lucide-react';
import { ProfileSelector } from '../components/ProfileSelector';
import { APP_VERSION } from '../config/app-meta';
import type { AnswerEvent } from '../models/answer-event';
import type { DailyTaskSummary } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import type { ParentSetting, ProfileId } from '../models/parent-setting';
import type { WordSelectionState } from '../models/word-selection-state';
import type { WordPayload } from '../models/word';
import {
  buildLearningStatistics,
  type FutureLearningPoint,
  type HistoricalLearningPoint,
} from '../services/learning-statistics';
import {
  buildMemoryStatistics,
  type DurabilityThresholdPoint,
  type RetentionPoint,
} from '../services/memory-statistics';

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
  onSelectProfile: (profileId: ProfileId) => Promise<void>;
  onPracticeWrongWords: () => void;
}

type StatsTab = 'forgetting' | 'learning' | 'durability';

function formatDayCount(days: number): string {
  if (days <= 0) return '--';
  if (days < 1) return `${Math.max(1, Math.round(days * 24))} 小时`;
  if (days < 10) return `${days.toFixed(1)} 天`;
  return `${Math.round(days)} 天`;
}

function formatDate(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  });
}

function getCurveRetention(points: RetentionPoint[], intervalDays: number): number {
  return points.find((point) => point.intervalDays === intervalDays)?.retention ?? 0;
}

function StatMetric({ label, value, note, tone = 'blue' }: {
  label: string;
  value: string;
  note: string;
  tone?: 'blue' | 'green' | 'orange' | 'red';
}) {
  return (
    <article className={`memory-metric memory-metric--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function MemoryCurveChart({ predicted, reference }: {
  predicted: RetentionPoint[];
  reference: RetentionPoint[];
}) {
  const width = 1120;
  const height = 552;
  const left = 46;
  const right = 10;
  const top = 24;
  const bottom = 52;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xTicks = [0, 1, 2, 3, 4, 5, 6, 7, 14, 21, 30, 60, 90, 180, 365];
  const xLabels = ['刚复习', '1天', '2天', '3天', '4天', '5天', '6天', '7天', '14天', '21天', '1月', '2月', '3月', '6月', '1年'];
  const xForDays = (days: number) => {
    const exactIndex = xTicks.indexOf(days);
    if (exactIndex >= 0) {
      return left + (exactIndex / (xTicks.length - 1)) * plotWidth;
    }

    const rightIndex = xTicks.findIndex((tick) => tick > days);
    if (rightIndex <= 0) return left;
    if (rightIndex < 0) return width - right;
    const lower = xTicks[rightIndex - 1];
    const upper = xTicks[rightIndex];
    const progress = (days - lower) / (upper - lower);
    return left + ((rightIndex - 1 + progress) / (xTicks.length - 1)) * plotWidth;
  };
  const yForRetention = (retention: number) => top + ((100 - retention) / 100) * plotHeight;
  const linearPath = (points: RetentionPoint[]) => {
    if (points.length === 0) return '';
    const coordinates = points.map((point) => ({
      x: xForDays(point.intervalDays),
      y: yForRetention(point.retention),
    }));
    return coordinates.slice(1).reduce(
      (path, point) => `${path} L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
      `M ${coordinates[0].x.toFixed(1)} ${coordinates[0].y.toFixed(1)}`,
    );
  };
  const predictedPath = linearPath(predicted);
  const referencePath = linearPath(reference);
  const yTicks = [100, 75, 50, 25, 0];
  const hasPersonalCurve = predicted.some((point) => point.retention > 0);

  return (
    <svg className="memory-curve-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="个人遗忘曲线">
      <defs>
        <linearGradient id="memoryCurveFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffad32" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#ffad32" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {yTicks.map((tick) => (
        <g key={tick}>
          <line x1={left} y1={yForRetention(tick)} x2={width - right} y2={yForRetention(tick)} className="memory-chart-grid" />
          <text x={left - 12} y={yForRetention(tick) + 4} textAnchor="end" className="memory-chart-label">{tick}%</text>
        </g>
      ))}
      {hasPersonalCurve ? (
        <>
          <path
            d={`${predictedPath} L ${xForDays(365)} ${yForRetention(0)} L ${xForDays(0)} ${yForRetention(0)} Z`}
            className="memory-curve-area"
          />
          <path d={predictedPath} className="memory-curve-line" />
          {predicted.filter((point) => xTicks.includes(point.intervalDays)).map((point) => (
            <circle key={point.intervalDays} cx={xForDays(point.intervalDays)} cy={yForRetention(point.retention)} r="4" className="memory-curve-node" />
          ))}
        </>
      ) : null}
      <path d={referencePath} className="memory-reference-line" />
      {xTicks.map((tick, index) => (
        <text key={tick} x={xForDays(tick)} y={height - 14} textAnchor="middle" className="memory-chart-label">{xLabels[index]}</text>
      ))}
    </svg>
  );
}

function LearningHistoryChart({ points }: { points: HistoricalLearningPoint[] }) {
  const width = 720;
  const height = 250;
  const left = 48;
  const right = 18;
  const top = 20;
  const bottom = 36;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maximum = Math.max(...points.map((point) => point.learnedWordCount), 1);
  const xForIndex = (index: number) => left + (points.length <= 1 ? 0 : index / (points.length - 1)) * plotWidth;
  const yForCount = (count: number) => top + (1 - count / maximum) * plotHeight;
  const path = points.map((point, index) => (
    `${index === 0 ? 'M' : 'L'} ${xForIndex(index).toFixed(1)} ${yForCount(point.learnedWordCount).toFixed(1)}`
  )).join(' ');
  const labelIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  const yTicks = [maximum, Math.round(maximum / 2), 0].filter((value, index, values) => values.indexOf(value) === index);

  return (
    <svg className="learning-history-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="全部历史每日学习单词数">
      {yTicks.map((tick) => (
        <g key={tick}>
          <line x1={left} y1={yForCount(tick)} x2={width - right} y2={yForCount(tick)} className="memory-chart-grid" />
          <text x={left - 10} y={yForCount(tick) + 4} textAnchor="end" className="memory-chart-label">{tick}</text>
        </g>
      ))}
      <path d={`${path} L ${xForIndex(points.length - 1)} ${yForCount(0)} L ${xForIndex(0)} ${yForCount(0)} Z`} className="learning-history-area" />
      <path d={path} className="learning-history-line" />
      {labelIndexes.map((index) => (
        <text key={index} x={xForIndex(index)} y={height - 12} textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'} className="memory-chart-label">
          {formatDate(points[index].dateKey)}
        </text>
      ))}
    </svg>
  );
}

function LearningForecastBars({ points }: { points: FutureLearningPoint[] }) {
  const maximum = Math.max(...points.map((point) => point.totalCount), 1);
  return (
    <div className="learning-bars learning-bars--forecast" aria-label="未来十五天预计学习单词数">
      {points.map((point, index) => {
        const newHeight = (point.newCount / maximum) * 100;
        const reviewHeight = (point.reviewCount / maximum) * 100;
        return (
          <div className={`learning-bars__day${index === 0 ? ' is-first-day' : ''}`} key={point.dateKey} title={`${formatDate(point.dateKey)}：预计新词 ${point.newCount}，复习 ${point.reviewCount}`}>
            <div className="learning-bars__plot">
              <div className="learning-bars__stack" style={{ height: `${newHeight + reviewHeight}%` }}>
                <span className="learning-bars__review" style={{ flexGrow: point.reviewCount }} />
                <span className="learning-bars__new" style={{ flexGrow: point.newCount }} />
              </div>
            </div>
            <span>{index === 0 ? '明' : new Date(`${point.dateKey}T00:00:00`).getDate()}</span>
          </div>
        );
      })}
    </div>
  );
}

function DurabilityLineChart({ points }: { points: DurabilityThresholdPoint[] }) {
  const width = 760;
  const height = 286;
  const left = 58;
  const right = 30;
  const top = 28;
  const bottom = 48;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maximum = Math.max(...points.map((point) => point.count), 1);
  const xForDays = (days: number) => left + (days / 90) * plotWidth;
  const yForCount = (count: number) => top + (1 - count / maximum) * plotHeight;
  const yTicks = [maximum, Math.round(maximum / 2), 0].filter((value, index, values) => values.indexOf(value) === index);
  const path = points.map((point, index) => (
    `${index === 0 ? 'M' : 'L'} ${xForDays(point.thresholdDays).toFixed(1)} ${yForCount(point.count).toFixed(1)}`
  )).join(' ');

  return (
    <svg className="memory-durability-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="不同记忆持久天数的单词数量">
      {yTicks.map((tick) => (
        <g key={tick}>
          <line x1={left} y1={yForCount(tick)} x2={width - right} y2={yForCount(tick)} className="memory-chart-grid" />
          <text x={left - 12} y={yForCount(tick) + 4} textAnchor="end" className="memory-chart-label">{tick}</text>
        </g>
      ))}
      <path d={path} className="memory-durability-line" />
      {points.map((point) => (
        <g key={point.thresholdDays}>
          <circle cx={xForDays(point.thresholdDays)} cy={yForCount(point.count)} r="6" fill={point.color} className="memory-durability-node" />
          <text x={xForDays(point.thresholdDays)} y={yForCount(point.count) - 13} textAnchor="middle" className="memory-durability-value">{point.count}</text>
          <text x={xForDays(point.thresholdDays)} y={height - 15} textAnchor="middle" className="memory-chart-label">≥{point.thresholdDays} 天</text>
        </g>
      ))}
    </svg>
  );
}

export function StatsPage({
  payload,
  task,
  recentTasks,
  recordsById,
  answerEvents,
  selectionById,
  setting,
  onOpenSelection,
  onSelectProfile,
}: StatsPageProps) {
  const [activeTab, setActiveTab] = useState<StatsTab>('forgetting');
  const memory = useMemo(() => buildMemoryStatistics(recordsById, answerEvents), [recordsById, answerEvents]);
  const learning = useMemo(() => buildLearningStatistics({
    currentTask: task,
    tasks: recentTasks,
    answerEvents,
    words: payload.words,
    recordsById,
    selectionById,
    setting,
  }), [answerEvents, payload.words, recentTasks, recordsById, selectionById, setting, task]);
  const historyStart = learning.history[0]?.dateKey ?? task.dateKey;

  const tabs: Array<{ id: StatsTab; label: string; icon: typeof Activity }> = [
    { id: 'forgetting', label: '遗忘曲线', icon: Activity },
    { id: 'learning', label: '学习情况', icon: CalendarRange },
    { id: 'durability', label: '记忆持久度', icon: ShieldCheck },
  ];

  return (
    <main className="page page--home page--stats" data-profile={setting.profileId}>
      <div className="stats-mockup-frame stats-memory-frame">
        <div className="stats-shell__chrome">
          <div className="stats-shell__brand app-brand-lockup">
            <span className="app-brand-lockup__mark" aria-hidden="true" />
            <span className="app-brand-lockup__wordmark">VocaRabbit</span>
            <span className="app-version-badge">{APP_VERSION}</span>
          </div>
          <ProfileSelector
            value={setting.profileId}
            buttonClassName="stats-shell__profile app-profile-chip"
            onChange={onSelectProfile}
          />
        </div>

        <header className="stats-memory-header">
          <div className="stats-memory-heading">
            <span className="stats-memory-heading__icon"><BrainCircuit aria-hidden="true" /></span>
            <div>
              <p>个人记忆模型</p>
              <h1>学习统计</h1>
            </div>
          </div>
          <div className="stats-memory-tabs" role="tablist" aria-label="统计类别">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={activeTab === tab.id ? 'is-active' : ''}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon aria-hidden="true" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </header>

        <section className="stats-memory-content">
          {activeTab === 'forgetting' && (
            <div className="stats-tab-panel stats-tab-panel--forgetting" role="tabpanel">
              <div className="stats-memory-main-grid stats-memory-main-grid--forgetting">
                <section className="memory-panel memory-panel--curve">
                  <div className="memory-panel__header">
                    <div>
                      <h2>个人遗忘曲线</h2>
                      <p>
                        {memory.personalCurveModel.source === 'answer-data'
                          ? `基于 ${memory.personalCurveModel.sampleCount} 个真实间隔样本 · 稳定性 S ${formatDayCount(memory.personalCurveModel.stabilityDays ?? 0)}`
                          : memory.personalCurveModel.sampleCount > 0
                            ? `已有 ${memory.personalCurveModel.sampleCount} 个真实间隔样本，样本不足时显示默认预测`
                            : '暂无真实间隔样本，当前显示默认预测'}
                      </p>
                    </div>
                    <div className="memory-chart-legend">
                      <span><i className="is-predicted" />答题数据预测</span>
                      <span><i className="is-reference" />艾宾浩斯记忆曲线</span>
                    </div>
                  </div>
                  <MemoryCurveChart
                    predicted={memory.predictedCurve}
                    reference={memory.ebbinghausCurve}
                  />
                </section>
              </div>
            </div>
          )}

          {activeTab === 'learning' && (
            <div className="stats-tab-panel" role="tabpanel">
              <div className="stats-memory-metrics">
                <StatMetric label="累计已学单词" value={`${learning.totalLearnedWords} 个`} note={`统计开始于 ${formatDate(historyStart)}`} tone="orange" />
                <StatMetric label="累计作答" value={`${learning.totalAnswers} 次`} note={`${learning.activeDays} 天有学习记录`} tone="blue" />
                <StatMetric label="全部历史正确率" value={learning.totalAnswers ? `${Math.round(learning.accuracy)}%` : '--'} note="基于全部逐题记录" tone="green" />
                <StatMetric label="未来 15 天" value={`${learning.forecastTotal} 个`} note={`连续完成 ${learning.streak} 天`} tone="red" />
              </div>
              <div className="stats-memory-main-grid stats-memory-main-grid--learning">
                <section className="memory-panel memory-panel--history-chart">
                  <div className="memory-panel__header">
                    <div><h2>全部学习历史</h2><p>{formatDate(historyStart)} 至今，每天实际学习的单词数</p></div>
                    <strong className="memory-panel__summary">{learning.activeDays} 个学习日</strong>
                  </div>
                  <LearningHistoryChart points={learning.history} />
                </section>
                <section className="memory-panel memory-panel--forecast-chart">
                  <div className="memory-panel__header">
                    <div><h2>未来 15 天预计学习</h2><p>从明天开始，当前排期复习词 + 每日计划新词</p></div>
                    <div className="memory-chart-legend">
                      <span><i className="is-new" />新词</span>
                      <span><i className="is-review" />复习</span>
                    </div>
                  </div>
                  <LearningForecastBars points={learning.forecast} />
                </section>
              </div>
            </div>
          )}

          {activeTab === 'durability' && (
            <div className="stats-tab-panel" role="tabpanel">
              <div className="stats-memory-metrics">
                {memory.durabilityThresholds.map((point, index) => (
                  <StatMetric
                    key={point.thresholdDays}
                    label={`记忆 ≥ ${point.thresholdDays} 天`}
                    value={`${point.count} 个`}
                    note="按当前单词半衰期统计"
                    tone={(['blue', 'green', 'orange', 'red'] as const)[index]}
                  />
                ))}
              </div>
              <div className="stats-memory-main-grid stats-memory-main-grid--durability">
                <section className="memory-panel memory-panel--durability">
                  <div className="memory-panel__header"><div><h2>记忆持久度折线图</h2><p>横轴为记忆天数门槛，纵轴为达到该门槛的单词数量</p></div></div>
                  <DurabilityLineChart points={memory.durabilityThresholds} />
                </section>
                <aside className="memory-side-stack">
                  <section className="memory-panel memory-panel--compact">
                    <div className="memory-panel__header"><h2>当前记忆概况</h2><button type="button" onClick={onOpenSelection}>查看词库</button></div>
                    <dl className="memory-definition-list">
                      <div><dt>平均半衰期</dt><dd>{formatDayCount(memory.averageHalfLifeDays)}</dd></div>
                      <div><dt>中位半衰期</dt><dd>{formatDayCount(memory.medianHalfLifeDays)}</dd></div>
                      <div><dt>已建立记忆</dt><dd>{memory.estimates.length} / {payload.wordCount}</dd></div>
                    </dl>
                  </section>
                  <section className="memory-panel memory-panel--note">
                    <strong>折线为什么向下？</strong>
                    <p>门槛越高，能保持这么久的单词自然越少。答对并拉开间隔后，单词会逐步跨过 10、30、60、90 天门槛。</p>
                  </section>
                </aside>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
