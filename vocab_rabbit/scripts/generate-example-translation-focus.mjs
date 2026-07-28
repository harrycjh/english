import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vocabularyPath = path.join(root, 'public/content/words/ket_vocabulary.json');
const outputPath = path.join(root, 'tmp/ket-example-translation-focus.json');
const endpoint = process.env.LM_STUDIO_URL ?? 'http://127.0.0.1:1234/v1/chat/completions';
const model = process.env.LM_STUDIO_MODEL ?? 'qwen/qwen3.6-35b-a3b';
const batchSize = Number(process.env.TRANSLATION_FOCUS_BATCH_SIZE ?? 48);

async function readCheckpoint() {
  try {
    const checkpoint = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    return new Map(checkpoint.focuses.map((entry) => [entry.id, entry]));
  } catch (error) {
    if (error.code === 'ENOENT') return new Map();
    throw error;
  }
}

async function saveCheckpoint(focusesById) {
  const focuses = [...focusesById.values()].sort((left, right) => left.id.localeCompare(right.id));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), model, focuses }, null, 2)}\n`,
  );
}

function getLexicalFallback(source) {
  const terms = source.targetMeaning
    .replace(/[（(][^）)]*[）)]/gu, '')
    .split(/[；;、,/／，]/u)
    .map((term) => term.trim())
    .filter(Boolean);
  const exact = terms
    .filter((term) => source.chinese.includes(term))
    .sort((left, right) => right.length - left.length)[0];
  if (exact) return exact;

  const ignoredSingleCharacters = new Set(['的', '了', '一', '是', '在', '和', '有', '不']);
  let longest = '';
  for (const term of terms) {
    for (let start = 0; start < term.length; start += 1) {
      for (let end = start + 1; end <= term.length; end += 1) {
        const candidate = term.slice(start, end);
        if (
          candidate.length > longest.length
          && source.chinese.includes(candidate)
          && (candidate.length > 1 || !ignoredSingleCharacters.has(candidate))
        ) {
          longest = candidate;
        }
      }
    }
  }
  return longest;
}

function validateBatch(items, focuses) {
  const sourceById = new Map(items.map((item) => [item.id, item]));
  if (!Array.isArray(focuses) || focuses.length !== items.length) {
    throw new Error(`Expected ${items.length} focus phrases, received ${focuses?.length ?? 0}`);
  }
  for (const entry of focuses) {
    const source = sourceById.get(entry.id);
    if (!source) throw new Error(`Unexpected or duplicate id: ${entry.id}`);
    sourceById.delete(entry.id);
    const markedChinese = entry.markedChinese?.trim();
    const match = /^([^【】]*)【([^【】]+)】([^【】]*)$/u.exec(markedChinese ?? '');
    if (match && `${match[1]}${match[2]}${match[3]}` === source.chinese) {
      entry.targetPhrase = match[2];
    } else {
      entry.targetPhrase = getLexicalFallback(source);
    }
    if (!entry.targetPhrase) {
      throw new Error(
        `Marked translation for ${entry.id} must exactly preserve "${source.chinese}": "${markedChinese}"`,
      );
    }
    delete entry.markedChinese;
  }
  if (sourceById.size > 0) throw new Error(`Missing ids: ${[...sourceById.keys()].join(', ')}`);
  return focuses;
}

async function requestBatch(items) {
  const keyedItems = items.map((item, index) => ({ ...item, id: String(index) }));
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 2400,
      reasoning_effort: 'none',
      messages: [
        {
          role: 'system',
          content: [
            'You identify how a target English word is expressed in a Simplified Chinese sentence.',
            'For each input, copy chinese exactly and wrap the shortest natural contiguous phrase that translates targetWord in 【】.',
            'Use targetMeaning only to disambiguate meaning; the phrase may be a natural synonym such as 家人 for 家庭 or 妈妈 for 母亲.',
            'Do not rewrite, add, remove, or reorder any character from chinese except for adding exactly one pair of 【】.',
            'Example: chinese 她有一头长发。 and targetWord hair becomes 她有一头【长发】。',
            'Return exactly one result for every input id and no extra ids.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify(keyedItems),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'ket_example_translation_focus',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              focuses: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    markedChinese: { type: 'string' },
                  },
                  required: ['id', 'markedChinese'],
                  additionalProperties: false,
                },
              },
            },
            required: ['focuses'],
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
  return validateBatch(keyedItems, JSON.parse(content).focuses).map((entry) => ({
    ...entry,
    id: items[Number(entry.id)].id,
  }));
}

async function annotateBatch(items) {
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
  const focusesById = await readCheckpoint();
  const items = payload.words.map((word) => ({
    id: word.id,
    english: word.studySense?.examples?.[0] ?? word.examples?.[0] ?? word.example,
    chinese: word.exampleTranslations?.[0],
    targetWord: word.english,
    targetMeaning: word.studySense?.chinese ?? word.chinese,
  }));
  const invalid = items.filter((item) => !item.english || !item.chinese);
  if (invalid.length > 0) {
    throw new Error(`Missing example or translation for: ${invalid.map((item) => item.id).join(', ')}`);
  }
  for (const item of items) {
    const saved = focusesById.get(item.id);
    if (saved && !item.chinese.includes(saved.targetPhrase)) {
      focusesById.delete(item.id);
    }
  }
  const pending = items.filter((item) => !focusesById.has(item.id));
  console.log(`Translation-focus progress: ${focusesById.size}/${items.length}; pending ${pending.length}`);

  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const batch = pending.slice(offset, offset + batchSize);
    const focuses = await annotateBatch(batch);
    for (const entry of focuses) focusesById.set(entry.id, entry);
    await saveCheckpoint(focusesById);
    console.log(`Translation-focus progress: ${focusesById.size}/${items.length}`);
  }

  if (process.argv.includes('--apply')) {
    for (const word of payload.words) {
      const focus = focusesById.get(word.id);
      if (!focus) throw new Error(`Missing translation focus for ${word.id}`);
      word.exampleTranslationFocus = [focus.targetPhrase];
    }
    await fs.writeFile(vocabularyPath, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`Applied ${focusesById.size} translation focus phrases to ${vocabularyPath}`);
  }
}

await main();
