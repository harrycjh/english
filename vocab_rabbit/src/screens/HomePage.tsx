import { type CSSProperties, type ReactNode, useState } from 'react';
import { IPAD_STAGE_HEIGHT } from '../app/ipad-viewport';
import { useStageSize } from '../app/use-stage-size';
import type { AnswerEvent } from '../models/answer-event';
import type { DailyTaskSummary } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import type { LocalLifePhotoView } from '../models/local-media';
import type { ParentSetting, ProfileId } from '../models/parent-setting';
import {
  createDefaultWordSelectionState,
  normalizeWordSelectionState,
  type WordSelectionState,
} from '../models/word-selection-state';
import type { WordPayload } from '../models/word';
import { WordDetailDrawer } from '../components/WordDetailDrawer';
import { WordImage } from '../components/WordImage';
import { MasteryLevelIcon } from '../components/MasteryLevelIcon';
import { NewWordQueueDrawer } from '../components/NewWordQueueDrawer';
import { ReviewQueueDrawer } from '../components/ReviewQueueDrawer';
import { APP_VERSION } from '../config/app-meta';
import { ProfileSelector } from '../components/ProfileSelector';
import { buildHeatmapDays, type HeatmapDay } from '../components/HeatmapCalendar';
import { addDaysToDateKey, isTaskFullyAnswered } from '../services/task-service';
import {
  getPrimaryOxfordRefLabel,
  getStudyChinese,
  getStudyPartOfSpeech,
  getStudyText,
} from '../services/word-service';
import reviewLayoutData from '../../design-output/ui-concepts/review-page-layout.json';
import reviewSlicesManifestData from '../../design-output/ui-concepts/review-page-slices-manifest.json';
import reviewPreviewImageScales from '../data/review-preview-image-scales.json';

type ReviewPreviewWord = WordPayload['words'][number];
type ReviewSummaryTone = 'library' | 'mastered' | 'completion';
type ReviewAdviceAccent = 'tea' | 'bars' | 'bag';
type ReviewHeatmapLevel = 'empty' | 'soft' | 'warm' | 'strong';

type ReviewLayout = typeof reviewLayoutData;
type ReviewBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius?: number;
  zIndex?: number;
};
type ReviewMetricLayout = ReviewLayout['cards']['metrics'][number];
type ReviewPreviewLayout = ReviewLayout['cards']['previews'][number];
type ReviewGuidanceLayout = ReviewLayout['cards']['guidance'][number];
type ReviewSummaryLayout = ReviewLayout['modules']['summaryPills']['children'][number];
type ReviewSlicePlacement = ReviewLayout['slices'][number];

const reviewLayout = reviewLayoutData;
const reviewSliceManifest = reviewSlicesManifestData;
const reviewLayerZIndex = {
  slices: reviewLayout.layers.find((layer) => layer.id === 'slices')?.zIndex ?? 2,
  decorativeIcons: reviewLayout.layers.find((layer) => layer.id === 'decorativeIcons')?.zIndex ?? 3,
  textContent: reviewLayout.layers.find((layer) => layer.id === 'textContent')?.zIndex ?? 4,
  interactiveBadges: reviewLayout.layers.find((layer) => layer.id === 'interactiveBadges')?.zIndex ?? 5,
};
const reviewSummaryLayouts = Object.fromEntries(
  reviewLayout.modules.summaryPills.children.map((layout) => [layout.id, layout]),
) as Record<ReviewSummaryTone, ReviewSummaryLayout>;
const reviewGuidanceLayouts = Object.fromEntries(
  reviewLayout.cards.guidance.map((layout) => [layout.id, layout]),
) as Record<ReviewAdviceAccent, ReviewGuidanceLayout>;
const reviewPreviewLayouts = Object.fromEntries(
  reviewLayout.cards.previews.map((layout) => [layout.id, layout]),
) as Record<'family' | 'hello' | 'body' | 'spark', ReviewPreviewLayout>;
const reviewSlicePlacementsByFile = Object.fromEntries(
  reviewLayout.slices.map((slice) => [slice.file, slice]),
) as Record<string, ReviewSlicePlacement>;
const reviewManifestByFile = Object.fromEntries(
  reviewSliceManifest.exports.map((slice) => [slice.file, slice]),
) as Record<string, (typeof reviewSliceManifest.exports)[number]>;

