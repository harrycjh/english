import type { LocalLifePhotoView } from '../models/local-media';
import type { RecognitionQuestion } from '../services/question-service';
import { speakWord } from '../services/audio-service';
import { getExamplePairForLevel } from '../services/example-service';
import { getStudyChinese } from '../services/word-service';
import { AudioIconButton } from './AudioIconButton';
import { LearningLevelControl } from './LearningLevelControl';
import { QuestionMedia } from './QuestionMedia';
import { QuestionExampleResult } from './QuestionExampleResult';

interface QuestionRecognitionProps {
  question: RecognitionQuestion;
  disabled: boolean;
  enableAudio: boolean;
  questionLevel: number;
  upgradeToLevel?: number | null;
  selectedAnswer: string | null;
  localLifePhoto?: LocalLifePhotoView;
  onSubmit: (answer: string) => void;
}

export function QuestionRecognition({
  question,
  disabled,
  enableAudio,
  questionLevel,
  upgradeToLevel,
  selectedAnswer,
  localLifePhoto,
  onSubmit,
}: QuestionRecognitionProps) {
  const example = getExamplePairForLevel(question.word, questionLevel, question.exampleIndex);
  const answeredCorrectly = disabled && selectedAnswer === question.correctAnswer;
  return (
    <section className="question-panel question-panel--recognition question-panel--level-0">
      <div className="image-stage">
        <span className="question-word__label">初次见面</span>
        <LearningLevelControl
          level={questionLevel}
          upgradeTo={upgradeToLevel}
        />
        <QuestionMedia
          word={question.word}
          strategy="comfy"
          localLifePhoto={localLifePhoto}
          alt={`${question.studyText} 的提示图片`}
          className="image-stage__image"
        />
      </div>
      <div className="recognition-card">
        <strong>{question.studyText}</strong>
        {question.word.phonetic ? (
          <div className="question-phonetic-row">
            <span className="question-word__phonetic">{question.word.phonetic}</span>
            {enableAudio ? (
              <AudioIconButton onClick={() => speakWord(question.word)} />
            ) : null}
          </div>
        ) : null}
        <p>{getStudyChinese(question.word)}</p>
        <QuestionExampleResult
          sentence={example?.sentence}
          translation={example?.translation}
          visible={answeredCorrectly && Boolean(example?.sentence)}
          reserveSpace
        />
        <small>{question.prompt}</small>
        <div className="recognition-actions">
          {question.options.map((option) => {
            const isSelected = selectedAnswer === option;
            const selectedResultClass = disabled && isSelected
              ? option === question.correctAnswer ? ' is-correct' : ' is-wrong'
              : '';
            return (
              <button
                key={option}
                type="button"
                className={`choice-button${isSelected ? ' is-selected' : ''}${selectedResultClass}`}
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
