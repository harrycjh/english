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
  type MasteryLevelAccuracyPoint,
  type MasteryLevelPoint,
  type MasteryLevelTimelinePoint,
  type RetentionPoint,
} from '../services/memory-statistics';
import {
  aggregateMasteryLevelTimeline,
  aggregateLearningLoadTimeline,
  getStatisticsBucketKey,
  type StatisticsTimeScale,
} from '../services/statistics-time-buckets';
import { formatStudyDuration } from '../services/study-duration';

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
type DurabilityView = StatisticsTimeScale | 'level';

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

function formatTimelineLabel(dateKey: string, todayKey: string, scale: StatisticsTimeScale): string {
  if (scale === 'day') return formatRelativeDayLabel(dateKey, todayKey);
  if (scale === 'week') {
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const currentWeek = getStatisticsBucketKey(todayKey, 'week');
    const offset = Math.round(
      (new Date(`${dateKey}T12:00:00.000Z`).getTime() - new Date(`${currentWeek}T12:00:00.000Z`).getTime()) / weekMs,
    );
    if (offset === -1) return '上周';
    if (offset === 0) return '本周';
    if (offset === 1) return '下周';
    return offset < 0 ? `${Math.abs(offset)}周前` : `${offset}周后`;
  }

  const date = new Date(`${dateKey}T12:00:00.000Z`);
  const today = new Date(`${todayKey}T12:00:00.000Z`);
  const offset = (date.getUTCFullYear() - today.getUTCFullYear()) * 12
    + date.getUTCMonth() - today.getUTCMonth();
  if (offset === -1) return '上月';
  if (offset === 0) return '本月';
  if (offset === 1) return '下月';
  return offset < 0 ? `${Math.abs(offset)}月前` : `${offset}月后`;
}