const REVIEW_FRAME_WIDTH = 1158;
const REVIEW_FRAME_HEIGHT = 808;
const reviewHeroBounds = {
  x: Math.min(reviewLayout.modules.heroMascot.x, reviewLayout.modules.heroHeadline.x, reviewLayout.modules.focusCard.x),
  y: Math.min(reviewLayout.modules.heroMascot.y, reviewLayout.modules.heroHeadline.y, reviewLayout.modules.focusCard.y),
  width:
    Math.max(
      reviewLayout.modules.heroMascot.x + reviewLayout.modules.heroMascot.width,
      reviewLayout.modules.heroHeadline.x + reviewLayout.modules.heroHeadline.width,
      reviewLayout.modules.focusCard.x + reviewLayout.modules.focusCard.width,
    ) - Math.min(reviewLayout.modules.heroMascot.x, reviewLayout.modules.heroHeadline.x, reviewLayout.modules.focusCard.x),
  height:
    Math.max(
      reviewLayout.modules.heroMascot.y + reviewLayout.modules.heroMascot.height,
      reviewLayout.modules.heroHeadline.y + reviewLayout.modules.heroHeadline.height,
      reviewLayout.modules.focusCard.y + reviewLayout.modules.focusCard.height,
    ) - Math.min(reviewLayout.modules.heroMascot.y, reviewLayout.modules.heroHeadline.y, reviewLayout.modules.focusCard.y),
};
const reviewFocusArtLayout = reviewSlicePlacementsByFile['review-focus-art.png'];

function getReviewSliceUrl(file: string) {
  return `${import.meta.env.BASE_URL}design-reference/slices/${file}?v=4`;
}

function formatPreviewPartOfSpeech(partOfSpeech: string) {
  const normalized = partOfSpeech.trim().toLowerCase();
  const labels: Record<string, string> = {
    n: '名词',
    v: '动词',
    adj: '形容词',
    adv: '副词',
    pron: '代词',
    prep: '介词',
    conj: '连词',
    num: '数词',
    art: '冠词',
    int: '感叹词',
  };
  return labels[normalized] ? `${normalized}.${labels[normalized]}` : partOfSpeech;
}

function getAbsoluteBoundsStyle(bounds: ReviewBounds): CSSProperties {
  return {
    position: 'absolute',
    left: `${bounds.x}px`,
    top: `${bounds.y}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    ...(typeof bounds.borderRadius === 'number' ? { borderRadius: `${bounds.borderRadius}px` } : null),
    ...(typeof bounds.zIndex === 'number' ? { zIndex: bounds.zIndex } : null),
  };
}

function getRelativeBoundsStyle(bounds: ReviewBounds, parent: Pick<ReviewBounds, 'x' | 'y'>): CSSProperties {
  return {
    position: 'absolute',
    left: `${bounds.x - parent.x}px`,
    top: `${bounds.y - parent.y}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    ...(typeof bounds.borderRadius === 'number' ? { borderRadius: `${bounds.borderRadius}px` } : null),
    ...(typeof bounds.zIndex === 'number' ? { zIndex: bounds.zIndex } : null),
  };
}

function getRelativeTextStyle(bounds: ReviewBounds, parent: Pick<ReviewBounds, 'x' | 'y'>): CSSProperties {
  return {
    position: 'absolute',
    left: `${bounds.x - parent.x}px`,
    top: `${bounds.y - parent.y}px`,
    width: `${bounds.width}px`,
  };
}

interface ReviewSliceIconProps {
  className: string;
  file: string;
  style?: CSSProperties;
}

function ReviewSliceIcon({ className, file, style }: ReviewSliceIconProps) {
  const [hasError, setHasError] = useState(false);
  const manifestEntry = reviewManifestByFile[file];

  return (
    <span className={`${className}${hasError ? ' is-fallback' : ''}`} style={style} aria-hidden="true" data-slice-file={file}>
      {!hasError ? (
        <img
          src={getReviewSliceUrl(file)}
          alt=""
          width={manifestEntry?.display.width}
          height={manifestEntry?.display.height}
          onError={() => setHasError(true)}
        />
      ) : null}
    </span>
  );
}

interface ReviewMetricCardProps {
  tone: 'task' | 'time' | 'theme' | 'heatmap';
  label: string;
  value?: string;
  note: string;
  layout: ReviewMetricLayout;
  children?: ReactNode;
  onClick?: () => void;
}

interface ReviewSummaryPillProps {
  tone: ReviewSummaryTone;
  label: string;
  value: string;
  layout: ReviewSummaryLayout;
}

interface ReviewPreviewCardProps {
  word: ReviewPreviewWord;
  masteryLevel: number;
  index: number;
  layout: ReviewPreviewLayout;
  onOpenDetails: () => void;
}

