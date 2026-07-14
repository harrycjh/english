import type { AnswerEvent } from '../models/answer-event';
import type { LearningRecord } from '../models/learning-record';
import type { LocalLifePhotoView } from '../models/local-media';
import type { ParentSetting } from '../models/parent-setting';
import type { WordSelectionState } from '../models/word-selection-state';
import type { WordRecord } from '../models/word';
import { speakWord } from '../services/audio-service';
import { AudioIconButton } from './AudioIconButton';
import { WordImage } from './WordImage';
import { getExampleSentences } from '../services/example-service';
import { getWordAnswerStats } from '../services/answer-event-service';
import { getWordAtlasStyle } from '../services/word-atlas-service';
import { getAssetUrl, getStudyText, getWordImageUrl } from '../services/word-service';

export type WordDetailDrawerContext = 'review' | 'selection';

interface WordDetailDrawerProps {
  isOpen: boolean;
  word: WordRecord | null;
  record: LearningRecord | undefined;
  selectionState: WordSelectionState | undefined;
  answerEvents?: AnswerEvent[];
  setting: ParentSetting;
  localLifePhoto?: LocalLifePhotoView;
  context: WordDetailDrawerContext;
  onClose: () => void;
  onToggleEnabled?: () => void;
  onTogglePaused?: () => void;
}

