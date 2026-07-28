import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vocabularyPath = path.join(projectRoot, 'public/content/words/ket_vocabulary.json');
const mediaPath = path.join(projectRoot, 'public/content/words/word_related_media.json');
const oxfordImagesPath = path.join(
  projectRoot,
  'design-output/oxford-ocr-audit/after-fix/images.json',
);
const oxfordOcrPath = path.join(
  projectRoot,
  'design-output/oxford-ocr-audit/after-fix/ocr-cache.jsonl',
);
const redRocketExtractedRoot = path.resolve(projectRoot, '../red-rocket/extracted');
const checkpointPath = path.join(projectRoot, 'tmp/related-media-sentence-repairs.json');
const reportDir = path.join(projectRoot, 'design-output/related-media-sentence-repair');
const endpoint = process.env.LM_STUDIO_URL ?? 'http://127.0.0.1:1234/v1/chat/completions';
const model = process.env.LM_STUDIO_MODEL ?? 'qwen/qwen3-vl-30b';
const batchSize = Number(process.env.SENTENCE_REPAIR_BATCH_SIZE ?? 4);
const shouldApply = process.argv.includes('--apply');
const forceRestart = process.argv.includes('--restart');
const limitArgument = process.argv.find((argument) => argument.startsWith('--limit='));
const limit = limitArgument ? Number(limitArgument.split('=')[1]) : null;

function normalizeKey(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeSentence(value) {
  return String(value ?? '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function getWords(value) {
  return normalizeSentence(value).match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
}

function isSuspiciousSentence(value) {
  const sentence = normalizeSentence(value);
  const words = getWords(sentence);
  const letters = sentence.match(/[A-Za-z]/g)?.length ?? 0;
  const alphaRatio = letters / Math.max(1, sentence.length);
  const acceptedShortWords = new Set([
    'a', 'i', 'am', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'if', 'in', 'is',
    'it', 'me', 'my', 'no', 'of', 'on', 'or', 'so', 'to', 'up', 'us', 'we',
  ]);
  const shortNoiseWords = words.filter((word) => (
    word.length <= 2 && !acceptedShortWords.has(word.toLowerCase())
  ));
  const uppercaseNoiseWords = words.filter((word) => (
    word.length >= 2
    && word.length <= 5
    && word === word.toUpperCase()
    && !['I', 'OK', 'TV', 'UK', 'USA'].includes(word)
  ));
  const trailingFragment = /\b(?:a|an|the|and|or|but|for|from|with|to|of|is|was|were|has|have|had|can|could|will|would)\s*[.!?]?$/.test(
    sentence.toLowerCase(),
  );
  const quoteCount = sentence.match(/"/g)?.length ?? 0;

  return (
    words.length < 3
    || alphaRatio < 0.68
    || shortNoiseWords.length > 0
    || uppercaseNoiseWords.length > 0
    || trailingFragment
    || /[|_{}<>~=\\]/.test(sentence)
    || /\s[!?.,;:]{2,}/.test(sentence)
    || /\b(?:Tt|Tm|Tve|Tll|Ts)\b/.test(sentence)
    || /\b[a-z]{1,2}\s+[A-Z][a-z]+\b/.test(sentence)
    || quoteCount % 2 === 1
    || !/[.!?]"?'?$/.test(sentence)
  );
}

function getContextWindow(value, targetWord, maximumLength = 900) {
  const text = normalizeSentence(value);
  if (text.length <= maximumLength) return text;
  const normalizedTarget = normalizeKey(targetWord);
  const index = normalizeKey(text).indexOf(normalizedTarget);
  if (index < 0) return text.slice(0, maximumLength);
  const start = Math.max(0, index - Math.floor(maximumLength * 0.42));
  return text.slice(start, start + maximumLength);
}

function readJsonLines(value, key) {
  return new Map(
    value
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((row) => row[key])
      .map((row) => [row[key], row]),
  );
}

async function listJsonFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJsonFiles(entryPath);
    return entry.isFile() && entry.name.endsWith('.json') ? [entryPath] : [];
  }));
  return nested.flat();
}

async function loadOxfordIndexedContext(audit) {
  if (!audit?.alignmentReliable || !audit.indexedSource || audit.bestIndexedPage == null) {
    return '';
  }
  try {
    const payload = JSON.parse(await fs.readFile(audit.indexedSource, 'utf8'));
    const records = Array.isArray(payload) ? payload : [payload];
    for (const record of records) {
      const page = record.pages?.find((candidate) => (
        Number(candidate.page_number) === Number(audit.bestIndexedPage)
      ));
      if (page?.text) return normalizeSentence(page.text);
    }
  } catch {
    return '';
  }
  return '';
}

