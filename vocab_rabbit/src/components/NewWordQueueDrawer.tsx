import { createPortal } from 'react-dom';
import { ChevronDown, ChevronUp, ListOrdered, Plus, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DailyTaskSummary } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import type { WordSelectionState } from '../models/word-selection-state';
import type { WordRecord } from '../models/word';
import { isWordEnabledForStudy } from '../services/selection-service';
import { getStudyChinese, getStudyText } from '../services/word-service';
import { DifficultyStars } from './DifficultyStars';
import { WordImage } from './WordImage';

interface NewWordQueueDrawerProps {
  isOpen: boolean;
  words: WordRecord[];
  recordsById: Record<string, LearningRecord>;
  selectionById: Record<string, WordSelectionState>;
  task: DailyTaskSummary;
  queue: string[];
  onClose: () => void;
  onChangeQueue: (wordIds: string[]) => Promise<void>;
  onRemoveTodayWord: (wordId: string) => Promise<void>;
  onOpenWord?: (wordId: string) => void;
}

function QueueWord({ word, onOpen }: { word: WordRecord; onOpen?: () => void }) {
  const content = (
    <>
      <div className="new-word-queue__thumb">
        <WordImage word={word} alt={getStudyChinese(word)} />
      </div>
      <div className="new-word-queue__copy">
        <strong lang="en">{getStudyText(word)}</strong>
        <span>{getStudyChinese(word)}</span>
      </div>
      <DifficultyStars difficulty={word.difficulty} />
    </>
  );

  return onOpen ? (
    <button
      className="new-word-queue__word new-word-queue__word--button"
      type="button"
      aria-label={`查看单词 ${getStudyText(word)}`}
      onClick={onOpen}
    >
      {content}
    </button>
  ) : (
    <div className="new-word-queue__word">{content}</div>
  );
}

