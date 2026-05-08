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
import { getPrimaryOxfordRefLabel, getStudyText } from '../services/word-service';
import { WordDetailDrawer } from '../components/WordDetailDrawer';

type StatusFilter = 'all' | 'new' | 'learning' | 'mastered' | 'paused' | 'disabled';
type SortMode = 'level' | 'difficulty' | 'recent' | 'alphabetical';
type ViewMode = 'grid' | 'list';

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
  updatedAtLabel: string;
  onOpenDetails: () => void;
  onToggleEnabled: () => void;
  onTogglePaused: () => void;
  isEnabled: boolean;
  isPaused: boolean;
}

interface SelectionWordRowProps extends SelectionWordCardProps {}

function SelectionWordCard({
  word,
  statusLabel,
  statusTone,
  updatedAtLabel,
  onOpenDetails,
  onToggleEnabled,
  onTogglePaused,
  isEnabled,
  isPaused,
}: SelectionWordCardProps) {
  const oxfordLabel = getPrimaryOxfordRefLabel(word);

  return (
    <article className="selection-word-card">
      <button className="selection-word-card__body" type="button" onClick={onOpenDetails}>
        <div className="word-card__header">
          <span className="word-card__category">{word.category}</span>
          <span className={`selection-status-chip selection-status-chip--${statusTone}`}>{statusLabel}</span>
        </div>
        <h3>{getStudyText(word)}</h3>
        <p>{word.chinese}</p>
        <footer>
          <span>{word.partOfSpeech}</span>
          <span>{oxfordLabel ?? '暂未回填牛津树位置'}</span>
        </footer>
      </button>
      <div className="selection-word-card__actions">
        <button className="secondary-button" type="button" onClick={onOpenDetails}>
          详情
        </button>
        <button className={isEnabled ? 'secondary-button' : 'primary-button'} type="button" onClick={onToggleEnabled}>
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
  const applyHint = !task.completedAt && task.totalAnswered === 0
    ? '应用后会立即重算今天任务并返回复习页。'
    : '当前任务已经开始或完成，应用后会保存词范围，但不会覆盖今天已生成的任务。';

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
    setSortMode('level');
  }

  return (
    <main className="page page--home page--selection">
      <section className="hero-card selection-hero">
        <div className="selection-hero__content">
          <span className="hero-card__eyebrow">选词页 · 词库范围控制器</span>
          <h1>先决定学哪些词，再决定今天怎么学</h1>
          <p>这里的选择会先保存在本机。未开始今天任务时，点击应用会立即重算今天的学习范围。</p>
          <div className="review-pill-row" aria-label="选词页摘要">
            <span className="review-pill">启用 {enabledCount}</span>
            <span className="review-pill">暂停 {pausedCount}</span>
            <span className="review-pill">已掌握 {masteredCount}</span>
            <span className="review-pill">当前筛出 {filteredWords.length}</span>
          </div>
        </div>
        <div className="selection-hero__aside">
          <span className="settings-hero__label">应用提示</span>
          <strong>{reviewLoad.riskLevel === '过高' ? '先收缩词量' : '可以继续微调'}</strong>
          <p>{applyHint}</p>
          <button className="primary-button" type="button" onClick={() => void onApplySelectionPlan()}>
            应用当前词库并返回复习
          </button>
        </div>
      </section>

      <section className="selection-layout">
        <aside className="section-block selection-sidebar">
          <div className="section-block__header">
            <h2>筛选</h2>
            <p>先缩小范围，再决定是否启用或暂停。</p>
          </div>
          <label className="selection-field">
            <span>搜索</span>
            <input
              className="selection-input"
              type="search"
              value={searchText}
              placeholder="搜英文、中文或分类"
              onChange={(event) => setSearchText(event.target.value)}
            />
          </label>
          <label className="selection-field">
            <span>分类</span>
            <select className="selection-select" value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
              <option value="all">全部分类</option>
              {payload.categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label className="selection-field">
            <span>Level</span>
            <select className="selection-select" value={selectedLevel} onChange={(event) => setSelectedLevel(event.target.value)}>
              <option value="all">全部 Level</option>
              {levelOptions.map((level) => (
                <option key={level} value={level}>
                  Level {level}
                </option>
              ))}
            </select>
          </label>
          <label className="selection-field">
            <span>难度</span>
            <select className="selection-select" value={selectedDifficulty} onChange={(event) => setSelectedDifficulty(event.target.value)}>
              <option value="all">全部难度</option>
              {[1, 2, 3, 4, 5].map((difficulty) => (
                <option key={difficulty} value={difficulty}>
                  Lv.{difficulty}
                </option>
              ))}
            </select>
          </label>
          <label className="selection-field">
            <span>学习状态</span>
            <select className="selection-select" value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value as StatusFilter)}>
              <option value="all">全部状态</option>
              <option value="new">未学</option>
              <option value="learning">学习中</option>
              <option value="mastered">已掌握</option>
              <option value="paused">已暂停</option>
              <option value="disabled">未启用</option>
            </select>
          </label>
          <label className="selection-checkbox">
            <input type="checkbox" checked={imageOnly} onChange={(event) => setImageOnly(event.target.checked)} />
            <span>只看有已审核图片的词</span>
          </label>
          <button className="secondary-button" type="button" onClick={resetFilters}>
            清空当前筛选
          </button>
        </aside>

        <section className="section-block selection-results">
          <div className="section-block__header">
            <h2>词卡区</h2>
            <p>先点详情理解词，再决定启用、暂停还是移出。</p>
          </div>
          <div className="selection-toolbar">
            <div className="selection-toolbar__group">
              <button
                className={`selection-toolbar__chip${viewMode === 'grid' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setViewMode('grid')}
              >
                卡片视图
              </button>
              <button
                className={`selection-toolbar__chip${viewMode === 'list' ? ' is-active' : ''}`}
                type="button"
                onClick={() => setViewMode('list')}
              >
                列表视图
              </button>
            </div>
            <label className="selection-toolbar__sort">
              <span>排序</span>
              <select className="selection-select" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                <option value="level">按 Level</option>
                <option value="difficulty">按难度</option>
                <option value="recent">按最近变更</option>
                <option value="alphabetical">按字母</option>
              </select>
            </label>
          </div>
          <div className="selection-bulk-actions">
            <button className="secondary-button" type="button" onClick={() => void savePatchedSelectionStates(filteredWords.map((word) => ({ wordId: word.id, isEnabled: true, isPaused: false })))}>
              启用当前筛选结果
            </button>
            <button className="secondary-button" type="button" onClick={() => void savePatchedSelectionStates(filteredWords.map((word) => ({ wordId: word.id, isEnabled: true, isPaused: true })))}>
              暂停当前筛选结果
            </button>
            <button className="secondary-button" type="button" onClick={() => void handleKeepOnlyFiltered()}>
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
              {filteredWords.map((word) => {
                const selectionState = selectionById[word.id] ?? createDefaultWordSelectionState(word.id);
                const learningBucket = getWordLearningBucket(word.id, recordsById[word.id], selectionState);
                const statusLabel = learningBucket === 'paused'
                  ? '已暂停'
                  : learningBucket === 'disabled'
                    ? '未启用'
                    : learningBucket === 'mastered'
                      ? '已掌握'
                      : learningBucket === 'learning'
                        ? '学习中'
                        : '未学';
                const statusTone = learningBucket === 'paused'
                  ? 'paused'
                  : learningBucket === 'disabled'
                    ? 'disabled'
                    : 'active';

                return (
                  <SelectionWordCard
                    key={word.id}
                    word={word}
                    statusLabel={statusLabel}
                    statusTone={statusTone}
                    updatedAtLabel={formatUpdatedAt(selectionState.updatedAt)}
                    isEnabled={selectionState.isEnabled}
                    isPaused={selectionState.isPaused}
                    onOpenDetails={() => setSelectedWordId(word.id)}
                    onToggleEnabled={() =>
                      void savePatchedSelectionStates([
                        {
                          wordId: word.id,
                          isEnabled: !selectionState.isEnabled,
                          isPaused: selectionState.isEnabled ? false : false,
                        },
                      ])
                    }
                    onTogglePaused={() =>
                      void savePatchedSelectionStates([
                        {
                          wordId: word.id,
                          isEnabled: true,
                          isPaused: !selectionState.isPaused,
                        },
                      ])
                    }
                  />
                );
              })}
            </div>
          ) : (
            <div className="selection-list">
              {filteredWords.map((word) => {
                const selectionState = selectionById[word.id] ?? createDefaultWordSelectionState(word.id);
                const learningBucket = getWordLearningBucket(word.id, recordsById[word.id], selectionState);
                const statusLabel = learningBucket === 'paused'
                  ? '已暂停'
                  : learningBucket === 'disabled'
                    ? '未启用'
                    : learningBucket === 'mastered'
                      ? '已掌握'
                      : learningBucket === 'learning'
                        ? '学习中'
                        : '未学';
                const statusTone = learningBucket === 'paused'
                  ? 'paused'
                  : learningBucket === 'disabled'
                    ? 'disabled'
                    : 'active';

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
                      void savePatchedSelectionStates([
                        {
                          wordId: word.id,
                          isEnabled: !selectionState.isEnabled,
                          isPaused: selectionState.isEnabled ? false : false,
                        },
                      ])
                    }
                    onTogglePaused={() =>
                      void savePatchedSelectionStates([
                        {
                          wordId: word.id,
                          isEnabled: true,
                          isPaused: !selectionState.isPaused,
                        },
                      ])
                    }
                  />
                );
              })}
            </div>
          )}
        </section>

        <aside className="section-block selection-summary">
          <div className="section-block__header">
            <h2>当前学习计划摘要</h2>
            <p>右侧只显示当前选择带来的真实后果。</p>
          </div>
          <div className="selection-summary__cards">
            <article>
              <span>已启用</span>
              <strong>{enabledCount}</strong>
            </article>
            <article>
              <span>已暂停</span>
              <strong>{pausedCount}</strong>
            </article>
            <article>
              <span>明天到期</span>
              <strong>{reviewLoad.dueTomorrowCount}</strong>
            </article>
            <article>
              <span>未来 3 天</span>
              <strong>{reviewLoad.dueInThreeDaysCount}</strong>
            </article>
          </div>
          <article className="selection-summary__risk">
            <span>压力标签</span>
            <strong>{reviewLoad.riskLevel}</strong>
            <p>
              {reviewLoad.riskLevel === '过高'
                ? '未来 3 天复习压力明显偏高，建议暂停一部分主题或降低新词量。'
                : reviewLoad.riskLevel === '偏高'
                  ? '未来 3 天压力已经开始接近上限，建议先不要继续扩大启用范围。'
                  : '当前启用范围还在舒适区，可以继续微调。'}
            </p>
          </article>
          <div className="selection-summary__breakdown">
            <h3>分类占比</h3>
            {categoryBreakdown.length > 0 ? (
              <ul>
                {categoryBreakdown.map(([category, count]) => (
                  <li key={category}>
                    <span>{category}</span>
                    <strong>{count}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p>当前没有启用词。</p>
            )}
          </div>
        </aside>
      </section>

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

      <nav className="home-dock" aria-label="主页面导航">
        <button className="home-dock__button" type="button" onClick={onBackHome}>
          复习
        </button>
        <button className="home-dock__button is-active" type="button">
          选词
        </button>
        <button className="home-dock__button" type="button" onClick={onOpenStats}>
          统计
        </button>
        <button className="home-dock__button" type="button" onClick={onOpenSettings}>
          设置
        </button>
      </nav>
    </main>
  );
}