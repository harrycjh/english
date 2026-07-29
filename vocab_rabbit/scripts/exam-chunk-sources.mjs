import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vocabularyPath = path.join(root, 'public/content/words/ket_vocabulary.json');
const defaultWorkDir = path.join(root, 'tmp/exam-chunks');
const defaultOutputPath = path.join(defaultWorkDir, 'source-candidates.json');

const SOURCES = {
  phave: {
    id: 'phave',
    label: 'PHaVE List',
    url: 'https://www.norbertschmitt.co.uk/_files/ugd/5f2482_fb2f15be0d104d08802d9ffd722e5782.pdf',
  },
  phraseList: {
    id: 'phrase-list',
    label: 'PHRASE List',
    url: 'https://www.lextutor.ca/tests/pvst/appendix_phrase_list.pdf',
  },
  oewn: {
    id: 'oewn-2025',
    label: 'Open English WordNet 2025',
    url: 'https://github.com/globalwordnet/english-wordnet/releases/download/2025-edition/english-wordnet-2025-json.zip',
  },
  kaikki: {
    id: 'wiktionary-kaikki',
    label: 'English Wiktionary via Kaikki',
    url: 'https://kaikki.org/dictionary/English/kaikki.org-dictionary-English.jsonl.gz',
  },
};

const STOPWORD_ONLY_VARIANTS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'from',
  'in',
  'of',
  'on',
  'or',
  'so',
  'than',
  'that',
  'the',
  'to',
  'up',
  'with',
]);

const REJECTED_LABELS = [
  'abbreviation',
  'archaic',
  'dated',
  'dialectal',
  'historical',
  'humorous',
  'literary',
  'nonstandard',
  'obsolete',
  'offensive',
  'rare',
  'slang',
  'vulgar',
];

const HEADWORD_OVERRIDES = {
  'at / @': ['at'],
  'barbecue/barbeque': ['barbecue', 'barbeque'],
  'cafe/café': ['cafe', 'café'],
  'centre/center': ['centre', 'center'],
  'centimetre/centimeter (cm)': ['centimetre', 'centimeter'],
  'examination/exam': ['examination', 'exam'],
  'give somebody a call/ring': ['give somebody a call', 'give somebody a ring'],
  'gram(me)': ['gram', 'gramme'],
  'lots / a lot': ['lots', 'a lot'],
  'OK/okay': ['ok', 'okay'],
  'prefer / would prefer': ['prefer', 'would prefer'],
  'television (TV)': ['television', 'tv'],
  'v/versus': ['versus'],
};

function parseArguments(argv) {
  const options = {
    workDir: defaultWorkDir,
    outputPath: defaultOutputPath,
    skipKaikki: false,
    forceDownload: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--work-dir') options.workDir = path.resolve(argv[++index]);
    else if (value === '--output') options.outputPath = path.resolve(argv[++index]);
    else if (value === '--skip-kaikki') options.skipKaikki = true;
    else if (value === '--force-download') options.forceDownload = true;
  }
  return options;
}

export function normalizePhrase(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/g, '');
}

function normalizeForMatch(value) {
  return normalizePhrase(value)
    .toLowerCase()
    .replace(/[_–—-]+/g, ' ')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandParentheticalForms(value) {
  const forms = new Set();
  const inline = value.match(/^(.*)\(([^ )]+)\)(.*)$/);
  if (inline) {
    forms.add(`${inline[1]}${inline[3]}`);
    forms.add(`${inline[1]}${inline[2]}${inline[3]}`);
  } else {
    forms.add(value);
  }
  return [...forms];
}

export function getHeadwordVariants(word) {
  const raw = normalizePhrase(word.english);
  const override = HEADWORD_OVERRIDES[raw];
  const seeds = override ?? raw.split(/\s*\/\s*/g);
  const variants = new Set();
  for (const seed of seeds) {
    for (const expanded of expandParentheticalForms(seed)) {
      const normalized = normalizeForMatch(expanded);
      if (normalized) variants.add(normalized);
    }
  }
  return [...variants].sort((left, right) => right.length - left.length);
}

