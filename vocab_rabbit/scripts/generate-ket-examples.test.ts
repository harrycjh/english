import { describe, expect, it } from 'vitest';
import {
  containsHeadword,
  findOxfordCandidate,
  getHeadword,
  isStoryDerivedExample,
  validateExample,
} from './generate-ket-examples.mjs';

const camera = {
  id: 'ket_camera_n',
  english: 'camera',
  partOfSpeech: 'n',
  chinese: '相机',
  category: '家用电器和电子设备',
  oxfordRefs: [{ level: 6, book: 3, page: 4 }],
};

describe('KET example generation', () => {
  it('normalizes parenthetical labels without removing phrase content', () => {
    expect(getHeadword('mum (n)')).toBe('mum');
    expect(getHeadword('grand(d)ad')).toBe('granddad');
    expect(getHeadword('barbecue/barbeque')).toBe('barbecue');
    expect(getHeadword('give somebody a call/ring')).toBe('give me a call');
  });

  it('checks the complete headword at word boundaries', () => {
    expect(containsHeadword('Biff had her camera.', 'camera')).toBe(true);
    expect(containsHeadword('It is raining outside.', 'rain')).toBe(true);
    expect(containsHeadword('The cat fell from the table.', 'fall')).toBe(true);
    expect(containsHeadword('He lay down to sleep.', 'lie down')).toBe(true);
    expect(containsHeadword('I like playing video games.', 'video game')).toBe(true);
    expect(containsHeadword('The team won the match.', 'win')).toBe(true);
    expect(containsHeadword('She became a teacher.', 'become')).toBe(true);
    expect(containsHeadword('We stayed at a guest house.', 'guest-house')).toBe(true);
    expect(containsHeadword('He is a well-known actor.', 'well known')).toBe(true);
    expect(containsHeadword('The cameraman waved.', 'camera')).toBe(false);
  });

  it('rejects shallow fallback templates and accepts a short natural sentence', () => {
    expect(validateExample(camera, 'I can see camera.').errors).toContain('fallback-template');
    expect(validateExample(camera, 'Mia took a photo with her camera.')).toMatchObject({ valid: true });
    expect(validateExample({ ...camera, english: 'swim' }, 'I can swim in the pool.').errors).toContain('fallback-template');
    expect(validateExample({ ...camera, english: 'anywhere' }, "I can't find my keys anywhere.")).toMatchObject({ valid: true });
    expect(validateExample({ ...camera, english: 'advanced' }, 'This is an advanced level course.').errors).toContain('fallback-template');
    expect(validateExample({ ...camera, english: 'better' }, 'This is better.').errors).toContain('fallback-template');
    expect(validateExample({ ...camera, english: 'far' }, "He said, 'My castle is too far away.'")).toMatchObject({ valid: true });
  });

  it('selects a short clean Oxford sentence containing the target word', () => {
    const books = new Map([['6:3', {
      pages: [{
        page_number: 4,
        text: 'xx _ noisy camera text. Biff had her camera. She took a photograph.',
      }],
    }]]);
    expect(findOxfordCandidate(camera, books)).toBe('Biff had her camera.');
  });

  it('marks copied, quoted, or story-specific examples for regeneration', () => {
    expect(isStoryDerivedExample({ example: 'Biff had her camera.', oxfordCandidate: 'Biff had her camera.' })).toBe(true);
    expect(isStoryDerivedExample({ id: 'ket_mum_n_br_eng', example: 'My mum is at home now.', oxfordCandidate: null })).toBe(false);
    expect(isStoryDerivedExample({ id: 'ket_dad_n', example: 'My dad is a teacher.', oxfordCandidate: null })).toBe(false);
    expect(isStoryDerivedExample({ example: 'The girl is reading a book.', oxfordCandidate: null })).toBe(false);
  });
});
