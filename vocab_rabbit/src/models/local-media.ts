export interface LocalLifePhotoRecord {
  wordId: string;
  blob: Blob;
  contentType: string;
  fileName: string;
  caption: string;
  photoId: string;
  match: 'primary' | 'secondary';
  confidence: number;
  importedAt: string;
}

export interface LocalLifePhotoView {
  wordId: string;
  objectUrl: string;
  caption: string;
  photoId: string;
  match: 'primary' | 'secondary';
  confidence: number;
  importedAt: string;
}
