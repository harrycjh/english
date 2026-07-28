import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultParentSetting } from '../src/models/parent-setting';
import type { WordPayload } from '../src/models/word';
import { buildQuestion, getCorrectAnswer } from '../src/services/question-service';
import { createEmptyRecord } from '../src/services/spaced-repetition';

describe('KET four-choice question coverage', () => {
  it('includes the correct answer in every generated choice list', () => {
    const payload = JSON.parse(
      fs.readFileSync(new URL('../public/content/words/ket_vocabulary.json', import.meta.url), 'utf8'),
    ) as WordPayload;
    const failures: string[] = [];

    for (const word of payload.words) {
      for (const level of [1, 2, 3, 4, 5, 6]) {
        const question = buildQuestion(
          word,
          payload.words,
          { ...createEmptyRecord(word.id), masteryLevel: level, reviewStage: level },
          defaultParentSetting,
        );
        const correctAnswer = getCorrectAnswer(question);
        const visibleAnswers = question.kind === 'image-answer-choice'
          ? question.options.map((option) => option.id)
          : 'options' in question
            ? question.options
            : [];

        if (!visibleAnswers.includes(correctAnswer)) {
          failures.push(`${word.id} Lv.${level}: ${correctAnswer}`);
        }
      }
    }

    expect(failures, failures.slice(0, 20).join('\n')).toEqual([]);
  });

  it('builds four unique visible options for every level 5 sentence question', () => {
    const payload = JSON.parse(
      fs.readFileSync(new URL('../public/content/words/ket_vocabulary.json', import.meta.url), 'utf8'),
    ) as WordPayload;
    const failures: string[] = [];

    for (const word of payload.words) {
      const question = buildQuestion(
        word,
        payload.words,
        { ...createEmptyRecord(word.id), masteryLevel: 5, reviewStage: 5 },
        defaultParentSetting,
      );
      if (question.kind !== 'sentence-choice') continue;
      const normalizedOptions = new Set(question.options.map((option) => option.toLowerCase()));
      if (question.options.length !== 4 || normalizedOptions.size !== 4) {
        failures.push(`${word.id}: ${question.options.join(' / ')}`);
      }
    }

    expect(failures, failures.slice(0, 20).join('\n')).toEqual([]);
  });

  it('preserves the missing letters case in every level 6 option', () => {
    const payload = JSON.parse(
      fs.readFileSync(new URL('../public/content/words/ket_vocabulary.json', import.meta.url), 'utf8'),
    ) as WordPayload;
    const failures: string[] = [];

    for (const word of payload.words) {
      const question = buildQuestion(
        word,
        payload.words,
        { ...createEmptyRecord(word.id), masteryLevel: 6, reviewStage: 6 },
        defaultParentSetting,
      );
      if (question.kind !== 'letter-choice') continue;
      const originalCharacters = [...question.studyText];
      const missingIndices = question.maskedCharacters.flatMap(
        (character, index) => character === '_' ? [index] : [],
      );
      const expectedAnswer = missingIndices.map((index) => originalCharacters[index]).join('');
      const hasWrongCase = question.options.some((option) => (
        [...option].some((character, index) => {
          const expectedCharacter = expectedAnswer[index];
          return (
            /[A-Z]/.test(expectedCharacter)
              ? character !== character.toUpperCase()
              : character !== character.toLowerCase()
          );
        })
      ));
      if (question.correctAnswer !== expectedAnswer || hasWrongCase) {
        failures.push(
          `${word.id}: ${question.maskedCharacters.join('')} -> ${question.options.join(' / ')}`,
        );
      }
    }

    expect(failures, failures.slice(0, 20).join('\n')).toEqual([]);
  });
});
