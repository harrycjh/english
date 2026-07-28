import { describe, expect, it } from 'vitest';
import {
  detectEnglishInflection,
  inflectEnglishOption,
} from './english-inflection-service';

describe('English answer-option inflection', () => {
  it('matches regular past tense across every answer option', () => {
    const inflection = detectEnglishInflection('discover', 'discovered', 'v');

    expect(inflection).toBe('past');
    expect(inflectEnglishOption('answer', inflection)).toBe('answered');
    expect(inflectEnglishOption('study', inflection)).toBe('studied');
    expect(inflectEnglishOption('stop', inflection)).toBe('stopped');
  });

  it('matches irregular past tense across every answer option', () => {
    const inflection = detectEnglishInflection('go', 'went', 'v');

    expect(inflection).toBe('past');
    expect(inflectEnglishOption('eat', inflection)).toBe('ate');
    expect(inflectEnglishOption('see', inflection)).toBe('saw');
    expect(inflectEnglishOption('take', inflection)).toBe('took');
  });

  it('supports participles, third-person verbs, and plural nouns', () => {
    expect(detectEnglishInflection('write', 'written', 'v')).toBe('past-participle');
    expect(inflectEnglishOption('take', 'past-participle')).toBe('taken');
    expect(detectEnglishInflection('study', 'studies', 'v')).toBe('third-person');
    expect(inflectEnglishOption('watch', 'third-person')).toBe('watches');
    expect(detectEnglishInflection('child', 'children', 'n')).toBe('plural');
    expect(inflectEnglishOption('woman', 'plural')).toBe('women');
  });

  it('inflects the first word in a phrasal verb and keeps sentence capitalization', () => {
    expect(inflectEnglishOption('wake up', 'past', true)).toBe('Woke up');
  });
});
