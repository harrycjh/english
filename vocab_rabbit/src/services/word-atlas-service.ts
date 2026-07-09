import type { CSSProperties } from 'react';
import type {
  WordImageAtlasEntry,
  WordImageAtlasManifest,
  WordPayload,
} from '../models/word';

export async function readWordAtlasManifestResponse(
  response: Response,
): Promise<WordImageAtlasManifest | null> {
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error('无法加载单词图集清单。');
  }

  const body = await response.text();
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('text/html') || body.trimStart().startsWith('<')) {
    return null;
  }

  return JSON.parse(body) as WordImageAtlasManifest;
}

export function mergeWordAtlasManifest(
  payload: WordPayload,
  manifest: WordImageAtlasManifest | null,
): WordPayload {
  const entriesByImagePath = new Map(
    (manifest?.entries ?? []).map(({ imagePath, ...entry }) => [imagePath, entry]),
  );

  return {
    ...payload,
    words: payload.words.map((word) => {
      const imageAtlas = entriesByImagePath.get(word.imagePath);
      return imageAtlas ? { ...word, imageAtlas } : word;
    }),
  };
}

export function getWordAtlasStyle(
  entry: WordImageAtlasEntry,
  grid: WordImageAtlasManifest['grid'],
): CSSProperties {
  const horizontalStep = grid.columns > 1 ? 100 / (grid.columns - 1) : 0;
  const verticalStep = grid.rows > 1 ? 100 / (grid.rows - 1) : 0;

  return {
    backgroundSize: `${grid.columns * 100}% ${grid.rows * 100}%`,
    backgroundPosition: `${entry.column * horizontalStep}% ${entry.row * verticalStep}%`,
    backgroundRepeat: 'no-repeat',
  };
}
