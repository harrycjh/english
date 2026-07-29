import type { LetterChoiceQuestion } from '../services/question-service';
import { getWordAtlasStyle } from '../services/word-atlas-service';
import { getAssetUrl, getStudyChinese, getWordImageUrl } from '../services/word-service';
import { getExamplePairForLevel } from '../services/example-service';
import { speakWord } from '../services/audio-service';
import { AudioIconButton } from './AudioIconButton';
import { QuestionExampleResult } from './QuestionExampleResult';
import { LearningLevelControl } from './LearningLevelControl';

interface QuestionLetterChoiceProps {
  question: LetterChoiceQuestion;
  disabled: boolean;
  enableAudio: boolean;
  questionLevel: number;
  upgradeToLevel?: number | null;
  selectedAnswer: string | null;
  relatedResultPhase?: 'idle' | 'fading-out' | 'revealed';
  onContinue?: () => void;
  onSubmit: (answer: string) => void;
}

export function QuestionLetterChoice({
  question,
  disabled,
  enableAudio,
  questionLevel,
  upgradeToLevel,
  selectedAnswer,
  relatedResultPhase = 'idle',
  onContinue,
  onSubmit,
}: QuestionLetterChoiceProps) {
  const answeredCorrectly = disabled && selectedAnswer === question.correctAnswer;
  const redRocket = question.word.relatedMedia?.redRocket;
  const example = getExamplePairForLevel(question.word, questionLevel);
  const showRedRocketResult = (
    questionLevel === 6
    && answeredCorrectly
    && relatedResultPhase === 'revealed'
    && Boolean(redRocket?.sentence)
  );
  let missingLetterIndex = 0;
  const displayedWord = question.maskedCharacters
    .map((character) => {
      if (character !== '_') return character;
      const missingLetter = question.correctAnswer[missingLetterIndex] ?? '_';
      missingLetterIndex += 1;
      return answeredCorrectly ? missingLetter : '_';
    })
    .join('');

  return (
    <section className="question-panel question-panel--letter-choice">
      <div className="letter-choice-word-card">
        <LearningLevelControl level={questionLevel} upgradeTo={upgradeToLevel} />
        <span className="question-word__label">字母选择</span>
        <strong
          className={answeredCorrectly ? 'is-complete' : undefined}
          aria-label={answeredCorrectly ? '完整单词' : '缺失字母单词'}
        >
          {displayedWord}
        </strong>
        {question.word.phonetic ? (
          <div className={`question-phonetic-row letter-choice-word-card__phonetic${answeredCorrectly ? '' : ' is-placeholder'}`}>
            {answeredCorrectly ? (
              <>
                <span className="question-word__phonetic">{question.word.phonetic}</span>
                {enableAudio ? <AudioIconButton onClick={() => speakWord(question.word)} /> : null}
              </>
            ) : null}
          </div>
        ) : null}
        <p>{getStudyChinese(question.word)}</p>
      </div>
      {showRedRocketResult && redRocket ? (
        <figure className="question-related-page-result question-red-rocket-result" aria-label="红火箭对应页面">
          {redRocket.imagePath ? (
            <img src={getAssetUrl(redRocket.imagePath)} alt={redRocket.label} />
          ) : (
            <span
              className="question-related-page-result__atlas word-image--atlas"
              role="img"
              aria-label={redRocket.label}
              style={{
                ...getWordAtlasStyle(redRocket, { columns: 3, rows: 3, cellSize: 512 }),
                backgroundImage: `url(${getWordImageUrl(redRocket.atlasPath)})`,
              }}
            />
          )}
          <figcaption>
            <span>{redRocket.label}</span>
            <p>{redRocket.sentence}</p>
            {redRocket.sentenceTranslation ? (
              <p className="question-related-page-result__translation">
                {redRocket.sentenceTranslation}
              </p>
            ) : null}
            <button
              className="primary-button question-related-page-result__continue"
              type="button"
              onClick={onContinue}
            >
              继续
            </button>
          </figcaption>
        </figure>
      ) : (
        <div className={`letter-choice-answer-column${relatedResultPhase === 'fading-out' ? ' is-fading-out' : ''}`}>
          <QuestionExampleResult
            sentence={example?.sentence}
            translation={example?.translation}
            visible={answeredCorrectly && Boolean(example?.sentence)}
          />
          <div className="option-grid letter-choice-grid">
            {question.options.map((option) => {
              const selected = selectedAnswer === option;
              const correct = option === question.correctAnswer;
              return (
                <button
                  key={option}
                  type="button"
                  className={`choice-button${selected ? ' is-selected' : ''}${disabled && correct ? ' is-correct' : ''}${disabled && selected && !correct ? ' is-wrong' : ''}`}
                  disabled={disabled}
                  onClick={() => onSubmit(option)}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
