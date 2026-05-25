#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = '/Volumes/ExternalSSD/English';
const PDF_ROOT = path.join(ROOT, 'oxford-tree');
const EXTRACT_ROOT = path.join(PDF_ROOT, 'extracted');
const TARGET_FILE = path.join(ROOT, 'oxford_low_score_targets.json');
const REPORT_FILE = path.join(ROOT, 'oxford_low_score_repair_report.json');
const SCORE_THRESHOLD = 20;
const REPLACE_DELTA = 8;

const dict = new Set(
  fs.readFileSync('/usr/share/dict/words', 'utf8')
    .split(/\r?\n/)
    .map((w) => w.toLowerCase())
    .filter(Boolean),
);

function run(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new Error(`${cmd} ${args.join(' ')} failed: ${stderr}`);
  }
  return result.stdout;
}

function metrics(text = '') {
  const words = (text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) || []);
  const dictHits = words.filter((t) => dict.has(t)).length;
  const weird = (text.match(/[^A-Za-z0-9\s.,;:'"!?()\-\n]/g) || []).length;
  const avgLen = words.reduce((sum, w) => sum + w.length, 0) / (words.length || 1);
  const shortTokens = words.filter((w) => w.length <= 2).length;
  const dictRatio = dictHits / (words.length || 1);
  const score = dictRatio * 100 + avgLen * 2 - weird * 8 - shortTokens * 0.5;
  return { score, weird, avgLen, dictRatio, wordCount: words.length };
}

function ocrPage(pdfPath, pageNumber, psm) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oxford-ocr-'));
  const prefix = path.join(tmpDir, `page-${pageNumber}`);
  try {
    run('pdftoppm', ['-f', String(pageNumber), '-l', String(pageNumber), '-r', '200', '-png', pdfPath, prefix]);
    const pngPath = fs.readdirSync(tmpDir)
      .filter((name) => name.endsWith('.png'))
      .map((name) => path.join(tmpDir, name))
      .sort()[0];
    if (!pngPath) {
      throw new Error(`No PNG produced for page ${pageNumber}`);
    }
    const result = spawnSync('tesseract', [pngPath, 'stdout', '-l', 'eng', '--psm', String(psm)], { encoding: 'utf8' });
    if (result.status !== 0) {
      const stderr = (result.stderr || '').trim();
      throw new Error(`tesseract page ${pageNumber} failed: ${stderr}`);
    }
    return result.stdout
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.replace(/\s+$/g, ''))
      .join('\n')
      .trim();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function bestOcrText(pdfPath, pageNumber) {
  const modes = [3, 4, 6];
  const attempts = [];
  for (const psm of modes) {
    const text = ocrPage(pdfPath, pageNumber, psm);
    attempts.push({ psm, text, ...metrics(text) });
  }
  attempts.sort((a, b) => b.score - a.score);
  return attempts[0];
}

function updateBook(relPath, pageNumbers) {
  const jsonPath = path.join(EXTRACT_ROOT, relPath);
  const pdfPath = path.join(PDF_ROOT, relPath.replace(/\.json$/, '.pdf'));
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const pages = Array.isArray(data.pages) ? data.pages : [];
  const pageMap = new Map(pages.map((page) => [page.page_number, page]));
  const report = [];

  for (const pageNumber of pageNumbers) {
    const page = pageMap.get(pageNumber);
    if (!page) continue;
    const currentText = page.text || '';
    const current = metrics(currentText);
    const best = bestOcrText(pdfPath, pageNumber);
    const shouldReplace = best.score >= current.score + REPLACE_DELTA;
    if (shouldReplace) {
      page.text = best.text;
      page.letter_count = (best.text.match(/[A-Za-z]/g) || []).length;
    }
    report.push({
      page_number: pageNumber,
      replaced: shouldReplace,
      current: { ...current },
      best: { psm: best.psm, ...best },
    });
  }

  data.text_pages = pages.filter((page) => (page.text || '').trim().length > 0).length;
  fs.writeFileSync(jsonPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return report;
}

const targets = JSON.parse(fs.readFileSync(TARGET_FILE, 'utf8'));
const grouped = new Map();
for (const item of targets) {
  if (item.score >= SCORE_THRESHOLD) continue;
  if (!grouped.has(item.level + '/' + item.file)) grouped.set(item.level + '/' + item.file, []);
  grouped.get(item.level + '/' + item.file).push(item.page);
}

const allReports = [];
for (const [relPath, pageNumbers] of grouped.entries()) {
  const report = updateBook(relPath, [...new Set(pageNumbers)].sort((a, b) => a - b));
  allReports.push({ relPath, report });
}

fs.writeFileSync(REPORT_FILE, `${JSON.stringify(allReports, null, 2)}\n`);
console.log(`Processed ${allReports.length} Oxford Tree files; report saved to ${REPORT_FILE}`);
