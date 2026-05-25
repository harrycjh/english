#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = '/Volumes/ExternalSSD/English/oxford-tree/extracted';

const FILES = {
  'Level 15/15-1 Adrenalin Rush.json': {},
  'Level 15/15-2 Mythical Beasts and Fabulous Monsters.json': {},
  'Level 15/15-3 Storm Chasers.json': {},
  'Level 15/15-4 Ultimate Takeover.json': {},
  'Level 16/16-1 Sherlock Holmes.json': {},
  'Level 16/16-2 Tales of the Underworld.json': {},
};

function updateBook(relPath, spec) {
  const filePath = path.join(ROOT, relPath);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  delete data.metadata;

  const pages = Array.isArray(data.pages) ? data.pages : [];
  const bodyPages = pages.filter((page) => page.page_number > 3 && page.page_number <= pages.length - 2);
  data.pages = bodyPages;
  data.total_pages = bodyPages.length;
  data.text_pages = bodyPages.filter((page) => (page.text || '').trim().length > 0).length;

  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return filePath;
}

for (const [relPath, spec] of Object.entries(FILES)) {
  updateBook(relPath, spec);
}

console.log(`Updated ${Object.keys(FILES).length} Oxford Tree front-matter files.`);
