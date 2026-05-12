import { type ReactNode, useEffect, useState } from 'react';
import type { DailyTaskSummary } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import type { ParentSetting } from '../models/parent-setting';
import {
  createDefaultWordSelectionState,
  normalizeWordSelectionState,
  type WordSelectionState,
} from '../models/word-selection-state';
import type { WordPayload } from '../models/word';
import { HeatmapCalendar } from '../components/HeatmapCalendar';
import { WordDetailDrawer } from '../components/WordDetailDrawer';
import { APP_VERSION } from '../config/app-meta';
import { getPrimaryOxfordRefLabel, getStudyText } from '../services/word-service';

type ReviewPreviewWord = WordPayload['words'][number];
type ReviewDockGlyph = 'review' | 'selection' | 'stats' | 'settings';

const REVIEW_FRAME_WIDTH = 1158;
const REVIEW_FRAME_HEIGHT = 808;
const REVIEW_VIEWPORT_GAP = 24;

interface ReviewMetricCardProps {
  tone: 'task' | 'time' | 'theme' | 'heatmap';
  label: string;
  value?: string;
  note: string;
  children?: ReactNode;
}

interface ReviewSummaryPillProps {
  tone: 'library' | 'mastered' | 'completion';
  label: string;
  value: string;
}

interface ReviewPreviewCardProps {
  word: ReviewPreviewWord;
  index: number;
  onOpenDetails: () => void;
}

interface ReviewAdviceCardProps {
  accent: 'tea' | 'bars' | 'bag';
  label: string;
  value: string;
  description: string;
}

interface ReviewDockButtonProps {
  active?: boolean;
  glyph: ReviewDockGlyph;
  label: string;
  onClick: () => void;
}

function ReviewMetricCard({ tone, label, value, note, children }: ReviewMetricCardProps) {
  return (
    <article className={`review-metric-card review-metric-card--${tone}`}>
      <div className="review-metric-card__icon" aria-hidden="true" />
      <div className="review-metric-card__content">
        <span>{label}</span>
        {value ? <strong>{value}</strong> : null}
        <small>{note}</small>
        {children}
      </div>
    </article>
  );
}

function ReviewSummaryPill({ tone, label, value }: ReviewSummaryPillProps) {
  return (
    <span className={`review-summary-pill review-summary-pill--${tone}`}>
      <span className="review-summary-pill__icon" aria-hidden="true" />
      <span className="review-summary-pill__body">
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
    </span>
  );
}

function ReviewPreviewCard({ word, index, onOpenDetails }: ReviewPreviewCardProps) {
  const oxfordLabel = getPrimaryOxfordRefLabel(word);
  const artVariant = ['family', 'hello', 'body', 'spark'][index % 4];

  return (
    <button
      className={`review-preview-card review-preview-card--${artVariant}`}
      type="button"
      onClick={onOpenDetails}
    >
      <div className="review-preview-card__art" aria-hidden="true">
        <span className="review-preview-card__index">{index + 1}</span>
        <span className="review-preview-card__favorite" />
        <span className="review-preview-card__art-badge">今日预览</span>
        <span className="review-preview-card__art-word">{getStudyText(word)}</span>
      </div>
      <div className="review-preview-card__body">
        <div className="review-preview-card__row">
          <span className="review-preview-card__category">{word.category}</span>
          <span className="review-preview-card__difficulty">Lv.{word.difficulty}</span>
        </div>
        <strong>{getStudyText(word)}</strong>
        <p>{word.chinese}</p>
        <footer>
          <span>{word.partOfSpeech}</span>
          <span>{oxfordLabel ? `Oxford Tree · ${oxfordLabel}` : 'Oxford Tree · 暂未回填'}</span>
        </footer>
      </div>
    </button>
  );
}

function ReviewAdviceCard({ accent, label, value, description }: ReviewAdviceCardProps) {
  return (
    <article className={`review-advice-card review-advice-card--${accent}`}>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <p>{description}</p>
      </div>
      <div className="review-advice-card__art" aria-hidden="true">
        <span />
      </div>
    </article>
  );
}

