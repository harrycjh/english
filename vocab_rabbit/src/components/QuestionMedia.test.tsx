import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LocalLifePhotoView } from '../models/local-media';
import type { WordRecord } from '../models/word';
import { QuestionMedia } from './QuestionMedia';

const baseWord: WordRecord = {
  id: 'ket_house_n',
  english: 'house',
  chinese: '房子',
  partOfSpeech: 'n',
  category: '房子和家具',
  difficulty: 1,
  imagePath: '/content/images/words/ket_house_n.webp',
  imageApproved: true,
  oxfordRefs: [],
};

function render(word: WordRecord, localLifePhoto?: LocalLifePhotoView) {
  return renderToStaticMarkup(
    <QuestionMedia
      word={word}
      strategy="related-priority"
      localLifePhoto={localLifePhoto}
      alt="题目图片"
    />,
  );
}

describe('QuestionMedia related image priority', () => {
  it('prefers a local life photo over every bundled source', () => {
    const markup = render({
      ...baseWord,
      relatedMedia: {
        lifePhoto: { imagePath: '/life.webp', caption: '', photoId: 'p', match: 'primary', confidence: 1 },
        oxford: { imagePath: '/oxford.webp', label: '', level: 1, book: 1, page: 1 },
      },
    }, {
      wordId: baseWord.id,
      objectUrl: 'blob:local-life-photo',
      caption: '',
      photoId: 'local',
      match: 'primary',
      confidence: 1,
      importedAt: '2026-07-21T00:00:00.000Z',
    });

    expect(markup).toContain('blob:local-life-photo');
    expect(markup).not.toContain('/life.webp');
  });

  it('falls through life photo, Oxford, Red Rocket, then Comfy', () => {
    expect(render({
      ...baseWord,
      relatedMedia: {
        lifePhoto: { imagePath: '/life.webp', caption: '', photoId: 'p', match: 'primary', confidence: 1 },
        oxford: { imagePath: '/oxford.webp', label: '', level: 1, book: 1, page: 1 },
      },
    })).toContain('/life.webp');

    expect(render({
      ...baseWord,
      relatedMedia: {
        redRocket: {
          atlasPath: '/rocket.webp', row: 0, column: 0, label: '', level: '', title: '', page: 1,
          matchKind: 'exact', matchedTerm: 'house', confidence: 1,
        },
        oxford: { imagePath: '/oxford.webp', label: '', level: 1, book: 1, page: 1 },
      },
    })).toContain('/oxford.webp');

    expect(render({
      ...baseWord,
      relatedMedia: {
        redRocket: {
          atlasPath: '/rocket.webp', row: 0, column: 0, label: '', level: '', title: '', page: 1,
          matchKind: 'exact', matchedTerm: 'house', confidence: 1,
        },
      },
    })).toContain('/rocket.webp');

    expect(render({
      ...baseWord,
      relatedMedia: {
        redRocket: {
          imagePath: '/rocket-corrected.webp',
          atlasPath: '/rocket.webp', row: 0, column: 0, label: '', level: '', title: '', page: 1,
          matchKind: 'exact', matchedTerm: 'house', confidence: 1,
        },
      },
    })).toContain('/rocket-corrected.webp');

    expect(render(baseWord)).toContain('ket_house_n.webp');
  });

  it('renders a production Oxford atlas cell when the source page was bundled', () => {
    const markup = render({
      ...baseWord,
      relatedMedia: {
        oxford: {
          atlasPath: '/content/images/oxford-atlases/atlas-001.webp',
          row: 1,
          column: 2,
          label: 'Level 3, Book 2, Page 8',
          level: 3,
          book: 2,
          page: 8,
        },
      },
    });

    expect(markup).toContain('word-image--atlas');
    expect(markup).toContain('oxford-atlases/atlas-001.webp');
    expect(markup).toContain('background-position:100% 50%');
  });
});