interface ReviewAdviceCardProps {
  accent: ReviewAdviceAccent;
  label: string;
  value: string;
  description: string;
  layout: ReviewGuidanceLayout;
  onClick?: () => void;
}

function ReviewMetricCard({ tone, label, value, note, layout, children, onClick }: ReviewMetricCardProps) {
  const contentStyle = getRelativeTextStyle(layout.textSafe, layout);
  const iconAnchor = 'iconAnchor' in layout ? layout.iconAnchor : undefined;
  const heatmapBounds = 'heatmapBounds' in layout ? layout.heatmapBounds : undefined;

  const content = (
    <>
      {iconAnchor ? (
        <div
          className="review-metric-card__icon"
          aria-hidden="true"
          style={{ ...getRelativeBoundsStyle(iconAnchor, layout), zIndex: reviewLayerZIndex.decorativeIcons }}
        />
      ) : null}
      <div className={`review-metric-card__content${tone === 'heatmap' ? ' review-metric-card__content--heatmap' : ''}`} style={contentStyle}>
        <span>{label}</span>
        {value ? <strong>{value}</strong> : null}
        {note ? <small>{note}</small> : null}
      </div>
      {heatmapBounds && children ? (
        <div className="review-metric-card__extra" style={getRelativeBoundsStyle(heatmapBounds, layout)}>
          {children}
        </div>
      ) : null}
    </>
  );

  const className = `review-metric-card review-metric-card--${tone}${onClick ? ' is-actionable' : ''}`;
  const style = getRelativeBoundsStyle(layout, reviewLayout.modules.metricRow);
  return onClick ? (
    <button className={className} style={style} type="button" onClick={onClick}>{content}</button>
  ) : (
    <article className={className} style={style}>{content}</article>
  );
}

function getReviewHeatmapLevel(day: HeatmapDay): ReviewHeatmapLevel {
  return (['empty', 'soft', 'warm', 'strong'] as const)[day.intensity];
}

function ReviewTaskHeatmap({ days, currentDateKey }: { days: HeatmapDay[]; currentDateKey: string }) {
  return (
    <div className="review-reference-heatmap" aria-label="最近 14 天学习热力图">
      <div className="review-reference-heatmap__grid">
        {days.map((day) => (
          <span
            key={day.dateKey}
            className={`review-reference-heatmap__cell review-reference-heatmap__cell--${getReviewHeatmapLevel(day)}${day.dateKey === currentDateKey ? ' is-current' : ''}`}
            data-date-key={day.dateKey}
            data-answered={day.answered}
            title={`${day.dateKey}${day.answered > 0 ? ` · 已答 ${day.answered} 题 · 正确 ${day.correct} 题` : ' · 未学习'}`}
          />
        ))}
      </div>
      <div className="review-reference-heatmap__weekdays" aria-hidden="true">
        {days.slice(0, 7).map((day) => (
          <span key={day.dateKey}>{day.weekdayLabel}</span>
        ))}
      </div>
    </div>
  );
}

function ReviewSummaryPill({ tone, label, value, layout }: ReviewSummaryPillProps) {
  return (
    <span
      className={`review-summary-pill review-summary-pill--${tone}`}
      style={getRelativeBoundsStyle(layout, reviewLayout.modules.summaryPills)}
    >
      <ReviewSliceIcon
        className={`review-summary-pill__icon review-summary-pill__icon--${tone}`}
        file={layout.iconAnchor.file}
        style={{ ...getRelativeBoundsStyle(layout.iconAnchor, layout), zIndex: reviewLayerZIndex.decorativeIcons }}
      />
      <span className="review-summary-pill__body" style={getRelativeBoundsStyle(layout.textSafe, layout)}>
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
    </span>
  );
}

