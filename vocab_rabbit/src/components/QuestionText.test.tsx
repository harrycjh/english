import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ChoiceQuestion } from '../services/question-service';
import { QuestionText } from './QuestionText';

describe('QuestionText', () => {
  it('shows English context for a narrowed polysemous study sense', () => {
    const question: ChoiceQuestion = {
      kind: 'text-choice',
      prompt: '看看英文，选出正确中文',
      studyText: 'change',
      word: {
        id: 'ket_change_v_n',
        english: 'change',
        partOfSpeech: 'v & n',
        chinese: '改变；零钱',
        category: '购物买东西',
        difficulty: 2,
        imagePath: '/change.webp',
        imageApproved: true,
        oxfordRefs: [],
        studySense: {
          partOfSpeech: 'n',
          chinese: '零钱',
          examples: ['I gave her some change for the coffee.'],
        },
      },
      options: ['机器', '星星', '零钱', '有用'],
      correctAnswer: '零钱',
    };
    const markup = renderToStaticMarkup(
      <QuestionText
        question={question}
        disabled={false}
        enableAudio={true}
        questionLevel={4}
        selectedAnswer={null}
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain('n · 英文语境');
    expect(markup).toContain('I gave her some change for the coffee.');
    expect(markup).toContain('>零钱</button>');
    expect(markup).toContain('question-panel__bottom-options');
    expect(markup).not.toContain('看看英文，选出正确中文');
  });

  it('replaces level 4 answers with the Oxford page and sentence after a correct answer', () => {
    const question: ChoiceQuestion = {
      kind: 'text-choice',
      prompt: '看看英文，选出正确中文',
      studyText: 'rabbit',
      word: {
        id: 'ket_rabbit_n',
        english: 'rabbit',
        partOfSpeech: 'n',
        chinese: '兔子',
        category: '动物',
        difficulty: 1,
        imagePath: '/rabbit.webp',
        imageApproved: true,
        oxfordRefs: [],
        phonetic: '/ˈræbɪt/',
        examples: ['The rabbit eats a carrot.'],
        exampleTranslations: ['兔子吃了一根胡萝卜。'],
        relatedMedia: {
          oxford: {
            imagePath: '/content/images/oxford-tree/level-1/book-1/page-4.webp',
            label: 'Level 1, Book 1, Page 4',
            level: 1,
            book: 1,
            page: 4,
            sentence: 'The rabbit ran into the garden.',
            sentenceTranslation: '兔子跑进了花园。',
          },
        },
      },
      options: ['兔子', '猫', '狗', '鸟'],
      correctAnswer: '兔子',
    };
    const markup = renderToStaticMarkup(
      <QuestionText
        question={question}
        disabled
        enableAudio
        questionLevel={4}
        selectedAnswer="兔子"
        relatedResultPhase="revealed"
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="牛津树对应页面"');
    expect(markup).toContain('page-4.webp');
    expect(markup).toContain('The rabbit ran into the garden.');
    expect(markup).toContain('兔子跑进了花园。');
    expect(markup).toContain('/ˈræbɪt/</span><button class="audio-icon-button"');
    expect(markup).toContain('question-word__answer-meaning');
    expect(markup).toContain('>兔子</p>');
    expect(markup).toContain('The rabbit eats a carrot.');
    expect(markup).toContain('兔子吃了一根胡萝卜。');
    expect(markup).toContain('question-example-result is-visible is-reserved');
    expect(markup).toContain('>继续</button>');
    expect(markup).not.toContain('看看英文，选出正确中文');
    expect(markup).not.toContain('>猫</button>');
  });

  it('keeps the answers visible while they fade out before the Oxford reveal', () => {
    const question: ChoiceQuestion = {
      kind: 'text-choice',
      prompt: '看看英文，选出正确中文',
      studyText: 'rabbit',
      word: {
        id: 'ket_rabbit_n',
        english: 'rabbit',
        partOfSpeech: 'n',
        chinese: '兔子',
        category: '动物',
        difficulty: 1,
        imagePath: '/rabbit.webp',
        imageApproved: true,
        oxfordRefs: [],
        relatedMedia: {
          oxford: {
            imagePath: '/oxford.webp',
            label: 'Level 1, Book 1, Page 4',
            level: 1,
            book: 1,
            page: 4,
            sentence: 'The rabbit ran into the garden.',
          },
        },
      },
      options: ['兔子', '猫', '狗', '鸟'],
      correctAnswer: '兔子',
    };
    const markup = renderToStaticMarkup(
      <QuestionText
        question={question}
        disabled
        enableAudio
        questionLevel={4}
        selectedAnswer="兔子"
        relatedResultPhase="fading-out"
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain('question-panel__answer-column is-fading-out');
    expect(markup).toContain('>兔子</button>');
    expect(markup).not.toContain('牛津树对应页面');
  });
});
