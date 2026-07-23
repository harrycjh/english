import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vocabularyPath = path.join(projectRoot, 'public/content/words/ket_vocabulary.json');
const oxfordRoot = path.resolve(projectRoot, '../oxford-tree/extracted');
const defaultOutputPath = path.join(projectRoot, 'design-output/ket-examples/generated.json');
const endpoint = process.env.LM_STUDIO_URL ?? 'http://127.0.0.1:1234/v1/chat/completions';
const model = process.env.KET_EXAMPLE_MODEL ?? 'ket-example-writer';
const IRREGULAR_FORMS = {
  be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
  become: ['became'],
  begin: ['began', 'begun'], break: ['broke', 'broken'], bring: ['brought'],
  buy: ['bought'], can: ['could'], catch: ['caught'], choose: ['chose', 'chosen'],
  come: ['came'], do: ['does', 'did', 'done'], drink: ['drank', 'drunk'],
  drive: ['drove', 'driven'], eat: ['ate', 'eaten'], fall: ['fell', 'fallen'],
  feel: ['felt'], find: ['found'], fly: ['flew', 'flown'], forget: ['forgot', 'forgotten'],
  get: ['got', 'gotten'], give: ['gave', 'given'], go: ['went', 'gone'], grow: ['grew', 'grown'],
  have: ['has', 'had'], know: ['knew', 'known'], leave: ['left'], lie: ['lay', 'lain'],
  lose: ['lost'], make: ['made'], meet: ['met'], pay: ['paid'], read: ['read'],
  ride: ['rode', 'ridden'], ring: ['rang', 'rung'], rise: ['rose', 'risen'], run: ['ran'],
  say: ['said'], see: ['saw', 'seen'], send: ['sent'], sing: ['sang', 'sung'],
  sit: ['sat'], speak: ['spoke', 'spoken'], spend: ['spent'], stand: ['stood'],
  steal: ['stole', 'stolen'], swim: ['swam', 'swum'], take: ['took', 'taken'],
  teach: ['taught'], tell: ['told'], think: ['thought'], throw: ['threw', 'thrown'],
  understand: ['understood'], wake: ['woke', 'woken'], wear: ['wore', 'worn'],
  win: ['won'], write: ['wrote', 'written'],
};
const MANUAL_EXAMPLES = {
  ket_activity_n: 'Swimming is my favourite activity after school.',
  ket_age_n: 'Children of any age can join the club.',
  ket_a_an_det: 'She has a cat and an old dog.',
  ket_all_the_time_det: 'My little brother asks questions all the time.',
  ket_an_det: 'She found an orange in her lunchbox.',
  ket_by_the_way_prep_phr: 'By the way, did you call Tom?',
  ket_can_n_mv: 'The boy can ride a bike.',
  ket_brush_n_v: 'Please brush your teeth before bed.',
  ket_but_conj: 'I called Ben, but he was busy.',
  ket_centimetre_centimeter_cm_n: 'This ruler is thirty centimetres long.',
  ket_crossing_n: 'Wait for the green light at the crossing.',
  ket_ear_n: 'My ear hurts after swimming.',
  ket_electric_adj: 'We use an electric fan in summer.',
  ket_final_adj: "Our final lesson ends at three o'clock.",
  ket_gram_me_n: 'This apple weighs about one hundred grams.',
  ket_her_det_pron: 'I met her sister at the station.',
  ket_his_det_pron: 'His brother plays basketball after school.',
  ket_it_pron: 'The box is heavy, but I can carry it.',
  ket_its_det: 'The dog is sleeping in its basket.',
  ket_letter_n: 'She wrote a letter to her friend.',
  ket_like_adv_prep_v: 'My sister and I like the same music.',
  ket_mine_pron: 'Your bag is blue, and mine is red.',
  ket_mind_v: 'Do you mind opening the window?',
  ket_my_det: 'My school is near the library.',
  ket_nationality_n: 'Please write your nationality on the form.',
  ket_of_prep: 'The door of the classroom is open.',
  ket_other_det_pron: 'The other children are waiting outside.',
  ket_own_adj: 'She has her own bedroom upstairs.',
  ket_pilot_n: 'The pilot flew the plane safely.',
  ket_please_v_exclam: 'Please close the window before you leave.',
  ket_post_v_n: 'Please post this letter on your way home.',
  ket_pull_v: 'Pull the door towards you slowly.',
  ket_she_pron: 'She walks to school with her brother.',
  ket_sleep_v: 'I usually sleep for eight hours.',
  ket_so_conj_adv: 'It was raining, so we stayed inside.',
  ket_stand_v: 'Please stand behind the yellow line.',
  ket_this_det_pron: 'This book is easier than the last one.',
  ket_tidy_up_v: 'Please tidy up your desk after class.',
  ket_throw_v: 'Please throw the ball to me.',
  ket_tonight_n_adv: 'We are having pizza for dinner tonight.',
  ket_train_transitive_and_intransitive_v: 'The team trains every Tuesday evening.',
  ket_type_n: 'What type of music do you like?',
  ket_us_pron: 'Our teacher gave us extra homework today.',
  ket_hi_exclam: 'Hi, Lucy, how are you today?',
  ket_huge_adj: 'A huge whale swam beside the boat.',
  ket_immediately_adv: 'Please come home immediately after school.',
  ket_including_prep: 'Everyone, including my sister, enjoyed the picnic.',
  ket_latest_adj: 'Have you seen the latest school timetable?',
  ket_look_out_phr_v: 'Look out! There is a bike behind you.',
  ket_too_adv: 'This bag is too heavy for me.',
  ket_very_adv: 'The film was very funny and exciting.',
  ket_worse_adj: 'The weather is worse than yesterday.',
  ket_worst_adj: 'Monday was the worst day of our trip.',
};
const HEADWORD_OVERRIDES = {
  'barbecue/barbeque': 'barbecue',
  'cafe/café': 'cafe',
  'examination/exam': 'exam',
  'at / @': 'at',
  'v/versus': 'versus',
  'centre/center': 'centre',
  'centimetre/centimeter (cm)': 'centimetre',
  'lots / a lot': 'a lot',
  'a/an': 'an',
  'all right/alright': 'all right',
  'OK/okay': 'OK',
  'give somebody a call/ring': 'give me a call',
  'gram(me)': 'gram',
  'prefer / would prefer': 'prefer',
  'poor thing/you': 'poor thing',
  'television (TV)': 'TV',
};

