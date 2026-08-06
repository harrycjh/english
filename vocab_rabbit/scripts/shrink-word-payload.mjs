import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Fields that exist in the authored word list purely so build-time scripts can
// read them. The app never touches these at runtime, so shipping them makes the
// phone download and parse them on every visit for nothing.
export const BUILD_ONLY_WORD_FIELDS = ['examChunks'];

// Same story one level down: every teaching chunk carries the reasoning behind
// its selection, and the drawer that shows them renders the phrase and its
// translation and nothing else. Across 1302 words that was 140KB gzipped --
// a quarter of the whole payload -- downloaded on every open for nothing.
export const SHIPPED_TEACHING_CHUNK_FIELDS = ['phrase', 'chinese'];
export const SHIPPED_USAGE_FREQUENCY_FIELDS = ['zipf', 'selectionScore'];

function pick(source, fields) {
  const kept = {};
  for (const field of fields) {
    if (source[field] !== undefined) kept[field] = source[field];
  }
  return kept;
}

function shrinkTeachingChunk(chunk) {
  return {
    ...pick(chunk, SHIPPED_TEACHING_CHUNK_FIELDS),
    // Kept because the drawer sorts on them at render time. The authored file
    // is only mostly in that order (63 words differ), so pre-sorting here and
    // dropping these would quietly reorder those words in production but not
    // in dev, where the authored file is served untouched.
    usageFrequency: pick(chunk.usageFrequency ?? {}, SHIPPED_USAGE_FREQUENCY_FIELDS),
  };
}

const PAYLOAD_RELATIVE_PATH = 'content/words/ket_vocabulary.json';

export function shrinkWordPayload(payload) {
  if (!payload || !Array.isArray(payload.words)) {
    throw new Error('Word payload is missing its words array');
  }

  return {
    ...payload,
    words: payload.words.map((word) => {
      const shipped = { ...word };
      for (const field of BUILD_ONLY_WORD_FIELDS) {
        delete shipped[field];
      }
      if (Array.isArray(shipped.teachingChunks)) {
        shipped.teachingChunks = shipped.teachingChunks.map(shrinkTeachingChunk);
      }
      return shipped;
    }),
  };
}

export async function shrinkDistWordPayload({ distDir }) {
  const payloadPath = path.join(distDir, PAYLOAD_RELATIVE_PATH);
  const before = (await stat(payloadPath)).size;
  const payload = JSON.parse(await readFile(payloadPath, 'utf8'));

  // No indentation: the authored file is pretty-printed for review, which is
  // ~40% of its bytes and buys the browser nothing.
  const shipped = JSON.stringify(shrinkWordPayload(payload));
  await writeFile(payloadPath, shipped);

  return { before, after: Buffer.byteLength(shipped), words: payload.words.length };
}

const isMainModule = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const distDir = path.resolve(process.argv[2] ?? 'dist');
  shrinkDistWordPayload({ distDir })
    .then(({ before, after, words }) => {
      const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);
      const saved = Math.round((1 - after / before) * 100);
      console.log(
        `Word payload: ${words} words, ${mb(before)}MB -> ${mb(after)}MB (-${saved}%)`,
      );
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
