import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vocabularyPath = path.join(root, 'public/content/words/ket_vocabulary.json');
const defaultOutputPath = path.join(root, 'tmp/ket-example-sets.json');
const endpoint = process.env.LM_STUDIO_URL ?? 'http://127.0.0.1:1234/v1/chat/completions';
const model = process.env.LM_STUDIO_MODEL ?? 'qwen/qwen3-vl-30b';
const collocationModel = process.env.KET_COLLOCATION_MODEL ?? model;
const sentenceModel = process.env.KET_SENTENCE_MODEL ?? model;
const translationModel = process.env.KET_TRANSLATION_MODEL ?? model;

const HEADWORD_OVERRIDES = {
  'barbecue/barbeque': 'barbecue',
  'cafe/café': 'cafe',
  'examination/exam': 'exam',
  'at / @': 'at',
  'v/versus': 'versus',
  'centre/center': 'centre',
  'centimetre/centimeter (cm)': 'centimetre',
  'lots / a lot': 'a lot',
  'a/an': 'an',
  'all right/alright': 'all right',
  'OK/okay': 'OK',
  'give somebody a call/ring': 'give me a call',
  'gram(me)': 'gram',
  'prefer / would prefer': 'prefer',
  'poor thing/you': 'poor thing',
  'television (TV)': 'TV',
};

const IRREGULAR_FORMS = {
  be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
  become: ['became'],
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
  know: ['knew', 'known'],
  leave: ['left'],
  lose: ['lost'],
  make: ['made'],
  meet: ['met'],
  pay: ['paid'],
  read: ['read'],
  ride: ['rode', 'ridden'],
  run: ['ran'],
  say: ['said'],
  see: ['saw', 'seen'],
  send: ['sent'],
  sing: ['sang'],
  sit: ['sat'],
  speak: ['spoke'],
  spend: ['spent'],
  stand: ['stood'],
  swim: ['swam'],
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
    start: 0,
    limit: Number.POSITIVE_INFINITY,
    batchSize: 12,
    outputPath: defaultOutputPath,
    ids: null,
    apply: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--start') options.start = Number(argv[++index]);
    else if (value === '--limit') options.limit = Number(argv[++index]);
    else if (value === '--batch-size') options.batchSize = Number(argv[++index]);
    else if (value === '--output') options.outputPath = path.resolve(argv[++index]);
    else if (value === '--ids') options.ids = argv[++index].split(',').filter(Boolean);
    else if (value === '--apply') options.apply = true;
  }
  return options;
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function getBaseExamples(word) {
  const examples = word.studySense?.examples?.length
    ? word.studySense.examples
    : [...(word.examples ?? []), word.example].filter(Boolean);
  return examples.map(normalizeText).filter(Boolean);
}

function getBaseTranslations(word) {
  return (word.exampleTranslations ?? []).map(normalizeText).filter(Boolean);
}

function getBaseFocuses(word) {
  return (word.exampleTranslationFocus ?? []).map(normalizeText).filter(Boolean);
}

function getBaseCollocations(word) {
  return (word.exampleCollocations ?? []).map(normalizeText).filter(Boolean);
}

function getStudySense(word) {
  return word.studySense ?? word;
}

