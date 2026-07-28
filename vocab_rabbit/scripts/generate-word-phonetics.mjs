import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vocabularyPath = path.join(root, 'public/content/words/ket_vocabulary.json');
const voice = process.env.ESPEAK_VOICE ?? 'en-us';
const binary = process.env.ESPEAK_BIN ?? 'espeak-ng';

const HEADWORD_OVERRIDES = {
  'a/an': 'a',
  'all right/alright': 'all right',
  'at / @': 'at',
  'barbecue/barbeque': 'barbecue',
  'cafe/café': 'cafe',
  'centre/center': 'centre',
  'centimetre/centimeter (cm)': 'centimetre',
  'examination/exam': 'exam',
  'give somebody a call/ring': 'give somebody a call',
  'lots / a lot': 'lots',
  'OK/okay': 'okay',
  'prefer / would prefer': 'prefer',
  'television (TV)': 'television',
  'v/versus': 'versus',
};

const IPA_VOWELS = /[aeiouyæɑɐɒʌɛəɜɞɪɔɵɘɚɝʊʉɯøœɶɤ]/u;

function normalizeHeadword(english) {
  if (HEADWORD_OVERRIDES[english]) return HEADWORD_OVERRIDES[english];
  return english
    .replace(/\s+\([^)]*\)$/g, '')
    .replace(/\(([^)]+)\)/g, '$1')
    .split(/\s*\/\s*/)[0]
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeStress(segment) {
  const characters = [...segment];
  for (const stress of ['ˈ', 'ˌ']) {
    let stressIndex = characters.indexOf(stress);
    while (stressIndex >= 0) {
      let previousVowel = -1;
      for (let index = stressIndex - 1; index >= 0; index -= 1) {
        if (IPA_VOWELS.test(characters[index])) {
          previousVowel = index;
          break;
        }
      }
      const insertionIndex = previousVowel + 1;
      characters.splice(stressIndex, 1);
      characters.splice(insertionIndex, 0, stress);
      stressIndex = characters.indexOf(stress, Math.max(stressIndex + 1, insertionIndex + 1));
    }
  }
  return characters.join('');
}

function normalizePhonetic(value) {
  const normalized = value
    .replace(/\u200d/gu, '')
    .trim()
    .split(/\s+/)
    .map(normalizeStress)
    .join(' ');
  return normalized ? `/${normalized}/` : '';
}

async function generatePhonetics(inputs) {
  const child = spawn(binary, ['-q', '--ipa=3', '-v', voice], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdin.end(`${inputs.join('\n')}\n`);

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  if (exitCode !== 0) throw new Error(`${binary} exited with ${exitCode}: ${stderr}`);

  const lines = stdout.replace(/\r/g, '').split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length !== inputs.length) {
    throw new Error(`Expected ${inputs.length} phonetic lines, received ${lines.length}`);
  }
  return lines.map(normalizePhonetic);
}

async function main() {
  const payload = JSON.parse(await fs.readFile(vocabularyPath, 'utf8'));
  const inputs = payload.words.map((word) => normalizeHeadword(word.english));
  const phonetics = await generatePhonetics(inputs);
  const missing = [];

  payload.words.forEach((word, index) => {
    word.phonetic = phonetics[index];
    if (!word.phonetic) missing.push(word.id);
  });
  if (missing.length > 0) throw new Error(`Missing phonetics: ${missing.join(', ')}`);

  await fs.writeFile(vocabularyPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`Applied ${phonetics.length} ${voice} phonetic transcriptions.`);
}

await main();
