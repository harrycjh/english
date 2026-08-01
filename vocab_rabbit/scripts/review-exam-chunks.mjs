import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { normalizePhrase } from './exam-chunk-sources.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vocabularyPath = path.join(root, 'public/content/words/ket_vocabulary.json');
const defaultInputPath = path.join(root, 'tmp/exam-chunks/generated-candidates.completed.json');
const defaultOutputPath = path.join(root, 'tmp/exam-chunks/reviewed.json');
const endpoint = process.env.LM_STUDIO_URL ?? 'http://127.0.0.1:1234/v1/chat/completions';
const model = process.env.EXAM_CHUNK_REVIEW_MODEL ?? 'qwen/qwen3.6-27b';
const maxOutputTokens = Number(process.env.EXAM_CHUNK_REVIEW_MAX_TOKENS ?? 16000);

const CHUNK_TYPES = [
  'phrasal_verb',
  'fixed_expression',
  'preposition_pattern',
  'idiom',
  'lexical_collocation',
  'sentence_frame',
  'conventional_compound',
];
const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2'];

function parseArguments(argv) {
  const options = {
    inputPath: defaultInputPath,
    outputPath: defaultOutputPath,
    start: 0,
    limit: Number.POSITIVE_INFINITY,
    ids: null,
    maxWordsPerRequest: 6,
    maxChunksPerRequest: 90,
    apply: false,
    phrasesOnly: false,
    recallPreserving: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--input') options.inputPath = path.resolve(argv[++index]);
    else if (value === '--output') options.outputPath = path.resolve(argv[++index]);
    else if (value === '--start') options.start = Number(argv[++index]);
    else if (value === '--limit') options.limit = Number(argv[++index]);
    else if (value === '--ids') options.ids = argv[++index].split(',').filter(Boolean);
    else if (value === '--max-words-per-request') options.maxWordsPerRequest = Number(argv[++index]);
    else if (value === '--max-chunks-per-request') options.maxChunksPerRequest = Number(argv[++index]);
    else if (value === '--apply') options.apply = true;
    else if (value === '--phrases-only') options.phrasesOnly = true;
    else if (value === '--recall-preserving') options.recallPreserving = true;
  }
  return options;
}