export function getHeadword(english) {
  if (HEADWORD_OVERRIDES[english]) return HEADWORD_OVERRIDES[english];
  return english
    .replace(/\s+\([^)]*\)$/g, '')
    .replace(/\(([^)]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function containsHeadword(sentence, english) {
  const headword = getHeadword(english);
  const tokenForms = (token) => {
    const forms = new Set([token, `${token}s`, `${token}es`]);
    for (const form of IRREGULAR_FORMS[token.toLowerCase()] ?? []) forms.add(form);
    if (token.endsWith('e')) {
      forms.add(`${token}d`);
      forms.add(`${token.slice(0, -1)}ing`);
    } else {
      forms.add(`${token}ed`);
      forms.add(`${token}ing`);
    }
    if (/[^aeiou]y$/i.test(token)) {
      forms.add(`${token.slice(0, -1)}ies`);
      forms.add(`${token.slice(0, -1)}ied`);
    }
    if (/^[A-Za-z]*[^aeiou][aeiou][^aeiouwxy]$/i.test(token)) {
      forms.add(`${token}${token.at(-1)}ed`);
      forms.add(`${token}${token.at(-1)}ing`);
    }
    return forms;
  };

  const normalizedHeadword = headword.replace(/-/g, ' ');
  const words = normalizedHeadword.split(' ');
  const phraseForms = new Set([headword, normalizedHeadword, words.join('-')]);
  for (const form of tokenForms(words[0])) phraseForms.add([form, ...words.slice(1)].join(' '));
  if (words.length > 1) {
    for (const form of tokenForms(words.at(-1))) phraseForms.add([...words.slice(0, -1), form].join(' '));
  }

  return [...phraseForms].some((form) => (
    new RegExp(`(^|[^A-Za-z])${escapeRegExp(form)}(?=$|[^A-Za-z])`, 'i').test(sentence)
  ));
}

export function validateExample(word, example) {
  const errors = [];
  const sentence = typeof example === 'string' ? example.trim() : '';
  const wordCount = sentence.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g)?.length ?? 0;

  if (!sentence) errors.push('empty');
  if (!containsHeadword(sentence, word.english)) errors.push('missing-headword');
  if (wordCount < 3 || wordCount > 15) errors.push('word-count');
  if (!/^[A-Z“"']/u.test(sentence)) errors.push('capitalization');
  if (!/[.!?][”"']?$/u.test(sentence)) errors.push('punctuation');
  if (/[^\x00-\x7F]/u.test(sentence.replace(/[’“”]/g, ''))) errors.push('non-english');
  if (/^I can(?:\s|$)/i.test(sentence)) errors.push('fallback-template');
  if (/^This is(?:\s|$)/i.test(sentence)) errors.push('fallback-template');

  return { valid: errors.length === 0, errors, sentence, wordCount };
}

function splitSentences(text) {
  return text
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function candidateScore(sentence) {
  const words = sentence.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g)?.length ?? 99;
  const letters = sentence.match(/[A-Za-z]/g)?.length ?? 0;
  const letterRatio = sentence.length > 0 ? letters / sentence.length : 0;
  if (words < 3 || words > 18 || letterRatio < 0.68) return Number.POSITIVE_INFINITY;
  if (/[_|{}<>]/.test(sentence)) return Number.POSITIVE_INFINITY;
  return words + Math.max(0, 0.82 - letterRatio) * 20;
}

async function readOxfordBooks() {
  const books = new Map();
  const levelDirectories = await fs.readdir(oxfordRoot, { withFileTypes: true });
  for (const levelDirectory of levelDirectories.filter((entry) => entry.isDirectory())) {
    const directoryPath = path.join(oxfordRoot, levelDirectory.name);
    const files = await fs.readdir(directoryPath);
    for (const file of files.filter((name) => name.endsWith('.json'))) {
      const book = JSON.parse(await fs.readFile(path.join(directoryPath, file), 'utf8'));
      const level = Number(String(book.level).match(/\d+/)?.[0]);
      const bookNumber = Number(String(book.book).match(/^(\d+)-(\d+)/)?.[2]);
      if (level && bookNumber) books.set(`${level}:${bookNumber}`, book);
    }
  }
  return books;
}

export function findOxfordCandidate(word, books) {
  const candidates = [];
  for (const ref of word.oxfordRefs ?? []) {
    const page = books.get(`${ref.level}:${ref.book}`)?.pages?.find((entry) => entry.page_number === ref.page);
    if (!page?.text) continue;
    for (const sentence of splitSentences(page.text)) {
      if (containsHeadword(sentence, word.english) && Number.isFinite(candidateScore(sentence))) {
        candidates.push(sentence);
      }
    }
  }
  return candidates.sort((left, right) => candidateScore(left) - candidateScore(right))[0] ?? null;
}

function buildPrompt(items) {
  return JSON.stringify(items.map(({ word, candidate, correction }) => {
    const studySense = word.studySense ?? word;
    return {
      id: word.id,
      headword: getHeadword(word.english),
      partOfSpeech: studySense.partOfSpeech,
      chineseMeaning: studySense.chinese,
      topic: word.category,
      readingCandidate: candidate,
      correctionRequired: correction ?? null,
    };
  }), null, 2);
}

async function requestExamples(items) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      max_tokens: 3000,
      reasoning_effort: 'none',
      messages: [
        {
          role: 'system',
          content: [
            'You are an experienced Cambridge A2 Key (KET) teacher writing examples for a child.',
            'Write exactly one natural English example sentence for every input item.',
            'Use the headword exactly as written, with the requested part of speech and Chinese meaning.',
            'Keep each sentence at A2 level, usually 5-12 words and never more than 15 words.',
            'Use familiar everyday contexts and correct articles, objects, prepositions, and punctuation.',
            'Do not begin with the generic templates "I can", "I can see", or "This is".',
            'Do not use story character names, direct speech, or quotation marks.',
            'A readingCandidate is only context: fix OCR errors and rewrite it when needed.',
            'When correctionRequired is present, fix every listed problem and write a different sentence.',
            'Return only the requested JSON object. Do not omit or add IDs.',
          ].join(' '),
        },
        { role: 'user', content: buildPrompt(items) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'ket_examples',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              examples: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    example: { type: 'string' },
                  },
                  required: ['id', 'example'],
                  additionalProperties: false,
                },
              },
            },
            required: ['examples'],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!response.ok) throw new Error(`LM Studio returned ${response.status}: ${await response.text()}`);
  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error(`LM Studio returned no message content: ${JSON.stringify(body).slice(0, 1000)}`);
  return JSON.parse(content).examples;
}

function parseArguments(argv) {
  const options = {
    start: 0,
    limit: Number.POSITIVE_INFINITY,
    batchSize: 24,
    concurrency: 1,
    apply: false,
    noCandidates: false,
    refreshStoryDerived: false,
    outputPath: defaultOutputPath,
    ids: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--start') options.start = Number(argv[++index]);
    else if (value === '--limit') options.limit = Number(argv[++index]);
    else if (value === '--batch-size') options.batchSize = Number(argv[++index]);
    else if (value === '--concurrency') options.concurrency = Number(argv[++index]);
    else if (value === '--output') options.outputPath = path.resolve(argv[++index]);
    else if (value === '--ids') options.ids = argv[++index].split(',').filter(Boolean);
    else if (value === '--apply') options.apply = true;
    else if (value === '--no-candidates') options.noCandidates = true;
    else if (value === '--refresh-story-derived') options.refreshStoryDerived = true;
  }
  return options;
}

async function readExistingOutput(outputPath) {
  try {
    return JSON.parse(await fs.readFile(outputPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { generatedAt: null, model, examples: [] };
    throw error;
  }
}

async function saveOutput(outputPath, examples) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), model, examples }, null, 2)}\n`);
}

export function isStoryDerivedExample(entry) {
  const storyNames = /\b(?:Kipper|Biff|Chip|Wilf|Wilma|Floppy|Nadim|Anneena|Mum|Dad|Gran|Mrs May|Midge)\b/i;
  const splitContraction = /\b(?:don|doesn|didn|isn|aren|wasn|weren|won|can|couldn|shouldn|wouldn|hasn|haven|hadn|mustn|needn|it|that|there|he|she|what|who|where|let|I) [ts]\b/i;
  const headwordIsStoryName = new Set(['ket_mum_n_br_eng', 'ket_dad_n']).has(entry.id);
  const usesFallbackTemplate = /^(?:I can(?:\s|$)|This is(?:\s|$))/i.test(entry.example);
  return Boolean(
    (entry.oxfordCandidate && entry.example.toLowerCase() === entry.oxfordCandidate.toLowerCase())
    || (!headwordIsStoryName && storyNames.test(entry.example))
    || splitContraction.test(entry.example)
    || /["“”]/.test(entry.example)
    || usesFallbackTemplate,
  );
}

async function generateValidatedBatch(words, books, reservedExamples, useCandidates) {
  const generatedEntries = [];
  const usedExamples = new Set(reservedExamples);
  let unresolved = [];

  for (const word of words) {
    const manualExample = word.studySense?.examples?.[0] ?? MANUAL_EXAMPLES[word.id];
    if (!manualExample) {
      unresolved.push({ word, candidate: useCandidates ? findOxfordCandidate(word, books) : null, correction: null });
      continue;
    }
    const validation = validateExample(word, manualExample);
    if (!validation.valid) throw new Error(`Invalid manual example for ${word.id}: ${validation.errors.join(', ')}`);
    usedExamples.add(validation.sentence.toLowerCase());
    generatedEntries.push({
      id: word.id,
      example: validation.sentence,
      oxfordCandidate: useCandidates ? findOxfordCandidate(word, books) : null,
    });
  }

  for (let attempt = 1; attempt <= 3 && unresolved.length > 0; attempt += 1) {
    const generated = await requestExamples(unresolved);
    const generatedById = new Map(generated.map((entry) => [entry.id, entry.example]));
    const retry = [];

    for (const item of unresolved) {
      const example = generatedById.get(item.word.id);
      const validation = validateExample(item.word, example);
      if (validation.valid && usedExamples.has(validation.sentence.toLowerCase())) {
        validation.valid = false;
        validation.errors.push('duplicate');
      }
      if (!validation.valid) {
        retry.push({
          ...item,
          correction: `${validation.errors.join(', ')}. Previous attempt: ${JSON.stringify(example)}`,
        });
        continue;
      }

      usedExamples.add(validation.sentence.toLowerCase());
      generatedEntries.push({
        id: item.word.id,
        example: validation.sentence,
        oxfordCandidate: item.candidate,
      });
    }

    unresolved = retry;
  }

  if (unresolved.length > 0) {
    throw new Error(`Failed after three attempts: ${unresolved.map((item) => `${item.word.id} (${item.correction})`).join('; ')}`);
  }
  return generatedEntries;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const payload = JSON.parse(await fs.readFile(vocabularyPath, 'utf8'));
  const books = await readOxfordBooks();
  const output = await readExistingOutput(options.outputPath);
  const examplesById = new Map(output.examples.map((entry) => [entry.id, entry]));
  if (options.refreshStoryDerived) {
    for (const entry of examplesById.values()) {
      if (isStoryDerivedExample(entry)) examplesById.delete(entry.id);
    }
  }
  const selectedWords = options.ids
    ? options.ids.map((id) => payload.words.find((word) => word.id === id)).filter(Boolean)
    : payload.words.slice(options.start, options.start + options.limit);
  const pendingWords = selectedWords.filter((word) => !examplesById.has(word.id));

  const batches = [];
  for (let offset = 0; offset < pendingWords.length; offset += options.batchSize) {
    batches.push(pendingWords.slice(offset, offset + options.batchSize));
  }
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += options.concurrency) {
    const batchGroup = batches.slice(batchIndex, batchIndex + options.concurrency);
    const reservedExamples = [...examplesById.values()].map((entry) => entry.example.toLowerCase());
    const generatedGroups = await Promise.all(
      batchGroup.map((words) => generateValidatedBatch(words, books, reservedExamples, !options.noCandidates)),
    );
    for (const generatedEntries of generatedGroups) {
      for (const entry of generatedEntries) {
        const duplicate = [...examplesById.values()].find((existing) => existing.example.toLowerCase() === entry.example.toLowerCase());
        if (duplicate) throw new Error(`Cross-batch duplicate: ${entry.example} (${duplicate.id}, ${entry.id})`);
        examplesById.set(entry.id, entry);
      }
    }
    await saveOutput(options.outputPath, [...examplesById.values()]);
    const processed = Math.min((batchIndex + batchGroup.length) * options.batchSize, pendingWords.length);
    console.log(`Generated ${processed}/${pendingWords.length}; total ${examplesById.size}.`);
  }

  if (options.apply) {
    const missing = payload.words.filter((word) => !examplesById.has(word.id));
    if (missing.length > 0) throw new Error(`Cannot apply: ${missing.length} words have no generated example.`);
    const invalid = payload.words.flatMap((word) => {
      const entry = examplesById.get(word.id);
      const validation = validateExample(word, entry.example);
      const errors = [...validation.errors];
      if (isStoryDerivedExample(entry)) errors.push('regeneration-required');
      return errors.length > 0 ? [{ id: word.id, errors }] : [];
    });
    if (invalid.length > 0) {
      throw new Error(`Cannot apply: ${invalid.length} invalid examples (${JSON.stringify(invalid.slice(0, 10))}).`);
    }
    const seenExamples = new Set();
    payload.words = payload.words.map((word) => {
      const example = examplesById.get(word.id).example;
      const normalized = example.toLowerCase();
      if (seenExamples.has(normalized)) throw new Error(`Duplicate example: ${example}`);
      seenExamples.add(normalized);
      return { ...word, examples: [example] };
    });
    await fs.writeFile(vocabularyPath, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`Applied ${payload.words.length} examples to ${vocabularyPath}.`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
