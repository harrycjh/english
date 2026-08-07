import {
  buildRedRocketWordForms,
} from './red-rocket-media.mjs';

export const RAZ_ATLAS_COLUMNS = 3;
export const RAZ_ATLAS_ROWS = 3;
export const RAZ_CELL_SIZE = 512;

const ENTRIES_PER_ATLAS = RAZ_ATLAS_COLUMNS * RAZ_ATLAS_ROWS;
const sentenceSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
const BULLET_MARKER_RE = /^[\u2022\u25aa\u25cf\u2023]\s*/;
const SENTENCE_END_RE = /[.!?]["”’']?$/;
const ABBREVIATION_RE = /\b(?:Mr|Mrs|Ms|Dr|Prof|St|vs|No)\.|(?:\b[A-Z]\.){2,}|\b[A-Z]\./g;
const ABBREVIATION_PERIOD_SENTINEL = '\ue000';
const HEADING_LOWERCASE_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'with',
]);

const BRITISH_TO_AMERICAN = new Map(Object.entries({
  aeroplane: 'airplane',
  aluminium: 'aluminum',
  analyse: 'analyze',
  apologise: 'apologize',
  behaviour: 'behavior',
  catalogue: 'catalog',
  centre: 'center',
  centimetre: 'centimeter',
  colour: 'color',
  favourite: 'favorite',
  flavour: 'flavor',
  grey: 'gray',
  harbour: 'harbor',
  jewellery: 'jewelry',
  kilometre: 'kilometer',
  litre: 'liter',
  metre: 'meter',
  mom: 'mum',
  mum: 'mom',
  neighbour: 'neighbor',
  organise: 'organize',
  programme: 'program',
  recognise: 'recognize',
  theatre: 'theater',
  travelled: 'traveled',
  travelling: 'traveling',
}));

const IRREGULAR_NOUN_PLURALS = new Map(Object.entries({
  child: ['children'],
  foot: ['feet'],
  goose: ['geese'],
  man: ['men'],
  mouse: ['mice'],
  person: ['people'],
  tooth: ['teeth'],
  woman: ['women'],
}));

const EXTRA_IRREGULAR_VERBS = new Map(Object.entries({
  become: ['became', 'become'],
  build: ['built'],
  burn: ['burned', 'burnt'],
  cost: ['cost'],
  cut: ['cut'],
  draw: ['drew', 'drawn'],
  feed: ['fed'],
  fight: ['fought'],
  hang: ['hung'],
  hide: ['hid', 'hidden'],
  hit: ['hit'],
  hurt: ['hurt'],
  lead: ['led'],
  put: ['put'],
  shake: ['shook', 'shaken'],
  show: ['showed', 'shown'],
  shut: ['shut'],
  smell: ['smelled', 'smelt'],
  spell: ['spelled', 'spelt'],
  steal: ['stole', 'stolen'],
  stick: ['stuck'],
  sweep: ['swept'],
}));

const TRAILING_PARENTHESES_EXPANSIONS = new Map(Object.entries({
  laptop: ['laptop', 'laptop computer'],
  listen: ['listen', 'listen to'],
  'make sure': ['make sure', 'make sure that'],
  mobile: ['mobile', 'mobile phone'],
  'of course': ['of course', 'of course not'],
  pc: ['pc', 'personal computer'],
  railway: ['railway', 'railway station'],
  television: ['television', 'tv'],
  'as well': ['as well', 'as well as'],
}));

const SLASH_EXPANSIONS = new Map(Object.entries({
  'give somebody a call/ring': ['give somebody a call', 'give somebody a ring'],
  'poor thing/you': ['poor thing', 'poor you'],
  'v/versus': ['versus'],
}));

const EXACT_ONLY_TERMS = new Set([
  'for sale',
]);

