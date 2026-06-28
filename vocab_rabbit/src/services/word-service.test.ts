import { describe, expect, it } from 'vitest';
import { APP_VERSION, CONTENT_VERSION } from '../config/app-meta';
import { getWordImageUrl, getWordPayloadUrl } from './word-service';

describe('getWordPayloadUrl', () => {
  it('adds the app version to avoid stale cached vocabulary payloads', () => {
    expect(getWordPayloadUrl()).toBe(`/content/words/ket_vocabulary.json?v=${APP_VERSION}`);
  });
});

describe('getWordImageUrl', () => {
  it('adds the deployed content version so replaced images bypass stale caches', () => {
    expect(getWordImageUrl('/content/images/words/ket_dad_n.webp')).toBe(
      `/content/images/words/ket_dad_n.webp?v=${CONTENT_VERSION}`,
    );
  });
});
