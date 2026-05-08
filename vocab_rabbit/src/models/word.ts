export interface OxfordRef {
  level: number;
  book: number;
  page: number;
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
}

export interface WordPayload {
  generatedAt: string;
  sourceFile: string;
  categoryCount: number;
  wordCount: number;
  categories: string[];
  words: WordRecord[];
}