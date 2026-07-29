import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vocabularyPath = path.join(root, 'public/content/words/ket_vocabulary.json');
const defaultOutputPath = path.join(root, 'tmp/ket-collocations.json');
const endpoint = process.env.LM_STUDIO_URL ?? 'http://127.0.0.1:1234/v1/chat/completions';
const model = process.env.KET_COLLOCATION_MODEL ?? process.env.LM_STUDIO_MODEL ?? 'qwen/qwen3-vl-30b';

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
    batchSize: 1,
    outputPath: defaultOutputPath,
    ids: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--start') options.start = Number(argv[++index]);
    else if (value === '--limit') options.limit = Number(argv[++index]);
    else if (value === '--batch-size') options.batchSize = Number(argv[++index]);
    else if (value === '--output') options.outputPath = path.resolve(argv[++index]);
    else if (value === '--ids') options.ids = argv[++index].split(',').filter(Boolean);
  }
  return options;
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function getStudySense(word) {
  return word.studySense ?? word;
}

function getBaseExample(word) {
  return normalizeText(word.studySense?.examples?.[0] ?? word.examples?.[0] ?? word.example);
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

function containsHeadword(text, english) {
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
    new RegExp(`(^|[^A-Za-z])${escapeRegExp(form)}(?=$|[^A-Za-z])`, 'i').test(text)
  ));
}

function validateExtraCollocations(word, collocations) {
  const normalized = Array.isArray(collocations) ? collocations.map(normalizeText) : [];
  const errors = [];
  const studySense = getStudySense(word);
  const isNoun = /\bn\b/i.test(studySense.partOfSpeech);
  const finiteVerbPattern = /\b(?:I|we|you|he|she|they|my|the|a|an|this|that|these|those|[A-Za-z]+)\s+(?:am|is|are|was|were|has|have|had|like|likes|liked|play|plays|played|run|runs|ran|walk|walks|walked|tell|tells|told|say|says|said|go|goes|went|live|lives|lived|work|works|worked|send|sends|sent|write|writes|wrote|read|reads|cook|cooks|cooked|make|makes|made|help|helps|helped|visit|visits|visited)\b/i;
  if (normalized.length !== 2) errors.push(`collocations-length-${normalized.length}`);
  const unique = new Set(normalized.map((phrase) => phrase.toLowerCase()));
  if (unique.size !== normalized.length) errors.push('duplicate-collocations');
  for (const [index, phrase] of normalized.entries()) {
    const wordCount = phrase.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g)?.length ?? 0;
    if (!phrase) errors.push(`collocation-${index + 1}:empty`);
    if (!containsHeadword(phrase, word.english)) errors.push(`collocation-${index + 1}:missing-headword`);
    if (wordCount < 2 || wordCount > 8) errors.push(`collocation-${index + 1}:word-count`);
    if (/[^\x00-\x7F]/u.test(phrase.replace(/[’]/g, ''))) errors.push(`collocation-${index + 1}:non-english`);
    if (/[.!?]/u.test(phrase)) errors.push(`collocation-${index + 1}:sentence-like`);
    if (isNoun && finiteVerbPattern.test(phrase)) errors.push(`collocation-${index + 1}:clause-like`);
  }
  return {
    valid: errors.length === 0,
    errors,
    collocations: normalized,
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
    `${JSON.stringify({ generatedAt: new Date().toISOString(), model, entries }, null, 2)}\n`,
  );
}

function buildPromptItem(word, correction = null) {
  const studySense = getStudySense(word);
  const item = {
    id: word.id,
    headword: getHeadword(word.english),
    partOfSpeech: studySense.partOfSpeech,
    chineseMeaning: studySense.chinese,
    topic: word.category,
    baseExample: getBaseExample(word),
  };
  if (correction) item.correction = correction;
  return item;
}

