interface ProgressRingProps {
  value: number;
  total: number;
}

export function ProgressRing({ value, total }: ProgressRingProps) {
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
        <strong>{value}</strong>
        <span>/ {total}</span>
      </div>
    </div>
  );
}
