import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CONTENT_VERSION } from '../config/app-meta';
import type { WordRecord } from '../models/word';
import { WordImage } from './WordImage';

const word: WordRecord = {
  id: 'ket_dad_n',
  english: 'dad',
  partOfSpeech: 'n',
  chinese: '爸爸',
  category: '家人和朋友',
  difficulty: 1,
  imagePath: '/content/images/words/ket_dad_n.webp',
  imageApproved: true,
  oxfordRefs: [],
};

describe('WordImage', () => {
  it('renders an atlas cell with accessible image semantics', () => {
    const markup = renderToStaticMarkup(
      <WordImage
        word={{
          ...word,
          imageAtlas: {
            atlasPath: '/content/images/word-atlases/category-000/atlas-000.webp',
            row: 1,
            column: 2,
          },
        }}
        alt="爸爸"
        className="word-art"
      />,
    );

    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="爸爸"');
    expect(markup).toContain('background-size:300% 300%');
    expect(markup).toContain('background-position:100% 50%');
    expect(markup).toContain(
      'background-image:url(/content/images/word-atlases/category-000/atlas-000.webp',
    );
  });

  it('falls back to the individual image when no atlas entry exists', () => {
    const markup = renderToStaticMarkup(
      <WordImage word={word} alt="爸爸" className="word-art" />,
    );

    expect(markup).toContain('<img');
    expect(markup).toContain(
      `src="/content/images/words/ket_dad_n.webp?v=${CONTENT_VERSION}"`,
    );
  });
});