function chunkKey(phrase) {
  return normalizePhrase(phrase)
    .toLowerCase()
    .replace(/[_–—-]+/g, ' ')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenForms(token) {
  const forms = new Set([token]);
  if (token.endsWith('ied') && token.length > 4) forms.add(`${token.slice(0, -3)}y`);
  if (token.endsWith('ies') && token.length > 4) forms.add(`${token.slice(0, -3)}y`);
  if (token.endsWith('ing') && token.length > 4) {
    const stem = token.slice(0, -3);
    forms.add(stem);
    forms.add(`${stem}e`);
  }
  if (token.endsWith('ed') && token.length > 3) {
    forms.add(token.slice(0, -2));
    forms.add(token.slice(0, -1));
  }
  if (token.endsWith('es') && token.length > 3) forms.add(token.slice(0, -2));
  if (token.endsWith('s') && token.length > 3) forms.add(token.slice(0, -1));
  return forms;
}

function tokensEquivalent(left, right) {
  const rightForms = tokenForms(right);
  return [...tokenForms(left)].some((form) => rightForms.has(form));
}

function containsEquivalentSequence(container, candidate) {
  if (candidate.length > container.length) return false;
  for (let offset = 0; offset <= container.length - candidate.length; offset += 1) {
    if (candidate.every((token, index) => tokensEquivalent(container[offset + index], token))) {
      return true;
    }
  }
  return false;
}

function findSourceChunk(inputByPhrase, key) {
  const exact = inputByPhrase.get(key);
  if (exact) return exact;
  const compactKey = key.replace(/\s+/g, '');
  const paddedKey = ` ${key} `;
  const compatible = [...inputByPhrase.entries()]
    .filter(([inputKey]) => {
      const keyTokens = key.split(' ');
      const inputTokens = inputKey.split(' ');
      const lengthDifference = Math.abs(keyTokens.length - inputTokens.length);
      return inputKey.replace(/\s+/g, '') === compactKey
        || (
          lengthDifference <= 2
          && (
            paddedKey.includes(` ${inputKey} `)
            || ` ${inputKey} `.includes(paddedKey)
            || containsEquivalentSequence(keyTokens, inputTokens)
            || containsEquivalentSequence(inputTokens, keyTokens)
          )
        );
    })
    .sort((left, right) => right[0].length - left[0].length);
  return compatible[0]?.[1];
}

export function packReviewEntries(entries, options) {
  const batches = [];
  let current = [];
  let chunkCount = 0;
  for (const entry of entries) {
    const nextCount = entry.chunks.length;
    if (
      current.length > 0
      && (
        current.length >= options.maxWordsPerRequest
        || chunkCount + nextCount > options.maxChunksPerRequest
      )
    ) {
      batches.push(current);
      current = [];
      chunkCount = 0;
    }
    current.push(entry);
    chunkCount += nextCount;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

export function splitReviewEntries(entries, maxChunksPerEntry) {
  return entries.flatMap((entry) => {
    const partCount = Math.max(1, Math.ceil(entry.chunks.length / maxChunksPerEntry));
    return Array.from({ length: partCount }, (_, part) => ({
      ...entry,
      id: `${entry.id}#${part}`,
      wordId: entry.id,
      validationChunks: entry.chunks,
      chunks: entry.chunks.slice(part * maxChunksPerEntry, (part + 1) * maxChunksPerEntry),
    }));
  });
}

export function combineReviewEntries(entries, reviewedTasksById) {
  return entries.map((entry) => {
    const chunksByPhrase = new Map();
    const tasks = [...reviewedTasksById.values()].filter((task) => task.wordId === entry.id);
    if (tasks.length === 0) throw new Error(`Missing reviewed tasks for ${entry.id}`);
    for (const task of tasks) {
      for (const chunk of task.chunks) {
        const key = chunkKey(chunk.phrase);
        const existing = chunksByPhrase.get(key);
        if (existing) {
          existing.sources = [...new Set([...existing.sources, ...chunk.sources])].sort();
        } else {
          chunksByPhrase.set(key, {
            ...chunk,
            sources: [...new Set(chunk.sources)].sort(),
          });
        }
      }
    }
    return {
      id: entry.id,
      chunks: [...chunksByPhrase.values()].sort((left, right) => left.phrase.localeCompare(right.phrase)),
    };
  });
}

function validateChunk(chunk, phrasesOnly) {
  const phrase = normalizePhrase(chunk?.phrase).toLowerCase();
  if (phrasesOnly) {
    return {
      valid: Boolean(phrase),
      errors: phrase ? [] : ['phrase'],
      chunk: { phrase },
    };
  }
  const chinese = normalizePhrase(chunk?.chinese);
  const sense = normalizePhrase(chunk?.sense);
  const errors = [];
  if (!phrase) errors.push('phrase');
  if (!/[\u3400-\u9fff]/u.test(chinese)) errors.push('chinese');
  if (!sense) errors.push('sense');
  if (!CHUNK_TYPES.includes(chunk?.type)) errors.push('type');
  if (!CEFR_LEVELS.includes(chunk?.cefr)) errors.push('cefr');
  return {
    valid: errors.length === 0,
    errors,
    chunk: {
      phrase,
      chinese,
      sense,
      type: chunk?.type,
      cefr: chunk?.cefr,
    },
  };
}

export function validateReviewResult(inputEntry, result, phrasesOnly = false, acceptFiltered = false) {
  const structuralErrors = [];
  const chunkErrors = [];
  if (result?.id !== inputEntry.id) structuralErrors.push('id');
  if (!Array.isArray(result?.chunks)) structuralErrors.push('chunks');
  const validationChunks = inputEntry.validationChunks ?? inputEntry.chunks;
  const inputByPhrase = new Map(validationChunks.map((chunk) => [chunkKey(chunk.phrase), chunk]));
  const chunks = [];
  const seen = new Set();
  for (const rawChunk of result?.chunks ?? []) {
    const validation = validateChunk(rawChunk, phrasesOnly);
    const key = chunkKey(validation.chunk.phrase);
    const sourceChunk = findSourceChunk(inputByPhrase, key);
    if (!sourceChunk) validation.errors.push('not-in-input');
    if (validation.errors.length > 0) {
      chunkErrors.push(`${validation.chunk.phrase || 'unknown'}:${validation.errors.join('|')}`);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    chunks.push({
      ...validation.chunk,
      sources: sourceChunk.sources,
    });
  }
  const errors = [...structuralErrors, ...chunkErrors];
  return {
    valid: structuralErrors.length === 0 && (chunkErrors.length === 0 || acceptFiltered),
    errors,
    chunks,
  };
}

export function indexReviewEntries(pending, entries) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  if (pending.length === 1 && entries.length === 0) {
    byId.set(pending[0].id, {
      id: pending[0].id,
      chunks: [],
    });
  } else if (pending.length === 1 && entries.length === 1 && !byId.has(pending[0].id)) {
    byId.set(pending[0].id, {
      ...entries[0],
      id: pending[0].id,
    });
  }
  return byId;
}

export function seedEmptyReviewTasks(tasks, reviewedTasksById) {
  for (const task of tasks) {
    if (task.chunks.length === 0 && !reviewedTasksById.has(task.id)) {
      reviewedTasksById.set(task.id, {
        id: task.id,
        wordId: task.wordId ?? task.id,
        chunks: [],
      });
    }
  }
  return reviewedTasksById;
}

function buildResponseSchema(phrasesOnly) {
  const chunkProperties = phrasesOnly
    ? { phrase: { type: 'string' } }
    : {
        phrase: { type: 'string' },
        chinese: { type: 'string' },
        sense: { type: 'string' },
        type: { type: 'string', enum: CHUNK_TYPES },
        cefr: { type: 'string', enum: CEFR_LEVELS },
      };
  const chunkRequired = phrasesOnly
    ? ['phrase']
    : ['phrase', 'chinese', 'sense', 'type', 'cefr'];
  return {
  type: 'object',
  properties: {
    entries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          chunks: {
            type: 'array',
            items: {
              type: 'object',
              properties: chunkProperties,
              required: chunkRequired,
              additionalProperties: false,
            },
          },
        },
        required: ['id', 'chunks'],
        additionalProperties: false,
      },
    },
  },
  required: ['entries'],
  additionalProperties: false,
  };
}

