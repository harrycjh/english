import { Clock3 } from 'lucide-react';

interface ProgressRingProps {
  value: number;
  total: number;
  elapsedSeconds?: number;
}

export function formatElapsedTime(elapsedSeconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedSeconds));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const minuteText = String(minutes).padStart(2, '0');
  const secondText = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${minuteText}:${secondText}` : `${minuteText}:${secondText}`;
}

export function ProgressRing({ value, total, elapsedSeconds }: ProgressRingProps) {
  const safeTotal = Math.max(total, 1);
  const progress = Math.min(Math.max(value / safeTotal, 0), 1);
  const currentValue = Math.min(Math.max(value, 0), safeTotal);

  return (
    <div
      className="progress-ring"
      role="progressbar"
      aria-label="学习进度"
      aria-valuemin={0}
      aria-valuemax={safeTotal}
      aria-valuenow={currentValue}
    >
      <div className="progress-ring__bar" aria-hidden="true">
        <span className="progress-ring__fill" style={{ width: `${progress * 100}%` }} />
      </div>
      <div className="progress-ring__label">
        <span className="progress-ring__count">
          <strong>{value}</strong>
          <span>/ {total}</span>
        </span>
        {elapsedSeconds !== undefined ? (
          <span
            className="progress-ring__elapsed"
            aria-label={`本轮累计耗时 ${formatElapsedTime(elapsedSeconds)}`}
          >
            <Clock3 size={13} strokeWidth={2.2} aria-hidden="true" />
            <span>{formatElapsedTime(elapsedSeconds)}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
