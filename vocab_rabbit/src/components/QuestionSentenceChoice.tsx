import type { SentenceChoiceQuestion } from '../services/question-service';
import { speakSentence } from '../services/audio-service';
import { LearningLevelControl } from './LearningLevelControl';

interface QuestionSentenceChoiceProps {
  question: SentenceChoiceQuestion;
  disabled: boolean;
  enableAudio: boolean;
  questionLevel: number;
  upgradeToLevel?: number | null;
  selectedAnswer: string | null;
  onSubmit: (answer: string) => void;
}

function HighlightedTranslation({
  translation,
  focus,
}: {
  translation: string;
  focus: string;
}) {
  const focusStart = focus ? translation.indexOf(focus) : -1;
  if (focusStart < 0) return translation;

  return (
    <>
      {translation.slice(0, focusStart)}
      <strong className="sentence-cloze-card__translation-focus">{focus}</strong>
      {translation.slice(focusStart + focus.length)}
    </>
  );
}

function HighlightedSentence({
  sentence,
  focus,
}: {
  sentence: string;
  focus: string;
}) {
  const focusStart = focus ? sentence.indexOf(focus) : -1;
  if (focusStart < 0) return sentence;

  return (
    <>
      {sentence.slice(0, focusStart)}
      <span className="sentence-cloze-card__english-focus">{focus}</span>
      {sentence.slice(focusStart + focus.length)}
    </>
  );
}

export function QuestionSentenceChoice({
  question,
  disabled,
  enableAudio,
  questionLevel,
  upgradeToLevel,
  selectedAnswer,
  onSubmit,
}: QuestionSentenceChoiceProps) {
  const answeredCorrectly = disabled && selectedAnswer === question.correctAnswer;
  const answered = disabled && selectedAnswer !== null;

  return (
    <section className="question-panel question-panel--sentence">
      <div className="sentence-cloze-card">
        <LearningLevelControl
          level={questionLevel}
          upgradeTo={upgradeToLevel}
          onAudio={enableAudio && disabled ? () => speakSentence(question.sentence) : undefined}
        />
        <span className="question-word__label">例句填词</span>
        <strong>
          {answered ? (
            <HighlightedSentence
              sentence={question.sentence}
              focus={question.correctAnswer}
            />
          ) : (
            disabled ? question.sentence : question.maskedSentence
          )}
        </strong>
        {answered && question.sentenceTranslation ? (
          <p className="sentence-cloze-card__translation">
            <HighlightedTranslation
              translation={question.sentenceTranslation}
              focus={question.sentenceTranslationFocus}
            />
          </p>
        ) : null}
      </div>
      <div className="sentence-answer-column">
        <div className="question-panel__meta">
          <p>{question.prompt}</p>
        </div>
        <div className="option-grid sentence-option-grid">
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
    </section>
  );
}
