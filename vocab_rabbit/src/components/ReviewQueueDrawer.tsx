import { createPortal } from 'react-dom';
import { ListOrdered, X } from 'lucide-react';
import type { DailyTaskSummary } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import type { WordRecord } from '../models/word';
import { DifficultyStars } from './DifficultyStars';
import { MasteryLevelIcon } from './MasteryLevelIcon';
import { WordImage } from './WordImage';
import { getStudyChinese, getStudyText } from '../services/word-service';

interface ReviewQueueDrawerProps {
  isOpen: boolean;
  words: WordRecord[];
  recordsById: Record<string, LearningRecord>;
  task: DailyTaskSummary;
  onClose: () => void;
  onOpenWord?: (wordId: string) => void;
}

export function ReviewQueueDrawer({ isOpen, words, recordsById, task, onClose, onOpenWord }: ReviewQueueDrawerProps) {
  if (!isOpen) return null;

  const wordsById = new Map(words.map((word) => [word.id, word]));
  const answeredWordIds = new Set(task.answeredWordIds);
  const pendingWordIds = task.reviewWordIds.filter((wordId) => !answeredWordIds.has(wordId));
  const completedCount = task.reviewWordIds.length - pendingWordIds.length;

  const portalHost = document.querySelector('.ipad-stage-shell');
  return createPortal(
    <div className="new-word-queue-backdrop" onClick={onClose}>
      <aside className="new-word-queue" aria-label="今日复习队列" onClick={(event) => event.stopPropagation()}>
        <header className="new-word-queue__header">
          <div>
            <span><ListOrdered size={18} aria-hidden="true" /> 复习安排</span>
            <h2>今日复习队列</h2>
          </div>
          <button type="button" aria-label="关闭今日复习队列" onClick={onClose}><X aria-hidden="true" /></button>
        </header>

        <section className="new-word-queue__section">
          <div className="new-word-queue__section-heading">
            <div>
              <h3>今日尚未复习</h3>
              <p>按当前计划顺序完成，答对后会从这里移除。</p>
            </div>
            <strong>{pendingWordIds.length} 个</strong>
          </div>
          {pendingWordIds.length > 0 ? (
            <ol className="new-word-queue__list new-word-queue__list--today">
              {pendingWordIds.map((wordId, index) => {
                const word = wordsById.get(wordId);
                if (!word) return null;
                return (
                  <li key={wordId}>
                    <span className="new-word-queue__index">{index + 1}</span>
                    <button
                      className="new-word-queue__word new-word-queue__word--button"
                      type="button"
                      aria-label={`查看单词 ${getStudyText(word)}`}
                      onClick={() => onOpenWord?.(wordId)}
                    >
                      <div className="new-word-queue__thumb">
                        <WordImage word={word} alt={getStudyChinese(word)} />
                      </div>
                      <div className="new-word-queue__copy">
                        <strong lang="en">{getStudyText(word)}</strong>
                        <span>{getStudyChinese(word)}</span>
                      </div>
                      <div className="new-word-queue__progress">
                        <MasteryLevelIcon level={recordsById[word.id]?.masteryLevel ?? 0} />
                        <DifficultyStars difficulty={word.difficulty} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : <p className="new-word-queue__empty">今天的复习词已经全部完成。</p>}
        </section>

        <section className="new-word-queue__section">
          <div className="new-word-queue__section-heading">
            <div>
              <h3>完成情况</h3>
              <p>今日计划 {task.reviewWordIds.length} 个，已经完成 {completedCount} 个。</p>
            </div>
          </div>
        </section>
      </aside>
    </div>,
    portalHost ?? document.body,
  );
}
