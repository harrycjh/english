import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { sentenceUsesChunk } from './generate-teaching-chunk-examples.mjs';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vocabularyPath = path.join(root, 'public/content/words/ket_vocabulary.json');
const workDir = path.join(root, 'tmp/exam-chunks');
const defaultOutputPath = path.join(root, 'tmp/teaching-chunk-source-examples.json');
const wordFrequencyPython = path.resolve(root, process.env.WORDFREQ_PYTHON ?? 'tmp/wordfreq-venv/bin/python');
const wordFrequencyScript = path.join(root, 'scripts/score-phrase-frequency.py');

const SOURCE_PRIORITY = {
  'phrase-list': 0,
  phave: 1,
  'wiktionary-kaikki': 2,
  'oewn-2025': 3,
};

const UNSUITABLE_TOPIC = /\b(?:alcohol|beer|bomb|cigarettes?|death|drugs?|fight(?:ing|s)?|fought|funeral|guns?|kill(?:ed|ing|s)?|murder(?:ed|ing|s)?|riots?|sex|smoking|suicide|terrorists?|war|weapons?|whisky|wine)\b/i;
const UNSUITABLE_SOURCE_CONTEXT = /(?:\b(?:bankrupt|coerce|corporal punishment|crime|criminal|debt|election|futures|government|interrogator|investment|judge|lawyer|lottery|politician|president|prison|prohibition|shareholder|tangible assets|victim|vote|witness)\b|\bex-(?:boyfriend|girlfriend|husband|wife)\b|sorry for your loss|standing by your man)/i;
const SENSE_REQUIRED_SOURCES = new Set(['wiktionary-kaikki', 'oewn-2025']);
const CHILD_SOURCE_MIN_ZIPF = 3.5;

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeChunkPhrase(value) {
  return normalizeText(value)
    .replace(/^\(BE\)\s+/i, 'be ')
    .replace(/\bONE'S\b/gi, "one's")
    .replace(/\bSB\b/g, 'somebody')
    .replace(/\bSTH\b/g, 'something')
    .replace(/\s+\((?:'[^']+'|"[^"]+"|[A-Z][A-Z /+.-]*)\)\s*$/u, '')
    .replace(/[.!?]+$/g, '')
    .toLowerCase();
}

function sentenceIsComplete(value) {
  return /[.!?]["']?$/.test(normalizeText(value));
}

export function parsePhraseListExamples(text) {
  const results = [];
  let pending = null;
  const finishPending = () => {
    if (pending?.sentence && sentenceIsComplete(pending.sentence)) results.push(pending);
    pending = null;
  };
  for (const rawLine of text.replace(/\f/g, '\n').split(/\r?\n/)) {
    const match = rawLine.match(
      /^\s*(\d{2,5})\s+(.+?)\s+(\d{3,6})\s+(\*{1,3}|[xX])\s+(\*{1,3}|[xX])\s+(\*{1,3}|[xX])\s+(.+?)\s*$/,
    );
    if (match) {
      finishPending();
      pending = {
        phrase: normalizeChunkPhrase(match[2]),
        sentence: normalizeText(match[7]),
        source: 'phrase-list',
        rank: Number(match[1]),
      };
      if (sentenceIsComplete(pending.sentence)) finishPending();
      continue;
    }
    if (pending && rawLine.trim()) {
      pending.sentence = normalizeText(`${pending.sentence} ${rawLine.trim()}`);
      if (sentenceIsComplete(pending.sentence)) finishPending();
    }
  }
  finishPending();
  return results;
}

export function parsePhaveExamples(text) {
  const results = [];
  let phrase = '';
  let rank = null;
  let sense = '';
  let pendingSentence = '';
  const finishSentence = () => {
    if (phrase && pendingSentence && sentenceIsComplete(pendingSentence)) {
      results.push({ phrase, sentence: normalizeText(pendingSentence), sense, source: 'phave', rank });
    }
    pendingSentence = '';
  };
  for (const rawLine of text.replace(/\f/g, '\n').split(/\r?\n/)) {
    const heading = rawLine.match(/^\s*(\d+)\.\s+([A-Z][A-Z0-9 ’'()\/+.-]+?)\s*$/);
    if (heading && Number(heading[1]) <= 150) {
      finishSentence();
      rank = Number(heading[1]);
      phrase = normalizeChunkPhrase(heading[2]);
      sense = '';
      continue;
    }
    const senseMatch = rawLine.match(/^\s{0,4}\d+\.\s+(.+?)\s*$/);
    if (phrase && senseMatch) {
      finishSentence();
      sense = normalizeText(senseMatch[1]).replace(/\s*\([^()]*(?:%|per cent)\)\s*$/i, '');
      continue;
    }
    const indent = rawLine.match(/^\s*/)?.[0].length ?? 0;
    const content = rawLine.trim();
    if (!phrase || indent < 8 || !content) continue;
    if (!pendingSentence && !/^[A-Z"']/u.test(content)) continue;
    pendingSentence = normalizeText(`${pendingSentence} ${content}`);
    if (sentenceIsComplete(pendingSentence)) finishSentence();
  }
  finishSentence();
  return results;
}

function targetPhraseMap(words) {
  const map = new Map();
  for (const word of words) {
    for (const chunk of (word.teachingChunks ?? []).slice(0, 3)) {
      const key = normalizeChunkPhrase(chunk.phrase);
      const targets = map.get(key) ?? [];
      targets.push({ wordId: word.id, chunk });
      map.set(key, targets);
    }
  }
  return map;
}

function addCandidate(candidatesByPhrase, phrase, candidate) {
  const key = normalizeChunkPhrase(phrase);
  const list = candidatesByPhrase.get(key) ?? [];
  const sentenceKey = normalizeText(candidate.sentence).toLowerCase();
  if (!list.some((item) => normalizeText(item.sentence).toLowerCase() === sentenceKey)) {
    list.push({ ...candidate, sentence: normalizeText(candidate.sentence) });
  }
  candidatesByPhrase.set(key, list);
}

async function extractPdfExamples(candidatesByPhrase, targetMap) {
  const [phaveResult, phraseResult] = await Promise.all([
    execFileAsync('pdftotext', ['-layout', path.join(workDir, 'phave-list.pdf'), '-'], { maxBuffer: 64 * 1024 * 1024 }),
    execFileAsync('pdftotext', ['-layout', path.join(workDir, 'phrase-list.pdf'), '-'], { maxBuffer: 64 * 1024 * 1024 }),
  ]);
  for (const item of parsePhraseListExamples(phraseResult.stdout)) {
    if (targetMap.has(item.phrase)) addCandidate(candidatesByPhrase, item.phrase, item);
  }
  for (const item of parsePhaveExamples(phaveResult.stdout)) {
    if (targetMap.has(item.phrase)) addCandidate(candidatesByPhrase, item.phrase, item);
  }
}

async function extractKaikkiExamples(candidatesByPhrase, targetMap) {
  const input = createReadStream(path.join(workDir, 'kaikki-english.jsonl.gz')).pipe(createGunzip());
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let linesRead = 0;
  let matchedEntries = 0;
  for await (const line of lines) {
    linesRead += 1;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const key = normalizeChunkPhrase(entry.word);
    if (entry.lang_code !== 'en' || !targetMap.has(key)) continue;
    matchedEntries += 1;
    for (const sense of entry.senses ?? []) {
      const senseText = normalizeText(sense.glosses?.find(Boolean));
      for (const example of sense.examples ?? []) {
        if (example.type !== 'example') continue;
        addCandidate(candidatesByPhrase, key, {
          source: 'wiktionary-kaikki',
          sentence: example.text,
          sense: senseText,
        });
      }
    }
  }
  return { linesRead, matchedEntries };
}

async function unzipJson(zipPath, entryName, maxBuffer = 64 * 1024 * 1024) {
  const { stdout } = await execFileAsync('unzip', ['-p', zipPath, entryName], { maxBuffer });
  return JSON.parse(stdout);
}

async function extractOewnExamples(candidatesByPhrase, targetMap) {
  const zipPath = path.join(workDir, 'english-wordnet-2025-json.zip');
  const { stdout } = await execFileAsync('unzip', ['-Z1', zipPath], { maxBuffer: 4 * 1024 * 1024 });
  const names = stdout.split(/\r?\n/).filter(Boolean);
  const entryNames = names.filter((name) => /^entries-.*\.json$/.test(name));
  const synsetTargets = new Map();
  for (const name of entryNames) {
    const entries = await unzipJson(zipPath, name);
    for (const [phrase, posGroups] of Object.entries(entries)) {
      const key = normalizeChunkPhrase(phrase);
      if (!targetMap.has(key)) continue;
      for (const group of Object.values(posGroups ?? {})) {
        for (const sense of group.sense ?? []) {
          if (!sense.synset) continue;
          const phrases = synsetTargets.get(sense.synset) ?? new Set();
          phrases.add(key);
          synsetTargets.set(sense.synset, phrases);
        }
      }
    }
  }

  const synsetNames = names.filter((name) => (
    /^(?:adj|adv|noun|verb)\..*\.json$/.test(name)
  ));
  for (const name of synsetNames) {
    const synsets = await unzipJson(zipPath, name, 96 * 1024 * 1024);
    for (const [synsetId, synset] of Object.entries(synsets)) {
      const phrases = synsetTargets.get(synsetId);
      if (!phrases || !Array.isArray(synset.example)) continue;
      for (const phrase of phrases) {
        for (const sentence of synset.example) {
          addCandidate(candidatesByPhrase, phrase, {
            source: 'oewn-2025',
            sentence,
            sense: normalizeText(synset.definition?.find(Boolean)),
          });
        }
      }
    }
  }
  return { referencedSynsets: synsetTargets.size };
}

function senseTokenRoots(value) {
  const irregular = {
    behaved: 'behave',
    behaves: 'behave',
    behaving: 'behave',
    held: 'hold',
    made: 'make',
    meant: 'mean',
    took: 'take',
  };
  const roots = new Set();
  const token = value.toLowerCase();
  roots.add(token);
  if (irregular[token]) roots.add(irregular[token]);
  if (token.length > 4 && token.endsWith('ies')) roots.add(`${token.slice(0, -3)}y`);
  if (token.length > 4 && token.endsWith('ing')) {
    const base = token.slice(0, -3);
    roots.add(base);
    roots.add(`${base}e`);
  }
  if (token.length > 3 && token.endsWith('ed')) {
    const base = token.slice(0, -2);
    roots.add(base);
    roots.add(`${base}e`);
  }
  if (token.length > 4 && token.endsWith('es')) roots.add(token.slice(0, -2));
  if (token.length > 3 && token.endsWith('s')) roots.add(token.slice(0, -1));
  return roots;
}

function senseOverlap(left, right) {
  const stop = new Set(['a', 'an', 'and', 'be', 'for', 'in', 'of', 'or', 'someone', 'something', 'the', 'to']);
  const tokens = (value) => new Set(
    (normalizeText(value).toLowerCase().match(/[a-z]+/g) ?? [])
      .filter((token) => !stop.has(token))
      .flatMap((token) => [...senseTokenRoots(token)]),
  );
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  return [...leftTokens].filter((token) => rightTokens.has(token)).length / Math.max(leftTokens.size, rightTokens.size);
}

function sentenceHasDifficultVocabulary(sentence, phrase, tokenFrequencies) {
  if (!tokenFrequencies) return false;
  const phraseRoots = new Set(
    (normalizeText(phrase).toLowerCase().match(/[a-z]+/g) ?? [])
      .flatMap((token) => [...senseTokenRoots(token)]),
  );
  const contentTokens = normalizeText(sentence).toLowerCase().match(/[a-z]+/g) ?? [];
  return contentTokens.some((token) => {
    if (token.length < 4) return false;
    if ([...senseTokenRoots(token)].some((rootToken) => phraseRoots.has(rootToken))) return false;
    return (tokenFrequencies[token] ?? 0) < CHILD_SOURCE_MIN_ZIPF;
  });
}

async function collectTokenFrequencies(candidatesByPhrase) {
  const tokens = [...new Set(
    [...candidatesByPhrase.values()]
      .flatMap((candidates) => candidates)
      .flatMap((candidate) => normalizeText(candidate.sentence).toLowerCase().match(/[a-z]+/g) ?? []),
  )].sort();
  const inputPath = path.join(workDir, `.source-example-tokens-${process.pid}.json`);
  const outputPath = path.join(workDir, `.source-example-frequency-${process.pid}.json`);
  try {
    await fs.writeFile(inputPath, JSON.stringify(tokens));
    await execFileAsync(wordFrequencyPython, [wordFrequencyScript, inputPath, outputPath], {
      maxBuffer: 16 * 1024 * 1024,
    });
    return JSON.parse(await fs.readFile(outputPath, 'utf8'));
  } finally {
    await Promise.all([
      fs.rm(inputPath, { force: true }),
      fs.rm(outputPath, { force: true }),
    ]);
  }
}

export function selectSourceExample(chunk, candidates, options = {}) {
  const valid = candidates.flatMap((candidate) => {
    const sentence = normalizeText(candidate.sentence);
    const wordCount = sentence.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g)?.length ?? 0;
    if (
      wordCount < 4
      || wordCount > 18
      || !sentenceIsComplete(sentence)
      || !sentenceUsesChunk(sentence, chunk.phrase)
      || UNSUITABLE_TOPIC.test(sentence)
      || UNSUITABLE_SOURCE_CONTEXT.test(sentence)
      || sentenceHasDifficultVocabulary(sentence, chunk.phrase, options.tokenFrequencies)
      || sentence.includes('(')
      || sentence.includes(' / ')
      || sentence.includes('—')
      || sentence.includes('"')
    ) return [];
    const priority = SOURCE_PRIORITY[candidate.source] ?? 9;
    const overlap = senseOverlap(chunk.sense, candidate.sense);
    if (
      SENSE_REQUIRED_SOURCES.has(candidate.source)
      && normalizeText(chunk.sense)
      && normalizeText(candidate.sense)
      && overlap === 0
    ) return [];
    return [{
      ...candidate,
      sentence,
      score: priority * 100 + Math.abs(wordCount - 9) - overlap * 10,
    }];
  });
  valid.sort((left, right) => left.score - right.score || left.sentence.localeCompare(right.sentence));
  return valid[0] ?? null;
}

export function buildSourceExampleEntries(words, candidatesByPhrase, options = {}) {
  return words
    .filter((word) => (word.teachingChunks?.length ?? 0) > 0)
    .map((word) => ({
      id: word.id,
      examples: (word.teachingChunks ?? []).slice(0, 3).map((chunk) => {
        const candidates = candidatesByPhrase.get(normalizeChunkPhrase(chunk.phrase)) ?? [];
        const selected = selectSourceExample(chunk, candidates, options);
        return selected
          ? {
              phrase: chunk.phrase,
              status: 'matched',
              source: selected.source,
              sentence: selected.sentence,
              sourceSense: selected.sense ?? '',
              candidateCount: candidates.length,
            }
          : {
              phrase: chunk.phrase,
              status: 'missing',
              candidateCount: candidates.length,
            };
      }),
    }));
}

function parseArguments(argv) {
  let outputPath = defaultOutputPath;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--output') outputPath = path.resolve(argv[++index]);
  }
  return { outputPath };
}

async function main() {
  const { outputPath } = parseArguments(process.argv.slice(2));
  const vocabulary = JSON.parse(await fs.readFile(vocabularyPath, 'utf8'));
  const targetMap = targetPhraseMap(vocabulary.words);
  const candidatesByPhrase = new Map();
  console.log(`Collecting examples for ${targetMap.size} unique teaching chunks`);
  await extractPdfExamples(candidatesByPhrase, targetMap);
  console.log(`PDF candidates: ${[...candidatesByPhrase.values()].reduce((sum, list) => sum + list.length, 0)}`);
  const oewnStats = await extractOewnExamples(candidatesByPhrase, targetMap);
  console.log(`Open English WordNet referenced synsets: ${oewnStats.referencedSynsets}`);
  const kaikkiStats = await extractKaikkiExamples(candidatesByPhrase, targetMap);
  console.log(`Kaikki scan: ${kaikkiStats.linesRead} entries; matched ${kaikkiStats.matchedEntries}`);

  const tokenFrequencies = await collectTokenFrequencies(candidatesByPhrase);
  const entries = buildSourceExampleEntries(vocabulary.words, candidatesByPhrase, { tokenFrequencies });
  const allExamples = entries.flatMap((entry) => entry.examples);
  const sourceCounts = allExamples.reduce((counts, item) => {
    const source = item.status === 'matched' ? item.source : 'missing';
    counts[source] = (counts[source] ?? 0) + 1;
    return counts;
  }, {});
  const stats = {
    words: entries.length,
    targetChunks: allExamples.length,
    matchedChunks: allExamples.filter((item) => item.status === 'matched').length,
    missingChunks: allExamples.filter((item) => item.status === 'missing').length,
    sourceCounts,
  };
  await fs.writeFile(outputPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    stats,
    entries,
  }, null, 2)}\n`);
  console.log(JSON.stringify(stats, null, 2));
  console.log(`Saved source examples to ${outputPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
