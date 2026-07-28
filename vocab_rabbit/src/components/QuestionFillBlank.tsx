import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
} from 'react';
import { Keyboard, PenLine } from 'lucide-react';
import type { LocalLifePhotoView } from '../models/local-media';
import type { FillBlankQuestion } from '../services/question-service';
import { speakWord } from '../services/audio-service';
import { getPrimaryExamplePair } from '../services/example-service';
import {
  loadSpellingInputMethod,
  saveSpellingInputMethod,
  type SpellingInputMethod,
} from '../services/spelling-input-preference';
import { getStudyChinese } from '../services/word-service';
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
  showHints: boolean;
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

export function QuestionFillBlank({
  question,
  disabled,
  enableAudio,
  questionLevel,
  upgradeToLevel,
  selectedAnswer,
  localLifePhoto,
  showHints,
  onSubmit,
}: QuestionFillBlankProps) {
  const [guess, setGuess] = useState('');
  const [inputMethod, setInputMethod] = useState<SpellingInputMethod>(loadSpellingInputMethod);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasSubmittedRef = useRef(false);

  useEffect(() => {
    setGuess('');
    hasSubmittedRef.current = false;
  }, [question.word.id, question.maskedCharacters, question.missingLetters]);

  useEffect(() => {
    if (disabled) return;
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [question.word.id, disabled, inputMethod]);

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
  const answeredCorrectly = disabled
    && selectedAnswer?.toLowerCase() === question.missingLetters.join('').toLowerCase();
  const example = getPrimaryExamplePair(question.word);
  const showExample = questionLevel === 7 || questionLevel === 9
    ? disabled
    : questionLevel === 8
      ? answeredCorrectly
      : false;
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || hasSubmittedRef.current || guess.length !== question.missingLetters.length) return;
    hasSubmittedRef.current = true;
    onSubmit(guess);
  }

  function handleGuessChange(event: ChangeEvent<HTMLInputElement>) {
    const nextGuess = event.target.value
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

  function handleForgot() {
    if (disabled || hasSubmittedRef.current) return;
    hasSubmittedRef.current = true;
    onSubmit('');
  }

  function handleInputMethodChange(nextMethod: SpellingInputMethod) {
    setInputMethod(nextMethod);
    saveSpellingInputMethod(nextMethod);

    if (disabled) return;
    const input = inputRef.current;
    if (!input) return;
    input.blur();
    input.setAttribute('inputmode', nextMethod === 'keyboard' ? 'text' : 'none');
    input.focus({ preventScroll: true });
  }

  return (
    <section className={`question-panel question-panel--fill${useSpellingCardLayout ? ' question-panel--full-spelling' : ''}`}>
      {useSpellingCardLayout ? (
        <div className="full-spelling-card">
          <LearningLevelControl
            level={questionLevel}
            upgradeTo={upgradeToLevel}
          />
          <div className="full-spelling-card__title-row">
            <span className="question-word__label">
              {question.inputMode === 'full' ? '完整拼写' : '部分拼写'}
            </span>
            <div className="spelling-input-method-toggle" role="group" aria-label="拼写输入方式">
              <button
                type="button"
                className={inputMethod === 'keyboard' ? 'is-selected' : undefined}
                aria-pressed={inputMethod === 'keyboard'}
                disabled={disabled}
                onClick={() => handleInputMethodChange('keyboard')}
              >
                <Keyboard aria-hidden="true" />
                键盘
              </button>
              <button
                type="button"
                className={inputMethod === 'handwriting' ? 'is-selected' : undefined}
                aria-pressed={inputMethod === 'handwriting'}
                disabled={disabled}
                onClick={() => handleInputMethodChange('handwriting')}
              >
                <PenLine aria-hidden="true" />
                手写
              </button>
            </div>
          </div>
          <QuestionMedia
            word={question.word}
            strategy={questionLevel >= 9 ? 'life-photo' : 'comfy'}
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
              <input
                ref={inputRef}
                className="full-spelling-card__inline-input"
                type="text"
                inputMode={inputMethod === 'keyboard' ? 'text' : 'none'}
                lang="en-US"
                enterKeyHint="done"
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                aria-label="直接拼写单词"
                aria-disabled={disabled}
                maxLength={question.missingLetters.length}
                readOnly={disabled}
                value={guess}
                onChange={handleGuessChange}
              />
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
            当前使用{inputMethod === 'keyboard' ? '英文键盘' : '手写'}输入。
            {questionLevel < 7 ? `已填写 ${guess.length}/${question.missingLetters.length}。` : null}
          </p>
        </div>
      ) : null}

      {useSpellingCardLayout ? (
        <div className="full-spelling-actions">
          <button
            type="button"
            className="full-spelling-forgot-button"
            disabled={disabled}
            onClick={handleForgot}
          >
            我忘记了
          </button>
        </div>
      ) : (
        <form className="spelling-entry" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            inputMode={inputMethod === 'keyboard' ? 'text' : 'none'}
            lang="en-US"
            enterKeyHint="done"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            aria-label="输入缺失字母"
            aria-disabled={disabled}
            placeholder={`输入 ${question.missingLetters.length} 个字母`}
            maxLength={question.missingLetters.length}
            readOnly={disabled}
            value={guess}
            onChange={handleGuessChange}
          />
          <button
            type="submit"
            className="primary-button spelling-entry__submit"
            disabled={disabled || guess.length !== question.missingLetters.length}
          >
            确定
          </button>
        </form>
      )}
    </section>
  );
}
