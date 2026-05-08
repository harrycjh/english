import { AudioIconButton } from './AudioIconButton';
import type { ChoiceQuestion } from '../services/question-service';
import { speakWord } from '../services/audio-service';
import { getPrimaryOxfordRefLabel } from '../services/word-service';

interface QuestionImageProps {
  question: ChoiceQuestion;
  disabled: boolean;
  enableAudio: boolean;
  selectedAnswer: string | null;
  onSubmit: (answer: string) => void;
}

export function QuestionImage({ question, disabled, enableAudio, selectedAnswer, onSubmit }: QuestionImageProps) {
  const oxfordLabel = getPrimaryOxfordRefLabel(question.word);

  return (
    <section className="question-panel">
      <div className="image-stage">
        {enableAudio ? <AudioIconButton onClick={() => speakWord(question.word)} className="audio-icon-button--overlay" /> : null}
        {question.word.imageApproved ? (
          <img src={question.word.imagePath} alt={question.word.chinese} className="image-stage__image" />
        ) : (
          <div className="image-stage__placeholder">
            <span className="image-stage__tag">本地图片待接入</span>
            <strong>{question.studyText}</strong>
            <p>{question.word.category}</p>
            <small>{oxfordLabel ?? '没有牛津树定位'}</small>
          </div>
        )}
      </div>

      <div className="question-panel__meta">
        <p>{question.prompt}</p>
      </div>

      <div className="option-grid">
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
    </section>
  );
}