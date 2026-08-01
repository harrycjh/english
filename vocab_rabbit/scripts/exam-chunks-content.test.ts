import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

interface ExamChunk {
  phrase: string;
  chinese: string;
  sense: string;
  type: string;
  cefr: string;
  sources: string[];
}

interface WordEntry {
  id: string;
  english: string;
  examChunks?: ExamChunk[];
  teachingChunks?: Array<ExamChunk & {
    usageFrequency: {
      zipf: number;
      selectionScore: number;
      source: 'wordfreq-estimate';
    };
  }>;
  examples?: string[];
  exampleTranslations?: string[];
  exampleTranslationFocus?: string[];
  exampleCollocations?: string[];
}

const payload = JSON.parse(fs.readFileSync(
  new URL('../public/content/words/ket_vocabulary.json', import.meta.url),
  'utf8',
)) as { words: WordEntry[] };

const allowedTypes = new Set([
  'phrasal_verb',
  'fixed_expression',
  'preposition_pattern',
  'idiom',
  'lexical_collocation',
  'sentence_frame',
  'conventional_compound',
]);
const allowedCefr = new Set(['A1', 'A2', 'B1', 'B2']);

function normalized(value: string) {
  return value
    .toLowerCase()
    .replace(/[_–—-]+/g, ' ')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function word(english: string) {
  const found = payload.words.find((entry) => entry.english === english);
  if (!found) throw new Error(`Missing vocabulary word: ${english}`);
  return found;
}

describe('exam chunk vocabulary content', () => {
  it('stores a reviewed chunk array for every vocabulary word', () => {
    expect(payload.words).toHaveLength(1693);
    expect(payload.words.every((entry) => Array.isArray(entry.examChunks))).toBe(true);
  });

  it('contains complete validated metadata without per-word duplicates', () => {
    for (const entry of payload.words) {
      const keys = new Set<string>();
      for (const chunk of entry.examChunks ?? []) {
        const key = normalized(chunk.phrase);
        expect(key, `${entry.id} has an empty phrase`).not.toBe('');
        expect(keys.has(key), `${entry.id} repeats ${chunk.phrase}`).toBe(false);
        keys.add(key);
        expect(chunk.chinese, `${entry.id}:${chunk.phrase} lacks Chinese`).toMatch(/[\u3400-\u9fff]/u);
        expect(chunk.sense, `${entry.id}:${chunk.phrase} lacks a sense`).not.toBe('');
        expect(allowedTypes.has(chunk.type), `${entry.id}:${chunk.phrase} has invalid type`).toBe(true);
        expect(allowedCefr.has(chunk.cefr), `${entry.id}:${chunk.phrase} has invalid CEFR`).toBe(true);
        expect(chunk.sources.length, `${entry.id}:${chunk.phrase} lacks evidence`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps representative exam chunks and rejects known free combinations', () => {
    const phrases = (english: string) => (
      (word(english).examChunks ?? []).map((chunk) => normalized(chunk.phrase))
    );
    expect(phrases('after')).toContain('look after');
    expect(phrases('after')).toContain('day after day');
    expect(phrases('good')).toContain('be good at');
    expect(phrases('can')).not.toContain('can swim');
    expect(phrases('can')).not.toContain('can help');
    expect(phrases('aunt')).not.toContain('young aunt');
  });

  it('stores at most ten frequency-ranked teaching chunks as a subset', () => {
    for (const entry of payload.words) {
      expect(Array.isArray(entry.teachingChunks), `${entry.id} lacks teachingChunks`).toBe(true);
      expect(entry.teachingChunks?.length ?? 0, `${entry.id} selects too many chunks`).toBeLessThanOrEqual(10);
      const examKeys = new Set((entry.examChunks ?? []).map((chunk) => normalized(chunk.phrase)));
      for (const chunk of entry.teachingChunks ?? []) {
        expect(examKeys.has(normalized(chunk.phrase)), `${entry.id}:${chunk.phrase} is not reviewed`).toBe(true);
        expect(Number.isFinite(chunk.usageFrequency.zipf)).toBe(true);
      }
    }
  });

  it('aligns the base example and up to three teaching-chunk examples', () => {
    for (const entry of payload.words.filter((wordEntry) => (wordEntry.teachingChunks?.length ?? 0) > 0)) {
      const expectedChunkCount = Math.min(3, entry.teachingChunks?.length ?? 0);
      expect(entry.examples, `${entry.id} lacks examples`).toHaveLength(expectedChunkCount + 1);
      expect(entry.exampleTranslations, `${entry.id} translation count differs`).toHaveLength(expectedChunkCount + 1);
      expect(entry.exampleTranslationFocus, `${entry.id} focus count differs`).toHaveLength(expectedChunkCount + 1);
      expect(entry.exampleCollocations, `${entry.id} collocation count differs`).toHaveLength(expectedChunkCount + 1);
      expect(entry.exampleCollocations?.[0], `${entry.id} base example should not be tagged`).toBe('');

      for (let index = 0; index < expectedChunkCount; index += 1) {
        const arrayIndex = index + 1;
        expect(normalized(entry.exampleCollocations?.[arrayIndex] ?? '')).toBe(
          normalized(entry.teachingChunks?.[index].phrase ?? ''),
        );
        const translation = entry.exampleTranslations?.[arrayIndex] ?? '';
        const focus = entry.exampleTranslationFocus?.[arrayIndex] ?? '';
        expect(translation, `${entry.id}:${arrayIndex} lacks a Chinese sentence`).toMatch(/[\u3400-\u9fff].*[。！？]$/u);
        expect(focus, `${entry.id}:${arrayIndex} lacks a focus`).not.toBe('');
        expect(translation.includes(focus), `${entry.id}:${arrayIndex} focus is not in translation`).toBe(true);
      }
    }
  });
});
