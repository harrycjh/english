import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vocabularyPath = path.join(root, 'public/content/words/ket_vocabulary.json');
const defaultOutputPath = path.join(root, 'tmp/study-sense-example-alignment.json');
const endpoint = process.env.LM_STUDIO_URL ?? 'http://127.0.0.1:1234/v1/chat/completions';
const models = (process.env.STUDY_SENSE_REVIEW_MODELS ?? 'qwen/qwen3.6-27b,google/gemma-4-26b-a4b-qat')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const MANUAL_REJECT_KEYS = new Set([
  // The locked noun sense is "second place", not the ordinal phrase "second to last".
  'ket_second_adj_det_n::2',
]);

function parseArguments(argv) {
  const options = { outputPath: defaultOutputPath, batchSize: 24, apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--output') options.outputPath = path.resolve(argv[++index]);
    else if (value === '--batch-size') options.batchSize = Number(argv[++index]);
    else if (value === '--apply') options.apply = true;
  }
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 30) {
    throw new Error('--batch-size must be an integer from 1 to 30');
  }
  return options;
}

function keyFor(id, exampleIndex) {
  return `${id}::${exampleIndex}`;
}

export function collectStudySenseTargets(vocabulary) {
  return vocabulary.words.flatMap((word) => {
    if (!word.studySense?.examples?.length) return [];
    return (word.examples ?? []).flatMap((sentence, exampleIndex) => {
      if (exampleIndex === 0 || !word.exampleCollocations?.[exampleIndex]) return [];
      const chunk = (word.teachingChunks ?? []).find((item) => (
        item.phrase === word.exampleCollocations[exampleIndex]
      ));
      return [{
        key: keyFor(word.id, exampleIndex),
        id: word.id,
        exampleIndex,
        headword: word.english,
        studyPartOfSpeech: word.studySense.partOfSpeech,
        studyChinese: word.studySense.chinese,
        baseExample: word.studySense.examples[0],
        collocation: word.exampleCollocations[exampleIndex],
        collocationChinese: chunk?.chinese ?? '',
        collocationSense: chunk?.sense ?? '',
        sentence,
        translation: word.exampleTranslations?.[exampleIndex] ?? '',
      }];
    });
  });
}

async function requestVotes(model, items) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: Math.max(1200, items.length * 180),
      reasoning_effort: 'none',
      messages: [
        {
          role: 'system',
          content: [
            'You are a conservative word-sense editor for a child vocabulary app.',
            'Decide whether each candidate sentence teaches exactly the same headword sense and part of speech as the locked study sense.',
            'aligned=true only when the collocation and sentence preserve that exact sense, even if they add a common modifier or complement.',
            'aligned=false when the phrase changes part of speech, uses an idiom, phrasal verb, metaphor, named expression, or another dictionary sense.',
            'For example, noun can meaning a container is not aligned with modal can meaning ability; noun back meaning body part is not aligned with get back meaning return.',
            'When uncertain, return false. Return every key exactly once.',
          ].join(' '),
        },
        { role: 'user', content: JSON.stringify({ items }) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'study_sense_example_alignment',
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
                    aligned: { type: 'boolean' },
                    reason: { type: 'string' },
                  },
                  required: ['key', 'aligned', 'reason'],
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
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${model} returned no content`);
  return JSON.parse(content).items ?? [];
}

async function readCheckpoint(outputPath) {
  try {
    return JSON.parse(await fs.readFile(outputPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { schemaVersion: 1, models, votes: {} };
    throw error;
  }
}

function buildResults(targets, votes) {
  return targets.map((target) => {
    const modelVotes = models.map((model) => votes[model]?.[target.key]).filter(Boolean);
    return {
      ...target,
      votes: Object.fromEntries(modelVotes.map((vote) => [vote.model, {
        aligned: vote.aligned,
        reason: vote.reason,
      }])),
      aligned: !MANUAL_REJECT_KEYS.has(target.key)
        && modelVotes.length === models.length
        && modelVotes.every((vote) => vote.aligned),
    };
  });
}

async function saveCheckpoint(outputPath, targets, payload) {
  const results = buildResults(targets, payload.votes);
  const complete = results.filter((item) => Object.keys(item.votes).length === models.length).length;
  const aligned = results.filter((item) => item.aligned).length;
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify({
    schemaVersion: 1,
    reviewedAt: new Date().toISOString(),
    models,
    stats: { total: targets.length, complete, aligned, rejected: complete - aligned },
    votes: payload.votes,
    results,
  }, null, 2)}\n`);
}

export function applyStudySenseResults(vocabulary, results) {
  const alignedById = new Map();
  for (const result of results.filter((item) => item.aligned)) {
    const indexes = alignedById.get(result.id) ?? [];
    indexes.push(result.exampleIndex);
    alignedById.set(result.id, indexes);
  }
  for (const word of vocabulary.words.filter((item) => item.studySense?.examples?.length)) {
    const indexes = [0, ...(alignedById.get(word.id) ?? [])]
      .filter((index, position, all) => all.indexOf(index) === position)
      .sort((left, right) => left - right);
    word.studySense.exampleIndexes = indexes;
    word.studySense.examples = indexes.map((index) => word.examples?.[index]).filter(Boolean);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const vocabulary = JSON.parse(await fs.readFile(vocabularyPath, 'utf8'));
  const targets = collectStudySenseTargets(vocabulary);
  const checkpoint = await readCheckpoint(options.outputPath);
  checkpoint.votes ??= {};
  for (const model of models) {
    checkpoint.votes[model] ??= {};
    const pending = targets.filter((target) => !checkpoint.votes[model][target.key]);
    console.log(`${model}: ${targets.length - pending.length}/${targets.length}; pending ${pending.length}`);
    for (let offset = 0; offset < pending.length; offset += options.batchSize) {
      const batch = pending.slice(offset, offset + options.batchSize);
      const response = await requestVotes(model, batch);
      const byKey = new Map(response.map((item) => [item.key, item]));
      for (const target of batch) {
        const vote = byKey.get(target.key);
        if (!vote) throw new Error(`${model} omitted ${target.key}`);
        checkpoint.votes[model][target.key] = { model, aligned: vote.aligned, reason: vote.reason };
      }
      await saveCheckpoint(options.outputPath, targets, checkpoint);
      console.log(`${model}: ${Math.min(offset + batch.length, pending.length)}/${pending.length}`);
    }
  }
  const results = buildResults(targets, checkpoint.votes);
  if (options.apply) {
    applyStudySenseResults(vocabulary, results);
    await fs.writeFile(vocabularyPath, `${JSON.stringify(vocabulary, null, 2)}\n`);
    console.log(`Applied study-sense indexes; unlocked ${results.filter((item) => item.aligned).length}/${results.length} examples`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
