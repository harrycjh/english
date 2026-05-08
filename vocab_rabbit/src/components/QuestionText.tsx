import type { ChoiceQuestion } from '../services/question-service';
import { speakWord } from '../services/audio-service';

interface QuestionTextProps {
  question: ChoiceQuestion;
  disabled: boolean;
  selectedAnswer: string | null;
  onSubmit: (answer: string) => void;
}

export function QuestionText({ question, disabled, selectedAnswer, onSubmit }: QuestionTextProps) {
  return (
    <section className="question-panel question-panel--text">
      <div className="question-word">
        <span className="question-word__label">英文单词</span>
        <strong>{question.studyText}</strong>
        <button className="audio-button" type="button" onClick={() => speakWord(question.word)}>
          听发音
        </button>
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