const SEMANTIC_CONTEXT = new Map([
  ['ad', /\b(?:advert|advertisement|advertising|commercial|poster|newspaper|magazine|online|website|sell|sale)\b/i],
  ['follow (social media)', /\b(?:social media|online|account|post|website|web|internet)\b/i],
  ['link (technology)', /\b(?:web|website|internet|online|computer|click|page)\b/i],
  ['mobile (phone)', /\b(?:mobile phone|cell phone|smartphone)\b/i],
  ['natural (not artificial)', /\b(?:artificial|man-made|material|product|ingredient)\b/i],
  ['perform (entertain)', /\b(?:stage|show|audience|theater|theatre|dance|music|concert|actor|actress)\b/i],
  ['performance (entertainment)', /\b(?:stage|show|audience|theater|theatre|dance|music|concert|actor|actress)\b/i],
  ['pound (£)', /\b(?:currency|money|coin|coins|price|cost|pay|paid|british|egyptian)\b/i],
  ['share (digitally)', /\b(?:digital|online|computer|internet|website|photo|photos|file|files|post)\b/i],
  ['smart (stylish)', /\b(?:clothes|clothing|dress|shirt|suit|wear|wore|wearing|outfit|fashion)\b/i],
  ['design (planning)', /\b(?:plan|plans|planned|planning)\b/i],
  ['design (process)', /\b(?:process|develop|create|build|test)\b/i],
  ['design (drawing)', /\b(?:draw|drawing|sketch|diagram)\b/i],
]);

const WORD_CONTEXT = new Map([
  ['ket_bank_n', /\b(?:bank account|at the bank|to the bank|in the bank|bank manager|bank clerk|bank loan|bank lends)\b/i],
  ['ket_bill_n', /\b(?:pay|paid|price|cost|restaurant|electricity|gas|phone|water|total|amount)\b/i],
  ['ket_fit_adj', /\b(?:get|getting|got|keep|keeping|kept|stay|staying|feel|feeling|be|am|is|are|was|were|become|becoming) fit\b|\bfit (?:and|enough|person|people|body|athlete)\b/i],
  ['ket_flat_n', /\b(?:live|lives|lived|living|stay|stays|stayed|staying)\s+(?:together\s+)?(?:in|at)\s+(?:a|an|my|your|his|her|our|their)\s+flat\b|\b(?:rent|rents|rented|renting|buy|buys|bought|own|owns|owned|owning)\s+(?:a|an|the|my|your|his|her|our|their)\s+flat\b|\bflat\s+(?:is|means)\s+(?:a|an)\s+apartment\b|\bapartment\s+(?:called|known as)\s+(?:a|an)\s+flat\b/i],
  ['ket_form_n', /\b(?:a|an|the|this|that|my|your|his|her|our|their)\s+form\b|\bforms?\s+of\b|\b(?:fill(?:ed|ing)?|complete[sd]?|sign(?:ed|ing)?|submit(?:ted|ting)?|application|registration)\b.{0,30}\bform\b/i],
  ['ket_hard_adj_adv', /^(?![\s\S]*\bhard [cg]\b)[\s\S]*\bhard\b/i],
  ['ket_mean_v', /\b(?:what|which|this|that|it|word|words|sign|name)\b.{0,60}\bmean(?:s|t|ing)?\b|\bmean(?:s|t|ing)?\s+(?:that|to)\b/i],
  ['ket_notice_n', /\b(?:a|an|the|this|that|my|your|his|her|our|their)\s+notice\b|\bnotice\s+(?:board|says|reads)\b|\b(?:read|reads|saw|see|posted|put up)\b.{0,24}\bnotice\b/i],
  ['ket_pop_n', /\b(?:pop music|pop song|pop singer|pop band|pop concert|pop album|pop chart|listen to pop)\b/i],
  ['ket_record_v', /\b(?:to|can|could|will|would|should|must|we|you|they|scientists|researchers)\s+record\b|\brecord(?:ed|ing)\b/i],
  ['ket_snowboard_n', /\b(?:a|an|the|this|that|my|your|his|her|our|their)\s+snowboard\b|\b(?:get|got|ride|rode|riding|use|used|using)\b.{0,24}\bsnowboard\b/i],
  ['ket_sound_v', /\bsound(?:s|ed|ing)?\s+(?:like|good|bad|loud|quiet|strange|different)\b|\b(?:alarm|bell|horn)\s+sound(?:s|ed)?\b/i],
  ['ket_visit_n', /\b(?:a|the|this|that|my|your|our|their|his|her|first|last|next) visit\b|\bvisit (?:to|from)\b/i],
]);

function replaceWords(term, replacements) {
  const words = term.split(' ');
  return words.map((word) => replacements.get(word) ?? word).join(' ');
}

