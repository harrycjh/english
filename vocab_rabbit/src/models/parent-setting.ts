export type ProfileId = 'cute-junjun' | 'stinky-dog' | 'fragrant-rabbit';

export interface ParentSetting {
  profileId: ProfileId;
  enableAudio: boolean;
  englishVoiceURI: string;
  chineseVoiceURI: string;
  dailyNewWordCount: number;
  dailyReviewLimit: number;
  newWordQueue: string[];
  showImages: boolean;
  showExamples: boolean;
  showHints: boolean;
  preferLandscape: boolean;
  /** Backpack item worn by the review page's corner scene. */
  mascotSceneId: string;
  /** Backpack item worn by the 今日重点 card background. */
  focusSceneId: string;
}

export const MIN_NEW_WORD_COUNT = 3;
export const MIN_REVIEW_LIMIT = 5;

export const defaultParentSetting: ParentSetting = {
  profileId: 'cute-junjun',
  enableAudio: true,
  englishVoiceURI: '',
  chineseVoiceURI: '',
  dailyNewWordCount: 8,
  dailyReviewLimit: 80,
  newWordQueue: [],
  showImages: true,
  showExamples: true,
  showHints: true,
  preferLandscape: true,
  mascotSceneId: 'default',
  focusSceneId: 'default',
};

function normalizeSceneId(value: string | undefined, fallback: string): string {
  // Only the shape is checked here; whether the item exists and is owned is the
  // backpack's call, and it has to be re-made on every render anyway.
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function normalizeCount(value: number | undefined, fallback: number, min: number): number {
  const finiteValue = value !== undefined && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.floor(finiteValue));
}

function normalizeWordQueue(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((wordId) => typeof wordId === 'string' && wordId.trim().length > 0))];
}

export function normalizeParentSetting(setting: Partial<ParentSetting> | ParentSetting): ParentSetting {
  const profileId = setting.profileId === 'stinky-dog' || setting.profileId === 'fragrant-rabbit'
    ? setting.profileId
    : defaultParentSetting.profileId;
  return {
    profileId,
    enableAudio: setting.enableAudio ?? defaultParentSetting.enableAudio,
    englishVoiceURI: typeof setting.englishVoiceURI === 'string'
      ? setting.englishVoiceURI
      : defaultParentSetting.englishVoiceURI,
    chineseVoiceURI: typeof setting.chineseVoiceURI === 'string'
      ? setting.chineseVoiceURI
      : defaultParentSetting.chineseVoiceURI,
    dailyNewWordCount: normalizeCount(
      setting.dailyNewWordCount,
      defaultParentSetting.dailyNewWordCount,
      MIN_NEW_WORD_COUNT
    ),
    dailyReviewLimit: normalizeCount(
      setting.dailyReviewLimit,
      defaultParentSetting.dailyReviewLimit,
      MIN_REVIEW_LIMIT
    ),
    newWordQueue: normalizeWordQueue(setting.newWordQueue),
    showImages: setting.showImages ?? defaultParentSetting.showImages,
    showExamples: setting.showExamples ?? defaultParentSetting.showExamples,
    showHints: setting.showHints ?? defaultParentSetting.showHints,
    preferLandscape: setting.preferLandscape ?? defaultParentSetting.preferLandscape,
    mascotSceneId: normalizeSceneId(setting.mascotSceneId, defaultParentSetting.mascotSceneId),
    focusSceneId: normalizeSceneId(setting.focusSceneId, defaultParentSetting.focusSceneId),
  };
}
