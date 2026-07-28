import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const run = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(projectRoot, 'public');
const vocabularyPath = path.join(publicRoot, 'content/words/ket_vocabulary.json');
const mediaPath = path.join(publicRoot, 'content/words/word_related_media.json');
const oxfordImagesPath = path.join(
  projectRoot,
  'design-output/oxford-ocr-audit/after-fix/images.json',
);
const redRocketExtractedRoot = path.resolve(projectRoot, '../red-rocket/extracted');
const cacheRoot = path.join(projectRoot, 'tmp/related-media-visual-audit');
const pageCacheRoot = path.join(cacheRoot, 'pages');
const contactSheetRoot = path.join(cacheRoot, 'contact-sheets');
const checkpointPath = path.join(cacheRoot, 'checkpoint.json');
const reportDir = path.join(projectRoot, 'design-output/related-media-visual-audit');
const manualOverridesPath = path.join(
  projectRoot,
  'scripts/related-media-visual-audit-overrides.json',
);
const endpoint = process.env.LM_STUDIO_URL ?? 'http://127.0.0.1:1234/v1/chat/completions';
const model = process.env.LM_STUDIO_MODEL ?? 'qwen/qwen3-vl-30b';
const maxTargetsPerRequest = Number(process.env.VISUAL_AUDIT_MAX_TARGETS ?? 4);
const shouldApply = process.argv.includes('--apply');
const refreshStatsOnly = process.argv.includes('--refresh-stats-only');
const forceRestart = process.argv.includes('--restart');
const limitArgument = process.argv.find((argument) => argument.startsWith('--limit-groups='));
const limitGroups = limitArgument ? Number(limitArgument.split('=')[1]) : null;
const groupKeyArgument = process.argv.find((argument) => argument.startsWith('--group-key='));
const requestedGroupKey = groupKeyArgument ? groupKeyArgument.slice('--group-key='.length) : null;
const recheckArgument = process.argv.find((argument) => argument.startsWith('--recheck-targets='));
const recheckTargetsPath = recheckArgument
  ? path.resolve(projectRoot, recheckArgument.slice('--recheck-targets='.length))
  : null;

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

function normalizeWords(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .trim();
}

function getTargetForms(value) {
  return String(value ?? '')
    .split('/')
    .flatMap((part) => {
      const withoutOptional = part.replace(/\(([^)]*)\)/g, '');
      const withOptional = part.replace(/\(([^)]*)\)/g, '$1');
      return [withoutOptional, withOptional];
    })
    .map((part) => normalizeWords(part))
    .filter(Boolean);
}

function getStemForms(value) {
  const word = value.replace(/^'+|'+$/g, '');
  const forms = new Set([word]);
  for (const part of word.split("'").filter((item) => item.length > 1)) forms.add(part);
  if (word.endsWith("'s")) forms.add(word.slice(0, -2));
  for (const suffix of ["'re", "'ve", "'ll", "'d", "'m"]) {
    if (word.endsWith(suffix)) forms.add(word.slice(0, -suffix.length));
  }
  if (word.endsWith("n't")) {
    forms.add(word.slice(0, -3));
    forms.add('not');
  }
  if (word.endsWith('ies') && word.length > 3) forms.add(`${word.slice(0, -3)}y`);
  if (word.endsWith('ied') && word.length > 3) forms.add(`${word.slice(0, -3)}y`);
  if (word.endsWith('ing') && word.length > 4) {
    const base = word.slice(0, -3);
    forms.add(base);
    forms.add(`${base}e`);
    if (base.at(-1) === base.at(-2)) forms.add(base.slice(0, -1));
  }
  if (word.endsWith('ed') && word.length > 3) {
    const base = word.slice(0, -2);
    forms.add(base);
    forms.add(`${base}e`);
    if (base.at(-1) === base.at(-2)) forms.add(base.slice(0, -1));
  }
  if (word.endsWith('es') && word.length > 3) {
    forms.add(word.slice(0, -2));
    forms.add(word.slice(0, -1));
  } else if (word.endsWith('s') && word.length > 2) {
    forms.add(word.slice(0, -1));
  }
  return forms;
}

function sentenceContainsTarget(sentence, targetWord) {
  const normalizedSentence = normalizeWords(sentence);
  const sentenceTokens = normalizedSentence.split(' ').filter(Boolean);
  const sentenceStems = new Set(sentenceTokens.flatMap((token) => [...getStemForms(token)]));
  const irregularForms = {
    be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
    can: ["can", "can't", 'cannot', 'could', "couldn't"],
    do: ['do', 'does', 'did', 'done', 'doing'],
    go: ['go', 'goes', 'went', 'gone', 'going'],
    have: ['have', 'has', 'had', 'having'],
  };

  return getTargetForms(targetWord).some((targetForm) => {
    if (` ${normalizedSentence} `.includes(` ${targetForm} `)) return true;
    const targetTokens = targetForm.split(' ');
    if (targetTokens.length > 1) {
      if (normalizedSentence.includes(targetForm)) return true;
      return targetTokens.every((token) => sentenceStems.has(token));
    }
    const target = targetTokens[0];
    if ([...getStemForms(target)].some((form) => sentenceStems.has(form))) return true;
    return (irregularForms[target] ?? []).some((form) => sentenceTokens.includes(form));
  });
}

