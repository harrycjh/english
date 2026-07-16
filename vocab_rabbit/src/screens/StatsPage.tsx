import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
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
  type LearningLoadPoint,
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

function formatRelativeDayLabel(dateKey: string, todayKey: string): string {
  const dayMs = 24 * 60 * 60 * 1000;
  const offset = Math.round((new Date(`${dateKey}T12:00:00.000Z`).getTime() - new Date(`${todayKey}T12:00:00.000Z`).getTime()) / dayMs);
  if (offset === -2) return '前天';
  if (offset === -1) return '昨天';
  if (offset === 0) return '今天';
  if (offset === 1) return '明天';
  if (offset === 2) return '后天';
  return offset < 0 ? `${Math.abs(offset)}天前` : `${offset}天后`;
}

function LearningLoadChart({ points, todayKey }: { points: LearningLoadPoint[]; todayKey: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const mouseDragRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    lastX: number;
    lastTime: number;
    velocity: number;
  } | null>(null);
  const momentumFrameRef = useRef<number | null>(null);
  const rawMaximum = Math.max(...points.map((point) => point.totalCount), 1);
  const tickStep = Math.max(1, Math.ceil(rawMaximum / 4));
  const maximum = tickStep * 4;
  const ticks = [maximum, maximum - tickStep, maximum - (tickStep * 2), tickStep, 0];

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const scroller = scrollRef.current;
      const today = scroller?.querySelector<HTMLElement>('[data-today="true"]');
      if (!scroller || !today) return;
      scroller.scrollLeft = today.offsetLeft - ((scroller.clientWidth - today.offsetWidth) / 2);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [points.length, todayKey]);

  useEffect(() => () => {
    if (momentumFrameRef.current !== null) {
      window.cancelAnimationFrame(momentumFrameRef.current);
    }
  }, []);

  function stopMouseMomentum(scroller?: HTMLDivElement) {
    if (momentumFrameRef.current !== null) {
      window.cancelAnimationFrame(momentumFrameRef.current);
      momentumFrameRef.current = null;
    }
    scroller?.classList.remove('is-gliding');
  }

  function startMouseMomentum(scroller: HTMLDivElement, initialVelocity: number) {
    if (Math.abs(initialVelocity) < 0.06 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    let velocity = Math.max(-2.8, Math.min(2.8, initialVelocity));
    let lastFrameTime = window.performance.now();
    scroller.classList.add('is-gliding');

    function glide(frameTime: number) {
      const elapsed = Math.min(34, frameTime - lastFrameTime);
      lastFrameTime = frameTime;
      const previousScrollLeft = scroller.scrollLeft;
      scroller.scrollLeft += velocity * elapsed;
      const reachedEdge = Math.abs(scroller.scrollLeft - previousScrollLeft) < 0.5;
      velocity *= Math.pow(0.96, elapsed / 16.67);

      if (Math.abs(velocity) < 0.018 || reachedEdge) {
        stopMouseMomentum(scroller);
        return;
      }
      momentumFrameRef.current = window.requestAnimationFrame(glide);
    }

    momentumFrameRef.current = window.requestAnimationFrame(glide);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    stopMouseMomentum(event.currentTarget);
    mouseDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: event.currentTarget.scrollLeft,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      velocity: 0,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.classList.add('is-dragging');
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = mouseDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.currentTarget.scrollLeft = drag.startScrollLeft - (event.clientX - drag.startX);
    const elapsed = Math.max(1, event.timeStamp - drag.lastTime);
    const instantaneousVelocity = -(event.clientX - drag.lastX) / elapsed;
    drag.velocity = (drag.velocity * 0.35) + (instantaneousVelocity * 0.65);
    drag.lastX = event.clientX;
    drag.lastTime = event.timeStamp;
  }

  function finishPointerDrag(event: ReactPointerEvent<HTMLDivElement>, shouldGlide: boolean) {
    const drag = mouseDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    mouseDragRef.current = null;
    event.currentTarget.classList.remove('is-dragging');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (shouldGlide) {
      startMouseMomentum(event.currentTarget, drag.velocity);
    }
  }

  return (
    <div className="learning-load-chart" role="group" aria-label="每日复习词与新认识词堆叠柱状图">
      <div className="learning-load-chart__axis" aria-hidden="true">
        <div className="learning-load-chart__scale">
          {ticks.map((tick) => <span key={tick}>{tick}</span>)}
        </div>
        <small>词数</small>
      </div>
      <div
        className="learning-load-chart__scroll"
        ref={scrollRef}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finishPointerDrag(event, true)}
        onPointerCancel={(event) => finishPointerDrag(event, false)}
      >
        <div className="learning-load-chart__plot" style={{ width: `${points.length * 48}px` }}>
          <div className="learning-load-chart__grid" aria-hidden="true">
            {ticks.map((tick) => <span key={tick} />)}
          </div>
          <div className="learning-load-chart__days">
            {points.map((point) => {
              const height = (point.totalCount / maximum) * 100;
              const relativeLabel = formatRelativeDayLabel(point.dateKey, todayKey);
              return (
                <div
                  className={`learning-load-day learning-load-day--${point.kind}`}
                  data-today={point.kind === 'today' ? 'true' : undefined}
                  key={point.dateKey}
                  title={`${formatDate(point.dateKey)}：复习 ${point.reviewCount}，新认识 ${point.newCount}`}
                >
                  <div className="learning-load-day__plot">
                    {point.totalCount > 0 && (
                      <strong style={{ bottom: `calc(${height}% + 8px)` }}>{point.totalCount}</strong>
                    )}
                    <div className="learning-load-day__stack" style={{ height: `${height}%` }}>
                      {point.newCount > 0 && <span className="learning-load-day__new" style={{ flexGrow: point.newCount }} />}
                      {point.reviewCount > 0 && <span className="learning-load-day__review" style={{ flexGrow: point.reviewCount }} />}
                    </div>
                  </div>
                  <span className="learning-load-day__label">{relativeLabel}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
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
            <div className="stats-tab-panel stats-tab-panel--learning" role="tabpanel">
              <section className="memory-panel memory-panel--learning-load">
                <div className="memory-panel__header">
                  <div>
                    <h2>每日学习负荷</h2>
                    <p>当天待复习词与新认识词的叠加数量</p>
                  </div>
                  <div className="memory-chart-legend">
                    <span><i className="is-review" />复习词</span>
                    <span><i className="is-new" />新认识词</span>
                  </div>
                </div>
                <LearningLoadChart points={learning.timeline} todayKey={task.dateKey} />
              </section>
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
