export const RED_ROCKET_ATLAS_COLUMNS = 3;
export const RED_ROCKET_ATLAS_ROWS = 3;
export const RED_ROCKET_CELL_SIZE = 512;

const ENTRIES_PER_ATLAS = RED_ROCKET_ATLAS_COLUMNS * RED_ROCKET_ATLAS_ROWS;
const LEVEL_ORDER = [
  'Pre-Reading Level',
  'Emergent Level',
  'Early Level 1',
  'Early Level 2',
  'Early Level 3',
  'Early Level 4',
];
const PART_OF_SPEECH_MARKERS = new Set([
  'adj', 'adjective', 'adv', 'adverb', 'conj', 'conjunction', 'det', 'determiner',
  'n', 'noun', 'prep', 'preposition', 'pron', 'pronoun', 'v', 'verb',
]);

const IRREGULAR_FORMS = {
  be: ['am', 'is', 'are', 'was', 'were', 'been', 'being'],
  begin: ['begins', 'began', 'begun', 'beginning'],
  break: ['breaks', 'broke', 'broken', 'breaking'],
  bring: ['brings', 'brought', 'bringing'],
  buy: ['buys', 'bought', 'buying'],
  catch: ['catches', 'caught', 'catching'],
  choose: ['chooses', 'chose', 'chosen', 'choosing'],
  come: ['comes', 'came', 'coming'],
  do: ['does', 'did', 'done', 'doing'],
  drink: ['drinks', 'drank', 'drunk', 'drinking'],
  drive: ['drives', 'drove', 'driven', 'driving'],
  eat: ['eats', 'ate', 'eaten', 'eating'],
  fall: ['falls', 'fell', 'fallen', 'falling'],
  feel: ['feels', 'felt', 'feeling'],
  find: ['finds', 'found', 'finding'],
  fly: ['flies', 'flew', 'flown', 'flying'],
  forget: ['forgets', 'forgot', 'forgotten', 'forgetting'],
  get: ['gets', 'got', 'gotten', 'getting'],
  give: ['gives', 'gave', 'given', 'giving'],
  go: ['goes', 'went', 'gone', 'going'],
  grow: ['grows', 'grew', 'grown', 'growing'],
  have: ['has', 'had', 'having'],
  hear: ['hears', 'heard', 'hearing'],
  hold: ['holds', 'held', 'holding'],
  keep: ['keeps', 'kept', 'keeping'],
  know: ['knows', 'knew', 'known', 'knowing'],
  learn: ['learns', 'learnt', 'learned', 'learning'],
  leave: ['leaves', 'left', 'leaving'],
  lie: ['lies', 'lay', 'lain', 'lying'],
  lose: ['loses', 'lost', 'losing'],
  make: ['makes', 'made', 'making'],
  meet: ['meets', 'met', 'meeting'],
  pay: ['pays', 'paid', 'paying'],
  read: ['reads', 'reading'],
  ride: ['rides', 'rode', 'ridden', 'riding'],
  ring: ['rings', 'rang', 'rung', 'ringing'],
  run: ['runs', 'ran', 'running'],
  say: ['says', 'said', 'saying'],
  see: ['sees', 'saw', 'seen', 'seeing'],
  sell: ['sells', 'sold', 'selling'],
  send: ['sends', 'sent', 'sending'],
  sing: ['sings', 'sang', 'sung', 'singing'],
  sit: ['sits', 'sat', 'sitting'],
  sleep: ['sleeps', 'slept', 'sleeping'],
  speak: ['speaks', 'spoke', 'spoken', 'speaking'],
  spend: ['spends', 'spent', 'spending'],
  stand: ['stands', 'stood', 'standing'],
  swim: ['swims', 'swam', 'swum', 'swimming'],
  take: ['takes', 'took', 'taken', 'taking'],
  teach: ['teaches', 'taught', 'teaching'],
  tell: ['tells', 'told', 'telling'],
  think: ['thinks', 'thought', 'thinking'],
  throw: ['throws', 'threw', 'thrown', 'throwing'],
  understand: ['understands', 'understood', 'understanding'],
  wake: ['wakes', 'woke', 'woken', 'waking'],
  wear: ['wears', 'wore', 'worn', 'wearing'],
  win: ['wins', 'won', 'winning'],
  write: ['writes', 'wrote', 'written', 'writing'],
};

export function normalizeRedRocketText(value = '') {
  return value
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitAlternatives(value) {
  return value
    .split(/\s*\/\s*|\s*;\s*|\s*,\s*|\s+or\s+/i)
    .map(normalizeRedRocketText)
    .filter(Boolean);
}

export function buildRedRocketSearchTerms(english) {
  const parentheticalPattern = /\(([^)]*)\)/g;
  const parentheticals = [...english.matchAll(parentheticalPattern)];
  const variants = new Set(parentheticals.length > 0 ? [] : [english]);

  if (parentheticals.length > 0) {
    variants.add(english.replace(parentheticalPattern, ''));
    variants.add(english.replace(/[()]/g, ''));

    for (const match of parentheticals) {
      const content = normalizeRedRocketText(match[1]);
      if (content.length > 1 && content !== 'the' && !PART_OF_SPEECH_MARKERS.has(content)) {
        variants.add(content);
      }
    }
  }

  return [...new Set([...variants].flatMap(splitAlternatives))];
}

