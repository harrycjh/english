export interface WordSelectionState {
  wordId: string;
  isEnabled: boolean;
  isPaused: boolean;
  updatedAt: string;
}

export function createDefaultWordSelectionState(wordId: string): WordSelectionState {
  return {
    wordId,
    isEnabled: true,
    isPaused: false,
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeWordSelectionState(
  state: Partial<WordSelectionState> & Pick<WordSelectionState, 'wordId'>
): WordSelectionState {
  return {
    wordId: state.wordId,
    isEnabled: state.isEnabled ?? true,
    isPaused: state.isPaused ?? false,
    updatedAt: state.updatedAt ?? new Date().toISOString(),
  };
}