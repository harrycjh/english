import { AudioIconButton } from './AudioIconButton';
import type { ChoiceQuestion } from '../services/question-service';
import { speakWord } from '../services/audio-service';

interface QuestionTextProps {
  question: ChoiceQuestion;
  disabled: boolean;
  enableAudio: boolean;
  selectedAnswer: string | null;
  onSubmit: (answer: string) => void;
}

export function QuestionText({ question, disabled, enableAudio, selectedAnswer, onSubmit }: QuestionTextProps) {
  return (
    <section className="question-panel question-panel--text">
      <div className="question-word">
        {enableAudio ? <AudioIconButton onClick={() => speakWord(question.word)} /> : null}
        <span className="question-word__label">英文单词</span>
        <strong>{question.studyText}</strong>
      </div>

      <div className="question-panel__answer-column">
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
      </div>
    </section>
  );
}
