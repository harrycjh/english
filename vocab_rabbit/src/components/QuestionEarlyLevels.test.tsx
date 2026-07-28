import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type {
  ChoiceQuestion,
  ImageAnswerChoiceQuestion,
  RecognitionQuestion,
} from '../services/question-service';
import { isPortraitQuestionImage, QuestionImage } from './QuestionImage';
import { QuestionImageAnswer } from './QuestionImageAnswer';
import { QuestionRecognition } from './QuestionRecognition';

const word = {
  id: 'ket_rabbit_n',
  english: 'rabbit',
  phonetic: '/ˈræbɪt/',
  chinese: '兔子',
  partOfSpeech: 'n',
  category: '动物',
  difficulty: 1,
  imagePath: '/rabbit.webp',
  imageApproved: true,
  oxfordRefs: [],
  examples: ['The rabbit eats a carrot.'],
  exampleTranslations: ['兔子吃了一根胡萝卜。'],
};

describe('early learning level layouts', () => {
  it('detects only valid portrait life photos for the level 2 reveal', () => {
    expect(isPortraitQuestionImage(800, 1200)).toBe(true);
    expect(isPortraitQuestionImage(1200, 800)).toBe(false);
    expect(isPortraitQuestionImage(800, 800)).toBe(false);
    expect(isPortraitQuestionImage(0, 1200)).toBe(false);
  });

  it('reserves a bilingual example between the level 0 meaning and recognition prompt', () => {
    const question: RecognitionQuestion = {
      kind: 'recognition',
      prompt: '这个单词你认识吗？',
      studyText: 'rabbit',
      word,
      imageStrategy: 'comfy',
      options: ['认识', '不认识'],
      correctAnswer: '认识',
    };
    const markup = renderToStaticMarkup(
      <QuestionRecognition
        question={question}
        disabled
        enableAudio
        questionLevel={0}
        selectedAnswer="认识"
        onSubmit={() => undefined}
      />,
    );

    expect(markup.indexOf('>兔子</p>')).toBeLessThan(markup.indexOf('The rabbit eats a carrot.'));
    expect(markup.indexOf('The rabbit eats a carrot.')).toBeLessThan(markup.indexOf(question.prompt));
    expect(markup).toContain('question-example-result is-visible is-reserved');
    expect(markup).toContain('question-panel--level-0');
    expect(markup).toContain('>初次见面</span>');
    expect(markup).not.toContain('第一次见面');
    expect(markup.indexOf('初次见面')).toBeLessThan(markup.indexOf('recognition-card'));
  });

  it.each([1, 2])('places level %i choices at the bottom and reveals a bilingual example', (level) => {
    const question: ChoiceQuestion = {
      kind: level === 1 ? 'image-choice' : 'image-english-choice',
      prompt: level === 2 ? '看看图片，选出正确英文' : '选择正确答案',
      studyText: 'rabbit',
      word,
      imageStrategy: 'comfy',
      options: level === 1 ? ['兔子', '猫', '狗', '鸟'] : ['rabbit', 'cat', 'dog', 'bird'],
      correctAnswer: level === 1 ? '兔子' : 'rabbit',
    };
    const markup = renderToStaticMarkup(
      <QuestionImage
        question={question}
        disabled
        enableAudio
        questionLevel={level}
        selectedAnswer={question.correctAnswer}
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain('question-panel__bottom-options');
    expect(markup).toContain('question-example-result is-visible is-reserved');
    expect(markup).toContain('The rabbit eats a carrot.');
    expect(markup).toContain('兔子吃了一根胡萝卜。');
    if (level === 1) {
      expect(markup.indexOf('>rabbit</strong>')).toBeLessThan(markup.indexOf('/ˈræbɪt/'));
      expect(markup).toContain('question-panel--level-1');
    } else {
      expect(markup).not.toContain('看看图片，选出正确英文');
    }
  });

  it('reveals the bilingual example after a wrong level 1 answer', () => {
    const question: ChoiceQuestion = {
      kind: 'image-choice',
      prompt: '选择正确答案',
      studyText: 'rabbit',
      word,
      imageStrategy: 'comfy',
      options: ['兔子', '猫', '狗', '鸟'],
      correctAnswer: '兔子',
    };
    const markup = renderToStaticMarkup(
      <QuestionImage
        question={question}
        disabled
        enableAudio
        questionLevel={1}
        selectedAnswer="猫"
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain('>图片识词</span>');
    expect(markup).toContain('question-example-result is-visible is-reserved');
    expect(markup).toContain('The rabbit eats a carrot.');
    expect(markup).toContain('兔子吃了一根胡萝卜。');
  });

  it('shows level 3 meaning and translation in the existing word/example column only', () => {
    const question: ImageAnswerChoiceQuestion = {
      kind: 'image-answer-choice',
      prompt: '',
      studyText: 'rabbit',
      word,
      imageStrategy: 'comfy',
      options: [word],
      correctAnswer: word.id,
    };
    const markup = renderToStaticMarkup(
      <QuestionImageAnswer
        question={question}
        disabled
        enableAudio
        questionLevel={3}
        selectedAnswer={word.id}
        localLifePhotosById={{}}
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain('question-word__answer-meaning');
    expect(markup).toContain('question-word__example');
    expect(markup).toContain('question-word__example-translation');
    expect(markup.match(/The rabbit eats a carrot\./g)).toHaveLength(1);
    expect(markup).toContain('/ˈræbɪt/</span><button class="audio-icon-button"');
  });

  it('also reveals the bilingual example after a wrong level 3 answer', () => {
    const question: ImageAnswerChoiceQuestion = {
      kind: 'image-answer-choice',
      prompt: '',
      studyText: 'rabbit',
      word,
      imageStrategy: 'comfy',
      options: [word],
      correctAnswer: word.id,
    };
    const markup = renderToStaticMarkup(
      <QuestionImageAnswer
        question={question}
        disabled
        enableAudio
        questionLevel={3}
        selectedAnswer="wrong-id"
        localLifePhotosById={{}}
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain('The rabbit eats a carrot.');
    expect(markup).toContain('兔子吃了一根胡萝卜。');
  });
});
