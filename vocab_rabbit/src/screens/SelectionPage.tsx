import { useMemo, useState } from 'react';
import type { DailyTaskSummary } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import type { ParentSetting } from '../models/parent-setting';
import {
  createDefaultWordSelectionState,
  normalizeWordSelectionState,
  type WordSelectionState,
} from '../models/word-selection-state';
import type { WordPayload, WordRecord } from '../models/word';
import { estimateReviewLoad, getWordLearningBucket } from '../services/selection-service';
import { getAssetUrl, getPrimaryOxfordRefLabel, getStudyText } from '../services/word-service';
import { WordDetailDrawer } from '../components/WordDetailDrawer';
import { APP_VERSION } from '../config/app-meta';

type StatusFilter = 'all' | 'new' | 'learning' | 'mastered' | 'paused' | 'disabled';
type SortMode = 'level' | 'difficulty' | 'recent' | 'alphabetical';
type ViewMode = 'grid' | 'list';
type SelectionDockGlyph = 'review' | 'selection' | 'stats' | 'settings';
type PaginationToken = number | 'ellipsis';

interface SelectionPageProps {
  payload: WordPayload;
  recordsById: Record<string, LearningRecord>;
  selectionById: Record<string, WordSelectionState>;
  setting: ParentSetting;
  task: DailyTaskSummary;
  onBackHome: () => void;
  onOpenSettings: () => void;
  onOpenStats: () => void;
  onSaveSelectionStates: (states: WordSelectionState[]) => Promise<void>;
  onApplySelectionPlan: () => Promise<void>;
}

interface SelectionWordCardProps {
  word: WordRecord;
  statusLabel: string;
  statusTone: 'active' | 'paused' | 'disabled';
  isEnabled: boolean;
  isPaused: boolean;
  updatedAtLabel: string;
  onOpenDetails: () => void;
  onToggleEnabled: () => void;
  onTogglePaused: () => void;
  visualOverride?: SelectionCardVisualOverride;
}

interface SelectionWordRowProps {
  word: WordRecord;
  statusLabel: string;
  statusTone: 'active' | 'paused' | 'disabled';
  updatedAtLabel: string;
  onOpenDetails: () => void;
  onToggleEnabled: () => void;
  onTogglePaused: () => void;
  isEnabled: boolean;
  isPaused: boolean;
}

interface SelectionDockButtonProps {
  active?: boolean;
  glyph: SelectionDockGlyph;
  label: string;
  onClick: () => void;
}

interface SelectionCardVisualOverride {
  categoryLabel?: string;
  chineseLabel?: string;
  partOfSpeechLabel?: string;
  sourceLabel?: string;
  demoArtPath?: string;
  statusLabel?: string;
  statusTone?: 'active' | 'paused' | 'disabled';
}

const REFERENCE_SELECTION_CARD_ORDER = [
  'ket_family_n',
  'ket_friend_n',
  'ket_arm_n',
  'ket_better_adj_adv',
  'ket_after_adv_prep',
  'ket_again_adv',
] as const;

const REFERENCE_SELECTION_CARD_INDEX = new Map<string, number>(
  REFERENCE_SELECTION_CARD_ORDER.map((wordId, index) => [wordId, index])
);

