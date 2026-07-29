import type { WordRecord } from '../models/word';
import {
  getExampleSentences,
  getExampleTranslationFocus,
  getExampleTranslations,
} from './example-service';
import { getTokenForms } from './english-inflection-service';

const HEADWORD_OVERRIDES: Record<string, string> = {
  'barbecue/barbeque': 'barbecue',
  'cafe/café': 'cafe',
  'examination/exam': 'exam',
  'at / @': 'at',
  'v/versus': 'versus',
  'centre/center': 'centre',
  'centimetre/centimeter (cm)': 'centimetre',
  'lots / a lot': 'a lot',
  'a/an': 'an',
  'all right/alright': 'all right',
  'OK/okay': 'OK',
  'give somebody a call/ring': 'give me a call',
  'gram(me)': 'gram',
  'prefer / would prefer': 'prefer',
  'poor thing/you': 'poor thing',
  'television (TV)': 'TV',
};

export interface ExampleCloze {
  sentence: string;
  translation: string;
  translationFocus: string;
  maskedSentence: string;
  matchedText: string;
}

function getHeadword(english: string): string {
  return HEADWORD_OVERRIDES[english] ?? english
    .replace(/\s+\([^)]*\)$/g, '')
    .replace(/\(([^)]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPhraseForms(english: string): string[] {
  const headword = getHeadword(english);
  const normalized = headword.replace(/-/g, ' ');
  const words = normalized.split(/\s+/);
  const forms = new Set([headword, normalized, words.join('-')]);
  for (const first of getTokenForms(words[0])) {
    forms.add([first, ...words.slice(1)].join(' '));
  }
  if (words.length > 1) {
    for (const last of getTokenForms(words.at(-1)!)) {
      forms.add([...words.slice(0, -1), last].join(' '));
    }
  }
  return [...forms].sort((left, right) => right.length - left.length);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildExampleCloze(word: WordRecord, preferredIndex = 0): ExampleCloze | null {
  const sentences = getExampleSentences(word);
  const index = Math.max(0, Math.min(preferredIndex, sentences.length - 1));
  const sentence = sentences[index];
  if (!sentence) return null;
  const translation = getExampleTranslations(word)[index] ?? '';
  const translationFocus = getExampleTranslationFocus(word)[index] ?? '';

  for (const form of getPhraseForms(word.english)) {
    const pattern = escapeRegExp(form).replace(/(?:\\ |\\-)+/g, '[\\s-]+');
    const match = new RegExp(`(^|[^A-Za-z])(${pattern})(?=$|[^A-Za-z])`, 'i').exec(sentence);
    if (!match || match.index === undefined) continue;
    const start = match.index + match[1].length;
    const matchedText = match[2];
    return {
      sentence,
      translation,
      translationFocus,
      matchedText,
      maskedSentence: `${sentence.slice(0, start)}_____${sentence.slice(start + matchedText.length)}`,
    };
  }

  return null;
}
