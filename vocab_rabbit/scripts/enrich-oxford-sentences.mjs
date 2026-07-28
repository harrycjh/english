import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vocabularyPath = path.join(projectRoot, 'public/content/words/ket_vocabulary.json');
const mediaPath = path.join(projectRoot, 'public/content/words/word_related_media.json');
const ocrCachePath = path.join(
  projectRoot,
  'design-output/oxford-ocr-audit/after-fix/ocr-cache.jsonl',
);
const sentenceSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function normalizeStudyText(value) {
  return value
    .replace(/\s+\([^)]*\)$/g, '')
    .replace(/\(([^)]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getSearchForms(value) {
  const studyText = normalizeStudyText(value);
  const forms = new Set([studyText]);
  for (const term of studyText.split(/\s*\/\s*|\s+or\s+/)) {
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
  return [...forms].sort((left, right) => right.length - left.length);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanSentence(value) {
  const cleaned = value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/^[\s|_[\]{}<>~=;:.,/\\-]+/, '')
    .replace(/\s+\d{1,3}\s*$/, '')
    .trim();
  return (cleaned.match(/"/g)?.length ?? 0) % 2 === 1
    ? cleaned.replace(/^"|"$/g, '')
    : cleaned;
}

function buildCandidates(rawText) {
  const candidates = [];
  const normalizedPage = cleanSentence(rawText);
  for (const item of sentenceSegmenter.segment(normalizedPage)) {
    candidates.push(cleanSentence(item.segment));
  }
  for (const paragraph of rawText.split(/\n{2,}/)) {
    const normalizedParagraph = cleanSentence(paragraph);
    for (const item of sentenceSegmenter.segment(normalizedParagraph)) {
      candidates.push(cleanSentence(item.segment));
    }
  }
  for (const line of rawText.split(/\n+/)) {
    candidates.push(cleanSentence(line));
  }
  return [...new Set(candidates)].filter((candidate) => (
    candidate.length >= 2
    && candidate.length <= 320
    && /[A-Za-z]/.test(candidate)
  ));
}

function readabilityScore(sentence) {
  const letters = sentence.match(/[A-Za-z]/g)?.length ?? 0;
  const words = sentence.match(/[A-Za-z']+/g)?.length ?? 0;
  const alphaRatio = letters / Math.max(1, sentence.length);
  return (
    (sentence.length >= 10 && sentence.length <= 220 ? 20 : 0)
    + (words >= 3 ? 16 : 0)
    + (alphaRatio >= 0.58 ? 14 : 0)
    + (/^[A-Z"']/.test(sentence) ? 5 : 0)
    + (/[.!?]"?$/.test(sentence) ? 5 : 0)
    - Math.max(0, sentence.length - 220) / 8
  );
}

function pickSentence(rawText, english) {
  const searchForms = getSearchForms(english);
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

const vocabulary = readJson(vocabularyPath);
const wordsById = new Map(vocabulary.words.map((word) => [word.id, word]));
const media = readJson(mediaPath);
const ocrByImagePath = new Map(
  fs.readFileSync(ocrCachePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const row = JSON.parse(line);
      return [row.imagePath, row.ocrText ?? ''];
    }),
);

let withOxford = 0;
let withSentence = 0;
let matchedWord = 0;
const missing = [];

for (const entry of media.entries) {
  const oxford = entry.relatedMedia?.oxford;
  if (!oxford) continue;
  withOxford += 1;
  const word = wordsById.get(entry.wordId);
  const ocrText = ocrByImagePath.get(oxford.imagePath) ?? '';
  const sentence = word ? pickSentence(ocrText, word.english) : null;
  if (!sentence) {
    delete oxford.sentence;
    missing.push(entry.wordId);
    continue;
  }
  if (oxford.sentence !== sentence) delete oxford.sentenceTranslation;
  oxford.sentence = sentence;
  withSentence += 1;
  if (getSearchForms(word.english).some((form) => (
    new RegExp(`(^|[^a-z])${escapeRegExp(form)}([^a-z]|$)`, 'i').test(sentence)
  ))) {
    matchedWord += 1;
  }
}

media.stats.withOxfordSentence = withSentence;
writeJson(mediaPath, media);

console.log(JSON.stringify({
  withOxford,
  withSentence,
  matchedWord,
  readablePageFallback: withSentence - matchedWord,
  missing,
}, null, 2));