function pickTargetSentence(value, targetWord) {
  const sentence = normalizeSentence(value)
    .replace(/\s*[\]}]+(?:\s*\.)?$/g, '')
    .trim();
  if (!sentence) return '';
  const segments = [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(sentence)]
    .map(({ segment }) => normalizeSentence(segment))
    .filter(Boolean);
  return segments.find((segment) => sentenceContainsTarget(segment, targetWord)) ?? sentence;
}

function hashKey(value) {
  return crypto.createHash('sha1').update(value).digest('hex');
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
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

async function loadRedRocketBooks() {
  const booksByKey = new Map();
  for (const filePath of await listJsonFiles(redRocketExtractedRoot)) {
    const book = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const level = book.stage_name || book.source_folder || path.basename(path.dirname(filePath));
    const title = book.title || path.basename(filePath, '.json');
    const sourceFile = path.basename(filePath, '.json');
    booksByKey.set(`${normalizeKey(level)}|${normalizeKey(title)}`, {
      ...book,
      pdfPath: path.resolve(redRocketExtractedRoot, '..', level, `${sourceFile}.pdf`),
    });
  }
  return booksByKey;
}

function oxfordPdfPathFromAudit(audit) {
  if (!audit?.indexedSource) return null;
  return audit.indexedSource
    .replace(`${path.sep}extracted${path.sep}`, path.sep)
    .replace(/\.json$/i, '.pdf');
}

async function getPdfPageCount(pdfPath) {
  const { stdout } = await run('pdfinfo', [pdfPath], { maxBuffer: 1024 * 1024 });
  const match = stdout.match(/^Pages:\s+(\d+)/m);
  if (!match) throw new Error(`Could not read page count for ${pdfPath}`);
  return Number(match[1]);
}

async function renderPdfPage(pdfPath, pageNumber) {
  await fs.mkdir(pageCacheRoot, { recursive: true });
  const outputPath = path.join(pageCacheRoot, `${hashKey(`${pdfPath}#${pageNumber}`)}.jpg`);
  if (await fileExists(outputPath)) return outputPath;
  const prefix = outputPath.replace(/\.jpg$/, '');
  await run('pdftoppm', [
    '-f', String(pageNumber),
    '-l', String(pageNumber),
    '-jpeg',
    '-singlefile',
    '-r', '145',
    '-jpegopt', 'quality=92',
    pdfPath,
    prefix,
  ], { maxBuffer: 8 * 1024 * 1024 });
  return outputPath;
}

function labelSvg(label, isCurrent) {
  const fill = isCurrent ? '#ff9b22' : '#35536f';
  return Buffer.from(`
    <svg width="600" height="46" xmlns="http://www.w3.org/2000/svg">
      <rect width="600" height="46" rx="8" fill="${fill}"/>
      <text x="300" y="31" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#fff">${label}</text>
    </svg>
  `);
}

async function createPagePanel(imagePath, label, isCurrent) {
  const pageImage = await sharp(imagePath)
    .rotate()
    .resize(580, 714, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255 },
    })
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer();
  return sharp({
    create: {
      width: 600,
      height: 780,
      channels: 3,
      background: { r: 250, g: 248, b: 242 },
    },
  })
    .composite([
      { input: labelSvg(label, isCurrent), left: 0, top: 0 },
      { input: pageImage, left: 10, top: 56 },
    ])
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer();
}

async function buildContactSheet(group) {
  await fs.mkdir(contactSheetRoot, { recursive: true });
  const outputPath = path.join(
    contactSheetRoot,
    `${hashKey(`${group.source}|${group.pdfPath}|${group.currentPage}`)}.jpg`,
  );
  if (await fileExists(outputPath)) return outputPath;

  const pageCount = await getPdfPageCount(group.pdfPath);
  const panels = [];
  for (const offset of [-2, -1, 0, 1, 2]) {
    const pageNumber = group.currentPage + offset;
    if (pageNumber < 1 || pageNumber > pageCount) continue;
    const imagePath = await renderPdfPage(group.pdfPath, pageNumber);
    const offsetLabel = offset === 0 ? 'CURRENT' : offset > 0 ? `+${offset}` : String(offset);
    panels.push({
      offset,
      input: await createPagePanel(
        imagePath,
        `${offsetLabel}  |  PDF page ${pageNumber}`,
        offset === 0,
      ),
    });
  }

  await sharp({
    create: {
      width: 1200,
      height: 2340,
      channels: 3,
      background: { r: 244, g: 241, b: 233 },
    },
  })
    .composite(panels.map((panel, index) => ({
      input: panel.input,
      left: (index % 2) * 600,
      top: Math.floor(index / 2) * 780,
    })))
    .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
    .toFile(outputPath);
  return outputPath;
}

