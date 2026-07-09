import type { WordRecord } from '../models/word';
import { getWordAtlasStyle } from '../services/word-atlas-service';
import { getWordImageUrl } from '../services/word-service';

interface WordImageProps {
  word: WordRecord;
  alt: string;
  className?: string;
  onError?: () => void;
}

const WORD_ATLAS_GRID = {
  columns: 3,
  rows: 3,
  cellSize: 512,
};

export function WordImage({ word, alt, className, onError }: WordImageProps) {
  if (!word.imageAtlas) {
    return (
      <img
        className={className}
        src={getWordImageUrl(word.imagePath)}
        alt={alt}
        onError={onError}
      />
    );
  }

  return (
    <span
      className={[className, 'word-image--atlas'].filter(Boolean).join(' ')}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      style={{
        ...getWordAtlasStyle(word.imageAtlas, WORD_ATLAS_GRID),
        backgroundImage: `url(${getWordImageUrl(word.imageAtlas.atlasPath)})`,
      }}
    />
  );
}