async function requestReview(entries, options, correction = null) {
  const { phrasesOnly, recallPreserving } = options;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: maxOutputTokens,
      reasoning_effort: 'none',
      messages: [
        {
          role: 'system',
          content: [
            'You are the final lexicographic reviewer for a TOEFL Primary and TOEFL Junior exam-chunk dictionary, limited to CEFR A1-B2.',
            'For each word, return a subset of the supplied chunks. Keep all genuinely conventional, useful exam chunks and delete everything else.',
            'Do not invent unrelated phrases. You may only expand a supplied phrase by up to two grammatical words to give its complete canonical teaching form, such as good at to be good at or good time to have a good time.',
            'A phrasal_verb is a verb plus particle/preposition functioning as one lexical unit, such as look after or take off.',
            'A preposition_pattern is a word with a required preposition, such as be good at or interested in.',
            'An idiom has a meaning not directly predictable from its words.',
            'A fixed_expression is a fixed or semi-fixed formula, such as after all or one after another.',
            'A lexical_collocation must be a strongly conventional pairing with restricted substitution, such as make a decision, heavy rain, or pay attention.',
            'A sentence_frame is a conventional reusable frame, not a complete one-off sentence, such as would you like.',
            'A conventional_compound is an established lexical term, such as bus stop or credit card.',
            'For every proposed lexical_collocation, apply a substitution test: keep it only when native usage strongly prefers the pairing or the whole has a conventional sense; delete ordinary compositional adjective-noun, verb-object, adverb-adjective, and modal-verb combinations.',
            'Delete transparent free combinations such as can swim, can help, can wait, change clothes, wash hands, good book, good weather, very good, young aunt, and arbitrary subject-verb clauses.',
            'Delete rare, archaic, literary, technical, offensive, adult, region-specific, culture-specific, and above-B2 material, including expressions such as carry the can.',
            'Prefer the complete canonical teaching form. When two supplied phrases teach the same pattern, keep be good at rather than good at, and have a good time rather than good time.',
            'Keep a shorter phrase only when it has an independent conventional meaning or use.',
            'Different meanings from the base word are allowed and desirable when the phrase is a useful exam point.',
            phrasesOnly
              ? [
                  recallPreserving
                    ? 'This is a recall-preserving first filter: if an item may be an established useful chunk, keep it; delete only clearly free combinations or clearly out-of-scope items.'
                    : 'This is a strict independent voting pass. Keep an item only when it is clearly an established, useful A1-B2 chunk; delete doubtful, weak, or freely compositional combinations.',
                  'Return only the exact phrase text for kept items. Do not add meanings or labels in this filtering pass.',
                ].join(' ')
              : [
                  recallPreserving
                    ? 'This is a recall-preserving detail pass: if an item may be an established useful chunk, keep it; delete only clearly free combinations or clearly out-of-scope items.'
                    : '',
                  'Correct wrong Chinese meanings, English sense explanations, type labels, and CEFR labels while preserving the exact phrase text.',
                ].filter(Boolean).join(' '),
            'Keep every qualifying item; there is no target count and an empty array is valid.',
            'Return exactly one entry for every input id and no extra ids.',
            correction ? `Correct these previous validation problems: ${correction}` : '',
          ].filter(Boolean).join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify(entries.map((entry) => ({
            id: entry.id,
            english: entry.english,
            partOfSpeech: entry.partOfSpeech,
            chineseMeaning: entry.chineseMeaning,
            chunks: entry.chunks.map(({ sources: _sources, ...chunk }) => chunk),
          }))),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'vocarabbit_exam_chunk_review',
          strict: true,
          schema: buildResponseSchema(phrasesOnly),
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

async function reviewBatch(entries, options) {
  let pending = entries;
  const accepted = [];
  let correction = null;
  for (let attempt = 1; attempt <= 3 && pending.length > 0; attempt += 1) {
    let body;
    try {
      body = await requestReview(pending, options, correction);
    } catch (error) {
      correction = `request-error:${error.message}`;
      console.warn(`Review retry ${attempt}/3: ${correction}`);
      continue;
    }
    const byId = indexReviewEntries(pending, body.entries ?? []);
    const retry = [];
    const retryErrors = [];
    for (const entry of pending) {
      const validation = validateReviewResult(
        entry,
        byId.get(entry.id),
        options.phrasesOnly,
        attempt === 3,
      );
      if (validation.valid) {
        accepted.push({
          id: entry.id,
          wordId: entry.wordId ?? entry.id,
          chunks: validation.chunks,
        });
      } else {
        retry.push(entry);
        retryErrors.push(`${entry.id}:${validation.errors.join(',')}`);
      }
    }
    pending = retry;
    correction = retryErrors.join('; ');
    if (retry.length > 0) console.warn(`Review retry ${attempt}/3: ${correction}`);
  }
  if (pending.length > 0) {
    throw new Error(`Failed to review ${pending.map((entry) => entry.id).join(', ')}`);
  }
  return accepted;
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

async function saveOutput(outputPath, entriesById) {
  const entries = [...entriesById.values()].sort((left, right) => left.id.localeCompare(right.id));
  const stats = {
    words: entries.length,
    wordsWithChunks: entries.filter((entry) => entry.chunks.length > 0).length,
    chunks: entries.reduce((sum, entry) => sum + entry.chunks.length, 0),
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    model,
    stats,
    entries,
  }, null, 2)}\n`);
  return stats;
}

async function applyToVocabulary(reviewedEntriesById, vocabulary) {
  if (reviewedEntriesById.size !== vocabulary.words.length) {
    throw new Error(`Refusing partial apply: reviewed ${reviewedEntriesById.size}/${vocabulary.words.length} words`);
  }
  for (const word of vocabulary.words) {
    const reviewed = reviewedEntriesById.get(word.id);
    if (!reviewed) throw new Error(`Missing reviewed entry for ${word.id}`);
    word.examChunks = reviewed.chunks;
  }
  await fs.writeFile(vocabularyPath, `${JSON.stringify(vocabulary, null, 2)}\n`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const vocabulary = JSON.parse(await fs.readFile(vocabularyPath, 'utf8'));
  const generated = JSON.parse(await fs.readFile(options.inputPath, 'utf8'));
  const generatedById = new Map(generated.entries.map((entry) => [entry.id, entry]));
  const selectedWords = options.ids
    ? options.ids.map((id) => vocabulary.words.find((word) => word.id === id)).filter(Boolean)
    : vocabulary.words.slice(options.start, options.start + options.limit);
  const selectedEntries = selectedWords.map((word) => {
    const entry = generatedById.get(word.id);
    if (!entry) throw new Error(`Missing generated chunks for ${word.id}`);
    return {
      ...entry,
      partOfSpeech: word.studySense?.partOfSpeech ?? word.partOfSpeech,
      chineseMeaning: word.studySense?.chinese ?? word.chinese,
    };
  });
  const reviewTasks = splitReviewEntries(selectedEntries, options.maxChunksPerRequest);
  const checkpointPath = options.outputPath.replace(/\.json$/i, '.checkpoint.json');
  const reviewedTasksById = await readCheckpoint(checkpointPath);
  seedEmptyReviewTasks(reviewTasks, reviewedTasksById);
  const pending = reviewTasks.filter((entry) => !reviewedTasksById.has(entry.id));
  const batches = packReviewEntries(pending, options);
  console.log(`Exam-chunk review tasks: ${reviewedTasksById.size}/${reviewTasks.length}; pending ${pending.length}; requests ${batches.length}`);
  for (const [index, batch] of batches.entries()) {
    const reviewed = await reviewBatch(batch, options);
    for (const entry of reviewed) reviewedTasksById.set(entry.id, entry);
    const stats = await saveOutput(checkpointPath, reviewedTasksById);
    console.log(`Review requests: ${index + 1}/${batches.length}; tasks ${stats.words}; chunks ${stats.chunks}`);
  }
  const combined = combineReviewEntries(selectedEntries, reviewedTasksById);
  const entriesById = new Map(combined.map((entry) => [entry.id, entry]));
  const stats = await saveOutput(options.outputPath, entriesById);
  if (options.apply) await applyToVocabulary(entriesById, vocabulary);
  console.log(JSON.stringify(stats, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
