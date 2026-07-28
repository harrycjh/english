import { AudioIconButton } from './AudioIconButton';
import { MasteryLevelIcon } from './MasteryLevelIcon';

interface LearningLevelControlProps {
  level: number;
  upgradeTo?: number | null;
  onAudio?: () => void;
  audioLabel?: string;
}

function normalizeLevel(level: number): number {
  return Math.min(10, Math.max(0, Math.floor(level)));
}

export function LearningLevelControl({
  level,
  upgradeTo = null,
  onAudio,
  audioLabel,
}: LearningLevelControlProps) {
  const currentLevel = normalizeLevel(level);
  const nextLevel = upgradeTo === null ? null : normalizeLevel(upgradeTo);
  const isUpgrading = nextLevel !== null && nextLevel > currentLevel;

  return (
    <div
      className={`learning-level-control${isUpgrading ? ' is-upgrading' : ''}`}
      data-level={currentLevel}
      data-next-level={isUpgrading ? nextLevel : undefined}
      aria-live="polite"
      aria-label={isUpgrading ? `等级从 ${currentLevel} 升级到 ${nextLevel}` : `当前等级 ${currentLevel}`}
    >
      <div className="learning-level-control__levels">
        <MasteryLevelIcon level={currentLevel} className="learning-level-control__level learning-level-control__level--current" />
        {isUpgrading ? (
          <span className="learning-level-control__upgrade">
            <span className="learning-level-control__arrow" aria-hidden="true">→</span>
            <MasteryLevelIcon level={nextLevel} className="learning-level-control__level learning-level-control__level--next" />
            <i aria-hidden="true">升级</i>
          </span>
        ) : null}
      </div>
      {onAudio ? <AudioIconButton onClick={onAudio} label={audioLabel} /> : null}
    </div>
  );
}
