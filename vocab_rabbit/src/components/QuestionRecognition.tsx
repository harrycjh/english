import type { LocalLifePhotoView } from '../models/local-media';
import type { RecognitionQuestion } from '../services/question-service';
import { speakWord } from '../services/audio-service';
import { getStudyChinese } from '../services/word-service';
import { AudioIconButton } from './AudioIconButton';
import { QuestionMedia } from './QuestionMedia';

interface QuestionRecognitionProps {
  question: RecognitionQuestion;
  disabled: boolean;
  enableAudio: boolean;
  selectedAnswer: string | null;
  localLifePhoto?: LocalLifePhotoView;
  onSubmit: (answer: string) => void;
}

export function QuestionRecognition({
  question,
  disabled,
  enableAudio,
  selectedAnswer,
  localLifePhoto,
  onSubmit,
}: QuestionRecognitionProps) {
  return (
    <section className="question-panel question-panel--recognition">
      <div className="image-stage">
        <QuestionMedia
          word={question.word}
          strategy="comfy"
          localLifePhoto={localLifePhoto}
          alt={`${question.studyText} 的提示图片`}
          className="image-stage__image"
        />
      </div>
      <div className="recognition-card">
        {enableAudio ? <AudioIconButton onClick={() => speakWord(question.word)} /> : null}
        <span className="question-word__label">第一次见面</span>
        <strong>{question.studyText}</strong>
        <p>{getStudyChinese(question.word)}</p>
        <small>{question.prompt}</small>
        <div className="recognition-actions">
          {question.options.map((option) => (
            <button
              key={option}
              type="button"
              className={`choice-button${selectedAnswer === option ? ' is-selected' : ''}`}
              disabled={disabled}
              onClick={() => onSubmit(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
