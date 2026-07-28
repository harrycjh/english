import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extractedRoot = path.resolve(projectRoot, '../red-rocket/extracted');
const vocabularyPath = path.join(projectRoot, 'public/content/words/ket_vocabulary.json');
const mediaPath = path.join(projectRoot, 'public/content/words/word_related_media.json');
const sentenceSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function listJsonFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJsonFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.json') ? [entryPath] : [];
  });
}

function normalizeKey(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeStudyText(value) {
  return value
    .replace(/\s+\([^)]*\)$/g, '')
    .replace(/\(([^)]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getSearchForms(...values) {
  const forms = new Set();
  for (const value of values) {
    if (!value) continue;
    const studyText = normalizeStudyText(value);
    for (const term of [studyText, ...studyText.split(/\s*\/\s*|\s+or\s+/)]) {
      if (!term) continue;
      forms.add(term);
      if (!/^[a-z]+$/.test(term)) continue;
      forms.add(`${term}s`);
      forms.add(`${term}ed`);
      forms.add(`${term}ing`);
      if (term.endsWith('e')) {
        forms.add(`${term}d`);
        forms.add(`${term.slice(0, -1)}ing`);
      }
      if (term.endsWith('y')) {
        forms.add(`${term.slice(0, -1)}ies`);
        forms.add(`${term.slice(0, -1)}ied`);
      }
    }
  }
  return [...forms].sort((left, right) => right.length - left.length);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanSentence(value) {
  const cleaned = value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/([A-Za-z])\.\s*([A-Za-z])/g, '$1. $2')
    .replace(/\s+/g, ' ')
    .replace(/^[^A-Za-z"'(]+/, '')
    .replace(/^[A-Z]{1,2}(?=An?\s)/, '')
    .replace(/\s+\d{1,3}\s*$/, '')
    .trim();
  return (cleaned.match(/"/g)?.length ?? 0) % 2 === 1
    ? cleaned.replace(/^"|"$/g, '')
    : cleaned;
}

function buildCandidates(rawText) {
  const candidates = [];
  const sentenceStarters = /\b(?:I|We|You|He|She|It|They|The|A|An|This|That|These|Those|My|Our|Your|His|Her|Their|There|Here|Please|Can|Do|Does|Did|Who|What|Where|When|Why|How|If|In|On|At|To|For|From|With|Some|Many|Now|Children|People|Grandma|Grandpa|Doctors|Bees)\b/g;
  const addCandidate = (value) => {
    const candidate = cleanSentence(value);
    if (!candidate) return;
    candidates.push(candidate);
    for (const match of candidate.matchAll(sentenceStarters)) {
      if ((match.index ?? 0) > 0) candidates.push(candidate.slice(match.index).trim());
    }
  };
  const lines = rawText.split(/\n+/).map(cleanSentence).filter(Boolean);

  for (const windowSize of [2, 3, 1, 4]) {
    for (let index = 0; index + windowSize <= lines.length; index += 1) {
      addCandidate(lines.slice(index, index + windowSize).join(' '));
    }
  }

  const normalizedPage = cleanSentence(rawText);
  for (const item of sentenceSegmenter.segment(normalizedPage)) {
    addCandidate(item.segment);
  }

  return [...new Set(candidates)].filter((candidate) => (
    candidate.length >= 4
    && candidate.length <= 320
    && /[A-Za-z]/.test(candidate)
  ));
}

function readabilityScore(sentence) {
  const letters = sentence.match(/[A-Za-z]/g)?.length ?? 0;
  const wordList = sentence.match(/[A-Za-z']+/g) ?? [];
  const words = wordList.length;
  const alphaRatio = letters / Math.max(1, sentence.length);
  const acceptedShortWords = new Set([
    'a', 'i', 'am', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'if', 'in', 'is',
    'it', 'me', 'my', 'no', 'of', 'on', 'or', 'so', 'to', 'up', 'us', 'we',
  ]);
  const noiseWords = wordList.filter((word) => (
    word.length <= 2 && !acceptedShortWords.has(word.toLowerCase())
  )).length;
  const uppercaseNoiseWords = wordList.filter((word) => (
    word.length >= 2
    && word.length <= 4
    && word === word.toUpperCase()
    && !['I'].includes(word)
  )).length;
  return (
    (sentence.length >= 10 && sentence.length <= 220 ? 20 : 0)
    + (words >= 3 ? 18 : 0)
    + (alphaRatio >= 0.58 ? 16 : 0)
    + (/^[A-Z"']/.test(sentence) ? 6 : 0)
    + (/[.!?]"?$/.test(sentence) ? 6 : 0)
    - (words < 3 ? 24 : 0)
    - (alphaRatio < 0.45 ? 30 : 0)
    - noiseWords * 7
    - uppercaseNoiseWords * 6
  );
}

function pickSentence(rawText, matchedTerm, english) {
  const searchForms = getSearchForms(matchedTerm, english);
  const candidates = buildCandidates(rawText);
  let bestMatch = null;
  let bestFallback = null;

  for (const sentence of candidates) {
    const readability = readabilityScore(sentence);
    const matchedFormIndex = searchForms.findIndex((form) => (
      new RegExp(`(^|[^a-z])${escapeRegExp(form)}([^a-z]|$)`, 'i').test(sentence)
    ));
    if (matchedFormIndex >= 0) {
      const score = 100 - matchedFormIndex + readability;
      if (!bestMatch || score > bestMatch.score) bestMatch = { sentence, score };
    }
    if (!bestFallback || readability > bestFallback.score) {
      bestFallback = { sentence, score: readability };
    }
  }

  return bestMatch?.sentence ?? bestFallback?.sentence ?? null;
}

const booksByKey = new Map();
for (const filePath of listJsonFiles(extractedRoot)) {
  const book = readJson(filePath);
  const level = book.stage_name || book.source_folder || path.basename(path.dirname(filePath));
  const title = book.title || path.basename(filePath, '.json');
  booksByKey.set(`${normalizeKey(level)}|${normalizeKey(title)}`, book);
}

const vocabulary = readJson(vocabularyPath);
const wordsById = new Map(vocabulary.words.map((word) => [word.id, word]));
const media = readJson(mediaPath);
let withRedRocket = 0;
let withSentence = 0;
let matchedWord = 0;
const missing = [];

for (const entry of media.entries) {
  const redRocket = entry.relatedMedia?.redRocket;
  if (!redRocket) continue;
  withRedRocket += 1;

  const book = booksByKey.get(`${normalizeKey(redRocket.level)}|${normalizeKey(redRocket.title)}`);
  const page = book?.pages?.find((candidate) => Number(candidate.page_number) === Number(redRocket.page));
  const word = wordsById.get(entry.wordId);
  const rawText = page?.text ?? page?.raw_text ?? '';
  const sentence = word ? pickSentence(rawText, redRocket.matchedTerm, word.english) : null;

  if (!sentence) {
    delete redRocket.sentence;
    missing.push(entry.wordId);
    continue;
  }

  if (redRocket.sentence !== sentence) delete redRocket.sentenceTranslation;
  redRocket.sentence = sentence;
  withSentence += 1;
  if (getSearchForms(redRocket.matchedTerm, word.english).some((form) => (
    new RegExp(`(^|[^a-z])${escapeRegExp(form)}([^a-z]|$)`, 'i').test(sentence)
  ))) {
    matchedWord += 1;
  }
}

media.stats.withRedRocketSentence = withSentence;
writeJson(mediaPath, media);

console.log(JSON.stringify({
  withRedRocket,
  withSentence,
  matchedWord,
  readablePageFallback: withSentence - matchedWord,
  missing,
}, null, 2));
