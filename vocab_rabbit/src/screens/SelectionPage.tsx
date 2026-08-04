import { useEffect, useMemo, useState } from 'react';
import { useStageSize } from '../app/use-stage-size';
import { calculateSelectionPageSize } from './selection-density';
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
import type { WordPayload, WordRecord } from '../models/word';
import { MAX_MASTERY_LEVEL } from '../services/spaced-repetition';
import { estimateReviewLoad, getWordLearningBucket } from '../services/selection-service';
import {
  getStudyChinese,
  getStudyPartOfSpeech,
  getStudyText,
} from '../services/word-service';
import { WordDetailDrawer } from '../components/WordDetailDrawer';
import { WordImage } from '../components/WordImage';
import { MasteryLevelIcon } from '../components/MasteryLevelIcon';
import { formatDifficultyStars } from '../components/DifficultyStars';
import { APP_VERSION } from '../config/app-meta';
import { ProfileSelector } from '../components/ProfileSelector';
import { NewWordQueueDrawer } from '../components/NewWordQueueDrawer';

type StatusFilter = 'all' | 'new' | 'learning' | 'mastered' | 'paused' | 'disabled';
type WordSourceFilter = 'all' | 'oxford' | 'redRocket' | 'lifePhoto';
type SortMode = 'level' | 'difficulty' | 'recent' | 'alphabetical';
type ViewMode = 'grid' | 'list';
type PaginationToken = number | 'ellipsis';

interface SelectionPageProps {
  payload: WordPayload;
  recordsById: Record<string, LearningRecord>;
  selectionById: Record<string, WordSelectionState>;
  answerEvents: AnswerEvent[];
  setting: ParentSetting;
  task: DailyTaskSummary;
  localLifePhotosById: Record<string, LocalLifePhotoView>;
  onBackHome: () => void;
  onSelectProfile: (profileId: ProfileId) => Promise<void>;
  onOpenStats: () => void;
  onSaveSelectionStates: (states: WordSelectionState[]) => Promise<void>;
  onApplySelectionPlan: () => Promise<void>;
  onChangeNewWordQueue: (wordIds: string[]) => Promise<void>;
  onRemoveTodayNewWord: (wordId: string) => Promise<void>;
  onRequestLocalLifePhoto?: (wordId: string) => void;
  openNewWordQueue?: boolean;
  onNewWordQueueOpened?: () => void;
}

interface SelectionWordCardProps {
  word: WordRecord;
  masteryLevel: number;
  onOpenDetails: () => void;
  onToggleEnabled: () => void;
  onTogglePaused: () => void;
  onAddToQueue: () => void;
  isEnabled: boolean;
  isPaused: boolean;
  isQueued: boolean;
  canQueue: boolean;
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
  onAddToQueue: () => void;
  isEnabled: boolean;
  isPaused: boolean;
  isQueued: boolean;
  canQueue: boolean;
}

interface SelectionCardVisualOverride {
  categoryLabel?: string;
  chineseLabel?: string;
  partOfSpeechLabel?: string;
  sourceLabel?: string;
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
    statusLabel: '已启用',
    statusTone: 'active',
  },
  ket_friend_n: {
    categoryLabel: '主题人物',
    chineseLabel: '朋友',
    partOfSpeechLabel: 'n. 名词',
    sourceLabel: 'Oxford Tree · Lv.1 Unit 4',
    statusLabel: '已启用',
    statusTone: 'active',
  },
  ket_arm_n: {
    categoryLabel: '身体部位',
    chineseLabel: '手臂',
    partOfSpeechLabel: 'n. 名词',
    sourceLabel: 'Oxford Tree · Lv.1 Unit 5',
    statusLabel: '已启用',
    statusTone: 'active',
  },
  ket_better_adj_adv: {
    categoryLabel: '品质与状态',
    chineseLabel: '更好',
    partOfSpeechLabel: 'adj. 形容词',
    sourceLabel: 'Oxford Tree · Lv.3 Unit 8',
    statusLabel: '已启用',
    statusTone: 'active',
  },
  ket_after_adv_prep: {
    categoryLabel: '时间与顺序',
    chineseLabel: '在……之后',
    partOfSpeechLabel: 'prep. 介词',
    sourceLabel: 'Oxford Tree · Lv.2 Unit 2',
    statusLabel: '已暂停',
    statusTone: 'paused',
  },
  ket_again_adv: {
    categoryLabel: '频率与次数',
    chineseLabel: '再一次',
    partOfSpeechLabel: 'adv. 副词',
    sourceLabel: 'Oxford Tree · Lv.2 Unit 5',
    statusLabel: '已启用',
    statusTone: 'active',
  },
};