function normalizeRazText(value = '') {
  return value
    .toLowerCase()
    .replace(/(^|[^a-z0-9])['’‘](?=[a-z])/g, '$1')
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9'-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandSlashAlternatives(english) {
  return SLASH_EXPANSIONS.get(english.toLowerCase())
    ?? english.split(/\s*\/\s*/).map((alternative) => alternative.trim());
}

function buildRazAuthoredTerms(english) {
  const terms = [];
  for (const alternative of expandSlashAlternatives(english)) {
    const inline = alternative.match(/^(.*?)([A-Za-z]+)\(([^()\s]+)\)([A-Za-z]*)(.*)$/);
    if (inline) {
      const [, prefix, before, optional, after, suffix] = inline;
      terms.push(`${prefix}${before}${after}${suffix}`);
      terms.push(`${prefix}${before}${optional}${after}${suffix}`);
      continue;
    }

    const trailing = alternative.match(/^(.*?)\s+\(([^()]*)\)\s*$/);
    if (trailing) {
      const base = normalizeRazText(trailing[1]);
      terms.push(...(TRAILING_PARENTHESES_EXPANSIONS.get(base) ?? [base]));
      continue;
    }
    terms.push(alternative);
  }
  return [...new Set(terms.map(normalizeRazText).filter(Boolean))];
}

export function buildRazSearchTerms(english) {
  const normalizedTerms = buildRazAuthoredTerms(english);
  const variants = new Set(normalizedTerms);
  for (const term of normalizedTerms) {
    variants.add(replaceWords(term, BRITISH_TO_AMERICAN));
  }
  return [...variants].filter(Boolean);
}

function countPhrase(text, phrase) {
  const haystack = ` ${text
    .replace(/([a-z])'s\b/gi, '$1')
    .replace(/([a-z])'(?=\s|$)/gi, '$1')} `;
  const needle = ` ${phrase} `;
  let count = 0;
  let offset = 0;
  while ((offset = haystack.indexOf(needle, offset)) !== -1) {
    count += 1;
    offset += needle.length;
  }
  return count;
}

function caseSensitiveForm(word, term, form) {
  if (form !== term) return null;
  const uppercaseTerms = new Set(
    [...word.english.matchAll(/\b[A-Z]{2,}\b/g)].map((match) => match[0].toLowerCase()),
  );
  if (uppercaseTerms.has(term)) return term.toUpperCase();
  if (['Mr', 'Mrs', 'Miss'].includes(word.english.trim())) return word.english.trim();
  if (['March', 'May'].includes(word.english.trim())) return word.english.trim();
  return null;
}

function countMonth(text, month) {
  const escaped = month.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `\\b(?:[Ii]n|[Uu]ntil|[Dd]uring|[Ee]very|[Ss]ince|[Bb]y|[Aa]fter|[Bb]efore|[Tt]hrough|[Tt]hroughout|[Ff]rom) ${escaped}\\b`
      + `|\\b${escaped} (?:is|was|comes|begins|ends|\\d{1,2})\\b`,
    'g',
  );
  return [...text.matchAll(pattern)].length;
}

function countPageOccurrences(page, word, term, form) {
  const context = WORD_CONTEXT.get(word.id) ?? SEMANTIC_CONTEXT.get(word.english.toLowerCase());
  if (context && !context.test(page.caseText)) return 0;
  const protectedForm = caseSensitiveForm(word, term, form);
  if (!protectedForm) return countPhrase(page.normalizedText, form);
  if (protectedForm === 'March' || protectedForm === 'May') {
    return countMonth(page.caseText, protectedForm);
  }
  return countPhrase(page.caseText, protectedForm);
}

function getPartOfSpeechKinds(partOfSpeech = '') {
  const normalized = partOfSpeech.toLowerCase();
  const kinds = [];
  if (/(^|[^a-z])(n|noun)([^a-z]|$)/.test(normalized)) kinds.push('n');
  if (/(^|[^a-z])(v|verb)([^a-z]|$)/.test(normalized)) kinds.push('v');
  return kinds;
}

export function buildRazWordForms(term, partOfSpeech = '') {
  if (!term || term.length <= 2 || EXACT_ONLY_TERMS.has(term)) return [term];
  const kinds = getPartOfSpeechKinds(partOfSpeech);
  if (term.includes(' ')) {
    const words = term.split(' ');
    const forms = new Set([term]);
    if (kinds.includes('v')) {
      for (const form of buildRazWordForms(words[0], 'v')) {
        forms.add([form, ...words.slice(1)].join(' '));
      }
    }
    if (kinds.includes('n')) {
      for (const form of buildRazWordForms(words.at(-1), 'n')) {
        forms.add([...words.slice(0, -1), form].join(' '));
      }
    }
    return [...forms];
  }
  const forms = new Set([term]);

  for (const kind of kinds) {
    for (const form of buildRedRocketWordForms(term, kind)) {
      forms.add(form);
    }
  }
  if (kinds.includes('n')) {
    for (const plural of IRREGULAR_NOUN_PLURALS.get(term) ?? []) {
      forms.add(plural);
    }
  }
  if (kinds.includes('v')) {
    for (const irregular of EXTRA_IRREGULAR_VERBS.get(term) ?? []) {
      forms.add(irregular);
    }
  }
  return [...forms];
}

function matchPriority(matchKind) {
  if (matchKind === 'exact') return 3;
  if (matchKind === 'spelling') return 2;
  return 1;
}

function compareSamePageMatches(left, right) {
  return matchPriority(right.matchKind) - matchPriority(left.matchKind)
    || right.matchedTerm.split(' ').length - left.matchedTerm.split(' ').length
    || right.occurrences - left.occurrences
    || left.matchedForm.localeCompare(right.matchedForm);
}

function looksLikeHeadingLine(line) {
  if (SENTENCE_END_RE.test(line)) return false;
  const words = line.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
  return words.length >= 2
    && words.length <= 10
    && words.every((word) => (
      HEADING_LOWERCASE_WORDS.has(word.toLowerCase()) || /^[A-Z]/.test(word)
    ));
}

function buildRazSentenceCandidates(pageText) {
  const groups = [];
  let current = [];
  let isBullet = false;
  const flush = () => {
    const text = current.join(' ').replace(/\s+/g, ' ').trim();
    if (text) groups.push({ text, isBullet });
    current = [];
  };

  for (const rawLine of String(pageText ?? '').split(/\r?\n/)) {
    const line = rawLine.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    if (BULLET_MARKER_RE.test(line)) {
      flush();
      current = [line.replace(BULLET_MARKER_RE, '')];
      isBullet = true;
      continue;
    }
    if (
      !isBullet
      && current.length === 1
      && looksLikeHeadingLine(current[0])
      && /^[A-Z]/.test(line)
    ) {
      flush();
      current = [line];
      continue;
    }
    if (isBullet && /^[A-Z]/.test(line)) {
      flush();
      current = [line];
      isBullet = false;
      continue;
    }
    current.push(line);
  }
  flush();

  return groups.flatMap(({ text, isBullet: bullet }) => {
    let candidateText = text.replace(/([“‘])\s+/g, '$1');
    if (bullet && /^[a-z]/.test(candidateText)) {
      const sentenceStart = candidateText.search(/\b[A-Z][a-z]+(?=\s)/);
      const prefixWords = candidateText.slice(0, sentenceStart).match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
      if (sentenceStart > 0 && prefixWords.length <= 3) {
        candidateText = candidateText.slice(sentenceStart);
      }
    }
    const protectedText = candidateText.replace(
      ABBREVIATION_RE,
      (value) => value.replaceAll('.', ABBREVIATION_PERIOD_SENTINEL),
    );
    const sentences = [];
    for (const { segment } of sentenceSegmenter.segment(protectedText)) {
      const sentence = segment.replaceAll(ABBREVIATION_PERIOD_SENTINEL, '.').trim();
      const previous = sentences.at(-1);
      if (previous && /^[a-z]/.test(sentence)) {
        sentences[sentences.length - 1] = `${previous} ${sentence}`;
      } else {
        sentences.push(sentence);
      }
    }
    return sentences;
  });
}

function pickRazSentence(page, word, term, form) {
  for (const sentence of buildRazSentenceCandidates(page.text)) {
    const wordCount = sentence.match(/[A-Za-z][A-Za-z'’-]*/g)?.length ?? 0;
    if (
      wordCount >= 3
      && sentence.length <= 320
      && SENTENCE_END_RE.test(sentence)
      && countPageOccurrences({
        ...page,
        normalizedText: normalizeRazText(sentence),
        caseText: sentence
          .replace(/(^|[^A-Za-z0-9])['’‘](?=[A-Za-z])/g, '$1')
          .replace(/[’‘]/g, "'")
          .replace(/[^A-Za-z0-9'-]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      }, word, term, form) > 0
    ) {
      return sentence;
    }
  }
  return null;
}

export function matchWordToRaz(word, books) {
  const baseTerms = buildRazAuthoredTerms(word.english);
  const baseTermSet = new Set(baseTerms);
  const terms = buildRazSearchTerms(word.english);
  if (word.english.toLowerCase() === 'train (transitive and intransitive)') {
    terms.splice(0, terms.length, 'train');
  }

  for (const book of books) {
    for (const page of book.pages) {
      if (page.kind !== 'story' || !page.normalizedText) continue;
      const pageMatches = [];
      for (const term of terms) {
        for (const [formIndex, form] of buildRazWordForms(term, word.partOfSpeech).entries()) {
          if (formIndex > 0 && caseSensitiveForm(word, term, term)) continue;
          if (
            word.english.toLowerCase() === 'train (transitive and intransitive)'
            && !['trained', 'training'].includes(form)
          ) continue;
          const occurrences = countPageOccurrences(page, word, term, form);
          if (occurrences === 0) continue;
          pageMatches.push({
            matchedTerm: term,
            matchedForm: form,
            occurrences,
            matchKind: formIndex > 0
              ? 'inflection'
              : baseTermSet.has(term)
                ? 'exact'
                : 'spelling',
          });
        }
      }
      if (pageMatches.length === 0) continue;
      pageMatches.sort(compareSamePageMatches);
      const best = pageMatches[0];
      return {
        wordId: word.id,
        english: word.english,
        page,
        matchKind: best.matchKind,
        matchedTerm: best.matchedTerm,
        matchedForm: best.matchedForm,
        occurrences: best.occurrences,
        sentence: pickRazSentence(page, word, best.matchedTerm, best.matchedForm),
      };
    }
  }
  return null;
}

export function matchWordsToRaz(words, books) {
  return words.map((word) => matchWordToRaz(word, books)).filter(Boolean);
}

export function getRazPageKey(page) {
  return `${page.bookId}|${page.pdfIndex}`;
}

export function createRazAtlasPlan(matches) {
  const pagesByKey = new Map();
  for (const match of matches) {
    pagesByKey.set(getRazPageKey(match.page), match.page);
  }
  const pages = [...pagesByKey.values()].sort((left, right) => (
    left.order - right.order || left.pdfIndex - right.pdfIndex
  ));
  const atlasEntriesByPageKey = new Map();
  const atlases = [];

  for (let start = 0; start < pages.length; start += ENTRIES_PER_ATLAS) {
    const atlasIndex = Math.floor(start / ENTRIES_PER_ATLAS);
    const atlasPath = `/content/images/raz-atlases/atlas-${String(atlasIndex).padStart(3, '0')}.webp`;
    const entries = pages.slice(start, start + ENTRIES_PER_ATLAS).map((page, cellIndex) => {
      const row = Math.floor(cellIndex / RAZ_ATLAS_COLUMNS);
      const column = cellIndex % RAZ_ATLAS_COLUMNS;
      const entry = { page, atlasPath, row, column };
      atlasEntriesByPageKey.set(getRazPageKey(page), entry);
      return entry;
    });
    atlases.push({ atlasIndex, atlasPath, entries });
  }

  return { atlases, atlasEntriesByPageKey, pages };
}

function getManifestRazPageKey(raz) {
  return `${raz.bookId}|${raz.page}`;
}

function getAtlasLocation(atlasPath, row, column) {
  return { atlasPath, row, column };
}

export function findRazAtlasPlanChanges(manifest, atlasPlan) {
  const previousByPage = new Map();
  for (const entry of manifest.entries ?? []) {
    const raz = entry.relatedMedia?.raz;
    if (!raz?.bookId || !Number.isInteger(raz.page)) continue;
    previousByPage.set(
      getManifestRazPageKey(raz),
      getAtlasLocation(raz.atlasPath, raz.row, raz.column),
    );
  }

  const nextByPage = new Map();
  for (const atlas of atlasPlan.atlases) {
    for (const entry of atlas.entries) {
      nextByPage.set(
        getManifestRazPageKey(entry.page),
        getAtlasLocation(atlas.atlasPath, entry.row, entry.column),
      );
    }
  }

  const changes = [];
  for (const pageKey of new Set([...previousByPage.keys(), ...nextByPage.keys()])) {
    const previous = previousByPage.get(pageKey) ?? null;
    const next = nextByPage.get(pageKey) ?? null;
    if (
      previous?.atlasPath === next?.atlasPath
      && previous?.row === next?.row
      && previous?.column === next?.column
    ) continue;
    changes.push({ pageKey, previous, next });
  }
  return changes;
}

export function mergeRazMediaManifest(manifest, words, matches, atlasPlan, generatedAt) {
  const entriesByWordId = new Map((manifest.entries ?? []).map((entry) => [entry.wordId, {
    ...entry,
    relatedMedia: { ...(entry.relatedMedia ?? {}) },
  }]));
  const existingRazByWordId = new Map(
    [...entriesByWordId].map(([wordId, entry]) => [wordId, entry.relatedMedia.raz]),
  );
  for (const entry of entriesByWordId.values()) {
    delete entry.relatedMedia.raz;
  }

  for (const match of matches) {
    const atlas = atlasPlan.atlasEntriesByPageKey.get(getRazPageKey(match.page));
    if (!atlas) throw new Error(`Missing RAZ atlas entry for ${match.wordId}`);
    const entry = entriesByWordId.get(match.wordId) ?? { wordId: match.wordId, relatedMedia: {} };
    entry.relatedMedia.raz = {
      atlasPath: atlas.atlasPath,
      row: atlas.row,
      column: atlas.column,
      label: `Level ${match.page.level}, ${match.page.bookId} ${match.page.title}, Page ${match.page.page}`,
      bookId: match.page.bookId,
      level: match.page.level,
      sequence: match.page.sequence,
      title: match.page.title,
      page: match.page.page,
      matchKind: match.matchKind,
      matchedTerm: match.matchedTerm,
      matchedForm: match.matchedForm,
      ...(match.sentence ? { sentence: match.sentence } : {}),
    };
    const existingRaz = existingRazByWordId.get(match.wordId);
    if (
      match.sentence
      && existingRaz?.sentence === match.sentence
      && existingRaz.sentenceTranslation
    ) {
      entry.relatedMedia.raz.sentenceTranslation = existingRaz.sentenceTranslation;
    }
    entriesByWordId.set(match.wordId, entry);
  }

  const wordOrder = new Map(words.map((word, index) => [word.id, index]));
  const entries = [...entriesByWordId.values()]
    .filter((entry) => Object.keys(entry.relatedMedia).length > 0)
    .sort((left, right) => (
      (wordOrder.get(left.wordId) ?? Infinity) - (wordOrder.get(right.wordId) ?? Infinity)
    ));
  const withOxford = entries.filter((entry) => entry.relatedMedia.oxford).length;
  const withLifePhoto = entries.filter((entry) => entry.relatedMedia.lifePhoto).length;
  const withRedRocket = entries.filter((entry) => entry.relatedMedia.redRocket).length;
  const withRazSentence = entries.filter((entry) => entry.relatedMedia.raz?.sentence).length;
  const withRazSentenceTranslation = entries.filter(
    (entry) => entry.relatedMedia.raz?.sentenceTranslation,
  ).length;

  return {
    ...manifest,
    schemaVersion: 3,
    generatedAt,
    razAtlasGrid: {
      columns: RAZ_ATLAS_COLUMNS,
      rows: RAZ_ATLAS_ROWS,
      cellSize: RAZ_CELL_SIZE,
    },
    stats: {
      ...(manifest.stats ?? {}),
      totalWords: words.length,
      entries: entries.length,
      withOxford,
      withLifePhoto,
      withRedRocket,
      withRaz: matches.length,
      withRazSentence,
      withRazSentenceTranslation,
      uniqueRazImages: atlasPlan.pages.length,
      razAtlases: atlasPlan.atlases.length,
    },
    entries,
  };
}

export function normalizeRazBook(book, order) {
  const pages = (book.pages ?? [])
    .filter((page) => page.kind === 'story' && Number.isInteger(page.page))
    .map((page) => ({
      bookId: book.id,
      level: book.level,
      sequence: book.sequence,
      title: book.title,
      sourceFile: book.file,
      pdfIndex: page.pdfIndex,
      page: page.page,
      kind: page.kind,
      order,
      normalizedText: normalizeRazText(page.text ?? ''),
      text: page.text ?? '',
      caseText: (page.text ?? '')
        .replace(/(^|[^A-Za-z0-9])['’‘](?=[A-Za-z])/g, '$1')
        .replace(/[’‘]/g, "'")
        .replace(/[^A-Za-z0-9'-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    }));
  return {
    id: book.id,
    level: book.level,
    sequence: book.sequence,
    title: book.title,
    order,
    pages,
  };
}
