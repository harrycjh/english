import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { collectDistractorTargets } from './generate-example-distractors.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vocabularyPath = path.join(root, 'public/content/words/ket_vocabulary.json');
const defaultInputPath = path.join(root, 'tmp/example-distractors.json');
const endpoint = process.env.LM_STUDIO_URL ?? 'http://127.0.0.1:1234/v1/chat/completions';
const model = process.env.EXAMPLE_DISTRACTOR_MODEL ?? 'google/gemma-4-26b-a4b-qat';

function parseArguments(argv) {
  const options = { inputPath: defaultInputPath, batchSize: 100 };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--input') options.inputPath = path.resolve(argv[++index]);
    else if (argv[index] === '--batch-size') options.batchSize = Number(argv[++index]);
  }
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 100) {
    throw new Error('--batch-size must be an integer from 1 to 100');
  }
  return options;
}

async function requestIndependentAudit(items) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: Math.max(900, items.length * 50),
      reasoning_effort: 'none',
      messages: [
        {
          role: 'system',
          content: [
            'Independently audit three proposed distractors for each child-level English cloze.',
            'Mentally substitute each candidate into the complete masked sentence.',
            'Return true when the result is a coherent standard-English sentence that a learner could reasonably defend as correct.',
            'This includes synonyms, common alternate meanings, valid compounds, collocations, and plausible people or objects in the stated context.',
            'Return false only when the complete sentence is clearly grammatically or semantically wrong.',
            'A valid fragment is not enough if the complete sentence is impossible. Rare slang and strained metaphor do not count.',
            'Examples: winner in "The little _____ rode her bike" is true; person in "You are a good _____ for sharing" is true; century in "My great-_____ lives in a house" is false.',
            'Return every key once and three booleans in selectedCandidates order.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify({
            items: items.map((item) => ({
              key: item.key,
              maskedSentence: item.maskedSentence,
              selectedCandidates: item.selectedCandidates,
            })),
          }),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'independent_example_distractor_audit',
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
                    validAlternatives: {
                      type: 'array',
                      minItems: 3,
                      maxItems: 3,
                      items: { type: 'boolean' },
                    },
                  },
                  required: ['key', 'validAlternatives'],
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
  if (!response.ok) throw new Error(`LM Studio audit returned ${response.status}: ${await response.text()}`);
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error('LM Studio audit returned no content');
  return JSON.parse(content).items ?? [];
}

function auditItems(entries, targetsByKey, wordsById) {
  return entries.map((entry) => {
    const target = targetsByKey.get(entry.key);
    return {
      key: entry.key,
      maskedSentence: target.maskedSentence,
      selectedCandidates: entry.distractorIds.map((id) => wordsById.get(id)?.english ?? id),
    };
  });
}

async function save(inputPath, payload) {
  payload.auditedAt = new Date().toISOString();
  await fs.writeFile(inputPath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function auditEntries(entries, targetsByKey, wordsById, batchSize, onBatch) {
  for (let offset = 0; offset < entries.length; offset += batchSize) {
    const batch = entries.slice(offset, offset + batchSize);
    const responses = await requestIndependentAudit(auditItems(batch, targetsByKey, wordsById));
    const byKey = new Map(responses.map((item) => [item.key, item.validAlternatives]));
    for (const entry of batch) {
      const values = byKey.get(entry.key);
      if (values?.length !== 3 || !values.every((value) => typeof value === 'boolean')) {
        throw new Error(`Invalid independent audit for ${entry.key}`);
      }
      entry.independentAudit = entry.distractorIds.map((id, index) => ({
        id,
        validAlternative: values[index],
      }));
    }
    await onBatch();
    console.log(`Independent audit: ${Math.min(offset + batch.length, entries.length)}/${entries.length}`);
  }
}

async function replaceUnsafeEntries(entries, targetsByKey, wordsById, batchSize) {
  const states = entries.map((entry) => ({
    entry,
    target: targetsByKey.get(entry.key),
    accepted: new Set(entry.independentAudit.filter((item) => !item.validAlternative).map((item) => item.id)),
    rejected: new Set(entry.independentAudit.filter((item) => item.validAlternative).map((item) => item.id)),
  }));
  let pending = states.filter((state) => state.accepted.size < 3);
  for (let round = 1; round <= 8 && pending.length > 0; round += 1) {
    for (let offset = 0; offset < pending.length; offset += batchSize) {
      const batch = pending.slice(offset, offset + batchSize);
      const requests = batch.map((state) => ({
        ...state.target,
        candidates: state.target.candidates.filter((candidate) => (
          !state.accepted.has(candidate.id) && !state.rejected.has(candidate.id)
        )),
      }));
      if (requests.some((item) => item.candidates.length < 3)) {
        throw new Error('Distractor candidates exhausted during independent correction');
      }
      const proposed = batch.map((state) => {
        const request = requests.find((item) => item.key === state.entry.key);
        return {
          ...state.target,
          distractorIds: request.candidates.slice(0, 3).map((candidate) => candidate.id),
        };
      });
      const audits = await requestIndependentAudit(auditItems(proposed, targetsByKey, wordsById));
      const auditsByKey = new Map(audits.map((item) => [item.key, item.validAlternatives]));
      for (const state of batch) {
        const selection = proposed.find((item) => item.key === state.entry.key);
        const values = auditsByKey.get(state.entry.key);
        if (values?.length !== 3) throw new Error(`Invalid replacement audit for ${state.entry.key}`);
        selection.distractorIds.forEach((id, index) => {
          if (values[index]) state.rejected.add(id);
          else state.accepted.add(id);
        });
      }
    }
    pending = states.filter((state) => state.accepted.size < 3);
    console.log(`Independent correction round ${round}: ${pending.length} pending`);
  }
  if (pending.length > 0) throw new Error(`Independent correction failed for ${pending.length} entries`);
  for (const state of states) {
    state.entry.distractorIds = [...state.accepted].slice(0, 3);
    state.entry.independentAudit = state.entry.distractorIds.map((id) => ({
      id,
      validAlternative: false,
    }));
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const vocabulary = JSON.parse(await fs.readFile(vocabularyPath, 'utf8'));
  const wordsById = new Map(vocabulary.words.map((word) => [word.id, word]));
  const targetsByKey = new Map(collectDistractorTargets(vocabulary).map((item) => [item.key, item]));
  const payload = JSON.parse(await fs.readFile(options.inputPath, 'utf8'));
  const pending = payload.items.filter((item) => item.independentAudit?.length !== 3);
  console.log(`Independent audit pending: ${pending.length}/${payload.items.length}`);
  await auditEntries(pending, targetsByKey, wordsById, options.batchSize, () => save(options.inputPath, payload));
  const unsafe = payload.items.filter((item) => item.independentAudit.some((value) => value.validAlternative));
  console.log(`Independent audit found ${unsafe.length} entries with possible alternate answers`);
  if (unsafe.length > 0) await replaceUnsafeEntries(unsafe, targetsByKey, wordsById, options.batchSize);
  payload.stats.independentlyAudited = payload.items.length;
  payload.stats.corrected = unsafe.length;
  await save(options.inputPath, payload);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
