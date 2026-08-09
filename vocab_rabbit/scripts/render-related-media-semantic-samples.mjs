import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'public');
const vocabularyPath = path.join(publicRoot, 'content/words/ket_vocabulary.json');
const manifestPath = path.join(publicRoot, 'content/words/word_related_media.json');
const ensemblePath = path.join(root, 'design-output/related-media-semantic-audit/ensemble.json');
const outputRoot = path.join(root, 'design-output/related-media-semantic-audit/samples');
const columns = 3;
const rows = 3;
const tileWidth = 600;
const tileHeight = 540;

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapText(value, maxLength = 52) {
  const words = String(value ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function stableSample(items, count, seed) {
  return [...items]
    .sort((left, right) => crypto.createHash('sha1').update(`${seed}:${left.key}`).digest('hex')
      .localeCompare(crypto.createHash('sha1').update(`${seed}:${right.key}`).digest('hex')))
    .slice(0, count);
}

async function mediaImage(media, grid) {
  const imagePath = media.imagePath || media.atlasPath;
  const absolutePath = path.join(publicRoot, imagePath.replace(/^\//, ''));
  let image = sharp(absolutePath).rotate();
  if (!media.imagePath && media.atlasPath) {
    const metadata = await image.metadata();
    const cellWidth = Math.floor(metadata.width / grid.columns);
    const cellHeight = Math.floor(metadata.height / grid.rows);
    image = image.extract({
      left: media.column * cellWidth,
      top: media.row * cellHeight,
      width: cellWidth,
      height: cellHeight,
    });
  }
  return image.resize(560, 350, {
    fit: 'contain',
    background: { r: 255, g: 255, b: 255 },
  }).webp({ quality: 90 }).toBuffer();
}

function labelSvg(item, kind) {
  const sentenceLines = wrapText(item.sentence);
  const color = kind === 'confirmed' ? '#a5302d' : '#267249';
  return Buffer.from(`
    <svg width="${tileWidth}" height="${tileHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${tileWidth}" height="${tileHeight}" fill="#fffdf8"/>
      <rect x="1" y="1" width="${tileWidth - 2}" height="${tileHeight - 2}" rx="8" fill="none" stroke="#dec9a6" stroke-width="2"/>
      <text x="20" y="385" font-family="Arial, sans-serif" font-size="26" font-weight="700" fill="${color}">${escapeXml(item.headword)} · ${escapeXml(item.studyChinese)}</text>
      <text x="20" y="416" font-family="Arial, sans-serif" font-size="18" fill="#594a3a">${escapeXml(item.source)} · ${escapeXml(item.sourceLabel)}</text>
      ${sentenceLines.map((line, index) => `<text x="20" y="${451 + index * 25}" font-family="Arial, sans-serif" font-size="18" fill="#20364d">${escapeXml(line)}</text>`).join('')}
    </svg>
  `);
}

async function renderTile(item, media, grid, kind) {
  const image = await mediaImage(media, grid);
  return sharp(labelSvg(item, kind))
    .composite([{ input: image, left: 20, top: 20 }])
    .webp({ quality: 90 })
    .toBuffer();
}

async function renderSheets(name, items, mediaByKey, manifest, kind) {
  for (let offset = 0; offset < items.length; offset += columns * rows) {
    const page = items.slice(offset, offset + columns * rows);
    const tiles = await Promise.all(page.map((item) => {
      const media = mediaByKey.get(item.key);
      const grid = item.source === 'redRocket' ? manifest.redRocketAtlasGrid : manifest.razAtlasGrid;
      return renderTile(item, media, grid ?? { columns: 3, rows: 3 }, kind);
    }));
    const sheet = sharp({
      create: {
        width: columns * tileWidth,
        height: rows * tileHeight,
        channels: 3,
        background: '#f7efe2',
      },
    }).composite(tiles.map((input, index) => ({
      input,
      left: (index % columns) * tileWidth,
      top: Math.floor(index / columns) * tileHeight,
    })));
    await sheet.webp({ quality: 90 }).toFile(path.join(outputRoot, `${name}-${Math.floor(offset / 9) + 1}.webp`));
  }
}

async function main() {
  const [vocabulary, manifest, ensemble] = await Promise.all([
    fs.readFile(vocabularyPath, 'utf8').then(JSON.parse),
    fs.readFile(manifestPath, 'utf8').then(JSON.parse),
    fs.readFile(ensemblePath, 'utf8').then(JSON.parse),
  ]);
  const wordsById = new Map(vocabulary.words.map((word) => [word.id, word]));
  const mediaByKey = new Map();
  for (const entry of manifest.entries) {
    for (const [source, media] of Object.entries(entry.relatedMedia ?? {})) {
      if (['oxford', 'redRocket', 'raz'].includes(source)) mediaByKey.set(`${source}:${entry.wordId}`, media);
    }
  }
  const confirmed = ensemble.results.filter((item) => item.decision === 'remove');
  const aligned = ensemble.results.filter((item) => (
    ['aligned', 'keep_after_review'].includes(item.decision)
  ));
  const decorate = (items) => items.map((item) => {
    const wordId = item.wordId ?? item.key.slice(item.key.indexOf(':') + 1);
    const word = wordsById.get(wordId);
    return {
      ...item,
      wordId,
      headword: word?.english ?? item.headword,
      studyChinese: word?.studySense?.chinese ?? word?.chinese ?? item.studyChinese,
    };
  });
  const confirmedSample = decorate(['oxford', 'redRocket', 'raz'].flatMap((source) => (
    stableSample(confirmed.filter((item) => item.source === source), 6, 'confirmed-v1')
  )));
  const alignedSample = decorate(['oxford', 'redRocket', 'raz'].flatMap((source) => (
    stableSample(aligned.filter((item) => item.source === source && item.sentence), 3, 'aligned-v1')
  )));
  await fs.mkdir(outputRoot, { recursive: true });
  await renderSheets('confirmed', confirmedSample, mediaByKey, manifest, 'confirmed');
  await renderSheets('aligned', alignedSample, mediaByKey, manifest, 'aligned');
  await fs.writeFile(path.join(outputRoot, 'selection.json'), `${JSON.stringify({ confirmedSample, alignedSample }, null, 2)}\n`);
  console.log(JSON.stringify({ confirmed: confirmedSample.length, aligned: alignedSample.length, outputRoot }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
