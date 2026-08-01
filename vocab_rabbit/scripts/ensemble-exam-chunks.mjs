import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { normalizePhrase } from './exam-chunk-sources.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vocabularyPath = path.join(root, 'public/content/words/ket_vocabulary.json');
const defaultDetailedPath = path.join(root, 'tmp/exam-chunks/detailed-all-35b.json');
const defaultGemmaPath = path.join(root, 'tmp/exam-chunks/vote-gemma.json');
const defaultQwenPath = path.join(root, 'tmp/exam-chunks/vote-27b.json');
const defaultOutputPath = path.join(root, 'tmp/exam-chunks/final-exam-chunks.json');

const TRUSTED_SINGLE_SOURCES = new Set(['phave', 'phrase-list']);
const KNOWN_FREE_COMBINATIONS = new Set([
  'can help',
  'can swim',
  'can wait',
  'change clothes',
  'change of clothes',
  'good book',
  'good health',
  'good weather',
  'wash hands',
  'young aunt',
]);
const GRAMMATICAL_EXPANSION_TOKENS = new Set([
  'a',
  'an',
  'be',
  'do',
  'get',
  'go',
  'have',
  'make',
  "one's",
  'somebody',
  'something',
  'take',
  'the',
  'to',
]);

function parseArguments(argv) {
  const options = {
    detailedPath: defaultDetailedPath,
    gemmaPath: defaultGemmaPath,
    qwenPath: defaultQwenPath,
    outputPath: defaultOutputPath,
    apply: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--detailed') options.detailedPath = path.resolve(argv[++index]);
    else if (value === '--gemma') options.gemmaPath = path.resolve(argv[++index]);
    else if (value === '--qwen') options.qwenPath = path.resolve(argv[++index]);
    else if (value === '--output') options.outputPath = path.resolve(argv[++index]);
    else if (value === '--apply') options.apply = true;
  }
  return options;
}

