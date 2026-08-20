import { createPortal } from 'react-dom';
import { ListOrdered, X } from 'lucide-react';
import type { AnswerEvent } from '../models/answer-event';
import type { LearningRecord } from '../models/learning-record';
import type { WordRecord } from '../models/word';
import { buildTodayUnfamiliarNewWords } from '../services/today-answer-statistics';
import { buildTodayWrongWords } from '../services/today-wrong-words';
import { getStudyChinese, getStudyText } from '../services/word-service';
import { DifficultyStars } from './DifficultyStars';
import { MasteryLevelIcon } from './MasteryLevelIcon';
import { WordImage } from './WordImage';

interface WrongWordQueueDrawerProps {
  isOpen: boolean;
  words: WordRecord[];
  recordsById: Record<string, LearningRecord>;
  answerEvents: AnswerEvent[];
  dateKey: string;
  onClose: () => void;
  onOpenWord?: (wordId: string) => void;
}

export function WrongWordQueueDrawer({
  isOpen,
  words,
  recordsById,
  answerEvents,
  dateKey,
  onClose,
  onOpenWord,
}: WrongWordQueueDrawerProps) {
  if (!isOpen) return null;

  const wordsById = new Map(words.map((word) => [word.id, word]));
  const wrongWords = buildTodayWrongWords(answerEvents, dateKey)
    .filter((entry) => wordsById.has(entry.wordId));
  const unfamiliarNewWords = buildTodayUnfamiliarNewWords(answerEvents, dateKey)
    .filter((entry) => wordsById.has(entry.wordId));
  const portalHost = document.querySelector('.ipad-stage-shell');

  return createPortal(
    <div className="new-word-queue-backdrop" onClick={onClose}>
      <aside className="new-word-queue" aria-label="今日错词队列" onClick={(event) => event.stopPropagation()}>
        <header className="new-word-queue__header">
          <div>
            <span><ListOrdered size={18} aria-hidden="true" /> 今日答题</span>
            <h2>今日错词队列</h2>
          </div>
          <button type="button" aria-label="关闭今日错词队列" onClick={onClose}><X aria-hidden="true" /></button>
        </header>

        <section className="new-word-queue__section">
          <div className="new-word-queue__section-heading">
            <div>
              <h3>按答错频率排序</h3>
              <p>答错次数多的排在前面，点击单词可以查看详情。</p>
            </div>
            <strong>{wrongWords.length} 个</strong>
          </div>
          {wrongWords.length > 0 ? (
            <ol className="new-word-queue__list new-word-queue__list--wrong">
              {wrongWords.map((entry, index) => {
                const word = wordsById.get(entry.wordId);
                if (!word) return null;
                return (
                  <li key={entry.wordId}>
                    <span className="new-word-queue__index">{index + 1}</span>
                    <button
                      className="new-word-queue__word new-word-queue__word--button"
                      type="button"
                      aria-label={`查看错词 ${getStudyText(word)}，今日答错 ${entry.wrongCount} 次`}
                      onClick={() => onOpenWord?.(entry.wordId)}
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
                    <strong className="new-word-queue__wrong-count">错 {entry.wrongCount} 次</strong>
                  </li>
                );
              })}
            </ol>
          ) : <p className="new-word-queue__empty">今天还没有答错的单词，继续保持。</p>}
        </section>

        <section className="new-word-queue__section">
          <div className="new-word-queue__section-heading">
            <div>
              <h3>今日不熟悉的新词</h3>
              <p>Lv0 选择“不认识”的新词，按标记次数从高到低排列。</p>
            </div>
            <strong>{unfamiliarNewWords.length} 个</strong>
          </div>
          {unfamiliarNewWords.length > 0 ? (
            <ol className="new-word-queue__list new-word-queue__list--unfamiliar">
              {unfamiliarNewWords.map((entry, index) => {
                const word = wordsById.get(entry.wordId);
                if (!word) return null;
                return (
                  <li key={entry.wordId}>
                    <span className="new-word-queue__index">{index + 1}</span>
                    <button
                      className="new-word-queue__word new-word-queue__word--button"
                      type="button"
                      aria-label={`查看不熟悉的新词 ${getStudyText(word)}，今日标记 ${entry.unfamiliarCount} 次`}
                      onClick={() => onOpenWord?.(entry.wordId)}
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
                    <strong className="new-word-queue__unfamiliar-count">
                      不熟悉 {entry.unfamiliarCount} 次
                    </strong>
                  </li>
                );
              })}
            </ol>
          ) : <p className="new-word-queue__empty">今天还没有标记不熟悉的新词。</p>}
        </section>
      </aside>
    </div>,
    portalHost ?? document.body,
  );
}
