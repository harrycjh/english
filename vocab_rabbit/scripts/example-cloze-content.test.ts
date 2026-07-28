import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { WordPayload } from '../src/models/word';
import { buildExampleCloze } from '../src/services/example-cloze-service';

describe('KET sentence cloze coverage', () => {
  it('builds a validated cloze from a curated example for every vocabulary word', () => {
    const payload = JSON.parse(
      fs.readFileSync(new URL('../public/content/words/ket_vocabulary.json', import.meta.url), 'utf8'),
    ) as WordPayload;
    const failures = payload.words
      .filter((word) => !buildExampleCloze(word))
      .map((word) => `${word.id}: ${word.english}`);

    expect(failures, failures.slice(0, 20).join('\n')).toEqual([]);
  });

  it('stores a Chinese translation for every cloze sentence', () => {
    const payload = JSON.parse(
      fs.readFileSync(new URL('../public/content/words/ket_vocabulary.json', import.meta.url), 'utf8'),
    ) as WordPayload;
    const failures = payload.words.flatMap((word) => {
      const cloze = buildExampleCloze(word);
      return cloze?.translation && /[\u3400-\u9fff]/u.test(cloze.translation)
        ? []
        : [`${word.id}: ${word.english}`];
    });

    expect(failures, failures.slice(0, 20).join('\n')).toEqual([]);
  });

  it('stores an exact translated phrase to emphasize for every cloze sentence', () => {
    const payload = JSON.parse(
      fs.readFileSync(new URL('../public/content/words/ket_vocabulary.json', import.meta.url), 'utf8'),
    ) as WordPayload;
    const failures = payload.words.flatMap((word) => {
      const cloze = buildExampleCloze(word);
      return cloze?.translationFocus && cloze.translation.includes(cloze.translationFocus)
        ? []
        : [`${word.id}: ${word.english}`];
    });

    expect(failures, failures.slice(0, 20).join('\n')).toEqual([]);
  });
});
