import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultParentSetting } from '../models/parent-setting';
import { APP_VERSION } from '../config/app-meta';
import type { WordPayload, WordRecord } from '../models/word';
import { matchesWordSourceFilter, SelectionPage } from './SelectionPage';

function createWord(
  id: string,
  sources: { oxford?: boolean; redRocket?: boolean; lifePhoto?: boolean } = {},
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
    relatedMedia: sources.oxford || sources.redRocket
      ? {
          ...(sources.oxford ? {
            oxford: {
              imagePath: '/content/images/oxford-tree/level-1/book-1/page-3.webp',
              label: 'Level 1, Book 1, Page 3',
              level: 1,
              book: 1,
              page: 3,
            },
          } : {}),
          ...(sources.redRocket ? { redRocket: {
            atlasPath: '/content/images/red-rocket-atlases/atlas-000.webp',
            row: 0,
            column: 0,
            label: 'Early Level 1, Test Book, Page 1',
            level: 'Early Level 1',
            title: 'Test Book',
            page: 1,
            matchKind: 'exact',
            matchedTerm: id,
            confidence: 1,
          } } : {}),
        }
      : undefined,
  };
}

const words = [
  createWord('oxford', { oxford: true }),
  createWord('red-rocket', { redRocket: true }),
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
    />,
  );
}

describe('SelectionPage', () => {
  it('matches Oxford, Red Rocket, and life-photo coverage without imported browser photos', () => {
    expect(matchesWordSourceFilter(words[0], 'oxford')).toBe(true);
    expect(matchesWordSourceFilter(words[1], 'redRocket')).toBe(true);
    expect(matchesWordSourceFilter(words[2], 'lifePhoto')).toBe(true);
    expect(matchesWordSourceFilter(words[3], 'lifePhoto')).toBe(false);
    expect(words.every((word) => matchesWordSourceFilter(word, 'all'))).toBe(true);
  });

  it('offers the three related-media sources in one vocabulary-source filter', () => {
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
    expect(markup).toContain('生活图片');
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
