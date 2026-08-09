import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const auditRoot = path.join(root, 'design-output/related-media-semantic-audit');
const exclusionsPath = path.join(root, 'scripts/related-media-semantic-exclusions.json');

const MANUAL_KEEP = new Set([
  'oxford:ket_free_adj_adv',
  'oxford:ket_unhappy_n',
  'raz:ket_unhappy_n',
  'oxford:ket_wrong_adj',
  'oxford:ket_clear_adj',
  'oxford:ket_right_n_adj_adv',
  'oxford:ket_lamp_n',
  'oxford:ket_ring_n_v',
  'oxford:ket_watch_n_v',
  'oxford:ket_boiled_adj',
  'raz:ket_boiled_adj',
  'raz:ket_card_n',
  'raz:ket_drawing_n',
  'oxford:ket_dance_n_v',
  'redRocket:ket_dance_n_v',
  'raz:ket_dance_n_v',
  'oxford:ket_camp_v',
  'raz:ket_camp_v',
  'oxford:ket_running_n',
  'redRocket:ket_running_n',
  'redRocket:ket_swimming_n',
  'redRocket:ket_skate_v',
  'raz:ket_race_n_v',
  'oxford:ket_square_n_adj',
  'oxford:ket_plant_n',
  'oxford:ket_way_n',
  'raz:ket_july_n',
  'redRocket:ket_beginning_n',
  'redRocket:ket_fly_v',
  'redRocket:ket_lots_a_lot_n',
  'oxford:ket_more_adj_adv_det_pron',
  'oxford:ket_what_det_pron',
  'oxford:ket_hey_exclam',
  'redRocket:ket_look_after_phr_v',
  'oxford:ket_answer_n_v',
  'raz:ket_answer_n_v',
  'raz:ket_design_v',
  'oxford:ket_design_process_n',
  'oxford:ket_design_drawing_n',
  'raz:ket_hate_v',
  'redRocket:ket_pull_v',
  'oxford:ket_shampoo_n_v',
  'redRocket:ket_sleep_v',
  'redRocket:ket_sound_v',
  'oxford:ket_double_adj',
  'raz:ket_double_adj',
  'raz:ket_empty_adj',
  'raz:ket_lost_adj',
  'oxford:ket_own_adj',
  'oxford:ket_unfortunately_adj',
  'oxford:ket_wish_n',
]);

const MANUAL_REMOVE = new Map([
  ['redRocket:ket_match_n', 'The page teaches a hot matchstick, not a sports match.'],
]);

async function readJson(name) {
  return fs.readFile(path.join(auditRoot, name), 'utf8').then(JSON.parse);
}

function overlay(base, replacement) {
  const byKey = new Map(base.results.map((item) => [item.key, item]));
  for (const item of replacement.results) byKey.set(item.key, item);
  return byKey;
}

function confirmedKeys(payload) {
  return new Set(payload.results
    .filter((item) => item.verdict === 'confirmed_mismatch')
    .map((item) => item.key));
}

async function main() {
  const [qwen, gemma, qwenStudy, gemmaStudy, gemmaOfQwen, qwenOfGemma, manifest] = await Promise.all([
    readJson('report-qwen.json'),
    readJson('report-gemma.json'),
    readJson('report-qwen-study-sense.json'),
    readJson('report-gemma-study-sense.json'),
    readJson('adjudication-gemma-of-qwen.json'),
    readJson('adjudication-qwen-of-gemma.json'),
    fs.readFile(path.join(root, 'public/content/words/word_related_media.json'), 'utf8').then(JSON.parse),
  ]);
  const qwenByKey = overlay(qwen, qwenStudy);
  const gemmaByKey = overlay(gemma, gemmaStudy);
  const changedKeys = new Set(qwenStudy.results.map((item) => item.key));
  const gemmaConfirmed = confirmedKeys(gemmaOfQwen);
  const qwenConfirmed = confirmedKeys(qwenOfGemma);
  const mediaByKey = new Map();
  for (const entry of manifest.entries) {
    for (const [source, media] of Object.entries(entry.relatedMedia ?? {})) {
      if (['oxford', 'redRocket', 'raz'].includes(source)) mediaByKey.set(`${source}:${entry.wordId}`, media);
    }
  }
  const keys = [...new Set([...qwenByKey.keys(), ...gemmaByKey.keys()])];
  const results = keys.map((key) => {
    const qwenResult = qwenByKey.get(key);
    const gemmaResult = gemmaByKey.get(key);
    const bothMismatch = qwenResult?.status === 'mismatch' && gemmaResult?.status === 'mismatch';
    const detailedConfirmation = !changedKeys.has(key) && (
      gemmaConfirmed.has(key) || qwenConfirmed.has(key)
    );
    const highConfidence = bothMismatch || detailedConfirmation;
    const manualKeep = MANUAL_KEEP.has(key);
    const manualRemoveReason = MANUAL_REMOVE.get(key);
    const decision = manualRemoveReason || (highConfidence && !manualKeep)
      ? 'remove'
      : manualKeep
        ? 'keep_after_review'
        : [qwenResult?.status, gemmaResult?.status].some((status) => status !== 'aligned')
          ? 'needs_visual_review'
          : 'aligned';
    return {
      key,
      source: qwenResult?.source ?? gemmaResult?.source,
      wordId: key.slice(key.indexOf(':') + 1),
      headword: qwenResult?.headword ?? gemmaResult?.headword,
      studyPartOfSpeech: qwenResult?.studyPartOfSpeech ?? gemmaResult?.studyPartOfSpeech,
      studyChinese: qwenResult?.studyChinese ?? gemmaResult?.studyChinese,
      sourceLabel: qwenResult?.sourceLabel ?? gemmaResult?.sourceLabel,
      sentence: qwenResult?.sentence ?? gemmaResult?.sentence,
      qwenStatus: qwenResult?.status,
      gemmaStatus: gemmaResult?.status,
      detailedConfirmation,
      decision,
      reason: manualRemoveReason
        ?? (manualKeep ? 'Manual image-concept review kept this association.' : 'Two-model semantic review confirmed a different study sense.'),
    };
  });
  const exclusions = results
    .filter((item) => item.decision === 'remove')
    .map((item) => ({
      key: item.key,
      source: item.source,
      wordId: item.wordId,
      sourceLabel: item.sourceLabel,
      sentence: item.sentence,
      reason: item.reason,
      mediaIdentity: {
        label: mediaByKey.get(item.key)?.label ?? '',
        page: mediaByKey.get(item.key)?.page ?? null,
      },
    }));
  const summary = {
    generatedAt: new Date().toISOString(),
    associations: results.length,
    aligned: results.filter((item) => item.decision === 'aligned').length,
    keptAfterReview: results.filter((item) => item.decision === 'keep_after_review').length,
    removed: exclusions.length,
    needsVisualReview: results.filter((item) => item.decision === 'needs_visual_review').length,
    bySource: Object.fromEntries(['oxford', 'redRocket', 'raz'].map((source) => [
      source,
      exclusions.filter((item) => item.source === source).length,
    ])),
  };
  await fs.writeFile(path.join(auditRoot, 'ensemble.json'), `${JSON.stringify({ schemaVersion: 1, summary, results }, null, 2)}\n`);
  await fs.writeFile(exclusionsPath, `${JSON.stringify({ schemaVersion: 1, generatedAt: summary.generatedAt, exclusions }, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
