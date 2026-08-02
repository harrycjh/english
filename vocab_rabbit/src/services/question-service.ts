import type { LearningRecord } from '../models/learning-record';
import { defaultParentSetting, type ParentSetting } from '../models/parent-setting';
import type { WordRecord } from '../models/word';
import { buildExampleCloze } from './example-cloze-service';
import {
  detectEnglishInflection,
  inflectEnglishOption,
} from './english-inflection-service';
import { getExampleSourceIndex, getNextExampleIndex } from './example-service';
import { getStudyChinese, getStudyPartOfSpeech, getStudyText } from './word-service';

export type QuestionKind =
  | 'recognition'
  | 'image-choice'
  | 'image-english-choice'
  | 'image-answer-choice'
  | 'text-choice'
  | 'sentence-choice'
  | 'letter-choice'
  | 'fill-blank';
export type QuestionImageStrategy = 'comfy' | 'related-priority' | 'life-photo';

interface BaseQuestion {
  kind: QuestionKind;
  prompt: string;
  studyText: string;
  word: WordRecord;
  exampleIndex?: number;
}

export interface RecognitionQuestion extends BaseQuestion {
  kind: 'recognition';
  options: ['认识', '不认识'];
  correctAnswer: '认识';
  imageStrategy: 'comfy';
}

export interface ChoiceQuestion extends BaseQuestion {
  kind: 'image-choice' | 'image-english-choice' | 'text-choice';
  options: string[];
  correctAnswer: string;
  imageStrategy?: QuestionImageStrategy;
}

export interface ImageAnswerChoiceQuestion extends BaseQuestion {
  kind: 'image-answer-choice';
  options: WordRecord[];
  correctAnswer: string;
  imageStrategy: 'comfy';
}

export interface SentenceChoiceQuestion extends BaseQuestion {
  kind: 'sentence-choice';
  sentence: string;
  sentenceTranslation: string;
  sentenceTranslationFocus: string;
  maskedSentence: string;
  options: string[];
  correctAnswer: string;
}

export interface LetterChoiceQuestion extends BaseQuestion {
  kind: 'letter-choice';
  maskedCharacters: string[];
  options: string[];
  correctAnswer: string;
}

export interface FillBlankQuestion extends BaseQuestion {
  kind: 'fill-blank';
  maskedCharacters: string[];
  missingLetters: string[];
  inputMode: 'partial' | 'full';
}

export type Question =
  | RecognitionQuestion
  | ChoiceQuestion
  | ImageAnswerChoiceQuestion
  | SentenceChoiceQuestion
  | LetterChoiceQuestion
  | FillBlankQuestion;

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
  const studyChinese = getStudyChinese(word);
  const sameCategory = allWords.filter(
    (candidate) => (
      candidate.id !== word.id
      && candidate.category === word.category
      && getStudyChinese(candidate) !== studyChinese
    )
  );
  const sameDifficulty = allWords.filter(
    (candidate) =>
      candidate.id !== word.id
      && Math.abs(candidate.difficulty - word.difficulty) <= 1
      && getStudyChinese(candidate) !== studyChinese
  );
  const pool = shuffle([
    ...sameCategory,
    ...sameDifficulty,
    ...allWords.filter((candidate) => candidate.id !== word.id),
  ]);
  const uniqueByChinese = new Map<string, WordRecord>();
  for (const candidate of pool) {
    const candidateChinese = getStudyChinese(candidate);
    if (!uniqueByChinese.has(candidateChinese)) {
      uniqueByChinese.set(candidateChinese, candidate);
    }
  }
  return [...uniqueByChinese.values()].slice(0, 3);
}

function buildEnglishDistractors(
  word: WordRecord,
  allWords: WordRecord[],
  limit: number = 3,
): WordRecord[] {
  const studyText = getStudyText(word).toLowerCase();
  const targetPartOfSpeech = getStudyPartOfSpeech(word);
  const partOfSpeechTags = new Set(targetPartOfSpeech.match(/[a-z]+/gi) ?? []);
  const sharesPartOfSpeech = (candidate: WordRecord) => {
    const candidateTags = getStudyPartOfSpeech(candidate).match(/[a-z]+/gi) ?? [];
    return candidateTags.some((tag) => partOfSpeechTags.has(tag));
  };
  const uniqueByEnglish = new Map<string, WordRecord>();
  const candidates = [
    ...buildDistractors(word, allWords).filter(sharesPartOfSpeech),
    ...shuffle(allWords.filter((candidate) => candidate.id !== word.id && sharesPartOfSpeech(candidate))),
    ...shuffle(allWords.filter((candidate) => candidate.id !== word.id)),
  ];
  for (const candidate of candidates) {
    const candidateText = getStudyText(candidate).toLowerCase();
    if (candidateText !== studyText && !uniqueByEnglish.has(candidateText)) {
      uniqueByEnglish.set(candidateText, candidate);
    }
    if (uniqueByEnglish.size >= limit) break;
  }
  return [...uniqueByEnglish.values()].slice(0, limit);
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
  const studyChinese = getStudyChinese(word);
  const options = shuffle([
    studyChinese,
    ...buildDistractors(word, allWords).map(getStudyChinese),
  ]);
  return {
    kind,
    prompt: kind === 'image-choice' ? '看看图片，选出正确中文' : '看看英文，选出正确中文',
    studyText: getStudyText(word),
    word,
    options,
    correctAnswer: studyChinese,
    imageStrategy,
  };
}

