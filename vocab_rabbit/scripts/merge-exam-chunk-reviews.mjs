import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

function parseArguments(argv) {
  const outputIndex = argv.indexOf('--output');
  if (outputIndex < 0 || !argv[outputIndex + 1]) {
    throw new Error('Usage: merge-exam-chunk-reviews.mjs --output FILE INPUT...');
  }
  const outputPath = path.resolve(argv[outputIndex + 1]);
  const inputPaths = argv
    .filter((_, index) => index !== outputIndex && index !== outputIndex + 1)
    .map((value) => path.resolve(value));
  if (inputPaths.length === 0) throw new Error('At least one input file is required');
  return { outputPath, inputPaths };
}

export function mergeReviewEntries(payloads) {
  const byId = new Map();
  for (const payload of payloads) {
    for (const entry of payload.entries ?? []) {
      if (byId.has(entry.id)) throw new Error(`Duplicate review entry: ${entry.id}`);
      byId.set(entry.id, entry);
    }
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

async function main() {
  const { outputPath, inputPaths } = parseArguments(process.argv.slice(2));
  const payloads = await Promise.all(inputPaths.map(async (inputPath) => (
    JSON.parse(await fs.readFile(inputPath, 'utf8'))
  )));
  const entries = mergeReviewEntries(payloads);
  const stats = {
    words: entries.length,
    wordsWithChunks: entries.filter((entry) => entry.chunks.length > 0).length,
    chunks: entries.reduce((sum, entry) => sum + entry.chunks.length, 0),
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    models: [...new Set(payloads.map((payload) => payload.model).filter(Boolean))],
    stats,
    entries,
  }, null, 2)}\n`);
  console.log(JSON.stringify(stats, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
