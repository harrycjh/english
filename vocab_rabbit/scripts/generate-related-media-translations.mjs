import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'public/content/words/word_related_media.json');
const checkpointPath = path.join(root, 'tmp/related-media-translations/checkpoint.json');
const endpoint = process.env.LM_STUDIO_URL ?? 'http://127.0.0.1:1234/v1/chat/completions';
const model = process.env.LM_STUDIO_MODEL ?? 'qwen/qwen3.6-35b-a3b';
const batchSize = Number(process.env.TRANSLATION_BATCH_SIZE ?? 32);
const limitArgument = process.argv.find((argument) => argument.startsWith('--limit='));
const limit = limitArgument ? Number(limitArgument.split('=')[1]) : null;
const shouldApply = process.argv.includes('--apply');
const forceRestart = process.argv.includes('--restart');

function normalizeSentence(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sentenceId(sentence) {
  return crypto.createHash('sha1').update(sentence).digest('hex').slice(0, 16);
}

async function loadCheckpoint() {
  if (forceRestart) return new Map();
  try {
    const payload = JSON.parse(await fs.readFile(checkpointPath, 'utf8'));
    return new Map(
      (payload.translations ?? [])
        .filter((entry) => entry.id && entry.english && entry.chinese)
        .map((entry) => [entry.id, entry]),
    );
  } catch (error) {
    if (error.code === 'ENOENT') return new Map();
    throw error;
  }
}

async function saveCheckpoint(translationsById) {
  const translations = [...translationsById.values()]
    .sort((left, right) => left.id.localeCompare(right.id));
  await fs.mkdir(path.dirname(checkpointPath), { recursive: true });
  await fs.writeFile(
    checkpointPath,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      model,
      translations,
    }, null, 2)}\n`,
  );
}

function validateBatch(items, translations) {
  const expected = new Map(items.map((item) => [item.id, item]));
  if (!Array.isArray(translations) || translations.length !== items.length) {
    throw new Error(`Expected ${items.length} translations, received ${translations?.length ?? 0}`);
  }

  return translations.map((translation) => {
    const item = expected.get(translation.id);
    if (!item) throw new Error(`Unexpected or duplicate id: ${translation.id}`);
    expected.delete(translation.id);
    const chinese = normalizeSentence(translation.chinese);
    if (!chinese || !/[\u3400-\u9fff]/u.test(chinese)) {
      throw new Error(`Translation ${translation.id} does not contain Chinese text`);
    }
    return {
      id: item.id,
      english: item.english,
      chinese,
    };
  });
}

async function requestBatch(items) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 6000,
      reasoning_effort: 'none',
      messages: [
        {
          role: 'system',
          content: [
            'You are an English teacher translating illustrated children-book sentences.',
            'Translate every sentence into natural, concise Simplified Chinese suitable for a child.',
            'Preserve the original subject, tense, negation, number, names, and meaning.',
            'Do not explain, annotate, omit, merge, or invent content.',
            'Return exactly one result for every supplied id.',
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
          name: 'related_media_translations',
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
  if (!response.ok) {
    throw new Error(`LM Studio returned ${response.status}: ${await response.text()}`);
  }
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error(`LM Studio returned no content: ${JSON.stringify(body).slice(0, 500)}`);
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
  if (items.length > 1) {
    const middle = Math.ceil(items.length / 2);
    console.warn(`Splitting failed batch of ${items.length} into smaller requests`);
    return [
      ...await translateBatch(items.slice(0, middle)),
      ...await translateBatch(items.slice(middle)),
    ];
  }
  throw lastError;
}

async function main() {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const itemsById = new Map();
  const manifestTranslationsById = new Map();
  for (const entry of manifest.entries) {
    for (const source of ['oxford', 'redRocket', 'raz']) {
      const media = entry.relatedMedia?.[source];
      const sentence = normalizeSentence(media?.sentence);
      if (!sentence) continue;
      const id = sentenceId(sentence);
      itemsById.set(id, { id, english: sentence });
      const chinese = normalizeSentence(media?.sentenceTranslation);
      if (chinese) manifestTranslationsById.set(id, { id, english: sentence, chinese });
    }
  }

  const translationsById = await loadCheckpoint();
  for (const [id, translation] of manifestTranslationsById) {
    translationsById.set(id, translation);
  }
  const staleIds = [...translationsById.keys()].filter((id) => !itemsById.has(id));
  for (const id of staleIds) translationsById.delete(id);
  const allPending = [...itemsById.values()]
    .filter((item) => !translationsById.has(item.id))
    .sort((left, right) => left.id.localeCompare(right.id));
  const pending = limit === null ? allPending : allPending.slice(0, limit);
  console.log(
    `Related translation progress: ${translationsById.size}/${itemsById.size}; `
    + `pending ${allPending.length}; processing ${pending.length} with ${model}`,
  );

  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const batch = pending.slice(offset, offset + batchSize);
    const translations = await translateBatch(batch);
    for (const translation of translations) {
      translationsById.set(translation.id, translation);
    }
    await saveCheckpoint(translationsById);
    console.log(`Related translation progress: ${translationsById.size}/${itemsById.size}`);
  }

  if (!shouldApply) return;
  if (translationsById.size !== itemsById.size) {
    throw new Error(
      `Refusing partial apply: ${translationsById.size}/${itemsById.size} translations complete`,
    );
  }

  let applied = 0;
  let withOxfordSentenceTranslation = 0;
  let withRedRocketSentenceTranslation = 0;
  let withRazSentenceTranslation = 0;
  for (const entry of manifest.entries) {
    for (const source of ['oxford', 'redRocket', 'raz']) {
      const media = entry.relatedMedia?.[source];
      const sentence = normalizeSentence(media?.sentence);
      if (!sentence) continue;
      const translation = translationsById.get(sentenceId(sentence));
      if (!translation) throw new Error(`Missing translation for ${sentence}`);
      media.sentenceTranslation = translation.chinese;
      applied += 1;
      if (source === 'oxford') withOxfordSentenceTranslation += 1;
      if (source === 'redRocket') withRedRocketSentenceTranslation += 1;
      if (source === 'raz') withRazSentenceTranslation += 1;
    }
  }
  manifest.stats = {
    ...(manifest.stats ?? {}),
    withOxfordSentenceTranslation,
    withRedRocketSentenceTranslation,
    withRazSentenceTranslation,
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Applied ${applied} related sentence translations to ${manifestPath}`);
}

await main();
