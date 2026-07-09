export const ATLAS_COLUMNS = 3;
export const ATLAS_ROWS = 3;
export const CELL_SIZE = 512;

const ENTRIES_PER_ATLAS = ATLAS_COLUMNS * ATLAS_ROWS;

export function createWordAtlasPlan(words) {
  const wordsByCategory = new Map();

  for (const word of words) {
    const categoryWords = wordsByCategory.get(word.category) ?? [];
    categoryWords.push(word);
    wordsByCategory.set(word.category, categoryWords);
  }

  const atlases = [];
  const entries = [];

  [...wordsByCategory.entries()].forEach(([category, categoryWords], categoryIndex) => {
    for (let start = 0; start < categoryWords.length; start += ENTRIES_PER_ATLAS) {
      const atlasIndex = Math.floor(start / ENTRIES_PER_ATLAS);
      const atlasPath = [
        '/content/images/word-atlases',
        `category-${String(categoryIndex).padStart(3, '0')}`,
        `atlas-${String(atlasIndex).padStart(3, '0')}.webp`,
      ].join('/');
      const atlasEntries = categoryWords.slice(start, start + ENTRIES_PER_ATLAS).map((word, cellIndex) => {
        const row = Math.floor(cellIndex / ATLAS_COLUMNS);
        const column = cellIndex % ATLAS_COLUMNS;
        const entry = {
          id: word.id,
          imagePath: word.imagePath,
          atlasPath,
          row,
          column,
          x: column * CELL_SIZE,
          y: row * CELL_SIZE,
        };
        entries.push(entry);
        return entry;
      });

      atlases.push({
        atlasPath,
        category,
        categoryIndex,
        atlasIndex,
        entries: atlasEntries,
      });
    }
  });

  return { atlases, entries };
}
