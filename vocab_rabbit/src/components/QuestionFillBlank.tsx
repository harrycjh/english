import { useEffect, useMemo, useState } from 'react';
import type { FillBlankQuestion } from '../services/question-service';
import { speakWord } from '../services/audio-service';

interface QuestionFillBlankProps {
  question: FillBlankQuestion;
  disabled: boolean;
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

export function QuestionFillBlank({ question, disabled, onSubmit }: QuestionFillBlankProps) {
  const [guessLetters, setGuessLetters] = useState<string[]>([]);

  useEffect(() => {
    setGuessLetters([]);
  }, [question.maskedCharacters, question.missingLetters]);

  const displayCharacters = useMemo(
    () => renderMaskedWord(question.maskedCharacters, guessLetters),
    [question.maskedCharacters, guessLetters]
  );

  function handleLetterClick(letter: string) {
    if (disabled || guessLetters.length >= question.missingLetters.length) {
      return;
    }

    const nextGuess = [...guessLetters, letter];
    setGuessLetters(nextGuess);
    if (nextGuess.length === question.missingLetters.length) {
      onSubmit(nextGuess.join(''));
    }
  }

  return (
    <section className="question-panel question-panel--fill">
      <div className="question-word question-word--fill">
        <span className="question-word__label">拼写挑战</span>
        <strong>{question.prompt}</strong>
        <button className="audio-button" type="button" onClick={() => speakWord(question.word)}>
          听发音
        </button>
      </div>

      <div className="fill-blank-display" aria-label="填空单词">
        {displayCharacters.map((character, index) => (
          <span key={`${character}-${index}`} className={`fill-blank-display__cell${character === '_' ? ' is-empty' : ''}`}>
            {character}
          </span>
        ))}
      </div>

      <div className="keyboard-grid">
        {question.keyboardLetters.map((letter, index) => (
          <button
            key={`${letter}-${index}`}
            type="button"
            className="keyboard-button"
            disabled={disabled || guessLetters.length >= question.missingLetters.length}
            onClick={() => handleLetterClick(letter)}
          >
            {letter.toUpperCase()}
          </button>
        ))}
      </div>
    </section>
  );
}