export function buildRedRocketWordForms(term, partOfSpeech = '') {
  if (!term || term.includes(' ')) {
    return [term];
  }

  const normalizedPartOfSpeech = partOfSpeech.toLowerCase();
  const forms = new Set([term, ...(IRREGULAR_FORMS[term] ?? [])]);

  if (/^(n|noun)/.test(normalizedPartOfSpeech)) {
    if (term.endsWith('y') && !/[aeiou]y$/.test(term)) {
      forms.add(`${term.slice(0, -1)}ies`);
    } else if (/(s|x|z|ch|sh|o)$/.test(term)) {
      forms.add(`${term}es`);
    } else {
      forms.add(`${term}s`);
    }
  }

  if (/^(v|verb)/.test(normalizedPartOfSpeech)) {
    if (term.endsWith('y') && !/[aeiou]y$/.test(term)) {
      forms.add(`${term.slice(0, -1)}ies`);
      forms.add(`${term.slice(0, -1)}ied`);
    } else {
      forms.add(`${term}s`);
      forms.add(`${term}ed`);
    }
    if (/(s|x|z|ch|sh|o)$/.test(term)) {
      forms.add(`${term}es`);
    }
    if (term.endsWith('ie')) {
      forms.add(`${term.slice(0, -2)}ying`);
    } else if (term.endsWith('e')) {
      forms.add(`${term}d`);
      forms.add(`${term.slice(0, -1)}ing`);
    } else {
      forms.add(`${term}ing`);
    }
    if (term.length >= 3 && /[^aeiou][aeiou][^aeiouwxy]$/.test(term)) {
      forms.add(`${term}${term.at(-1)}ed`);
      forms.add(`${term}${term.at(-1)}ing`);
    }
  }

  if (/^(adj|adjective)/.test(normalizedPartOfSpeech)) {
    if (term.endsWith('y')) {
      forms.add(`${term.slice(0, -1)}ier`);
      forms.add(`${term.slice(0, -1)}iest`);
    } else if (term.endsWith('e')) {
      forms.add(`${term}r`);
      forms.add(`${term}st`);
    } else {
      forms.add(`${term}er`);
      forms.add(`${term}est`);
    }
  }

  return [...forms];
}

function countPhrase(text, phrase) {
  const haystack = ` ${text} `;
  const needle = ` ${phrase} `;
  let count = 0;
  let offset = 0;
  while ((offset = haystack.indexOf(needle, offset)) !== -1) {
    count += 1;
    offset += needle.length;
  }
  return count;
}

function getLevelIndex(level) {
  const index = LEVEL_ORDER.indexOf(level);
  return index === -1 ? LEVEL_ORDER.length : index;
}

function compareCandidates(left, right) {
  return right.matchRank - left.matchRank
    || Number(right.titleMatch) - Number(left.titleMatch)
    || right.termWordCount - left.termWordCount
    || right.occurrences - left.occurrences
    || left.page.tokenCount - right.page.tokenCount
    || getLevelIndex(left.page.level) - getLevelIndex(right.page.level)
    || left.page.title.localeCompare(right.page.title)
    || left.page.page - right.page.page;
}

function getConfidence(candidate, candidateCount) {
  if (candidate.kind === 'title') return 0.78;
  if (candidate.kind === 'inflection') return candidateCount <= 20 ? 0.82 : 0.72;
  if (candidate.termWordCount > 1) return 0.96;
  if (candidateCount <= 10) return 0.94;
  if (candidateCount <= 75) return 0.86;
  return 0.7;
}

