export type EnglishInflection =
  | 'base'
  | 'third-person'
  | 'past'
  | 'past-participle'
  | 'present-participle'
  | 'plural';

interface IrregularVerb {
  past: string;
  pastParticiple?: string;
}

const IRREGULAR_VERBS: Record<string, IrregularVerb> = {
  be: { past: 'was', pastParticiple: 'been' },
  become: { past: 'became', pastParticiple: 'become' },
  begin: { past: 'began', pastParticiple: 'begun' },
  bite: { past: 'bit', pastParticiple: 'bitten' },
  blow: { past: 'blew', pastParticiple: 'blown' },
  break: { past: 'broke', pastParticiple: 'broken' },
  bring: { past: 'brought' },
  build: { past: 'built' },
  buy: { past: 'bought' },
  can: { past: 'could' },
  catch: { past: 'caught' },
  choose: { past: 'chose', pastParticiple: 'chosen' },
  come: { past: 'came', pastParticiple: 'come' },
  cost: { past: 'cost' },
  cut: { past: 'cut' },
  do: { past: 'did', pastParticiple: 'done' },
  draw: { past: 'drew', pastParticiple: 'drawn' },
  drink: { past: 'drank', pastParticiple: 'drunk' },
  drive: { past: 'drove', pastParticiple: 'driven' },
  eat: { past: 'ate', pastParticiple: 'eaten' },
  fall: { past: 'fell', pastParticiple: 'fallen' },
  feed: { past: 'fed' },
  feel: { past: 'felt' },
  fight: { past: 'fought' },
  find: { past: 'found' },
  fly: { past: 'flew', pastParticiple: 'flown' },
  forget: { past: 'forgot', pastParticiple: 'forgotten' },
  forgive: { past: 'forgave', pastParticiple: 'forgiven' },
  freeze: { past: 'froze', pastParticiple: 'frozen' },
  get: { past: 'got', pastParticiple: 'gotten' },
  give: { past: 'gave', pastParticiple: 'given' },
  go: { past: 'went', pastParticiple: 'gone' },
  grow: { past: 'grew', pastParticiple: 'grown' },
  have: { past: 'had' },
  hear: { past: 'heard' },
  hide: { past: 'hid', pastParticiple: 'hidden' },
  hit: { past: 'hit' },
  hold: { past: 'held' },
  hurt: { past: 'hurt' },
  keep: { past: 'kept' },
  know: { past: 'knew', pastParticiple: 'known' },
  lay: { past: 'laid' },
  lead: { past: 'led' },
  leave: { past: 'left' },
  lend: { past: 'lent' },
  let: { past: 'let' },
  lie: { past: 'lay', pastParticiple: 'lain' },
  lose: { past: 'lost' },
  make: { past: 'made' },
  mean: { past: 'meant' },
  meet: { past: 'met' },
  pay: { past: 'paid' },
  put: { past: 'put' },
  read: { past: 'read' },
  ride: { past: 'rode', pastParticiple: 'ridden' },
  ring: { past: 'rang', pastParticiple: 'rung' },
  rise: { past: 'rose', pastParticiple: 'risen' },
  run: { past: 'ran', pastParticiple: 'run' },
  say: { past: 'said' },
  see: { past: 'saw', pastParticiple: 'seen' },
  sell: { past: 'sold' },
  send: { past: 'sent' },
  set: { past: 'set' },
  shake: { past: 'shook', pastParticiple: 'shaken' },
  shine: { past: 'shone' },
  shoot: { past: 'shot' },
  show: { past: 'showed', pastParticiple: 'shown' },
  shut: { past: 'shut' },
  sing: { past: 'sang', pastParticiple: 'sung' },
  sink: { past: 'sank', pastParticiple: 'sunk' },
  sit: { past: 'sat' },
  sleep: { past: 'slept' },
  speak: { past: 'spoke', pastParticiple: 'spoken' },
  spend: { past: 'spent' },
  stand: { past: 'stood' },
  steal: { past: 'stole', pastParticiple: 'stolen' },
  stick: { past: 'stuck' },
  swim: { past: 'swam', pastParticiple: 'swum' },
  take: { past: 'took', pastParticiple: 'taken' },
  teach: { past: 'taught' },
  tear: { past: 'tore', pastParticiple: 'torn' },
  tell: { past: 'told' },
  think: { past: 'thought' },
  throw: { past: 'threw', pastParticiple: 'thrown' },
  understand: { past: 'understood' },
  wake: { past: 'woke', pastParticiple: 'woken' },
  wear: { past: 'wore', pastParticiple: 'worn' },
  win: { past: 'won' },
  write: { past: 'wrote', pastParticiple: 'written' },
};

