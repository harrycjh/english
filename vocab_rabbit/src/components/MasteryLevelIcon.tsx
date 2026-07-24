import type { CSSProperties } from 'react';

interface MasteryLevelIconProps {
  level: number;
  className?: string;
  style?: CSSProperties;
}

export function MasteryLevelIcon({ level, className = '', style }: MasteryLevelIconProps) {
  const normalizedLevel = Math.min(10, Math.max(0, Math.floor(level)));
  const visualLevel = Math.min(9, normalizedLevel);
  const label = normalizedLevel === 0 ? '尚未学习' : `学习等级 ${normalizedLevel}`;
  const imageUrl = normalizedLevel > 0
    ? `${import.meta.env.BASE_URL}content/images/ui/mastery-levels/level-${visualLevel}.webp?v=2`
    : null;

  return (
    <span
      className={`mastery-level-icon mastery-level-icon--level-${visualLevel}${normalizedLevel === 10 ? ' mastery-level-icon--level-10' : ''}${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={label}
      title={label}
      style={style}
    >
      {imageUrl ? <img className="mastery-level-icon__art" src={imageUrl} alt="" aria-hidden="true" /> : null}
      <span className="mastery-level-icon__label" aria-hidden="true">
        {normalizedLevel === 0 ? '未学' : `Lv.${normalizedLevel}`}
      </span>
    </span>
  );
}
