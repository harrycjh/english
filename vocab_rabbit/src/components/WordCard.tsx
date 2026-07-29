import type { WordRecord } from '../models/word';
import {
  getPrimaryOxfordRefLabel,
  getStudyChinese,
  getStudyPartOfSpeech,
  getStudyText,
} from '../services/word-service';
import { DifficultyStars } from './DifficultyStars';

interface WordCardProps {
  word: WordRecord;
  onOpenDetails?: () => void;
}

export function WordCard({ word, onOpenDetails }: WordCardProps) {
  const oxfordLabel = getPrimaryOxfordRefLabel(word);
  const content = (
    <>
      <div className="word-card__header">
        <span className="word-card__category">{word.category}</span>
        <DifficultyStars difficulty={word.difficulty} className="word-card__difficulty" />
      </div>
      <h3>{getStudyText(word)}</h3>
      <p>{getStudyChinese(word)}</p>
      <footer>
        <span>{getStudyPartOfSpeech(word)}</span>
        <span>{oxfordLabel ?? '暂未回填牛津树位置'}</span>
      </footer>
    </>
  );

  if (onOpenDetails) {
    return (
      <button className="word-card word-card--interactive" type="button" onClick={onOpenDetails}>
        {content}
      </button>
    );
  }

  return (
    <article className="word-card">
      {content}
    </article>
  );
}