const REFERENCE_SELECTION_CARD_OVERRIDES: Record<string, SelectionCardVisualOverride> = {
  ket_family_n: {
    categoryLabel: '主题人物',
    chineseLabel: '家庭',
    partOfSpeechLabel: 'n. 名词',
    sourceLabel: 'Oxford Tree · Lv.2 Unit 1',
    demoArtPath: '/design-reference/slices/selection-card-family-art.png',
    statusLabel: '已启用',
    statusTone: 'active',
  },
  ket_friend_n: {
    categoryLabel: '主题人物',
    chineseLabel: '朋友',
    partOfSpeechLabel: 'n. 名词',
    sourceLabel: 'Oxford Tree · Lv.1 Unit 4',
    demoArtPath: '/design-reference/slices/selection-card-friend-art.png',
    statusLabel: '已启用',
    statusTone: 'active',
  },
  ket_arm_n: {
    categoryLabel: '身体部位',
    chineseLabel: '手臂',
    partOfSpeechLabel: 'n. 名词',
    sourceLabel: 'Oxford Tree · Lv.1 Unit 5',
    demoArtPath: '/design-reference/slices/selection-card-arm-art.png',
    statusLabel: '已启用',
    statusTone: 'active',
  },
  ket_better_adj_adv: {
    categoryLabel: '品质与状态',
    chineseLabel: '更好',
    partOfSpeechLabel: 'adj. 形容词',
    sourceLabel: 'Oxford Tree · Lv.3 Unit 8',
    demoArtPath: '/design-reference/slices/selection-card-better-art.png',
    statusLabel: '已启用',
    statusTone: 'active',
  },
  ket_after_adv_prep: {
    categoryLabel: '时间与顺序',
    chineseLabel: '在……之后',
    partOfSpeechLabel: 'prep. 介词',
    sourceLabel: 'Oxford Tree · Lv.2 Unit 2',
    demoArtPath: '/design-reference/slices/selection-card-after-art.png',
    statusLabel: '已暂停',
    statusTone: 'paused',
  },
  ket_again_adv: {
    categoryLabel: '频率与次数',
    chineseLabel: '再一次',
    partOfSpeechLabel: 'adv. 副词',
    sourceLabel: 'Oxford Tree · Lv.2 Unit 5',
    demoArtPath: '/design-reference/slices/selection-card-again-art.png',
    statusLabel: '已启用',
    statusTone: 'active',
  },
};

function SelectionWordCard({
  word,
  statusLabel,
  statusTone,
  isEnabled,
  isPaused,
  updatedAtLabel,
  onOpenDetails,
  onToggleEnabled,
  onTogglePaused,
  visualOverride,
}: SelectionWordCardProps) {
  const displayWord = getStudyText(word);
  const categoryLabel = visualOverride?.categoryLabel ?? word.category;
  const chineseLabel = visualOverride?.chineseLabel ?? word.chinese;
  const partOfSpeechLabel = visualOverride?.partOfSpeechLabel ?? formatPartOfSpeech(word.partOfSpeech);
  const sourceLabel = visualOverride?.sourceLabel ?? getPrimaryOxfordRefLabel(word);
  const effectiveStatusLabel = visualOverride?.statusLabel ?? statusLabel;
  const effectiveStatusTone = visualOverride?.statusTone ?? statusTone;
  const colorSlot = getCategoryColorSlot(categoryLabel);

  return (
    <article className="selection-word-card">
      <div className="selection-word-card__header word-card__header">
        <span className={`word-card__category word-card__category--c${colorSlot}`}>{categoryLabel}</span>
        <span className={`selection-status-chip selection-status-chip--${effectiveStatusTone}`}>{effectiveStatusLabel}</span>
      </div>
      <button className="selection-word-card__body" type="button" onClick={onOpenDetails}>
        <h3>{displayWord}</h3>
        <p>{chineseLabel}</p>
        <div className="selection-word-card__foot">
          <small>{partOfSpeechLabel}</small>
          {sourceLabel ? <small>{sourceLabel}</small> : null}
        </div>
      </button>
      <div className="selection-word-card__actions">
        <button className="secondary-button" type="button" onClick={onOpenDetails}>详情</button>
        <button className="secondary-button" type="button" onClick={onToggleEnabled}>
          {isEnabled ? '移出' : '启用'}
        </button>
        {isEnabled ? (
          <button className="secondary-button" type="button" onClick={onTogglePaused}>
            {isPaused ? '恢复' : '暂停'}
          </button>
        ) : null}
      </div>
      <small className="selection-word-card__meta">最近变更：{updatedAtLabel}</small>
    </article>
  );
}

