import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '../config/app-meta';
import { getWordPayloadUrl } from './word-service';

describe('getWordPayloadUrl', () => {
  it('adds the app version to avoid stale cached vocabulary payloads', () => {
    expect(getWordPayloadUrl()).toBe(`/content/words/ket_vocabulary.json?v=${APP_VERSION}`);
  });
});