async function buildPageEvidence(group) {
  const pageCount = await getPdfPageCount(group.pdfPath);
  const pages = [];
  for (const offset of [-2, -1, 0, 1, 2]) {
    const pageNumber = group.currentPage + offset;
    if (pageNumber < 1 || pageNumber > pageCount) continue;
    pages.push({
      offset,
      pageNumber,
      imagePath: await renderPdfPage(group.pdfPath, pageNumber),
    });
  }
  return pages;
}

async function buildNeighborContactSheet(group) {
  await fs.mkdir(contactSheetRoot, { recursive: true });
  const outputPath = path.join(
    contactSheetRoot,
    `${hashKey(`neighbors-v2|${group.source}|${group.pdfPath}|${group.currentPage}`)}.jpg`,
  );
  if (await fileExists(outputPath)) return outputPath;

  const pageCount = await getPdfPageCount(group.pdfPath);
  const panels = [];
  for (const offset of [-1, 1, -2, 2]) {
    const pageNumber = group.currentPage + offset;
    if (pageNumber < 1 || pageNumber > pageCount) continue;
    const imagePath = await renderPdfPage(group.pdfPath, pageNumber);
    panels.push({
      input: await createPagePanel(
        imagePath,
        `${offset > 0 ? '+' : ''}${offset}  |  PDF page ${pageNumber}`,
        false,
      ),
    });
  }

  await sharp({
    create: {
      width: 1200,
      height: 1560,
      channels: 3,
      background: { r: 244, g: 241, b: 233 },
    },
  })
    .composite(panels.map((panel, index) => ({
      input: panel.input,
      left: (index % 2) * 600,
      top: Math.floor(index / 2) * 780,
    })))
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toFile(outputPath);
  return outputPath;
}

async function getImageDataUrl(imagePath) {
  const bytes = await fs.readFile(imagePath);
  return `data:image/jpeg;base64,${bytes.toString('base64')}`;
}

async function loadCheckpoint() {
  if (forceRestart) return new Map();
  try {
    const payload = JSON.parse(await fs.readFile(checkpointPath, 'utf8'));
    if (payload.model !== model) return new Map();
    return new Map(payload.groups.map((group) => [group.groupKey, group]));
  } catch (error) {
    if (error.code === 'ENOENT') return new Map();
    throw error;
  }
}

