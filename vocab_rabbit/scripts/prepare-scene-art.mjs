/**
 * Prepare a 主题背景 picture for the backpack.
 *
 * The 今日重点 card renders at a fixed 434x204 CSS px on every stage, and the
 * card's own text and button sit over the left of the picture. So a scene only
 * works if it is the right shape and stays pale where the words land. Both of
 * those are measurable, and measuring them before the picture ships is cheaper
 * than noticing afterwards that a title has gone unreadable on someone's phone.
 *
 *   node scripts/prepare-scene-art.mjs <图片> <id> [--dry-run]
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);

/** The 今日重点 card, measured in the browser. Both stages resolve to this. */
export const CARD_WIDTH = 434;
export const CARD_HEIGHT = 204;
export const TARGET_RATIO = CARD_WIDTH / CARD_HEIGHT;

/** Widest the card is ever painted is 935 device px, so 1200 leaves headroom. */
export const EXPORT_WIDTH = 1200;
export const EXPORT_QUALITY = 86;

/** Where the card's own title, description and button sit, as % of the width. */
export const TEXT_ZONE_START_PCT = 5.5;
export const TEXT_ZONE_END_PCT = 59;

/** A ratio this close to the card's needs no crop worth reporting. */
const RATIO_TOLERANCE = 0.01;

/**
 * What `background-size: cover` will trim off a picture of this shape.
 */
export function describeCrop(width, height) {
  const ratio = width / height;
  if (Math.abs(ratio - TARGET_RATIO) < RATIO_TOLERANCE) {
    return { axis: 'none', pixels: 0, ratio };
  }
  if (ratio > TARGET_RATIO) {
    return { axis: 'horizontal', pixels: Math.round((width - height * TARGET_RATIO) / 2), ratio };
  }
  return { axis: 'vertical', pixels: Math.round((height - width / TARGET_RATIO) / 2), ratio };
}

/**
 * The centred window `describeCrop` implies, ready to hand to sharp's extract.
 */
export function cropRegion(width, height) {
  const crop = describeCrop(width, height);
  if (crop.axis === 'horizontal') {
    return { left: crop.pixels, top: 0, width: width - crop.pixels * 2, height };
  }
  if (crop.axis === 'vertical') {
    return { left: 0, top: crop.pixels, width, height: height - crop.pixels * 2 };
  }
  return { left: 0, top: 0, width, height };
}

/**
 * Per-column brightness and contrast from raw RGB pixels.
 */
export function analyseColumns(rgb, width, height) {
  const columns = [];
  for (let x = 0; x < width; x += 1) {
    const luminance = [];
    for (let y = 0; y < height; y += 1) {
      const i = (y * width + x) * 3;
      luminance.push(0.2126 * rgb[i] + 0.7152 * rgb[i + 1] + 0.0722 * rgb[i + 2]);
    }
    const mean = luminance.reduce((total, value) => total + value, 0) / height;
    const variance = luminance.reduce((total, value) => total + (value - mean) ** 2, 0) / height;
    columns.push({
      pct: (x / width) * 100,
      mean,
      sd: Math.sqrt(variance),
      min: Math.min(...luminance),
    });
  }
  return columns;
}

/**
 * How the card's own words will fare over this picture.
 *
 * Judged on the darkest pixel rather than the average, because a single dark
 * branch behind a line of text is what actually costs legibility — an average
 * stays comfortable right up until it doesn't.
 */
export function judgeTextZone(columns) {
  const zone = columns.filter((c) => c.pct >= TEXT_ZONE_START_PCT && c.pct <= TEXT_ZONE_END_PCT);
  if (zone.length === 0) throw new Error('文字区没有采样到列，检查图片宽度');
  const darkest = zone.reduce((worst, c) => (c.min < worst.min ? c : worst));
  const verdict = darkest.min > 200 ? 'good' : darkest.min > 170 ? 'ok' : 'poor';
  return {
    meanLuminance: zone.reduce((total, c) => total + c.mean, 0) / zone.length,
    darkestValue: darkest.min,
    darkestPct: darkest.pct,
    maxContrast: Math.max(...zone.map((c) => c.sd)),
    verdict,
  };
}

const VERDICT_TEXT = {
  good: '可读性: 很好',
  ok: '可读性: 可以',
  poor: '可读性: 偏暗，文字可能吃力，建议把这一段再调淡',
};

/** The catalogue line to paste into BACKPACK_ITEMS. */
export function catalogueSnippet(id, requiredDays) {
  return [
    '  {',
    `    id: '${id}',`,
    "    slot: 'focus',",
    `    name: '${id}',`,
    "    hint: '写一句话',",
    `    requiredDays: ${requiredDays},`,
    `    artFile: 'scene-${id}.webp',`,
    '    hasBuiltInMargin: true,',
    '  },',
  ].join('\n');
}

export function formatReport({ source, metadata, crop, zone, output }) {
  const lines = [
    `源图 ${path.basename(source)}  ${metadata.width}x${metadata.height}  比例 ${crop.ratio.toFixed(3)}  (目标 ${TARGET_RATIO.toFixed(3)})`,
  ];
  if (crop.axis === 'none') lines.push('裁切: 无');
  else if (crop.axis === 'horizontal') lines.push(`裁切: 左右各 ${crop.pixels}px — 主体可能被切到`);
  else lines.push(`裁切: 上下各 ${crop.pixels}px`);
  lines.push(
    `文字区 (${TEXT_ZONE_START_PCT}–${TEXT_ZONE_END_PCT}%)  平均亮度 ${zone.meanLuminance.toFixed(0)}  最暗 ${zone.darkestValue.toFixed(0)} @ ${zone.darkestPct.toFixed(0)}%  最大对比 ${zone.maxContrast.toFixed(1)}`,
    VERDICT_TEXT[zone.verdict],
  );
  if (output) lines.push(`已写入 ${output.file}  ${output.width}x${output.height}  ${(output.size / 1024).toFixed(0)}KB`);
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const [source, id] = args.filter((arg) => !arg.startsWith('--'));
  if (!source || !id) {
    console.error('用法: node scripts/prepare-scene-art.mjs <图片> <id> [--dry-run]');
    process.exit(1);
  }
  if (!fs.existsSync(source)) {
    console.error(`找不到图片: ${source}`);
    process.exit(1);
  }

  const sharp = require('sharp');
  const metadata = await sharp(source).metadata();
  const crop = describeCrop(metadata.width, metadata.height);

  const sampleWidth = 120;
  const sampleHeight = 56;
  const region = cropRegion(metadata.width, metadata.height);
  const { data } = await sharp(source)
    .extract(region)
    .resize(sampleWidth, sampleHeight, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const zone = judgeTextZone(analyseColumns(data, sampleWidth, sampleHeight));

  let output = null;
  if (!dryRun) {
    const file = `public/design-reference/slices/scene-${id}.webp`;
    const info = await sharp(source)
      .extract(region)
      .resize({ width: EXPORT_WIDTH })
      .webp({ quality: EXPORT_QUALITY })
      .toFile(file);
    output = { file, width: info.width, height: info.height, size: info.size };
  }

  console.log(formatReport({ source, metadata, crop, zone, output }));
  if (!dryRun) {
    console.log('\n把这段加进 src/services/backpack.ts 的 BACKPACK_ITEMS，保持天数升序:\n');
    console.log(catalogueSnippet(id, '??'));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
