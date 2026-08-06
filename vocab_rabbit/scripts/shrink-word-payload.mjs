import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Fields that exist in the authored word list purely so build-time scripts can
// read them. The app never touches these at runtime, so shipping them makes the
// phone download and parse them on every visit for nothing.
export const BUILD_ONLY_WORD_FIELDS = ['examChunks'];

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
