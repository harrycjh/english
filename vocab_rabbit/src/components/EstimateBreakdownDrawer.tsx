import { createPortal } from 'react-dom';
import { Timer, X } from 'lucide-react';
import type { AnswerEvent } from '../models/answer-event';
import { MasteryLevelIcon } from './MasteryLevelIcon';
import {
  LEVEL_DURATION_RECENT_DAYS,
  estimateSessionDuration,
  formatStudyDuration,
} from '../services/study-duration';

interface EstimateBreakdownDrawerProps {
  isOpen: boolean;
  /** Mastery level of every word still to be studied today. */
  wordLevels: number[];
  answerEvents: AnswerEvent[];
  onClose: () => void;
}

/** Seconds with one decimal, e.g. `31.8 秒` — minutes are too coarse here. */
function formatPace(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)} 秒`;
}

export function EstimateBreakdownDrawer({
  isOpen,
  wordLevels,
  answerEvents,
  onClose,
}: EstimateBreakdownDrawerProps) {
  if (!isOpen) return null;

  const estimate = estimateSessionDuration(wordLevels, answerEvents);
  const byLevel = estimate.byLevel;
  const measuredLevels = [...byLevel.values()].filter((entry) => entry.isMeasured);
  const measuredWords = measuredLevels.reduce((total, entry) => total + entry.words, 0);

  const drawer = (
    <div className="new-word-queue-backdrop" onClick={onClose}>
      <aside
        className="new-word-queue"
        aria-label="预计时长的算法"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="new-word-queue__header">
          <div>
            <span><Timer size={18} aria-hidden="true" /> 时间预估</span>
            <h2>预计时长是怎么算的</h2>
          </div>
          <button type="button" aria-label="关闭预计时长说明" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <section className="new-word-queue__section">
          <div className="new-word-queue__section-heading">
            <div>
              <h3>今天还剩的词</h3>
              <p>把每个等级的词数乘上这个等级的单词用时。</p>
            </div>
            <strong className="estimate-breakdown__headline">
              {formatStudyDuration(estimate.totalDurationMs)}
            </strong>
          </div>
          {estimate.rows.length > 0 ? (
            <ul className="estimate-breakdown__list">
              {estimate.rows.map((row) => (
                <li key={row.level}>
                  <MasteryLevelIcon level={row.level} />
                  <span className="estimate-breakdown__formula">
                    {row.words} 个 × {formatPace(row.wordDurationMs)}
                    {row.isMeasured ? '' : '（无近期记录，按整体速度）'}
                  </span>
                  <strong>{formatStudyDuration(row.durationMs)}</strong>
                </li>
              ))}
              {estimate.rows.length > 1 ? (
                <li className="estimate-breakdown__total">
                  <span className="estimate-breakdown__formula">
                    合计 {estimate.rows.reduce((total, row) => total + row.words, 0)} 个词
                  </span>
                  <strong>{formatStudyDuration(estimate.totalDurationMs)}</strong>
                </li>
              ) : null}
            </ul>
          ) : <p className="new-word-queue__empty">今天的词已经全部答完了。</p>}
        </section>

        <section className="new-word-queue__section">
          <div className="new-word-queue__section-heading">
            <div>
              <h3>各等级的单词用时</h3>
              <p>最近 {LEVEL_DURATION_RECENT_DAYS} 天里，这个等级的一个词平均花掉多久。</p>
            </div>
            <strong>{formatPace(estimate.overallWordDurationMs)}<small> / 词</small></strong>
          </div>
          <ul className="estimate-breakdown__list estimate-breakdown__list--levels">
            {[...byLevel.values()].map((entry) => (
              <li key={entry.level} className={entry.isMeasured ? '' : 'is-unmeasured'}>
                <MasteryLevelIcon level={entry.level} />
                <span className="estimate-breakdown__formula">
                  {entry.isMeasured ? `${entry.words} 个词` : '最近没练到'}
                </span>
                <strong>{formatPace(entry.durationMs)}</strong>
              </li>
            ))}
          </ul>
        </section>

        <section className="new-word-queue__section">
          <div className="new-word-queue__section-heading">
            <div>
              <h3>这些数字从哪来</h3>
              <p>
                一个词的用时是从上一次作答到这一次的间隔，答错重做的那几遍也算在同一个词上。
                {measuredWords > 0
                  ? `最近 ${LEVEL_DURATION_RECENT_DAYS} 天一共有 ${measuredWords} 个词可以计时；`
                  : '最近还没有可以计时的记录；'}
                练得少的等级会往整体速度上靠，避免一两个词就定了一个等级的价。
              </p>
            </div>
          </div>
        </section>
      </aside>
    </div>
  );

  if (typeof document === 'undefined') return drawer;
  const portalHost = document.querySelector('.ipad-stage-shell');
  return createPortal(drawer, portalHost ?? document.body);
}
