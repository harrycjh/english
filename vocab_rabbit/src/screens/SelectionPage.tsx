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
import { getAssetUrl, getPrimaryOxfordRefLabel, getStudyText, getWordImageUrl } from '../services/word-service';
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
  onOpenDetails: () => void;
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
  onOpenDetails,
  visualOverride,
}: SelectionWordCardProps) {
  const displayWord = getStudyText(word);
  const [hasArt, setHasArt] = useState(true);
  const artSrc = visualOverride?.demoArtPath
    ? getAssetUrl(visualOverride.demoArtPath)
    : hasArt
      ? getWordImageUrl(word.imagePath)
      : null;
  const categoryLabel = visualOverride?.categoryLabel ?? word.category;
  const chineseLabel = visualOverride?.chineseLabel ?? word.chinese;
  const partOfSpeechLabel = visualOverride?.partOfSpeechLabel ?? formatPartOfSpeech(word.partOfSpeech);
  const sourceLabel = visualOverride?.sourceLabel ?? getPrimaryOxfordRefLabel(word);
  const effectiveStatusLabel = visualOverride?.statusLabel ?? statusLabel;
  const effectiveStatusTone = visualOverride?.statusTone ?? statusTone;
  const colorSlot = getCategoryColorSlot(categoryLabel);

  return (
    <article className="selection-word-card">
      <button className="selection-word-card__body" type="button" onClick={onOpenDetails}>
        <div className="word-card__header">
          <span className={`word-card__category word-card__category--c${colorSlot}`}>{categoryLabel.length > 5 ? categoryLabel.slice(0, 5) : categoryLabel}</span>
          <span className={`selection-status-chip selection-status-chip--${effectiveStatusTone}`}>{effectiveStatusLabel}</span>
        </div>
        <span className="selection-word-card__favorite" aria-hidden="true">☆</span>
        <div className="selection-word-card__content">
          <div className="selection-word-card__art">
            {artSrc ? (
              <img
                src={artSrc}
                alt={chineseLabel}
                onError={visualOverride?.demoArtPath ? undefined : () => setHasArt(false)}
              />
            ) : (
              <span className="selection-word-card__art-fallback">{displayWord.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className="selection-word-card__copy">
            <h3 lang="en">{displayWord}</h3>
            <p>{chineseLabel}</p>
            <small>{partOfSpeechLabel}</small>
          </div>
        </div>
        <footer>
          <span className="selection-word-card__source-mark" aria-hidden="true" />
          <span>{sourceLabel ? sourceLabel : 'Oxford Tree · 暂未回填位置'}</span>
        </footer>
      </button>
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
        <strong lang="en">{getStudyText(word)}</strong>
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

function getSelectionDockButtonUrl(glyph: SelectionDockGlyph, active: boolean) {
  if (glyph === 'selection' && active) {
    return `${import.meta.env.BASE_URL}design-reference/slices/review-dock-selection-active-transparent.png?v=2`;
  }
  const state = active ? 'active' : 'default';
  return `${import.meta.env.BASE_URL}design-reference/slices/review-dock-${glyph}-${state}-transparent.png?v=2`;
}

function SelectionDockButton({ active = false, glyph, label, onClick }: SelectionDockButtonProps) {
  const bgUrl = getSelectionDockButtonUrl(glyph, active);
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
  const [sortMode, setSortMode] = useState<SortMode>('alphabetical');
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
    () => Object.values(selectionById).filter((s) => s.isEnabled && !s.isPaused).length,
    [selectionById]
  );
  const pausedCount = useMemo(
    () => Object.values(selectionById).filter((s) => s.isPaused).length,
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
        const leftIdx = REFERENCE_SELECTION_CARD_INDEX.get(left.id);
        const rightIdx = REFERENCE_SELECTION_CARD_INDEX.get(right.id);
        if (leftIdx !== undefined || rightIdx !== undefined) {
          if (leftIdx === undefined) return 1;
          if (rightIdx === undefined) return -1;
          return leftIdx - rightIdx;
        }
        return left.english.localeCompare(right.english);
      }

      if (sortMode === 'alphabetical') return left.english.localeCompare(right.english);
      if (sortMode === 'difficulty') return left.difficulty - right.difficulty || left.english.localeCompare(right.english);
      if (sortMode === 'recent') {
        const l = selectionById[left.id]?.updatedAt ?? '';
        const r = selectionById[right.id]?.updatedAt ?? '';
        return r.localeCompare(l) || left.english.localeCompare(right.english);
      }
      return (getPrimaryLevel(left) ?? 999) - (getPrimaryLevel(right) ?? 999) ||
        left.difficulty - right.difficulty ||
        left.english.localeCompare(right.english);
    });
  }, [imageOnly, payload.words, recordsById, searchText, selectedCategory, selectedDifficulty, selectedLevel, selectedStatus, selectionById, sortMode]);

  const pageSize = 6;
  const totalPages = Math.max(1, Math.ceil(filteredWords.length / pageSize));
  const activePage = Math.min(currentPage, totalPages);
  const visibleWords = useMemo(() => {
    const start = (activePage - 1) * pageSize;
    return filteredWords.slice(start, start + pageSize);
  }, [activePage, filteredWords]);

  const reviewLoad = useMemo(() => estimateReviewLoad(recordsById, selectionById, setting), [recordsById, selectionById, setting]);

  const categoryBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const word of payload.words) {
      const s = selectionById[word.id] ?? createDefaultWordSelectionState(word.id);
      if (s.isEnabled && !s.isPaused) {
        counts.set(word.category, (counts.get(word.category) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [payload.words, selectionById]);

  const selectedWord = selectedWordId ? payload.words.find((w) => w.id === selectedWordId) ?? null : null;
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
  const pagination = useMemo(() => buildPagination(totalPages, activePage), [activePage, totalPages]);
  const breakdownMax = categoryBreakdown[0]?.[1] ?? 1;

  async function savePatchedSelectionStates(states: Array<Partial<WordSelectionState> & Pick<WordSelectionState, 'wordId'>>) {
    const nextStates = states.map((state) => {
      const cur = selectionById[state.wordId] ?? createDefaultWordSelectionState(state.wordId);
      return normalizeWordSelectionState({ ...cur, ...state, updatedAt: new Date().toISOString() });
    });
    await onSaveSelectionStates(nextStates);
  }

  async function handleKeepOnlyFiltered() {
    const filteredIds = new Set(filteredWords.map((w) => w.id));
    const nextStates = payload.words.map((w) => ({ wordId: w.id, isEnabled: filteredIds.has(w.id), isPaused: false }));
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

        {/* Chrome bar */}
        <div className="selection-shell__chrome">
          <div className="selection-shell__brand">
            <span className="selection-shell__brand-mark" aria-hidden="true" />
            <span>VocaRabbit</span>
          </div>
          <button className="selection-shell__profile" type="button">
            <span className="selection-shell__profile-avatar" aria-hidden="true" />
            <span>小雨的家长</span>
          </button>
        </div>

        {/* Three-column layout */}
        <section className="selection-layout">

          {/* Left sidebar: filters */}
          <aside className="section-block selection-sidebar">
            <div className="section-block__header">
              <h2>筛选条件</h2>
            </div>
            <label className="selection-field">
              <span>搜索</span>
              <input
                className="selection-input"
                type="search"
                value={searchText}
                placeholder="搜索单词或中文意思"
                onChange={(e) => { setSearchText(e.target.value); setCurrentPage(1); }}
              />
            </label>
            <label className="selection-field">
              <span>词类分类</span>
              <select className="selection-select" value={selectedCategory} onChange={(e) => { setSelectedCategory(e.target.value); setCurrentPage(1); }}>
                <option value="all">全部词类</option>
                {payload.categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </label>
            <label className="selection-field">
              <span>Oxford Tree</span>
              <select className="selection-select" value={selectedLevel} onChange={(e) => { setSelectedLevel(e.target.value); setCurrentPage(1); }}>
                <option value="all">全部等级</option>
                {levelOptions.map((lv) => <option key={lv} value={lv}>Level {lv}</option>)}
              </select>
            </label>
            <label className="selection-field">
              <span>难度</span>
              <select className="selection-select" value={selectedDifficulty} onChange={(e) => { setSelectedDifficulty(e.target.value); setCurrentPage(1); }}>
                <option value="all">全部难度</option>
                {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>Lv.{d}</option>)}
              </select>
            </label>
            <label className="selection-field">
              <span>学习状态</span>
              <select className="selection-select" value={selectedStatus} onChange={(e) => { setSelectedStatus(e.target.value as StatusFilter); setCurrentPage(1); }}>
                <option value="all">全部状态</option>
                <option value="new">未学</option>
                <option value="learning">学习中</option>
                <option value="mastered">已掌握</option>
                <option value="paused">已暂停</option>
                <option value="disabled">未启用</option>
              </select>
            </label>
            <label className="selection-toggle">
              <span>仅图片题</span>
              <span className={`selection-toggle__track${imageOnly ? ' is-active' : ''}`} aria-hidden="true">
                <span className="selection-toggle__thumb" />
              </span>
              <input type="checkbox" checked={imageOnly} onChange={(e) => { setImageOnly(e.target.checked); setCurrentPage(1); }} />
            </label>
            <button className="secondary-button" type="button" onClick={resetFilters}>重置筛选</button>
          </aside>

          {/* Center: results */}
          <section className="section-block selection-results">
            <div className="selection-results__intro">
              <h1>词库管理</h1>
              <p>在这里整理孩子的学习词库，灵活安排复习与预习。</p>
            </div>
            <div className="selection-toolbar">
              <div className="selection-toolbar__group">
                <button className={`selection-toolbar__chip${viewMode === 'grid' ? ' is-active' : ''}`} type="button"
                  onClick={() => { setViewMode('grid'); setCurrentPage(1); }}>卡片视图</button>
                <button className={`selection-toolbar__chip${viewMode === 'list' ? ' is-active' : ''}`} type="button"
                  onClick={() => { setViewMode('list'); setCurrentPage(1); }}>列表视图</button>
              </div>
              <div className="selection-toolbar__meta">
                <label className="selection-toolbar__sort">
                  <span>按字母排序</span>
                  <select className="selection-select" value={sortMode}
                    onChange={(e) => { setSortMode(e.target.value as SortMode); setCurrentPage(1); }}>
                    <option value="level">按 Level</option>
                    <option value="difficulty">按难度</option>
                    <option value="recent">按最近变更</option>
                    <option value="alphabetical">按字母</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="selection-bulk-actions">
              <button className="secondary-button selection-action selection-action--plan" type="button" onClick={() => void onApplySelectionPlan()}>加入计划</button>
              <button className="secondary-button selection-action selection-action--pause" type="button"
                onClick={() => void savePatchedSelectionStates(filteredWords.map((w) => ({ wordId: w.id, isEnabled: true, isPaused: true })))}>暂停复习</button>
              <button className="secondary-button selection-action selection-action--manage" type="button" onClick={() => void handleKeepOnlyFiltered()}>批量管理</button>
            </div>

            {filteredWords.length === 0 ? (
              <article className="selection-empty-state">
                <strong>当前筛选没有结果</strong>
                <p>可以清空筛选，或者放宽分类、状态与图片条件。</p>
              </article>
            ) : viewMode === 'grid' ? (
              <div className="selection-card-grid">
                {visibleWords.map((word) => {
                  const ss = selectionById[word.id] ?? createDefaultWordSelectionState(word.id);
                  const bucket = getWordLearningBucket(word.id, recordsById[word.id], ss);
                  const sl = bucket === 'paused' ? '已暂停' : bucket === 'disabled' ? '未启用' : bucket === 'mastered' ? '已掌握' : bucket === 'learning' ? '学习中' : '未学';
                  const st = bucket === 'paused' ? 'paused' : bucket === 'disabled' ? 'disabled' : 'active';
                  const vo = isReferenceGridState ? REFERENCE_SELECTION_CARD_OVERRIDES[word.id] : undefined;
                  return (
                    <SelectionWordCard
                      key={word.id}
                      word={word}
                      statusLabel={vo?.statusLabel ?? sl}
                      statusTone={vo?.statusTone ?? st}
                      visualOverride={vo}
                      onOpenDetails={() => setSelectedWordId(word.id)}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="selection-list">
                {visibleWords.map((word) => {
                  const ss = selectionById[word.id] ?? createDefaultWordSelectionState(word.id);
                  const bucket = getWordLearningBucket(word.id, recordsById[word.id], ss);
                  const sl = bucket === 'paused' ? '已暂停' : bucket === 'disabled' ? '未启用' : bucket === 'mastered' ? '已掌握' : bucket === 'learning' ? '学习中' : '未学';
                  const st = bucket === 'paused' ? 'paused' : bucket === 'disabled' ? 'disabled' : 'active';
                  return (
                    <SelectionWordRow
                      key={word.id} word={word} statusLabel={sl} statusTone={st}
                      updatedAtLabel={formatUpdatedAt(ss.updatedAt)}
                      isEnabled={ss.isEnabled} isPaused={ss.isPaused}
                      onOpenDetails={() => setSelectedWordId(word.id)}
                      onToggleEnabled={() => void savePatchedSelectionStates([{ wordId: word.id, isEnabled: !ss.isEnabled, isPaused: false }])}
                      onTogglePaused={() => void savePatchedSelectionStates([{ wordId: word.id, isEnabled: true, isPaused: !ss.isPaused }])}
                    />
                  );
                })}
              </div>
            )}

            <div className="selection-pagination">
              <span>共 {filteredWords.length} 个单词</span>
              <div className="selection-pagination__rail">
                {pagination.map((item, idx) =>
                  item === 'ellipsis' ? (
                    <span key={`e-${idx}`} className="selection-pagination__ellipsis">…</span>
                  ) : (
                    <button key={item} className={`selection-pagination__button${item === activePage ? ' is-active' : ''}`}
                      type="button" onClick={() => setCurrentPage(item)}>{item}</button>
                  )
                )}
              </div>
            </div>
          </section>

          {/* Right sidebar: summary */}
          <aside className="section-block selection-summary">
            <article className="selection-summary__hero">
              <div className="selection-summary__hero-head">
                <h2>计划摘要</h2>
                <span className="selection-summary__info">i</span>
              </div>
              <div className="selection-summary__hero-art" aria-hidden="true" />
              <div className="selection-summary__stats">
                <article>
                  <span className="selection-summary__stat-icon selection-summary__stat-icon--enabled" aria-hidden="true" />
                  <span>已启用单词</span>
                  <strong>{enabledCount}</strong>
                </article>
                <article>
                  <span className="selection-summary__stat-icon selection-summary__stat-icon--paused" aria-hidden="true" />
                  <span>已暂停单词</span>
                  <strong>{pausedCount}</strong>
                </article>
                <article>
                  <span className="selection-summary__stat-icon selection-summary__stat-icon--due" aria-hidden="true" />
                  <span>明日待复习</span>
                  <strong>{reviewLoad.dueTomorrowCount}</strong>
                </article>
                <article>
                  <span className="selection-summary__stat-icon selection-summary__stat-icon--future" aria-hidden="true" />
                  <span>3 天内待复习</span>
                  <strong>{reviewLoad.dueInThreeDaysCount}</strong>
                </article>
                <article className="selection-summary__stat-row selection-summary__stat-row--risk">
                  <span className="selection-summary__stat-icon selection-summary__stat-icon--risk" aria-hidden="true" />
                  <span>当前压力</span>
                  <strong>{reviewLoad.riskLevel === '正常' ? '轻松' : reviewLoad.riskLevel}</strong>
                </article>
              </div>
            </article>
            <div className="selection-summary__breakdown">
              <h3>词类分布</h3>
              {categoryBreakdown.length > 0 ? (
                <ul>
                  {categoryBreakdown.map(([cat, count], idx) => (
                    <li key={cat}>
                      <span>{cat}</span>
                      <div className="selection-summary__bar-track">
                        <div className={`selection-summary__bar selection-summary__bar--${idx % 6}`}
                          style={{ width: `${Math.max(12, Math.round((count / breakdownMax) * 100))}%` }} />
                      </div>
                      <strong>{count}</strong>
                    </li>
                  ))}
                </ul>
              ) : <p>当前没有启用词。</p>}
            </div>
          </aside>
        </section>

        {/* Dock bar */}
        <nav className="home-dock review-dock selection-dock" aria-label="主页面导航">
          <SelectionDockButton glyph="review" label="复习" onClick={onBackHome} />
          <SelectionDockButton active glyph="selection" label="选词" onClick={() => {}} />
          <SelectionDockButton glyph="stats" label="统计" onClick={onOpenStats} />
          <SelectionDockButton glyph="settings" label="设置" onClick={onOpenSettings} />
        </nav>
      </div>

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
            ? () => void savePatchedSelectionStates([{ wordId: selectedWord.id, isEnabled: !(selectedWordSelectionState?.isEnabled ?? true), isPaused: false }])
            : undefined
        }
        onTogglePaused={
          selectedWord
            ? () => void savePatchedSelectionStates([{ wordId: selectedWord.id, isEnabled: true, isPaused: !(selectedWordSelectionState?.isPaused ?? false) }])
            : undefined
        }
      />
    </main>
  );
}
