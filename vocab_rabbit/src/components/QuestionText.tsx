import type { ChoiceQuestion } from '../services/question-service';
import { speakWord } from '../services/audio-service';
import { getExamplePairForLevel, getExampleSentences } from '../services/example-service';
import { getStudyChinese, getStudyPartOfSpeech } from '../services/word-service';
import { LearningLevelControl } from './LearningLevelControl';
import { AudioIconButton } from './AudioIconButton';
import { OxfordPageImage } from './OxfordPageImage';
import { QuestionExampleResult } from './QuestionExampleResult';

interface QuestionTextProps {
  question: ChoiceQuestion;
  disabled: boolean;
  enableAudio: boolean;
  questionLevel: number;
  upgradeToLevel?: number | null;
  selectedAnswer: string | null;
  relatedResultPhase?: 'idle' | 'fading-out' | 'revealed';
  onContinue?: () => void;
  onSubmit: (answer: string) => void;
}

export function QuestionText({
  question,
  disabled,
  enableAudio,
  questionLevel,
  upgradeToLevel,
  selectedAnswer,
  relatedResultPhase = 'idle',
  onContinue,
  onSubmit,
}: QuestionTextProps) {
  const senseContext = question.word.studySense ? getExampleSentences(question.word)[0] : null;
  const oxford = question.word.relatedMedia?.oxford;
  const showOxfordResult = (
    questionLevel === 4
    && disabled
    && selectedAnswer === question.correctAnswer
    && relatedResultPhase === 'revealed'
    && Boolean(oxford?.sentence)
  );
  const answeredCorrectly = disabled && selectedAnswer === question.correctAnswer;
  const example = getExamplePairForLevel(question.word, questionLevel, question.exampleIndex);

  return (
    <section className="question-panel question-panel--text">
      <div className="question-word">
        <LearningLevelControl
          level={questionLevel}
          upgradeTo={upgradeToLevel}
          onAudio={enableAudio && questionLevel !== 4 && questionLevel !== 9
            ? () => speakWord(question.word)
            : undefined}
        />
        <span className="question-word__label">英文单词</span>
        <strong>{question.studyText}</strong>
        {questionLevel === 4 && question.word.phonetic ? (
          <div className="question-phonetic-row">
            <span className="question-word__phonetic">{question.word.phonetic}</span>
            {enableAudio ? <AudioIconButton onClick={() => speakWord(question.word)} /> : null}
          </div>
        ) : null}
        {questionLevel === 4 && answeredCorrectly ? (
          <p className="question-word__answer-meaning">{getStudyChinese(question.word)}</p>
        ) : null}
        {senseContext ? (
          <div className="question-word__sense-context">
            <span>{getStudyPartOfSpeech(question.word)} · 英文语境</span>
            <p>{senseContext}</p>
          </div>
        ) : null}
        <QuestionExampleResult
          sentence={example?.sentence}
          translation={example?.translation}
          visible={answeredCorrectly && Boolean(example?.sentence)}
          reserveSpace
        />
      </div>

      {showOxfordResult && oxford ? (
        <figure className="question-related-page-result question-oxford-result" aria-label="牛津树对应页面">
          <OxfordPageImage
            media={oxford}
            alt={oxford.label}
            className="question-related-page-result__atlas"
          />
          <figcaption>
            <span>{oxford.label}</span>
            <p>{oxford.sentence}</p>
            {oxford.sentenceTranslation ? (
              <p className="question-related-page-result__translation">
                {oxford.sentenceTranslation}
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
        <div className={`question-panel__answer-column${relatedResultPhase === 'fading-out' ? ' is-fading-out' : ''}`}>
          {questionLevel !== 4 ? (
            <div className="question-panel__meta">
              <p>{question.prompt}</p>
            </div>
          ) : null}

          <div className="option-grid question-panel__bottom-options">
            {question.options.map((option) => {
              const isSelected = selectedAnswer === option;
              const isCorrect = option === question.correctAnswer;
              return (
                <button
                  key={option}
                  type="button"
                  className={`choice-button${isSelected ? ' is-selected' : ''}${disabled && isCorrect ? ' is-correct' : ''}${disabled && isSelected && !isCorrect ? ' is-wrong' : ''}`}
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
