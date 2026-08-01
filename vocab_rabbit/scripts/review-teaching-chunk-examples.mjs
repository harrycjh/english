import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  repairTranslationFocus,
  sentenceUsesChunk,
} from './generate-teaching-chunk-examples.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultVocabularyPath = path.join(root, 'public/content/words/ket_vocabulary.json');
const defaultExamplesPath = path.join(root, 'tmp/teaching-chunk-examples.json');
const defaultOutputPath = path.join(root, 'tmp/teaching-chunk-example-review.json');
const endpoint = process.env.LM_STUDIO_URL ?? 'http://127.0.0.1:1234/v1/chat/completions';
const model = process.env.CHUNK_EXAMPLE_REVIEW_MODEL ?? 'google/gemma-4-26b-a4b-qat';

function parseArguments(argv) {
  const options = {
    vocabularyPath: defaultVocabularyPath,
    examplesPath: defaultExamplesPath,
    outputPath: defaultOutputPath,
    batchSize: 16,
    limit: Number.POSITIVE_INFINITY,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--vocabulary') options.vocabularyPath = path.resolve(argv[++index]);
    else if (value === '--examples') options.examplesPath = path.resolve(argv[++index]);
    else if (value === '--output') options.outputPath = path.resolve(argv[++index]);
    else if (value === '--batch-size') options.batchSize = Number(argv[++index]);
    else if (value === '--limit') options.limit = Number(argv[++index]);
  }
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 24) {
    throw new Error('--batch-size must be an integer from 1 to 24');
  }
  return options;
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function reviewKey(id, index) {
  return `${id}::${index}`;
}

export function collectQwenExamples(vocabulary, examplePayload) {
  const words = new Map(vocabulary.words.map((word) => [word.id, word]));
  const targets = [];
  for (const entry of examplePayload.entries ?? []) {
    const word = words.get(entry.id);
    if (!word) continue;
    const chunks = (word.teachingChunks ?? []).slice(0, 3);
    for (const [index, example] of (entry.examples ?? []).entries()) {
      if (example.sentenceSource !== 'qwen') continue;
      const chunk = chunks[index];
      if (!chunk) continue;
      targets.push({
        key: reviewKey(entry.id, index),
        id: entry.id,
        index,
        headword: word.english,
        headwordChinese: (word.studySense ?? word).chinese,
        partOfSpeech: (word.studySense ?? word).partOfSpeech,
        phrase: chunk.phrase,
        phraseChinese: chunk.chinese,
        sense: chunk.sense,
        cefr: chunk.cefr,
        sentence: example.sentence,
        translation: example.translation,
        translationFocus: example.translationFocus,
      });
    }
  }
  return targets;
}

