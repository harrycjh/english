import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vocabularyPath = path.join(root, 'public/content/words/ket_vocabulary.json');
const outputPath = path.join(root, 'tmp/ket-example-translations.json');
const endpoint = process.env.LM_STUDIO_URL ?? 'http://127.0.0.1:1234/v1/chat/completions';
const model = process.env.LM_STUDIO_MODEL ?? 'qwen/qwen3.6-35b-a3b';
const batchSize = Number(process.env.TRANSLATION_BATCH_SIZE ?? 32);

function getExamples(word) {
  if (word.studySense?.examples?.length) return word.studySense.examples;
  return [...(word.examples ?? []), word.example].filter(Boolean);
}

async function readCheckpoint() {
  try {
    const checkpoint = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    return new Map(checkpoint.translations.map((entry) => [entry.id, entry]));
  } catch (error) {
    if (error.code === 'ENOENT') return new Map();
    throw error;
  }
}

async function saveCheckpoint(translationsById) {
  const translations = [...translationsById.values()].sort((left, right) => left.id.localeCompare(right.id));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), model, translations }, null, 2)}\n`,
  );
}

function validateBatch(items, translations) {
  const expectedIds = new Set(items.map((item) => item.id));
  if (!Array.isArray(translations) || translations.length !== items.length) {
    throw new Error(`Expected ${items.length} translations, received ${translations?.length ?? 0}`);
  }
  for (const entry of translations) {
    if (!expectedIds.delete(entry.id)) throw new Error(`Unexpected or duplicate id: ${entry.id}`);
    const chinese = entry.chinese?.trim();
    if (!chinese || !/[\u3400-\u9fff]/u.test(chinese)) {
      throw new Error(`Translation for ${entry.id} does not contain Chinese text`);
    }
    entry.chinese = chinese;
  }
  if (expectedIds.size > 0) throw new Error(`Missing ids: ${[...expectedIds].join(', ')}`);
  return translations;
}

async function requestBatch(items) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 2600,
      reasoning_effort: 'none',
      messages: [
        {
          role: 'system',
          content: [
            'You are a Cambridge A2 Key English teacher.',
            'Translate every English example into natural, concise Simplified Chinese for a child.',
            'Preserve the sentence meaning, tense, subject, negation, numbers, and everyday tone.',
            'Use the supplied word meaning to disambiguate the target word.',
            'Return exactly one translation for every input id and no extra ids.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify(items),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'ket_example_translations',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              translations: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    chinese: { type: 'string' },
                  },
                  required: ['id', 'chinese'],
                  additionalProperties: false,
                },
              },
            },
            required: ['translations'],
            additionalProperties: false,
          },
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`LM Studio returned ${response.status}: ${await response.text()}`);
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error(`LM Studio returned no content: ${JSON.stringify(body).slice(0, 600)}`);
  return validateBatch(items, JSON.parse(content).translations);
}

async function translateBatch(items) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await requestBatch(items);
    } catch (error) {
      lastError = error;
      console.warn(`Batch retry ${attempt}/3: ${error.message}`);
    }
  }
  throw lastError;
}

async function main() {
  const payload = JSON.parse(await fs.readFile(vocabularyPath, 'utf8'));
  const translationsById = await readCheckpoint();
  const items = payload.words.map((word) => ({
    id: word.id,
    english: getExamples(word)[0],
    targetWord: word.english,
    targetMeaning: word.studySense?.chinese ?? word.chinese,
  }));
  const pending = items.filter((item) => !translationsById.has(item.id));
  console.log(`Translation progress: ${translationsById.size}/${items.length}; pending ${pending.length}`);

  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const batch = pending.slice(offset, offset + batchSize);
    const translations = await translateBatch(batch);
    for (const entry of translations) translationsById.set(entry.id, entry);
    await saveCheckpoint(translationsById);
    console.log(`Translation progress: ${translationsById.size}/${items.length}`);
  }

  if (process.argv.includes('--apply')) {
    for (const word of payload.words) {
      const translation = translationsById.get(word.id);
      if (!translation) throw new Error(`Missing translation for ${word.id}`);
      word.exampleTranslations = [translation.chinese];
    }
    await fs.writeFile(vocabularyPath, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`Applied ${translationsById.size} translations to ${vocabularyPath}`);
  }
}

await main();
