import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const run = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(projectRoot, 'public');
const mediaPath = path.join(publicRoot, 'content/words/word_related_media.json');
const legacyAuditPath = path.join(
  projectRoot,
  'design-output/related-media-visual-audit/report.json',
);
const outputRoot = path.join(projectRoot, 'design-output/related-media-image-sentence-audit');
const cacheRoot = path.join(projectRoot, 'tmp/related-media-image-sentence-audit');
const cellRoot = path.join(cacheRoot, 'cells');
const ocrRoot = path.join(cacheRoot, 'ocr');
const reportPath = path.join(outputRoot, 'report.json');
const reportTsvPath = path.join(outputRoot, 'report.tsv');
const endpoint = process.env.LM_STUDIO_URL ?? 'http://127.0.0.1:1234/v1/chat/completions';
const model = process.env.LM_STUDIO_MODEL ?? 'qwen/qwen3-vl-30b';
const concurrency = Math.max(1, Number(process.env.OCR_CONCURRENCY ?? 6));
const useVlm = process.argv.includes('--recheck-vlm');
const limitArg = process.argv.find((argument) => argument.startsWith('--limit='));
const limit = limitArg ? Math.max(1, Number(limitArg.split('=')[1])) : null;

function hash(value) {
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

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(left, right) {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function bestOcrSimilarity(sentence, ocrText) {
  const target = normalizeText(sentence);
  const haystack = normalizeText(ocrText);
  if (!target || !haystack) return 0;
  if (` ${haystack} `.includes(` ${target} `)) return 1;

  const targetTokens = target.split(' ');
  const ocrTokens = haystack.split(' ');
  let best = 0;
  for (let size = Math.max(1, targetTokens.length - 2); size <= targetTokens.length + 3; size += 1) {
    for (let index = 0; index + size <= ocrTokens.length; index += 1) {
      const candidate = ocrTokens.slice(index, index + size).join(' ');
      const distance = levenshtein(target, candidate);
      best = Math.max(best, 1 - distance / Math.max(target.length, candidate.length, 1));
    }
  }
  return best;
}

function cellKey(source, media) {
  if (source === 'oxford') return `oxford:${media.imagePath}`;
  return `${source}:${media.atlasPath}:${media.row}:${media.column}`;
}

function publicFile(assetPath) {
  return path.join(publicRoot, assetPath.replace(/^\/+/, ''));
}

async function renderCell(group) {
  await fs.mkdir(cellRoot, { recursive: true });
  const outputPath = path.join(cellRoot, `${hash(group.key)}.png`);
  if (await fileExists(outputPath)) return outputPath;

  const media = group.items[0].media;
  const inputPath = publicFile(media.imagePath ?? media.atlasPath);
  const image = sharp(inputPath).rotate();
  if (group.source === 'oxford') {
    await image
      .resize({ width: 1800, withoutEnlargement: false })
      .png()
      .toFile(outputPath);
    return outputPath;
  }

  const metadata = await image.metadata();
  const cellWidth = Math.floor(metadata.width / 3);
  const cellHeight = Math.floor(metadata.height / 3);
  await image
    .extract({
      left: media.column * cellWidth,
      top: media.row * cellHeight,
      width: cellWidth,
      height: cellHeight,
    })
    .resize(2048, 2048, { fit: 'fill' })
    .png()
    .toFile(outputPath);
  return outputPath;
}

async function readOcr(group) {
  await fs.mkdir(ocrRoot, { recursive: true });
  const outputPath = path.join(ocrRoot, `${hash(group.key)}.txt`);
  if (await fileExists(outputPath)) return fs.readFile(outputPath, 'utf8');
  const imagePath = await renderCell(group);
  const { stdout } = await run(
    'tesseract',
    [imagePath, 'stdout', '-l', 'eng', '--psm', '6'],
    { maxBuffer: 8 * 1024 * 1024 },
  );
  await fs.writeFile(outputPath, stdout);
  return stdout;
}

async function runPool(items, worker) {
  let cursor = 0;
  const results = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

async function imageDataUrl(imagePath) {
  const bytes = await fs.readFile(imagePath);
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

async function recheckWithVlm(group, items) {
  const imagePath = await renderCell(group);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 3000,
      reasoning_effort: 'none',
      messages: [
        {
          role: 'system',
          content: [
            'You are a meticulous visual proofreader for an English children book page.',
            'For every supplied target, decide whether that complete English sentence is visibly printed on this exact page image.',
            'Allow harmless OCR punctuation or capitalization differences, but do not accept a sentence merely because the picture depicts a similar idea.',
            'Do not infer words that are not visibly printed. Return uncertain when the text is unreadable.',
          ].join(' '),
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                page: group.items[0].media.label,
                targets: items.map((item) => ({ id: item.id, sentence: item.sentence })),
              }),
            },
            { type: 'image_url', image_url: { url: await imageDataUrl(imagePath) } },
          ],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'image_sentence_alignment',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              results: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', enum: items.map((item) => item.id) },
                    status: { type: 'string', enum: ['match', 'mismatch', 'uncertain'] },
                    visibleText: { type: 'string' },
                    confidence: { type: 'number' },
                    reason: { type: 'string' },
                  },
                  required: ['id', 'status', 'visibleText', 'confidence', 'reason'],
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
  if (!response.ok) throw new Error(`LM Studio returned ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error(`LM Studio returned no content for ${group.key}`);
  const parsed = JSON.parse(content).results;
  if (parsed.length !== items.length) throw new Error(`Incomplete VLM result for ${group.key}`);
  return new Map(parsed.map((result) => [result.id, result]));
}

function tsvCell(value) {
  return String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim();
}

async function main() {
  const payload = JSON.parse(await fs.readFile(mediaPath, 'utf8'));
  const legacyAudit = JSON.parse(await fs.readFile(legacyAuditPath, 'utf8'));
  const legacyById = new Map();
  for (const group of legacyAudit.groups ?? []) {
    for (const result of group.results ?? []) legacyById.set(result.id, result);
  }

  const groupsByKey = new Map();
  for (const entry of payload.entries ?? []) {
    for (const source of ['oxford', 'redRocket', 'raz']) {
      const media = entry.relatedMedia?.[source];
      if (!media?.sentence) continue;
      const key = cellKey(source, media);
      if (!groupsByKey.has(key)) groupsByKey.set(key, { key, source, items: [] });
      groupsByKey.get(key).items.push({
        id: `${source}:${entry.wordId}`,
        wordId: entry.wordId,
        source,
        sentence: media.sentence,
        media,
      });
    }
  }

  let groups = [...groupsByKey.values()];
  if (limit) groups = groups.slice(0, limit);
  const razGroups = groups.filter((group) => group.source === 'raz');
  let completed = 0;
  await runPool(razGroups, async (group) => {
    group.ocrText = await readOcr(group);
    completed += 1;
    if (completed % 50 === 0 || completed === razGroups.length) {
      console.log(`OCR ${completed}/${razGroups.length}`);
    }
  });

  const results = [];
  for (const group of groups) {
    for (const item of group.items) {
      if (group.source !== 'raz') {
        const legacy = legacyById.get(item.id);
        results.push({
          ...item,
          label: item.media.label,
          status: legacy?.accepted && legacy.status === 'match' ? 'match' : 'uncertain',
          method: 'existing-visual-audit',
          similarity: null,
          visibleText: legacy?.sentence ?? '',
          confidence: legacy?.confidence ?? 0,
          reason: legacy?.reason ?? 'No existing visual audit result.',
          cellPath: null,
        });
        continue;
      }
      const similarity = bestOcrSimilarity(item.sentence, group.ocrText);
      results.push({
        ...item,
        label: item.media.label,
        status: similarity >= 0.82 ? 'match' : 'needs_review',
        method: 'tesseract',
        similarity,
        visibleText: '',
        confidence: similarity,
        reason: similarity >= 0.82
          ? 'OCR contains the sentence with high similarity.'
          : 'OCR did not recover the sentence confidently.',
        cellPath: path.relative(projectRoot, await renderCell(group)),
      });
    }
  }

  if (useVlm) {
    const resultById = new Map(results.map((result) => [result.id, result]));
    const reviewGroups = razGroups.filter((group) => (
      group.items.some((item) => resultById.get(item.id)?.status === 'needs_review')
    ));
    let reviewed = 0;
    for (const group of reviewGroups) {
      const items = group.items.filter((item) => resultById.get(item.id)?.status === 'needs_review');
      const visual = await recheckWithVlm(group, items);
      for (const item of items) {
        const decision = visual.get(item.id);
        Object.assign(resultById.get(item.id), {
          status: decision.status,
          method: 'qwen-vl',
          visibleText: decision.visibleText,
          confidence: decision.confidence,
          reason: decision.reason,
        });
      }
      reviewed += 1;
      if (reviewed % 20 === 0 || reviewed === reviewGroups.length) {
        console.log(`VLM ${reviewed}/${reviewGroups.length}`);
      }
    }
  }

  const serializable = results.map(({ media, ...result }) => result);
  const summary = {
    generatedAt: new Date().toISOString(),
    model: useVlm ? model : null,
    associations: serializable.length,
    bySource: Object.fromEntries(['oxford', 'redRocket', 'raz'].map((source) => {
      const sourceResults = serializable.filter((result) => result.source === source);
      return [source, {
        associations: sourceResults.length,
        match: sourceResults.filter((result) => result.status === 'match').length,
        mismatch: sourceResults.filter((result) => result.status === 'mismatch').length,
        needsReview: sourceResults.filter((result) => result.status === 'needs_review').length,
        uncertain: sourceResults.filter((result) => result.status === 'uncertain').length,
      }];
    })),
  };
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify({ summary, results: serializable }, null, 2)}\n`);
  const columns = [
    'source', 'wordId', 'label', 'status', 'method', 'similarity', 'confidence',
    'sentence', 'visibleText', 'reason', 'cellPath',
  ];
  const rows = [columns.join('\t'), ...serializable.map((result) => (
    columns.map((column) => tsvCell(result[column])).join('\t')
  ))];
  await fs.writeFile(reportTsvPath, `${rows.join('\n')}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
