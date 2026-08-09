import type { RelatedOxfordImage } from '../models/word';
import { getWordAtlasStyle } from '../services/word-atlas-service';
import { getWordImageUrl } from '../services/word-service';

interface OxfordPageImageProps {
  media: RelatedOxfordImage;
  alt: string;
  className?: string;
}

const OXFORD_ATLAS_GRID = { columns: 3, rows: 3, cellSize: 512 };

export function OxfordPageImage({ media, alt, className }: OxfordPageImageProps) {
  if (media.imagePath) {
    return <img className={className} src={getWordImageUrl(media.imagePath)} alt={alt} />;
  }
  if (media.atlasPath && Number.isInteger(media.row) && Number.isInteger(media.column)) {
    return (
      <span
        className={[className, 'word-image--atlas'].filter(Boolean).join(' ')}
        role="img"
        aria-label={alt}
        style={{
          ...getWordAtlasStyle({
            atlasPath: media.atlasPath,
            row: media.row!,
            column: media.column!,
          }, OXFORD_ATLAS_GRID),
          backgroundImage: `url(${getWordImageUrl(media.atlasPath)})`,
        }}
      />
    );
  }
  return null;
}