async function saveCheckpoint(resultsByGroup) {
  await fs.mkdir(cacheRoot, { recursive: true });
  await fs.writeFile(checkpointPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    model,
    groups: [...resultsByGroup.values()],
  }, null, 2)}\n`);
}

function validatePageResults(group, targets, rawResults, selectedOffset) {
  const expectedTargets = new Map(targets.map((target) => [target.id, target]));
  const remainingIds = new Set(expectedTargets.keys());
  if (!Array.isArray(rawResults) || rawResults.length !== expectedTargets.size) {
    throw new Error(`Expected ${expectedTargets.size} results, received ${rawResults?.length ?? 0}`);
  }
  const results = [];

  for (const rawResult of rawResults) {
    if (!remainingIds.delete(rawResult.id)) {
      throw new Error(`Unexpected or duplicate result id: ${rawResult.id}`);
    }
    const target = expectedTargets.get(rawResult.id);
    const status = ['match', 'no_match', 'uncertain'].includes(rawResult.status)
      ? rawResult.status
      : 'uncertain';
    const sentence = pickTargetSentence(rawResult.sentence, target.targetWord);
    const confidence = Math.max(0, Math.min(1, Number(rawResult.confidence) || 0));
    if (status === 'match' && !sentenceContainsTarget(sentence, target.targetWord)) {
      throw new Error(
        `Returned match sentence does not contain target ${target.targetWord}: ${sentence}`,
      );
    }
    const accepted = (
      status === 'match'
      && sentence.length >= 3
      && /[A-Za-z]/.test(sentence)
    ) || status === 'no_match';

    results.push({
      id: target.id,
      wordId: target.wordId,
      targetWord: target.targetWord,
      currentSentence: target.currentSentence,
      status,
      selectedOffset: status === 'match' ? selectedOffset : null,
      selectedPage: status === 'match' ? group.currentPage + selectedOffset : null,
      sentence: status === 'match' ? sentence : '',
      matchedForm: normalizeSentence(rawResult.matchedForm),
      confidence,
      accepted,
      reason: String(rawResult.reason ?? '').trim(),
    });
  }
  return results;
}

async function applyManualOverrides(resultsByGroup) {
  if (!(await fileExists(manualOverridesPath))) return 0;
  const overrides = JSON.parse(await fs.readFile(manualOverridesPath, 'utf8'));
  let applied = 0;
  for (const override of overrides) {
    const group = resultsByGroup.get(override.groupKey);
    const resultIndex = group?.results.findIndex((result) => result.id === override.id) ?? -1;
    if (resultIndex < 0) {
      throw new Error(`Manual override target not found: ${override.groupKey} / ${override.id}`);
    }
    const current = group.results[resultIndex];
    const selectedOffset = override.status === 'match' ? Number(override.selectedOffset ?? 0) : null;
    const sentence = override.status === 'match'
      ? pickTargetSentence(override.sentence, current.targetWord)
      : '';
    if (override.status === 'match' && !sentenceContainsTarget(sentence, current.targetWord)) {
      throw new Error(
        `Manual override sentence does not contain ${current.targetWord}: ${sentence}`,
      );
    }
    group.results[resultIndex] = {
      ...current,
      status: override.status,
      selectedOffset,
      selectedPage: selectedOffset === null ? null : group.currentPage + selectedOffset,
      sentence,
      matchedForm: normalizeSentence(override.matchedForm),
      confidence: 1,
      accepted: true,
      reason: override.reason,
    };
    applied += 1;
  }
  return applied;
}

function normalizeCheckpointSentences(resultsByGroup) {
  for (const group of resultsByGroup.values()) {
    for (const result of group.results) {
      if (result.status !== 'match' || !result.accepted) continue;
      result.sentence = pickTargetSentence(result.sentence, result.targetWord);
      if (!sentenceContainsTarget(result.sentence, result.targetWord)) {
        throw new Error(
          `Checkpoint sentence does not contain ${result.targetWord}: ${result.sentence}`,
        );
      }
    }
  }
}

async function requestVisual(group, targets, imagePath, scopeInstruction, selectedOffset) {
  const content = [
    {
      type: 'text',
      text: JSON.stringify({
        groupKey: group.groupKey,
        source: group.source,
        scopeInstruction,
        targets: targets.map((target) => ({
          id: target.id,
          targetWord: target.targetWord,
        })),
      }),
    },
    {
      type: 'image_url',
      image_url: { url: await getImageDataUrl(imagePath) },
    },
  ];

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
            'You are a meticulous visual proofreader for English children books.',
            'Follow the supplied scopeInstruction and inspect every pictured page in the one supplied image.',
            'Find a complete printed English sentence that visibly contains the target word, a normal inflection, or the supplied multi-word phrase.',
            'Ignore page numbers, headers, book titles, isolated vocabulary labels, and words printed on illustrated objects.',
            'The returned sentence itself must contain the target form; a target visible only on a sign, menu, label, or illustrated object is not a match.',
            'Return only the one sentence containing the target, not neighboring sentences or OCR-like debris.',
            'Before returning match, verify that the exact target or a normal grammatical inflection is literally present inside the sentence string.',
            'If your proposed sentence does not contain that target form, status must be no_match.',
            'Transcribe that sentence exactly, correcting only obvious typography such as curly quotes and spacing.',
            'Use status match only when both the target form and complete sentence are visibly readable.',
            'Use no_match when this page has no such visible sentence.',
            'Use uncertain when text exists but is too blurry or ambiguous to read reliably.',
            'confidence means confidence in your status decision: a clearly confirmed absence should use high confidence such as 0.98, not zero.',
            'Do not infer or invent missing words from the picture.',
          ].join(' '),
        },
        { role: 'user', content },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'visual_related_sentence_audit',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              results: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: {
                      type: 'string',
                      enum: targets.map((target) => target.id),
                    },
                    status: { type: 'string', enum: ['match', 'no_match', 'uncertain'] },
                    sentence: { type: 'string' },
                    matchedForm: { type: 'string' },
                    confidence: { type: 'number' },
                    reason: { type: 'string' },
                  },
                  required: [
                    'id', 'status', 'sentence', 'matchedForm', 'confidence', 'reason',
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ['results'],
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
  return validatePageResults(
    group,
    targets,
    JSON.parse(responseContent).results,
    selectedOffset,
  );
}

async function requestPage(group, targets, selectedOffset) {
  const pageNumber = group.currentPage + selectedOffset;
  const imagePath = await renderPdfPage(group.pdfPath, pageNumber);
  return requestVisual(
    group,
    targets,
    imagePath,
    `Inspect only this single PDF page ${pageNumber}.`,
    selectedOffset,
  );
}

async function requestNeighborOverview(group, targets) {
  return requestVisual(
    group,
    targets,
    await buildNeighborContactSheet(group),
    'Inspect all pictured neighbor pages. Return match if any one contains a valid visible sentence. Page location is not required.',
    null,
  );
}

function chunkTargets(targets) {
  const chunks = [];
  for (let index = 0; index < targets.length; index += maxTargetsPerRequest) {
    chunks.push(targets.slice(index, index + maxTargetsPerRequest));
  }
  return chunks;
}

function buildConfirmedNoMatchResults(targets, reason) {
  return targets.map((target) => ({
    id: target.id,
    wordId: target.wordId,
    targetWord: target.targetWord,
    currentSentence: target.currentSentence,
    status: 'no_match',
    selectedOffset: null,
    selectedPage: null,
    sentence: '',
    matchedForm: '',
    confidence: 0.98,
    accepted: true,
    reason,
  }));
}

async function auditPageChunk(group, targets, selectedOffset) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await requestPage(group, targets, selectedOffset);
    } catch (error) {
      lastError = error;
      console.warn(`Visual audit retry ${attempt}/3: ${error.message}`);
    }
  }
  if (lastError.message.startsWith('Returned match sentence does not contain target')) {
    return buildConfirmedNoMatchResults(
      targets,
      `Three visual attempts returned no sentence containing the target: ${lastError.message}`,
    );
  }
  console.warn(
    `Leaving ${group.groupKey} page offset ${selectedOffset} unresolved after three failures: `
    + lastError.message,
  );
  return targets.map((target) => ({
      id: target.id,
      wordId: target.wordId,
      targetWord: target.targetWord,
      currentSentence: target.currentSentence,
      status: 'uncertain',
      selectedOffset: null,
      selectedPage: null,
      sentence: '',
      matchedForm: '',
      confidence: 0,
      accepted: false,
      reason: `Model request failed after three attempts: ${lastError.message}`,
    }));
}

async function auditPage(group, targets, selectedOffset) {
  const results = [];
  for (const chunk of chunkTargets(targets)) {
    results.push(...await auditPageChunk(group, chunk, selectedOffset));
  }
  return results;
}

async function auditNeighborOverviewChunk(group, targets) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await requestNeighborOverview(group, targets);
    } catch (error) {
      lastError = error;
      console.warn(`Neighbor overview retry ${attempt}/3: ${error.message}`);
    }
  }
  if (lastError.message.startsWith('Returned match sentence does not contain target')) {
    return buildConfirmedNoMatchResults(
      targets,
      `Three neighbor checks returned no sentence containing the target: ${lastError.message}`,
    );
  }
  return targets.map((target) => ({
    id: target.id,
    wordId: target.wordId,
    targetWord: target.targetWord,
    currentSentence: target.currentSentence,
    status: 'uncertain',
    selectedOffset: null,
    selectedPage: null,
    sentence: '',
    matchedForm: '',
    confidence: 0,
    accepted: false,
    reason: `Neighbor overview failed after three attempts: ${lastError.message}`,
  }));
}

async function auditNeighborOverview(group, targets) {
  const results = [];
  for (const chunk of chunkTargets(targets)) {
    results.push(...await auditNeighborOverviewChunk(group, chunk));
  }
  return results;
}

async function auditGroup(group) {
  const pageCount = await getPdfPageCount(group.pdfPath);
  const matches = new Map();
  const pending = new Map(group.targets.map((target) => [target.id, target]));
  const uncertainReasons = new Map();
  const noMatchReasons = new Map();
  const neighborOffsets = [-1, 1, -2, 2].filter((offset) => {
    const pageNumber = group.currentPage + offset;
    return pageNumber >= 1 && pageNumber <= pageCount;
  });

  const currentResults = await auditPage(group, [...pending.values()], 0);
  for (const result of currentResults) {
    if (result.status === 'match' && result.accepted) {
      matches.set(result.id, result);
      pending.delete(result.id);
    } else if (result.status === 'uncertain' || !result.accepted) {
      uncertainReasons.set(result.id, [`offset 0: ${result.reason}`]);
    } else {
      noMatchReasons.set(result.id, [`offset 0: ${result.reason}`]);
    }
  }

  if (pending.size > 0 && neighborOffsets.length > 0) {
    const overviewResults = await auditNeighborOverview(group, [...pending.values()]);
    const verifyIndividually = new Map();
    for (const result of overviewResults) {
      if (result.status === 'no_match' && result.accepted) {
        if (uncertainReasons.has(result.id)) {
          const target = pending.get(result.id);
          matches.set(result.id, {
            ...result,
            status: 'uncertain',
            accepted: false,
            confidence: 0,
            reason: uncertainReasons.get(result.id).join(' | '),
            currentSentence: target.currentSentence,
          });
        } else {
          const target = pending.get(result.id);
          matches.set(result.id, {
            ...result,
            currentSentence: target.currentSentence,
            reason: `No visible matching sentence on current page or offsets ${neighborOffsets.join(', ')}.`,
          });
        }
        pending.delete(result.id);
      } else {
        verifyIndividually.set(result.id, pending.get(result.id));
        if (result.status === 'uncertain' || !result.accepted) {
          const reasons = uncertainReasons.get(result.id) ?? [];
          reasons.push(`neighbor overview: ${result.reason}`);
          uncertainReasons.set(result.id, reasons);
        }
      }
    }

    for (const offset of neighborOffsets) {
      if (verifyIndividually.size === 0) break;
      const pageResults = await auditPage(group, [...verifyIndividually.values()], offset);
      for (const result of pageResults) {
        if (result.status === 'match' && result.accepted) {
          matches.set(result.id, result);
          pending.delete(result.id);
          verifyIndividually.delete(result.id);
        } else if (result.status === 'uncertain' || !result.accepted) {
          const reasons = uncertainReasons.get(result.id) ?? [];
          reasons.push(`offset ${offset}: ${result.reason}`);
          uncertainReasons.set(result.id, reasons);
        } else {
          const reasons = noMatchReasons.get(result.id) ?? [];
          reasons.push(`offset ${offset}: ${result.reason}`);
          noMatchReasons.set(result.id, reasons);
        }
      }
    }
  }

  for (const target of pending.values()) {
    const unresolvedReasons = uncertainReasons.get(target.id) ?? [];
    const confirmedNoMatch = unresolvedReasons.length === 0;
    matches.set(target.id, {
      id: target.id,
      wordId: target.wordId,
      targetWord: target.targetWord,
      currentSentence: target.currentSentence,
      status: confirmedNoMatch ? 'no_match' : 'uncertain',
      selectedOffset: null,
      selectedPage: null,
      sentence: '',
      matchedForm: '',
      confidence: confirmedNoMatch ? 0.98 : 0,
      accepted: confirmedNoMatch,
      reason: confirmedNoMatch
        ? `No visible matching sentence on current page or offsets ${neighborOffsets.join(', ')}.`
        : unresolvedReasons.join(' | '),
      pageReasons: noMatchReasons.get(target.id) ?? [],
    });
  }

  return {
    groupKey: group.groupKey,
    source: group.source,
    pdfPath: group.pdfPath,
    currentPage: group.currentPage,
    pageLabel: group.pageLabel,
    results: group.targets.map((target) => matches.get(target.id)),
  };
}

function escapeTsv(value) {
  return String(value ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
}

async function writeReport(groups, resultsByGroup) {
  const results = groups.flatMap((group) => resultsByGroup.get(group.groupKey)?.results ?? []);
  const summary = {
    generatedAt: new Date().toISOString(),
    model,
    groups: groups.length,
    associations: groups.reduce((sum, group) => sum + group.targets.length, 0),
    reviewed: results.length,
    acceptedMatches: results.filter((result) => result.accepted && result.status === 'match').length,
    pageDrifts: results.filter((result) => (
      result.accepted && result.status === 'match' && result.selectedOffset !== 0
    )).length,
    confirmedNoMatch: results.filter((result) => (
      result.accepted && result.status === 'no_match'
    )).length,
    unresolved: results.filter((result) => !result.accepted).length,
  };
  await fs.mkdir(reportDir, { recursive: true });
  await fs.writeFile(
    path.join(reportDir, 'report.json'),
    `${JSON.stringify({ summary, groups: [...resultsByGroup.values()] }, null, 2)}\n`,
  );
  const columns = [
    'source', 'wordId', 'targetWord', 'pageLabel', 'currentPage', 'status',
    'selectedOffset', 'selectedPage', 'confidence', 'accepted', 'currentSentence',
    'sentence', 'matchedForm', 'reason',
  ];
  const rows = groups.flatMap((group) => (
    (resultsByGroup.get(group.groupKey)?.results ?? []).map((result) => {
      const row = {
        ...result,
        source: group.source,
        pageLabel: group.pageLabel,
        currentPage: group.currentPage,
      };
      return columns.map((column) => escapeTsv(row[column])).join('\t');
    })
  ));
  await fs.writeFile(
    path.join(reportDir, 'report.tsv'),
    `${columns.join('\t')}\n${rows.join('\n')}\n`,
  );
  return summary;
}

async function renderCorrectedPage(group, result) {
  const sourceImagePath = await renderPdfPage(group.pdfPath, result.selectedPage);
  if (group.source === 'oxford') {
    const relativePath = `/content/images/oxford-tree/level-${group.level}/book-${group.book}/page-${result.selectedPage}.webp`;
    const outputPath = path.join(publicRoot, relativePath.replace(/^\//, ''));
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    if (!(await fileExists(outputPath))) {
      await sharp(sourceImagePath).rotate().webp({ quality: 88 }).toFile(outputPath);
    }
    return relativePath;
  }

  const relativePath = `/content/images/red-rocket-pages/${hashKey(`${group.pdfPath}#${result.selectedPage}`)}.webp`;
  const outputPath = path.join(publicRoot, relativePath.replace(/^\//, ''));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  if (!(await fileExists(outputPath))) {
    await sharp(sourceImagePath)
      .rotate()
      .resize(900, 1100, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255 },
      })
      .webp({ quality: 88 })
      .toFile(outputPath);
  }
  return relativePath;
}

function refreshManifestStats(media, totalWords) {
  const oxfordEntries = media.entries.filter((entry) => entry.relatedMedia?.oxford);
  const redRocketEntries = media.entries.filter((entry) => entry.relatedMedia?.redRocket);
  const lifePhotoEntries = media.entries.filter((entry) => entry.relatedMedia?.lifePhoto);
  const uniqueRedRocketImages = new Set(redRocketEntries.map((entry) => {
    const redRocket = entry.relatedMedia.redRocket;
    return redRocket.imagePath
      ?? `${redRocket.atlasPath}#${redRocket.row},${redRocket.column}`;
  }));
  media.stats = {
    ...media.stats,
    totalWords,
    entries: media.entries.length,
    withOxford: oxfordEntries.length,
    withLifePhoto: lifePhotoEntries.length,
    uniqueOxfordImages: new Set(
      oxfordEntries.map((entry) => entry.relatedMedia.oxford.imagePath),
    ).size,
    withOxfordSentence: oxfordEntries.filter((entry) => (
      entry.relatedMedia.oxford.sentence
    )).length,
    withOxfordSentenceTranslation: oxfordEntries.filter((entry) => (
      entry.relatedMedia.oxford.sentenceTranslation
    )).length,
    withRedRocket: redRocketEntries.length,
    uniqueRedRocketImages: uniqueRedRocketImages.size,
    redRocketAtlases: new Set(
      redRocketEntries.map((entry) => entry.relatedMedia.redRocket.atlasPath),
    ).size,
    withRedRocketSentence: redRocketEntries.filter((entry) => (
      entry.relatedMedia.redRocket.sentence
    )).length,
    withRedRocketSentenceTranslation: redRocketEntries.filter((entry) => (
      entry.relatedMedia.redRocket.sentenceTranslation
    )).length,
  };
  return media.stats;
}