function formatDateTime(dateText: string | null): string {
  if (!dateText) {
    return '暂无';
  }

  return new Date(dateText).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getSelectionLabel(selectionState: WordSelectionState | undefined): string {
  if (!selectionState || (selectionState.isEnabled && !selectionState.isPaused)) {
    return '当前已启用';
  }

  if (selectionState.isPaused) {
    return '当前已暂停';
  }

  return '当前未启用';
}

function getLearningLabel(record: LearningRecord | undefined): string {
  if (!record) {
    return '尚未开始';
  }

  if (record.masteryLevel >= 4) {
    return '已掌握';
  }

  return '学习中';
}

function getQuestionKindLabel(questionKind: AnswerEvent['questionKind']): string {
  if (questionKind === 'image-choice') return '图片选择';
  if (questionKind === 'text-choice') return '文字选择';
  if (questionKind === 'fill-blank') return '拼写填空';
  return questionKind;
}

function getLifePhotoMatchLabel(match: 'primary' | 'secondary'): string {
  return match === 'primary' ? '主匹配' : '辅助匹配';
}

export function WordDetailDrawer({
  isOpen,
  word,
  record,
  selectionState,
  answerEvents = [],
  setting,
  localLifePhoto,
  context,
  onClose,
  onToggleEnabled,
  onTogglePaused,
}: WordDetailDrawerProps) {
  if (!isOpen || !word) {
    return null;
  }

  const exampleSentences = getExampleSentences(word);
  const answerStats = getWordAnswerStats(answerEvents, word.id);
  const isEnabled = selectionState ? selectionState.isEnabled : true;
  const isPaused = selectionState?.isPaused ?? false;
  const relatedMedia = word.relatedMedia;
  const lifePhoto = localLifePhoto
    ? {
        src: localLifePhoto.objectUrl,
        caption: localLifePhoto.caption,
        match: localLifePhoto.match,
        confidence: localLifePhoto.confidence,
      }
    : relatedMedia?.lifePhoto
      ? {
          src: getAssetUrl(relatedMedia.lifePhoto.imagePath),
          caption: relatedMedia.lifePhoto.caption,
          match: relatedMedia.lifePhoto.match,
          confidence: relatedMedia.lifePhoto.confidence,
        }
      : null;
  const hasRelatedMedia = Boolean(
    (context === 'review' && relatedMedia?.oxford) || relatedMedia?.redRocket || lifePhoto,
  );
  const primaryMedia = (
    <div className="word-detail-drawer__primary-media">
      {word.imageApproved ? (
        <WordImage className="word-detail-drawer__image" word={word} alt={word.chinese} />
      ) : (
        <div className="word-detail-drawer__placeholder">
          <strong>{getStudyText(word)}</strong>
          <p>本地图片暂未接入</p>
        </div>
      )}
    </div>
  );
  const wordSummary = (
    <div className="word-detail-drawer__summary">
      <h2>{getStudyText(word)}</h2>
      <p className="word-detail-drawer__meaning">{word.chinese}</p>
      <p className="word-detail-drawer__part-of-speech">{word.partOfSpeech}</p>
      <div className="word-detail-drawer__meta-strip">
        <span className="word-detail-chip">{word.category}</span>
        <span className="word-detail-chip">Lv.{word.difficulty}</span>
        <span className="word-detail-chip">{getLearningLabel(record)}</span>
        <span className="word-detail-chip">{getSelectionLabel(selectionState)}</span>
      </div>
      {context === 'selection' ? (
        <div className="word-detail-drawer__inline-examples">
          <h3>例句</h3>
          <ul className="word-detail-drawer__list">
            {exampleSentences.map((example) => (
              <li key={example}>{example}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="word-detail-drawer-backdrop is-open" onClick={onClose}>
      <aside
        className={`word-detail-drawer${context === 'selection' ? ' word-detail-drawer--selection' : ''}`}
        aria-label="单词详情抽屉"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="word-detail-drawer__header">
          <span className="word-detail-drawer__eyebrow">{context === 'review' ? '复习页详情' : '选词页详情'}</span>
          <div className="word-detail-drawer__header-actions">
            {setting.enableAudio ? <AudioIconButton onClick={() => speakWord(word)} className="word-detail-drawer__audio" /> : null}
            <button className="word-detail-drawer__close" type="button" onClick={onClose}>
              关闭
            </button>
          </div>
        </header>

        {context === 'selection' ? (
          <section
            className={`word-detail-drawer__selection-overview${relatedMedia?.oxford ? '' : ' word-detail-drawer__selection-overview--without-oxford'}`}
          >
            {primaryMedia}
            {wordSummary}
            {relatedMedia?.oxford ? (
              <article className="word-detail-drawer__related-card word-detail-drawer__selection-oxford">
                <img
                  src={getAssetUrl(relatedMedia.oxford.imagePath)}
                  alt={`${getStudyText(word)} 的牛津树关联页`}
                />
                <div>
                  <strong>牛津树图</strong>
                  <span>{relatedMedia.oxford.label}</span>
                </div>
              </article>
            ) : null}
          </section>
        ) : (
          <section className="word-detail-drawer__hero">
            {primaryMedia}
            {wordSummary}
          </section>
        )}

        {hasRelatedMedia ? (
          <section className="word-detail-drawer__panel">
            <h3>关联图片</h3>
            <div className="word-detail-drawer__related-grid">
              {context === 'review' && relatedMedia?.oxford ? (
                <article className="word-detail-drawer__related-card">
                  <img
                    src={getAssetUrl(relatedMedia.oxford.imagePath)}
                    alt={`${getStudyText(word)} 的牛津树关联页`}
                  />
                  <div>
                    <strong>牛津树图</strong>
                    <span>{relatedMedia.oxford.label}</span>
                  </div>
                </article>
              ) : null}

              {relatedMedia?.redRocket ? (
                <article className="word-detail-drawer__related-card">
                  <span
                    className="word-detail-drawer__red-rocket-image word-image--atlas"
                    role="img"
                    aria-label={`${getStudyText(word)} 的红火箭关联页`}
                    style={{
                      ...getWordAtlasStyle(relatedMedia.redRocket, { columns: 3, rows: 3, cellSize: 512 }),
                      backgroundImage: `url(${getWordImageUrl(relatedMedia.redRocket.atlasPath)})`,
                    }}
                  />
                  <div>
                    <strong>红火箭图</strong>
                    <span>{relatedMedia.redRocket.label}</span>
                  </div>
                </article>
              ) : null}

              {lifePhoto ? (
                <article className="word-detail-drawer__related-card">
                  <img
                    src={lifePhoto.src}
                    alt={`${getStudyText(word)} 的生活照片`}
                  />
                  <div>
                    <strong>生活照片</strong>
                    <span>
                      {getLifePhotoMatchLabel(lifePhoto.match)} · 置信度{' '}
                      {Math.round(lifePhoto.confidence * 100)}%
                    </span>
                    <p>{lifePhoto.caption}</p>
                  </div>
                </article>
              ) : null}
            </div>
          </section>
        ) : null}

        {context === 'review' ? (
          <section className="word-detail-drawer__panel">
            <h3>例句</h3>
            <ul className="word-detail-drawer__list">
              {exampleSentences.map((example) => (
                <li key={example}>{example}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="word-detail-drawer__panel">
          <h3>学习状态</h3>
          <div className="word-detail-drawer__stats">
            <article>
              <span>掌握等级</span>
              <strong>{record?.masteryLevel ?? 0}</strong>
            </article>
            <article>
              <span>复习阶段</span>
              <strong>{record?.reviewStage ?? 0}</strong>
            </article>
            <article>
              <span>错误次数</span>
              <strong>{record?.wrongCount ?? 0}</strong>
            </article>
            <article>
              <span>下次复习</span>
              <strong>{formatDateTime(record?.nextDueAt ?? null)}</strong>
            </article>
          </div>
        </section>

        <section className="word-detail-drawer__panel">
          <h3>答题记录</h3>
          <div className="word-detail-drawer__stats">
            <article>
              <span>累计作答</span>
              <strong>{answerStats.totalCount}</strong>
            </article>
            <article>
              <span>正确率</span>
              <strong>{answerStats.totalCount > 0 ? `${answerStats.accuracy}%` : '--'}</strong>
            </article>
            <article>
              <span>答错次数</span>
              <strong>{answerStats.wrongCount}</strong>
            </article>
            <article>
              <span>答对次数</span>
              <strong>{answerStats.correctCount}</strong>
            </article>
          </div>
          {answerStats.recentEvents.length > 0 ? (
            <ul className="word-detail-drawer__answer-list">
              {answerStats.recentEvents.map((event) => (
                <li key={event.id} className={event.isCorrect ? 'is-correct' : 'is-wrong'}>
                  <span>{event.isCorrect ? '正确' : '错误'}</span>
                  <strong>{getQuestionKindLabel(event.questionKind)}</strong>
                  <small>
                    {formatDateTime(event.answeredAt)} · 选 {event.selectedAnswer || '空'} · 答 {event.correctAnswer}
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p>暂无逐题记录。</p>
          )}
        </section>

        {onToggleEnabled ? (
          <section className="word-detail-drawer__panel">
            <h3>操作</h3>
            <div className="word-detail-drawer__actions">
              <button className="primary-button" type="button" onClick={onToggleEnabled}>
                {isEnabled ? '移出当前计划' : '加入当前计划'}
              </button>
              {onTogglePaused && isEnabled ? (
                <button className="secondary-button" type="button" onClick={onTogglePaused}>
                  {isPaused ? '恢复学习' : '暂停该词'}
                </button>
              ) : null}
            </div>
          </section>
        ) : null}
      </aside>
    </div>
  );
}
