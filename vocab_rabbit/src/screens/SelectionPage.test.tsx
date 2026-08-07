import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultParentSetting } from '../models/parent-setting';
import { APP_VERSION } from '../config/app-meta';
import type { WordPayload, WordRecord } from '../models/word';
import {
  getAvailableWordSourceLevels,
  matchesWordSourceFilter,
  SelectionPage,
} from './SelectionPage';

function createWord(
  id: string,
  sources: {
    oxford?: boolean | number;
    redRocket?: boolean | string;
    raz?: boolean | string;
    lifePhoto?: boolean;
  } = {},
): WordRecord {
  return {
    id,
    english: id,
    partOfSpeech: 'n',
    chinese: id,
    category: '测试',
    difficulty: 1,
    imagePath: `/content/images/words/${id}.webp`,
    imageApproved: true,
    ...({ hasLifePhoto: sources.lifePhoto }),
    oxfordRefs: [],
    relatedMedia: sources.oxford || sources.redRocket || sources.raz
      ? {
          ...(sources.oxford ? {
            oxford: {
              imagePath: '/content/images/oxford-tree/level-1/book-1/page-3.webp',
              label: 'Level 1, Book 1, Page 3',
              level: typeof sources.oxford === 'number' ? sources.oxford : 1,
              book: 1,
              page: 3,
            },
          } : {}),
          ...(sources.redRocket ? { redRocket: {
            atlasPath: '/content/images/red-rocket-atlases/atlas-000.webp',
            row: 0,
            column: 0,
            label: 'Early Level 1, Test Book, Page 1',
            level: typeof sources.redRocket === 'string' ? sources.redRocket : 'Early Level 1',
            title: 'Test Book',
            page: 1,
            matchKind: 'exact',
            matchedTerm: id,
            confidence: 1,
          } } : {}),
          ...(sources.raz ? { raz: {
            atlasPath: '/content/images/raz-atlases/atlas-000.webp',
            row: 0,
            column: 1,
            label: 'Level E, E01 Test Book, Page 3',
            bookId: 'E01',
            level: typeof sources.raz === 'string' ? sources.raz : 'E',
            sequence: 1,
            title: 'Test Book',
            page: 3,
            matchKind: 'exact',
            matchedTerm: id,
            matchedForm: id,
          } } : {}),
        }
      : undefined,
  };
}

const words = [
  createWord('oxford', { oxford: true }),
  createWord('red-rocket', { redRocket: true }),
  createWord('raz', { raz: true }),
  createWord('life-photo', { lifePhoto: true }),
  createWord('unlinked'),
];
const payload: WordPayload = {
  generatedAt: '',
  sourceFile: '',
  categoryCount: 1,
  wordCount: words.length,
  categories: ['测试'],
  words,
};

function renderSelectionPage(nextPayload: WordPayload): string {
  return renderToStaticMarkup(
    <SelectionPage
      payload={nextPayload}
      recordsById={{}}
      selectionById={{}}
      answerEvents={[]}
      setting={defaultParentSetting}
      task={{
        dateKey: '2026-07-14',
        newWordIds: [],
        reviewWordIds: [],
        completedAt: null,
        correctCount: 0,
        wrongCount: 0,
        totalAnswered: 0,
        answeredWordIds: [],
      }}
      localLifePhotosById={{}}
      onBackHome={() => undefined}
      onSelectProfile={async () => undefined}
      onOpenStats={() => undefined}
      onSaveSelectionStates={async () => undefined}
      onApplySelectionPlan={async () => undefined}
      onChangeNewWordQueue={async () => undefined}
      onRemoveTodayNewWord={async () => undefined}
    />,
  );
}

