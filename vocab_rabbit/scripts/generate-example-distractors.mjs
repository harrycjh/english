import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { getTokenForms } from './generate-teaching-chunk-examples.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vocabularyPath = path.join(root, 'public/content/words/ket_vocabulary.json');
const defaultOutputPath = path.join(root, 'tmp/example-distractors.json');
const endpoint = process.env.LM_STUDIO_URL ?? 'http://127.0.0.1:1234/v1/chat/completions';
const model = process.env.EXAMPLE_DISTRACTOR_MODEL ?? 'google/gemma-4-26b-a4b-qat';

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

function parseArguments(argv) {
  const options = {
    outputPath: defaultOutputPath,
    batchSize: 80,
    concurrency: 1,
    limit: Number.POSITIVE_INFINITY,
    apply: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--output') options.outputPath = path.resolve(argv[++index]);
    else if (value === '--batch-size') options.batchSize = Number(argv[++index]);
    else if (value === '--concurrency') options.concurrency = Number(argv[++index]);
    else if (value === '--limit') options.limit = Number(argv[++index]);
    else if (value === '--apply') options.apply = true;
  }
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 100) {
    throw new Error('--batch-size must be an integer from 1 to 100');
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 4) {
    throw new Error('--concurrency must be an integer from 1 to 4');
  }
  return options;
}

