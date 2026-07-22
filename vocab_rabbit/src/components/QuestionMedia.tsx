import type { LocalLifePhotoView } from '../models/local-media';
import type { WordRecord } from '../models/word';
import type { QuestionImageStrategy } from '../services/question-service';
import { getWordAtlasStyle } from '../services/word-atlas-service';
import { getAssetUrl, getWordImageUrl } from '../services/word-service';
import { WordImage } from './WordImage';

interface QuestionMediaProps {
  word: WordRecord;
  strategy: QuestionImageStrategy;
  localLifePhoto?: LocalLifePhotoView;
  className?: string;
  alt: string;
}

export function QuestionMedia({ word, strategy, localLifePhoto, className, alt }: QuestionMediaProps) {
  if (strategy === 'related-priority') {
    if (localLifePhoto) {
      return <img className={className} src={localLifePhoto.objectUrl} alt={alt} />;
    }
    if (word.relatedMedia?.lifePhoto) {
      return <img className={className} src={getAssetUrl(word.relatedMedia.lifePhoto.imagePath)} alt={alt} />;
    }
    if (word.relatedMedia?.oxford) {
      return <img className={className} src={getAssetUrl(word.relatedMedia.oxford.imagePath)} alt={alt} />;
    }
    if (word.relatedMedia?.redRocket) {
      return (
        <span
          className={[className, 'word-image--atlas'].filter(Boolean).join(' ')}
          role="img"
          aria-label={alt}
          style={{
            ...getWordAtlasStyle(word.relatedMedia.redRocket, { columns: 3, rows: 3, cellSize: 512 }),
            backgroundImage: `url(${getWordImageUrl(word.relatedMedia.redRocket.atlasPath)})`,
          }}
        />
      );
    }
  }

  return <WordImage className={className} word={word} alt={alt} />;
}
