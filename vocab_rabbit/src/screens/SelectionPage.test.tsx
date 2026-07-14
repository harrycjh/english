import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultParentSetting } from '../models/parent-setting';
import type { WordPayload, WordRecord } from '../models/word';
import { matchesRedRocketFilter, SelectionPage } from './SelectionPage';

function createWord(id: string, relatedToRedRocket: boolean): WordRecord {
  return {
    id,
    english: id,
    partOfSpeech: 'n',
    chinese: id,
    category: '测试',
    difficulty: 1,
    imagePath: `/content/images/words/${id}.webp`,
    imageApproved: true,
    oxfordRefs: [],
    relatedMedia: relatedToRedRocket
      ? {
          redRocket: {
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
          },
        }
      : undefined,
  };
}

const words = [createWord('linked', true), createWord('unlinked', false)];
const payload: WordPayload = {
  generatedAt: '',
  sourceFile: '',
  categoryCount: 1,
  wordCount: words.length,
  categories: ['测试'],
  words,
};

describe('SelectionPage', () => {
  it('matches linked and unlinked words against the selected coverage', () => {
    expect(matchesRedRocketFilter(words[0], 'linked')).toBe(true);
    expect(matchesRedRocketFilter(words[0], 'unlinked')).toBe(false);
    expect(matchesRedRocketFilter(words[1], 'linked')).toBe(false);
    expect(matchesRedRocketFilter(words[1], 'unlinked')).toBe(true);
    expect(words.every((word) => matchesRedRocketFilter(word, 'all'))).toBe(true);
  });

  it('offers Red Rocket coverage as a vocabulary filter', () => {
    const markup = renderToStaticMarkup(
      <SelectionPage
        payload={payload}
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
        onOpenSettings={() => undefined}
        onOpenStats={() => undefined}
        onSaveSelectionStates={async () => undefined}
        onApplySelectionPlan={async () => undefined}
      />,
    );

    expect(markup).toContain('Red Rocket');
    expect(markup).toContain('全部单词');
    expect(markup).toContain('有关联图');
    expect(markup).toContain('无关联图');
  });
});
