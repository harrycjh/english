import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AnswerEvent } from '../models/answer-event';
import { defaultParentSetting } from '../models/parent-setting';
import type { WordPayload, WordRecord } from '../models/word';
import {
  getAnswerFeedbackText,
  hasTodayWrongDifficultSpellingAttempt,
  LearningPage,
} from './LearningPage';

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

function renderLearningPage(
  profileId: 'cute-junjun' | 'stinky-dog',
  debugLevelSequence: number[] | null = null,
  answerEvents: AnswerEvent[] = [],
  renderedWords: WordRecord[] = words,
) {
  const renderedPayload = {
    ...payload,
    words: renderedWords,
    wordCount: renderedWords.length,
  };
  return renderToStaticMarkup(
    <LearningPage
      payload={renderedPayload}
      initialWordIds={[renderedWords[0].id]}
      recordsById={{}}
      answerEvents={answerEvents}
      setting={{ ...defaultParentSetting, profileId }}
      studyDateKey="2026-07-20"
      localLifePhotosById={{}}
      onAnswer={async () => undefined}
      onComplete={async () => undefined}
      onExit={() => undefined}
      debugLevelSequence={debugLevelSequence}
    />,
  );
}

function makeAnswerEvent(overrides: Partial<AnswerEvent> = {}): AnswerEvent {
  return {
    id: 'event-1',
    wordId: words[0].id,
    dateKey: '2026-07-20',
    answeredAt: '2026-07-20T04:00:00.000Z',
    questionKind: 'fill-blank',
    selectedAnswer: 'dogg',
    correctAnswer: 'dog',
    isCorrect: false,
    responseTimeMs: 1200,
    learningStateBefore: {
      wordId: words[0].id,
      masteryLevel: 8,
      reviewStage: 8,
      correctStreak: 7,
      wrongCount: 0,
      lastStudiedAt: null,
      nextDueAt: null,
    },
    ...overrides,
  };
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

  it('starts the full debug progression at level zero without the skip-all action', () => {
    const markup = renderLearningPage(
      'stinky-dog',
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    );

    expect(markup).toContain('当前等级 0');
    expect(markup).toContain('直接答对');
    expect(markup).not.toContain('全部答对');
  });

  it('does not show answer-result feedback after a response', () => {
    const fillQuestion = {
      kind: 'fill-blank' as const,
      prompt: '',
      studyText: 'headteacher',
      word: words[0],
      maskedCharacters: [...'headteacher'].map(() => '_'),
      missingLetters: [...'headteacher'],
      inputMode: 'full' as const,
    };

    expect(getAnswerFeedbackText(fillQuestion, 7, false, 'headteacher'))
      .toBeNull();
    expect(getAnswerFeedbackText(fillQuestion, 8, false, 'headteacher')).toBeNull();
    expect(getAnswerFeedbackText(fillQuestion, 9, false, 'headteacher')).toBeNull();
    expect(getAnswerFeedbackText(fillQuestion, 8, true, 'headteacher')).toBeNull();
    expect(getAnswerFeedbackText(fillQuestion, 9, true, 'headteacher')).toBeNull();
    expect(getAnswerFeedbackText(fillQuestion, 6, false, 'headteacher'))
      .toBeNull();
  });

  it('detects a same-day wrong level 8 or 9 spelling attempt', () => {
    expect(hasTodayWrongDifficultSpellingAttempt(
      [makeAnswerEvent()],
      words[0].id,
      '2026-07-20',
      8,
    )).toBe(true);

    expect(hasTodayWrongDifficultSpellingAttempt(
      [makeAnswerEvent({ isCorrect: true })],
      words[0].id,
      '2026-07-20',
      8,
    )).toBe(false);

    expect(hasTodayWrongDifficultSpellingAttempt(
      [makeAnswerEvent({ dateKey: '2026-07-19' })],
      words[0].id,
      '2026-07-20',
      8,
    )).toBe(false);

    expect(hasTodayWrongDifficultSpellingAttempt(
      [makeAnswerEvent({
        learningStateBefore: {
          wordId: words[0].id,
          masteryLevel: 7,
          reviewStage: 7,
          correctStreak: 6,
          wrongCount: 0,
          lastStudiedAt: null,
          nextDueAt: null,
        },
      })],
      words[0].id,
      '2026-07-20',
      8,
    )).toBe(false);
  });

  it('offers the difficult spelling skip on a repeated four-star level 8 word', () => {
    const difficultWord = {
      ...words[0],
      difficulty: 4,
    };
    const markup = renderLearningPage(
      'cute-junjun',
      [8],
      [makeAnswerEvent()],
      [difficultWord, ...words.slice(1)],
    );

    expect(markup).toContain('我是小狗子（不是小兔子）所以默不出来，爸爸帮我跳过这个单词吧！');
  });

  it('does not offer the difficult spelling skip before a wrong attempt or for lower-star words', () => {
    const difficultWord = {
      ...words[0],
      difficulty: 4,
    };
    const easyWord = {
      ...words[0],
      difficulty: 3,
    };

    expect(renderLearningPage('cute-junjun', [8], [], [difficultWord, ...words.slice(1)]))
      .not.toContain('爸爸帮我跳过这个单词吧');
    expect(renderLearningPage('cute-junjun', [8], [makeAnswerEvent()], [easyWord, ...words.slice(1)]))
      .not.toContain('爸爸帮我跳过这个单词吧');
    expect(renderLearningPage('cute-junjun', [7], [makeAnswerEvent()], [difficultWord, ...words.slice(1)]))
      .not.toContain('爸爸帮我跳过这个单词吧');
  });
});
