export type SpellingInputMethod = 'keyboard' | 'handwriting';

export const SPELLING_INPUT_METHOD_STORAGE_KEY = 'vocab-rabbit:spelling-input-method';

interface StorageReader {
  getItem(key: string): string | null;
}

interface StorageWriter {
  setItem(key: string, value: string): void;
}

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSpellingInputMethod(
  storage: StorageReader | null = getBrowserStorage(),
): SpellingInputMethod {
  try {
    return storage?.getItem(SPELLING_INPUT_METHOD_STORAGE_KEY) === 'handwriting'
      ? 'handwriting'
      : 'keyboard';
  } catch {
    return 'keyboard';
  }
}

export function saveSpellingInputMethod(
  method: SpellingInputMethod,
  storage: StorageWriter | null = getBrowserStorage(),
): void {
  try {
    storage?.setItem(SPELLING_INPUT_METHOD_STORAGE_KEY, method);
  } catch {
    // A blocked localStorage should not prevent spelling practice.
  }
}
