import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = path.join(root, 'design-output/related-media-semantic-audit/report.json');
const outputPath = path.join(root, 'design-output/related-media-semantic-audit/adjudication.json');
const checkpointPath = path.join(root, 'tmp/related-media-semantic-audit/adjudication-checkpoint.json');
const endpoint = process.env.LM_STUDIO_URL ?? 'http://127.0.0.1:1234/v1/chat/completions';
const model = process.env.SEMANTIC_ADJUDICATION_MODEL ?? 'google/gemma-4-26b-a4b-qat';
const batchSize = Number(process.env.SEMANTIC_ADJUDICATION_BATCH_SIZE ?? 30);
const restart = process.argv.includes('--restart');

async function request(items) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: Math.max(900, items.length * 70),
      reasoning_effort: 'none',
      messages: [
        {
          role: 'system',
          content: [
            'You are the second-pass adjudicator for a children vocabulary app.',
            'The first model flagged each related-book sentence as a possible word-sense mismatch.',
            'Return confirmed_mismatch only when the sentence clearly uses another lexical sense, part of speech, proper name, or fixed expression not covered by the Chinese study meaning.',
            'Return aligned when the exact usage is reasonably covered by any listed Chinese study meaning or part of speech.',
            'Inflection and regional spelling variants do not create a mismatch.',
            'Compound words are mismatches when the compound changes the taught meaning, such as Father Christmas for father, kid goat for child, dead end for dead, or date fruit for calendar date.',
            'Return uncertain when context or the Chinese gloss is insufficient. Return every key exactly once.',
            'Keep reasons under 16 words.',
          ].join(' '),
        },
        { role: 'user', content: JSON.stringify({ items }) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'related_media_semantic_adjudication',
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
                    verdict: { type: 'string', enum: ['confirmed_mismatch', 'aligned', 'uncertain'] },
                    reason: { type: 'string' },
                  },
                  required: ['key', 'verdict', 'reason'],
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
  if (!response.ok) throw new Error(`${model} returned ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  return JSON.parse(payload.choices?.[0]?.message?.content ?? '{}').items ?? [];
}

async function requestWithRetry(items) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const results = await request(items);
      const byKey = new Map(results.map((result) => [result.key, result]));
      const missing = items.filter((item) => !byKey.has(item.key));
      if (missing.length > 0 && missing.length < items.length) {
        for (const result of await requestWithRetry(missing)) byKey.set(result.key, result);
      } else if (missing.length > 0) {
        throw new Error(`Model omitted ${missing.map((item) => item.key).join(', ')}`);
      }
      return items.map((item) => byKey.get(item.key));
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  throw lastError;
}

async function loadCheckpoint() {
  if (restart) return { schemaVersion: 1, model, results: {} };
  try {
    const checkpoint = JSON.parse(await fs.readFile(checkpointPath, 'utf8'));
    return checkpoint.model === model ? checkpoint : { schemaVersion: 1, model, results: {} };
  } catch (error) {
    if (error.code === 'ENOENT') return { schemaVersion: 1, model, results: {} };
    throw error;
  }
}

async function save(targets, checkpoint) {
  const results = targets
    .filter((target) => checkpoint.results[target.key])
    .map((target) => ({ ...target, ...checkpoint.results[target.key] }));
  const summary = {
    generatedAt: new Date().toISOString(),
    model,
    targets: targets.length,
    reviewed: results.length,
    confirmedMismatch: results.filter((item) => item.verdict === 'confirmed_mismatch').length,
    aligned: results.filter((item) => item.verdict === 'aligned').length,
    uncertain: results.filter((item) => item.verdict === 'uncertain').length,
  };
  await fs.mkdir(path.dirname(checkpointPath), { recursive: true });
  await fs.writeFile(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
  await fs.writeFile(outputPath, `${JSON.stringify({ schemaVersion: 1, summary, results }, null, 2)}\n`);
  return summary;
}

async function main() {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 40) {
    throw new Error('SEMANTIC_ADJUDICATION_BATCH_SIZE must be 1 to 40');
  }
  const report = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  const targets = report.results
    .filter((item) => item.status === 'mismatch')
    .map((item) => ({
      key: item.key,
      source: item.source,
      headword: item.headword,
      studyPartOfSpeech: item.studyPartOfSpeech,
      studyChinese: item.studyChinese,
      studyExample: item.studyExample,
      matchedTerm: item.matchedTerm,
      matchedForm: item.matchedForm,
      sentence: item.sentence,
      sentenceTranslation: item.sentenceTranslation,
      sourceLabel: item.sourceLabel,
    }));
  const checkpoint = await loadCheckpoint();
  const pending = targets.filter((target) => !checkpoint.results[target.key]);
  console.log(JSON.stringify({ model, targets: targets.length, cached: targets.length - pending.length, pending: pending.length }, null, 2));
  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const batch = pending.slice(offset, offset + batchSize);
    for (const result of await requestWithRetry(batch)) checkpoint.results[result.key] = result;
    const summary = await save(targets, checkpoint);
    console.log(`${Math.min(offset + batch.length, pending.length)}/${pending.length}: ${summary.confirmedMismatch} confirmed`);
  }
  console.log(JSON.stringify(await save(targets, checkpoint), null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