function ReviewDockButton({ active = false, glyph, label, onClick }: ReviewDockButtonProps) {
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

interface ReviewPageProps {
  payload: WordPayload;
  task: DailyTaskSummary;
  setting: ParentSetting;
  recordsById: Record<string, LearningRecord>;
  selectionById: Record<string, WordSelectionState>;
  masteredCount: number;
  recentTasks: DailyTaskSummary[];
  previewWords: WordPayload['words'];
  onStart: () => void;
  onOpenSelection: () => void;
  onOpenStats: () => void;
  onOpenSettings: () => void;
  onSaveSelectionStates: (states: WordSelectionState[]) => Promise<void>;
}

export function ReviewPage({
  payload,
  task,
  setting,
  recordsById,
  selectionById,
  masteredCount,
  recentTasks,
  previewWords,
  onStart,
  onOpenSelection,
  onOpenStats,
  onOpenSettings,
  onSaveSelectionStates,
}: ReviewPageProps) {
  const plannedCount = task.newWordIds.length + task.reviewWordIds.length;
  const completedDays = recentTasks.filter((recentTask) => recentTask.completedAt).length;
  const completionRate = Math.round((completedDays / 14) * 100);
  const previewCategoryCount = new Set(previewWords.map((word) => word.category)).size;
  const estimatedMinutes = Math.max(6, plannedCount * 2);
  const hasStarted = task.totalAnswered > 0 && !task.completedAt;
  const reviewLoad = task.reviewWordIds.length;
  const isReviewHeavy = reviewLoad >= task.newWordIds.length;
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [reviewScale, setReviewScale] = useState(1);

  const heroBadge = task.completedAt ? '今日完成 · 复习页' : hasStarted ? '进行中 · 复习页' : '今日任务 · 复习页';
  const primaryActionLabel = task.completedAt ? '再复习一轮' : hasStarted ? '继续今日学习' : '开始今日学习';
  const heroDescription = task.completedAt
    ? '今天的新词和复习词都已经完成，可以回看代表词，或者再练一轮薄弱词。'
    : hasStarted
      ? `今天安排 ${task.newWordIds.length} 个新词、${task.reviewWordIds.length} 个复习词。你已经答了 ${task.totalAnswered} 题，继续就能接上刚才的节奏。`
      : `新增学习 ${task.newWordIds.length} 个，复习巩固 ${task.reviewWordIds.length} 个，稳步提升词汇量。`;
  const focusLabel = task.completedAt ? '今日完成' : isReviewHeavy ? '先做复习' : '可以加新词';
  const focusDescription = task.completedAt
    ? '今天已经完成，可以轻松回看。'
    : isReviewHeavy
      ? '复习词比新词多，建议先完成复习部分。'
      : '今天节奏正常，适合直接开始。';
  const suggestionTitle = task.completedAt ? '今天可以轻松回看' : isReviewHeavy ? '今天建议先做复习' : '今天可以正常加入新词';
  const suggestionText = task.completedAt
    ? '已经完成的任务不用再压速度，优先回看刚答错或还不稳的词。'
    : isReviewHeavy
      ? '复习量已经接近今天的主任务，先把旧词做完会更稳。'
      : '今天新词和复习词比较平衡，适合一口气完成。';
  const pressureLevel = reviewLoad > setting.dailyReviewLimit
    ? '偏高'
    : reviewLoad >= Math.ceil(setting.dailyReviewLimit * 0.7)
      ? '正常偏高'
      : '正常';
  const pressureText = reviewLoad > setting.dailyReviewLimit
    ? '今天复习量已经超过默认上限，后续适合降低新词节奏。'
    : reviewLoad >= Math.ceil(setting.dailyReviewLimit * 0.7)
      ? '今天复习量接近上限，完成后就不要再额外加太多词。'
      : '今天复习量在舒适区，完成后节奏会比较稳。';
  const focusWord = previewWords[0] ?? null;
  const focusCardTitle = focusWord ? focusWord.category : focusLabel;
  const focusCardText = focusWord
    ? `${getStudyText(focusWord)} 会作为代表词，先帮孩子进入今天的主题。`
    : focusDescription;
  const selectedWord = selectedWordId ? previewWords.find((word) => word.id === selectedWordId) ?? null : null;
  const selectedWordRecord = selectedWord ? recordsById[selectedWord.id] : undefined;
  const selectedWordSelectionState = selectedWord ? selectionById[selectedWord.id] : undefined;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    function syncReviewScale() {
      const shellMode = document.documentElement.dataset.shellMode;

      if (shellMode === 'ipad-fixed') {
        setReviewScale(1);
        return;
      }

      const availableWidth = Math.max(window.innerWidth - REVIEW_VIEWPORT_GAP, 320);
      const availableHeight = Math.max(window.innerHeight - REVIEW_VIEWPORT_GAP, 320);
      const nextScale = Math.min(1, availableWidth / REVIEW_FRAME_WIDTH, availableHeight / REVIEW_FRAME_HEIGHT);

      setReviewScale(nextScale > 0 && Number.isFinite(nextScale) ? nextScale : 1);
    }

    syncReviewScale();
    window.addEventListener('resize', syncReviewScale);
    window.addEventListener('orientationchange', syncReviewScale);

    return () => {
      window.removeEventListener('resize', syncReviewScale);
      window.removeEventListener('orientationchange', syncReviewScale);
    };
  }, [setting.preferLandscape]);

  const scaledFrameWidth = Math.round(REVIEW_FRAME_WIDTH * reviewScale);
  const scaledFrameHeight = Math.round(REVIEW_FRAME_HEIGHT * reviewScale);

  function scrollToSection(sectionId: string) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function savePatchedSelectionStates(states: Array<Partial<WordSelectionState> & Pick<WordSelectionState, 'wordId'>>) {
    const nextStates = states.map((state) => {
      const currentState = selectionById[state.wordId] ?? createDefaultWordSelectionState(state.wordId);
      return normalizeWordSelectionState({
        ...currentState,
        ...state,
        updatedAt: new Date().toISOString(),
      });
    });

    await onSaveSelectionStates(nextStates);
  }

  return (
    <main className="page page--review">
      <div
        className="review-mockup-frame"
        style={{
          width: `${scaledFrameWidth}px`,
          minWidth: `${scaledFrameWidth}px`,
          height: `${scaledFrameHeight}px`,
          minHeight: `${scaledFrameHeight}px`,
        }}
      >
        <div
          className="review-dom-surface"
          style={{
            position: 'relative',
            width: `${REVIEW_FRAME_WIDTH}px`,
            height: `${REVIEW_FRAME_HEIGHT}px`,
            transform: `scale(${reviewScale})`,
            transformOrigin: 'top left',
          }}
        >
          <section className="review-plan-shell" id="review-top">
            <div className="review-plan-shell__chrome">
              <div className="review-plan-shell__brand">
                <span className="review-plan-shell__brand-mark" aria-hidden="true" />
                <span className="review-plan-shell__brand-wordmark">VocaRabbit</span>
                <span className="app-version-badge">{APP_VERSION}</span>
              </div>
              <button className="review-plan-shell__profile" type="button" onClick={onOpenSettings}>
                <span className="review-plan-shell__profile-avatar" aria-hidden="true" />
                <span className="review-plan-shell__profile-label">小树的家长版</span>
              </button>
            </div>

            <div className="review-plan-shell__hero">
              <div className="review-mascot-card" aria-hidden="true">
                <div className="review-mascot-scene">
                  <span className="review-mascot-scene__sun" />
                  <span className="review-mascot-scene__cloud review-mascot-scene__cloud--one" />
                  <span className="review-mascot-scene__cloud review-mascot-scene__cloud--two" />
                  <div className="review-bunny">
                    <span className="review-bunny__ear review-bunny__ear--left" />
                    <span className="review-bunny__ear review-bunny__ear--right" />
                    <span className="review-bunny__body" />
                    <span className="review-bunny__face" />
                    <span className="review-bunny__scarf" />
                  </div>
                </div>
              </div>

              <div className="review-plan-shell__headline">
                <div className="review-plan-shell__eyebrow-row">
                  <span className="review-plan-shell__whisper">坚持每天进步一点点</span>
                  <span className="review-plan-shell__tag">{heroBadge}</span>
                </div>
                <h1>今日学习计划</h1>
                <p>{heroDescription}</p>
                <div className="review-summary-pills" aria-label="复习页摘要">
                  <ReviewSummaryPill tone="library" value={payload.wordCount.toLocaleString('en-US')} label="总词汇" />
                  <ReviewSummaryPill tone="mastered" value={String(masteredCount)} label="已掌握" />
                  <ReviewSummaryPill tone="completion" value={`${completionRate}%`} label="14 天完成率" />
                </div>
              </div>

              <aside className="review-focus-card">
                <span className="review-focus-card__label">今日重点</span>
                <strong>{focusCardTitle}</strong>
                <p>{focusCardText}</p>
                <button className="primary-button review-focus-card__button" type="button" onClick={onStart}>
                  {primaryActionLabel}
                </button>
                <div className="review-focus-card__art" aria-hidden="true">
                  <span className="review-focus-card__roof" />
                  <span className="review-focus-card__house" />
                  <span className="review-focus-card__tree" />
                  <span className="review-focus-card__path" />
                </div>
              </aside>
            </div>
          </section>

          <section className="review-metric-grid" id="review-summary-section">
            <ReviewMetricCard
              tone="task"
              label="今日任务"
              value={`${plannedCount} 个`}
              note={`新词 ${task.newWordIds.length} · 复习 ${task.reviewWordIds.length}`}
            />
            <ReviewMetricCard
              tone="time"
              label="预计时长"
              value={`${estimatedMinutes} 分钟`}
              note={hasStarted ? '继续就能接上刚才节奏' : '建议一次学完更轻松'}
            />
            <ReviewMetricCard
              tone="theme"
              label="预览主题"
              value={`${previewCategoryCount || payload.categoryCount} 个`}
              note={previewCategoryCount > 0 ? '家庭、身份、身体、表达' : '开始学习后这里会更准确'}
            />
            <ReviewMetricCard
              tone="heatmap"
              label="14 天学习热力图"
              note={completedDays > 0 ? `最近 14 天已完成 ${completedDays} 天` : '还没有形成连续学习记录'}
            >
              <HeatmapCalendar tasks={recentTasks} />
            </ReviewMetricCard>
          </section>

          <section className="review-panel" id="review-preview-section">
            <div className="review-panel__header">
              <h2>今日预览</h2>
              <p>先看 4 个代表词，再进入正式学习会更顺。</p>
            </div>
            {previewWords.length > 0 ? (
              <div className="review-preview-grid">
                {previewWords.slice(0, 4).map((word, index) => (
                  <ReviewPreviewCard
                    key={word.id}
                    word={word}
                    index={index}
                    onOpenDetails={() => setSelectedWordId(word.id)}
                  />
                ))}
              </div>
            ) : (
              <article className="review-empty-state">
                <strong>今天还没有代表词</strong>
                <p>开始一次学习后，这里会自动挑出今天最值得先看的 4 个词。</p>
              </article>
            )}
          </section>

          <section className="review-panel" id="review-guidance-section">
            <div className="review-panel__header">
              <h2>轻量建议</h2>
              <p>先给家长一个清楚判断，再决定是否加量。</p>
            </div>
            <div className="review-advice-grid">
              <ReviewAdviceCard accent="tea" label="今日建议" value={suggestionTitle} description={suggestionText} />
              <ReviewAdviceCard accent="bars" label="未来压力" value={pressureLevel} description={pressureText} />
              <ReviewAdviceCard
                accent="bag"
                label="当前学习设置"
                value={`${setting.dailyNewWordCount} 新词 · ${setting.dailyReviewLimit} 复习`}
                description={`${setting.enableAudio ? '发音已开启。' : '发音已关闭。'}${setting.showImages ? ' 图片题可用。' : ' 图片题已关闭。'}`}
              />
            </div>
          </section>

          <nav className="home-dock review-dock" aria-label="主页面导航">
            <ReviewDockButton active glyph="review" label="复习" onClick={() => scrollToSection('review-top')} />
            <ReviewDockButton glyph="selection" label="选词" onClick={onOpenSelection} />
            <ReviewDockButton glyph="stats" label="统计" onClick={onOpenStats} />
            <ReviewDockButton glyph="settings" label="设置" onClick={onOpenSettings} />
          </nav>
        </div>
      </div>

      <WordDetailDrawer
        isOpen={Boolean(selectedWord)}
        word={selectedWord}
        record={selectedWordRecord}
        selectionState={selectedWordSelectionState}
        setting={setting}
        context="review"
        onClose={() => setSelectedWordId(null)}
        onToggleEnabled={
          selectedWord
            ? () =>
                void savePatchedSelectionStates([
                  {
                    wordId: selectedWord.id,
                    isEnabled: !(selectedWordSelectionState?.isEnabled ?? true),
                    isPaused: false,
                  },
                ])
            : undefined
        }
        onTogglePaused={
          selectedWord
            ? () =>
                void savePatchedSelectionStates([
                  {
                    wordId: selectedWord.id,
                    isEnabled: true,
                    isPaused: !(selectedWordSelectionState?.isPaused ?? false),
                  },
                ])
            : undefined
        }
      />
    </main>
  );
}