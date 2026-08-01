import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vocabularyPath = path.join(root, 'public/content/words/ket_vocabulary.json');
const defaultOutputPath = path.join(root, 'tmp/teaching-chunk-examples.json');
const defaultSourceExamplesPath = path.join(root, 'tmp/teaching-chunk-source-examples.json');
const endpoint = process.env.LM_STUDIO_URL ?? 'http://127.0.0.1:1234/v1/chat/completions';
const model = process.env.CHUNK_EXAMPLE_MODEL ?? 'qwen/qwen3.6-35b-a3b';
const translationFallbackModel = process.env.CHUNK_TRANSLATION_FALLBACK_MODEL ?? 'qwen/qwen3.6-27b';

const IRREGULAR_FORMS = {
  be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
  become: ['became', 'become'],
  begin: ['began', 'begun'],
  break: ['broke', 'broken'],
  bring: ['brought'],
  buy: ['bought'],
  can: ['could'],
  catch: ['caught'],
  choose: ['chose', 'chosen'],
  come: ['came'],
  do: ['does', 'did', 'done'],
  drink: ['drank', 'drunk'],
  drive: ['drove', 'driven'],
  eat: ['ate', 'eaten'],
  fall: ['fell', 'fallen'],
  feel: ['felt'],
  find: ['found'],
  fly: ['flew', 'flown'],
  forget: ['forgot', 'forgotten'],
  get: ['got', 'gotten'],
  give: ['gave', 'given'],
  go: ['went', 'gone'],
  grow: ['grew', 'grown'],
  have: ['has', 'had'],
  hear: ['heard'],
  hold: ['held'],
  keep: ['kept'],
  know: ['knew', 'known'],
  leave: ['left'],
  lose: ['lost'],
  make: ['made'],
  mean: ['meant'],
  meet: ['met'],
  pay: ['paid'],
  read: ['read'],
  ride: ['rode', 'ridden'],
  run: ['ran'],
  say: ['said'],
  see: ['saw', 'seen'],
  sell: ['sold'],
  send: ['sent'],
  sing: ['sang', 'sung'],
  sit: ['sat'],
  sleep: ['slept'],
  speak: ['spoke', 'spoken'],
  spend: ['spent'],
  stand: ['stood'],
  steal: ['stole', 'stolen'],
  swim: ['swam', 'swum'],
  take: ['took', 'taken'],
  teach: ['taught'],
  tell: ['told'],
  think: ['thought'],
  throw: ['threw', 'thrown'],
  understand: ['understood'],
  wear: ['wore', 'worn'],
  win: ['won'],
  write: ['wrote', 'written'],
};

function parseArguments(argv) {
  const options = {
    outputPath: defaultOutputPath,
    sourceExamplesPath: defaultSourceExamplesPath,
    batchSize: 16,
    start: 0,
    limit: Number.POSITIVE_INFINITY,
    ids: null,
    apply: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--output') options.outputPath = path.resolve(argv[++index]);
    else if (value === '--source-examples') options.sourceExamplesPath = path.resolve(argv[++index]);
    else if (value === '--batch-size') options.batchSize = Number(argv[++index]);
    else if (value === '--start') options.start = Number(argv[++index]);
    else if (value === '--limit') options.limit = Number(argv[++index]);
    else if (value === '--ids') options.ids = argv[++index].split(',').filter(Boolean);
    else if (value === '--apply') options.apply = true;
  }
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 30) {
    throw new Error('--batch-size must be an integer from 1 to 30');
  }
  return options;
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizePhrase(value) {
  return normalizeText(value).toLowerCase().replace(/[–—]/g, '-');
}

function getTokenForms(token) {
  const lower = token.toLowerCase();
  const forms = new Set([lower, `${lower}s`, `${lower}es`, ...(IRREGULAR_FORMS[lower] ?? [])]);
  forms.add(`${lower}'s`);
  if (lower.endsWith('e')) {
    forms.add(`${lower}d`);
    forms.add(`${lower.slice(0, -1)}ing`);
  } else {
    forms.add(`${lower}ed`);
    forms.add(`${lower}ing`);
  }
  if (/[^aeiou]y$/.test(lower)) {
    forms.add(`${lower.slice(0, -1)}ies`);
    forms.add(`${lower.slice(0, -1)}ied`);
  }
  if (/^[a-z]*[^aeiou][aeiou][^aeiouwxy]$/.test(lower)) {
    forms.add(`${lower}${lower.at(-1)}ed`);
    forms.add(`${lower}${lower.at(-1)}ing`);
  }
  return forms;
}

