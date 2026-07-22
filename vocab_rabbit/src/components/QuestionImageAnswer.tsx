import type { LocalLifePhotoView } from '../models/local-media';
import type { ImageAnswerChoiceQuestion } from '../services/question-service';
import { speakWord } from '../services/audio-service';
import { AudioIconButton } from './AudioIconButton';
import { QuestionMedia } from './QuestionMedia';

interface QuestionImageAnswerProps {
  question: ImageAnswerChoiceQuestion;
  disabled: boolean;
  enableAudio: boolean;
  selectedAnswer: string | null;
  localLifePhotosById: Record<string, LocalLifePhotoView>;
  onSubmit: (answer: string) => void;
}

export function QuestionImageAnswer({
  question,
  disabled,
  enableAudio,
  selectedAnswer,
  localLifePhotosById,
  onSubmit,
}: QuestionImageAnswerProps) {
  return (
    <section className="question-panel question-panel--image-answer">
      <div className="question-word">
        {enableAudio ? <AudioIconButton onClick={() => speakWord(question.word)} /> : null}
        <span className="question-word__label">英文单词</span>
        <strong>{question.studyText}</strong>
        <p>{question.prompt}</p>
      </div>
      <div className="image-option-grid">
        {question.options.map((option, index) => {
          const selected = selectedAnswer === option.id;
          const correct = option.id === question.correctAnswer;
          return (
            <button
              key={option.id}
              type="button"
              aria-label={`图片选项 ${index + 1}`}
              className={`image-choice-button${selected ? ' is-selected' : ''}${disabled && correct ? ' is-correct' : ''}${disabled && selected && !correct ? ' is-wrong' : ''}`}
              disabled={disabled}
              onClick={() => onSubmit(option.id)}
            >
              <QuestionMedia
                word={option}
                strategy={question.imageStrategy}
                localLifePhoto={localLifePhotosById[option.id]}
                alt={`图片选项 ${index + 1}`}
                className="image-choice-button__image"
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
