import { type CSSProperties, type ReactNode, useState } from 'react';
import type { AnswerEvent } from '../models/answer-event';
import type { DailyTaskSummary } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import type { ParentSetting } from '../models/parent-setting';
import {
  createDefaultWordSelectionState,
  normalizeWordSelectionState,
  type WordSelectionState,
} from '../models/word-selection-state';
import type { WordPayload } from '../models/word';
import { WordDetailDrawer } from '../components/WordDetailDrawer';
import { APP_VERSION } from '../config/app-meta';
import { getPrimaryOxfordRefLabel, getStudyText } from '../services/word-service';
import reviewLayoutData from '../../design-output/ui-concepts/review-page-layout.json';
import reviewSlicesManifestData from '../../design-output/ui-concepts/review-page-slices-manifest.json';

type ReviewPreviewWord = WordPayload['words'][number];
type ReviewDockGlyph = 'review' | 'selection' | 'stats' | 'settings';
type ReviewSummaryTone = 'library' | 'mastered' | 'completion';
type ReviewAdviceAccent = 'tea' | 'bars' | 'bag';
type ReviewHeatmapLevel = 'empty' | 'soft' | 'warm' | 'outline';

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
type ReviewDockButtonLayout = ReviewLayout['cards']['dockButtons'][number];
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
const reviewDockLayouts = Object.fromEntries(
  reviewLayout.cards.dockButtons.map((layout) => [layout.id, layout]),
) as Record<ReviewDockGlyph, ReviewDockButtonLayout>;
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
const IPAD_REFERENCE_WIDTH = 1024;
const IPAD_REFERENCE_HEIGHT = 768;
const REVIEW_HEATMAP_WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'] as const;
const REVIEW_HEATMAP_REFERENCE_CELLS: ReviewHeatmapLevel[] = [
  'soft',
  'soft',
  'soft',
  'soft',
  'soft',
  'soft',
  'warm',
  'soft',
  'soft',
  'warm',
  'empty',
  'soft',
  'soft',
  'outline',
];
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

function getReviewDockButtonUrl(glyph: ReviewDockGlyph, active: boolean) {
  if (glyph === 'review' && active) {
    return `${import.meta.env.BASE_URL}design-reference/slices/review-dock-review-active-latest.png?v=8`;
  }
  const state = active ? 'active' : 'default';
  return `${import.meta.env.BASE_URL}design-reference/slices/review-dock-${glyph}-${state}-transparent.png?v=2`;
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
}

interface ReviewSummaryPillProps {
  tone: ReviewSummaryTone;
  label: string;
  value: string;
  layout: ReviewSummaryLayout;
}

interface ReviewPreviewCardProps {
  word: ReviewPreviewWord;
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
}

interface ReviewDockButtonProps {
  active?: boolean;
  glyph: ReviewDockGlyph;
  label: string;
  layout: ReviewDockButtonLayout;
  onClick: () => void;
}

function ReviewMetricCard({ tone, label, value, note, layout, children }: ReviewMetricCardProps) {
  const contentStyle = getRelativeTextStyle(layout.textSafe, layout);
  const iconAnchor = 'iconAnchor' in layout ? layout.iconAnchor : undefined;
  const heatmapBounds = 'heatmapBounds' in layout ? layout.heatmapBounds : undefined;

  return (
    <article
      className={`review-metric-card review-metric-card--${tone}`}
      style={getRelativeBoundsStyle(layout, reviewLayout.modules.metricRow)}
    >
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
    </article>
  );
}

