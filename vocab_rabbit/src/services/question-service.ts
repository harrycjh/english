import type { LearningRecord } from '../models/learning-record';
import { defaultParentSetting, type ParentSetting } from '../models/parent-setting';
import type { WordRecord } from '../models/word';
import { getStudyText } from './word-service';

export type QuestionKind =
  | 'recognition'
  | 'image-choice'
  | 'image-answer-choice'
  | 'text-choice'
  | 'fill-blank';
export type QuestionImageStrategy = 'comfy' | 'related-priority';

interface BaseQuestion {
  kind: QuestionKind;
  prompt: string;
  studyText: string;
  word: WordRecord;
}

export interface RecognitionQuestion extends BaseQuestion {
  kind: 'recognition';
  options: ['认识', '不认识'];
  correctAnswer: '认识';
  imageStrategy: 'comfy';
}

export interface ChoiceQuestion extends BaseQuestion {
  kind: 'image-choice' | 'text-choice';
  options: string[];
  correctAnswer: string;
  imageStrategy?: QuestionImageStrategy;
}

export interface ImageAnswerChoiceQuestion extends BaseQuestion {
  kind: 'image-answer-choice';
  options: WordRecord[];
  correctAnswer: string;
  imageStrategy: 'related-priority';
}

export interface FillBlankQuestion extends BaseQuestion {
  kind: 'fill-blank';
  maskedCharacters: string[];
  missingLetters: string[];
  keyboardLetters: string[];
}

export type Question = RecognitionQuestion | ChoiceQuestion | ImageAnswerChoiceQuestion | FillBlankQuestion;

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
  return /^[A-Za-z\- '\/]+$/.test(studyText) && studyText.replace(/[^A-Za-z]/g, '').length >= 1;
}

function buildDistractors(word: WordRecord, allWords: WordRecord[]): WordRecord[] {
  const sameCategory = allWords.filter(
    (candidate) => candidate.id !== word.id && candidate.category === word.category && candidate.chinese !== word.chinese
  );
  const sameDifficulty = allWords.filter(
    (candidate) =>
      candidate.id !== word.id
      && Math.abs(candidate.difficulty - word.difficulty) <= 1
      && candidate.chinese !== word.chinese
  );
  const pool = shuffle([
    ...sameCategory,
    ...sameDifficulty,
    ...allWords.filter((candidate) => candidate.id !== word.id),
  ]);
  const uniqueByChinese = new Map<string, WordRecord>();
  for (const candidate of pool) {
    if (!uniqueByChinese.has(candidate.chinese)) {
      uniqueByChinese.set(candidate.chinese, candidate);
    }
  }
  return [...uniqueByChinese.values()].slice(0, 3);
}

function buildRecognitionQuestion(word: WordRecord): RecognitionQuestion {
  return {
    kind: 'recognition',
    prompt: '这个单词你认识吗？',
    studyText: getStudyText(word),
    word,
    options: ['认识', '不认识'],
    correctAnswer: '认识',
    imageStrategy: 'comfy',
  };
}

function buildChoiceQuestion(
  kind: 'image-choice' | 'text-choice',
  word: WordRecord,
  allWords: WordRecord[],
  imageStrategy?: QuestionImageStrategy,
): ChoiceQuestion {
  const options = shuffle([word.chinese, ...buildDistractors(word, allWords).map((candidate) => candidate.chinese)]);
  return {
    kind,
    prompt: kind === 'image-choice' ? '看看图片，选出正确中文' : '看看英文，选出正确中文',
    studyText: getStudyText(word),
    word,
    options,
    correctAnswer: word.chinese,
    imageStrategy,
  };
}

function buildImageAnswerChoiceQuestion(word: WordRecord, allWords: WordRecord[]): ImageAnswerChoiceQuestion {
  return {
    kind: 'image-answer-choice',
    prompt: '看看英文，选出正确图片',
    studyText: getStudyText(word),
    word,
    options: shuffle([word, ...buildDistractors(word, allWords)]),
    correctAnswer: word.id,
    imageStrategy: 'related-priority',
  };
}

function getAlphabeticRuns(letters: string[]): number[][] {
  const runs: number[][] = [];
  let current: number[] = [];
  letters.forEach((character, index) => {
    if (/[A-Za-z]/.test(character)) {
      current.push(index);
      return;
    }
    if (current.length > 0) runs.push(current);
    current = [];
  });
  if (current.length > 0) runs.push(current);
  return runs;
}

function chooseContiguousIndices(letters: string[], minimum: number, maximum: number): number[] {
  const runs = getAlphabeticRuns(letters);
  const longestRunLength = Math.max(...runs.map((run) => run.length), 0);
  const upper = Math.min(maximum, longestRunLength);
  const lower = Math.min(minimum, upper);
  const count = lower + Math.floor(Math.random() * Math.max(1, upper - lower + 1));
  const candidates = runs.filter((run) => run.length >= count);
  const run = candidates[Math.floor(Math.random() * candidates.length)] ?? [];
  const start = Math.floor(Math.random() * Math.max(1, run.length - count + 1));
  return run.slice(start, start + count);
}

function buildFillBlankQuestion(
  word: WordRecord,
  mode: 'one-two' | 'three-four' | 'five-ten' | 'full',
): FillBlankQuestion {
  const studyText = getStudyText(word);
  const letters = [...studyText];
  const alphaIndices = letters
    .map((character, index) => ({ character, index }))
    .filter(({ character }) => /[A-Za-z]/.test(character))
    .map(({ index }) => index);
  const chosenIndices = mode === 'full'
    ? alphaIndices
    : mode === 'one-two'
      ? chooseContiguousIndices(letters, 1, 2)
      : mode === 'three-four'
        ? chooseContiguousIndices(letters, 3, 4)
        : chooseContiguousIndices(letters, 5, 10);
  const chosenIndexSet = new Set(chosenIndices);
  const maskedCharacters = letters.map((character, index) => chosenIndexSet.has(index) ? '_' : character);
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
  setting: ParentSetting = defaultParentSetting,
): Question {
  const masteryLevel = record?.masteryLevel ?? 0;
  if (masteryLevel <= 0) return buildRecognitionQuestion(word);
  if (masteryLevel === 1) {
    return buildChoiceQuestion(
      setting.showImages && word.imageApproved ? 'image-choice' : 'text-choice',
      word,
      allWords,
      'comfy',
    );
  }
  if (masteryLevel === 2) {
    return buildChoiceQuestion('image-choice', word, allWords, 'related-priority');
  }
  if (masteryLevel === 3) return buildImageAnswerChoiceQuestion(word, allWords);
  if (masteryLevel === 4 || !canUseFillBlank(word)) return buildChoiceQuestion('text-choice', word, allWords);
  if (masteryLevel === 5) return buildFillBlankQuestion(word, 'one-two');
  if (masteryLevel === 6) return buildFillBlankQuestion(word, 'three-four');
  if (masteryLevel === 7) return buildFillBlankQuestion(word, 'five-ten');
  return buildFillBlankQuestion(word, 'full');
}

export function getCorrectAnswer(question: Question): string {
  if (question.kind === 'fill-blank') return question.missingLetters.join('');
  return question.correctAnswer;
}

export function isCorrectAnswer(question: Question, answer: string): boolean {
  return getCorrectAnswer(question).toLowerCase() === answer.trim().toLowerCase();
}