async function loadRedRocketBooks() {
  const booksByKey = new Map();
  for (const filePath of await listJsonFiles(redRocketExtractedRoot)) {
    const book = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const level = book.stage_name || book.source_folder || path.basename(path.dirname(filePath));
    const title = book.title || path.basename(filePath, '.json');
    booksByKey.set(`${normalizeKey(level)}|${normalizeKey(title)}`, book);
  }
  return booksByKey;
}

function tokenSupportScore(candidate, evidenceValues) {
  const candidateTokens = getWords(candidate).map((word) => word.toLowerCase());
  if (candidateTokens.length === 0) return 0;
  const candidateCounts = new Map();
  for (const token of candidateTokens) {
    candidateCounts.set(token, (candidateCounts.get(token) ?? 0) + 1);
  }
  let best = 0;
  for (const evidence of evidenceValues) {
    const evidenceCounts = new Map();
    for (const token of getWords(evidence).map((word) => word.toLowerCase())) {
      evidenceCounts.set(token, (evidenceCounts.get(token) ?? 0) + 1);
    }
    let overlap = 0;
    for (const [token, count] of candidateCounts) {
      overlap += Math.min(count, evidenceCounts.get(token) ?? 0);
    }
    best = Math.max(best, overlap / candidateTokens.length);
  }
  return best;
}

async function loadCheckpoint() {
  if (forceRestart) return new Map();
  try {
    const payload = JSON.parse(await fs.readFile(checkpointPath, 'utf8'));
    if (payload.model !== model) return new Map();
    return new Map(payload.repairs.map((repair) => [repair.id, repair]));
  } catch (error) {
    if (error.code === 'ENOENT') return new Map();
    throw error;
  }
}

