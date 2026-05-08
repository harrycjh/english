import type { WordRecord } from '../models/word';
import { getPrimaryOxfordRefLabel, getStudyText } from '../services/word-service';

interface WordCardProps {
  word: WordRecord;
}

export function WordCard({ word }: WordCardProps) {
  const oxfordLabel = getPrimaryOxfordRefLabel(word);

  return (
    <article className="word-card">
      <div className="word-card__header">
        <span className="word-card__category">{word.category}</span>
        <span className="word-card__difficulty">Lv.{word.difficulty}</span>
      </div>
      <h3>{getStudyText(word)}</h3>
      <p>{word.chinese}</p>
      <footer>
        <span>{word.partOfSpeech}</span>
        <span>{oxfordLabel ?? '暂未回填牛津树位置'}</span>
      </footer>
    </article>
  );
}