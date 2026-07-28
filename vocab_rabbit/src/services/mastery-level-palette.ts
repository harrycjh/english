export const MASTERY_LEVEL_COLORS = [
  '#b8ad9b',
  '#e2bf55',
  '#72b86b',
  '#51a8d8',
  '#617bd2',
  '#7659b7',
  '#b35b9a',
  '#d75c5c',
  '#49454a',
  '#ff9b22',
  '#2f8f46',
] as const;

export function getMasteryLevelColor(level: number): string {
  const normalizedLevel = Math.min(
    MASTERY_LEVEL_COLORS.length - 1,
    Math.max(0, Math.floor(level)),
  );
  return MASTERY_LEVEL_COLORS[normalizedLevel];
}