async function applyResults(media, groups, resultsByGroup) {
  const entriesByWordId = new Map(media.entries.map((entry) => [entry.wordId, entry]));
  let matched = 0;
  let removed = 0;
  let drifted = 0;

  for (const group of groups) {
    const groupResult = resultsByGroup.get(group.groupKey);
    if (!groupResult) continue;
    for (const result of groupResult.results) {
      if (!result.accepted) continue;
      const relatedMedia = entriesByWordId.get(result.wordId)?.relatedMedia;
      const mediaItem = group.source === 'oxford' ? relatedMedia?.oxford : relatedMedia?.redRocket;
      if (!mediaItem) continue;

      if (result.status === 'no_match') {
        delete mediaItem.sentence;
        delete mediaItem.sentenceTranslation;
        removed += 1;
        continue;
      }

      if (mediaItem.sentence !== result.sentence) delete mediaItem.sentenceTranslation;
      mediaItem.sentence = result.sentence;
      matched += 1;
      if (result.selectedOffset !== 0) {
        const correctedImagePath = await renderCorrectedPage(group, result);
        mediaItem.page = result.selectedPage;
        mediaItem.label = group.source === 'oxford'
          ? `Level ${group.level}, Book ${group.book}, Page ${result.selectedPage}`
          : `${group.level}, ${group.title}, Page ${result.selectedPage}`;
        if (group.source === 'oxford') mediaItem.imagePath = correctedImagePath;
        else mediaItem.imagePath = correctedImagePath;
        drifted += 1;
      }
    }
  }

  refreshManifestStats(media, media.stats.totalWords);
  await fs.writeFile(mediaPath, `${JSON.stringify(media, null, 2)}\n`);
  return { matched, removed, drifted };
}