function getHeadword(english) {
  if (HEADWORD_OVERRIDES[english]) return HEADWORD_OVERRIDES[english];
  return english
    .replace(/\s+\([^)]*\)$/g, '')
    .replace(/\(([^)]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getTokenForms(token) {
  const lower = token.toLowerCase();
  const forms = new Set([token, `${token}s`, `${token}es`, ...IRREGULAR_FORMS[lower] ?? []]);
  if (token.endsWith('e')) {
    forms.add(`${token}d`);
    forms.add(`${token.slice(0, -1)}ing`);
  } else {
    forms.add(`${token}ed`);
    forms.add(`${token}ing`);
  }
  if (/[^aeiou]y$/i.test(token)) {
    forms.add(`${token.slice(0, -1)}ies`);
    forms.add(`${token.slice(0, -1)}ied`);
  }
  if (/^[A-Za-z]*[^aeiou][aeiou][^aeiouwxy]$/i.test(token)) {
    forms.add(`${token}${token.at(-1)}ed`);
    forms.add(`${token}${token.at(-1)}ing`);
  }
  return [...forms];
}

function containsHeadword(sentence, english) {
  const headword = getHeadword(english);
  const normalizedHeadword = headword.replace(/-/g, ' ');
  const words = normalizedHeadword.split(' ').filter(Boolean);
  const phraseForms = new Set([headword, normalizedHeadword, words.join('-')]);
  if (words[0]) {
    for (const form of getTokenForms(words[0])) phraseForms.add([form, ...words.slice(1)].join(' '));
  }
  if (words.length > 1) {
    for (const form of getTokenForms(words.at(-1))) phraseForms.add([...words.slice(0, -1), form].join(' '));
  }

  return [...phraseForms].some((form) => (
    new RegExp(`(^|[^A-Za-z])${escapeRegExp(form)}(?=$|[^A-Za-z])`, 'i').test(sentence)
  ));
}

function validateExample(word, example) {
  const sentence = normalizeText(example);
  const wordCount = sentence.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g)?.length ?? 0;
  const errors = [];
  if (!sentence) errors.push('empty');
  if (!containsHeadword(sentence, word.english)) errors.push('missing-headword');
  if (wordCount < 3 || wordCount > 15) errors.push('word-count');
  if (!/^[A-Z"']/u.test(sentence)) errors.push('capitalization');
  if (!/[.!?]"?$/u.test(sentence)) errors.push('punctuation');
  if (/[^\x00-\x7F]/u.test(sentence.replace(/[’]/g, ''))) errors.push('non-english');
  if (/^I can(?:\s|$)/i.test(sentence) || /^This is(?:\s|$)/i.test(sentence)) {
    errors.push('fallback-template');
  }
  return { sentence, errors };
}

function validateCollocations(word, collocations) {
  const normalized = Array.isArray(collocations) ? collocations.map(normalizeText) : [];
  const errors = [];
  if (normalized.length !== 3) errors.push(`collocations-length-${normalized.length}`);
  const unique = new Set(normalized.map((phrase) => phrase.toLowerCase()));
  if (unique.size !== normalized.length) errors.push('duplicate-collocations');
  for (const [index, phrase] of normalized.entries()) {
    const wordCount = phrase.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g)?.length ?? 0;
    if (!phrase) errors.push(`collocation-${index + 1}:empty`);
    if (!containsHeadword(phrase, word.english)) errors.push(`collocation-${index + 1}:missing-headword`);
    if (wordCount < 2 || wordCount > 8) errors.push(`collocation-${index + 1}:word-count`);
    if (/[^\x00-\x7F]/u.test(phrase.replace(/[’]/g, ''))) errors.push(`collocation-${index + 1}:non-english`);
    if (/[.!?]/u.test(phrase)) errors.push(`collocation-${index + 1}:sentence-like`);
  }
  return {
    valid: errors.length === 0,
    errors,
    collocations: normalized,
  };
}

function validateEntry(word, entry) {
  const collocations = Array.isArray(entry.exampleCollocations)
    ? entry.exampleCollocations.map(normalizeText)
    : [];
  const examples = Array.isArray(entry.examples) ? entry.examples.map(normalizeText) : [];
  const translations = Array.isArray(entry.exampleTranslations)
    ? entry.exampleTranslations.map(normalizeText)
    : [];
  const focuses = Array.isArray(entry.exampleTranslationFocus)
    ? entry.exampleTranslationFocus.map(normalizeText)
    : [];
  const errors = [];
  const collocationValidation = validateCollocations(word, collocations);
  if (!collocationValidation.valid) errors.push(...collocationValidation.errors);
  if (examples.length !== 3) errors.push(`examples-length-${examples.length}`);
  if (translations.length !== 3) errors.push(`translations-length-${translations.length}`);
  if (focuses.length !== 3) errors.push(`focuses-length-${focuses.length}`);

  const uniqueExamples = new Set(examples.map((sentence) => sentence.toLowerCase()));
  if (uniqueExamples.size !== examples.length) errors.push('duplicate-examples');
  for (const [index, example] of examples.entries()) {
    const validation = validateExample(word, example);
    if (validation.errors.length > 0) {
      errors.push(`example-${index + 1}:${validation.errors.join('|')}`);
    }
  }
  for (const [index, translation] of translations.entries()) {
    if (!/[\u3400-\u9fff]/u.test(translation)) errors.push(`translation-${index + 1}:no-chinese`);
    const focus = focuses[index] ?? '';
    if (!focus || !translation.includes(focus)) errors.push(`focus-${index + 1}:not-contained`);
  }
  return {
    valid: errors.length === 0,
    errors,
    entry: {
      id: word.id,
      exampleCollocations: collocations,
      examples,
      exampleTranslations: translations,
      exampleTranslationFocus: focuses,
    },
  };
}

async function readCheckpoint(outputPath) {
  try {
    const checkpoint = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    return new Map((checkpoint.entries ?? []).map((entry) => [entry.id, entry]));
  } catch (error) {
    if (error.code === 'ENOENT') return new Map();
    throw error;
  }
}

async function saveCheckpoint(outputPath, entriesById) {
  const entries = [...entriesById.values()].sort((left, right) => left.id.localeCompare(right.id));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(
    outputPath,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      models: {
        collocation: collocationModel,
        sentence: sentenceModel,
        translation: translationModel,
      },
      entries,
    }, null, 2)}\n`,
  );
}

function buildPromptItem(word, correction = null) {
  const studySense = getStudySense(word);
  const existingExamples = getBaseExamples(word);
  const existingTranslations = getBaseTranslations(word);
  const existingFocuses = getBaseFocuses(word);
  const existingCollocations = getBaseCollocations(word);
  const item = {
    id: word.id,
    headword: getHeadword(word.english),
    partOfSpeech: studySense.partOfSpeech,
    chineseMeaning: studySense.chinese,
    topic: word.category,
    keepExample1: {
      collocation: existingCollocations[0],
      english: existingExamples[0],
      chinese: existingTranslations[0],
      focus: existingFocuses[0],
    },
  };
  if (correction) item.correction = correction;
  return item;
}

async function requestJson({ modelName, temperature = 0.2, maxTokens = 2400, system, payload, schemaName, schema }) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
      temperature,
      max_tokens: maxTokens,
      reasoning_effort: 'none',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(payload, null, 2) },
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

const singleEntrySchemaBase = {
  type: 'object',
  properties: {
    id: { type: 'string' },
  },
  required: ['id'],
  additionalProperties: false,
};

async function requestCollocations(word, correction) {
  const item = buildPromptItem(word, correction);
  const body = await requestJson({
    modelName: collocationModel,
    temperature: 0.2,
    maxTokens: 1200,
    schemaName: 'ket_collocations',
    schema: {
      ...singleEntrySchemaBase,
      properties: {
        ...singleEntrySchemaBase.properties,
        exampleCollocations: {
          type: 'array',
          items: { type: 'string' },
          minItems: 3,
          maxItems: 3,
        },
      },
      required: ['id', 'exampleCollocations'],
    },
    system: [
      'You are a Cambridge A2 Key (KET) vocabulary teacher.',
      'Create exactly three useful English collocations or phrase chunks for one target word.',
      'Each collocation must visibly include the target headword or a valid inflected form.',
      'Each collocation must be a phrase, not a full sentence, with no final punctuation.',
      'Keep collocations child-friendly, common, and meaning-aligned with the Chinese meaning and part of speech.',
      'The three collocations must show different common uses or contexts.',
      'If keepExample1.collocation is present, keep it exactly as collocation 1.',
      'If keepExample1.collocation is missing, infer a short collocation from keepExample1.english for collocation 1.',
      'If correction is present, fix it exactly.',
    ].join(' '),
    payload: item,
  });
  if (body.id !== word.id) throw new Error(`Collocation id mismatch: ${body.id} !== ${word.id}`);
  return body.exampleCollocations;
}

async function requestExamples(word, collocations, correction) {
  const item = {
    ...buildPromptItem(word, correction),
    exampleCollocations: collocations,
  };
  const body = await requestJson({
    modelName: sentenceModel,
    temperature: 0.25,
    maxTokens: 1600,
    schemaName: 'ket_sentences',
    schema: {
      ...singleEntrySchemaBase,
      properties: {
        ...singleEntrySchemaBase.properties,
        examples: {
          type: 'array',
          items: { type: 'string' },
          minItems: 3,
          maxItems: 3,
        },
      },
      required: ['id', 'examples'],
    },
    system: [
      'You are an experienced Cambridge A2 Key (KET) teacher writing examples for a child.',
      'Write exactly three natural English example sentences.',
      'Keep keepExample1.english exactly as example 1.',
      'Examples 2 and 3 must each use the matching collocation from exampleCollocations 2 and 3.',
      'Each English sentence must include the target headword or a valid inflected form.',
      'Keep each sentence A2 level, 5-12 words when possible and never more than 15 words.',
      'Do not use generic templates "I can", "I can see", or "This is".',
      'Do not use story character names, direct speech, quotation marks, or Chinese.',
      'If correction is present, fix it exactly.',
    ].join(' '),
    payload: item,
  });
  if (body.id !== word.id) throw new Error(`Example id mismatch: ${body.id} !== ${word.id}`);
  const original = buildPromptItem(word);
  body.examples[0] = original.keepExample1.english;
  return body.examples;
}

async function requestTranslations(word, collocations, examples, correction) {
  const original = buildPromptItem(word);
  const item = {
    ...original,
    exampleCollocations: collocations,
    examples,
    correction,
  };
  const body = await requestJson({
    modelName: translationModel,
    temperature: 0.2,
    maxTokens: 1800,
    schemaName: 'ket_translations',
    schema: {
      ...singleEntrySchemaBase,
      properties: {
        ...singleEntrySchemaBase.properties,
        exampleTranslations: {
          type: 'array',
          items: { type: 'string' },
          minItems: 3,
          maxItems: 3,
        },
        exampleTranslationFocus: {
          type: 'array',
          items: { type: 'string' },
          minItems: 3,
          maxItems: 3,
        },
      },
      required: ['id', 'exampleTranslations', 'exampleTranslationFocus'],
    },
    system: [
      'You are a concise Simplified Chinese translator for child English-learning examples.',
      'Translate exactly three English examples into natural Simplified Chinese.',
      'Keep keepExample1.chinese exactly as translation 1.',
      'For each translation, provide the shortest contiguous Chinese focus phrase corresponding to the target headword.',
      'The focus phrase must be copied exactly from the Chinese translation.',
      'The focus phrase must point to the target headword itself, not to another noun or adjective inside the collocation.',
      'For phrases like "a group of friends", the focus for group is "一群", not "朋友"; apply this logic to all collocations.',
      'Prefer making the Chinese translation include chineseMeaning naturally, then use that exact phrase as the focus.',
      'The focus phrase should usually be one short word or phrase, not the whole sentence.',
      'Never put English text in translations or focus phrases.',
      'If correction is present, fix it exactly.',
    ].join(' '),
    payload: item,
  });
  if (body.id !== word.id) throw new Error(`Translation id mismatch: ${body.id} !== ${word.id}`);
  body.exampleTranslations[0] = original.keepExample1.chinese;
  body.exampleTranslationFocus[0] = original.keepExample1.focus;
  return {
    exampleTranslations: body.exampleTranslations,
    exampleTranslationFocus: body.exampleTranslationFocus,
  };
}

async function generateEntry(word) {
  let correction = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let generatedEntry = null;
    try {
      const exampleCollocations = await requestCollocations(word, correction);
      const collocationValidation = validateCollocations(word, exampleCollocations);
      if (!collocationValidation.valid) {
        correction = `${collocationValidation.errors.join(', ')}; previous=${JSON.stringify({ exampleCollocations })}`;
        continue;
      }

      const examples = await requestExamples(word, collocationValidation.collocations, correction);
      const translationResult = await requestTranslations(word, collocationValidation.collocations, examples, correction);
      generatedEntry = {
        id: word.id,
        exampleCollocations: collocationValidation.collocations,
        examples,
        exampleTranslations: translationResult.exampleTranslations,
        exampleTranslationFocus: translationResult.exampleTranslationFocus,
      };
      const validation = validateEntry(word, generatedEntry);
      if (validation.valid) return validation.entry;
      correction = `${validation.errors.join(', ')}; previous=${JSON.stringify(generatedEntry)}`;
    } catch (error) {
      correction = `${error.message}; previous=${JSON.stringify(generatedEntry)}`;
    }
    console.warn(`Retry ${attempt}/3 for ${word.id}: ${correction}`);
  }
  throw new Error(`Failed to generate examples for: ${word.id} (${correction})`);
}

async function generateBatch(words) {
  const accepted = [];
  for (const word of words) {
    accepted.push(await generateEntry(word));
  }
  return accepted;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const payload = JSON.parse(await fs.readFile(vocabularyPath, 'utf8'));
  const entriesById = await readCheckpoint(options.outputPath);
  const selectedWords = options.ids
    ? options.ids.map((id) => payload.words.find((word) => word.id === id)).filter(Boolean)
    : payload.words.slice(options.start, options.start + options.limit);
  const invalidBase = selectedWords.filter((word) => {
    const item = buildPromptItem(word);
    return !item.keepExample1.english || !item.keepExample1.chinese || !item.keepExample1.focus;
  });
  if (invalidBase.length > 0) {
    throw new Error(`Missing base example data for: ${invalidBase.map((word) => word.id).join(', ')}`);
  }

  for (const word of selectedWords) {
    const saved = entriesById.get(word.id);
    if (!saved) continue;
    const validation = validateEntry(word, saved);
    if (!validation.valid) entriesById.delete(word.id);
  }

  const pending = selectedWords.filter((word) => !entriesById.has(word.id));
  console.log(`Example-set progress: ${entriesById.size}/${selectedWords.length}; pending ${pending.length}`);
  for (let offset = 0; offset < pending.length; offset += options.batchSize) {
    const batch = pending.slice(offset, offset + options.batchSize);
    const generated = await generateBatch(batch);
    for (const entry of generated) entriesById.set(entry.id, entry);
    await saveCheckpoint(options.outputPath, entriesById);
    console.log(`Example-set progress: ${Math.min(offset + batch.length, pending.length)}/${pending.length}; saved ${entriesById.size}`);
  }

  if (options.apply) {
    for (const word of payload.words) {
      const entry = entriesById.get(word.id);
      if (!entry) continue;
      word.exampleCollocations = entry.exampleCollocations;
      word.examples = entry.examples;
      word.exampleTranslations = entry.exampleTranslations;
      word.exampleTranslationFocus = entry.exampleTranslationFocus;
      if (word.studySense?.examples?.length) {
        word.studySense.examples = entry.examples;
      }
    }
    await fs.writeFile(vocabularyPath, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`Applied ${entriesById.size} example sets to ${vocabularyPath}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
