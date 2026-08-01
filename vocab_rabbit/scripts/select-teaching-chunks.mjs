import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { phrasesEquivalent } from './ensemble-exam-chunks.mjs';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vocabularyPath = path.join(root, 'public/content/words/ket_vocabulary.json');
const sourceCandidatesPath = path.join(root, 'tmp/exam-chunks/source-candidates.json');
const defaultOutputPath = path.join(root, 'tmp/exam-chunks/selected-teaching-chunks.json');
const frequencyInputPath = path.join(root, 'tmp/exam-chunks/teaching-frequency-input.json');
const frequencyOutputPath = path.join(root, 'tmp/exam-chunks/teaching-frequency-scores.json');
const frequencyScriptPath = path.join(root, 'scripts/score-phrase-frequency.py');

const CEFR_ORDER = { A1: 0, A2: 1, B1: 2, B2: 3 };
const CHILD_UNSAFE_CHUNKS = [
  /\bcapital punishment\b/i,
  /\bdeath wish\b/i,
  /\bhigh as a kite\b/i,
  /\bkiss of death\b/i,
  /\bland mine\b/i,
  /\bmachine gun\b/i,
  /\bmake love\b/i,
  /\bpublic house\b/i,
  /\bsmoking gun\b/i,
  /\bthe finger\b/i,
  /\bto your health\b/i,
  /\bwet one's whistle\b/i,
  /\bin sickness and in health\b/i,
];

export function isChildSafeChunk(chunk) {
  const text = `${chunk.phrase} ${chunk.chinese ?? ''} ${chunk.sense ?? ''}`;
  return !CHILD_UNSAFE_CHUNKS.some((pattern) => pattern.test(text));
}

function parseArguments(argv) {
  const options = {
    outputPath: defaultOutputPath,
    pythonPath: process.env.WORDFREQ_PYTHON
      ?? path.join(root, 'tmp/wordfreq-venv/bin/python'),
    limit: 10,
    apply: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--output') options.outputPath = path.resolve(argv[++index]);
    else if (value === '--python') options.pythonPath = path.resolve(argv[++index]);
    else if (value === '--limit') options.limit = Number(argv[++index]);
    else if (value === '--apply') options.apply = true;
  }
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 10) {
    throw new Error('--limit must be an integer from 1 to 10');
  }
  return options;
}

