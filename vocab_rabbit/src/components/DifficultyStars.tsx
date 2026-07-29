interface DifficultyStarsProps {
  difficulty: number;
  className?: string;
}

export function formatDifficultyStars(difficulty: number): string {
  const normalizedDifficulty = Math.min(5, Math.max(1, Math.floor(difficulty)));
  return '★'.repeat(normalizedDifficulty);
}

export function DifficultyStars({
  difficulty,
  className = '',
}: DifficultyStarsProps) {
  const normalizedDifficulty = Math.min(5, Math.max(1, Math.floor(difficulty)));
  const filledStars = '★'.repeat(normalizedDifficulty);
  const emptyStars = '☆'.repeat(5 - normalizedDifficulty);

  return (
    <span
      className={`difficulty-stars${className ? ` ${className}` : ''}`}
      aria-label={`词库难度 ${normalizedDifficulty} 星`}
      title={`词库难度 ${normalizedDifficulty} 星`}
    >
      <span className="difficulty-stars__filled" aria-hidden="true">{filledStars}</span>
      <span className="difficulty-stars__empty" aria-hidden="true">{emptyStars}</span>
    </span>
  );
}
