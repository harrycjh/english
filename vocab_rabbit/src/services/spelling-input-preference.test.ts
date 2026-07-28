import { describe, expect, it } from 'vitest';
import {
  loadSpellingInputMethod,
  saveSpellingInputMethod,
  SPELLING_INPUT_METHOD_STORAGE_KEY,
} from './spelling-input-preference';

describe('spelling input preference', () => {
  it('defaults to keyboard input', () => {
    expect(loadSpellingInputMethod(null)).toBe('keyboard');
    expect(loadSpellingInputMethod({ getItem: () => 'unknown' })).toBe('keyboard');
  });

  it('loads and saves the selected input method', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    saveSpellingInputMethod('handwriting', storage);

    expect(values.get(SPELLING_INPUT_METHOD_STORAGE_KEY)).toBe('handwriting');
    expect(loadSpellingInputMethod(storage)).toBe('handwriting');
  });
});