function buildImageEnglishChoiceQuestion(word: WordRecord, allWords: WordRecord[]): ChoiceQuestion {
  const studyText = getStudyText(word);
  return {
    kind: 'image-english-choice',
    prompt: '看看图片，选出正确英文',
    studyText,
    word,
    options: shuffle([studyText, ...buildEnglishDistractors(word, allWords).map(getStudyText)]),
    correctAnswer: studyText,
    imageStrategy: 'comfy',
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
    imageStrategy: 'comfy',
  };
}

function buildSentenceChoiceQuestion(
  word: WordRecord,
  allWords: WordRecord[],
  exampleIndex: number,
): SentenceChoiceQuestion | null {
  const cloze = buildExampleCloze(word, exampleIndex);
  if (!cloze) return null;
  const studyText = getStudyText(word);
  const inflection = detectEnglishInflection(
    studyText,
    cloze.matchedText,
    getStudyPartOfSpeech(word),
  );
  const capitalize = /^[A-Z]/.test(cloze.matchedText);
  const correctAnswer = cloze.matchedText;
  const uniqueOptions = new Map<string, string>([
    [correctAnswer.toLowerCase(), correctAnswer],
  ]);
  const wordsById = new Map(allWords.map((candidate) => [candidate.id, candidate]));
  const sourceExampleIndex = getExampleSourceIndex(word, exampleIndex);
  const curatedDistractors = (word.exampleDistractorIds?.[sourceExampleIndex] ?? [])
    .map((id) => wordsById.get(id))
    .filter((candidate): candidate is WordRecord => Boolean(candidate));
  for (const candidate of [
    ...curatedDistractors,
    ...buildEnglishDistractors(word, allWords, 40),
  ]) {
    const option = inflectEnglishOption(getStudyText(candidate), inflection, capitalize);
    const normalizedOption = option.toLowerCase();
    if (!uniqueOptions.has(normalizedOption)) uniqueOptions.set(normalizedOption, option);
    if (uniqueOptions.size >= 4) break;
  }
  const options = shuffle([
    ...uniqueOptions.values(),
  ]);
  return {
    kind: 'sentence-choice',
    prompt: '选择最适合这个例句的单词',
    studyText,
    word,
    sentence: cloze.sentence,
    sentenceTranslation: cloze.translation,
    sentenceTranslationFocus: cloze.translationFocus,
    maskedSentence: cloze.maskedSentence,
    options,
    correctAnswer,
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
  mode: 'two-four' | 'full',
): FillBlankQuestion {
  const studyText = getStudyText(word);
  const letters = [...studyText];
  const alphaIndices = letters
    .map((character, index) => ({ character, index }))
    .filter(({ character }) => /[A-Za-z]/.test(character))
    .map(({ index }) => index);
  const chosenIndices = mode === 'full'
    ? alphaIndices
    : chooseContiguousIndices(letters, 2, 4);
  const chosenIndexSet = new Set(chosenIndices);
  const maskedCharacters = letters.map((character, index) => chosenIndexSet.has(index) ? '_' : character);
  const missingLetters = chosenIndices.map((index) => letters[index]);
  return {
    kind: 'fill-blank',
    prompt: mode === 'full' ? '' : `${getStudyChinese(word)} 的英语怎么拼？`,
    studyText,
    word,
    maskedCharacters,
    missingLetters,
    inputMode: mode === 'full' ? 'full' : 'partial',
  };
}

function buildLetterChoiceQuestion(word: WordRecord): LetterChoiceQuestion {
  const studyText = getStudyText(word);
  const letters = [...studyText];
  const chosenIndices = chooseContiguousIndices(letters, 1, 2);
  const chosenIndexSet = new Set(chosenIndices);
  const missingLetters = chosenIndices.map((index) => letters[index]);
  const correctAnswer = missingLetters.join('');

  return {
    kind: 'letter-choice',
    prompt: getStudyChinese(word),
    studyText,
    word,
    maskedCharacters: letters.map((character, index) => chosenIndexSet.has(index) ? '_' : character),
    options: buildSimilarLetterOptions(correctAnswer),
    correctAnswer,
  };
}

const LETTER_NEIGHBORS: Record<string, string> = {
  a: 'qwsz',
  b: 'vghn',
  c: 'xdfv',
  d: 'serfcx',
  e: 'wsdr',
  f: 'drtgvc',
  g: 'ftyhbv',
  h: 'gyujnb',
  i: 'ujko',
  j: 'huikmn',
  k: 'jiolm',
  l: 'kopi',
  m: 'njk',
  n: 'bhjm',
  o: 'iklp',
  p: 'ol',
  q: 'wa',
  r: 'edft',
  s: 'awedxz',
  t: 'rfgy',
  u: 'yhji',
  v: 'cfgb',
  w: 'qase',
  x: 'zsdc',
  y: 'tghu',
  z: 'asx',
};

const LOOKALIKE_LETTERS: Record<string, string> = {
  b: 'dpq',
  c: 'o',
  d: 'bpq',
  g: 'q',
  i: 'lj',
  l: 'it',
  m: 'nw',
  n: 'm',
  o: 'cq',
  p: 'bdq',
  q: 'bdpg',
  u: 'v',
  v: 'u',
  w: 'm',
};

function preserveLetterCase(source: string, replacement: string): string {
  return source === source.toUpperCase() ? replacement.toUpperCase() : replacement;
}

export function buildSimilarLetterOptions(correctAnswer: string): string[] {
  const characters = [...correctAnswer];
  const options = new Set<string>([correctAnswer]);
  const candidatePools = characters.map((character) => {
    const lower = character.toLowerCase();
    return [...new Set(`${LOOKALIKE_LETTERS[lower] ?? ''}${LETTER_NEIGHBORS[lower] ?? ''}`)];
  });

  for (let attempt = 0; options.size < 4 && attempt < 80; attempt += 1) {
    const index = attempt % Math.max(1, characters.length);
    const pool = candidatePools[index];
    if (!pool || pool.length === 0) continue;
    const replacement = pool[Math.floor(attempt / Math.max(1, characters.length)) % pool.length];
    const candidate = [...characters];
    candidate[index] = preserveLetterCase(characters[index], replacement);
    options.add(candidate.join(''));
  }

  const fallbackAlphabet = 'abcdefghijklmnopqrstuvwxyz';
  for (const replacement of fallbackAlphabet) {
    if (options.size >= 4) break;
    const candidate = [...characters];
    candidate[0] = preserveLetterCase(characters[0], replacement);
    options.add(candidate.join(''));
  }
  return shuffle([...options]);
}

export function buildQuestion(
  word: WordRecord,
  allWords: WordRecord[],
  record: LearningRecord | undefined,
  setting: ParentSetting = defaultParentSetting,
): Question {
  const masteryLevel = record?.masteryLevel ?? 0;
  const exampleIndex = getNextExampleIndex(word);
  const withExampleIndex = <T extends Question>(question: T): T => ({
    ...question,
    exampleIndex,
  });
  if (masteryLevel <= 0) return withExampleIndex(buildRecognitionQuestion(word));
  if (masteryLevel === 1) {
    return withExampleIndex(buildChoiceQuestion(
      setting.showImages && word.imageApproved ? 'image-choice' : 'text-choice',
      word,
      allWords,
      'comfy',
    ));
  }
  if (masteryLevel === 2) return withExampleIndex(buildImageEnglishChoiceQuestion(word, allWords));
  if (masteryLevel === 3) return withExampleIndex(buildImageAnswerChoiceQuestion(word, allWords));
  if (masteryLevel === 4 || !canUseFillBlank(word)) {
    return withExampleIndex(buildChoiceQuestion('text-choice', word, allWords));
  }
  if (masteryLevel === 5) {
    return withExampleIndex(
      buildSentenceChoiceQuestion(word, allWords, exampleIndex)
        ?? buildChoiceQuestion('text-choice', word, allWords),
    );
  }
  if (masteryLevel === 6) return withExampleIndex(buildLetterChoiceQuestion(word));
  if (masteryLevel === 7) return withExampleIndex(buildFillBlankQuestion(word, 'two-four'));
  return withExampleIndex(buildFillBlankQuestion(word, 'full'));
}

export function getCorrectAnswer(question: Question): string {
  if (question.kind === 'fill-blank') return question.missingLetters.join('');
  if (question.kind === 'letter-choice') return question.correctAnswer;
  return question.correctAnswer;
}

export function isCorrectAnswer(question: Question, answer: string): boolean {
  return getCorrectAnswer(question).toLowerCase() === answer.trim().toLowerCase();
}
