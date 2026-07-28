import { useEffect, useState } from 'react';
import type { ChoiceQuestion } from '../services/question-service';
import { speakChinese, speakWord } from '../services/audio-service';
import { getPrimaryExamplePair } from '../services/example-service';
import { getPrimaryOxfordRefLabel } from '../services/word-service';
import type { LocalLifePhotoView } from '../models/local-media';
import { AudioIconButton } from './AudioIconButton';
import { LearningLevelControl } from './LearningLevelControl';
import { QuestionMedia } from './QuestionMedia';
import { QuestionExampleResult } from './QuestionExampleResult';

interface QuestionImageProps {
  question: ChoiceQuestion;
  disabled: boolean;
  enableAudio: boolean;
  questionLevel: number;
  upgradeToLevel?: number | null;
  selectedAnswer: string | null;
  localLifePhoto?: LocalLifePhotoView;
  revealLifePhoto?: boolean;
  onSubmit: (answer: string) => void;
}

export function isPortraitQuestionImage(width: number, height: number): boolean {
  return width > 0 && height > width;
}

export function QuestionImage({
  question,
  disabled,
  enableAudio,
  questionLevel,
  upgradeToLevel,
  selectedAnswer,
  localLifePhoto,
  revealLifePhoto = false,
  onSubmit,
}: QuestionImageProps) {
  const [isPortraitLifePhoto, setIsPortraitLifePhoto] = useState(false);
  const oxfordLabel = getPrimaryOxfordRefLabel(question.word);
  const imageStrategy = revealLifePhoto ? 'life-photo' : (question.imageStrategy ?? 'comfy');
  const example = getPrimaryExamplePair(question.word);
  const answeredCorrectly = disabled && selectedAnswer === question.correctAnswer;
  const showExample = disabled
    && Boolean(example?.sentence)
    && (answeredCorrectly || questionLevel === 1);

  useEffect(() => {
    setIsPortraitLifePhoto(false);
  }, [question.word.id, revealLifePhoto]);

  return (
    <section className={`question-panel question-panel--image-choice question-panel--level-${questionLevel}${revealLifePhoto ? ' is-life-photo-reveal' : ''}${isPortraitLifePhoto ? ' is-portrait-life-photo' : ''}`}>
      <div
        className="image-stage"
        onLoadCapture={(event) => {
          if (!revealLifePhoto) return;
          const image = event.target as HTMLImageElement;
          setIsPortraitLifePhoto(
            isPortraitQuestionImage(image.naturalWidth, image.naturalHeight),
          );
        }}
      >
        <span className="question-word__label">
          {questionLevel === 1 ? '图片识词' : '图片选词'}
        </span>
        <LearningLevelControl
          level={questionLevel}
          upgradeTo={upgradeToLevel}
          onAudio={enableAudio && questionLevel !== 1
            ? () => questionLevel === 2 ? speakChinese(question.word) : speakWord(question.word)
            : undefined}
          audioLabel={questionLevel === 2 ? '播放中文释义' : '播放英文发音'}
        />
        {question.word.imageApproved || question.imageStrategy === 'related-priority' ? (
          <QuestionMedia
            word={question.word}
            strategy={imageStrategy}
            localLifePhoto={localLifePhoto}
            alt="题目图片"
            className="image-stage__image"
          />
        ) : (
          <div className="image-stage__placeholder">
            <span className="image-stage__tag">本地图片待接入</span>
            <strong>{question.studyText}</strong>
            <p>{question.word.category}</p>
            <small>{oxfordLabel ?? '没有牛津树定位'}</small>
          </div>
        )}
      </div>

      <div className="question-panel__answer-column">
        {questionLevel !== 1 && questionLevel !== 2 ? (
          <div className="question-panel__meta">
            <p>{question.prompt}</p>
          </div>
        ) : null}

        {questionLevel === 1 && question.word.phonetic ? (
          <div className="question-panel__word-cue">
            <strong>{question.studyText}</strong>
            <div className="question-phonetic-row">
              <span>{question.word.phonetic}</span>
              {enableAudio ? (
                <AudioIconButton onClick={() => speakWord(question.word)} />
              ) : null}
            </div>
          </div>
        ) : null}

        <QuestionExampleResult
          sentence={example?.sentence}
          translation={example?.translation}
          visible={showExample}
          reserveSpace
        />

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
    </section>
  );
}
