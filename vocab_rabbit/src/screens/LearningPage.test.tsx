import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultParentSetting } from '../models/parent-setting';
import type { WordPayload, WordRecord } from '../models/word';
import { LearningPage } from './LearningPage';

const words: WordRecord[] = [
  ['dog', '狗'],
  ['cat', '猫'],
  ['bird', '鸟'],
  ['fish', '鱼'],
].map(([english, chinese], index) => ({
  id: `word-${index}`,
  english,
  chinese,
  partOfSpeech: 'noun',
  category: '动物',
  difficulty: 1,
  imagePath: `/images/${english}.webp`,
  imageApproved: true,
  oxfordRefs: [],
}));

const payload: WordPayload = {
  generatedAt: '',
  sourceFile: '',
  categoryCount: 1,
  wordCount: words.length,
  categories: ['动物'],
  words,
};

function renderLearningPage(profileId: 'cute-junjun' | 'stinky-dog') {
  return renderToStaticMarkup(
    <LearningPage
      payload={payload}
      initialWordIds={[words[0].id]}
      recordsById={{}}
      setting={{ ...defaultParentSetting, profileId }}
      studyDateKey="2026-07-20"
      localLifePhotosById={{}}
      onAnswer={async () => undefined}
      onComplete={async () => undefined}
      onExit={() => undefined}
    />,
  );
}

describe('LearningPage profile actions', () => {
  it('shows the direct-correct action only for the dog profile', () => {
    const dogMarkup = renderLearningPage('stinky-dog');
    expect(dogMarkup).toContain('直接答对');
    expect(dogMarkup).toContain('全部答对');
    expect(dogMarkup.indexOf('直接答对')).toBeLessThan(dogMarkup.indexOf('全部答对'));
    expect(renderLearningPage('cute-junjun')).not.toContain('直接答对');
    expect(renderLearningPage('cute-junjun')).not.toContain('全部答对');
  });
});
