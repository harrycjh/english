import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { phrasesEquivalent, requiresIndependentVote } from './ensemble-exam-chunks.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultInputPath = path.join(root, 'tmp/exam-chunks/detailed-all-35b.json');
const defaultOutputPath = path.join(root, 'tmp/exam-chunks/vote-input.json');

function parseArguments(argv) {
  const options = {
    inputPath: defaultInputPath,
    outputPath: defaultOutputPath,
    excludeVotePath: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--input') options.inputPath = path.resolve(argv[++index]);
    else if (value === '--output') options.outputPath = path.resolve(argv[++index]);
    else if (value === '--exclude-vote') options.excludeVotePath = path.resolve(argv[++index]);
  }
  return options;
}

export function buildVoteEntries(entries) {
  return entries.map((entry) => ({
    id: entry.id,
    chunks: entry.chunks.filter(requiresIndependentVote),
  }));
}

export function excludeAcceptedVotes(entries, acceptedEntries) {
  const acceptedById = new Map(acceptedEntries.map((entry) => [entry.id, entry]));
  return entries.map((entry) => ({
    id: entry.id,
    chunks: entry.chunks.filter((chunk) => !(
      acceptedById.get(entry.id)?.chunks.some((accepted) => (
        phrasesEquivalent(chunk.phrase, accepted.phrase)
      ))
    )),
  }));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const input = JSON.parse(await fs.readFile(options.inputPath, 'utf8'));
  if (!Array.isArray(input.entries)) throw new Error('Detailed input has no entries array');
  let entries = buildVoteEntries(input.entries);
  if (options.excludeVotePath) {
    const accepted = JSON.parse(await fs.readFile(options.excludeVotePath, 'utf8'));
    if (!Array.isArray(accepted.entries)) throw new Error('Excluded vote has no entries array');
    entries = excludeAcceptedVotes(entries, accepted.entries);
  }
  const stats = {
    words: entries.length,
    wordsWithChunks: entries.filter((entry) => entry.chunks.length > 0).length,
    chunks: entries.reduce((sum, entry) => sum + entry.chunks.length, 0),
  };
  await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
  await fs.writeFile(options.outputPath, `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
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
