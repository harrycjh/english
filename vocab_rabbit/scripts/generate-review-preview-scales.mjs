import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const payloadPath = path.join(root, 'public/content/words/ket_vocabulary.json');
const outputPath = path.join(root, 'src/data/review-preview-image-scales.json');
const payload = JSON.parse(await readFile(payloadPath, 'utf8'));

const SAMPLE_SIZE = 64;
const TARGET_INK_COVERAGE = 0.2;
const MIN_SCALE = 0.5;
const WHITE_DISTANCE_THRESHOLD = 28;

const scales = {};
for (const word of payload.words) {
  const sourcePath = path.join(root, 'public', word.imagePath.replace(/^\//, ''));
  try {
    const { data, info } = await sharp(sourcePath)
      .flatten({ background: '#ffffff' })
      .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let inkPixels = 0;
    for (let offset = 0; offset < data.length; offset += info.channels) {
      const distanceFromWhite = Math.max(
        255 - data[offset],
        255 - data[offset + 1],
        255 - data[offset + 2],
      );
      if (distanceFromWhite > WHITE_DISTANCE_THRESHOLD) inkPixels += 1;
    }

    const coverage = inkPixels / (info.width * info.height);
    const scale = Math.max(MIN_SCALE, Math.min(1, Math.sqrt(TARGET_INK_COVERAGE / Math.max(coverage, 0.001))));
    if (scale < 0.99) scales[word.id] = Number(scale.toFixed(3));
  } catch {
    // Missing optional images keep the default scale and their existing fallback.
  }
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(scales, null, 2)}\n`);
console.log(`Wrote ${Object.keys(scales).length} preview scales to ${path.relative(root, outputPath)}.`);