export function matchWordToRedRocket(word, books) {
  const terms = buildRedRocketSearchTerms(word.english);
  const candidates = [];

  for (const book of books) {
    for (const page of book.pages) {
      if (!page.normalizedText) continue;
      for (const term of terms) {
        for (const [formIndex, form] of buildRedRocketWordForms(term, word.partOfSpeech).entries()) {
          const occurrences = countPhrase(page.normalizedText, form);
          if (occurrences === 0) continue;
          candidates.push({
            page,
            term,
            matchedForm: form,
            termWordCount: term.split(' ').length,
            occurrences,
            titleMatch: countPhrase(book.normalizedTitle, term) > 0,
            kind: formIndex === 0 ? 'exact' : 'inflection',
            matchRank: formIndex === 0 ? 3 : 2,
          });
        }
      }
    }
  }

  if (candidates.length === 0) {
    for (const book of books) {
      const titleTerm = terms.find((term) => countPhrase(book.normalizedTitle, term) > 0);
      if (!titleTerm) continue;
      const page = book.pages.find((item) => item.pageType === 'body') ?? book.pages[0];
      if (!page) continue;
      candidates.push({
        page,
        term: titleTerm,
        matchedForm: titleTerm,
        termWordCount: titleTerm.split(' ').length,
        occurrences: 1,
        titleMatch: true,
        kind: 'title',
        matchRank: 1,
      });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort(compareCandidates);
  const best = candidates[0];
  return {
    wordId: word.id,
    english: word.english,
    page: best.page,
    matchKind: best.kind,
    matchedTerm: best.term,
    matchedForm: best.matchedForm,
    confidence: getConfidence(best, candidates.length),
    candidateCount: candidates.length,
  };
}

export function matchWordsToRedRocket(words, books) {
  return words.map((word) => matchWordToRedRocket(word, books)).filter(Boolean);
}

function getRedRocketMatchIdentity(match) {
  const page = typeof match.page === 'object' ? match.page : match;
  const pageNumber = typeof match.page === 'object' ? match.page.page : match.page;
  return [match.wordId, page.level, page.title, pageNumber].join('|');
}

export function filterRejectedRedRocketMatches(matches, rejectedMatches = []) {
  const rejectedKeys = new Set(rejectedMatches.map(getRedRocketMatchIdentity));
  return matches.filter((match) => !rejectedKeys.has(getRedRocketMatchIdentity(match)));
}

export function getRedRocketPageKey(page) {
  return [page.level, page.sourceFile, page.page].join('|');
}

export function createRedRocketAtlasPlan(matches) {
  const pagesByKey = new Map();
  for (const match of matches) {
    pagesByKey.set(getRedRocketPageKey(match.page), match.page);
  }

  const pages = [...pagesByKey.values()].sort((left, right) => (
    getLevelIndex(left.level) - getLevelIndex(right.level)
    || left.title.localeCompare(right.title)
    || left.page - right.page
  ));
  const atlasEntriesByPageKey = new Map();
  const atlases = [];

  for (let start = 0; start < pages.length; start += ENTRIES_PER_ATLAS) {
    const atlasIndex = Math.floor(start / ENTRIES_PER_ATLAS);
    const atlasPath = `/content/images/red-rocket-atlases/atlas-${String(atlasIndex).padStart(3, '0')}.webp`;
    const entries = pages.slice(start, start + ENTRIES_PER_ATLAS).map((page, cellIndex) => {
      const row = Math.floor(cellIndex / RED_ROCKET_ATLAS_COLUMNS);
      const column = cellIndex % RED_ROCKET_ATLAS_COLUMNS;
      const entry = { page, atlasPath, row, column };
      atlasEntriesByPageKey.set(getRedRocketPageKey(page), entry);
      return entry;
    });
    atlases.push({ atlasIndex, atlasPath, entries });
  }

  return { atlases, atlasEntriesByPageKey, pages };
}

export function mergeRedRocketMediaManifest(manifest, words, matches, atlasPlan, generatedAt) {
  const entriesByWordId = new Map((manifest.entries ?? []).map((entry) => [entry.wordId, {
    ...entry,
    relatedMedia: { ...(entry.relatedMedia ?? {}) },
  }]));
  for (const entry of entriesByWordId.values()) {
    delete entry.relatedMedia.redRocket;
  }

  for (const match of matches) {
    const atlas = atlasPlan.atlasEntriesByPageKey.get(getRedRocketPageKey(match.page));
    if (!atlas) throw new Error(`Missing Red Rocket atlas entry for ${match.wordId}`);
    const entry = entriesByWordId.get(match.wordId) ?? { wordId: match.wordId, relatedMedia: {} };
    entry.relatedMedia.redRocket = {
      atlasPath: atlas.atlasPath,
      row: atlas.row,
      column: atlas.column,
      label: `${match.page.level}, ${match.page.title}, Page ${match.page.page}`,
      level: match.page.level,
      title: match.page.title,
      page: match.page.page,
      matchKind: match.matchKind,
      matchedTerm: match.matchedTerm,
      confidence: match.confidence,
    };
    entriesByWordId.set(match.wordId, entry);
  }

  const wordOrder = new Map(words.map((word, index) => [word.id, index]));
  const entries = [...entriesByWordId.values()]
    .filter((entry) => Object.keys(entry.relatedMedia).length > 0)
    .sort((left, right) => (wordOrder.get(left.wordId) ?? Infinity) - (wordOrder.get(right.wordId) ?? Infinity));
  const withOxford = entries.filter((entry) => entry.relatedMedia.oxford).length;
  const withLifePhoto = entries.filter((entry) => entry.relatedMedia.lifePhoto).length;

  return {
    ...manifest,
    schemaVersion: 2,
    generatedAt,
    redRocketAtlasGrid: {
      columns: RED_ROCKET_ATLAS_COLUMNS,
      rows: RED_ROCKET_ATLAS_ROWS,
      cellSize: RED_ROCKET_CELL_SIZE,
    },
    stats: {
      ...(manifest.stats ?? {}),
      totalWords: words.length,
      entries: entries.length,
      withOxford,
      withLifePhoto,
      withRedRocket: matches.length,
      uniqueRedRocketImages: atlasPlan.pages.length,
      redRocketAtlases: atlasPlan.atlases.length,
    },
    entries,
  };
}
