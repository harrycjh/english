import { describe, expect, it } from 'vitest';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  TARGET_RATIO,
  TEXT_ZONE_END_PCT,
  TEXT_ZONE_START_PCT,
  analyseColumns,
  catalogueSnippet,
  cropRegion,
  describeCrop,
  formatReport,
  judgeTextZone,
} from './prepare-scene-art.mjs';

/** Build raw RGB where one column carries a dark streak part-way down it. */
function columnWithStreak(values, streakColumn, streakValue, height = 8) {
  const { data, width } = greyColumns(values, height);
  for (let y = 2; y < 5; y += 1) {
    const i = (y * width + streakColumn) * 3;
    data[i] = streakValue;
    data[i + 1] = streakValue;
    data[i + 2] = streakValue;
  }
  return { data, width, height };
}

/** Build raw RGB for a picture whose columns are the given grey values. */
function greyColumns(values, height = 8) {
  const data = new Uint8Array(values.length * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < values.length; x += 1) {
      const i = (y * values.length + x) * 3;
      data[i] = values[x];
      data[i + 1] = values[x];
      data[i + 2] = values[x];
    }
  }
  return { data, width: values.length, height };
}

describe('prepare-scene-art', () => {
  it('measures the shape against the card rather than a remembered number', () => {
    expect(TARGET_RATIO).toBeCloseTo(CARD_WIDTH / CARD_HEIGHT, 5);
    expect(describeCrop(CARD_WIDTH * 4, CARD_HEIGHT * 4).axis).toBe('none');
  });

  it('tells you which way a mis-shaped picture will be trimmed', () => {
    // Too wide: cover fills the height, so the sides go — and the sides are
    // where the landmark was asked to stand.
    const wide = describeCrop(2400, 564);
    expect(wide.axis).toBe('horizontal');
    expect(wide.pixels).toBe(Math.round((2400 - 564 * TARGET_RATIO) / 2));

    const tall = describeCrop(1200, 900);
    expect(tall.axis).toBe('vertical');
    expect(tall.pixels).toBe(Math.round((900 - 1200 / TARGET_RATIO) / 2));
  });

  it('hands sharp a centred window that already has the card\'s shape', () => {
    // A 3:2 photograph is the common case from an image generator. Resizing it
    // to 1200 wide without cutting it first ships a 1200x800 file, and then the
    // browser decides for itself what to throw away.
    const tall = cropRegion(1536, 1024);
    expect(tall).toEqual({ left: 0, top: 151, width: 1536, height: 722 });
    expect(tall.width / tall.height).toBeCloseTo(TARGET_RATIO, 2);

    const wide = cropRegion(2400, 564);
    expect(wide.top).toBe(0);
    expect(wide.height).toBe(564);
    expect(wide.width / wide.height).toBeCloseTo(TARGET_RATIO, 2);

    // Already the right shape: hand back the whole picture, not a sliver.
    expect(cropRegion(1200, 564)).toEqual({ left: 0, top: 0, width: 1200, height: 564 });
  });

  it('reads brightness and contrast per column', () => {
    const { data, width, height } = greyColumns([0, 255, 128]);
    const columns = analyseColumns(data, width, height);
    expect(columns).toHaveLength(3);
    expect(columns[0].mean).toBeCloseTo(0, 5);
    expect(columns[1].mean).toBeCloseTo(255, 0);
    expect(columns[2].mean).toBeCloseTo(128, 0);
    // A flat column has no contrast, whatever its brightness.
    expect(columns[1].sd).toBeCloseTo(0, 5);
    expect(columns.map((c) => c.pct)).toEqual([0, (1 / 3) * 100, (2 / 3) * 100]);
  });

  it('judges only the strip the card puts words on', () => {
    // 100 columns, so a column index reads directly as a percentage. The dark
    // one sits past the text, where a landmark is supposed to be.
    const values = new Array(100).fill(250);
    values[80] = 20;
    const { data, width, height } = greyColumns(values);
    const zone = judgeTextZone(analyseColumns(data, width, height));
    expect(zone.verdict).toBe('good');
    expect(zone.darkestValue).toBeCloseTo(250, 0);
  });

  it('catches a dark patch that lands under the words', () => {
    const values = new Array(100).fill(250);
    values[40] = 20;
    const { data, width, height } = greyColumns(values);
    const zone = judgeTextZone(analyseColumns(data, width, height));
    expect(zone.verdict).toBe('poor');
    expect(zone.darkestPct).toBeGreaterThanOrEqual(TEXT_ZONE_START_PCT);
    expect(zone.darkestPct).toBeLessThanOrEqual(TEXT_ZONE_END_PCT);
  });

  it('does not let a bright average hide one dark column', () => {
    const values = new Array(100).fill(252);
    values[30] = 100;
    const { data, width, height } = greyColumns(values);
    const zone = judgeTextZone(analyseColumns(data, width, height));
    expect(zone.meanLuminance).toBeGreaterThan(240);
    expect(zone.verdict).toBe('poor');
  });

  it('catches a dark branch crossing an otherwise pale column', () => {
    // The real failure mode: a column that is bright on average, and bright at
    // the top and bottom, but has a dark streak running through the middle
    // exactly where a line of text sits. Reading the column's brightest pixel,
    // or its average, would call this fine.
    const { data, width, height } = columnWithStreak(new Array(100).fill(250), 30, 30);
    const columns = analyseColumns(data, width, height);
    expect(columns[30].mean).toBeGreaterThan(160);
    expect(columns[30].min).toBeCloseTo(30, 0);
    expect(judgeTextZone(columns).verdict).toBe('poor');
  });

  it('separates a merely dim picture from an unreadable one', () => {
    const dim = greyColumns(new Array(100).fill(190));
    expect(judgeTextZone(analyseColumns(dim.data, dim.width, dim.height)).verdict).toBe('ok');
    const dark = greyColumns(new Array(100).fill(160));
    expect(judgeTextZone(analyseColumns(dark.data, dark.width, dark.height)).verdict).toBe('poor');
  });

  it('reports the crop and the verdict together', () => {
    const values = new Array(100).fill(250);
    const { data, width, height } = greyColumns(values);
    const report = formatReport({
      source: '/tmp/somewhere/beijing.png',
      metadata: { width: 1829, height: 860 },
      crop: describeCrop(1829, 860),
      zone: judgeTextZone(analyseColumns(data, width, height)),
      output: { file: 'public/design-reference/slices/scene-beijing.webp', width: 1200, height: 564, size: 70656 },
    });
    expect(report).toContain('beijing.png');
    expect(report).toContain('裁切: 无');
    expect(report).toContain('可读性: 很好');
    expect(report).toContain('69KB');
    expect(report).not.toContain('/tmp/somewhere');
  });

  it('warns that a too-wide picture loses its sides', () => {
    const { data, width, height } = greyColumns(new Array(100).fill(250));
    const report = formatReport({
      source: 'wide.png',
      metadata: { width: 2400, height: 564 },
      crop: describeCrop(2400, 564),
      zone: judgeTextZone(analyseColumns(data, width, height)),
      output: null,
    });
    expect(report).toContain('左右各');
    expect(report).toContain('主体可能被切到');
    expect(report).not.toContain('已写入');
  });

  it('hands back a catalogue entry that matches the file it wrote', () => {
    const snippet = catalogueSnippet('harbin', 20);
    expect(snippet).toContain("id: 'harbin'");
    expect(snippet).toContain("artFile: 'scene-harbin.webp'");
    expect(snippet).toContain('requiredDays: 20');
    // Art drawn to this spec keeps its own margin, so it must skip the scrim.
    expect(snippet).toContain('hasBuiltInMargin: true');
    expect(snippet).toContain("slot: 'focus'");
  });
});
