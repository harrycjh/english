import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type SyntheticEvent,
} from 'react';
import { Delete } from 'lucide-react';
import type { LocalLifePhotoView } from '../models/local-media';
import type { FillBlankQuestion } from '../services/question-service';
import { speakWord } from '../services/audio-service';
import { getExamplePairForLevel } from '../services/example-service';
import { getWordAtlasStyle } from '../services/word-atlas-service';
import { getStudyChinese, getWordImageUrl } from '../services/word-service';
import { AudioIconButton } from './AudioIconButton';
import { LearningLevelControl } from './LearningLevelControl';
import { QuestionMedia } from './QuestionMedia';
import { QuestionExampleResult } from './QuestionExampleResult';

interface QuestionFillBlankProps {
  question: FillBlankQuestion;
  disabled: boolean;
  enableAudio: boolean;
  questionLevel: number;
  upgradeToLevel?: number | null;
  selectedAnswer: string | null;
  localLifePhoto?: LocalLifePhotoView;
  relatedResultPhase?: 'idle' | 'fading-out' | 'revealed';
  showHints: boolean;
  showDifficultSpellingSkip?: boolean;
  onContinue?: () => void;
  onSubmit: (answer: string) => void;
}

function renderMaskedWord(maskedCharacters: string[], guessLetters: string[]) {
  let guessIndex = 0;
  return maskedCharacters.map((character) => {
    if (character !== '_') {
      return character;
    }
    const guessed = guessLetters[guessIndex];
    guessIndex += 1;
    return guessed ?? '_';
  });
}

function isLiteralSpace(character: string) {
  return character === ' ';
}

export function isPortraitSpellingLifePhoto(width: number, height: number): boolean {
  return width > 0 && height > width;
}

const KEYBOARD_ROWS = [
  [...'QWERTYUIOP'],
  [...'ASDFGHJKL'],
  [...'ZXCVBNM'],
];

export function applySpellingKey(
  currentGuess: string,
  key: string,
  maximumLength: number,
): string {
  if (key === 'Backspace') {
    return currentGuess.slice(0, -1);
  }
  if (!/^[A-Za-z]$/.test(key) || currentGuess.length >= maximumLength) {
    return currentGuess;
  }
  return `${currentGuess}${key.toLowerCase()}`;
}