describe('SelectionPage', () => {
  it('matches Oxford, Red Rocket, RAZ, and life-photo coverage without imported browser photos', () => {
    expect(matchesWordSourceFilter(words[0], 'oxford')).toBe(true);
    expect(matchesWordSourceFilter(words[1], 'redRocket')).toBe(true);
    expect(matchesWordSourceFilter(words[2], 'raz')).toBe(true);
    expect(matchesWordSourceFilter(words[3], 'lifePhoto')).toBe(true);
    expect(matchesWordSourceFilter(words[4], 'lifePhoto')).toBe(false);
    expect(words.every((word) => matchesWordSourceFilter(word, 'all'))).toBe(true);
  });

  it('offers the four related-media sources in one vocabulary-source filter', () => {
    const markup = renderSelectionPage(payload);

    expect(markup).toContain('词语来源');
    expect(markup).toContain('可爱的小珺珺');
    expect(markup).toContain('臭臭的小狗子');
    expect(markup).toContain('香香的小兔子');
    expect(markup).toContain('aria-haspopup="menu"');
    expect(markup).toContain('app-profile-chip');
    expect(markup).toContain('app-brand-lockup');
    expect(markup).toContain(APP_VERSION);
    expect(markup).toContain('全部来源');
    expect(markup).toContain('Oxford');
    expect(markup).toContain('Red Rocket');
    expect(markup).toContain('RAZ');
    expect(markup).toContain('生活图片');
    expect(markup).toContain('新词队列');
    expect(markup).toContain('加入队列');
    expect(markup).not.toContain('selection-source-levels');
  });

  it('filters each reading source by one or more selected levels', () => {
    const oxfordTwo = createWord('oxford-two', { oxford: 2 });
    const redEmergent = createWord('red-emergent', { redRocket: 'Emergent Level' });
    const razH = createWord('raz-h', { raz: 'H' });

    expect(matchesWordSourceFilter(oxfordTwo, 'oxford', [])).toBe(true);
    expect(matchesWordSourceFilter(oxfordTwo, 'oxford', ['2', '4'])).toBe(true);
    expect(matchesWordSourceFilter(oxfordTwo, 'oxford', ['1'])).toBe(false);
    expect(matchesWordSourceFilter(redEmergent, 'redRocket', ['Emergent Level'])).toBe(true);
    expect(matchesWordSourceFilter(redEmergent, 'redRocket', ['Early Level 1'])).toBe(false);
    expect(matchesWordSourceFilter(razH, 'raz', ['E', 'H'])).toBe(true);
    expect(matchesWordSourceFilter(razH, 'raz', ['G'])).toBe(false);
  });

  it('derives and sorts the real levels available in each source', () => {
    const levelWords = [
      createWord('oxford-sixteen', { oxford: 16 }),
      createWord('oxford-two', { oxford: 2 }),
      createWord('red-early-two', { redRocket: 'Early Level 2' }),
      createWord('red-pre', { redRocket: 'Pre-Reading Level' }),
      createWord('raz-l', { raz: 'L' }),
      createWord('raz-e', { raz: 'E' }),
    ];

    expect(getAvailableWordSourceLevels(levelWords, 'oxford')).toEqual(['2', '16']);
    expect(getAvailableWordSourceLevels(levelWords, 'redRocket')).toEqual([
      'Pre-Reading Level',
      'Early Level 2',
    ]);
    expect(getAvailableWordSourceLevels(levelWords, 'raz')).toEqual(['E', 'L']);
  });

  it('uses the generated word images for the six reference cards', () => {
    const referenceIds = [
      'ket_family_n',
      'ket_friend_n',
      'ket_arm_n',
      'ket_better_adj_adv',
      'ket_after_adv_prep',
      'ket_again_adv',
    ];
    const referenceWords = referenceIds.map((id) => createWord(id));
    const markup = renderSelectionPage({
      ...payload,
      wordCount: referenceWords.length,
      words: referenceWords,
    });

    for (const id of referenceIds) {
      expect(markup).toContain(`/content/images/words/${id}.webp?v=`);
    }
    expect(markup).not.toContain('/design-reference/slices/selection-card-');
  });
});