function sentenceTokens(sentence) {
  return normalizePhrase(sentence).match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
}

export function sentenceUsesChunk(sentence, phrase) {
  const tokens = sentenceTokens(sentence);
  const normalizedPhrase = normalizePhrase(phrase)
    .replace(/\bis\/are\b/g, 'be')
    .replace(/\bdo something\b/g, 'something')
    .replace(/\bdoing something\b/g, 'something');
  const ignored = new Set([
    'a', 'an', 'n', 'one', "one's", 'oneself', 'someone', "someone's", 'somebody', "somebody's",
    'something', 'somewhere', 'somebody', 'sb', 'sth',
  ]);
  const phraseTokens = normalizedPhrase
    .replace(/[_/()-]+/g, ' ')
    .match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
  const required = phraseTokens.filter((token) => !ignored.has(token));
  if (required.length === 0) return false;
  let sentenceIndex = 0;
  return required.every((token) => {
    const forms = getTokenForms(token);
    while (sentenceIndex < tokens.length && !forms.has(tokens[sentenceIndex])) sentenceIndex += 1;
    if (sentenceIndex >= tokens.length) return false;
    sentenceIndex += 1;
    return true;
  });
}

function sourceExampleAt(sourceEntry, index, phrase) {
  const item = sourceEntry?.examples?.[index];
  return item?.status === 'matched' && normalizePhrase(item.phrase) === normalizePhrase(phrase)
    ? item
    : null;
}