function ReviewPreviewCard({ word, masteryLevel, index, layout, onOpenDetails }: ReviewPreviewCardProps) {
  const oxfordLabel = getPrimaryOxfordRefLabel(word);
  const artVariant = ['family', 'hello', 'body', 'spark'][index % 4];
  const imageScale = reviewPreviewImageScales[word.id as keyof typeof reviewPreviewImageScales] ?? 1;

  return (
    <button
      className={`review-preview-card review-preview-card--${artVariant}`}
      type="button"
      onClick={onOpenDetails}
      style={{
        ...getRelativeBoundsStyle(layout, reviewLayout.modules.previewSection),
        '--review-preview-image-scale': String(imageScale),
      } as CSSProperties}
    >
      <div
        className="review-preview-card__art"
        aria-hidden="true"
        style={{
          ...getRelativeBoundsStyle(layout.artSlot, layout),
          zIndex: reviewLayerZIndex.slices,
        }}
      >
        <WordImage
          word={word}
          className="review-preview-card__word-image"
          alt=""
        />
        <span
          className="review-preview-card__index"
          style={{ ...getRelativeBoundsStyle(layout.indexBadge, layout), zIndex: reviewLayerZIndex.interactiveBadges }}
        >
          {index + 1}
        </span>
      </div>
      <MasteryLevelIcon
        level={masteryLevel}
        className="review-preview-card__favorite"
        style={{
          ...getRelativeBoundsStyle(layout.favoriteIcon, layout),
          width: '54px',
          height: '22px',
          transform: 'translateX(-32px)',
          zIndex: reviewLayerZIndex.interactiveBadges,
        }}
      />
      <div className="review-preview-card__body" style={getRelativeBoundsStyle(layout.textSafe, layout)}>
        <strong className="review-preview-card__headline" style={getRelativeTextStyle(layout.textBlocks.headline, layout.textSafe)}>
          {getStudyText(word)}
        </strong>
        <p className="review-preview-card__subtitle" style={getRelativeTextStyle(layout.textBlocks.subtitle, layout.textSafe)}>
          {getStudyChinese(word)}
        </p>
      </div>
      <span
        className="review-preview-card__pos"
        style={{
          position: 'absolute',
          left: `${layout.textBlocks.meta.x - layout.x}px`,
          top: `${layout.textBlocks.meta.y - layout.y - 3}px`,
          width: `${layout.textBlocks.meta.width}px`,
        }}
      >
        {formatPreviewPartOfSpeech(getStudyPartOfSpeech(word))}
      </span>
      <span
        className="review-preview-card__source"
        style={{
          position: 'absolute',
          left: '14px',
          bottom: '12px',
          width: `${layout.width - 28}px`,
          zIndex: reviewLayerZIndex.textContent,
        }}
      >
        {oxfordLabel ? `Oxford Tree · ${oxfordLabel}` : 'Oxford Tree · 暂未回填'}
      </span>
    </button>
  );
}

function ReviewAdviceCard({ accent, label, value, description, layout, onClick }: ReviewAdviceCardProps) {
  const artPlacement = reviewSlicePlacementsByFile[layout.artSlot.file];

  const content = (
    <>
      <div className="review-advice-card__body" style={getRelativeTextStyle(layout.textSafe, layout)}>
        <span>{label}</span>
        <strong>{value}</strong>
        {description ? <p>{description}</p> : null}
      </div>
      <div
        className="review-advice-card__art"
        aria-hidden="true"
        style={{
          ...getRelativeBoundsStyle(layout.artSlot, layout),
          zIndex: reviewLayerZIndex.slices,
          backgroundImage: `url(${getReviewSliceUrl(layout.artSlot.file)})`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center bottom',
          backgroundSize: `${artPlacement?.assetDisplayWidth ?? layout.artSlot.width}px auto`,
        }}
      />
    </>
  );

  const className = `review-advice-card review-advice-card--${accent}${onClick ? ' is-actionable' : ''}`;
  const style = getRelativeBoundsStyle(layout, reviewLayout.modules.guidanceSection);
  return onClick ? (
    <button className={className} style={style} type="button" onClick={onClick}>{content}</button>
  ) : (
    <article className={className} style={style}>{content}</article>
  );
}

interface ReviewPageProps {
  payload: WordPayload;
  task: DailyTaskSummary;
  setting: ParentSetting;
  recordsById: Record<string, LearningRecord>;
  selectionById: Record<string, WordSelectionState>;
  answerEvents: AnswerEvent[];
  masteredCount: number;
  recentTasks: DailyTaskSummary[];
  previewWords: WordPayload['words'];
  localLifePhotosById: Record<string, LocalLifePhotoView>;
  debugPickerOpen?: boolean;
  onDebugPickerOpenChange?: (open: boolean) => void;
  onStart: () => void;
  onStartDebug: (level: number | 'progression') => void;
  onAdvanceDay: () => Promise<void>;
  onSelectProfile: (profileId: ProfileId) => Promise<void>;
  onSaveSelectionStates: (states: WordSelectionState[]) => Promise<void>;
  onRequestLocalLifePhoto?: (wordId: string) => void;
  onChangeNewWordQueue?: (wordIds: string[]) => Promise<void>;
  onRemoveTodayNewWord?: (wordId: string) => Promise<void>;
  onOpenStats?: () => void;
  onOpenSettings?: () => void;
}

