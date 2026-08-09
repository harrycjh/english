import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vocabularyPath = path.join(root, 'public/content/words/ket_vocabulary.json');
const mediaPath = path.join(root, 'public/content/words/word_related_media.json');
const outputDir = path.join(root, 'design-output/related-media-semantic-audit');
const reportPath = path.join(outputDir, 'report.json');
const reportTsvPath = path.join(outputDir, 'report.tsv');
const checkpointPath = path.join(root, 'tmp/related-media-semantic-audit/checkpoint.json');
const endpoint = process.env.LM_STUDIO_URL ?? 'http://127.0.0.1:1234/v1/chat/completions';

function parseArguments(argv) {
  const options = {
    model: process.env.SEMANTIC_AUDIT_MODEL ?? 'qwen/qwen3.6-35b-a3b',
    batchSize: 24,
    limit: null,
    source: null,
    restart: false,
    studySenseOnly: false,
  };
  for (const argument of argv) {
    if (argument === '--restart') options.restart = true;
    else if (argument === '--study-sense-only') options.studySenseOnly = true;
    else if (argument.startsWith('--model=')) options.model = argument.slice('--model='.length);
    else if (argument.startsWith('--batch-size=')) options.batchSize = Number(argument.split('=')[1]);
    else if (argument.startsWith('--limit=')) options.limit = Number(argument.split('=')[1]);
    else if (argument.startsWith('--source=')) options.source = argument.slice('--source='.length);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 60) {
    throw new Error('--batch-size must be an integer from 1 to 60');
  }
  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error('--limit must be a positive integer');
  }
  if (options.source && !['oxford', 'redRocket', 'raz'].includes(options.source)) {
    throw new Error('--source must be oxford, redRocket, or raz');
  }
  return options;
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function collectTargets(vocabulary, manifest) {
  const wordsById = new Map(vocabulary.words.map((word) => [word.id, word]));
  const targets = [];
  for (const entry of manifest.entries ?? []) {
    const word = wordsById.get(entry.wordId);
    if (!word) continue;
    const studySenseChanged = Boolean(word.studySense) && (
      normalizeText(word.studySense.partOfSpeech) !== normalizeText(word.partOfSpeech)
      || normalizeText(word.studySense.chinese) !== normalizeText(word.chinese)
      || normalizeText(word.studySense.examples?.[0]) !== normalizeText(word.examples?.[0])
    );
    for (const source of ['oxford', 'redRocket', 'raz']) {
      const media = entry.relatedMedia?.[source];
      if (!media) continue;
      targets.push({
        key: `${source}:${word.id}`,
        source,
        wordId: word.id,
        headword: normalizeText(word.english),
        studyPartOfSpeech: normalizeText(word.studySense?.partOfSpeech || word.partOfSpeech),
        studyChinese: normalizeText(word.studySense?.chinese || word.chinese),
        studyExample: normalizeText(word.studySense?.examples?.[0] || word.examples?.[0]),
        studyExampleTranslation: normalizeText(word.exampleTranslations?.[0]),
        studySenseChanged,
        sourceLabel: normalizeText(media.label),
        bookTitle: normalizeText(media.title),
        matchKind: normalizeText(media.matchKind),
        matchedTerm: normalizeText(media.matchedTerm || word.english),
        matchedForm: normalizeText(media.matchedForm),
        sentence: normalizeText(media.sentence),
        sentenceTranslation: normalizeText(media.sentenceTranslation),
      });
    }
  }
  return targets;
}

