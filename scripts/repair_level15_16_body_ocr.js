#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = '/Volumes/ExternalSSD/English';
const PDF_ROOT = path.join(ROOT, 'oxford-tree');
const EXTRACT_ROOT = path.join(PDF_ROOT, 'extracted');

const TARGETS = {
  'Level 15/15-1 Adrenalin Rush.json': [
    { page: 10, psm: 3 },
  ],
  'Level 15/15-3 Storm Chasers.json': [
    { page: 6, psm: 3 },
    { page: 7, psm: 3 },
    { page: 15, psm: 3 },
  ],
  'Level 15/15-4 Ultimate Takeover.json': [
    { page: 29, psm: 3 },
  ],
};

function run(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new Error(`${cmd} ${args.join(' ')} failed: ${stderr}`);
  }
  return result.stdout;
}

function ocrPage(pdfPath, pageNumber, psm) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oxford-ocr-'));
  const prefix = path.join(tmpDir, `page-${pageNumber}`);
  try {
    run('pdftoppm', ['-f', String(pageNumber), '-l', String(pageNumber), '-r', '200', '-png', pdfPath, prefix]);
    const pngPath = `${prefix}-${String(pageNumber).padStart(2, '0')}.png`;
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

function updateBook(relPath, targets) {
  const jsonPath = path.join(EXTRACT_ROOT, relPath);
  const pdfPath = path.join(PDF_ROOT, relPath.replace(/\.json$/, '.pdf'));
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const pages = new Map((data.pages || []).map((page) => [page.page_number, page]));

  for (const target of targets) {
    const page = pages.get(target.page);
    if (!page) {
      throw new Error(`Missing page ${target.page} in ${relPath}`);
    }
    const text = ocrPage(pdfPath, target.page, target.psm);
    page.text = text;
    page.letter_count = (text.match(/[A-Za-z]/g) || []).length;
  }

  data.text_pages = (data.pages || []).filter((page) => (page.text || '').trim().length > 0).length;
  fs.writeFileSync(jsonPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return jsonPath;
}

for (const [relPath, targets] of Object.entries(TARGETS)) {
  updateBook(relPath, targets);
}

console.log(`Updated ${Object.keys(TARGETS).length} Oxford Tree books with local OCR replacements.`);
