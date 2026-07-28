import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LetterChoiceQuestion } from '../services/question-service';
import { QuestionLetterChoice } from './QuestionLetterChoice';

const question: LetterChoiceQuestion = {
  kind: 'letter-choice',
  prompt: '穿过',
  studyText: 'across',
  word: {
    id: 'ket_across_prep',
    english: 'across',
    chinese: '穿过',
    partOfSpeech: 'prep',
    category: '介词',
    difficulty: 1,
    imagePath: '/across.webp',
    imageApproved: true,
    phonetic: '/əˈkrɔːs/',
    oxfordRefs: [],
    examples: ['We walked across the bridge.'],
    exampleTranslations: ['我们走过了桥。'],
    relatedMedia: {
      redRocket: {
        atlasPath: '/content/images/red-rocket-atlases/atlas-001.webp',
        row: 1,
        column: 2,
        label: 'Early Level 2, Going Across, Page 6',
        level: 'Early Level 2',
        title: 'Going Across',
        page: 6,
        matchKind: 'exact',
        matchedTerm: 'across',
        confidence: 0.94,
        sentence: 'The children walk across the bridge.',
        sentenceTranslation: '孩子们走过这座桥。',
      },
    },
  },
  maskedCharacters: ['a', 'c', 'r', 'o', 's', '_'],
  options: ['s', 'm', 'n', 'p'],
  correctAnswer: 's',
};

describe('QuestionLetterChoice', () => {
  it('shows the masked word and Chinese meaning without an instruction sentence', () => {
    const markup = renderToStaticMarkup(
      <QuestionLetterChoice
        question={question}
        disabled={false}
        enableAudio
        questionLevel={6}
        selectedAnswer={null}
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain('>acros_</strong>');
    expect(markup).toContain('>穿过</p>');
    expect(markup).not.toContain('缺少哪一组字母');
    expect(markup).toContain('>字母选择</span>');
    expect(markup).toContain('letter-choice-word-card__phonetic is-placeholder');
    expect(markup).not.toContain('/əˈkrɔːs/');
  });

  it('renders answer options with their generated letter case unchanged', () => {
    const uppercaseQuestion: LetterChoiceQuestion = {
      ...question,
      studyText: 'Monday',
      maskedCharacters: ['_', 'o', 'n', 'd', 'a', 'y'],
      options: ['M', 'T', 'S', 'W'],
      correctAnswer: 'M',
    };
    const markup = renderToStaticMarkup(
      <QuestionLetterChoice
        question={uppercaseQuestion}
        disabled={false}
        enableAudio
        questionLevel={6}
        selectedAnswer={null}
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain('>M</button>');
    expect(markup).toContain('>T</button>');
  });

  it('fills the missing letters into the word after a correct choice', () => {
    const markup = renderToStaticMarkup(
      <QuestionLetterChoice
        question={question}
        disabled={true}
        enableAudio
        questionLevel={6}
        selectedAnswer="s"
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain('class="is-complete" aria-label="完整单词">across</strong>');
    expect(markup).not.toContain('>acros_</strong>');
    expect(markup).toContain('class="question-phonetic-row letter-choice-word-card__phonetic"');
    expect(markup).not.toContain('letter-choice-word-card__phonetic is-placeholder');
  });

  it('keeps the blank after a wrong choice', () => {
    const markup = renderToStaticMarkup(
      <QuestionLetterChoice
        question={question}
        disabled={true}
        enableAudio
        questionLevel={6}
        selectedAnswer="m"
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="缺失字母单词">acros_</strong>');
    expect(markup).not.toContain('aria-label="完整单词"');
  });

  it('replaces the options with the Red Rocket page and sentence after a correct level 6 answer', () => {
    const markup = renderToStaticMarkup(
      <QuestionLetterChoice
        question={question}
        disabled
        enableAudio
        questionLevel={6}
        selectedAnswer="s"
        relatedResultPhase="revealed"
        onContinue={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="红火箭对应页面"');
    expect(markup).toContain('question-red-rocket-result');
    expect(markup).toContain('atlas-001.webp');
    expect(markup).toContain('The children walk across the bridge.');
    expect(markup).toContain('孩子们走过这座桥。');
    expect(markup).toContain('/əˈkrɔːs/</span><button class="audio-icon-button"');
    expect(markup).toContain('>继续</button>');
    expect(markup).not.toContain('>m</button>');
  });

  it('uses a corrected standalone Red Rocket page when visual review found page drift', () => {
    const correctedQuestion = {
      ...question,
      word: {
        ...question.word,
        relatedMedia: {
          redRocket: {
            ...question.word.relatedMedia!.redRocket!,
            imagePath: '/content/images/red-rocket-pages/corrected.webp',
          },
        },
      },
    };
    const markup = renderToStaticMarkup(
      <QuestionLetterChoice
        question={correctedQuestion}
        disabled
        enableAudio
        questionLevel={6}
        selectedAnswer="s"
        relatedResultPhase="revealed"
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain('red-rocket-pages/corrected.webp');
    expect(markup).not.toContain('atlas-001.webp');
  });

  it('keeps the answer options visible while they fade out before the Red Rocket reveal', () => {
    const markup = renderToStaticMarkup(
      <QuestionLetterChoice
        question={question}
        disabled
        enableAudio
        questionLevel={6}
        selectedAnswer="s"
        relatedResultPhase="fading-out"
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain('letter-choice-answer-column is-fading-out');
    expect(markup).toContain('>s</button>');
    expect(markup).not.toContain('红火箭对应页面');
  });
});
