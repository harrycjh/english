export type ProfileId = 'cute-junjun' | 'stinky-dog' | 'fragrant-rabbit';

export interface ParentSetting {
  profileId: ProfileId;
  enableAudio: boolean;
  dailyNewWordCount: number;
  dailyReviewLimit: number;
  showImages: boolean;
  showExamples: boolean;
  showHints: boolean;
  preferLandscape: boolean;
}

export const MIN_NEW_WORD_COUNT = 3;
export const MAX_NEW_WORD_COUNT = 20;
export const MIN_REVIEW_LIMIT = 5;
export const MAX_REVIEW_LIMIT = 50;

export const defaultParentSetting: ParentSetting = {
  profileId: 'cute-junjun',
  enableAudio: true,
  dailyNewWordCount: 6,
  dailyReviewLimit: 8,
  showImages: true,
  showExamples: true,
  showHints: true,
  preferLandscape: true,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeParentSetting(setting: Partial<ParentSetting> | ParentSetting): ParentSetting {
  const profileId = setting.profileId === 'stinky-dog' || setting.profileId === 'fragrant-rabbit'
    ? setting.profileId
    : defaultParentSetting.profileId;
  return {
    profileId,
    enableAudio: setting.enableAudio ?? defaultParentSetting.enableAudio,
    dailyNewWordCount: clamp(
      setting.dailyNewWordCount ?? defaultParentSetting.dailyNewWordCount,
      MIN_NEW_WORD_COUNT,
      MAX_NEW_WORD_COUNT
    ),
    dailyReviewLimit: clamp(
      setting.dailyReviewLimit ?? defaultParentSetting.dailyReviewLimit,
      MIN_REVIEW_LIMIT,
      MAX_REVIEW_LIMIT
    ),
    showImages: setting.showImages ?? defaultParentSetting.showImages,
    showExamples: setting.showExamples ?? defaultParentSetting.showExamples,
    showHints: setting.showHints ?? defaultParentSetting.showHints,
    preferLandscape: setting.preferLandscape ?? defaultParentSetting.preferLandscape,
  };
}
