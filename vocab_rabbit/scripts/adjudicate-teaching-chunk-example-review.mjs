import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { deterministicReview } from './review-teaching-chunk-examples.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultReviewPath = path.join(root, 'tmp/teaching-chunk-example-review.json');
const defaultOutputPath = path.join(root, 'tmp/teaching-chunk-example-adjudication.json');
const endpoint = process.env.LM_STUDIO_URL ?? 'http://127.0.0.1:1234/v1/chat/completions';
const model = process.env.CHUNK_EXAMPLE_ADJUDICATOR_MODEL ?? 'qwen/qwen3.6-27b';

function parseArguments(argv) {
  const options = {
    reviewPath: defaultReviewPath,
    outputPath: defaultOutputPath,
    batchSize: 16,
    limit: Number.POSITIVE_INFINITY,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--review') options.reviewPath = path.resolve(argv[++index]);
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

export function collectAdjudicationTargets(review) {
  return (review.items ?? []).filter((item) => item.verdict !== 'pass');
}

export function normalizeAdjudication(target, response) {
  const decision = ['original', 'revision', 'rewrite'].includes(response?.decision)
    ? response.decision
    : 'original';
  const selected = decision === 'original'
    ? {
        sentence: target.sentence,
        translation: target.translation,
        translationFocus: target.translationFocus,
      }
    : decision === 'revision'
      ? {
          sentence: target.reviewedSentence,
          translation: target.reviewedTranslation,
          translationFocus: target.reviewedTranslationFocus,
        }
      : {
          sentence: normalizeText(response.sentence),
          translation: normalizeText(response.translation),
          translationFocus: normalizeText(response.translationFocus),
        };
  const validationIssues = deterministicReview({ ...target, ...selected });
  if (validationIssues.length > 0) {
    return {
      ...target,
      decision: 'manual',
      adjudicationReason: normalizeText(response?.reason),
      finalSentence: target.sentence,
      finalTranslation: target.translation,
      finalTranslationFocus: target.translationFocus,
      validationIssues,
    };
  }
  return {
    ...target,
    decision,
    adjudicationReason: normalizeText(response.reason),
    finalSentence: selected.sentence,
    finalTranslation: selected.translation,
    finalTranslationFocus: selected.translationFocus,
    validationIssues: [],
  };
}

async function requestAdjudication(items) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.05,
      max_tokens: Math.max(1800, items.length * 340),
      reasoning_effort: 'none',
      messages: [
        {
          role: 'system',
          content: [
            'You are the final adjudicator for child-friendly English examples.',
            'Compare each original example with the independent reviewer revision.',
            'Choose original when the original is already natural and accurate or the revision is not a real improvement.',
            'Choose revision only when it clearly fixes grammar, idiomatic English, fixed-expression sense, Chinese completeness, or translationFocus accuracy without introducing a new problem.',
            'Choose rewrite only when both versions are inadequate, then provide a minimal correct version.',
            'The final English must naturally demonstrate the supplied phrase and sense, allowing normal inflection, and stay suitable for TOEFL Primary or Junior.',
            'The final Chinese must completely match the English. translationFocus must be the shortest contiguous phrase copied from the Chinese translation that expresses the fixed expression.',
            'Do not reject a correct British expression merely because another variety is more common.',
            'Return every item exactly once and preserve key.',
          ].join(' '),
        },
        { role: 'user', content: JSON.stringify({ items }) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'teaching_chunk_example_adjudication',
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
                    decision: { type: 'string', enum: ['original', 'revision', 'rewrite'] },
                    reason: { type: 'string' },
                    sentence: { type: 'string' },
                    translation: { type: 'string' },
                    translationFocus: { type: 'string' },
                  },
                  required: ['key', 'decision', 'reason', 'sentence', 'translation', 'translationFocus'],
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

async function adjudicateBatch(targets) {
  const responseByKey = new Map((await requestAdjudication(targets)).map((item) => [item.key, item]));
  return targets.map((target) => {
    const response = responseByKey.get(target.key);
    if (!response) {
      return {
        ...target,
        decision: 'manual',
        adjudicationReason: 'missing adjudicator response',
        finalSentence: target.sentence,
        finalTranslation: target.translation,
        finalTranslationFocus: target.translationFocus,
        validationIssues: [],
      };
    }
    return normalizeAdjudication(target, response);
  });
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
  const decisions = items.reduce((counts, item) => {
    counts[item.decision] = (counts[item.decision] ?? 0) + 1;
    return counts;
  }, {});
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify({
    schemaVersion: 1,
    adjudicatedAt: new Date().toISOString(),
    model,
    stats: { total, adjudicated: items.length, decisions },
    items,
  }, null, 2)}\n`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const review = JSON.parse(await fs.readFile(options.reviewPath, 'utf8'));
  const targets = collectAdjudicationTargets(review).slice(0, options.limit);
  const checkpoint = await readCheckpoint(options.outputPath);
  const pending = targets.filter((target) => !checkpoint.has(target.key));
  console.log(`Adjudication targets: ${targets.length}; pending: ${pending.length}`);
  for (let offset = 0; offset < pending.length; offset += options.batchSize) {
    const batch = pending.slice(offset, offset + options.batchSize);
    const adjudicated = await adjudicateBatch(batch);
    for (const item of adjudicated) checkpoint.set(item.key, item);
    await saveCheckpoint(options.outputPath, checkpoint, targets.length);
    console.log(`Adjudication progress: ${Math.min(offset + batch.length, pending.length)}/${pending.length}; saved ${checkpoint.size}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