async function requestJson({ payload, schema }) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 3200,
      reasoning_effort: 'none',
      messages: [
        {
          role: 'system',
          content: [
            'You are a Cambridge A2 Key (KET) vocabulary teacher.',
            'For each input item, generate exactly two useful English collocations or phrase chunks.',
            'These are extra collocations; do not copy the baseExample phrase if possible.',
            'Each collocation must visibly include the target headword or a valid inflected form.',
            'Each collocation must be a phrase, not a full sentence, with no final punctuation.',
            'Do not output a subject-verb clause like "the boy runs fast" or "the girl likes music".',
            'For noun headwords, avoid finite verbs after the noun; use phrase chunks like "my sister at home", not "my sister likes pink".',
            'Prefer useful chunks such as noun phrases, verb-object phrases, adjective phrases, or prepositional phrases.',
            'For nouns, prefer chunks like "a young boy", "a boy with a red hat", or "my aunt at home".',
            'Keep collocations child-friendly, common, natural, and aligned with the Chinese meaning and part of speech.',
            'The two collocations must show different common uses or contexts.',
            'Return exactly one entry per input id and no extra ids.',
            'If correction is present, fix those validation errors exactly.',
          ].join(' '),
        },
        { role: 'user', content: JSON.stringify(payload, null, 2) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'ket_extra_collocations',
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

async function requestBatch(items) {
  const schema = {
    type: 'object',
    properties: {
      entries: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            extraCollocations: {
              type: 'array',
              items: { type: 'string' },
              minItems: 2,
              maxItems: 2,
            },
          },
          required: ['id', 'extraCollocations'],
          additionalProperties: false,
        },
      },
    },
    required: ['entries'],
    additionalProperties: false,
  };
  const body = await requestJson({
    payload: items.map(({ word, correction }) => buildPromptItem(word, correction)),
    schema,
  });
  return body.entries;
}

async function generateBatch(words) {
  let unresolved = words.map((word) => ({ word, correction: null }));
  const accepted = [];
  for (let attempt = 1; attempt <= 3 && unresolved.length > 0; attempt += 1) {
    const generated = await requestBatch(unresolved);
    const generatedById = new Map(generated.map((entry) => [entry.id, entry]));
    const retry = [];
    for (const item of unresolved) {
      const generatedEntry = generatedById.get(item.word.id);
      const validation = validateExtraCollocations(item.word, generatedEntry?.extraCollocations);
      if (validation.valid) {
        accepted.push({
          id: item.word.id,
          headword: getHeadword(item.word.english),
          extraCollocations: validation.collocations,
        });
      } else {
        retry.push({
          word: item.word,
          correction: `${validation.errors.join(', ')}; previous=${JSON.stringify(generatedEntry)}`,
        });
      }
    }
    if (retry.length > 0) {
      console.warn(`Retry ${attempt}/3 for ${retry.length} words: ${retry.map(({ word }) => word.id).join(', ')}`);
    }
    unresolved = retry;
  }
  if (unresolved.length > 0) {
    throw new Error(`Failed to generate collocations for: ${unresolved.map(({ word, correction }) => `${word.id} (${correction})`).join('; ')}`);
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

  for (const word of selectedWords) {
    const saved = entriesById.get(word.id);
    if (!saved) continue;
    const validation = validateExtraCollocations(word, saved.extraCollocations);
    if (!validation.valid) entriesById.delete(word.id);
  }

  const pending = selectedWords.filter((word) => !entriesById.has(word.id));
  console.log(`Collocation progress: ${entriesById.size}/${selectedWords.length}; pending ${pending.length}`);
  for (let offset = 0; offset < pending.length; offset += options.batchSize) {
    const batch = pending.slice(offset, offset + options.batchSize);
    const generated = await generateBatch(batch);
    for (const entry of generated) entriesById.set(entry.id, entry);
    await saveCheckpoint(options.outputPath, entriesById);
    console.log(`Collocation progress: ${Math.min(offset + batch.length, pending.length)}/${pending.length}; saved ${entriesById.size}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
