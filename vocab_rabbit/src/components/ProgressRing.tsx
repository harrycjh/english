interface ProgressRingProps {
  value: number;
  total: number;
}

export function ProgressRing({ value, total }: ProgressRingProps) {
  const safeTotal = Math.max(total, 1);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(value / safeTotal, 1);
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div className="progress-ring">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="progress-ring__track" cx="50" cy="50" r={radius} />
        <circle
          className="progress-ring__fill"
          cx="50"
          cy="50"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </svg>
      <div className="progress-ring__label">
        <strong>{value}</strong>
        <span>/ {total}</span>
      </div>
    </div>
  );
}