async function main() {
  const [vocabulary, media, oxfordImages, redRocketBooks] = await Promise.all([
    fs.readFile(vocabularyPath, 'utf8').then(JSON.parse),
    fs.readFile(mediaPath, 'utf8').then(JSON.parse),
    fs.readFile(oxfordImagesPath, 'utf8').then(JSON.parse),
    loadRedRocketBooks(),
  ]);
  const wordsById = new Map(vocabulary.words.map((word) => [word.id, word]));
  if (refreshStatsOnly) {
    const stats = refreshManifestStats(media, vocabulary.words.length);
    await fs.writeFile(mediaPath, `${JSON.stringify(media, null, 2)}\n`);
    console.log(JSON.stringify(stats, null, 2));
    return;
  }
  const oxfordAuditByPath = new Map(oxfordImages.map((row) => [row.imagePath, row]));
  const groupsByKey = new Map();

  for (const entry of media.entries) {
    const word = wordsById.get(entry.wordId);
    if (!word) continue;

    const oxford = entry.relatedMedia?.oxford;
    if (oxford) {
      const audit = oxfordAuditByPath.get(oxford.imagePath);
      const pdfPath = oxfordPdfPathFromAudit(audit);
      if (pdfPath && await fileExists(pdfPath)) {
        const groupKey = `oxford:${oxford.level}:${oxford.book}:${oxford.page}`;
        const group = groupsByKey.get(groupKey) ?? {
          groupKey,
          source: 'oxford',
          level: oxford.level,
          book: oxford.book,
          title: '',
          pdfPath,
          currentPage: oxford.page,
          pageLabel: oxford.label,
          targets: [],
        };
        group.targets.push({
          id: `oxford:${entry.wordId}`,
          wordId: entry.wordId,
          targetWord: word.english,
          currentSentence: normalizeSentence(oxford.sentence),
        });
        groupsByKey.set(groupKey, group);
      }
    }

    const redRocket = entry.relatedMedia?.redRocket;
    if (redRocket) {
      const book = redRocketBooks.get(
        `${normalizeKey(redRocket.level)}|${normalizeKey(redRocket.title)}`,
      );
      if (book?.pdfPath && await fileExists(book.pdfPath)) {
        const groupKey = `redRocket:${normalizeKey(redRocket.level)}:${normalizeKey(redRocket.title)}:${redRocket.page}`;
        const group = groupsByKey.get(groupKey) ?? {
          groupKey,
          source: 'redRocket',
          level: redRocket.level,
          book: null,
          title: redRocket.title,
          pdfPath: book.pdfPath,
          currentPage: redRocket.page,
          pageLabel: redRocket.label,
          targets: [],
        };
        group.targets.push({
          id: `redRocket:${entry.wordId}`,
          wordId: entry.wordId,
          targetWord: redRocket.matchedTerm || word.english,
          currentSentence: normalizeSentence(redRocket.sentence),
        });
        groupsByKey.set(groupKey, group);
      }
    }
  }

  const allGroups = [...groupsByKey.values()].sort((left, right) => (
    left.source.localeCompare(right.source)
    || String(left.level).localeCompare(String(right.level), undefined, { numeric: true })
    || String(left.book ?? left.title).localeCompare(String(right.book ?? right.title), undefined, { numeric: true })
    || left.currentPage - right.currentPage
  ));
  const groups = requestedGroupKey
    ? allGroups.filter((group) => group.groupKey === requestedGroupKey)
    : limitGroups
      ? allGroups.slice(0, limitGroups)
      : allGroups;
  if (requestedGroupKey && groups.length === 0) {
    throw new Error(`Unknown group key: ${requestedGroupKey}`);
  }
  const recheckTargetIds = recheckTargetsPath
    ? new Set(
      (await fs.readFile(recheckTargetsPath, 'utf8'))
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    )
    : null;
  const auditGroups = recheckTargetIds
    ? allGroups
      .map((group) => ({
        ...group,
        targets: group.targets.filter((target) => recheckTargetIds.has(target.id)),
      }))
      .filter((group) => group.targets.length > 0)
    : groups;
  if (recheckTargetIds && auditGroups.length === 0) {
    throw new Error(`No targets from ${recheckTargetsPath} matched the audit inventory`);
  }
  const resultsByGroup = await loadCheckpoint();
  const pending = recheckTargetIds
    ? auditGroups
    : auditGroups.filter((group) => !resultsByGroup.has(group.groupKey));
  console.log(JSON.stringify({
    model,
    allGroups: allGroups.length,
    scopedGroups: auditGroups.length,
    associations: auditGroups.reduce((sum, group) => sum + group.targets.length, 0),
    cachedGroups: resultsByGroup.size,
    pendingGroups: pending.length,
    recheckMode: Boolean(recheckTargetIds),
  }, null, 2));

  const startedAt = Date.now();
  let completed = 0;
  for (const group of pending) {
    const result = await auditGroup(group);
    if (recheckTargetIds && resultsByGroup.has(result.groupKey)) {
      const existing = resultsByGroup.get(result.groupKey);
      const recheckedIds = new Set(result.results.map((item) => item.id));
      resultsByGroup.set(result.groupKey, {
        ...existing,
        results: existing.results
          .filter((item) => !recheckedIds.has(item.id))
          .concat(result.results),
      });
    } else {
      resultsByGroup.set(result.groupKey, result);
    }
    await saveCheckpoint(resultsByGroup);
    completed += 1;
    if (completed % 10 === 0 || completed === pending.length) {
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      const rate = completed / Math.max(0.001, elapsedSeconds);
      const etaSeconds = (pending.length - completed) / Math.max(0.001, rate);
      console.log(
        `Visual audit ${completed}/${pending.length}; `
        + `${rate.toFixed(2)} groups/s; ETA ${(etaSeconds / 60).toFixed(1)} min`,
      );
    }
  }

  const manualOverrideCount = await applyManualOverrides(resultsByGroup);
  normalizeCheckpointSentences(resultsByGroup);
  await saveCheckpoint(resultsByGroup);
  console.log(`Applied ${manualOverrideCount} manual visual overrides.`);

  const reportGroups = recheckTargetIds ? allGroups : groups;
  const summary = await writeReport(reportGroups, resultsByGroup);
  console.log(JSON.stringify(summary, null, 2));
  if (shouldApply) {
    console.log(JSON.stringify(await applyResults(media, reportGroups, resultsByGroup), null, 2));
  }
}

await main();
