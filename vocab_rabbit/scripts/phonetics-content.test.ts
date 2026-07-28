import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

type VocabularyWord = {
  english: string;
  phonetic?: string;
};

const payload = JSON.parse(
  fs.readFileSync(new URL('../public/content/words/ket_vocabulary.json', import.meta.url), 'utf8'),
) as { words: VocabularyWord[] };

function phoneticFor(english: string) {
  return payload.words.find((word) => word.english === english)?.phonetic;
}

describe('American English phonetics', () => {
  it('provides a phonetic transcription for every word', () => {
    expect(payload.words.every((word) => /^\/.+\/$/u.test(word.phonetic ?? ''))).toBe(true);
  });

  it('uses American pronunciations for words with clear regional differences', () => {
    expect(phoneticFor('tomato')).toBe('/təˈmeɪɾoʊ/');
    expect(phoneticFor('class')).toBe('/ˈklæs/');
    expect(phoneticFor('answer')).toBe('/ˈænsɚ/');
  });
});