function normalizeSourcePhrase(value) {
  return String(value ?? '')
    .replace(/\s+\((?:adv\.|adj\.|n\.|v\.|prep\.|phr\.?\s*v\.?)\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sourceEvidenceForChunk(chunk, sourceEntry) {
  const matches = (sourceEntry?.candidates ?? []).filter((candidate) => (
    phrasesEquivalent(chunk.phrase, normalizeSourcePhrase(candidate.phrase))
  ));
  const evidence = matches.flatMap((candidate) => candidate.evidence ?? []);
  const phraseListFrequency = Math.max(
    0,
    ...evidence
      .filter((item) => item.source === 'phrase-list')
      .map((item) => Number(item.frequencyPer100Million) || 0),
  );
  const phaveRank = Math.min(
    Number.POSITIVE_INFINITY,
    ...evidence
      .filter((item) => item.source === 'phave')
      .map((item) => Number(item.rank) || Number.POSITIVE_INFINITY),
  );
  return {
    phraseListFrequency,
    phaveRank: Number.isFinite(phaveRank) ? phaveRank : null,
  };
}

function selectionScore(chunk, corpusZipf, evidence) {
  const phraseListBonus = evidence.phraseListFrequency > 0
    ? 1 + Math.min(0.5, Math.log10(evidence.phraseListFrequency) / 10)
    : 0;
  const phaveBonus = evidence.phaveRank === null
    ? 0
    : 0.5 + (151 - evidence.phaveRank) / 300;
  const independentSourceBonus = Math.min(0.3, Math.max(0, chunk.sources.length - 1) * 0.1);
  return corpusZipf + phraseListBonus + phaveBonus + independentSourceBonus;
}

export function selectTeachingChunks(word, sourceEntry, frequencyByPhrase, limit = 10) {
  const ranked = (word.examChunks ?? []).filter(isChildSafeChunk).map((chunk) => {
    const corpusZipf = Number(frequencyByPhrase.get(chunk.phrase) ?? 0);
    const evidence = sourceEvidenceForChunk(chunk, sourceEntry);
    const score = selectionScore(chunk, corpusZipf, evidence);
    return {
      ...chunk,
      usageFrequency: {
        zipf: Number(corpusZipf.toFixed(3)),
        selectionScore: Number(score.toFixed(3)),
        source: 'wordfreq-estimate',
        ...(evidence.phraseListFrequency > 0
          ? { phraseListPer100Million: evidence.phraseListFrequency }
          : {}),
        ...(evidence.phaveRank === null ? {} : { phaveRank: evidence.phaveRank }),
      },
    };
  });
  ranked.sort((left, right) => (
    right.usageFrequency.selectionScore - left.usageFrequency.selectionScore
    || right.usageFrequency.zipf - left.usageFrequency.zipf
    || (left.usageFrequency.phaveRank ?? Number.POSITIVE_INFINITY)
      - (right.usageFrequency.phaveRank ?? Number.POSITIVE_INFINITY)
    || right.sources.length - left.sources.length
    || (CEFR_ORDER[left.cefr] ?? 9) - (CEFR_ORDER[right.cefr] ?? 9)
    || left.phrase.split(/\s+/).length - right.phrase.split(/\s+/).length
    || left.phrase.localeCompare(right.phrase)
  ));
  return ranked.slice(0, limit);
}

export function buildTeachingChunkEntries(vocabulary, sourcePayload, frequencyScores, limit = 10) {
  const sourceById = new Map((sourcePayload.entries ?? []).map((entry) => [entry.id, entry]));
  const frequencyByPhrase = new Map(Object.entries(frequencyScores));
  return vocabulary.words.map((word) => ({
    id: word.id,
    teachingChunks: selectTeachingChunks(
      word,
      sourceById.get(word.id),
      frequencyByPhrase,
      limit,
    ),
  }));
}

async function scorePhrases(vocabulary, pythonPath) {
  const phrases = [...new Set(vocabulary.words.flatMap((word) => (
    (word.examChunks ?? []).map((chunk) => chunk.phrase)
  )))].sort();
  await fs.writeFile(frequencyInputPath, `${JSON.stringify(phrases, null, 2)}\n`);
  await execFileAsync(pythonPath, [frequencyScriptPath, frequencyInputPath, frequencyOutputPath], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(await fs.readFile(frequencyOutputPath, 'utf8'));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const [vocabulary, sourcePayload] = await Promise.all([
    fs.readFile(vocabularyPath, 'utf8').then(JSON.parse),
    fs.readFile(sourceCandidatesPath, 'utf8').then(JSON.parse),
  ]);
  const frequencyScores = await scorePhrases(vocabulary, options.pythonPath);
  const entries = buildTeachingChunkEntries(
    vocabulary,
    sourcePayload,
    frequencyScores,
    options.limit,
  );
  const stats = {
    words: entries.length,
    wordsWithTeachingChunks: entries.filter((entry) => entry.teachingChunks.length > 0).length,
    selectedChunks: entries.reduce((sum, entry) => sum + entry.teachingChunks.length, 0),
    maxPerWord: Math.max(...entries.map((entry) => entry.teachingChunks.length)),
  };
  await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
  await fs.writeFile(options.outputPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    frequencyMethod: 'wordfreq 3.1.1 Zipf estimate weighted by PHRASE List, PHaVE, and independent source evidence',
    stats,
    entries,
  }, null, 2)}\n`);
  if (options.apply) {
    const byId = new Map(entries.map((entry) => [entry.id, entry.teachingChunks]));
    for (const word of vocabulary.words) word.teachingChunks = byId.get(word.id) ?? [];
    await fs.writeFile(vocabularyPath, `${JSON.stringify(vocabulary, null, 2)}\n`);
  }
  console.log(JSON.stringify(stats, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