export function chunkKey(value) {
  return normalizePhrase(value)
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

function equivalentToken(left, right) {
  const rightForms = tokenForms(right);
  return [...tokenForms(left)].some((form) => rightForms.has(form));
}

function containsEquivalentSequence(container, candidate) {
  if (candidate.length > container.length) return false;
  for (let offset = 0; offset <= container.length - candidate.length; offset += 1) {
    if (candidate.every((token, index) => equivalentToken(container[offset + index], token))) {
      return true;
    }
  }
  return false;
}

export function phrasesEquivalent(left, right) {
  const leftTokens = chunkKey(left).split(' ').filter(Boolean);
  const rightTokens = chunkKey(right).split(' ').filter(Boolean);
  if (leftTokens.length === 0 || rightTokens.length === 0) return false;
  if (leftTokens.length === rightTokens.length) {
    return leftTokens.every((token, index) => equivalentToken(token, rightTokens[index]));
  }
  const [longer, shorter] = leftTokens.length > rightTokens.length
    ? [leftTokens, rightTokens]
    : [rightTokens, leftTokens];
  if (longer.length - shorter.length > 2 || !containsEquivalentSequence(longer, shorter)) return false;
  const shorterOffset = longer.findIndex((_, offset) => (
    shorter.every((token, index) => equivalentToken(longer[offset + index], token))
  ));
  const extras = longer.filter((_, index) => (
    index < shorterOffset || index >= shorterOffset + shorter.length
  ));
  return extras.every((token) => GRAMMATICAL_EXPANSION_TOKENS.has(token));
}

function isRepeatedFrame(phrase) {
  const tokens = chunkKey(phrase).split(' ').filter(Boolean);
  return tokens.length === 3
    && equivalentToken(tokens[0], tokens[2])
    && new Set(['after', 'by', 'to']).has(tokens[1]);
}

function acceptedByVote(phrase, voteEntry) {
  return (voteEntry?.chunks ?? []).some((chunk) => phrasesEquivalent(phrase, chunk.phrase));
}

export function shouldKeepChunk(chunk, gemmaEntry, qwenEntry) {
  return !requiresIndependentVote(chunk)
    || acceptedByVote(chunk.phrase, gemmaEntry)
    || acceptedByVote(chunk.phrase, qwenEntry);
}

export function requiresIndependentVote(chunk) {
  const sources = new Set(chunk.sources ?? []);
  return !(
    sources.size >= 2
    || [...sources].some((source) => TRUSTED_SINGLE_SOURCES.has(source))
    || isRepeatedFrame(chunk.phrase)
  );
}

function isCanonicalExpansion(shorter, longer) {
  const shortTokens = chunkKey(shorter.phrase).split(' ').filter(Boolean);
  const longTokens = chunkKey(longer.phrase).split(' ').filter(Boolean);
  if (
    shortTokens.length === 0
    || longTokens.length <= shortTokens.length
    || longTokens.length - shortTokens.length > 2
  ) return false;
  if (!containsEquivalentSequence(longTokens, shortTokens)) return false;
  const offset = longTokens.findIndex((_, candidateOffset) => (
    shortTokens.every((token, index) => equivalentToken(longTokens[candidateOffset + index], token))
  ));
  const extras = longTokens.filter((_, index) => (
    index < offset || index >= offset + shortTokens.length
  ));
  return extras.every((token) => GRAMMATICAL_EXPANSION_TOKENS.has(token));
}

export function removeCanonicalDuplicates(chunks) {
  const sorted = [...chunks].sort((left, right) => (
    chunkKey(right.phrase).split(' ').length - chunkKey(left.phrase).split(' ').length
    || left.phrase.localeCompare(right.phrase)
  ));
  const kept = [];
  for (const chunk of sorted) {
    const replacement = kept.find((candidate) => isCanonicalExpansion(chunk, candidate));
    if (replacement) {
      replacement.sources = [...new Set([
        ...(replacement.sources ?? []),
        ...(chunk.sources ?? []),
      ])].sort();
      continue;
    }
    if (!kept.some((candidate) => chunkKey(candidate.phrase) === chunkKey(chunk.phrase))) {
      kept.push({
        ...chunk,
        sources: [...new Set(chunk.sources ?? [])].sort(),
      });
    }
  }
  return kept.sort((left, right) => left.phrase.localeCompare(right.phrase));
}

export function ensembleEntries(detailedEntries, gemmaEntries, qwenEntries) {
  const gemmaById = new Map(gemmaEntries.map((entry) => [entry.id, entry]));
  const qwenById = new Map(qwenEntries.map((entry) => [entry.id, entry]));
  return detailedEntries.map((entry) => ({
    id: entry.id,
    chunks: removeCanonicalDuplicates(entry.chunks.filter((chunk) => (
      !KNOWN_FREE_COMBINATIONS.has(chunkKey(chunk.phrase))
      && shouldKeepChunk(chunk, gemmaById.get(entry.id), qwenById.get(entry.id))
    ))),
  }));
}

function validateCompleteEntries(entries, vocabulary) {
  if (entries.length !== vocabulary.words.length) {
    throw new Error(`Refusing partial result: ${entries.length}/${vocabulary.words.length} words`);
  }
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  if (byId.size !== entries.length) throw new Error('Duplicate word ids in ensemble result');
  for (const word of vocabulary.words) {
    const entry = byId.get(word.id);
    if (!entry) throw new Error(`Missing ensemble result for ${word.id}`);
    const seen = new Set();
    for (const chunk of entry.chunks) {
      const key = chunkKey(chunk.phrase);
      if (!key) throw new Error(`Empty phrase for ${word.id}`);
      if (seen.has(key)) throw new Error(`Duplicate phrase for ${word.id}: ${chunk.phrase}`);
      seen.add(key);
      if (!chunk.chinese || !chunk.sense || !chunk.type || !chunk.cefr) {
        throw new Error(`Incomplete metadata for ${word.id}: ${chunk.phrase}`);
      }
      if (!Array.isArray(chunk.sources) || chunk.sources.length === 0) {
        throw new Error(`Missing sources for ${word.id}: ${chunk.phrase}`);
      }
    }
  }
}

async function readEntries(filePath) {
  const payload = JSON.parse(await fs.readFile(filePath, 'utf8'));
  if (!Array.isArray(payload.entries)) throw new Error(`Invalid entries in ${filePath}`);
  return payload.entries;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const vocabulary = JSON.parse(await fs.readFile(vocabularyPath, 'utf8'));
  const [detailedEntries, gemmaEntries, qwenEntries] = await Promise.all([
    readEntries(options.detailedPath),
    readEntries(options.gemmaPath),
    readEntries(options.qwenPath),
  ]);
  const entries = ensembleEntries(detailedEntries, gemmaEntries, qwenEntries);
  validateCompleteEntries(entries, vocabulary);
  const stats = {
    words: entries.length,
    wordsWithChunks: entries.filter((entry) => entry.chunks.length > 0).length,
    chunks: entries.reduce((sum, entry) => sum + entry.chunks.length, 0),
  };
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    method: '35b-detail+gemma-vote+27b-vote+source-evidence',
    stats,
    entries,
  };
  await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
  await fs.writeFile(options.outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  if (options.apply) {
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    for (const word of vocabulary.words) word.examChunks = byId.get(word.id).chunks;
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