function TimeScaleSwitch({ value, onChange, label }: {
  value: StatisticsTimeScale;
  onChange: (value: StatisticsTimeScale) => void;
  label: string;
}) {
  const options: Array<{ value: StatisticsTimeScale; label: string }> = [
    { value: 'day', label: '日' },
    { value: 'week', label: '周' },
    { value: 'month', label: '月' },
  ];
  return (
    <div className="stats-time-scale-switch" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={value === option.value ? 'is-active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function DurabilityViewSwitch({ value, onChange }: {
  value: DurabilityView;
  onChange: (value: DurabilityView) => void;
}) {
  const options: Array<{ value: DurabilityView; label: string }> = [
    { value: 'day', label: '日' },
    { value: 'week', label: '周' },
    { value: 'month', label: '月' },
    { value: 'level', label: 'Lv' },
  ];

  return (
    <div className="stats-time-scale-switch stats-time-scale-switch--durability" role="group" aria-label="记忆持久度统计维度">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={value === option.value ? 'is-active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function useInertialTimelineScroll() {
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

  return {
    scrollRef,
    pointerHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => finishPointerDrag(event, true),
      onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => finishPointerDrag(event, false),
    },
  };
}

function LearningLoadChart({ points, todayKey, scale }: {
  points: LearningLoadPoint[];
  todayKey: string;
  scale: StatisticsTimeScale;
}) {
  const { scrollRef, pointerHandlers } = useInertialTimelineScroll();
  const columnWidth = scale === 'day' ? 48 : scale === 'week' ? 72 : 96;
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
  }, [points.length, scrollRef, todayKey]);

  return (
      <div className="learning-load-chart" role="group" aria-label="每日实际与预测学习负荷堆叠柱状图">
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
        {...pointerHandlers}
      >
        <div className="learning-load-chart__plot" style={{ width: `max(100%, ${points.length * columnWidth}px)` }}>
          <div className="learning-load-chart__grid" aria-hidden="true">
            {ticks.map((tick) => <span key={tick} />)}
          </div>
          <div className="learning-load-chart__days" style={{ gridAutoColumns: `minmax(${columnWidth - 2}px, 1fr)` }}>
            {points.map((point) => {
              const height = (point.totalCount / maximum) * 100;
              const relativeLabel = formatTimelineLabel(point.dateKey, todayKey, scale);
              return (
                <div
                  className={`learning-load-day learning-load-day--${point.kind}`}
                  data-today={point.kind === 'today' ? 'true' : undefined}
                  data-kind={point.kind}
                  key={point.dateKey}
                  title={`${formatDate(point.dateKey)}：复习 ${point.reviewCount}，新认识 ${point.newCount}${point.deferredReviewCount > 0 ? `，顺延复习 ${point.deferredReviewCount}` : ''}${point.durationMs > 0 ? `，用时 ${formatStudyDuration(point.durationMs)}` : ''}${point.kind === 'forecast' ? '（预测）' : '（实际）'}`}
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

function MasteryLevelLineChart({ timeline, levels, todayKey, scale }: {
  timeline: MasteryLevelTimelinePoint[];
  levels: MasteryLevelPoint[];
  todayKey: string;
  scale: StatisticsTimeScale;
}) {
  const { scrollRef, pointerHandlers } = useInertialTimelineScroll();
  const dayWidth = scale === 'day' ? 48 : scale === 'week' ? 72 : 96;
  const width = Math.max(dayWidth, timeline.length * dayWidth);
  const height = 430;
  const top = 36;
  const bottom = 46;
  const plotHeight = height - top - bottom;
  const rawMaximum = Math.max(
    ...timeline.flatMap((point) => levels.map((level) => point.counts[level.level] ?? 0)),
    1,
  );
  const tickStep = Math.max(1, Math.ceil(rawMaximum / 4));
  const maximum = tickStep * 4;
  const ticks = [maximum, maximum - tickStep, maximum - (tickStep * 2), tickStep, 0];
  const xForIndex = (index: number) => index * dayWidth + dayWidth / 2;
  const yForCount = (count: number) => top + (1 - count / maximum) * plotHeight;
  const pathForLevel = (level: number) => timeline.map((point, index) => {
    const prefix = index === 0 ? 'M' : 'L';
    return `${prefix} ${xForIndex(index).toFixed(1)} ${yForCount(point.counts[level] ?? 0).toFixed(1)}`;
  }).join(' ');
  const currentBucketKey = getStatisticsBucketKey(todayKey, scale);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const scroller = scrollRef.current;
      if (!scroller) return;
      scroller.scrollLeft = scroller.scrollWidth - scroller.clientWidth;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [scrollRef, timeline.length, todayKey]);

  return (
    <div className="durability-timeline-chart" role="group" aria-label="每日各学习等级单词数量曲线图">
      <div className="durability-timeline-chart__axis" aria-hidden="true">
        <div className="durability-timeline-chart__scale">
          {ticks.map((tick) => <span key={tick}>{tick}</span>)}
        </div>
        <small>词数</small>
      </div>
      <div
        className="durability-timeline-chart__scroll"
        ref={scrollRef}
        tabIndex={0}
        {...pointerHandlers}
      >
        <div
          className="durability-timeline-chart__plot"
          style={{ width: `max(100%, ${width}px)` }}
        >
          <svg
            className="memory-durability-chart"
            width={width}
            height="100%"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="过去九十天每天各学习等级的单词数量"
          >
            {ticks.map((tick) => (
              <line key={tick} x1={0} y1={yForCount(tick)} x2={width} y2={yForCount(tick)} className="memory-chart-grid" />
            ))}
            <rect
              x={Math.max(0, width - dayWidth)}
              y={top}
              width={dayWidth}
              height={plotHeight}
              className="memory-durability-today"
            />
            {levels.map((level) => (
              <path
                key={level.level}
                d={pathForLevel(level.level)}
                className="memory-durability-line"
                style={{ stroke: level.color }}
              />
            ))}
            {levels.map((level) => {
              const currentCount = timeline.at(-1)?.counts[level.level] ?? 0;
              if (currentCount === 0) return null;
              return (
                <circle
                  key={level.level}
                  cx={xForIndex(timeline.length - 1)}
                  cy={yForCount(currentCount)}
                  r="5"
                  className="memory-durability-node"
                  style={{ fill: level.color }}
                />
              );
            })}
          </svg>
          <div
            className="durability-timeline-chart__labels"
            style={{ gridTemplateColumns: `repeat(${timeline.length}, minmax(0, 1fr))` }}
          >
            {timeline.map((point) => (
              <span
                key={point.dateKey}
                className={point.dateKey === currentBucketKey ? 'is-today' : ''}
                title={`${formatDate(point.dateKey)}：${levels.map((level) => `Lv.${level.level} ${point.counts[level.level] ?? 0}词`).join('，')}`}
              >
                {formatTimelineLabel(point.dateKey, todayKey, scale)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MasteryLevelAccuracyChart({ points }: {
  points: MasteryLevelAccuracyPoint[];
}) {
  const width = 1120;
  const height = 430;
  const left = 58;
  const right = 24;
  const top = 30;
  const bottom = 58;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const yTicks = [100, 75, 50, 25, 0];
  const xForLevel = (level: number) => left + (level / 10) * plotWidth;
  const yForAccuracy = (accuracy: number) => top + ((100 - accuracy) / 100) * plotHeight;
  const availablePoints = points.filter(
    (point): point is MasteryLevelAccuracyPoint & { accuracy: number } => point.accuracy !== null,
  );
  const linePath = availablePoints.map((point, index) => (
    `${index === 0 ? 'M' : 'L'} ${xForLevel(point.level).toFixed(1)} ${yForAccuracy(point.accuracy).toFixed(1)}`
  )).join(' ');

  return (
    <div className="mastery-accuracy-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Lv0到Lv10平均回答正确率折线图"
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={left}
              y1={yForAccuracy(tick)}
              x2={width - right}
              y2={yForAccuracy(tick)}
              className="memory-chart-grid"
            />
            <text
              x={left - 12}
              y={yForAccuracy(tick) + 4}
              textAnchor="end"
              className="memory-chart-label"
            >
              {tick}%
            </text>
          </g>
        ))}
        {linePath ? <path d={linePath} className="mastery-accuracy-chart__line" /> : null}
        {points.map((point) => (
          <g key={point.level}>
            {point.accuracy !== null ? (
              <>
                <circle
                  cx={xForLevel(point.level)}
                  cy={yForAccuracy(point.accuracy)}
                  r="7"
                  className="mastery-accuracy-chart__node"
                  style={{ fill: point.color }}
                />
                <text
                  x={xForLevel(point.level)}
                  y={yForAccuracy(point.accuracy) - 15}
                  textAnchor="middle"
                  className="mastery-accuracy-chart__value"
                >
                  {Math.round(point.accuracy)}%
                </text>
              </>
            ) : null}
            <text
              x={xForLevel(point.level)}
              y={height - 18}
              textAnchor="middle"
              className="memory-chart-label"
            >
              Lv{point.level}
            </text>
          </g>
        ))}
      </svg>
      {availablePoints.length === 0 ? (
        <p className="mastery-accuracy-chart__empty">完成正式答题后，这里会显示各等级的平均正确率。</p>
      ) : null}
    </div>
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
  onSelectProfile,
}: StatsPageProps) {
  const [activeTab, setActiveTab] = useState<StatsTab>('learning');
  const [learningTimeScale, setLearningTimeScale] = useState<StatisticsTimeScale>('day');
  const [durabilityView, setDurabilityView] = useState<DurabilityView>('day');
  const durabilityTimeScale: StatisticsTimeScale = durabilityView === 'level' ? 'day' : durabilityView;
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
  const learningTimeline = useMemo(
    () => aggregateLearningLoadTimeline(learning.timeline, learningTimeScale),
    [learning.timeline, learningTimeScale],
  );
  const masteryLevelTimeline = useMemo(
    () => aggregateMasteryLevelTimeline(memory.masteryLevelTimeline, durabilityTimeScale),
    [durabilityTimeScale, memory.masteryLevelTimeline],
  );
  const studyTime = useMemo(() => {
    const recent = learning.history.slice(-7);
    return {
      today: learning.todayStudyDurationMs,
      recentTotal: recent.reduce((sum, point) => sum + point.durationMs, 0),
      recentDays: recent.filter((point) => point.durationMs > 0).length,
      dailyAverage: learning.averageDailyStudyDurationMs,
      total: learning.totalStudyDurationMs,
      perQuestion: learning.averageQuestionDurationMs,
    };
  }, [
    learning.averageDailyStudyDurationMs,
    learning.averageQuestionDurationMs,
    learning.history,
    learning.todayStudyDurationMs,
    learning.totalStudyDurationMs,
  ]);
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
              <section className="memory-panel memory-panel--study-time">
                <div className="memory-panel__header">
                  <div>
                    <h2>学习时长</h2>
                    <p>按每题从出现到答完的真实间隔累计，中途离开超过 2 分钟的空档不计入</p>
                  </div>
                </div>
                <dl className="study-time-summary">
                  <div className="study-time-summary__item is-today">
                    <dt>今天</dt>
                    <dd>{formatStudyDuration(studyTime.today)}</dd>
                    <small>{studyTime.today > 0 ? '今天已经学了这么久' : '今天还没开始'}</small>
                  </div>
                  <div className="study-time-summary__item">
                    <dt>近 7 天合计</dt>
                    <dd>{formatStudyDuration(studyTime.recentTotal)}</dd>
                    <small>其中 {studyTime.recentDays} 天有学习</small>
                  </div>
                  <div className="study-time-summary__item">
                    <dt>学习日均</dt>
                    <dd>{formatStudyDuration(studyTime.dailyAverage)}</dd>
                    <small>只统计真正学习过的日子</small>
                  </div>
                  <div className="study-time-summary__item">
                    <dt>累计</dt>
                    <dd>{formatStudyDuration(studyTime.total)}</dd>
                    <small>从第一次答题算起</small>
                  </div>
                  <div className="study-time-summary__item">
                    <dt>平均每题</dt>
                    <dd>{formatStudyDuration(studyTime.perQuestion)}</dd>
                    <small>含反馈动画与朗读</small>
                  </div>
                </dl>
              </section>

              <section className="memory-panel memory-panel--learning-load">
                <div className="memory-panel__header">
                  <div>
                    <h2>{learningTimeScale === 'day' ? '每日' : learningTimeScale === 'week' ? '每周' : '每月'}学习负荷</h2>
                    <p>
                      历史显示真实完成量；未来按每日新词 {learning.forecastModel.dailyNewTarget}、
                      完成率 {Math.round(learning.forecastModel.completionRate * 100)}%、分阶段题型正确率与当前记忆等级预测，新增词会滚入后续复习
                    </p>
                  </div>
                  <div className="memory-panel__chart-tools">
                    <TimeScaleSwitch
                      value={learningTimeScale}
                      onChange={setLearningTimeScale}
                      label="学习情况统计周期"
                    />
                    <div className="memory-chart-legend">
                      <span><i className="is-review" />复习词</span>
                      <span><i className="is-new" />新认识词</span>
                      <span><i className="is-forecast" />未来预测</span>
                    </div>
                  </div>
                </div>
                <LearningLoadChart
                  points={learningTimeline}
                  todayKey={task.dateKey}
                  scale={learningTimeScale}
                />
              </section>
            </div>
          )}

          {activeTab === 'durability' && (
            <div className="stats-tab-panel stats-tab-panel--durability" role="tabpanel">
              <section className="memory-panel memory-panel--durability-timeline">
                <div className="memory-panel__header">
                  <div>
                    <h2>
                      {durabilityView === 'level'
                        ? '各等级平均回答正确率'
                        : `${durabilityTimeScale === 'day' ? '每日' : durabilityTimeScale === 'week' ? '每周' : '每月'}记忆持久度`}
                    </h2>
                    <p>
                      {durabilityView === 'level'
                        ? '横轴为答题前等级，纵轴为该等级全部正式答题的平均正确率'
                        : '横轴为时间，纵轴为周期末各学习等级的单词数量；左右拖动可查看历史'}
                    </p>
                  </div>
                  <div className="memory-panel__chart-tools">
                    <DurabilityViewSwitch
                      value={durabilityView}
                      onChange={setDurabilityView}
                    />
                  </div>
                </div>
                {durabilityView === 'level' ? (
                  <MasteryLevelAccuracyChart points={memory.masteryLevelAccuracy} />
                ) : (
                  <MasteryLevelLineChart
                    timeline={masteryLevelTimeline}
                    levels={memory.masteryLevels}
                    todayKey={task.dateKey}
                    scale={durabilityTimeScale}
                  />
                )}
                <div className={`memory-chart-legend memory-chart-legend--durability${durabilityView === 'level' ? ' is-accuracy' : ''}`}>
                  {memory.masteryLevels.map((point) => {
                    const accuracy = memory.masteryLevelAccuracy[point.level];
                    return (
                      <span key={point.level}>
                        <i style={{ background: point.color }} />
                        Lv.{point.level} · {point.count}
                        {durabilityView === 'level'
                          ? ` · ${accuracy.answerCount > 0 ? `${Math.round(accuracy.accuracy!)}% / ${accuracy.answerCount}题` : '暂无答题'}`
                          : ''}
                      </span>
                    );
                  })}
                </div>
              </section>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