export function NewWordQueueDrawer({
  isOpen,
  words,
  recordsById,
  selectionById,
  task,
  queue,
  onClose,
  onChangeQueue,
  onRemoveTodayWord,
  onOpenWord,
}: NewWordQueueDrawerProps) {
  const [searchText, setSearchText] = useState('');
  const wordsById = useMemo(() => new Map(words.map((word) => [word.id, word])), [words]);
  const activeQueue = useMemo(() => queue.filter((wordId) => (
    wordsById.has(wordId)
    && !recordsById[wordId]
    && isWordEnabledForStudy(wordId, selectionById)
  )), [queue, recordsById, selectionById, wordsById]);
  const todayWordIds = task.newWordIds.filter((wordId) => !task.answeredWordIds.includes(wordId));
  const todayWordIdSet = new Set(todayWordIds);
  const queueWordIdSet = new Set(activeQueue);
  const taskStarted = task.totalAnswered > 0;
  const normalizedSearch = searchText.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!normalizedSearch) return [];
    return words
      .filter((word) => (
        !recordsById[word.id]
        && isWordEnabledForStudy(word.id, selectionById)
        && !queueWordIdSet.has(word.id)
        && !todayWordIdSet.has(word.id)
        && (
          getStudyText(word).toLowerCase().includes(normalizedSearch)
          || getStudyChinese(word).includes(searchText.trim())
        )
      ))
      .sort((left, right) => left.difficulty - right.difficulty || left.english.localeCompare(right.english))
      .slice(0, 8);
  }, [normalizedSearch, queueWordIdSet, recordsById, searchText, selectionById, todayWordIdSet, words]);

  if (!isOpen) return null;

  function moveQueueWord(wordId: string, offset: -1 | 1) {
    const currentIndex = activeQueue.indexOf(wordId);
    const nextIndex = currentIndex + offset;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= activeQueue.length) return;
    const nextQueue = [...activeQueue];
    [nextQueue[currentIndex], nextQueue[nextIndex]] = [nextQueue[nextIndex], nextQueue[currentIndex]];
    void onChangeQueue(nextQueue);
  }

  const portalHost = document.querySelector('.ipad-stage-shell');
  return createPortal(
    <div className="new-word-queue-backdrop" onClick={onClose}>
      <aside className="new-word-queue" aria-label="新词学习队列" onClick={(event) => event.stopPropagation()}>
        <header className="new-word-queue__header">
          <div>
            <span><ListOrdered size={18} aria-hidden="true" /> 学习安排</span>
            <h2>新词队列</h2>
          </div>
          <button type="button" aria-label="关闭新词队列" onClick={onClose}><X aria-hidden="true" /></button>
        </header>

        <section className="new-word-queue__section">
          <div className="new-word-queue__section-heading">
            <div>
              <h3>今日尚未学习</h3>
              <p>{taskStarted ? '今日任务已经开始，当前单词已锁定。' : '移除后会立即自动补入另一个新词。'}</p>
            </div>
            <strong>{todayWordIds.length} 个</strong>
          </div>
          {todayWordIds.length > 0 ? (
            <ol className="new-word-queue__list new-word-queue__list--today">
              {todayWordIds.map((wordId, index) => {
                const word = wordsById.get(wordId);
                if (!word) return null;
                return (
                  <li key={wordId}>
                    <span className="new-word-queue__index">{index + 1}</span>
                    <QueueWord word={word} onOpen={() => onOpenWord?.(wordId)} />
                    <button
                      className="new-word-queue__remove"
                      type="button"
                      disabled={taskStarted}
                      aria-label={`移除今日单词 ${getStudyText(word)}`}
                      onClick={() => void onRemoveTodayWord(wordId)}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : <p className="new-word-queue__empty">今日没有尚未学习的新词。</p>}
        </section>

        <section className="new-word-queue__section new-word-queue__section--manual">
          <div className="new-word-queue__section-heading">
            <div>
              <h3>手动队列</h3>
              <p>每天优先从上往下选取，不足部分自动生成。</p>
            </div>
            <strong>{activeQueue.length} 个</strong>
          </div>
          {activeQueue.length > 0 ? (
            <ol className="new-word-queue__list">
              {activeQueue.map((wordId, index) => {
                const word = wordsById.get(wordId);
                if (!word) return null;
                return (
                  <li key={wordId}>
                    <span className="new-word-queue__index">{index + 1}</span>
                    <QueueWord word={word} onOpen={() => onOpenWord?.(wordId)} />
                    {todayWordIdSet.has(wordId) ? <span className="new-word-queue__today-tag">今日</span> : null}
                    <div className="new-word-queue__controls">
                      <button type="button" disabled={index === 0} aria-label={`上移 ${getStudyText(word)}`} onClick={() => moveQueueWord(wordId, -1)}>
                        <ChevronUp aria-hidden="true" />
                      </button>
                      <button type="button" disabled={index === activeQueue.length - 1} aria-label={`下移 ${getStudyText(word)}`} onClick={() => moveQueueWord(wordId, 1)}>
                        <ChevronDown aria-hidden="true" />
                      </button>
                      <button type="button" aria-label={`从队列删除 ${getStudyText(word)}`} onClick={() => void onChangeQueue(activeQueue.filter((id) => id !== wordId))}>
                        <Trash2 aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : <p className="new-word-queue__empty">队列为空时，系统会按星级均衡规则自动选择。</p>}
        </section>

        <section className="new-word-queue__search">
          <label>
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              value={searchText}
              placeholder="输入英文或中文添加单词"
              onChange={(event) => setSearchText(event.target.value)}
            />
          </label>
          {normalizedSearch ? (
            <div className="new-word-queue__results">
              {searchResults.length > 0 ? searchResults.map((word) => (
                <button key={word.id} type="button" onClick={() => void onChangeQueue([...activeQueue, word.id])}>
                  <QueueWord word={word} />
                  <span className="new-word-queue__add"><Plus aria-hidden="true" />加入</span>
                </button>
              )) : <p className="new-word-queue__empty">没有可加入的新词。</p>}
            </div>
          ) : null}
        </section>
      </aside>
    </div>,
    portalHost ?? document.body,
  );
}