function ReviewReferenceHeatmap() {
  return (
    <div className="review-reference-heatmap" aria-label="最近 14 天学习热力图">
      <div className="review-reference-heatmap__grid" aria-hidden="true">
        {REVIEW_HEATMAP_REFERENCE_CELLS.map((level, index) => (
          <span
            key={`${level}-${index}`}
            className={`review-reference-heatmap__cell review-reference-heatmap__cell--${level}`}
          />
        ))}
      </div>
      <div className="review-reference-heatmap__weekdays" aria-hidden="true">
        {REVIEW_HEATMAP_WEEKDAY_LABELS.map((label) => (
          <span key={label}>{label}</span>
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

function ReviewPreviewCard({ word, index, layout, onOpenDetails }: ReviewPreviewCardProps) {
  const oxfordLabel = getPrimaryOxfordRefLabel(word);
  const artVariant = ['family', 'hello', 'body', 'spark'][index % 4];
  const artPlacement = reviewSlicePlacementsByFile[layout.artSlot.file];
  const previewArtHeightByVariant: Record<typeof artVariant, number> = {
    family: 94,
    hello: 77,
    body: 72,
    spark: 86,
  };
  const previewArtBottomInsetByVariant: Record<typeof artVariant, number> = {
    family: 33,
    hello: 35,
    body: 35,
    spark: 33,
  };
  const previewArtHeight = Math.min(previewArtHeightByVariant[artVariant], layout.artSlot.height - 12);
  const previewArtBottomInset = previewArtBottomInsetByVariant[artVariant];

  return (
    <button
      className={`review-preview-card review-preview-card--${artVariant}`}
      type="button"
      onClick={onOpenDetails}
      style={getRelativeBoundsStyle(layout, reviewLayout.modules.previewSection)}
    >
      <div
        className="review-preview-card__art"
        aria-hidden="true"
        style={{
          ...getRelativeBoundsStyle(layout.artSlot, layout),
          zIndex: reviewLayerZIndex.slices,
          backgroundImage: `url(${getReviewSliceUrl(layout.artSlot.file)})`,
          backgroundRepeat: 'no-repeat',
          backgroundSize: `auto ${previewArtHeight}px`,
          backgroundPosition: `calc(50% + 15px) calc(100% - ${previewArtBottomInset}px)`,
        }}
      >
        <span
          className="review-preview-card__index"
          style={{ ...getRelativeBoundsStyle(layout.indexBadge, layout), zIndex: reviewLayerZIndex.interactiveBadges }}
        >
          {index + 1}
        </span>
      </div>
      <span
        className="review-preview-card__favorite"
        style={{ ...getRelativeBoundsStyle(layout.favoriteIcon, layout), zIndex: reviewLayerZIndex.interactiveBadges }}
      />
      <div className="review-preview-card__body" style={getRelativeBoundsStyle(layout.textSafe, layout)}>
        <strong className="review-preview-card__headline" style={getRelativeTextStyle(layout.textBlocks.headline, layout.textSafe)}>
          {getStudyText(word)}
        </strong>
        <p className="review-preview-card__subtitle" style={getRelativeTextStyle(layout.textBlocks.subtitle, layout.textSafe)}>
          {word.chinese}
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
        {formatPreviewPartOfSpeech(word.partOfSpeech)}
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

function ReviewAdviceCard({ accent, label, value, description, layout }: ReviewAdviceCardProps) {
  const artPlacement = reviewSlicePlacementsByFile[layout.artSlot.file];

  return (
    <article
      className={`review-advice-card review-advice-card--${accent}`}
      style={getRelativeBoundsStyle(layout, reviewLayout.modules.guidanceSection)}
    >
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
    </article>
  );
}

function ReviewDockButton({ active = false, glyph, label, layout, onClick }: ReviewDockButtonProps) {
  const backgroundSize =
    glyph === 'review' && active
      ? '102% auto'
      : glyph === 'selection' || glyph === 'stats' || glyph === 'settings'
        ? '70% auto'
        : undefined;
  return (
    <button
      className={`home-dock__button review-dock__button${active ? ' is-active' : ''}`}
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        ...getRelativeBoundsStyle(layout, reviewLayout.modules.bottomDock),
        backgroundImage: `url(${getReviewDockButtonUrl(glyph, active)})`,
        ...(backgroundSize ? { backgroundSize } : null),
      }}
    >
      <ReviewSliceIcon
        className={`review-dock__glyph review-dock__glyph--${glyph}`}
        file={layout.iconAnchor.file}
        style={{ ...getRelativeBoundsStyle(layout.iconAnchor, layout), zIndex: reviewLayerZIndex.decorativeIcons }}
      />
      <span className="review-dock__label" style={getRelativeTextStyle(layout.textSafe, layout)}>
        {label}
      </span>
    </button>
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
  answerEvents,
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

  const heroBadge = task.completedAt ? '今日完成 · 复习页' : hasStarted ? '进行中 · 复习页' : '今日任务 · 复习页';
  const primaryActionLabel = task.completedAt ? '再复习一轮' : hasStarted ? '继续学习' : '开始学习';
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
  const previewGridHeight = Math.max(
    0,
    ...reviewLayout.cards.previews.map((layout) => layout.y + layout.height - reviewLayout.modules.previewSection.y),
  );
  const guidanceGridHeight = Math.max(
    0,
    ...reviewLayout.cards.guidance.map((layout) => layout.y + layout.height - reviewLayout.modules.guidanceSection.y),
  );

  const reviewScale = Math.min(IPAD_REFERENCE_WIDTH / REVIEW_FRAME_WIDTH, IPAD_REFERENCE_HEIGHT / REVIEW_FRAME_HEIGHT);
  const reviewInsetLeft = Math.round((IPAD_REFERENCE_WIDTH - (REVIEW_FRAME_WIDTH * reviewScale)) / 2);
  const reviewInsetTop = Math.round((IPAD_REFERENCE_HEIGHT - (REVIEW_FRAME_HEIGHT * reviewScale)) / 2);

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
          width: `${IPAD_REFERENCE_WIDTH}px`,
          minWidth: `${IPAD_REFERENCE_WIDTH}px`,
          height: `${IPAD_REFERENCE_HEIGHT}px`,
          minHeight: `${IPAD_REFERENCE_HEIGHT}px`,
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
              <div className="review-plan-shell__brand">
                <ReviewSliceIcon
                  className="review-plan-shell__brand-mark"
                  file={reviewLayout.modules.brandCluster.iconAnchor.file}
                />
                <span className="review-plan-shell__brand-wordmark">VocaRabbit</span>
                <span className="app-version-badge">{APP_VERSION}</span>
              </div>
              <button className="review-plan-shell__profile" type="button" onClick={onOpenSettings}>
                <ReviewSliceIcon
                  className="review-plan-shell__profile-avatar"
                  file={reviewLayout.modules.profileButton.iconAnchor.file}
                />
                <span className="review-plan-shell__profile-label">小树的家长版</span>
              </button>
            </div>

            <div className="review-plan-shell__hero" style={getAbsoluteBoundsStyle(reviewHeroBounds)}>
              <div className="review-mascot-card" style={getRelativeBoundsStyle(reviewLayout.modules.heroMascot, reviewHeroBounds)} aria-hidden="true">
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

          <section className="review-metric-grid" id="review-summary-section" style={getAbsoluteBoundsStyle(reviewLayout.modules.metricRow)}>
            <ReviewMetricCard
              tone="task"
              label="今日任务"
              value={`${plannedCount} 个`}
              note={`新词 ${task.newWordIds.length} · 复习 ${task.reviewWordIds.length}`}
              layout={reviewLayout.cards.metrics[0]}
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
              label="预览主题"
              value={`${previewCategoryCount || payload.categoryCount} 个`}
              note={previewCategoryCount > 0 ? '家庭、身份、身体、表达' : '开始学习后这里会更准确'}
              layout={reviewLayout.cards.metrics[2]}
            />
            <ReviewMetricCard
              tone="heatmap"
              label="14 天学习热力图"
              note=""
              layout={reviewLayout.cards.metrics[3]}
            >
              <ReviewReferenceHeatmap />
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
                    index={index}
                    layout={reviewPreviewLayouts[['family', 'hello', 'body', 'spark'][index] as 'family' | 'hello' | 'body' | 'spark']}
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

          <section className="review-panel" id="review-guidance-section" style={getAbsoluteBoundsStyle(reviewLayout.modules.guidanceSection)}>
            <div className="review-panel__header" style={{ position: 'absolute', inset: 0 }}>
              <h2 style={getRelativeTextStyle(reviewLayout.modules.guidanceSection.children.headerTitle, reviewLayout.modules.guidanceSection)}>
                轻量建议
              </h2>
            </div>
            <div className="review-advice-grid" style={{ position: 'absolute', left: '0', top: '0', width: '100%', height: `${guidanceGridHeight}px` }}>
              <ReviewAdviceCard accent="tea" label="今日建议" value={suggestionTitle} description="" layout={reviewGuidanceLayouts.tea} />
              <ReviewAdviceCard accent="bars" label="未来压力" value={pressureLevel} description="" layout={reviewGuidanceLayouts.bars} />
              <ReviewAdviceCard
                accent="bag"
                label="当前学习设置"
                value={`${setting.dailyNewWordCount} 新词 · ${setting.dailyReviewLimit} 复习`}
                description=""
                layout={reviewGuidanceLayouts.bag}
              />
            </div>
          </section>

          <nav className="home-dock review-dock" aria-label="主页面导航" style={getAbsoluteBoundsStyle(reviewLayout.modules.bottomDock)}>
            <ReviewDockButton active glyph="review" label="复习" layout={reviewDockLayouts.review} onClick={() => scrollToSection('review-top')} />
            <ReviewDockButton glyph="selection" label="选词" layout={reviewDockLayouts.selection} onClick={onOpenSelection} />
            <ReviewDockButton glyph="stats" label="统计" layout={reviewDockLayouts.stats} onClick={onOpenStats} />
            <ReviewDockButton glyph="settings" label="设置" layout={reviewDockLayouts.settings} onClick={onOpenSettings} />
          </nav>
        </div>
      </div>

      <WordDetailDrawer
        isOpen={Boolean(selectedWord)}
        word={selectedWord}
        record={selectedWordRecord}
        selectionState={selectedWordSelectionState}
        answerEvents={answerEvents}
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