export function deterministicReview(target) {
  const issues = [];
  const sentence = normalizeText(target.sentence);
  const translation = normalizeText(target.translation);
  const focus = normalizeText(target.translationFocus);
  const words = sentence.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g) ?? [];
  if (!sentenceUsesChunk(sentence, target.phrase)) issues.push('missing_chunk');
  if (words.length < 4 || words.length > 18) issues.push('sentence_length');
  if (!/^[A-Z"']/u.test(sentence) || !/[.!?]"?$/u.test(sentence)) issues.push('english_format');
  if (!/[\u3400-\u9fff]/u.test(translation)) issues.push('missing_chinese');
  if (!/[。！？][”"']?$/u.test(translation)) issues.push('chinese_format');
  if (!focus || !translation.includes(focus)) issues.push('focus_mismatch');
  return issues;
}

function normalizeReviewedItem(target, response) {
  const verdict = response.verdict === 'revise' ? 'revise' : 'pass';
  const sentence = verdict === 'pass' ? target.sentence : normalizeText(response.sentence);
  const translation = verdict === 'pass' ? target.translation : normalizeText(response.translation);
  const translationFocus = verdict === 'pass'
    ? target.translationFocus
    : repairTranslationFocus(translation, response.translationFocus);
  return {
    ...target,
    verdict,
    issues: Array.isArray(response.issues) ? response.issues.map(normalizeText).filter(Boolean) : [],
    reviewedSentence: sentence,
    reviewedTranslation: translation,
    reviewedTranslationFocus: translationFocus,
    deterministicIssues: deterministicReview({
      ...target,
      sentence,
      translation,
      translationFocus,
    }),
  };
}

async function requestReview(items) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.05,
      max_tokens: Math.max(1800, items.length * 320),
      reasoning_effort: 'none',
      messages: [
        {
          role: 'system',
          content: [
            'You are the independent final editor for a child English-learning app.',
            'Review every supplied English example, its Simplified Chinese translation, and translation focus.',
            'Use verdict pass only when all of these are true: the sentence naturally demonstrates the supplied fixed expression and sense; the English is idiomatic and age-appropriate for TOEFL Primary or Junior; the Chinese fully preserves subject, tense, negation, number, and meaning; and translationFocus is the shortest contiguous phrase copied from the translation that expresses the fixed expression.',
            'Use revise for awkward wording, forced collocations, semantic mismatch, incomplete or literal translation, adult or unsuitable content, or an incorrect focus.',
            'For revise, minimally rewrite the example and translation. The revised English must contain the fixed expression, allowing normal inflection and placeholder replacement, and be 4-18 words.',
            'For pass, return the supplied sentence, translation, and translationFocus unchanged.',
            'Return every item exactly once and preserve key, id, index, and phrase.',
          ].join(' '),
        },
        { role: 'user', content: JSON.stringify({ items }) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'teaching_chunk_example_review',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              items: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    key: { type: 'string' },
                    id: { type: 'string' },
                    index: { type: 'integer' },
                    phrase: { type: 'string' },
                    verdict: { type: 'string', enum: ['pass', 'revise'] },
                    issues: { type: 'array', items: { type: 'string' } },
                    sentence: { type: 'string' },
                    translation: { type: 'string' },
                    translationFocus: { type: 'string' },
                  },
                  required: [
                    'key', 'id', 'index', 'phrase', 'verdict', 'issues',
                    'sentence', 'translation', 'translationFocus',
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ['items'],
            additionalProperties: false,
          },
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`LM Studio returned ${response.status}: ${await response.text()}`);
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error(`LM Studio returned no content: ${JSON.stringify(body).slice(0, 800)}`);
  return JSON.parse(content).items ?? [];
}

async function reviewBatch(targets) {
  let pending = [...targets];
  const accepted = new Map();
  const lastInvalidByKey = new Map();
  for (let attempt = 1; attempt <= 3 && pending.length > 0; attempt += 1) {
    const responses = await requestReview(pending);
    const responseByKey = new Map(responses.map((item) => [item.key, item]));
    const nextPending = [];
    for (const target of pending) {
      const response = responseByKey.get(target.key);
      if (!response || response.id !== target.id || response.index !== target.index || response.phrase !== target.phrase) {
        nextPending.push(target);
        continue;
      }
      const normalized = normalizeReviewedItem(target, response);
      if (normalized.deterministicIssues.length > 0) {
        lastInvalidByKey.set(target.key, normalized);
        nextPending.push({
          ...target,
          correction: normalized.deterministicIssues.join(', '),
        });
        continue;
      }
      accepted.set(target.key, normalized);
    }
    pending = nextPending;
    if (pending.length > 0) console.warn(`Review retry ${attempt}/3 for ${pending.length} items`);
  }
  if (pending.length > 0) {
    for (const target of pending) {
      const invalid = lastInvalidByKey.get(target.key);
      accepted.set(target.key, {
        ...target,
        verdict: 'manual',
        issues: [
          'reviewer_output_failed_validation',
          ...(invalid?.issues ?? []),
          ...(invalid?.deterministicIssues ?? []),
        ],
        reviewedSentence: target.sentence,
        reviewedTranslation: target.translation,
        reviewedTranslationFocus: target.translationFocus,
        deterministicIssues: [],
      });
    }
  }
  return [...accepted.values()];
}

async function readCheckpoint(outputPath) {
  try {
    const payload = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    return new Map((payload.items ?? []).map((item) => [item.key, item]));
  } catch (error) {
    if (error.code === 'ENOENT') return new Map();
    throw error;
  }
}

async function saveCheckpoint(outputPath, itemsByKey, total) {
  const items = [...itemsByKey.values()].sort((left, right) => left.key.localeCompare(right.key));
  const revised = items.filter((item) => item.verdict === 'revise').length;
  const manual = items.filter((item) => item.verdict === 'manual').length;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify({
    schemaVersion: 1,
    reviewedAt: new Date().toISOString(),
    model,
    stats: {
      total,
      reviewed: items.length,
      passed: items.length - revised - manual,
      revised,
      manual,
    },
    items,
  }, null, 2)}\n`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const [vocabulary, examplePayload] = await Promise.all([
    fs.readFile(options.vocabularyPath, 'utf8').then(JSON.parse),
    fs.readFile(options.examplesPath, 'utf8').then(JSON.parse),
  ]);
  const allTargets = collectQwenExamples(vocabulary, examplePayload);
  const targets = allTargets.slice(0, options.limit);
  const checkpoint = await readCheckpoint(options.outputPath);
  const pending = targets.filter((target) => !checkpoint.has(target.key));
  const deterministicFailures = targets.filter((target) => deterministicReview(target).length > 0);
  console.log(`Qwen examples: ${targets.length}; deterministic failures: ${deterministicFailures.length}; pending semantic review: ${pending.length}`);
  for (let offset = 0; offset < pending.length; offset += options.batchSize) {
    const batch = pending.slice(offset, offset + options.batchSize);
    const reviewed = await reviewBatch(batch);
    for (const item of reviewed) checkpoint.set(item.key, item);
    await saveCheckpoint(options.outputPath, checkpoint, targets.length);
    console.log(`Review progress: ${Math.min(offset + batch.length, pending.length)}/${pending.length}; saved ${checkpoint.size}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
