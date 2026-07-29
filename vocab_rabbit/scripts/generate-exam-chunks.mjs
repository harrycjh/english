import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { getHeadwordVariants, normalizePhrase } from './exam-chunk-sources.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vocabularyPath = path.join(root, 'public/content/words/ket_vocabulary.json');
const defaultInputPath = path.join(root, 'tmp/exam-chunks/source-candidates.json');
const defaultOutputPath = path.join(root, 'tmp/exam-chunks/generated-candidates.json');
const endpoint = process.env.LM_STUDIO_URL ?? 'http://127.0.0.1:1234/v1/chat/completions';
const model = process.env.EXAM_CHUNK_MODEL ?? process.env.LM_STUDIO_MODEL ?? 'qwen/qwen3.6-35b-a3b';

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
    maxCandidatesPerTask: 70,
    maxTasksPerRequest: 5,
    maxCandidatesPerRequest: 110,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--input') options.inputPath = path.resolve(argv[++index]);
    else if (value === '--output') options.outputPath = path.resolve(argv[++index]);
    else if (value === '--start') options.start = Number(argv[++index]);
    else if (value === '--limit') options.limit = Number(argv[++index]);
    else if (value === '--ids') options.ids = argv[++index].split(',').filter(Boolean);
    else if (value === '--max-candidates-per-task') options.maxCandidatesPerTask = Number(argv[++index]);
    else if (value === '--max-tasks-per-request') options.maxTasksPerRequest = Number(argv[++index]);
    else if (value === '--max-candidates-per-request') options.maxCandidatesPerRequest = Number(argv[++index]);
  }
  return options;
}

function normalizeForMatch(value) {
  return normalizePhrase(value)
    .toLowerCase()
    .replace(/[_–—-]+/g, ' ')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsVariant(phrase, variants) {
  const normalized = ` ${normalizeForMatch(phrase)} `;
  return variants.some((variant) => normalized.includes(` ${variant} `));
}

function candidateKey(phrase) {
  return normalizeForMatch(phrase);
}

function taskIdFor(wordId, part) {
  return `${wordId}#${part}`;
}

export function buildTasks(words, sourceEntriesById, options) {
  const tasks = [];
  for (const word of words) {
    const sourceEntry = sourceEntriesById.get(word.id);
    const candidates = sourceEntry?.candidates ?? [];
    const parts = Math.max(1, Math.ceil(candidates.length / options.maxCandidatesPerTask));
    for (let part = 0; part < parts; part += 1) {
      tasks.push({
        taskId: taskIdFor(word.id, part),
        wordId: word.id,
        part,
        allowAdditional: part === 0,
        headword: word.english,
        headwordVariants: getHeadwordVariants(word),
        partOfSpeech: word.studySense?.partOfSpeech ?? word.partOfSpeech,
        chineseMeaning: word.studySense?.chinese ?? word.chinese,
        topic: word.category,
        sourceCandidates: candidates
          .slice(part * options.maxCandidatesPerTask, (part + 1) * options.maxCandidatesPerTask)
          .map((candidate) => ({
            phrase: candidate.phrase,
            ...(candidate.gloss ? { gloss: candidate.gloss } : {}),
            sources: candidate.evidence.map((evidence) => evidence.source),
          })),
      });
    }
  }
  return tasks;
}

export function packTasks(tasks, options) {
  const batches = [];
  let current = [];
  let candidateCount = 0;
  for (const task of tasks) {
    const nextCount = task.sourceCandidates.length;
    if (
      current.length > 0
      && (
        current.length >= options.maxTasksPerRequest
        || candidateCount + nextCount > options.maxCandidatesPerRequest
      )
    ) {
      batches.push(current);
      current = [];
      candidateCount = 0;
    }
    current.push(task);
    candidateCount += nextCount;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

function validateChunk(task, chunk) {
  const phrase = normalizePhrase(chunk?.phrase).toLowerCase();
  const chinese = normalizePhrase(chunk?.chinese);
  const sense = normalizePhrase(chunk?.sense);
  const type = chunk?.type;
  const cefr = chunk?.cefr;
  const wordCount = normalizeForMatch(phrase).split(' ').filter(Boolean).length;
  const errors = [];
  if (wordCount < 2 || wordCount > 10) errors.push('word-count');
  if (!containsVariant(phrase, task.headwordVariants)) errors.push('missing-headword');
  if (!/[\u3400-\u9fff]/u.test(chinese)) errors.push('missing-chinese');
  if (!sense) errors.push('missing-sense');
  if (!CHUNK_TYPES.includes(type)) errors.push('invalid-type');
  if (!CEFR_LEVELS.includes(cefr)) errors.push('invalid-cefr');
  if (/[.!?]$/u.test(phrase)) errors.push('sentence-like');
  return {
    valid: errors.length === 0,
    errors,
    chunk: { phrase, chinese, sense, type, cefr },
  };
}

export function validateTaskResult(task, result) {
  const errors = [];
  if (result?.taskId !== task.taskId) errors.push('task-id');
  if (!Array.isArray(result?.chunks)) errors.push('chunks-not-array');
  const chunks = [];
  const seen = new Set();
  for (const rawChunk of result?.chunks ?? []) {
    const validation = validateChunk(task, rawChunk);
    if (!validation.valid) {
      errors.push(`${normalizePhrase(rawChunk?.phrase) || 'unknown'}:${validation.errors.join('|')}`);
      continue;
    }
    const key = candidateKey(validation.chunk.phrase);
    if (seen.has(key)) continue;
    seen.add(key);
    chunks.push(validation.chunk);
  }
  return { valid: errors.length === 0, errors, chunks };
}

const responseSchema = {
  type: 'object',
  properties: {
    entries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          chunks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                phrase: { type: 'string' },
                chinese: { type: 'string' },
                sense: { type: 'string' },
                type: { type: 'string', enum: CHUNK_TYPES },
                cefr: { type: 'string', enum: CEFR_LEVELS },
              },
              required: ['phrase', 'chinese', 'sense', 'type', 'cefr'],
              additionalProperties: false,
            },
          },
        },
        required: ['taskId', 'chunks'],
        additionalProperties: false,
      },
    },
  },
  required: ['entries'],
  additionalProperties: false,
};

