import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'public/content/words/word_related_media.json');
const exclusionsPath = path.join(root, 'scripts/related-media-semantic-exclusions.json');

function refreshStats(manifest) {
  const entries = manifest.entries ?? [];
  const sourceEntries = (source) => entries.filter((entry) => entry.relatedMedia?.[source]);
  const oxford = sourceEntries('oxford');
  const redRocket = sourceEntries('redRocket');
  const raz = sourceEntries('raz');
  const mediaKey = (item) => item.imagePath || `${item.atlasPath}#${item.row},${item.column}`;
  manifest.stats = {
    ...manifest.stats,
    entries: entries.length,
    withOxford: oxford.length,
    uniqueOxfordImages: new Set(oxford.map((entry) => entry.relatedMedia.oxford.imagePath)).size,
    withOxfordSentence: oxford.filter((entry) => entry.relatedMedia.oxford.sentence).length,
    withOxfordSentenceTranslation: oxford.filter((entry) => entry.relatedMedia.oxford.sentenceTranslation).length,
    withRedRocket: redRocket.length,
    uniqueRedRocketImages: new Set(redRocket.map((entry) => mediaKey(entry.relatedMedia.redRocket))).size,
    redRocketAtlases: new Set(redRocket.map((entry) => entry.relatedMedia.redRocket.atlasPath)).size,
    withRedRocketSentence: redRocket.filter((entry) => entry.relatedMedia.redRocket.sentence).length,
    withRedRocketSentenceTranslation: redRocket.filter((entry) => entry.relatedMedia.redRocket.sentenceTranslation).length,
    withRaz: raz.length,
    uniqueRazImages: new Set(raz.map((entry) => mediaKey(entry.relatedMedia.raz))).size,
    razAtlases: new Set(raz.map((entry) => entry.relatedMedia.raz.atlasPath)).size,
    withRazSentence: raz.filter((entry) => entry.relatedMedia.raz.sentence).length,
    withRazSentenceTranslation: raz.filter((entry) => entry.relatedMedia.raz.sentenceTranslation).length,
  };
}

async function main() {
  const [manifest, payload] = await Promise.all([
    fs.readFile(manifestPath, 'utf8').then(JSON.parse),
    fs.readFile(exclusionsPath, 'utf8').then(JSON.parse),
  ]);
  const entriesByWordId = new Map(manifest.entries.map((entry) => [entry.wordId, entry]));
  const applied = [];
  const stale = [];
  for (const exclusion of payload.exclusions ?? []) {
    const entry = entriesByWordId.get(exclusion.wordId);
    const media = entry?.relatedMedia?.[exclusion.source];
    if (!media) continue;
    if (media.label !== exclusion.mediaIdentity?.label || media.page !== exclusion.mediaIdentity?.page) {
      stale.push(exclusion.key);
      continue;
    }
    delete entry.relatedMedia[exclusion.source];
    applied.push(exclusion.key);
  }
  manifest.entries = manifest.entries.filter((entry) => Object.keys(entry.relatedMedia ?? {}).length > 0);
  refreshStats(manifest);
  if (!process.argv.includes('--dry-run')) {
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  console.log(JSON.stringify({ applied: applied.length, stale: stale.length, staleKeys: stale }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
