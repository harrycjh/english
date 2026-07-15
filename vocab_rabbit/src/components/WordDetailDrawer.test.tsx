import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultParentSetting } from '../models/parent-setting';
import type { WordRecord } from '../models/word';
import { WordDetailDrawer } from './WordDetailDrawer';

const word: WordRecord = {
  id: 'ket_hand_n',
  english: 'hand',
  partOfSpeech: 'n',
  chinese: '手',
  category: '身体部位',
  difficulty: 1,
  imagePath: '/content/images/words/ket_hand_n.webp',
  imageApproved: true,
  oxfordRefs: [],
  examples: ['This is my hand.'],
  relatedMedia: {
    oxford: {
      imagePath: '/content/images/oxford-tree/level-1/book-1/page-4.webp',
      label: 'Level 1, Book 1, Page 4',
      level: 1,
      book: 1,
      page: 4,
    },
    redRocket: {
      atlasPath: '/content/images/red-rocket-atlases/atlas-001.webp',
      row: 1,
      column: 2,
      label: 'Early Level 1, My Hands, Page 4',
      level: 'Early Level 1',
      title: 'My Hands',
      page: 4,
      matchKind: 'exact',
      matchedTerm: 'hand',
      confidence: 0.94,
    },
  },
};

describe('WordDetailDrawer', () => {
  it('uses the existing compact layout in review context', () => {
    const markup = renderToStaticMarkup(
      <WordDetailDrawer
        isOpen
        word={word}
        record={undefined}
        selectionState={undefined}
        setting={{ ...defaultParentSetting, enableAudio: false }}
        context="review"
        onClose={() => undefined}
      />,
    );

    expect(markup).not.toContain('word-detail-drawer--selection');
    expect(markup).not.toContain('word-detail-drawer__selection-overview');
  });

  it('uses the review layout in selection context', () => {
    const markup = renderToStaticMarkup(
      <WordDetailDrawer
        isOpen
        word={word}
        record={undefined}
        selectionState={undefined}
        setting={{ ...defaultParentSetting, enableAudio: false }}
        context="selection"
        onClose={() => undefined}
      />,
    );

    expect(markup).not.toContain('word-detail-drawer--selection');
    expect(markup).not.toContain('word-detail-drawer__selection-overview');
    expect(markup).not.toContain('word-detail-drawer__inline-examples');
    expect(markup).toContain('word-detail-drawer__hero');
    expect(markup).toContain('关联图片');
    expect(markup).toContain('牛津树图');
    expect(markup).toContain('红火箭图');
    expect(markup).toContain('This is my hand.');
    expect(markup.indexOf('牛津树图')).toBeLessThan(markup.indexOf('例句'));
  });

  it('renders the Red Rocket atlas cell and source location', () => {
    const markup = renderToStaticMarkup(
      <WordDetailDrawer
        isOpen
        word={word}
        record={undefined}
        selectionState={undefined}
        setting={{ ...defaultParentSetting, enableAudio: false }}
        context="review"
        onClose={() => undefined}
      />,
    );

    expect(markup).toContain('红火箭图');
    expect(markup).toContain('Early Level 1, My Hands, Page 4');
    expect(markup).toContain('background-size:300% 300%');
    expect(markup).toContain('background-position:100% 50%');
    expect(markup).toContain('red-rocket-atlases/atlas-001.webp');
  });
});