async function requestJson(tasks, correction = null) {
  const payload = tasks.map((task) => ({
    taskId: task.taskId,
    headword: task.headword,
    headwordVariants: task.headwordVariants,
    partOfSpeech: task.partOfSpeech,
    chineseMeaning: task.chineseMeaning,
    topic: task.topic,
    allowAdditional: task.allowAdditional,
    sourceCandidates: task.sourceCandidates,
  }));
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 7000,
      reasoning_effort: 'none',
      messages: [
        {
          role: 'system',
          content: [
            'You are building a complete, child-appropriate English exam-chunk dictionary for TOEFL Primary and TOEFL Junior learners, roughly CEFR A1-B2.',
            'For every task, inspect every source candidate and keep every genuinely conventional and pedagogically useful multiword chunk that contains the target headword or a normal inflected form.',
            'Meaning shifts are welcome when the whole expression is a real exam point: for example after -> look after, care -> take care of, good -> be good at.',
            'Keep phrasal verbs, fixed expressions, preposition patterns, idioms, strong lexical collocations, useful sentence frames, and conventional compound terms.',
            'Reject arbitrary free combinations such as can swim, can help, good book, young aunt, or a child runs.',
            'Reject full sentences, names, technical jargon, rare, archaic, dialectal, offensive, literary-only, and above-B2 expressions.',
            'Do not force a quota. Return every useful chunk you can justify, or an empty array when the word has none.',
            'When allowAdditional is true, add important common chunks missing from sourceCandidates. When false, only judge the supplied candidates.',
            'Use a normalized dictionary phrase, lowercase except where capitalization is intrinsic. Use somebody and something for variable slots.',
            'The Chinese field must translate the whole chunk in its intended sense, not merely repeat the headword meaning.',
            'The sense field must be a short plain-English explanation that distinguishes this chunk from other senses.',
            'Return exactly one result for each taskId and no extra taskIds.',
            correction ? `Correct these previous validation problems: ${correction}` : '',
          ].filter(Boolean).join(' '),
        },
        { role: 'user', content: JSON.stringify(payload) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'vocarabbit_exam_chunks',
          strict: true,
          schema: responseSchema,
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

async function generateBatch(tasks) {
  let pending = tasks;
  const accepted = [];
  let correction = null;
  for (let attempt = 1; attempt <= 3 && pending.length > 0; attempt += 1) {
    const body = await requestJson(pending, correction);
    const byTaskId = new Map((body.entries ?? []).map((entry) => [entry.taskId, entry]));
    const retry = [];
    const retryErrors = [];
    for (const task of pending) {
      const validation = validateTaskResult(task, byTaskId.get(task.taskId));
      if (validation.valid) {
        accepted.push({ taskId: task.taskId, wordId: task.wordId, chunks: validation.chunks });
      } else {
        retry.push(task);
        retryErrors.push(`${task.taskId}:${validation.errors.join(',')}`);
      }
    }
    pending = retry;
    correction = retryErrors.join('; ');
    if (retry.length > 0) {
      console.warn(`Retry ${attempt}/3: ${correction}`);
    }
  }
  if (pending.length > 0) {
    throw new Error(`Failed to generate valid chunks for ${pending.map((task) => task.taskId).join(', ')}`);
  }
  return accepted;
}

async function readCheckpoint(outputPath) {
  try {
    const payload = JSON.parse(await fs.readFile(outputPath, 'utf8'));
    return new Map((payload.tasks ?? []).map((task) => [task.taskId, task]));
  } catch (error) {
    if (error.code === 'ENOENT') return new Map();
    throw error;
  }
}

async function saveCheckpoint(outputPath, tasksById) {
  const tasks = [...tasksById.values()].sort((left, right) => left.taskId.localeCompare(right.taskId));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    model,
    tasks,
  }, null, 2)}\n`);
}

function attachEvidence(words, sourceEntriesById, tasksById) {
  return words.map((word) => {
    const sourceCandidates = sourceEntriesById.get(word.id)?.candidates ?? [];
    const sourceByPhrase = new Map(sourceCandidates.map((candidate) => [candidateKey(candidate.phrase), candidate]));
    const chunksByPhrase = new Map();
    for (const task of tasksById.values()) {
      if (task.wordId !== word.id) continue;
      for (const chunk of task.chunks) {
        const key = candidateKey(chunk.phrase);
        const source = sourceByPhrase.get(key);
        const sources = source
          ? source.evidence.map((evidence) => evidence.source)
          : ['lm-generated'];
        const existing = chunksByPhrase.get(key);
        if (existing) {
          existing.sources = [...new Set([...existing.sources, ...sources])].sort();
          continue;
        }
        chunksByPhrase.set(key, { ...chunk, sources: [...new Set(sources)].sort() });
      }
    }
    return {
      id: word.id,
      english: word.english,
      chunks: [...chunksByPhrase.values()].sort((left, right) => left.phrase.localeCompare(right.phrase)),
    };
  });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const vocabulary = JSON.parse(await fs.readFile(vocabularyPath, 'utf8'));
  const sourcePayload = JSON.parse(await fs.readFile(options.inputPath, 'utf8'));
  const sourceEntriesById = new Map(sourcePayload.entries.map((entry) => [entry.id, entry]));
  const allWords = options.ids
    ? options.ids.map((id) => vocabulary.words.find((word) => word.id === id)).filter(Boolean)
    : vocabulary.words.slice(options.start, options.start + options.limit);
  const allTasks = buildTasks(allWords, sourceEntriesById, options);
  const tasksById = await readCheckpoint(options.outputPath);
  const pending = allTasks.filter((task) => !tasksById.has(task.taskId));
  const batches = packTasks(pending, options);
  console.log(`Exam-chunk tasks: ${tasksById.size}/${allTasks.length}; pending ${pending.length}; requests ${batches.length}`);

  for (const [index, batch] of batches.entries()) {
    const generated = await generateBatch(batch);
    for (const task of generated) tasksById.set(task.taskId, task);
    await saveCheckpoint(options.outputPath, tasksById);
    console.log(`Exam-chunk requests: ${index + 1}/${batches.length}; tasks saved ${tasksById.size}`);
  }

  const entries = attachEvidence(allWords, sourceEntriesById, tasksById);
  const completedPath = options.outputPath.replace(/\.json$/i, '.completed.json');
  const chunkCount = entries.reduce((sum, entry) => sum + entry.chunks.length, 0);
  await fs.writeFile(completedPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    model,
    stats: {
      words: entries.length,
      wordsWithChunks: entries.filter((entry) => entry.chunks.length > 0).length,
      chunks: chunkCount,
    },
    entries,
  }, null, 2)}\n`);
  console.log(`Completed ${chunkCount} chunks for ${entries.length} words: ${completedPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