export function ReviewPage({
  payload,
  task,
  setting,
  recordsById,
  selectionById,
  answerEvents,
  masteredCount,
  recentTasks,
  previewWords,
  localLifePhotosById,
  debugPickerOpen,
  onDebugPickerOpenChange,
  onStart,
  onStartDebug,
  onAdvanceDay,
  onSelectProfile,
  onSaveSelectionStates,
  onRequestLocalLifePhoto,
  onChangeNewWordQueue,
  onRemoveTodayNewWord,
  onOpenStats,
  onOpenSettings,
}: ReviewPageProps) {
  const plannedCount = task.newWordIds.length + task.reviewWordIds.length;
  const heatmapTasks = [...recentTasks.filter((recentTask) => recentTask.dateKey !== task.dateKey), task];
  const heatmapDays = buildHeatmapDays(heatmapTasks, task.dateKey);
  const completedDays = heatmapDays.filter((day) => day.task?.completedAt).length;
  const completionRate = Math.round((completedDays / 14) * 100);
  const estimatedMinutes = plannedCount === 0 ? 0 : Math.max(1, Math.round(plannedCount * 0.25));
  const isTaskComplete = Boolean(task.completedAt) && isTaskFullyAnswered(task);
  const hasStarted = task.totalAnswered > 0 && !isTaskComplete;
  const reviewLoad = task.reviewWordIds.length;
  const isReviewHeavy = reviewLoad >= task.newWordIds.length;
  const stageSize = useStageSize();
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [isAdvancingDay, setIsAdvancingDay] = useState(false);
  const [localDebugPickerOpen, setLocalDebugPickerOpen] = useState(false);
  const [isNewWordQueueOpen, setIsNewWordQueueOpen] = useState(false);
  const [isReviewQueueOpen, setIsReviewQueueOpen] = useState(false);
  const isDebugPickerOpen = debugPickerOpen ?? localDebugPickerOpen;
  const nextDateKey = addDaysToDateKey(task.dateKey, 1);
  const pendingReviewCount = task.reviewWordIds.filter((wordId) => !task.answeredWordIds.includes(wordId)).length;
  const completedReviewCount = task.reviewWordIds.length - pendingReviewCount;

  function setDebugPickerOpen(open: boolean) {
    if (onDebugPickerOpenChange) {
      onDebugPickerOpenChange(open);
      return;
    }
    setLocalDebugPickerOpen(open);
  }

  function openWordDetails(wordId: string) {
    setSelectedWordId(wordId);
    onRequestLocalLifePhoto?.(wordId);
  }

  const heroBadge = isTaskComplete ? '今日完成 · 复习页' : hasStarted ? '进行中 · 复习页' : '今日任务 · 复习页';
  const primaryActionLabel = isTaskComplete ? '再复习一轮' : hasStarted ? '继续学习' : '开始学习';
  const heroDescription = isTaskComplete
    ? '今天的新词和复习词都已经完成，可以回看代表词，或者再练一轮薄弱词。'
    : hasStarted
      ? `今天安排 ${task.newWordIds.length} 个新词、${task.reviewWordIds.length} 个复习词。你已经答了 ${task.totalAnswered} 题，继续就能接上刚才的节奏。`
      : `新增学习 ${task.newWordIds.length} 个，复习巩固 ${task.reviewWordIds.length} 个，稳步提升词汇量。`;
  const focusLabel = isTaskComplete ? '今日完成' : isReviewHeavy ? '先做复习' : '可以加新词';
  const focusDescription = isTaskComplete
    ? '今天已经完成，可以轻松回看。'
    : isReviewHeavy
      ? '复习词比新词多，建议先完成复习部分。'
      : '今天节奏正常，适合直接开始。';
  const suggestionTitle = isTaskComplete ? '今天可以轻松回看' : isReviewHeavy ? '今天建议先做复习' : '今天可以正常加入新词';
  const suggestionText = isTaskComplete
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
  const selectedWord = selectedWordId ? payload.words.find((word) => word.id === selectedWordId) ?? null : null;
  const selectedWordRecord = selectedWord ? recordsById[selectedWord.id] : undefined;
  const selectedWordSelectionState = selectedWord ? selectionById[selectedWord.id] : undefined;
  const previewGridHeight = Math.max(
    0,
    ...reviewLayout.cards.previews.map((layout) => layout.y + layout.height - reviewLayout.modules.previewSection.y),
  );
  const guidanceGridHeight = Math.max(
    0,
    ...reviewLayout.cards.guidance.map((layout) => layout.y + layout.height - reviewLayout.modules.guidanceSection.y),
  );

  // The shell hands taller or wider stages to pages on screens whose aspect
  // ratio does not match the authored one, so the comp measures itself against
  // whatever it is given instead of assuming a 1194 x 834 box.
  const reviewScale = Math.min(stageSize.width / REVIEW_FRAME_WIDTH, stageSize.height / REVIEW_FRAME_HEIGHT);
  const reviewInsetLeft = Math.round((stageSize.width - (REVIEW_FRAME_WIDTH * reviewScale)) / 2);
  // Reclaimed height belongs below the comp, not above it: centring would push
  // the headline away from the top chrome and break the authored composition.
  const reviewInsetTop = Math.round(
    (Math.min(stageSize.height, IPAD_STAGE_HEIGHT) - (REVIEW_FRAME_HEIGHT * reviewScale)) / 2,
  );

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

  async function advanceDay() {
    if (isAdvancingDay) return;
    setIsAdvancingDay(true);
    try {
      await onAdvanceDay();
    } finally {
      setIsAdvancingDay(false);
    }
  }

  return (
    <main className="page page--review" data-profile={setting.profileId}>
      <div
        className="review-mockup-frame"
        style={{
          width: `${stageSize.width}px`,
          minWidth: `${stageSize.width}px`,
          height: `${stageSize.height}px`,
          minHeight: `${stageSize.height}px`,
        }}
      >
        <div
          className="review-dom-surface"
          style={{
            position: 'absolute',
            left: `${reviewInsetLeft}px`,
            top: `${reviewInsetTop}px`,
            width: `${REVIEW_FRAME_WIDTH}px`,
            height: `${REVIEW_FRAME_HEIGHT}px`,
            transform: `scale(${reviewScale})`,
            transformOrigin: 'top left',
          }}
        >
          <section className="review-plan-shell" id="review-top">
            <div className="review-plan-shell__chrome" style={getAbsoluteBoundsStyle(reviewLayout.modules.topChrome)}>
              <div className="review-plan-shell__brand app-brand-lockup">
                <span className="app-brand-lockup__mark" aria-hidden="true" />
                <span className="review-plan-shell__brand-wordmark app-brand-lockup__wordmark">VocaRabbit</span>
                <span className="app-version-badge">{APP_VERSION}</span>
              </div>
              <ProfileSelector
                value={setting.profileId}
                buttonClassName="review-plan-shell__profile app-profile-chip"
                onChange={onSelectProfile}
              />
            </div>

            <div className="review-plan-shell__hero" style={getAbsoluteBoundsStyle(reviewHeroBounds)}>
              <div className="review-mascot-card" style={getRelativeBoundsStyle(reviewLayout.modules.heroMascot, reviewHeroBounds)}>
                <div className="review-mascot-scene" aria-hidden="true">
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
              {setting.profileId === 'stinky-dog' ? (
                <button
                  className="review-day-forward-button"
                  type="button"
                  aria-label={`前往下一天，${nextDateKey}`}
                  title={`切换到 ${nextDateKey}`}
                  disabled={isAdvancingDay}
                  onClick={() => void advanceDay()}
                >
                  <span>{isAdvancingDay ? '切换中' : '下一天'}</span>
                  <small>{nextDateKey.slice(5).replace('-', '.')}</small>
                </button>
              ) : null}

              <div className="review-plan-shell__headline" style={getRelativeBoundsStyle(reviewLayout.modules.heroHeadline, reviewHeroBounds)}>
                <div
                  className="review-plan-shell__eyebrow-row"
                  style={getRelativeTextStyle(reviewLayout.modules.heroHeadline.children.eyebrow, reviewLayout.modules.heroHeadline)}
                >
                  <span className="review-plan-shell__whisper">坚持每天进步一点点</span>
                  <span className="review-plan-shell__tag">{heroBadge}</span>
                </div>
                <h1 style={getRelativeTextStyle(reviewLayout.modules.heroHeadline.children.headline, reviewLayout.modules.heroHeadline)}>今日学习计划</h1>
                <div
                  className="review-summary-pills"
                  aria-label="复习页摘要"
                  style={getRelativeBoundsStyle(reviewLayout.modules.summaryPills, reviewLayout.modules.heroHeadline)}
                >
                  <ReviewSummaryPill
                    tone="library"
                    value={payload.wordCount.toLocaleString('en-US')}
                    label="总词汇"
                    layout={reviewSummaryLayouts.library}
                  />
                  <ReviewSummaryPill tone="mastered" value={String(masteredCount)} label="已掌握" layout={reviewSummaryLayouts.mastered} />
                  <ReviewSummaryPill
                    tone="completion"
                    value={`${completionRate}%`}
                    label="14 天完成率"
                    layout={reviewSummaryLayouts.completion}
                  />
                </div>
              </div>

              <aside className="review-focus-card" style={getRelativeBoundsStyle(reviewLayout.modules.focusCard, reviewHeroBounds)}>
                <span
                  className="review-focus-card__label"
                  style={{
                    position: 'absolute',
                    left: `${reviewLayout.modules.focusCard.children.labelIcon.x - reviewLayout.modules.focusCard.x}px`,
                    top: `${reviewLayout.modules.focusCard.children.labelIcon.y - reviewLayout.modules.focusCard.y}px`,
                    width: `${reviewLayout.modules.focusCard.children.labelText.x + reviewLayout.modules.focusCard.children.labelText.width - reviewLayout.modules.focusCard.children.labelIcon.x}px`,
                    height: `${reviewLayout.modules.focusCard.children.labelText.height}px`,
                  }}
                >
                  今日重点
                </span>
                <strong style={getRelativeBoundsStyle(reviewLayout.modules.focusCard.children.headline, reviewLayout.modules.focusCard)}>{focusCardTitle}</strong>
                <p style={getRelativeBoundsStyle(reviewLayout.modules.focusCard.children.description, reviewLayout.modules.focusCard)}>{focusCardText}</p>
                <button
                  className="primary-button review-focus-card__button"
                  type="button"
                  onClick={onStart}
                  style={getRelativeBoundsStyle(reviewLayout.modules.focusCard.children.ctaButton, reviewLayout.modules.focusCard)}
                >
                  {primaryActionLabel}
                </button>
                {setting.profileId === 'stinky-dog' ? (
                  <button
                    className="review-debug-mode-button"
                    type="button"
                    onClick={() => setDebugPickerOpen(true)}
                    style={{
                      position: 'absolute',
                      left: `${reviewLayout.modules.focusCard.children.ctaButton.x
                        - reviewLayout.modules.focusCard.x
                        + reviewLayout.modules.focusCard.children.ctaButton.width
                        + 8}px`,
                      top: `${reviewLayout.modules.focusCard.children.ctaButton.y - reviewLayout.modules.focusCard.y}px`,
                      width: '112px',
                      height: `${reviewLayout.modules.focusCard.children.ctaButton.height}px`,
                    }}
                  >
                    调试模式
                  </button>
                ) : null}
                <div
                  className="review-focus-card__art"
                  aria-hidden="true"
                  style={getRelativeBoundsStyle(reviewFocusArtLayout, reviewLayout.modules.focusCard)}
                >
                  <span className="review-focus-card__roof" />
                  <span className="review-focus-card__house" />
                  <span className="review-focus-card__tree" />
                  <span className="review-focus-card__path" />
                </div>
              </aside>
            </div>
          </section>
          {isDebugPickerOpen ? (
            <div className="review-debug-dialog-backdrop" role="presentation" onClick={() => setDebugPickerOpen(false)}>
              <section
                className="review-debug-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="review-debug-dialog-title"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="review-debug-dialog__header">
                  <div>
                    <span>小狗子专属</span>
                    <h2 id="review-debug-dialog-title">选择题目等级</h2>
                  </div>
                  <button type="button" aria-label="关闭调试模式" onClick={() => setDebugPickerOpen(false)}>×</button>
                </div>
                <p>每次最多随机抽取 10 个不重复单词，只测试题型，不修改本地或云端学习记录。</p>
                <div className="review-debug-level-grid">
                  <button
                    className="review-debug-level-grid__progression"
                    type="button"
                    onClick={() => {
                      setDebugPickerOpen(false);
                      onStartDebug('progression');
                    }}
                  >
                    <strong>Lv0 到 Lv10</strong>
                    <span>完整升级流程</span>
                  </button>
                  {Array.from({ length: 10 }, (_, level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => {
                        setDebugPickerOpen(false);
                        onStartDebug(level);
                      }}
                    >
                      <strong>Lv{level}</strong>
                      <span>第 {level + 1} 阶段</span>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          <section className="review-metric-grid" id="review-summary-section" style={getAbsoluteBoundsStyle(reviewLayout.modules.metricRow)}>
            <ReviewMetricCard
              tone="task"
              label="今日任务"
              value={`${plannedCount} 个`}
              note={`新词 ${task.newWordIds.length} · 复习 ${task.reviewWordIds.length}`}
              layout={reviewLayout.cards.metrics[0]}
              onClick={() => {
                setIsReviewQueueOpen(false);
                setSelectedWordId(null);
                setIsNewWordQueueOpen(true);
              }}
            />
            <ReviewMetricCard
              tone="time"
              label="预计时长"
              value={`${estimatedMinutes} 分钟`}
              note={hasStarted ? '继续就能接上刚才节奏' : '建议一次学完更轻松'}
              layout={reviewLayout.cards.metrics[1]}
            />
            <ReviewMetricCard
              tone="theme"
              label="今日复习"
              value={`${pendingReviewCount} 个`}
              note={`计划 ${task.reviewWordIds.length} · 已完成 ${completedReviewCount}`}
              layout={reviewLayout.cards.metrics[2]}
              onClick={() => {
                setIsNewWordQueueOpen(false);
                setSelectedWordId(null);
                setIsReviewQueueOpen(true);
              }}
            />
            <ReviewMetricCard
              tone="heatmap"
              label="14 天学习热力图"
              note=""
              layout={reviewLayout.cards.metrics[3]}
            >
              <ReviewTaskHeatmap days={heatmapDays} currentDateKey={task.dateKey} />
            </ReviewMetricCard>
          </section>

          <section className="review-panel" id="review-preview-section" style={getAbsoluteBoundsStyle(reviewLayout.modules.previewSection)}>
            <div className="review-panel__header" style={{ position: 'absolute', inset: 0 }}>
              <h2 style={getRelativeTextStyle(reviewLayout.modules.previewSection.children.headerTitle, reviewLayout.modules.previewSection)}>
                今日预览
              </h2>
            </div>
            {previewWords.length > 0 ? (
              <div className="review-preview-grid" style={{ position: 'absolute', left: '0', top: '0', width: '100%', height: `${previewGridHeight}px` }}>
                {previewWords.slice(0, 4).map((word, index) => (
                  <ReviewPreviewCard
                    key={word.id}
                    word={word}
                    masteryLevel={recordsById[word.id]?.masteryLevel ?? 0}
                    index={index}
                    layout={reviewPreviewLayouts[['family', 'hello', 'body', 'spark'][index] as 'family' | 'hello' | 'body' | 'spark']}
                    onOpenDetails={() => openWordDetails(word.id)}
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

          <section className="review-panel" id="review-guidance-section" style={getAbsoluteBoundsStyle(reviewLayout.modules.guidanceSection)}>
            <div className="review-panel__header" style={{ position: 'absolute', inset: 0 }}>
              <h2 style={getRelativeTextStyle(reviewLayout.modules.guidanceSection.children.headerTitle, reviewLayout.modules.guidanceSection)}>
                轻量建议
              </h2>
            </div>
            <div className="review-advice-grid" style={{ position: 'absolute', left: '0', top: '0', width: '100%', height: `${guidanceGridHeight}px` }}>
              <ReviewAdviceCard accent="tea" label="今日建议" value={suggestionTitle} description="" layout={reviewGuidanceLayouts.tea} />
              <ReviewAdviceCard accent="bars" label="未来压力" value={pressureLevel} description="" layout={reviewGuidanceLayouts.bars} onClick={onOpenStats} />
              <ReviewAdviceCard
                accent="bag"
                label="当前学习设置"
                value={`${setting.dailyNewWordCount} 新词 · ${setting.dailyReviewLimit} 复习`}
                description=""
                layout={reviewGuidanceLayouts.bag}
                onClick={onOpenSettings}
              />
            </div>
          </section>

        </div>
      </div>

      <WordDetailDrawer
        isOpen={Boolean(selectedWord)}
        word={selectedWord}
        record={selectedWordRecord}
        selectionState={selectedWordSelectionState}
        answerEvents={answerEvents}
        setting={setting}
        localLifePhoto={selectedWord ? localLifePhotosById[selectedWord.id] : undefined}
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
        queueCompanion={isNewWordQueueOpen || isReviewQueueOpen}
      />
      <NewWordQueueDrawer
        isOpen={isNewWordQueueOpen}
        words={payload.words}
        recordsById={recordsById}
        selectionById={selectionById}
        task={task}
        queue={setting.newWordQueue}
        onClose={() => {
          setIsNewWordQueueOpen(false);
          setSelectedWordId(null);
        }}
        onChangeQueue={onChangeNewWordQueue ?? (async () => undefined)}
        onRemoveTodayWord={onRemoveTodayNewWord ?? (async () => undefined)}
        onOpenWord={openWordDetails}
      />
      <ReviewQueueDrawer
        isOpen={isReviewQueueOpen}
        words={payload.words}
        recordsById={recordsById}
        task={task}
        onClose={() => {
          setIsReviewQueueOpen(false);
          setSelectedWordId(null);
        }}
        onOpenWord={openWordDetails}
      />
    </main>
  );
}
