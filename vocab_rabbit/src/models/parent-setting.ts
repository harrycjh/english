export interface ParentSetting {
  enableAudio: boolean;
  dailyNewWordCount: number;
  dailyReviewLimit: number;
}

export const defaultParentSetting: ParentSetting = {
  enableAudio: true,
  dailyNewWordCount: 6,
  dailyReviewLimit: 8,
};