function hashText(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function partOfSpeechTags(word) {
  const knownTags = new Set(['n', 'v', 'adj', 'adv', 'prep', 'pron', 'det', 'conj', 'mv']);
  const declaredTags = ((word.studySense ?? word).partOfSpeech ?? '')
    .match(/[a-z]+/gi)
    ?.map((tag) => tag.toLowerCase())
    .filter((tag) => knownTags.has(tag)) ?? [];
  if (declaredTags.length > 0) return new Set(declaredTags);
  return new Set(word.id.split('_').filter((tag) => knownTags.has(tag)));
}

function sharesPartOfSpeech(target, candidate) {
  const targetTags = partOfSpeechTags(target);
  return [...partOfSpeechTags(candidate)].some((tag) => targetTags.has(tag));
}

function normalizedChinese(word) {
  return ((word.studySense ?? word).chinese ?? '')
    .replace(/[；;,，、\s]/g, '')
    .toLowerCase();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function headwordForms(english) {
  const headword = HEADWORD_OVERRIDES[english] ?? english
    .replace(/\s+\([^)]*\)$/g, '')
    .replace(/\(([^)]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  const normalized = headword.replace(/-/g, ' ');
  const words = normalized.split(/\s+/);
  const forms = new Set([headword, normalized, words.join('-')]);
  for (const first of getTokenForms(words[0])) forms.add([first, ...words.slice(1)].join(' '));
  if (words.length > 1) {
    for (const last of getTokenForms(words.at(-1))) forms.add([...words.slice(0, -1), last].join(' '));
  }
  return [...forms].sort((left, right) => right.length - left.length);
}

export function maskHeadword(sentence, english) {
  for (const form of headwordForms(english)) {
    const pattern = escapeRegExp(form).replace(/(?:\\ |\\-)+/g, '[\\s-]+');
    const match = new RegExp(`(^|[^A-Za-z])(${pattern})(?=$|[^A-Za-z])`, 'i').exec(sentence);
    if (!match || match.index === undefined) continue;
    const start = match.index + match[1].length;
    return `${sentence.slice(0, start)}_____${sentence.slice(start + match[2].length)}`;
  }
  return sentence;
}

export function buildDistractorCandidateIds(word, allWords, exampleIndex, limit = 15) {
  const targetText = word.english.toLowerCase();
  const targetChinese = normalizedChinese(word);
  return allWords
    .filter((candidate) => (
      candidate.id !== word.id
      && candidate.english.toLowerCase() !== targetText
      && normalizedChinese(candidate) !== targetChinese
    ))
    .sort((left, right) => {
      const leftPartOfSpeech = sharesPartOfSpeech(word, left) ? 0 : 1;
      const rightPartOfSpeech = sharesPartOfSpeech(word, right) ? 0 : 1;
      if (leftPartOfSpeech !== rightPartOfSpeech) return leftPartOfSpeech - rightPartOfSpeech;
      // Different semantic categories are less likely to create a second valid
      // answer while still preserving the grammar of the cloze.
      const leftCategory = left.category === word.category ? 1 : 0;
      const rightCategory = right.category === word.category ? 1 : 0;
      if (leftCategory !== rightCategory) return leftCategory - rightCategory;
      const leftDifficulty = Math.abs(left.difficulty - word.difficulty);
      const rightDifficulty = Math.abs(right.difficulty - word.difficulty);
      if (leftDifficulty !== rightDifficulty) return leftDifficulty - rightDifficulty;
      return hashText(`${word.id}:${exampleIndex}:${left.id}`)
        - hashText(`${word.id}:${exampleIndex}:${right.id}`);
    })
    .slice(0, limit)
    .map((candidate) => candidate.id);
}

export function collectDistractorTargets(vocabulary) {
  const wordsById = new Map(vocabulary.words.map((word) => [word.id, word]));
  return vocabulary.words.flatMap((word) => (
    (word.examples ?? []).flatMap((sentence, exampleIndex) => {
      const collocation = word.exampleCollocations?.[exampleIndex];
      if (!collocation) return [];
      const candidateIds = buildDistractorCandidateIds(word, vocabulary.words, exampleIndex);
      return [{
        key: `${word.id}::${exampleIndex}`,
        id: word.id,
        exampleIndex,
        headword: word.english,
        headwordChinese: (word.studySense ?? word).chinese,
        partOfSpeech: (word.studySense ?? word).partOfSpeech,
        collocation,
        sentence,
        maskedSentence: maskHeadword(sentence, word.english),
        translation: word.exampleTranslations?.[exampleIndex] ?? '',
        candidates: candidateIds.map((id) => {
          const candidate = wordsById.get(id);
          return {
            id,
            english: candidate.english,
            chinese: (candidate.studySense ?? candidate).chinese,
            partOfSpeech: (candidate.studySense ?? candidate).partOfSpeech,
          };
        }),
      }];
    })
  ));
}

export async function requestSelections(items) {
  const selectionItems = items.map((item) => ({
    key: item.key,
    headword: item.headword,
    sentence: item.sentence,
    maskedSentence: item.maskedSentence,
    candidates: item.candidates.map(({ id, english }) => ({ id, english })),
  }));
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.05,
      max_tokens: Math.max(1200, items.length * 100),
      reasoning_effort: 'none',
      messages: [
        {
          role: 'system',
          content: [
            'You select safe distractors for a four-option English sentence cloze in a child vocabulary app.',
            'The headword is the only correct answer. Choose exactly three candidate IDs.',
            'Each distractor must have a compatible part of speech and be plausible enough to be a useful option, but it must make the supplied sentence clearly unnatural or semantically wrong.',
            'Reject synonyms, near-synonyms, alternate spellings, words that create another valid collocation, and words that could fit under a reasonable interpretation.',
            'Judge the complete sentence and collocation, not merely the Chinese meaning.',
            'Evaluate each candidate as if it were inserted into maskedSentence. Reject a candidate if it forms another valid compound, phrase, idiom, or reasonable sentence, such as grandson in great-_____ because great-grandson is valid.',
            'Candidate verbs and nouns will be automatically inflected to match the correct answer, so judge their base meanings.',
            'Before returning, audit each of your three choices against the complete sentence.',
            'Set validAlternative=true if a choice could genuinely be accepted in standard child-level English; otherwise set it to false.',
            'A merely grammatical fragment is not enough when the complete sentence is semantically impossible. When uncertain, use true and the item will be retried.',
            'Return every key exactly once, use only supplied candidate IDs, and return the booleans in the same order as distractorIds.',
          ].join(' '),
        },
        { role: 'user', content: JSON.stringify({ items: selectionItems }) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'example_distractor_selection',
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
                    distractorIds: {
                      type: 'array',
                      minItems: 3,
                      maxItems: 3,
                      items: { type: 'string' },
                    },
                    validAlternatives: {
                      type: 'array',
                      minItems: 3,
                      maxItems: 3,
                      items: { type: 'boolean' },
                    },
                  },
                  required: ['key', 'distractorIds', 'validAlternatives'],
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
  if (!content) throw new Error('LM Studio returned no content');
  return JSON.parse(content).items ?? [];
}

function validateSelection(target, selection) {
  const candidateIds = new Set(target.candidates.map((candidate) => candidate.id));
  const ids = selection?.distractorIds ?? [];
  return ids.length === 3
    && new Set(ids).size === 3
    && ids.every((id) => candidateIds.has(id));
}

function validateAuditResponse(selection, audit) {
  const values = audit?.validAlternatives ?? [];
  return values.length === selection.distractorIds.length
    && values.every((value) => typeof value === 'boolean');
}

async function selectBatch(targets) {
  let pending = [...targets];
  const selected = new Map();
  const acceptedByKey = new Map(targets.map((target) => [target.key, new Set()]));
  const rejectedByKey = new Map(targets.map((target) => [target.key, new Set()]));
  const auditByKey = new Map(targets.map((target) => [target.key, []]));
  for (let attempt = 1; attempt <= 8 && pending.length > 0; attempt += 1) {
    const response = await requestSelections(pending);
    if (process.env.DEBUG_EXAMPLE_DISTRACTORS === '1') {
      console.warn(`Raw distractor response: ${JSON.stringify(response)}`);
    }
    const byKey = new Map(response.map((item) => [item.key, item]));
    const nextPending = [];
    for (const target of pending) {
      const selection = byKey.get(target.key);
      if (!validateSelection(target, selection) || !validateAuditResponse(selection, selection)) {
        nextPending.push(target);
        continue;
      }
      const acceptedIds = acceptedByKey.get(target.key);
      const rejectedIds = rejectedByKey.get(target.key);
      const assessments = selection.distractorIds.map((id, index) => ({
        id,
        validAlternative: selection.validAlternatives[index],
      }));
      auditByKey.get(target.key).push(...assessments);
      for (const assessment of assessments) {
        if (assessment.validAlternative) rejectedIds.add(assessment.id);
        else acceptedIds.add(assessment.id);
      }
      if (acceptedIds.size >= 3) {
        selected.set(target.key, {
          ...target,
          distractorIds: [...acceptedIds].slice(0, 3),
          reason: 'Selected after sentence-level substitution audit.',
          audit: auditByKey.get(target.key),
        });
        continue;
      }
      const unavailableIds = new Set([...acceptedIds, ...rejectedIds]);
      const candidates = target.candidates.filter((candidate) => !unavailableIds.has(candidate.id));
      if (candidates.length < 3) throw new Error(`Distractor candidates exhausted for ${target.key}`);
      nextPending.push({ ...target, candidates });
    }
    pending = nextPending;
    if (pending.length > 0) console.warn(`Distractor retry ${attempt}/8 for ${pending.length} items`);
  }
  if (pending.length > 0) throw new Error(`Failed distractor selection: ${pending.map((item) => item.key).join(', ')}`);
  return [...selected.values()];
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

async function saveCheckpoint(outputPath, entries, total) {
  const items = [...entries.values()].sort((left, right) => left.key.localeCompare(right.key));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    model,
    stats: { total, complete: items.length },
    items,
  }, null, 2)}\n`);
}

export function applyDistractors(vocabulary, selections) {
  const byKey = new Map(selections.map((item) => [item.key, item.distractorIds]));
  for (const word of vocabulary.words) {
    const distractors = (word.examples ?? []).map((_, exampleIndex) => (
      byKey.get(`${word.id}::${exampleIndex}`) ?? []
    ));
    if (distractors.some((ids) => ids.length > 0)) word.exampleDistractorIds = distractors;
    else delete word.exampleDistractorIds;
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const vocabulary = JSON.parse(await fs.readFile(vocabularyPath, 'utf8'));
  const targets = collectDistractorTargets(vocabulary).slice(0, options.limit);
  const checkpoint = await readCheckpoint(options.outputPath);
  const pending = targets.filter((target) => !checkpoint.has(target.key));
  console.log(`Distractor progress: ${targets.length - pending.length}/${targets.length}; pending ${pending.length}`);
  const windowSize = options.batchSize * options.concurrency;
  for (let offset = 0; offset < pending.length; offset += windowSize) {
    const batches = Array.from({ length: options.concurrency }, (_, batchIndex) => (
      pending.slice(
        offset + batchIndex * options.batchSize,
        offset + (batchIndex + 1) * options.batchSize,
      )
    )).filter((batch) => batch.length > 0);
    const selections = (await Promise.all(batches.map((batch) => selectBatch(batch)))).flat();
    for (const item of selections) checkpoint.set(item.key, item);
    await saveCheckpoint(options.outputPath, checkpoint, targets.length);
    const processed = selections.length;
    console.log(`Distractor progress: ${Math.min(offset + processed, pending.length)}/${pending.length}; saved ${checkpoint.size}`);
  }
  if (options.apply) {
    if (checkpoint.size !== targets.length) throw new Error('Cannot apply incomplete distractor selections');
    applyDistractors(vocabulary, [...checkpoint.values()]);
    await fs.writeFile(vocabularyPath, `${JSON.stringify(vocabulary, null, 2)}\n`);
    console.log(`Applied reviewed distractors to ${targets.length} examples`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
