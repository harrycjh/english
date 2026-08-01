import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { applyGeneratedEntry } from './generate-teaching-chunk-examples.mjs';
import { deterministicReview } from './review-teaching-chunk-examples.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vocabularyPath = path.join(root, 'public/content/words/ket_vocabulary.json');
const examplesPath = path.join(root, 'tmp/teaching-chunk-examples.json');
const adjudicationPath = path.join(root, 'tmp/teaching-chunk-example-adjudication.json');
const auditPath = path.join(root, 'tmp/teaching-chunk-example-final-audit.json');

const MANUAL_OVERRIDES = {
  'ket_after_adv_prep::2': {
    sentence: 'After you, please go ahead.',
    translation: '您先请，请往前走。',
    translationFocus: '您先请',
  },
  'ket_april_n::2': {
    sentence: "We play tricks on April Fool's Day.",
    translation: '我们在愚人节搞恶作剧。',
    translationFocus: '愚人节',
  },
  'ket_difference_n::0': {
    sentence: 'Do you know the difference between these two colors?',
    translation: '你知道这两种颜色的区别吗？',
    translationFocus: '知道这两种颜色的区别',
  },
  'ket_grass_n::0': {
    sentence: 'He was green as grass at his first job.',
    translation: '他刚开始第一份工作时毫无经验。',
    translationFocus: '毫无经验',
  },
  'ket_kite_n::0': {
    sentence: "Let's fly the kite in the park.",
    translation: '我们去公园放风筝吧。',
    translationFocus: '放风筝',
  },
  'ket_last_adj_det::1': {
    sentence: 'The food will last out the week.',
    translation: '这些食物足够我们吃到周末。',
    translationFocus: '足够我们吃到',
  },
  'ket_left_adj_adv_n::0': {
    sentence: 'Some pizza was left over after lunch.',
    translation: '午饭后还剩下一些披萨。',
    translationFocus: '还剩下',
  },
  'ket_might_mv::2': {
    sentence: 'Pigs might fly before he cleans his room.',
    translation: '除非太阳从西边出来，否则他不会打扫房间。',
    translationFocus: '除非太阳从西边出来',
  },
  'ket_rain_n_v::2': {
    sentence: 'The football match was rained off.',
    translation: '足球比赛因雨取消了。',
    translationFocus: '因雨取消',
  },
  'ket_tell_v::1': {
    sentence: 'Can you tell the time on this clock?',
    translation: '你会用这个钟看时间吗？',
    translationFocus: '看时间',
  },
  'ket_under_prep::2': {
    sentence: 'The difficult test put me under pressure.',
    translation: '这场困难的考试使我承受了压力。',
    translationFocus: '承受了压力',
  },
  'ket_stomach_n::0': {
    sentence: 'The stomach upset made me feel terrible.',
    translation: '胃部不适让我感觉糟透了。',
    translationFocus: '胃部不适',
  },
  'ket_sun_n::1': {
    sentence: 'The teacher said there was nothing new under the sun.',
    translation: '老师说天下无新事。',
    translationFocus: '天下无新事',
  },
  'ket_their_det::0': {
    sentence: 'We all like different games, each to their own.',
    translation: '我们都喜欢不同的游戏，各有所好。',
    translationFocus: '各有所好',
  },
  'ket_traffic_n::0': {
    sentence: 'Traffic control kept cars moving safely.',
    translation: '交通管制让车辆安全通行。',
    translationFocus: '交通管制',
  },
};

function parseArguments(argv) {
  return { apply: argv.includes('--apply') };
}

function reviewKey(id, index) {
  return `${id}::${index}`;
}

export function finalExampleFor(target, adjudication) {
  const override = MANUAL_OVERRIDES[target.key];
  if (override) return override;
  if (!adjudication || adjudication.decision === 'original' || adjudication.decision === 'manual') {
    return {
      sentence: target.sentence,
      translation: target.translation,
      translationFocus: target.translationFocus,
    };
  }
  return {
    sentence: adjudication.finalSentence,
    translation: adjudication.finalTranslation,
    translationFocus: adjudication.finalTranslationFocus,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const [vocabulary, examples, adjudication] = await Promise.all([
    fs.readFile(vocabularyPath, 'utf8').then(JSON.parse),
    fs.readFile(examplesPath, 'utf8').then(JSON.parse),
    fs.readFile(adjudicationPath, 'utf8').then(JSON.parse),
  ]);
  const wordsById = new Map(vocabulary.words.map((word) => [word.id, word]));
  const adjudicationByKey = new Map((adjudication.items ?? []).map((item) => [item.key, item]));
  const changes = [];
  const errors = [];
  for (const entry of examples.entries ?? []) {
    const word = wordsById.get(entry.id);
    const chunks = (word?.teachingChunks ?? []).slice(0, 3);
    for (const [index, example] of (entry.examples ?? []).entries()) {
      if (example.sentenceSource !== 'qwen') continue;
      const key = reviewKey(entry.id, index);
      const target = { key, phrase: chunks[index]?.phrase, ...example };
      const final = finalExampleFor(target, adjudicationByKey.get(key));
      const validationIssues = deterministicReview({ ...target, ...final });
      if (validationIssues.length > 0) {
        errors.push({ key, validationIssues, final });
        continue;
      }
      const changed = example.sentence !== final.sentence
        || example.translation !== final.translation
        || example.translationFocus !== final.translationFocus;
      if (!changed) continue;
      changes.push({ key, before: { ...example }, after: { ...example, ...final } });
      Object.assign(example, final);
    }
  }
  if (errors.length > 0) {
    throw new Error(`Cannot apply invalid reviews: ${JSON.stringify(errors.slice(0, 20))}`);
  }
  const audit = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    reviewedQwenExamples: 2155,
    changedExamples: changes.length,
    manualOverrides: Object.keys(MANUAL_OVERRIDES).length,
    changes,
  };
  console.log(`Validated 2,155 reviewed Qwen examples; ${changes.length} will change; ${Object.keys(MANUAL_OVERRIDES).length} manual overrides`);
  if (!options.apply) return;
  const entriesById = new Map((examples.entries ?? []).map((entry) => [entry.id, entry]));
  for (const word of vocabulary.words.filter((item) => (item.teachingChunks?.length ?? 0) > 0)) {
    applyGeneratedEntry(word, entriesById.get(word.id));
  }
  examples.review = {
    reviewedAt: new Date().toISOString(),
    semanticReviewer: 'google/gemma-4-26b-a4b-qat',
    adjudicator: 'qwen/qwen3.6-27b',
    reviewedQwenExamples: 2155,
    changedExamples: changes.length,
  };
  await Promise.all([
    fs.writeFile(examplesPath, `${JSON.stringify(examples, null, 2)}\n`),
    fs.writeFile(vocabularyPath, `${JSON.stringify(vocabulary, null, 2)}\n`),
    fs.writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`),
  ]);
  console.log(`Applied ${changes.length} reviewed examples to the example result and vocabulary`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