export function repairTranslationFocus(translationValue, focusValue) {
  const translation = normalizeText(translationValue);
  const focus = normalizeText(focusValue);
  if (!focus) return translation.replace(/[。！？]+$/u, '');
  if (!/[;/]/.test(focus) && translation.includes(focus)) return focus;
  const alternatives = focus.split(/[;/]/).map((item) => item.trim()).filter(Boolean);
  const containedAlternative = alternatives.find((item) => translation.includes(item));
  if (containedAlternative) return containedAlternative;
  const focusCharacters = [...focus].filter((character) => /[\u3400-\u9fff]/u.test(character));
  if (focusCharacters.length < 2) return translation.replace(/[。！？]+$/u, '');
  let best = '';
  for (let start = translation.indexOf(focusCharacters[0]); start >= 0; start = translation.indexOf(focusCharacters[0], start + 1)) {
    let cursor = start;
    let matched = true;
    for (const character of focusCharacters.slice(1)) {
      cursor = translation.indexOf(character, cursor + 1);
      if (cursor < 0) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;
    const candidate = translation.slice(start, cursor + 1);
    const maximumLength = Math.max(focusCharacters.length + 6, focusCharacters.length * 2);
    if (candidate.length <= maximumLength && (!best || candidate.length < best.length)) best = candidate;
  }
  return best || translation.replace(/[。！？]+$/u, '');
}

export function validateGeneratedEntry(word, entry, sourceEntry = null) {
  const hasSourceAudit = sourceEntry !== null;
  const targetChunks = (word.teachingChunks ?? []).slice(0, 3);
  const examples = Array.isArray(entry?.examples) ? entry.examples : [];
  const errors = [];
  if (entry?.id !== word.id) errors.push('id-mismatch');
  if (examples.length !== targetChunks.length) errors.push(`examples-length-${examples.length}`);
  const seenSentences = new Set();
  const normalizedExamples = [];
  for (const [index, target] of targetChunks.entries()) {
    const item = examples[index] ?? {};
    const phrase = normalizeText(item.phrase);
    const modelSentence = normalizeText(item.sentence);
    const translation = normalizeText(item.translation);
    const translationFocus = normalizeText(item.translationFocus);
    const sourceExample = sourceExampleAt(sourceEntry, index, target.phrase);
    const sentence = sourceExample ? normalizeText(sourceExample.sentence) : modelSentence;
    const sentenceSource = sourceExample?.source ?? item.sentenceSource ?? 'qwen';
    const wordCount = sentence.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g)?.length ?? 0;
    if (normalizePhrase(phrase) !== normalizePhrase(target.phrase)) errors.push(`${index}:phrase-mismatch`);
    if (hasSourceAudit && !sourceExample && item.sentenceSource && item.sentenceSource !== 'qwen') {
      errors.push(`${index}:source-no-longer-approved`);
    }
    if (hasSourceAudit && sourceExample && modelSentence && modelSentence !== sentence) {
      errors.push(`${index}:source-sentence-changed`);
    }
    if (!sentenceUsesChunk(sentence, target.phrase)) errors.push(`${index}:missing-chunk`);
    const minimumWords = 4;
    if (wordCount < minimumWords || wordCount > 18) errors.push(`${index}:word-count-${wordCount}`);
    if (!/^[A-Z"']/u.test(sentence)) errors.push(`${index}:capitalization`);
    if (!/[.!?]"?$/u.test(sentence)) errors.push(`${index}:punctuation`);
    if (/[\u3400-\u9fff]/u.test(sentence)) errors.push(`${index}:non-english`);
    if (!/[\u3400-\u9fff]/u.test(translation)) errors.push(`${index}:no-chinese`);
    if (!translationFocus || !translation.includes(translationFocus)) errors.push(`${index}:focus-not-contained`);
    if (!/[。！？][”"']?$/u.test(translation)) errors.push(`${index}:translation-not-sentence`);
    if (translation.length <= translationFocus.length) errors.push(`${index}:translation-too-short`);
    if (/[;/]/.test(translationFocus)) errors.push(`${index}:focus-has-alternatives`);
    const sentenceKey = sentence.toLowerCase();
    if (seenSentences.has(sentenceKey)) errors.push(`${index}:duplicate-sentence`);
    seenSentences.add(sentenceKey);
    normalizedExamples.push({
      phrase: target.phrase,
      sentence,
      translation,
      translationFocus,
      sentenceSource,
    });
  }
  return {
    valid: errors.length === 0,
    errors,
    entry: { id: word.id, examples: normalizedExamples },
  };
}

export function applyGeneratedEntry(word, entry) {
  const existingExamples = word.examples ?? (word.example ? [word.example] : []);
  const existingTranslations = word.exampleTranslations ?? [];
  const existingFocuses = word.exampleTranslationFocus ?? [];
  const existingCollocations = word.exampleCollocations ?? [];
  const baseIndexes = existingExamples.flatMap((_, index) => (
    normalizeText(existingCollocations[index]) ? [] : [index]
  ));
  const baseExamples = baseIndexes.map((index) => existingExamples[index]).filter(Boolean);
  const baseTranslations = baseIndexes.map((index) => existingTranslations[index] ?? '');
  const baseFocuses = baseIndexes.map((index) => existingFocuses[index] ?? '');
  const baseCollocations = baseExamples.map(() => '');
  const generated = entry.examples ?? [];

  word.examples = [...baseExamples, ...generated.map((item) => item.sentence)];
  word.exampleTranslations = [...baseTranslations, ...generated.map((item) => item.translation)];
  word.exampleTranslationFocus = [...baseFocuses, ...generated.map((item) => item.translationFocus)];
  word.exampleCollocations = [...baseCollocations, ...generated.map((item) => item.phrase)];
  if (word.studySense?.examples?.length && baseExamples[0]) {
    word.studySense.examples = [baseExamples[0]];
  }
  return word;
}

async function readCheckpoint(outputPath) {
  try {
    const payload = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    return new Map((payload.entries ?? []).map((entry) => [entry.id, entry]));
  } catch (error) {
    if (error.code === 'ENOENT') return new Map();
    throw error;
  }
}

async function saveCheckpoint(outputPath, entriesById) {
  const entries = [...entriesById.values()].sort((left, right) => left.id.localeCompare(right.id));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    model,
    translationFallbackModel,
    entries,
  }, null, 2)}\n`);
}

async function requestJson(system, payload, schemaName, schema, maxTokens, modelId = model) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelId,
      temperature: 0.15,
      max_tokens: maxTokens,
      reasoning_effort: 'none',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: schemaName,
          strict: true,
          schema,
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`LM Studio returned ${response.status}: ${await response.text()}`);
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error(`LM Studio returned no content: ${JSON.stringify(body).slice(0, 800)}`);
  return JSON.parse(content);
}

const batchItemSchema = (exampleProperties, required) => ({
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          examples: {
            type: 'array',
            minItems: 1,
            maxItems: 3,
            items: {
              type: 'object',
              properties: {
                phrase: { type: 'string' },
                ...exampleProperties,
              },
              required: ['phrase', ...required],
              additionalProperties: false,
            },
          },
        },
        required: ['id', 'examples'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
});

function englishValidationErrors(chunk, sentence, minimumWords = 4) {
  const normalized = normalizeText(sentence);
  const wordCount = normalized.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g)?.length ?? 0;
  const errors = [];
  if (!sentenceUsesChunk(normalized, chunk.phrase)) errors.push('missing-chunk');
  if (wordCount < minimumWords || wordCount > 18) errors.push(`word-count-${wordCount}`);
  if (!/^[A-Z"']/u.test(normalized)) errors.push('capitalization');
  if (!/[.!?]"?$/u.test(normalized)) errors.push('punctuation');
  if (/[\u3400-\u9fff]/u.test(normalized)) errors.push('non-english');
  return errors;
}

function prepareEnglishEntries(words, sourceById) {
  return words.map((word) => ({
    id: word.id,
    examples: (word.teachingChunks ?? []).slice(0, 3).map((chunk, index) => {
      const sourceExample = sourceExampleAt(sourceById.get(word.id), index, chunk.phrase);
      return {
        phrase: chunk.phrase,
        chinese: chunk.chinese,
        sense: chunk.sense,
        sentence: sourceExample ? normalizeText(sourceExample.sentence) : '',
        sentenceSource: sourceExample?.source ?? 'qwen',
      };
    }),
  }));
}

async function fillMissingEnglishPass(words, preparedById, maximumAttempts = 3) {
  let pending = words.filter((word) => preparedById.get(word.id).examples.some((item) => !item.sentence));
  const corrections = new Map();
  for (let attempt = 1; attempt <= maximumAttempts && pending.length > 0; attempt += 1) {
    let responseItems;
    try {
      const payload = {
        items: pending.map((word) => ({
          id: word.id,
          headword: word.english,
          partOfSpeech: (word.studySense ?? word).partOfSpeech,
          chineseMeaning: (word.studySense ?? word).chinese,
          topic: word.category,
          chunks: preparedById.get(word.id).examples
            .filter((item) => !item.sentence)
            .map(({ phrase, chinese, sense }) => ({ phrase, chinese, sense })),
          ...(corrections.has(word.id) ? { correction: corrections.get(word.id) } : {}),
        })),
      };
      const body = await requestJson(
        [
          'You are an experienced English teacher writing short examples for a child preparing for TOEFL Primary or TOEFL Junior.',
          'Write exactly one natural English sentence for every supplied fixed expression.',
          'Clearly demonstrate the supplied sense and keep the returned phrase exactly identical to the input phrase.',
          'The sentence itself must use every content word from the fixed expression; never replace a word with a synonym.',
          'For example, phrase "be sick" may use "I was sick yesterday." but must not use "I feel sick today."; phrase "hear of" may use "Have you heard of this game?".',
          'For phrase "not to worry", use it directly as in "Not to worry, we still have time." and do not change it to "Do not worry".',
          'The sentence may inflect a verb or replace placeholders such as someone and one\'s naturally.',
          'Use ordinary child-friendly situations, 5-12 words when possible, never more than 18 words.',
          'Avoid quotations, character names, adult topics, violence, alcohol, politics, and needlessly difficult grammar.',
          'Do not translate and do not omit, add, reorder, or combine chunks.',
          'When correction is present, repair every listed issue.',
        ].join(' '),
        payload,
        'missing_teaching_chunk_sentences',
        batchItemSchema({ sentence: { type: 'string' } }, ['sentence']),
        Math.max(1200, pending.length * 360),
      );
      responseItems = body.items ?? [];
    } catch (error) {
      for (const word of pending) corrections.set(word.id, error.message);
      console.warn(`English request retry ${attempt}/${maximumAttempts}: ${error.message}`);
      continue;
    }
    const responseById = new Map(responseItems.map((entry) => [entry.id, entry]));
    if (process.env.DEBUG_CHUNK_EXAMPLES === '1') {
      console.warn(`Raw English payload: ${JSON.stringify(responseItems)}`);
    }
    const nextPending = [];
    for (const word of pending) {
      const prepared = preparedById.get(word.id);
      const missingExamples = prepared.examples.filter((example) => !example.sentence);
      const responseExamples = responseById.get(word.id)?.examples ?? [];
      const responseByPhrase = new Map(
        responseExamples.map((item) => [normalizePhrase(item.phrase), item]),
      );
      const errors = [];
      for (const [missingIndex, item] of missingExamples.entries()) {
        const response = responseByPhrase.get(normalizePhrase(item.phrase))
          ?? responseExamples[missingIndex];
        const sentence = normalizeText(response?.sentence);
        const chunkErrors = englishValidationErrors(item, sentence);
        if (chunkErrors.length > 0) errors.push(`${item.phrase}:${chunkErrors.join('|')}`);
        else item.sentence = sentence;
      }
      if (errors.length > 0 || prepared.examples.some((item) => !item.sentence)) {
        corrections.set(word.id, errors.join(', ') || 'missing-response');
        nextPending.push(word);
      }
    }
    pending = nextPending;
    if (pending.length > 0) {
      console.warn(`Retry English ${attempt}/${maximumAttempts} for ${pending.length} entries: ${pending.map((word) => word.id).join(', ')}`);
    }
  }
  return { pending, corrections };
}

async function fillMissingEnglish(words, preparedById) {
  const batchResult = await fillMissingEnglishPass(words, preparedById, 3);
  const failed = [];
  for (const word of batchResult.pending) {
    const result = await fillMissingEnglishPass([word], preparedById, 3);
    if (result.pending.length > 0) {
      failed.push(`${word.id} (${result.corrections.get(word.id) ?? batchResult.corrections.get(word.id)})`);
    }
  }
  if (failed.length > 0) throw new Error(`Failed to generate English: ${failed.join('; ')}`);
}

async function translatePreparedEntries(
  words,
  preparedById,
  allowIndividualFallback = true,
  translationModel = model,
) {
  const accepted = new Map();
  let pending = [...words];
  const corrections = new Map();
  for (let attempt = 1; attempt <= 3 && pending.length > 0; attempt += 1) {
    let responseItems;
    try {
      const body = await requestJson(
        [
          'You are a careful Simplified Chinese translator for a child English-learning app.',
          'Translate every supplied English sentence exactly; preserve its subject, tense, negation, numbers, and fixed-expression meaning.',
          'Return no English sentence and never rewrite the source sentence.',
          'translation must be a complete natural Chinese sentence, not a dictionary meaning or isolated phrase, and must end with Chinese punctuation.',
          'Use familiar natural Chinese instead of obscure dictionary language.',
          'translationFocus must be the shortest contiguous Chinese phrase in the translation expressing the whole fixed expression, copied exactly from the translation.',
          'translationFocus must contain one natural rendering only, with no slash or semicolon alternatives.',
          'Never put dictionary alternatives such as 姐姐/妹妹 or 父亲;爸爸 in translationFocus; choose only the exact wording actually used in this sentence.',
          'Example: sentence "My little brother likes games." must translate as "我的弟弟喜欢游戏。", with translationFocus "弟弟".',
          'Keep each phrase exactly identical and preserve the supplied order.',
          'When correction is present, repair every listed issue.',
        ].join(' '),
        {
          items: pending.map((word) => ({
            id: word.id,
            chunks: preparedById.get(word.id).examples.map(({ phrase, chinese, sense, sentence }) => ({
              phrase, chunkMeaning: chinese, sense, sentence,
            })),
            ...(corrections.has(word.id) ? { correction: corrections.get(word.id) } : {}),
          })),
        },
        'teaching_chunk_translations',
        batchItemSchema({
          translation: { type: 'string' },
          translationFocus: { type: 'string' },
        }, ['translation', 'translationFocus']),
        Math.max(1400, pending.length * 420),
        translationModel,
      );
      responseItems = body.items ?? [];
    } catch (error) {
      for (const word of pending) corrections.set(word.id, error.message);
      console.warn(`Translation request retry ${attempt}/3: ${error.message}`);
      continue;
    }
    const responseById = new Map(responseItems.map((entry) => [entry.id, entry]));
    if (process.env.DEBUG_CHUNK_EXAMPLES === '1') {
      console.warn(`Raw translation payload: ${JSON.stringify(responseItems)}`);
    }
    const nextPending = [];
    for (const word of pending) {
      const prepared = preparedById.get(word.id);
      const responseExamples = responseById.get(word.id)?.examples ?? [];
      const translations = new Map(
        responseExamples.map((item) => [normalizePhrase(item.phrase), item]),
      );
      const finalEntry = {
        id: word.id,
        examples: prepared.examples.map((item, index) => {
          const translated = translations.get(normalizePhrase(item.phrase))
            ?? responseExamples[index]
            ?? {};
          return {
            phrase: item.phrase,
            sentence: item.sentence,
            translation: normalizeText(translated.translation),
            translationFocus: repairTranslationFocus(
              translated.translation,
              translated.translationFocus,
            ),
            sentenceSource: item.sentenceSource,
          };
        }),
      };
      const validation = validateGeneratedEntry(word, finalEntry);
      if (validation.valid) accepted.set(word.id, validation.entry);
      else {
        if (process.env.DEBUG_CHUNK_EXAMPLES === '1') {
          console.warn(`Invalid translation payload for ${word.id}: ${JSON.stringify(finalEntry)}`);
        }
        corrections.set(word.id, validation.errors.join(', '));
        nextPending.push(word);
      }
    }
    pending = nextPending;
    if (pending.length > 0) {
      console.warn(`Retry translation ${attempt}/3 for ${pending.length} entries: ${pending.map((word) => word.id).join(', ')}`);
    }
  }
  if (pending.length > 0 && allowIndividualFallback && words.length > 1) {
    const stillPending = [];
    for (const word of pending) {
      try {
        const individual = await translatePreparedEntries([word], preparedById, false, translationModel);
        accepted.set(word.id, individual.get(word.id));
      } catch (error) {
        if (translationModel !== translationFallbackModel) {
          try {
            console.warn(`Retry translation for ${word.id} with fallback model ${translationFallbackModel}`);
            const fallback = await translatePreparedEntries(
              [word],
              preparedById,
              false,
              translationFallbackModel,
            );
            accepted.set(word.id, fallback.get(word.id));
            continue;
          } catch (fallbackError) {
            corrections.set(word.id, fallbackError.message);
          }
        } else {
          corrections.set(word.id, error.message);
        }
        stillPending.push(word);
      }
    }
    pending = stillPending;
  }
  if (pending.length > 0) {
    throw new Error(`Failed to translate: ${pending.map((word) => `${word.id} (${corrections.get(word.id)})`).join('; ')}`);
  }
  return accepted;
}

async function generateBatch(words, sourceById) {
  const preparedEntries = prepareEnglishEntries(words, sourceById);
  const preparedById = new Map(preparedEntries.map((entry) => [entry.id, entry]));
  await fillMissingEnglish(words, preparedById);
  return [...(await translatePreparedEntries(words, preparedById)).values()];
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const [vocabulary, sourcePayload] = await Promise.all([
    fs.readFile(vocabularyPath, 'utf8').then(JSON.parse),
    fs.readFile(options.sourceExamplesPath, 'utf8').then(JSON.parse),
  ]);
  const sourceById = new Map((sourcePayload.entries ?? []).map((entry) => [entry.id, entry]));
  const targetWords = vocabulary.words.filter((word) => (word.teachingChunks?.length ?? 0) > 0);
  const selectedWords = options.ids
    ? options.ids.map((id) => targetWords.find((word) => word.id === id)).filter(Boolean)
    : targetWords.slice(options.start, options.start + options.limit);
  const entriesById = await readCheckpoint(options.outputPath);
  for (const word of selectedWords) {
    const existing = entriesById.get(word.id);
    if (existing && !validateGeneratedEntry(word, existing, sourceById.get(word.id)).valid) {
      entriesById.delete(word.id);
    }
  }
  const pending = selectedWords.filter((word) => !entriesById.has(word.id));
  console.log(`Chunk-example progress: ${selectedWords.length - pending.length}/${selectedWords.length}; pending ${pending.length}`);
  for (let offset = 0; offset < pending.length; offset += options.batchSize) {
    const batch = pending.slice(offset, offset + options.batchSize);
    const generated = await generateBatch(batch, sourceById);
    for (const entry of generated) entriesById.set(entry.id, entry);
    await saveCheckpoint(options.outputPath, entriesById);
    console.log(`Chunk-example progress: ${Math.min(offset + batch.length, pending.length)}/${pending.length}; saved ${entriesById.size}`);
  }

  if (options.apply) {
    const missing = targetWords.filter((word) => !entriesById.has(word.id));
    if (missing.length > 0) throw new Error(`Cannot apply: ${missing.length} target words are missing generated examples`);
    for (const word of targetWords) applyGeneratedEntry(word, entriesById.get(word.id));
    await fs.writeFile(vocabularyPath, `${JSON.stringify(vocabulary, null, 2)}\n`);
    console.log(`Applied chunk examples to ${targetWords.length} words`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