async function saveCheckpoint(repairsById) {
  await fs.mkdir(path.dirname(checkpointPath), { recursive: true });
  await fs.writeFile(checkpointPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    model,
    repairs: [...repairsById.values()],
  }, null, 2)}\n`);
}

function validateBatch(items, rawRepairs) {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const expectedIds = new Set(itemsById.keys());
  if (!Array.isArray(rawRepairs) || rawRepairs.length !== items.length) {
    throw new Error(`Expected ${items.length} repairs, received ${rawRepairs?.length ?? 0}`);
  }

  return rawRepairs.map((rawRepair) => {
    if (!expectedIds.delete(rawRepair.id)) {
      throw new Error(`Unexpected or duplicate repair id: ${rawRepair.id}`);
    }
    const item = itemsById.get(rawRepair.id);
    const status = ['keep', 'fix', 'remove', 'uncertain'].includes(rawRepair.status)
      ? rawRepair.status
      : 'uncertain';
    const proposedSentence = normalizeSentence(rawRepair.sentence);
    const supportScore = status === 'fix'
      ? tokenSupportScore(proposedSentence, item.evidence)
      : 1;
    const changed = proposedSentence !== item.currentSentence;
    const acceptedFix = (
      status === 'fix'
      && changed
      && proposedSentence.length >= 4
      && proposedSentence.length <= 360
      && /[A-Za-z]/.test(proposedSentence)
      && supportScore >= 0.72
      && Number(rawRepair.confidence) >= 0.9
    );
    const acceptedRemoval = status === 'remove' && Number(rawRepair.confidence) >= 0.9;
    const accepted = acceptedFix || acceptedRemoval;
    return {
      id: item.id,
      source: item.source,
      wordId: item.wordId,
      targetWord: item.targetWord,
      pageLabel: item.pageLabel,
      before: item.currentSentence,
      status,
      proposedSentence: status === 'fix' ? proposedSentence : item.currentSentence,
      after: acceptedRemoval ? '' : acceptedFix ? proposedSentence : item.currentSentence,
      changed,
      confidence: Math.max(0, Math.min(1, Number(rawRepair.confidence) || 0)),
      supportScore: Number(supportScore.toFixed(4)),
      accepted,
      reason: String(rawRepair.reason ?? '').trim(),
    };
  });
}

async function getImageDataUrl(item) {
  const inputPath = path.join(projectRoot, 'public', item.imagePath.replace(/^\//, ''));
  let pipeline = sharp(inputPath);
  if (item.crop) {
    pipeline = pipeline.extract(item.crop);
  }
  const bytes = await pipeline
    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer();
  return `data:image/jpeg;base64,${bytes.toString('base64')}`;
}

async function requestBatch(items) {
  const content = [{
    type: 'text',
    text: [
      'Review each pictured children-book page.',
      'For every ITEM, transcribe or repair the one printed English sentence best matching the current sentence and target hint.',
      'The image is the primary evidence; OCR text is secondary.',
    ].join(' '),
  }];
  for (const item of items) {
    content.push({
      type: 'text',
      text: JSON.stringify({
        id: item.id,
        source: item.source,
        targetWord: item.targetWord,
        currentSentence: item.currentSentence,
        ocrEvidence: item.evidence,
      }),
    });
    content.push({
      type: 'image_url',
      image_url: { url: await getImageDataUrl(item) },
    });
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 5000,
      reasoning_effort: 'none',
      messages: [
        {
          role: 'system',
          content: [
            'You visually inspect children-book pages and repair OCR-corrupted English sentences.',
            'The page image is authoritative. Use OCR text only as a secondary hint.',
            'Never invent plot details or replace the sentence with a newly written example.',
            'Fix obvious OCR substitutions, garbage tokens, broken spacing, punctuation, capitalization, and truncated sentence boundaries.',
            'Prefer one complete sentence containing the target word or its inflection.',
            'The target word is a matching hint and may be represented only by the picture or book title; do not mark a clean sentence uncertain only because the target word is absent.',
            'If the page has multiple printed sentences, choose the complete sentence closest to the current sentence and target hint.',
            'Use remove when the pictured page has no printed English sentence that could support the current sentence.',
            'Do not transcribe page numbers, labels, book titles, or text embedded on objects as the sentence.',
            'Use status fix only when the intended printed sentence is recoverable with high confidence.',
            'Use keep when the current sentence is already correct, including valid dialogue fragments.',
            'Use uncertain when the evidence is too damaged or contradictory.',
            'Return every input id exactly once.',
          ].join(' '),
        },
        {
          role: 'user',
          content,
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'related_media_sentence_repairs',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              repairs: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    status: { type: 'string', enum: ['keep', 'fix', 'remove', 'uncertain'] },
                    sentence: { type: 'string' },
                    confidence: { type: 'number' },
                    reason: { type: 'string' },
                  },
                  required: ['id', 'status', 'sentence', 'confidence', 'reason'],
                  additionalProperties: false,
                },
              },
            },
            required: ['repairs'],
            additionalProperties: false,
          },
        },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`LM Studio returned ${response.status}: ${await response.text()}`);
  }
  const body = await response.json();
  const responseContent = body.choices?.[0]?.message?.content;
  if (!responseContent) {
    throw new Error(`LM Studio returned no content: ${JSON.stringify(body).slice(0, 600)}`);
  }
  return validateBatch(items, JSON.parse(responseContent).repairs);
}

async function repairBatch(items) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await requestBatch(items);
    } catch (error) {
      lastError = error;
      console.warn(`Sentence repair retry ${attempt}/3: ${error.message}`);
    }
  }
  throw lastError;
}

function escapeTsv(value) {
  return String(value ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
}

async function writeReport(items, repairsById) {
  const repairs = items.map((item) => repairsById.get(item.id)).filter(Boolean);
  const summary = {
    generatedAt: new Date().toISOString(),
    model,
    suspiciousSentences: items.length,
    reviewed: repairs.length,
    acceptedChanges: repairs.filter((repair) => repair.accepted).length,
    acceptedFixes: repairs.filter((repair) => (
      repair.accepted && repair.status === 'fix'
    )).length,
    kept: repairs.filter((repair) => repair.status === 'keep').length,
    removed: repairs.filter((repair) => repair.accepted && repair.status === 'remove').length,
    unresolved: repairs.filter((repair) => (
      repair.status === 'uncertain' || (repair.status === 'fix' && !repair.accepted)
    )).length,
    bySource: Object.fromEntries(['oxford', 'redRocket'].map((source) => {
      const sourceRepairs = repairs.filter((repair) => repair.source === source);
      return [source, {
        reviewed: sourceRepairs.length,
        acceptedChanges: sourceRepairs.filter((repair) => repair.accepted).length,
        acceptedFixes: sourceRepairs.filter((repair) => (
          repair.accepted && repair.status === 'fix'
        )).length,
        removed: sourceRepairs.filter((repair) => (
          repair.accepted && repair.status === 'remove'
        )).length,
        unresolved: sourceRepairs.filter((repair) => (
          repair.status === 'uncertain' || (repair.status === 'fix' && !repair.accepted)
        )).length,
      }];
    })),
  };
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(
    path.join(reportDir, 'report.json'),
    `${JSON.stringify({ summary, repairs }, null, 2)}\n`,
  );
  const columns = [
    'source', 'wordId', 'targetWord', 'pageLabel', 'status', 'accepted',
    'confidence', 'supportScore', 'before', 'after', 'reason',
  ];
  const rows = repairs.map((repair) => columns.map((column) => escapeTsv(repair[column])).join('\t'));
  await fs.writeFile(
    path.join(reportDir, 'report.tsv'),
    `${columns.join('\t')}\n${rows.join('\n')}\n`,
  );
  return summary;
}

async function main() {
  const [vocabulary, media, oxfordImages, oxfordOcrText, redRocketBooks] = await Promise.all([
    fs.readFile(vocabularyPath, 'utf8').then(JSON.parse),
    fs.readFile(mediaPath, 'utf8').then(JSON.parse),
    fs.readFile(oxfordImagesPath, 'utf8').then(JSON.parse),
    fs.readFile(oxfordOcrPath, 'utf8'),
    loadRedRocketBooks(),
  ]);
  const wordsById = new Map(vocabulary.words.map((word) => [word.id, word]));
  const oxfordAuditByPath = new Map(oxfordImages.map((row) => [row.imagePath, row]));
  const oxfordOcrByPath = readJsonLines(oxfordOcrText, 'imagePath');
  const items = [];

  for (const entry of media.entries) {
    const word = wordsById.get(entry.wordId);
    if (!word) continue;

    const oxford = entry.relatedMedia?.oxford;
    if (oxford?.sentence && isSuspiciousSentence(oxford.sentence)) {
      const audit = oxfordAuditByPath.get(oxford.imagePath);
      const rawOcr = oxfordOcrByPath.get(oxford.imagePath)?.ocrText ?? '';
      const indexedText = await loadOxfordIndexedContext(audit);
      items.push({
        id: `oxford:${entry.wordId}`,
        source: 'oxford',
        wordId: entry.wordId,
        targetWord: word.english,
        pageLabel: oxford.label,
        currentSentence: normalizeSentence(oxford.sentence),
        imagePath: oxford.imagePath,
        evidence: [
          getContextWindow(rawOcr, word.english),
          getContextWindow(indexedText, word.english),
        ].filter(Boolean),
      });
    }

    const redRocket = entry.relatedMedia?.redRocket;
    if (redRocket?.sentence && isSuspiciousSentence(redRocket.sentence)) {
      const book = redRocketBooks.get(
        `${normalizeKey(redRocket.level)}|${normalizeKey(redRocket.title)}`,
      );
      const page = book?.pages?.find((candidate) => (
        Number(candidate.page_number) === Number(redRocket.page)
      ));
      const pageText = page?.text || page?.raw_text || '';
      items.push({
        id: `redRocket:${entry.wordId}`,
        source: 'redRocket',
        wordId: entry.wordId,
        targetWord: word.english,
        pageLabel: redRocket.label,
        currentSentence: normalizeSentence(redRocket.sentence),
        imagePath: redRocket.atlasPath,
        crop: {
          left: redRocket.column * 512,
          top: redRocket.row * 512,
          width: 512,
          height: 512,
        },
        evidence: [getContextWindow(pageText, word.english)].filter(Boolean),
      });
    }
  }

  const scopedItems = limit ? items.slice(0, limit) : items;
  const repairsById = await loadCheckpoint();
  const pending = scopedItems.filter((item) => !repairsById.has(item.id));
  console.log(
    `Sentence repair: ${scopedItems.length} suspicious, ${repairsById.size} cached, ${pending.length} pending`,
  );

  for (let offset = 0; offset < pending.length; offset += batchSize) {
    const batch = pending.slice(offset, offset + batchSize);
    const repairs = await repairBatch(batch);
    for (const repair of repairs) repairsById.set(repair.id, repair);
    await saveCheckpoint(repairsById);
    const completed = Math.min(offset + batch.length, pending.length);
    console.log(`Sentence repair progress: ${completed}/${pending.length}`);
  }

  const summary = await writeReport(scopedItems, repairsById);
  console.log(JSON.stringify(summary, null, 2));

  if (shouldApply) {
    const entryByWordId = new Map(media.entries.map((entry) => [entry.wordId, entry]));
    for (const item of scopedItems) {
      const repair = repairsById.get(item.id);
      if (!repair?.accepted) continue;
      const relatedMedia = entryByWordId.get(item.wordId)?.relatedMedia;
      if (item.source === 'oxford' && relatedMedia?.oxford) {
        if (repair.status === 'remove') {
          delete relatedMedia.oxford.sentence;
          delete relatedMedia.oxford.sentenceTranslation;
        }
        else {
          if (relatedMedia.oxford.sentence !== repair.after) {
            delete relatedMedia.oxford.sentenceTranslation;
          }
          relatedMedia.oxford.sentence = repair.after;
        }
      }
      if (item.source === 'redRocket' && relatedMedia?.redRocket) {
        if (repair.status === 'remove') {
          delete relatedMedia.redRocket.sentence;
          delete relatedMedia.redRocket.sentenceTranslation;
        }
        else {
          if (relatedMedia.redRocket.sentence !== repair.after) {
            delete relatedMedia.redRocket.sentenceTranslation;
          }
          relatedMedia.redRocket.sentence = repair.after;
        }
      }
    }
    await fs.writeFile(mediaPath, `${JSON.stringify(media, null, 2)}\n`);
    console.log(`Applied ${summary.acceptedChanges} sentence repairs to ${mediaPath}`);
  }
}

await main();
