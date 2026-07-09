export interface OxfordRef {
  level: number;
  book: number;
  page: number;
}

export interface RelatedOxfordImage {
  imagePath: string;
  label: string;
  level: number;
  book: number;
  page: number;
}

export interface RelatedLifePhoto {
  imagePath: string;
  caption: string;
  photoId: string;
  match: 'primary' | 'secondary';
  confidence: number;
}

export interface WordRelatedMedia {
  oxford?: RelatedOxfordImage;
  lifePhoto?: RelatedLifePhoto;
}

export interface WordRelatedMediaManifestStats {
  totalWords: number;
  entries: number;
  withOxford: number;
  withLifePhoto: number;
  uniqueOxfordImages: number;
  lifePhotoPackageImages: number;
}

export interface WordRelatedMediaManifestEntry {
  wordId: string;
  relatedMedia: WordRelatedMedia;
}

export interface WordRelatedMediaManifest {
  schemaVersion: 1;
  generatedAt: string;
  stats: WordRelatedMediaManifestStats;
  entries: WordRelatedMediaManifestEntry[];
}

export interface LifePhotoPackageManifest {
  schemaVersion: 1;
  generatedAt: string;
  stats: {
    totalWords: number;
    withLifePhoto: number;
  };
  entries: Array<{
    wordId: string;
    relatedMedia: {
      lifePhoto: RelatedLifePhoto;
    };
  }>;
}

export interface WordRecord {
  id: string;
  english: string;
  partOfSpeech: string;
  chinese: string;
  category: string;
  difficulty: number;
  imagePath: string;
  imageApproved: boolean;
  oxfordRefs: OxfordRef[];
  relatedMedia?: WordRelatedMedia;
  example?: string;
  examples?: string[];
}

export interface WordPayload {
  generatedAt: string;
  sourceFile: string;
  categoryCount: number;
  wordCount: number;
  categories: string[];
  words: WordRecord[];
}