function SelectionWordCard({
  word,
  masteryLevel,
  onOpenDetails,
  onToggleEnabled,
  onTogglePaused,
  onAddToQueue,
  isEnabled,
  isPaused,
  isQueued,
  canQueue,
  visualOverride,
}: SelectionWordCardProps) {
  const displayWord = getStudyText(word);
  const [hasArt, setHasArt] = useState(true);
  const categoryLabel = visualOverride?.categoryLabel ?? word.category;
  const chineseLabel = visualOverride?.chineseLabel ?? getStudyChinese(word);
  const partOfSpeechLabel = visualOverride?.partOfSpeechLabel
    ?? formatPartOfSpeech(getStudyPartOfSpeech(word));
  const colorSlot = getCategoryColorSlot(categoryLabel);

  return (
    <article className="selection-word-card">
      <button className="selection-word-card__body" type="button" onClick={onOpenDetails}>
        <div className="word-card__header">
          <span className={`word-card__category word-card__category--c${colorSlot}`}>{categoryLabel.length > 5 ? categoryLabel.slice(0, 5) : categoryLabel}</span>
          <MasteryLevelIcon level={masteryLevel} className="selection-word-card__level" />
        </div>
        <div className="selection-word-card__content">
          <div className="selection-word-card__art">
            {hasArt ? (
              <WordImage
                word={word}
                alt={chineseLabel}
                onError={() => setHasArt(false)}
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
      </button>
      <div className="selection-word-card__actions">
        <button className={isEnabled ? 'secondary-button' : 'primary-button'} type="button" onClick={onToggleEnabled}>
          {isEnabled ? '移出' : '启用'}
        </button>
        {isEnabled ? (
          <button className="secondary-button" type="button" onClick={onTogglePaused}>
            {isPaused ? '恢复' : '暂停'}
          </button>
        ) : null}
        <button className="secondary-button selection-word-card__queue" type="button" disabled={!canQueue || isQueued} onClick={onAddToQueue}>
          {isQueued ? '已排队' : canQueue ? '加入队列' : '已学习'}
        </button>
      </div>
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
  onAddToQueue,
  isEnabled,
  isPaused,
  isQueued,
  canQueue,
}: SelectionWordRowProps) {
  return (
    <article className="selection-word-row">
      <button className="selection-word-row__main" type="button" onClick={onOpenDetails}>
        <strong lang="en">{getStudyText(word)}</strong>
        <span>{getStudyChinese(word)}</span>
        <span>{word.category}</span>
        <span>{getStudyPartOfSpeech(word)}</span>
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
        <button className="secondary-button" type="button" disabled={!canQueue || isQueued} onClick={onAddToQueue}>
          {isQueued ? '已排队' : canQueue ? '加入队列' : '已学习'}
        </button>
      </div>
    </article>
  );
}

function getPrimaryLevel(word: WordRecord): number | null {
  return word.oxfordRefs[0]?.level ?? null;
}

export function matchesWordSourceFilter(
  word: WordRecord,
  filter: WordSourceFilter,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'oxford') return Boolean(word.relatedMedia?.oxford);
  if (filter === 'redRocket') return Boolean(word.relatedMedia?.redRocket);
  return Boolean(word.hasLifePhoto);
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
  answerEvents,
  setting,
  task,
  localLifePhotosById,
  onBackHome,
  onSelectProfile,
  onOpenStats,
  onSaveSelectionStates,
  onApplySelectionPlan,
  onChangeNewWordQueue,
  onRemoveTodayNewWord,
  onRequestLocalLifePhoto,
  openNewWordQueue = false,
  onNewWordQueueOpened,
}: SelectionPageProps) {
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedDifficulty, setSelectedDifficulty] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('all');
  const [wordSourceFilter, setWordSourceFilter] = useState<WordSourceFilter>('all');
  const [imageOnly, setImageOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('alphabetical');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [isQueueOpen, setIsQueueOpen] = useState(false);

  useEffect(() => {
    if (!openNewWordQueue) return;
    setIsQueueOpen(true);
    onNewWordQueueOpened?.();
  }, [onNewWordQueueOpened, openNewWordQueue]);
  const activeManualQueue = useMemo(() => setting.newWordQueue.filter((wordId) => {
    const state = selectionById[wordId];
    return !recordsById[wordId] && (!state || (state.isEnabled && !state.isPaused));
  }), [recordsById, selectionById, setting.newWordQueue]);
  const queuedWordIds = useMemo(
    () => new Set([...activeManualQueue, ...task.newWordIds]),
    [activeManualQueue, task.newWordIds],
  );

  function openWordDetails(wordId: string) {
    setSelectedWordId(wordId);
    onRequestLocalLifePhoto?.(wordId);
  }

  const masteredCount = useMemo(
    () => Object.values(recordsById).filter((record) => record.masteryLevel >= MAX_MASTERY_LEVEL).length,
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
      selectedDifficulty === 'all' &&
      selectedStatus === 'all' &&
      wordSourceFilter === 'all' &&
      !imageOnly &&
      sortMode === 'alphabetical';

    const nextWords = payload.words.filter((word) => {
      const selectionState = selectionById[word.id] ?? createDefaultWordSelectionState(word.id);
      const learningBucket = getWordLearningBucket(word.id, recordsById[word.id], selectionState);
      const matchesSearch = !normalizedSearch ||
        word.english.toLowerCase().includes(normalizedSearch) ||
        word.chinese.includes(searchText.trim()) ||
        getStudyChinese(word).includes(searchText.trim()) ||
        word.category.includes(searchText.trim());
      const matchesCategory = selectedCategory === 'all' || word.category === selectedCategory;
      const matchesDifficulty = selectedDifficulty === 'all' || word.difficulty === Number(selectedDifficulty);
      const matchesStatus = selectedStatus === 'all' || learningBucket === selectedStatus;
      const matchesSource = matchesWordSourceFilter(
        word,
        wordSourceFilter,
      );
      const matchesImage = !imageOnly || word.imageApproved;

      return matchesSearch && matchesCategory && matchesDifficulty && matchesStatus &&
        matchesSource && matchesImage;
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
  }, [imageOnly, payload.words, recordsById, searchText, selectedCategory, selectedDifficulty, selectedStatus, selectionById, sortMode, wordSourceFilter]);

  const stageSize = useStageSize();
  const pageSize = calculateSelectionPageSize(stageSize.height);
  const totalPages = Math.max(1, Math.ceil(filteredWords.length / pageSize));
  const activePage = Math.min(currentPage, totalPages);
  const visibleWords = useMemo(() => {
    const start = (activePage - 1) * pageSize;
    return filteredWords.slice(start, start + pageSize);
  }, [activePage, filteredWords, pageSize]);

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
    selectedDifficulty === 'all' &&
    selectedStatus === 'all' &&
    wordSourceFilter === 'all' &&
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

  async function handleSetFilteredEnabled(isEnabled: boolean) {
    await savePatchedSelectionStates(filteredWords.map((w) => ({ wordId: w.id, isEnabled, isPaused: false })));
  }

  function resetFilters() {
    setSearchText('');
    setSelectedCategory('all');
    setSelectedDifficulty('all');
    setSelectedStatus('all');
    setWordSourceFilter('all');
    setImageOnly(false);
    setSortMode('alphabetical');
    setCurrentPage(1);
  }

  return (
    <main className="page page--home page--selection" data-profile={setting.profileId}>
      <div className="selection-mockup-frame">

        {/* Chrome bar */}
        <div className="selection-shell__chrome">
          <div className="selection-shell__brand app-brand-lockup">
            <span className="app-brand-lockup__mark" aria-hidden="true" />
            <span className="app-brand-lockup__wordmark">VocaRabbit</span>
            <span className="app-version-badge">{APP_VERSION}</span>
          </div>
          <ProfileSelector
            value={setting.profileId}
            buttonClassName="selection-shell__profile app-profile-chip"
            onChange={onSelectProfile}
          />
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
              <span>词语来源</span>
              <select className="selection-select" value={wordSourceFilter} onChange={(e) => { setWordSourceFilter(e.target.value as WordSourceFilter); setCurrentPage(1); }}>
                <option value="all">全部来源</option>
                <option value="oxford">Oxford</option>
                <option value="redRocket">Red Rocket</option>
                <option value="lifePhoto">生活图片</option>
              </select>
            </label>
            <label className="selection-field">
              <span>星级</span>
              <select className="selection-select" value={selectedDifficulty} onChange={(e) => { setSelectedDifficulty(e.target.value); setCurrentPage(1); }}>
                <option value="all">全部星级</option>
                {[1, 2, 3, 4, 5].map((d) => (
                  <option key={d} value={d}>{formatDifficultyStars(d)} {d}星</option>
                ))}
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
                <button className="selection-toolbar__chip selection-toolbar__queue" type="button" onClick={() => setIsQueueOpen(true)}>
                  新词队列 <strong>{activeManualQueue.length}</strong>
                </button>
              </div>
              <div className="selection-toolbar__meta">
                <label className="selection-toolbar__sort">
                  <span>按字母排序</span>
                  <select className="selection-select" value={sortMode}
                    onChange={(e) => { setSortMode(e.target.value as SortMode); setCurrentPage(1); }}>
                    <option value="level">按 Level</option>
                    <option value="difficulty">按星级</option>
                    <option value="recent">按最近变更</option>
                    <option value="alphabetical">按字母</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="selection-bulk-actions">
              <button className="primary-button selection-action selection-action--plan" type="button" onClick={() => void onApplySelectionPlan()}>保存返回</button>
              <button className="secondary-button selection-action selection-action--plan" type="button"
                onClick={() => void handleSetFilteredEnabled(true)}>启用筛选结果</button>
              <button className="secondary-button selection-action selection-action--pause" type="button"
                onClick={() => void savePatchedSelectionStates(filteredWords.map((w) => ({ wordId: w.id, isEnabled: true, isPaused: true })))}>暂停筛选结果</button>
              <button className="secondary-button selection-action selection-action--manage" type="button"
                onClick={() => void handleSetFilteredEnabled(false)}>移出筛选结果</button>
              <button className="secondary-button selection-action selection-action--manage" type="button" onClick={() => void handleKeepOnlyFiltered()}>仅保留筛选结果</button>
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
                  const vo = isReferenceGridState ? REFERENCE_SELECTION_CARD_OVERRIDES[word.id] : undefined;
                  const canQueue = !recordsById[word.id] && ss.isEnabled && !ss.isPaused;
                  return (
                    <SelectionWordCard
                      key={word.id}
                      word={word}
                      masteryLevel={recordsById[word.id]?.masteryLevel ?? 0}
                      visualOverride={vo}
                      onOpenDetails={() => openWordDetails(word.id)}
                      isEnabled={ss.isEnabled}
                      isPaused={ss.isPaused}
                      isQueued={queuedWordIds.has(word.id)}
                      canQueue={canQueue}
                      onAddToQueue={() => void onChangeNewWordQueue([...setting.newWordQueue, word.id])}
                      onToggleEnabled={() => void savePatchedSelectionStates([{ wordId: word.id, isEnabled: !ss.isEnabled, isPaused: false }])}
                      onTogglePaused={() => void savePatchedSelectionStates([{ wordId: word.id, isEnabled: true, isPaused: !ss.isPaused }])}
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
                  const canQueue = !recordsById[word.id] && ss.isEnabled && !ss.isPaused;
                  return (
                    <SelectionWordRow
                      key={word.id} word={word} statusLabel={sl} statusTone={st}
                      updatedAtLabel={formatUpdatedAt(ss.updatedAt)}
                      isEnabled={ss.isEnabled} isPaused={ss.isPaused}
                      isQueued={queuedWordIds.has(word.id)} canQueue={canQueue}
                      onAddToQueue={() => void onChangeNewWordQueue([...setting.newWordQueue, word.id])}
                      onOpenDetails={() => openWordDetails(word.id)}
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
      </div>

      <WordDetailDrawer
        isOpen={Boolean(selectedWord)}
        word={selectedWord}
        record={selectedWordRecord}
        selectionState={selectedWordSelectionState}
        answerEvents={answerEvents}
        setting={setting}
        localLifePhoto={selectedWord ? localLifePhotosById[selectedWord.id] : undefined}
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
        queueCompanion={isQueueOpen}
      />
      <NewWordQueueDrawer
        isOpen={isQueueOpen}
        words={payload.words}
        recordsById={recordsById}
        selectionById={selectionById}
        task={task}
        queue={setting.newWordQueue}
        onClose={() => {
          setIsQueueOpen(false);
          setSelectedWordId(null);
        }}
        onChangeQueue={onChangeNewWordQueue}
        onRemoveTodayWord={onRemoveTodayNewWord}
        onOpenWord={openWordDetails}
      />
    </main>
  );
}
