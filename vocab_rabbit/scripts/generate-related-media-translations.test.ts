import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./generate-related-media-translations.mjs', import.meta.url),
  'utf8',
);

describe('related-media translation model', () => {
  it('defaults to the configured text translation model', () => {
    expect(source).toContain(
      "process.env.LM_STUDIO_MODEL ?? 'qwen/qwen3.6-35b-a3b'",
    );
  });
});