async function requestAudit(model, items) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: Math.max(500, items.length * 24),
      reasoning_effort: 'none',
      messages: [
        {
          role: 'system',
          content: [
            'You are a conservative word-sense auditor for a children vocabulary app.',
            'Compare the locked study sense and part of speech with the actual use in each related-book sentence.',
            'Return aligned only when the sentence uses the same headword sense and compatible part of speech.',
            'A literal spelling match is not enough: noun can meaning a container is different from modal can meaning ability; noun change meaning coins is different from verb change; proper names and idioms may also change the sense.',
            'Regional spelling variants such as mum/mom are aligned when they preserve the same meaning; matchKind=spelling is supporting evidence for this.',
            'Return mismatch when the context clearly teaches another sense or part of speech.',
            'Return ambiguous when the sentence is missing, malformed, OCR-corrupted, or too short to decide reliably.',
            'Use the Chinese translation only as supporting evidence because it may itself contain an error.',
            'Do not judge visual composition yet. Return every key exactly once and never invent a missing sentence.',
            'This is a first-pass triage. Return only the requested key and status.',
          ].join(' '),
        },
        { role: 'user', content: JSON.stringify({ items }) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'related_media_semantic_audit',
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
                    status: { type: 'string', enum: ['aligned', 'ambiguous', 'mismatch'] },
                  },
                  required: ['key', 'status'],
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
  if (!response.ok) throw new Error(`${model} returned ${response.status}: ${await response.text()}`);
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${model} returned no content`);
  return JSON.parse(content).items ?? [];
}

async function requestWithRetry(model, items) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const results = await requestAudit(model, items);
      const byKey = new Map(results.map((item) => [item.key, item]));
      const missing = items.filter((item) => !byKey.has(item.key));
      if (missing.length > 0 && missing.length < items.length) {
        const recovered = await requestWithRetry(model, missing);
        for (const result of recovered) byKey.set(result.key, result);
      } else if (missing.length > 0) {
        throw new Error(`Model omitted ${missing.map((item) => item.key).join(', ')}`);
      }
      return items.map((item) => {
        const result = byKey.get(item.key);
        return {
          ...result,
          confidence: result.status === 'aligned' ? 0.8 : 0.6,
          observedSense: '',
          reason: result.status === 'aligned'
            ? 'First-pass model found the same study sense.'
            : 'Flagged by first-pass model for visual review.',
        };
      });
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  throw lastError;
}

async function loadCheckpoint(model, restart) {
  if (restart) return { schemaVersion: 1, model, results: {} };
  try {
    const checkpoint = JSON.parse(await fs.readFile(checkpointPath, 'utf8'));
    return checkpoint.model === model
      ? checkpoint
      : { schemaVersion: 1, model, results: {} };
  } catch (error) {
    if (error.code === 'ENOENT') return { schemaVersion: 1, model, results: {} };
    throw error;
  }
}

function buildSummary(targets, results) {
  const reviewed = targets.filter((target) => results[target.key]);
  const count = (status) => reviewed.filter((target) => results[target.key].status === status).length;
  return {
    generatedAt: new Date().toISOString(),
    associations: targets.length,
    reviewed: reviewed.length,
    aligned: count('aligned'),
    ambiguous: count('ambiguous'),
    mismatch: count('mismatch'),
    bySource: Object.fromEntries(['oxford', 'redRocket', 'raz'].map((source) => {
      const sourceTargets = reviewed.filter((target) => target.source === source);
      return [source, {
        reviewed: sourceTargets.length,
        aligned: sourceTargets.filter((target) => results[target.key].status === 'aligned').length,
        ambiguous: sourceTargets.filter((target) => results[target.key].status === 'ambiguous').length,
        mismatch: sourceTargets.filter((target) => results[target.key].status === 'mismatch').length,
      }];
    })),
  };
}

function escapeTsv(value) {
  return String(value ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
}

async function saveOutputs(model, targets, checkpoint) {
  const rows = targets
    .filter((target) => checkpoint.results[target.key])
    .map((target) => ({ ...target, ...checkpoint.results[target.key] }));
  const summary = buildSummary(targets, checkpoint.results);
  const payload = { schemaVersion: 1, model, summary, results: rows };
  await fs.mkdir(path.dirname(checkpointPath), { recursive: true });
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`);
  await fs.writeFile(reportPath, `${JSON.stringify(payload, null, 2)}\n`);
  const columns = [
    'status', 'confidence', 'source', 'wordId', 'headword', 'studyPartOfSpeech',
    'studyChinese', 'sentence', 'sentenceTranslation', 'matchedTerm', 'matchedForm',
    'sourceLabel', 'observedSense', 'reason',
  ];
  await fs.writeFile(reportTsvPath, `${columns.join('\t')}\n${rows.map((row) => (
    columns.map((column) => escapeTsv(row[column])).join('\t')
  )).join('\n')}\n`);
  return summary;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const [vocabulary, manifest] = await Promise.all([
    fs.readFile(vocabularyPath, 'utf8').then(JSON.parse),
    fs.readFile(mediaPath, 'utf8').then(JSON.parse),
  ]);
  let targets = collectTargets(vocabulary, manifest);
  if (options.source) targets = targets.filter((target) => target.source === options.source);
  if (options.studySenseOnly) targets = targets.filter((target) => target.studySenseChanged);
  if (options.limit) targets = targets.slice(0, options.limit);
  const checkpoint = await loadCheckpoint(options.model, options.restart);
  for (const target of targets.filter((item) => !item.sentence)) {
    checkpoint.results[target.key] = {
      key: target.key,
      status: 'ambiguous',
      confidence: 0,
      observedSense: 'unknown',
      reason: 'No page sentence is available for a text-level sense decision.',
    };
  }
  const pending = targets.filter((target) => !checkpoint.results[target.key]);
  console.log(JSON.stringify({ model: options.model, targets: targets.length, cached: targets.length - pending.length, pending: pending.length }, null, 2));
  for (let offset = 0; offset < pending.length; offset += options.batchSize) {
    const batch = pending.slice(offset, offset + options.batchSize);
    const results = await requestWithRetry(options.model, batch);
    for (const result of results) checkpoint.results[result.key] = result;
    const summary = await saveOutputs(options.model, targets, checkpoint);
    console.log(`${Math.min(offset + batch.length, pending.length)}/${pending.length}: ${summary.mismatch} mismatch, ${summary.ambiguous} ambiguous`);
  }
  console.log(JSON.stringify(await saveOutputs(options.model, targets, checkpoint), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}

export { collectTargets };
