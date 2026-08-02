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
  sentence?: string;
  sentenceTranslation?: string;
}

export interface RelatedLifePhoto {
  imagePath: string;
  caption: string;
  photoId: string;
  match: 'primary' | 'secondary';
  confidence: number;
}

export interface RelatedRedRocketImage extends WordImageAtlasEntry {
  imagePath?: string;
  label: string;
  level: string;
  title: string;
  page: number;
  matchKind: 'exact' | 'inflection' | 'title';
  matchedTerm: string;
  confidence: number;
  sentence?: string;
  sentenceTranslation?: string;
}

export interface WordRelatedMedia {
  oxford?: RelatedOxfordImage;
  redRocket?: RelatedRedRocketImage;
  lifePhoto?: RelatedLifePhoto;
}

export interface WordRelatedMediaManifestStats {
  totalWords: number;
  entries: number;
  withOxford: number;
  withLifePhoto: number;
  uniqueOxfordImages: number;
  withOxfordSentence?: number;
  withOxfordSentenceTranslation?: number;
  lifePhotoPackageImages: number;
  withRedRocket?: number;
  uniqueRedRocketImages?: number;
  redRocketAtlases?: number;
  withRedRocketSentence?: number;
  withRedRocketSentenceTranslation?: number;
}

export interface WordRelatedMediaManifestEntry {
  wordId: string;
  relatedMedia: WordRelatedMedia;
}

export interface WordRelatedMediaManifest {
  schemaVersion: 1 | 2;
  generatedAt: string;
  redRocketAtlasGrid?: {
    columns: number;
    rows: number;
    cellSize: number;
  };
  stats: WordRelatedMediaManifestStats;
  entries: WordRelatedMediaManifestEntry[];
}

export interface WordImageAtlasEntry {
  atlasPath: string;
  row: number;
  column: number;
}

export interface WordImageAtlasManifestEntry extends WordImageAtlasEntry {
  imagePath: string;
}

export interface WordImageAtlasManifest {
  schemaVersion: 1;
  generatedAt: string;
  grid: {
    columns: number;
    rows: number;
    cellSize: number;
  };
  stats: {
    sourceImages: number;
    atlasImages: number;
  };
  entries: WordImageAtlasManifestEntry[];
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

export interface LifePhotoCoverageManifest {
  schemaVersion: 1;
  generatedAt: string;
  count: number;
  wordIds: string[];
}

export interface WordStudySense {
  partOfSpeech: string;
  chinese: string;
  examples: string[];
  exampleIndexes?: number[];
}

export type ExamChunkType =
  | 'phrasal_verb'
  | 'fixed_expression'
  | 'preposition_pattern'
  | 'idiom'
  | 'lexical_collocation'
  | 'sentence_frame'
  | 'conventional_compound';

export interface ExamChunk {
  phrase: string;
  chinese: string;
  sense: string;
  type: ExamChunkType;
  cefr: 'A1' | 'A2' | 'B1' | 'B2';
  sources: string[];
}

export interface TeachingChunk extends ExamChunk {
  usageFrequency: {
    zipf: number;
    selectionScore: number;
    source: 'wordfreq-estimate';
    phraseListPer100Million?: number;
    phaveRank?: number;
  };
}

export interface WordRecord {
  id: string;
  english: string;
  phonetic?: string;
  partOfSpeech: string;
  chinese: string;
  studySense?: WordStudySense;
  category: string;
  difficulty: number;
  imagePath: string;
  imageApproved: boolean;
  hasLifePhoto?: boolean;
  imageAtlas?: WordImageAtlasEntry;
  oxfordRefs: OxfordRef[];
  relatedMedia?: WordRelatedMedia;
  example?: string;
  examples?: string[];
  exampleCollocations?: string[];
  examChunks?: ExamChunk[];
  teachingChunks?: TeachingChunk[];
  exampleTranslations?: string[];
  exampleTranslationFocus?: string[];
  exampleDistractorIds?: string[][];
}

export interface WordPayload {
  generatedAt: string;
  sourceFile: string;
  categoryCount: number;
  wordCount: number;
  categories: string[];
  words: WordRecord[];
}
