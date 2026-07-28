import { describe, expect, it } from 'vitest';
import { isSelectableEnglishVoice } from './audio-service';

describe('isSelectableEnglishVoice', () => {
  it.each([
    ['Daniel', 'en-GB'],
    ['Daniel (Enhanced)', 'en-GB'],
    ['Karen', 'en-AU'],
    ['Samantha', 'en-US'],
    ['Google UK English Female', 'en-GB'],
    ['Google US English', 'en-US'],
  ])('keeps the approved English voice %s (%s)', (name, lang) => {
    expect(isSelectableEnglishVoice({ name, lang })).toBe(true);
  });

  it.each([
    ['Daniel', 'en-US'],
    ['Karen', 'en-GB'],
    ['Bad News', 'en-US'],
    ['Ting-Ting', 'zh-CN'],
  ])('filters out the unapproved voice %s (%s)', (name, lang) => {
    expect(isSelectableEnglishVoice({ name, lang })).toBe(false);
  });
});
