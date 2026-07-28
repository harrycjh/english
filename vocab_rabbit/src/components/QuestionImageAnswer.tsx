import type { LocalLifePhotoView } from '../models/local-media';
import type { ImageAnswerChoiceQuestion } from '../services/question-service';
import { speakWord } from '../services/audio-service';
import { getExampleSentences } from '../services/example-service';
import { getExampleTranslations } from '../services/example-service';
import { LearningLevelControl } from './LearningLevelControl';
import { AudioIconButton } from './AudioIconButton';
import { QuestionMedia } from './QuestionMedia';

interface QuestionImageAnswerProps {
  question: ImageAnswerChoiceQuestion;
  disabled: boolean;
  enableAudio: boolean;
  questionLevel: number;
  upgradeToLevel?: number | null;
  selectedAnswer: string | null;
  localLifePhotosById: Record<string, LocalLifePhotoView>;
  onSubmit: (answer: string) => void;
}

export function QuestionImageAnswer({
  question,
  disabled,
  enableAudio,
  questionLevel,
  upgradeToLevel,
  selectedAnswer,
  localLifePhotosById,
  onSubmit,
}: QuestionImageAnswerProps) {
  const exampleSentence = getExampleSentences(question.word)[0];
  const exampleTranslation = getExampleTranslations(question.word)[0];
  const answeredCorrectly = disabled && selectedAnswer === question.correctAnswer;
  const answered = disabled && selectedAnswer !== null;

  return (
    <section className="question-panel question-panel--image-answer">
      <div className="question-word">
        <LearningLevelControl
          level={questionLevel}
          upgradeTo={upgradeToLevel}
        />
        <span className="question-word__label">英文单词</span>
        <strong>{question.studyText}</strong>
        {question.word.phonetic ? (
          <div className="question-phonetic-row">
            <span className="question-word__phonetic">{question.word.phonetic}</span>
            {enableAudio ? <AudioIconButton onClick={() => speakWord(question.word)} /> : null}
          </div>
        ) : null}
        {answeredCorrectly ? (
          <p className="question-word__answer-meaning">
            {question.word.studySense?.chinese ?? question.word.chinese}
          </p>
        ) : null}
        {exampleSentence ? (
          <p className="question-word__example">{exampleSentence}</p>
        ) : null}
        {answered && exampleTranslation ? (
          <p className="question-word__example-translation">{exampleTranslation}</p>
        ) : null}
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