const IRREGULAR_PLURALS: Record<string, string> = {
  child: 'children',
  foot: 'feet',
  man: 'men',
  mouse: 'mice',
  person: 'people',
  tooth: 'teeth',
  woman: 'women',
};

const DOUBLE_FINAL_CONSONANT = new Set([
  'admit',
  'begin',
  'chat',
  'control',
  'drop',
  'fit',
  'get',
  'jog',
  'occur',
  'plan',
  'prefer',
  'run',
  'shop',
  'sit',
  'stop',
  'swim',
  'travel',
]);

function isCvcWord(word: string): boolean {
  return (
    /^[^aeiou][aeiou][^aeiouwxy]$/i.test(word)
    || DOUBLE_FINAL_CONSONANT.has(word.toLowerCase())
  );
}

function thirdPerson(word: string): string {
  if (word === 'be') return 'is';
  if (word === 'have') return 'has';
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(?:s|x|z|ch|sh|o)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

function regularPast(word: string): string {
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ied`;
  if (word.endsWith('e')) return `${word}d`;
  if (isCvcWord(word)) return `${word}${word.at(-1)}ed`;
  return `${word}ed`;
}

function presentParticiple(word: string): string {
  if (/ie$/i.test(word)) return `${word.slice(0, -2)}ying`;
  if (/e$/i.test(word) && !/(?:ee|ye)$/i.test(word)) return `${word.slice(0, -1)}ing`;
  if (isCvcWord(word)) return `${word}${word.at(-1)}ing`;
  return `${word}ing`;
}

function plural(word: string): string {
  const irregular = IRREGULAR_PLURALS[word.toLowerCase()];
  if (irregular) return irregular;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(?:s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/fe$/i.test(word)) return `${word.slice(0, -2)}ves`;
  if (/f$/i.test(word)) return `${word.slice(0, -1)}ves`;
  return `${word}s`;
}

function getVerbForms(word: string): Record<EnglishInflection, string> {
  const irregular = IRREGULAR_VERBS[word.toLowerCase()];
  const past = irregular?.past ?? regularPast(word);
  return {
    base: word,
    'third-person': thirdPerson(word),
    past,
    'past-participle': irregular?.pastParticiple ?? past,
    'present-participle': presentParticiple(word),
    plural: plural(word),
  };
}

export function getTokenForms(token: string): string[] {
  const forms = getVerbForms(token);
  const extras = token.toLowerCase() === 'be' ? ['am', 'are', 'were', 'being'] : [];
  return [...new Set([...Object.values(forms), ...extras])];
}

function getWords(value: string): string[] {
  return value.match(/[A-Za-z]+(?:['’][A-Za-z]+)?/g) ?? [];
}

export function detectEnglishInflection(
  headword: string,
  matchedText: string,
  partOfSpeech: string,
): EnglishInflection {
  const headwordWords = getWords(headword);
  const matchedWords = getWords(matchedText);
  const base = headwordWords[0]?.toLowerCase();
  const matched = matchedWords[0]?.toLowerCase();
  if (!base || !matched || base === matched) return 'base';

  if (partOfSpeech.includes('v')) {
    if (base === 'be') {
      if (matched === 'is') return 'third-person';
      if (matched === 'was' || matched === 'were') return 'past';
      if (matched === 'been') return 'past-participle';
      if (matched === 'being') return 'present-participle';
      return 'base';
    }
    const forms = getVerbForms(base);
    const ordered: EnglishInflection[] = [
      'third-person',
      'past',
      'past-participle',
      'present-participle',
    ];
    return ordered.find((form) => forms[form].toLowerCase() === matched) ?? 'base';
  }

  const baseLast = headwordWords.at(-1)?.toLowerCase();
  const matchedLast = matchedWords.at(-1)?.toLowerCase();
  return baseLast && matchedLast && plural(baseLast).toLowerCase() === matchedLast
    ? 'plural'
    : 'base';
}

function applyCase(value: string, capitalize: boolean): string {
  if (!capitalize || !value) return value;
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

export function inflectEnglishOption(
  headword: string,
  inflection: EnglishInflection,
  capitalize: boolean = false,
): string {
  if (inflection === 'base') return applyCase(headword, capitalize);

  const words = headword.split(/\s+/);
  const index = inflection === 'plural' ? words.length - 1 : 0;
  const token = words[index];
  if (!token || !/^[A-Za-z]+$/u.test(token)) return applyCase(headword, capitalize);

  if (inflection === 'plural') {
    words[index] = plural(token);
  } else {
    words[index] = getVerbForms(token)[inflection];
  }
  return applyCase(words.join(' '), capitalize);
}
