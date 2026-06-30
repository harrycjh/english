import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CONTENT_VERSION } from '../config/app-meta';
import { defaultParentSetting } from '../models/parent-setting';
import type { WordRecord } from '../models/word';
import { ReviewPage } from './HomePage';

const previewWord: WordRecord = {
  id: 'ket_dad_n',
  english: 'dad',
  partOfSpeech: 'noun',
  chinese: '爸爸',
  category: '家人和朋友',
  difficulty: 1,
  imagePath: '/content/images/words/ket_dad_n.webp',
  imageApproved: true,
  oxfordRefs: [],
};

describe('ReviewPage', () => {
  it('uses the approved word image in the today preview card', () => {
    const markup = renderToStaticMarkup(
      <ReviewPage
        payload={{
          generatedAt: '',
          sourceFile: '',
          categoryCount: 1,
          wordCount: 1,
          categories: [previewWord.category],
          words: [previewWord],
        }}
        task={{
          dateKey: '2026-06-30',
          newWordIds: [previewWord.id],
          reviewWordIds: [],
          completedAt: null,
          correctCount: 0,
          wrongCount: 0,
          totalAnswered: 0,
          answeredWordIds: [],
        }}
        setting={defaultParentSetting}
        recordsById={{}}
        selectionById={{}}
        answerEvents={[]}
        masteredCount={0}
        recentTasks={[]}
        previewWords={[previewWord]}
        onStart={() => undefined}
        onOpenSelection={() => undefined}
        onOpenStats={() => undefined}
        onOpenSettings={() => undefined}
        onSaveSelectionStates={async () => undefined}
      />,
    );

    expect(markup).toContain(
      `src="/content/images/words/ket_dad_n.webp?v=${CONTENT_VERSION}"`,
    );
  });
});