function stripPhraseQualifier(value) {
  return normalizePhrase(value)
    .replace(/\s+\((?:'[^']+'|"[^"]+"|[A-Z][A-Z /+.-]*)\)\s*$/u, '')
    .replace(/^\(BE\)\s+/i, 'be ')
    .replace(/\bONE['’]S\b/gi, "one's")
    .replace(/\bSB\b/g, 'somebody')
    .replace(/\bSTH\b/g, 'something')
    .toLowerCase();
}

export function parsePhaveText(text) {
  const entries = [];
  const seenRanks = new Set();
  const pattern = /^\s*(\d+)\.\s+([A-Z][A-Z0-9 ’'()\/+.-]+?)\s*$/gm;
  for (const match of text.matchAll(pattern)) {
    const rank = Number(match[1]);
    if (rank < 1 || rank > 150 || seenRanks.has(rank)) continue;
    seenRanks.add(rank);
    entries.push({
      phrase: stripPhraseQualifier(match[2]),
      rank,
      source: SOURCES.phave.id,
    });
  }
  entries.sort((left, right) => left.rank - right.rank);
  if (entries.length !== 150) {
    throw new Error(`Expected 150 PHaVE entries, found ${entries.length}`);
  }
  return entries;
}

export function parsePhraseListText(text) {
  const entries = [];
  const seenRanks = new Set();
  for (const rawLine of text.replace(/\f/g, '\n').split(/\r?\n/)) {
    const match = rawLine.match(/^\s*(\d{2,5})\s+(.+?)\s+(\d{3,6})(?:\s|$)/);
    if (!match) continue;
    const rank = Number(match[1]);
    if (seenRanks.has(rank)) continue;
    seenRanks.add(rank);
    entries.push({
      phrase: stripPhraseQualifier(match[2]),
      rank,
      frequencyPer100Million: Number(match[3]),
      source: SOURCES.phraseList.id,
    });
  }
  entries.sort((left, right) => left.rank - right.rank);
  if (entries.length !== 505) {
    throw new Error(`Expected 505 PHRASE List entries, found ${entries.length}`);
  }
  return entries;
}

function buildVariantIndex(words, { includeStopwords = true } = {}) {
  const variantsByFirstToken = new Map();
  for (const word of words) {
    for (const variant of getHeadwordVariants(word)) {
      const tokens = variant.split(' ');
      if (!includeStopwords && tokens.length === 1 && STOPWORD_ONLY_VARIANTS.has(variant)) continue;
      const list = variantsByFirstToken.get(tokens[0]) ?? [];
      list.push({ wordId: word.id, variant, tokens });
      variantsByFirstToken.set(tokens[0], list);
    }
  }
  return variantsByFirstToken;
}

function findMatchingWordIds(phrase, variantIndex) {
  const tokens = normalizeForMatch(phrase).split(' ').filter(Boolean);
  const wordIds = new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    const variants = variantIndex.get(tokens[index]) ?? [];
    for (const candidate of variants) {
      const slice = tokens.slice(index, index + candidate.tokens.length);
      if (slice.length === candidate.tokens.length && slice.every((token, offset) => token === candidate.tokens[offset])) {
        wordIds.add(candidate.wordId);
      }
    }
  }
  return [...wordIds];
}

function hasRejectedLabels(entry) {
  const labels = [
    ...(entry.tags ?? []),
    ...(entry.categories ?? []),
    ...(entry.senses ?? []).flatMap((sense) => [...(sense.tags ?? []), ...(sense.categories ?? [])]),
  ].join(' ').toLowerCase();
  return REJECTED_LABELS.some((label) => labels.includes(label));
}

function isPhraseCandidate(phrase) {
  const normalized = normalizeForMatch(phrase);
  const tokens = normalized.split(' ').filter(Boolean);
  return tokens.length >= 2
    && tokens.length <= 10
    && /^[a-z0-9' -]+$/i.test(normalizePhrase(phrase))
    && !/\d/.test(normalized);
}

function firstGloss(entry) {
  for (const sense of entry.senses ?? []) {
    const gloss = sense.glosses?.find(Boolean);
    if (gloss) return normalizePhrase(gloss);
  }
  return undefined;
}

function candidateKey(phrase) {
  return normalizeForMatch(phrase);
}

function addCandidate(entriesByWordId, wordId, candidate) {
  const candidates = entriesByWordId.get(wordId) ?? new Map();
  const key = candidateKey(candidate.phrase);
  if (!key) return;
  const existing = candidates.get(key);
  if (existing) {
    const evidenceKey = `${candidate.source}:${candidate.rank ?? ''}`;
    const hasEvidence = existing.evidence.some(
      (item) => `${item.source}:${item.rank ?? ''}` === evidenceKey,
    );
    if (!hasEvidence) {
      existing.evidence.push({
        source: candidate.source,
        ...(candidate.rank ? { rank: candidate.rank } : {}),
        ...(candidate.frequencyPer100Million
          ? { frequencyPer100Million: candidate.frequencyPer100Million }
          : {}),
      });
    }
    if (!existing.gloss && candidate.gloss) existing.gloss = candidate.gloss;
    return;
  }
  candidates.set(key, {
    phrase: normalizePhrase(candidate.phrase).toLowerCase(),
    ...(candidate.gloss ? { gloss: candidate.gloss } : {}),
    evidence: [{
      source: candidate.source,
      ...(candidate.rank ? { rank: candidate.rank } : {}),
      ...(candidate.frequencyPer100Million
        ? { frequencyPer100Million: candidate.frequencyPer100Million }
        : {}),
    }],
  });
  entriesByWordId.set(wordId, candidates);
}

function addSourceList(entriesByWordId, list, variantIndex) {
  for (const candidate of list) {
    for (const wordId of findMatchingWordIds(candidate.phrase, variantIndex)) {
      addCandidate(entriesByWordId, wordId, candidate);
    }
  }
}

async function downloadFile(url, destination, forceDownload) {
  if (!forceDownload) {
    try {
      const stat = await fs.stat(destination);
      if (stat.size > 0) return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.part`;
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed ${response.status} for ${url}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
  await fs.rename(temporary, destination);
}

async function pdfToText(pdfPath) {
  const { stdout } = await execFileAsync('pdftotext', ['-layout', pdfPath, '-'], {
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

async function collectOewnCandidates(zipPath, entriesByWordId, variantIndex) {
  const { stdout } = await execFileAsync('unzip', ['-Z1', zipPath], {
    maxBuffer: 4 * 1024 * 1024,
  });
  const entryFiles = stdout.split(/\r?\n/).filter((name) => /^entries-.*\.json$/.test(name));
  let phraseCount = 0;
  for (const entryFile of entryFiles) {
    const { stdout: json } = await execFileAsync('unzip', ['-p', zipPath, entryFile], {
      maxBuffer: 32 * 1024 * 1024,
    });
    const entries = JSON.parse(json);
    for (const phrase of Object.keys(entries)) {
      if (!isPhraseCandidate(phrase)) continue;
      phraseCount += 1;
      for (const wordId of findMatchingWordIds(phrase, variantIndex)) {
        addCandidate(entriesByWordId, wordId, {
          phrase,
          source: SOURCES.oewn.id,
        });
      }
    }
  }
  return phraseCount;
}

async function collectKaikkiCandidates(gzipPath, entriesByWordId, variantIndex) {
  const input = createReadStream(gzipPath).pipe(createGunzip());
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let linesRead = 0;
  let phraseCount = 0;
  for await (const line of lines) {
    linesRead += 1;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.lang_code !== 'en' || !isPhraseCandidate(entry.word) || hasRejectedLabels(entry)) continue;
    phraseCount += 1;
    for (const wordId of findMatchingWordIds(entry.word, variantIndex)) {
      addCandidate(entriesByWordId, wordId, {
        phrase: entry.word,
        gloss: firstGloss(entry),
        source: SOURCES.kaikki.id,
      });
    }
    if (linesRead % 250000 === 0) {
      console.log(`Kaikki scan: ${linesRead.toLocaleString()} entries, ${phraseCount.toLocaleString()} phrases`);
    }
  }
  return { linesRead, phraseCount };
}

function serializeEntries(words, entriesByWordId) {
  return words.map((word) => {
    const candidates = [...(entriesByWordId.get(word.id)?.values() ?? [])]
      .map((candidate) => ({
        ...candidate,
        evidence: candidate.evidence.sort((left, right) => left.source.localeCompare(right.source)),
      }))
      .sort((left, right) => {
        const leftBestRank = Math.min(...left.evidence.map((item) => item.rank ?? Number.POSITIVE_INFINITY));
        const rightBestRank = Math.min(...right.evidence.map((item) => item.rank ?? Number.POSITIVE_INFINITY));
        return leftBestRank - rightBestRank || left.phrase.localeCompare(right.phrase);
      });
    return {
      id: word.id,
      english: word.english,
      partOfSpeech: word.studySense?.partOfSpeech ?? word.partOfSpeech,
      chinese: word.studySense?.chinese ?? word.chinese,
      candidates,
    };
  });
}

export async function collectSourceCandidates(options) {
  const payload = JSON.parse(await fs.readFile(vocabularyPath, 'utf8'));
  const words = payload.words;
  const entriesByWordId = new Map();
  const broadVariantIndex = buildVariantIndex(words);
  const contentVariantIndex = buildVariantIndex(words, { includeStopwords: false });

  await fs.mkdir(options.workDir, { recursive: true });
  const phavePdf = path.join(options.workDir, 'phave-list.pdf');
  const phraseListPdf = path.join(options.workDir, 'phrase-list.pdf');
  const oewnZip = path.join(options.workDir, 'english-wordnet-2025-json.zip');
  const kaikkiGzip = path.join(options.workDir, 'kaikki-english.jsonl.gz');

  await Promise.all([
    downloadFile(SOURCES.phave.url, phavePdf, options.forceDownload),
    downloadFile(SOURCES.phraseList.url, phraseListPdf, options.forceDownload),
    downloadFile(SOURCES.oewn.url, oewnZip, options.forceDownload),
    ...(options.skipKaikki
      ? []
      : [downloadFile(SOURCES.kaikki.url, kaikkiGzip, options.forceDownload)]),
  ]);

  const [phaveText, phraseListText] = await Promise.all([
    pdfToText(phavePdf),
    pdfToText(phraseListPdf),
  ]);
  const phave = parsePhaveText(phaveText);
  const phraseList = parsePhraseListText(phraseListText);
  addSourceList(entriesByWordId, phave, broadVariantIndex);
  addSourceList(entriesByWordId, phraseList, broadVariantIndex);

  const oewnPhraseCount = await collectOewnCandidates(oewnZip, entriesByWordId, contentVariantIndex);
  const kaikkiStats = options.skipKaikki
    ? { linesRead: 0, phraseCount: 0 }
    : await collectKaikkiCandidates(kaikkiGzip, entriesByWordId, contentVariantIndex);

  const entries = serializeEntries(words, entriesByWordId);
  const candidateCount = entries.reduce((sum, entry) => sum + entry.candidates.length, 0);
  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    vocabularyWordCount: words.length,
    sources: Object.values(SOURCES),
    stats: {
      phaveEntries: phave.length,
      phraseListEntries: phraseList.length,
      oewnPhrasesScanned: oewnPhraseCount,
      kaikkiEntriesScanned: kaikkiStats.linesRead,
      kaikkiPhrasesScanned: kaikkiStats.phraseCount,
      wordsWithCandidates: entries.filter((entry) => entry.candidates.length > 0).length,
      candidateCount,
    },
    entries,
  };
  await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
  await fs.writeFile(options.outputPath, `${JSON.stringify(output, null, 2)}\n`);
  return output;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const output = await collectSourceCandidates(options);
  console.log(JSON.stringify(output.stats, null, 2));
  console.log(`Saved source candidates to ${options.outputPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