export function QuestionFillBlank({
  question,
  disabled,
  enableAudio,
  questionLevel,
  upgradeToLevel,
  selectedAnswer,
  localLifePhoto,
  relatedResultPhase = 'idle',
  showHints,
  showDifficultSpellingSkip = false,
  onContinue,
  onSubmit,
}: QuestionFillBlankProps) {
  const [guess, setGuess] = useState('');
  const [isPortraitLifePhoto, setIsPortraitLifePhoto] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasSubmittedRef = useRef(false);

  useEffect(() => {
    setGuess('');
    hasSubmittedRef.current = false;
  }, [question.word.id, question.maskedCharacters, question.missingLetters]);

  useEffect(() => {
    setIsPortraitLifePhoto(false);
  }, [question.word.id, localLifePhoto?.objectUrl, localLifePhoto?.photoId]);

  useEffect(() => {
    if (disabled) return;
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [question.word.id, disabled]);

  const answerLetters = useMemo(
    () => disabled ? question.missingLetters : [...guess],
    [disabled, guess, question.missingLetters],
  );
  const displayCharacters = useMemo(
    () => renderMaskedWord(question.maskedCharacters, answerLetters),
    [answerLetters, question.maskedCharacters],
  );
  const useCompactSpelling = question.maskedCharacters.length > 9;
  const spellingDisplayStyle = {
    '--spelling-character-count': question.maskedCharacters.length,
  } as CSSProperties;
  const useSpellingCardLayout = questionLevel >= 7;
  const useTopForgotAction = questionLevel >= 8 && questionLevel <= 9;
  const answeredCorrectly = disabled
    && selectedAnswer?.toLowerCase() === question.missingLetters.join('').toLowerCase();
  const example = getExamplePairForLevel(question.word, questionLevel, question.exampleIndex);
  const showExample = questionLevel === 7 || questionLevel === 9
    ? disabled
    : questionLevel === 8
      ? answeredCorrectly
      : false;
  const raz = question.word.relatedMedia?.raz;
  const showRazResult = (
    questionLevel === 8
    && answeredCorrectly
    && relatedResultPhase === 'revealed'
    && Boolean(raz?.sentence)
  );
  const activeCharacterIndex = useMemo(() => {
    if (!useSpellingCardLayout || disabled) return -1;
    let missingIndex = 0;
    for (let index = 0; index < question.maskedCharacters.length; index += 1) {
      if (question.maskedCharacters[index] !== '_') continue;
      if (missingIndex === guess.length) return index;
      missingIndex += 1;
    }
    return -1;
  }, [disabled, guess.length, question.maskedCharacters, useSpellingCardLayout]);

  function updateGuess(nextValue: string) {
    const nextGuess = nextValue
      .replace(/[^A-Za-z]/g, '')
      .toLowerCase()
      .slice(0, question.missingLetters.length);
    setGuess(nextGuess);

    if (
      !disabled
      && !hasSubmittedRef.current
      && nextGuess.length === question.missingLetters.length
    ) {
      hasSubmittedRef.current = true;
      onSubmit(nextGuess);
    }
  }

  function handleGuessChange(event: ChangeEvent<HTMLInputElement>) {
    updateGuess(event.target.value);
  }

  function handleScreenKey(key: string) {
    if (disabled || hasSubmittedRef.current) return;
    updateGuess(applySpellingKey(guess, key, question.missingLetters.length));
    inputRef.current?.focus({ preventScroll: true });
  }

  function handleForgot() {
    if (disabled || hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    onSubmit('');
  }

  function handleDifficultSpellingSkip() {
    if (disabled || hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    onSubmit(question.missingLetters.join(''));
  }

  const screenKeyboard = (
    <div className="spelling-screen-keyboard keyboard-grid" aria-label="屏幕英文键盘">
      {KEYBOARD_ROWS.map((row, rowIndex) => (
        <div
          key={row.join('')}
          className={`spelling-screen-keyboard__row spelling-screen-keyboard__row--${rowIndex + 1}`}
        >
          {row.map((letter) => (
            <button
              key={letter}
              className="spelling-screen-keyboard__key keyboard-button"
              type="button"
              aria-label={`字母 ${letter}`}
              disabled={disabled}
              onClick={() => handleScreenKey(letter)}
            >
              {letter}
            </button>
          ))}
          {rowIndex === KEYBOARD_ROWS.length - 1 ? (
            <button
              className="spelling-screen-keyboard__key spelling-screen-keyboard__key--delete keyboard-button"
              type="button"
              aria-label="删除上一个字母"
              title="删除"
              disabled={disabled || guess.length === 0}
              onClick={() => handleScreenKey('Backspace')}
            >
              <Delete aria-hidden="true" />
              <span>删除</span>
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );

  if (showRazResult && raz) {
    return (
      <section className="question-panel question-panel--fill question-panel--full-spelling question-panel--full-spelling-final">
        <figure className="question-related-page-result question-raz-result" aria-label="RAZ 对应页面">
          <span
            className="question-related-page-result__atlas word-image--atlas"
            role="img"
            aria-label={raz.label}
            style={{
              ...getWordAtlasStyle(raz, { columns: 3, rows: 3, cellSize: 512 }),
              backgroundImage: `url(${getWordImageUrl(raz.atlasPath)})`,
            }}
          />
          <figcaption>
            <span>{raz.label}</span>
            <p>{raz.sentence}</p>
            {raz.sentenceTranslation ? (
              <p className="question-related-page-result__translation">
                {raz.sentenceTranslation}
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
      </section>
    );
  }

  const useFinalSpellingLayout = questionLevel >= 8 && questionLevel <= 9;
  const imageStrategy = questionLevel >= 9 ? 'life-photo' : 'comfy';
  const showsLifePhotoImage = useFinalSpellingLayout
    && imageStrategy === 'life-photo'
    && Boolean(localLifePhoto || question.word.relatedMedia?.lifePhoto);
  const usePortraitLifePhotoLayout = showsLifePhotoImage && isPortraitLifePhoto;

  function handleMediaLoadCapture(event: SyntheticEvent<HTMLDivElement>) {
    if (!showsLifePhotoImage) return;
    const image = event.target as HTMLImageElement;
    if (image.tagName !== 'IMG') return;
    setIsPortraitLifePhoto(
      isPortraitSpellingLifePhoto(image.naturalWidth, image.naturalHeight),
    );
  }

  return (
    <section className={`question-panel question-panel--fill${useSpellingCardLayout ? ' question-panel--full-spelling' : ''}${useFinalSpellingLayout ? ' question-panel--full-spelling-final' : ''}${showsLifePhotoImage ? ' is-full-spelling-life-photo' : ''}${usePortraitLifePhotoLayout ? ' is-portrait-full-spelling-life-photo' : ''}`}>
      {useSpellingCardLayout ? (
        <div className="full-spelling-card" onLoadCapture={handleMediaLoadCapture}>
          <LearningLevelControl
            level={questionLevel}
            upgradeTo={upgradeToLevel}
          />
          <div className="full-spelling-card__title-row">
            <span className="question-word__label">
              {question.inputMode === 'full' ? '完整拼写' : '部分拼写'}
            </span>
            {useTopForgotAction ? (
              <button
                type="button"
                className="full-spelling-forgot-button full-spelling-forgot-button--inline"
                disabled={disabled}
                onClick={handleForgot}
              >
                我忘记了
              </button>
            ) : null}
          </div>
          <QuestionMedia
            word={question.word}
            strategy={imageStrategy}
            localLifePhoto={localLifePhoto}
            className="full-spelling-card__image"
            alt={`${getStudyChinese(question.word)} 的提示图片`}
          />
          <div className="full-spelling-card__content">
            <div className="full-spelling-card__word-entry">
              <div
                className={`fill-blank-display full-spelling-card__word${useCompactSpelling ? ' is-compact' : ''}`}
                style={spellingDisplayStyle}
                aria-label="待拼写单词"
              >
                {displayCharacters.map((character, index) => (
                  <span
                    key={index}
                    className={`fill-blank-display__cell${character === '_' ? ' is-empty' : ''}${isLiteralSpace(question.maskedCharacters[index]) ? ' is-literal-space' : ''}${index === activeCharacterIndex ? ' is-active' : ''}${disabled && question.maskedCharacters[index] === '_' ? answeredCorrectly ? ' is-answer-correct' : ' is-answer-wrong is-corrected' : ''}`}
                  >
                    {isLiteralSpace(character) ? '\u00a0' : character}
                  </span>
                ))}
              </div>
            </div>
            {questionLevel !== 9 && question.word.phonetic ? (
              <div className="question-phonetic-row full-spelling-card__phonetic">
                <span>{question.word.phonetic}</span>
                {enableAudio ? (
                  <AudioIconButton onClick={() => speakWord(question.word)} />
                ) : null}
              </div>
            ) : null}
            <strong className="full-spelling-card__meaning">{getStudyChinese(question.word)}</strong>
            {questionLevel >= 7 && questionLevel <= 9 ? (
              <QuestionExampleResult
                sentence={example?.sentence}
                translation={example?.translation}
                visible={showExample && Boolean(example?.sentence)}
                reserveSpace
              />
            ) : null}
          </div>
        </div>
      ) : (
        <>
          <div className="question-word question-word--fill">
            <LearningLevelControl
              level={questionLevel}
              upgradeTo={upgradeToLevel}
              onAudio={enableAudio ? () => speakWord(question.word) : undefined}
            />
            <span className="question-word__label">拼写挑战</span>
            <strong>{question.prompt}</strong>
          </div>

          <div className="fill-blank-display" aria-label="填空单词">
            {displayCharacters.map((character, index) => (
              <span key={`${character}-${index}`} className={`fill-blank-display__cell${character === '_' ? ' is-empty' : ''}${isLiteralSpace(question.maskedCharacters[index]) ? ' is-literal-space' : ''}`}>
                {isLiteralSpace(character) ? '\u00a0' : character}
              </span>
            ))}
          </div>
        </>
      )}

      {showHints && questionLevel < 7 ? (
        <div className="fill-blank-hint" aria-live="polite">
          <span>拼写提示</span>
          {questionLevel < 7 ? (
            <strong>还缺 {question.missingLetters.length} 个字母</strong>
          ) : null}
          <p>
            使用右侧英文键盘输入。
            {questionLevel < 7 ? `已填写 ${guess.length}/${question.missingLetters.length}。` : null}
          </p>
        </div>
      ) : null}

      {useSpellingCardLayout ? (
        <div className="full-spelling-keyboard-shell">
          {screenKeyboard}
        </div>
      ) : null}

      {useSpellingCardLayout && (!useTopForgotAction || showDifficultSpellingSkip) ? (
        <div className="full-spelling-actions">
          {!useTopForgotAction ? (
            <button
              type="button"
              className="full-spelling-forgot-button"
              disabled={disabled}
              onClick={handleForgot}
            >
              我忘记了
            </button>
          ) : null}
          {showDifficultSpellingSkip ? (
            <button
              type="button"
              className="full-spelling-skip-button"
              disabled={disabled}
              onClick={handleDifficultSpellingSkip}
            >
              我是小狗子（不是小兔子）所以默不出来，爸爸帮我跳过这个单词吧！
            </button>
          ) : null}
        </div>
      ) : !useSpellingCardLayout ? (
        screenKeyboard
      ) : null}
      <input
        ref={inputRef}
        className="spelling-hardware-input"
        type="text"
        inputMode="none"
        lang="en-US"
        autoFocus
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        aria-label="使用实体键盘输入字母"
        aria-disabled={disabled}
        maxLength={question.missingLetters.length}
        readOnly={disabled}
        value={guess}
        onChange={handleGuessChange}
      />
    </section>
  );
}