function SelectionWordRow({
  word,
  statusLabel,
  statusTone,
  updatedAtLabel,
  onOpenDetails,
  onToggleEnabled,
  onTogglePaused,
  isEnabled,
  isPaused,
}: SelectionWordRowProps) {
  const oxfordLabel = getPrimaryOxfordRefLabel(word);

  return (
    <article className="selection-word-row">
      <button className="selection-word-row__main" type="button" onClick={onOpenDetails}>
        <strong>{getStudyText(word)}</strong>
        <span>{word.chinese}</span>
        <span>{word.category}</span>
        <span>{word.partOfSpeech}</span>
        <span>{oxfordLabel ?? '暂无定位'}</span>
      </button>
      <span className={`selection-status-chip selection-status-chip--${statusTone}`}>{statusLabel}</span>
      <span className="selection-word-row__updated">{updatedAtLabel}</span>
      <div className="selection-word-row__actions">
        <button className={isEnabled ? 'secondary-button' : 'primary-button'} type="button" onClick={onToggleEnabled}>
          {isEnabled ? '移出' : '启用'}
        </button>
        {isEnabled ? (
          <button className="secondary-button" type="button" onClick={onTogglePaused}>
            {isPaused ? '恢复' : '暂停'}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function SelectionDockButton({ active = false, glyph, label, onClick }: SelectionDockButtonProps) {
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

function getPrimaryLevel(word: WordRecord): number | null {
  return word.oxfordRefs[0]?.level ?? null;
}

function formatUpdatedAt(updatedAt: string): string {
  return new Date(updatedAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPartOfSpeech(partOfSpeech: string): string {
  const normalized = partOfSpeech.trim().toLowerCase();
  if (normalized === 'n') return 'n. 名词';
  if (normalized === 'v') return 'v. 动词';
  if (normalized === 'adj') return 'adj. 形容词';
  if (normalized === 'adv') return 'adv. 副词';
  if (normalized === 'prep') return 'prep. 介词';
  return partOfSpeech;
}

/** 根据分类名称计算一个稳定的 0-7 颜色槽位，用于徽章多彩配色 */
function getCategoryColorSlot(category: string): number {
  let h = 0;
  for (let i = 0; i < category.length; i++) {
    h = (h * 31 + category.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % 8;
}


function buildPagination(totalPages: number, currentPage: number): PaginationToken[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const items: PaginationToken[] = [1];
  const windowStart = Math.max(2, currentPage - 1);
  const windowEnd = Math.min(totalPages - 1, currentPage + 1);

  if (windowStart > 2) {
    items.push('ellipsis');
  }

  for (let page = windowStart; page <= windowEnd; page += 1) {
    items.push(page);
  }

  if (windowEnd < totalPages - 1) {
    items.push('ellipsis');
  }

  items.push(totalPages);
  return items;
}

export function SelectionPage({
  payload,
  recordsById,
  selectionById,
  setting,
  task,
  onBackHome,
  onOpenSettings,
  onOpenStats,
  onSaveSelectionStates,
  onApplySelectionPlan,
}: SelectionPageProps) {
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedLevel, setSelectedLevel] = useState('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('all');
  const [imageOnly, setImageOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('level');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);

  const levelOptions = useMemo(
    () =>
      [...new Set(payload.words.map(getPrimaryLevel).filter((level): level is number => level !== null))].sort(
        (left, right) => left - right
      ),
    [payload.words]
  );

  const masteredCount = useMemo(
    () => Object.values(recordsById).filter((record) => record.masteryLevel >= 4).length,
    [recordsById]
  );

  const enabledCount = useMemo(
    () => Object.values(selectionById).filter((selectionState) => selectionState.isEnabled && !selectionState.isPaused).length,
    [selectionById]
  );
  const pausedCount = useMemo(
    () => Object.values(selectionById).filter((selectionState) => selectionState.isPaused).length,
    [selectionById]
  );

  const filteredWords = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();
    const shouldUseReferenceOrder = !normalizedSearch &&
      selectedCategory === 'all' &&
      selectedLevel === 'all' &&
      selectedDifficulty === 'all' &&
      selectedStatus === 'all' &&
      !imageOnly &&
      sortMode === 'alphabetical';

    const nextWords = payload.words.filter((word) => {
      const selectionState = selectionById[word.id] ?? createDefaultWordSelectionState(word.id);
      const learningBucket = getWordLearningBucket(word.id, recordsById[word.id], selectionState);
      const primaryLevel = getPrimaryLevel(word);
      const matchesSearch = !normalizedSearch ||
        word.english.toLowerCase().includes(normalizedSearch) ||
        word.chinese.includes(searchText.trim()) ||
        word.category.includes(searchText.trim());
      const matchesCategory = selectedCategory === 'all' || word.category === selectedCategory;
      const matchesLevel = selectedLevel === 'all' || primaryLevel === Number(selectedLevel);
      const matchesDifficulty = selectedDifficulty === 'all' || word.difficulty === Number(selectedDifficulty);
      const matchesStatus = selectedStatus === 'all' || learningBucket === selectedStatus;
      const matchesImage = !imageOnly || word.imageApproved;

      return matchesSearch && matchesCategory && matchesLevel && matchesDifficulty && matchesStatus && matchesImage;
    });

    return nextWords.sort((left, right) => {
      if (shouldUseReferenceOrder) {
        const leftFeaturedIndex = REFERENCE_SELECTION_CARD_INDEX.get(left.id);
        const rightFeaturedIndex = REFERENCE_SELECTION_CARD_INDEX.get(right.id);
        if (leftFeaturedIndex !== undefined || rightFeaturedIndex !== undefined) {
          if (leftFeaturedIndex === undefined) {
            return 1;
          }
          if (rightFeaturedIndex === undefined) {
            return -1;
          }
          return leftFeaturedIndex - rightFeaturedIndex;
        }
        return left.english.localeCompare(right.english);
      }

      if (sortMode === 'alphabetical') {
        return left.english.localeCompare(right.english);
      }

      if (sortMode === 'difficulty') {
        return left.difficulty - right.difficulty || left.english.localeCompare(right.english);
      }

      if (sortMode === 'recent') {
        const leftUpdatedAt = selectionById[left.id]?.updatedAt ?? '';
        const rightUpdatedAt = selectionById[right.id]?.updatedAt ?? '';
        return rightUpdatedAt.localeCompare(leftUpdatedAt) || left.english.localeCompare(right.english);
      }

      return (getPrimaryLevel(left) ?? Number.MAX_SAFE_INTEGER) - (getPrimaryLevel(right) ?? Number.MAX_SAFE_INTEGER) ||
        left.difficulty - right.difficulty ||
        left.english.localeCompare(right.english);
    });
  }, [
    imageOnly,
    payload.words,
    recordsById,
    searchText,
    selectedCategory,
    selectedDifficulty,
    selectedLevel,
    selectedStatus,
    selectionById,
    sortMode,
  ]);

  const pageSize = 4;
  const totalPages = Math.max(1, Math.ceil(filteredWords.length / pageSize));
  const activePage = Math.min(currentPage, totalPages);
  const visibleWords = useMemo(() => {
    const startIndex = (activePage - 1) * pageSize;
    return filteredWords.slice(startIndex, startIndex + pageSize);
  }, [activePage, filteredWords]);

  const reviewLoad = useMemo(() => estimateReviewLoad(recordsById, selectionById, setting), [recordsById, selectionById, setting]);

  const categoryBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const word of payload.words) {
      const selectionState = selectionById[word.id] ?? createDefaultWordSelectionState(word.id);
      if (selectionState.isEnabled && !selectionState.isPaused) {
        counts.set(word.category, (counts.get(word.category) ?? 0) + 1);
      }
    }

    return [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 6);
  }, [payload.words, selectionById]);

  const selectedWord = selectedWordId ? payload.words.find((word) => word.id === selectedWordId) ?? null : null;
  const selectedWordRecord = selectedWord ? recordsById[selectedWord.id] : undefined;
  const selectedWordSelectionState = selectedWord ? selectionById[selectedWord.id] : undefined;
  const isReferenceGridState = viewMode === 'grid' &&
    !searchText.trim() &&
    selectedCategory === 'all' &&
    selectedLevel === 'all' &&
    selectedDifficulty === 'all' &&
    selectedStatus === 'all' &&
    !imageOnly &&
    sortMode === 'alphabetical';
  const applyHint = !task.completedAt && task.totalAnswered === 0
    ? '应用后会立即重算今天任务并返回复习页。'
    : '当前任务已经开始或完成，应用后会保存词范围，但不会覆盖今天已生成的任务。';
  const pagination = useMemo(() => buildPagination(totalPages, activePage), [activePage, totalPages]);
  const breakdownMax = categoryBreakdown[0]?.[1] ?? 1;

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

  async function handleKeepOnlyFiltered() {
    const filteredIds = new Set(filteredWords.map((word) => word.id));
    const nextStates = payload.words.map((word) => ({
      wordId: word.id,
      isEnabled: filteredIds.has(word.id),
      isPaused: false,
    }));
    await savePatchedSelectionStates(nextStates);
  }

  function resetFilters() {
    setSearchText('');
    setSelectedCategory('all');
    setSelectedLevel('all');
    setSelectedDifficulty('all');
    setSelectedStatus('all');
    setImageOnly(false);
    setSortMode('alphabetical');
    setCurrentPage(1);
  }

  return (
    <main className="page page--home page--selection">
      <div className="selection-mockup-frame">

        {/* ── Chrome bar (y=0..30) ── */}
        <div className="selection-chrome">
          <div className="selection-brand-cluster">
            <span className="selection-brand-mark" aria-hidden="true" />
            <span className="selection-brand-wordmark">VocaRabbit</span>
            <span className="app-version-badge">{APP_VERSION}</span>
          </div>
          <button className="selection-profile-btn" type="button">
            <span className="selection-profile-avatar" aria-hidden="true" />
            <span>小雨的家长</span>
          </button>
        </div>

        {/* ── Scrollable body (y=30..708) ── */}
        <div className="selection-scroll-body">
          <div className="selection-dom-surface">

            {/* ── Hero section (y=10..328 in surface) ── */}
            <section className="selection-hero-section" aria-label="词库管理">
              <div className="selection-hero-art" aria-hidden="true">
                <img src={getAssetUrl('/design-reference/slices/selection-rabbit-art.png')} alt="" />
              </div>
              <div className="selection-hero-content">
                <div className="selection-hero-eyebrow-row">
                  <span className="selection-hero-eyebrow">选词页·词库范围控制器</span>
                  <span className="selection-hero-tag">已筛出 {filteredWords.length} 个</span>
                </div>
                <h1 className="selection-hero-title">词库管理</h1>
                <p className="selection-hero-desc">在这里先决定哪些词参与今天任务，再把真正需要学的范围稳定下来。</p>
                <div className="selection-hero-pills">
                  <div className="selection-hero-pill">
                    <strong>{enabledCount}</strong>
                    <span>已启用</span>
                  </div>
                  <div className="selection-hero-pill">
                    <strong>{pausedCount}</strong>
                    <span>已暂停</span>
                  </div>
                  <div className="selection-hero-pill">
                    <strong>{masteredCount}</strong>
                    <span>已掌握</span>
                  </div>
                  <div className="selection-hero-pill">
                    <strong>{filteredWords.length}</strong>
                    <span>当前筛出</span>
                  </div>
                </div>
              </div>
              <aside className="selection-hero-aside">
                <span className="selection-hero-aside-label">应用提示</span>
                <strong className="selection-hero-aside-title">可以继续微调</strong>
                <p className="selection-hero-aside-desc">{applyHint}</p>
                <button
                  className="primary-button selection-hero-aside-btn"
                  type="button"
                  onClick={() => void onApplySelectionPlan()}
                >
                  应用当前词库并返回复习页
                </button>
                <div className="selection-hero-plan-art" aria-hidden="true">
                  <img src={getAssetUrl('/design-reference/slices/selection-plan-art.png')} alt="" />
                </div>
              </aside>
            </section>

            {/* ── Three-column layout (y=340 in surface) ── */}
            <div className="selection-layout-section">

              {/* Sidebar (left=0, w=220) */}
              <aside className="selection-sidebar-panel">
                <div className="selection-sidebar-hd">
                  <strong>筛选</strong>
                  <p>先缩小范围，再决定是否启用或暂停。</p>
                </div>
                <label className="selection-field">
                  <span>搜索</span>
                  <input
                    className="selection-input"
                    type="search"
                    value={searchText}
                    placeholder="搜索英文、中文或分类"
                    onChange={(event) => { setSearchText(event.target.value); setCurrentPage(1); }}
                  />
                </label>
                <label className="selection-field">
                  <span>分类</span>
                  <select className="selection-select" value={selectedCategory} onChange={(event) => { setSelectedCategory(event.target.value); setCurrentPage(1); }}>
                    <option value="all">全部分类</option>
                    {payload.categories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </label>
                <label className="selection-field">
                  <span>Oxford Tree Level</span>
                  <select className="selection-select" value={selectedLevel} onChange={(event) => { setSelectedLevel(event.target.value); setCurrentPage(1); }}>
                    <option value="all">全部 Level</option>
                    {levelOptions.map((level) => (
                      <option key={level} value={level}>Level {level}</option>
                    ))}
                  </select>
                </label>
                <label className="selection-field">
                  <span>难度</span>
                  <select className="selection-select" value={selectedDifficulty} onChange={(event) => { setSelectedDifficulty(event.target.value); setCurrentPage(1); }}>
                    <option value="all">全部难度</option>
                    {[1, 2, 3, 4, 5].map((d) => (
                      <option key={d} value={d}>Lv.{d}</option>
                    ))}
                  </select>
                </label>
                <label className="selection-field">
                  <span>学习状态</span>
                  <select className="selection-select" value={selectedStatus} onChange={(event) => { setSelectedStatus(event.target.value as StatusFilter); setCurrentPage(1); }}>
                    <option value="all">全部状态</option>
                    <option value="new">未学</option>
                    <option value="learning">学习中</option>
                    <option value="mastered">已掌握</option>
                    <option value="paused">已暂停</option>
                    <option value="disabled">未启用</option>
                  </select>
                </label>
                <label className="selection-checkbox">
                  <input
                    type="checkbox"
                    checked={imageOnly}
                    onChange={(event) => { setImageOnly(event.target.checked); setCurrentPage(1); }}
                  />
                  <span>只看有已审核图片的词</span>
                </label>
                <button className="secondary-button selection-sidebar-reset" type="button" onClick={resetFilters}>
                  清空当前筛选
                </button>
              </aside>

              {/* Results (left=232, w=560) */}
              <section className="selection-results-panel">
                <div className="selection-results-hd">
                  <h2>词卡区</h2>
                  <p>先点详情理解词，再决定启用、暂停还是移出。</p>
                </div>
                <div className="selection-toolbar">
                  <div className="selection-toolbar__group">
                    <button
                      className={`selection-toolbar__chip${viewMode === 'grid' ? ' is-active' : ''}`}
                      type="button"
                      onClick={() => { setViewMode('grid'); setCurrentPage(1); }}
                    >
                      卡片视图
                    </button>
                    <button
                      className={`selection-toolbar__chip${viewMode === 'list' ? ' is-active' : ''}`}
                      type="button"
                      onClick={() => { setViewMode('list'); setCurrentPage(1); }}
                    >
                      列表视图
                    </button>
                  </div>
                  <div className="selection-toolbar__meta">
                    <label className="selection-toolbar__sort">
                      <span>排序</span>
                      <select
                        className="selection-select"
                        value={sortMode}
                        onChange={(event) => { setSortMode(event.target.value as SortMode); setCurrentPage(1); }}
                      >
                        <option value="level">按 Level</option>
                        <option value="difficulty">按难度</option>
                        <option value="recent">按最近变更</option>
                        <option value="alphabetical">按字母</option>
                      </select>
                    </label>
                  </div>
                </div>
                <p className="selection-results-hint">
                  当前显示 {Math.min((activePage) * pageSize, filteredWords.length)} / {filteredWords.length} 个词，批量操作仍按全部筛选结果。
                </p>
                <div className="selection-bulk-actions">
                  <button className="secondary-button selection-action selection-action--plan" type="button" onClick={() => void onApplySelectionPlan()}>
                    启用当前筛选结果
                  </button>
                  <button
                    className="secondary-button selection-action selection-action--pause"
                    type="button"
                    onClick={() => void savePatchedSelectionStates(filteredWords.map((word) => ({ wordId: word.id, isEnabled: true, isPaused: true })))}
                  >
                    暂停当前筛选结果
                  </button>
                  <button className="secondary-button selection-action selection-action--manage" type="button" onClick={() => void handleKeepOnlyFiltered()}>
                    只保留当前筛选结果
                  </button>
                </div>

                {filteredWords.length === 0 ? (
                  <article className="selection-empty-state">
                    <strong>当前筛选没有结果</strong>
                    <p>可以清空筛选，或者放宽分类、状态与图片条件。</p>
                  </article>
                ) : viewMode === 'grid' ? (
                  <div className="selection-card-grid">
                    {visibleWords.map((word) => {
                      const selectionState = selectionById[word.id] ?? createDefaultWordSelectionState(word.id);
                      const learningBucket = getWordLearningBucket(word.id, recordsById[word.id], selectionState);
                      const statusLabel =
                        learningBucket === 'paused' ? '已暂停' :
                        learningBucket === 'disabled' ? '未启用' :
                        learningBucket === 'mastered' ? '已掌握' :
                        learningBucket === 'learning' ? '学习中' : '未学';
                      const statusTone =
                        learningBucket === 'paused' ? 'paused' :
                        learningBucket === 'disabled' ? 'disabled' : 'active';
                      const visualOverride = isReferenceGridState ? REFERENCE_SELECTION_CARD_OVERRIDES[word.id] : undefined;

                      return (
                        <SelectionWordCard
                          key={word.id}
                          word={word}
                          statusLabel={visualOverride?.statusLabel ?? statusLabel}
                          statusTone={visualOverride?.statusTone ?? statusTone}
                          visualOverride={visualOverride}
                          isEnabled={selectionState.isEnabled}
                          isPaused={selectionState.isPaused}
                          updatedAtLabel={formatUpdatedAt(selectionState.updatedAt)}
                          onOpenDetails={() => setSelectedWordId(word.id)}
                          onToggleEnabled={() =>
                            void savePatchedSelectionStates([{
                              wordId: word.id,
                              isEnabled: !selectionState.isEnabled,
                              isPaused: false,
                            }])
                          }
                          onTogglePaused={() =>
                            void savePatchedSelectionStates([{
                              wordId: word.id,
                              isEnabled: true,
                              isPaused: !selectionState.isPaused,
                            }])
                          }
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="selection-list">
                    {visibleWords.map((word) => {
                      const selectionState = selectionById[word.id] ?? createDefaultWordSelectionState(word.id);
                      const learningBucket = getWordLearningBucket(word.id, recordsById[word.id], selectionState);
                      const statusLabel =
                        learningBucket === 'paused' ? '已暂停' :
                        learningBucket === 'disabled' ? '未启用' :
                        learningBucket === 'mastered' ? '已掌握' :
                        learningBucket === 'learning' ? '学习中' : '未学';
                      const statusTone =
                        learningBucket === 'paused' ? 'paused' :
                        learningBucket === 'disabled' ? 'disabled' : 'active';

                      return (
                        <SelectionWordRow
                          key={word.id}
                          word={word}
                          statusLabel={statusLabel}
                          statusTone={statusTone}
                          updatedAtLabel={formatUpdatedAt(selectionState.updatedAt)}
                          isEnabled={selectionState.isEnabled}
                          isPaused={selectionState.isPaused}
                          onOpenDetails={() => setSelectedWordId(word.id)}
                          onToggleEnabled={() =>
                            void savePatchedSelectionStates([{
                              wordId: word.id,
                              isEnabled: !selectionState.isEnabled,
                              isPaused: selectionState.isEnabled ? false : false,
                            }])
                          }
                          onTogglePaused={() =>
                            void savePatchedSelectionStates([{
                              wordId: word.id,
                              isEnabled: true,
                              isPaused: !selectionState.isPaused,
                            }])
                          }
                        />
                      );
                    })}
                  </div>
                )}

                <div className="selection-pagination">
                  <span>共 {filteredWords.length} 个单词</span>
                  <div className="selection-pagination__rail" aria-label="分页">
                    {pagination.map((item, index) =>
                      item === 'ellipsis' ? (
                        <span key={`ellipsis-${index}`} className="selection-pagination__ellipsis">…</span>
                      ) : (
                        <button
                          key={item}
                          className={`selection-pagination__button${item === activePage ? ' is-active' : ''}`}
                          type="button"
                          onClick={() => setCurrentPage(item)}
                        >
                          {item}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </section>

              {/* Summary (left=804, w=220) */}
              <aside className="selection-summary-panel">
                <div className="selection-summary-hd">
                  <h2>当前学习计划摘要</h2>
                  <p>右侧只显示当前选择带来的真实后果。</p>
                </div>
                <div className="selection-summary-stats">
                  <article className="selection-summary-stat">
                    <span>已启用</span>
                    <strong>{enabledCount}</strong>
                  </article>
                  <article className="selection-summary-stat">
                    <span>已暂停</span>
                    <strong>{pausedCount}</strong>
                  </article>
                  <article className="selection-summary-stat">
                    <span>明天到期</span>
                    <strong>{reviewLoad.dueTomorrowCount}</strong>
                  </article>
                  <article className="selection-summary-stat">
                    <span>未来 3 天</span>
                    <strong>{reviewLoad.dueInThreeDaysCount}</strong>
                  </article>
                </div>
                <div className="selection-summary-risk">
                  <span>压力标签</span>
                  <strong>{reviewLoad.riskLevel === '正常' ? '正常' : reviewLoad.riskLevel}</strong>
                  <p>当前启用范围还在舒适区，可以继续微调。</p>
                </div>
                <div className="selection-summary-breakdown">
                  <h3>分类占比</h3>
                  {categoryBreakdown.length > 0 ? (
                    <ul>
                      {categoryBreakdown.map(([category, count], index) => (
                        <li key={category}>
                          <span>{category}</span>
                          <div className="selection-summary__bar-track">
                            <div
                              className={`selection-summary__bar selection-summary__bar--${index % 6}`}
                              style={{ width: `${Math.max(12, Math.round((count / breakdownMax) * 100))}%` }}
                            />
                          </div>
                          <strong>{count}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>当前没有启用词。</p>
                  )}
                </div>
              </aside>

            </div>{/* /selection-layout-section */}
          </div>{/* /selection-dom-surface */}
        </div>{/* /selection-scroll-body */}

        {/* ── Dock bar (bottom 60px) ── */}
        <nav className="selection-dock-bar home-dock review-dock" aria-label="主页面导航">
          <SelectionDockButton glyph="review" label="复习" onClick={onBackHome} />
          <SelectionDockButton active glyph="selection" label="选词" onClick={() => {}} />
          <SelectionDockButton glyph="stats" label="统计" onClick={onOpenStats} />
          <SelectionDockButton glyph="settings" label="设置" onClick={onOpenSettings} />
        </nav>

      </div>{/* /selection-mockup-frame */}

      <WordDetailDrawer
        isOpen={Boolean(selectedWord)}
        word={selectedWord}
        record={selectedWordRecord}
        selectionState={selectedWordSelectionState}
        setting={setting}
        context="selection"
        onClose={() => setSelectedWordId(null)}
        onToggleEnabled={
          selectedWord
            ? () =>
                void savePatchedSelectionStates([{
                  wordId: selectedWord.id,
                  isEnabled: !(selectedWordSelectionState?.isEnabled ?? true),
                  isPaused: false,
                }])
            : undefined
        }
        onTogglePaused={
          selectedWord
            ? () =>
                void savePatchedSelectionStates([{
                  wordId: selectedWord.id,
                  isEnabled: true,
                  isPaused: !(selectedWordSelectionState?.isPaused ?? false),
                }])
            : undefined
        }
      />
    </main>
  );
}


