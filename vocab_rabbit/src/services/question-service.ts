import type { LearningRecord } from '../models/learning-record';
import { defaultParentSetting, type ParentSetting } from '../models/parent-setting';
import type { WordRecord } from '../models/word';
import { getStudyText } from './word-service';

export type QuestionKind = 'image-choice' | 'text-choice' | 'fill-blank';

interface BaseQuestion {
  kind: QuestionKind;
  prompt: string;
  studyText: string;
  word: WordRecord;
}

export interface ChoiceQuestion extends BaseQuestion {
  kind: 'image-choice' | 'text-choice';
  options: string[];
  correctAnswer: string;
}

export interface FillBlankQuestion extends BaseQuestion {
  kind: 'fill-blank';
  maskedCharacters: string[];
  missingLetters: string[];
  keyboardLetters: string[];
}

export type Question = ChoiceQuestion | FillBlankQuestion;

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function canUseFillBlank(word: WordRecord): boolean {
  const studyText = getStudyText(word);
  return /^[A-Za-z\- '\/]+$/.test(studyText) && studyText.replace(/[^A-Za-z]/g, '').length >= 4;
}

function getQuestionKind(word: WordRecord, record: LearningRecord | undefined, setting: ParentSetting): QuestionKind {
  const masteryLevel = record?.masteryLevel ?? 0;

  if (masteryLevel <= 1) {
    return setting.showImages ? 'image-choice' : 'text-choice';
  }

  if (masteryLevel <= 3 || !canUseFillBlank(word)) {
    return 'text-choice';
  }

  return 'fill-blank';
}

function buildDistractors(word: WordRecord, allWords: WordRecord[]): WordRecord[] {
  const sameCategory = allWords.filter(
    (candidate) => candidate.id !== word.id && candidate.category === word.category && candidate.chinese !== word.chinese
  );

  const sameDifficulty = allWords.filter(
    (candidate) =>
      candidate.id !== word.id &&
      Math.abs(candidate.difficulty - word.difficulty) <= 1 &&
      candidate.chinese !== word.chinese
  );

  const pool = shuffle([...sameCategory, ...sameDifficulty, ...allWords.filter((candidate) => candidate.id !== word.id)]);
  const uniqueByChinese = new Map<string, WordRecord>();
  for (const candidate of pool) {
    if (!uniqueByChinese.has(candidate.chinese)) {
      uniqueByChinese.set(candidate.chinese, candidate);
    }
  }

  return [...uniqueByChinese.values()].slice(0, 3);
}

function buildChoiceQuestion(kind: 'image-choice' | 'text-choice', word: WordRecord, allWords: WordRecord[]): ChoiceQuestion {
  const options = shuffle([word.chinese, ...buildDistractors(word, allWords).map((candidate) => candidate.chinese)]);
  return {
    kind,
    prompt: kind === 'image-choice' ? '看看图片，选出正确中文' : '看看英文，选出正确中文',
    studyText: getStudyText(word),
    word,
    options,
    correctAnswer: word.chinese,
  };
}

function buildFillBlankQuestion(word: WordRecord): FillBlankQuestion {
  const studyText = getStudyText(word);
  const letters = [...studyText];
  const alphaIndices = letters
    .map((character, index) => ({ character, index }))
    .filter(({ character }) => /[A-Za-z]/.test(character))
    .map(({ index }) => index);

  const targetMissingCount = Math.min(3, Math.max(2, Math.floor(alphaIndices.length / 3)));
  const chosenIndices = alphaIndices
    .slice(Math.max(1, Math.floor(alphaIndices.length / 3)), Math.max(1, Math.floor(alphaIndices.length / 3)) + targetMissingCount)
    .sort((left, right) => left - right);

  const maskedCharacters = letters.map((character, index) =>
    chosenIndices.includes(index) ? '_' : character
  );
  const missingLetters = chosenIndices.map((index) => letters[index].toLowerCase());

  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const keyboardLetters = shuffle([
    ...missingLetters,
    ...alphabet
      .split('')
      .filter((letter) => !missingLetters.includes(letter))
      .slice(0, Math.max(4, 8 - missingLetters.length)),
  ]).slice(0, Math.max(6, missingLetters.length + 4));

  return {
    kind: 'fill-blank',
    prompt: `${word.chinese} 的英语怎么拼？`,
    studyText,
    word,
    maskedCharacters,
    missingLetters,
    keyboardLetters,
  };
}

export function buildQuestion(
  word: WordRecord,
  allWords: WordRecord[],
  record: LearningRecord | undefined,
  setting: ParentSetting = defaultParentSetting
): Question {
  const kind = getQuestionKind(word, record, setting);
  if (kind === 'fill-blank') {
    return buildFillBlankQuestion(word);
  }
  return buildChoiceQuestion(kind, word, allWords);
}

export function getCorrectAnswer(question: Question): string {
  if (question.kind === 'fill-blank') {
    return question.missingLetters.join('');
  }
  return question.correctAnswer;
}

export function isCorrectAnswer(question: Question, answer: string): boolean {
  return getCorrectAnswer(question).toLowerCase() === answer.trim().toLowerCase();
}