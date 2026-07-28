import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SentenceChoiceQuestion } from '../services/question-service';
import { QuestionSentenceChoice } from './QuestionSentenceChoice';

const question: SentenceChoiceQuestion = {
  kind: 'sentence-choice',
  prompt: '选择最适合这个例句的单词',
  studyText: 'rabbit',
  word: {
    id: 'ket_rabbit_n',
    english: 'rabbit',
    chinese: '兔子',
    partOfSpeech: 'n',
    category: '动物',
    difficulty: 1,
    imagePath: '/rabbit.webp',
    imageApproved: true,
    oxfordRefs: [],
  },
  sentence: 'The rabbit eats a fresh carrot.',
  sentenceTranslation: '这只兔子吃了一根新鲜的胡萝卜。',
  sentenceTranslationFocus: '兔子',
  maskedSentence: 'The _____ eats a fresh carrot.',
  options: ['rabbit', 'cat', 'dog', 'bird'],
  correctAnswer: 'rabbit',
};

describe('QuestionSentenceChoice', () => {
  it('keeps the translation hidden before the answer and places the prompt above the choices', () => {
    const markup = renderToStaticMarkup(
      <QuestionSentenceChoice
        question={question}
        disabled={false}
        enableAudio={true}
        questionLevel={5}
        selectedAnswer={null}
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain(question.maskedSentence);
    expect(markup).not.toContain(question.sentenceTranslation);
    expect(markup).not.toContain('sentence-cloze-card__english-focus');
    expect(markup.indexOf(question.prompt)).toBeLessThan(markup.indexOf('>rabbit</button>'));
    expect(markup).toContain('sentence-answer-column');
  });

  it('shows the complete English sentence and Chinese translation after a correct answer', () => {
    const markup = renderToStaticMarkup(
      <QuestionSentenceChoice
        question={question}
        disabled={true}
        enableAudio={true}
        questionLevel={5}
        selectedAnswer="rabbit"
        onSubmit={() => undefined}
      />,
    );

    expect(markup.indexOf('The <span')).toBeLessThan(markup.indexOf('这只<strong'));
    expect(markup).not.toContain(question.maskedSentence);
    expect(markup).toContain(
      'The <span class="sentence-cloze-card__english-focus">rabbit</span> eats a fresh carrot.',
    );
    expect(markup).toContain(
      '这只<strong class="sentence-cloze-card__translation-focus">兔子</strong>吃了一根新鲜的胡萝卜。',
    );
  });

  it('reveals the correct bilingual sentence after a wrong answer', () => {
    const markup = renderToStaticMarkup(
      <QuestionSentenceChoice
        question={question}
        disabled={true}
        enableAudio={true}
        questionLevel={5}
        selectedAnswer="cat"
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain('这只<strong');
    expect(markup).toContain('吃了一根新鲜的胡萝卜。');
    expect(markup).toContain('sentence-cloze-card__english-focus');
    expect(markup).toContain('sentence-cloze-card__translation-focus');
  });

  it('emphasizes the inflected English form that appears in the sentence', () => {
    const pastQuestion: SentenceChoiceQuestion = {
      ...question,
      studyText: 'discover',
      word: {
        ...question.word,
        id: 'ket_discover_v',
        english: 'discover',
        chinese: '发现',
        partOfSpeech: 'v',
      },
      sentence: 'I discovered a new toy.',
      sentenceTranslation: '我发现了一个新玩具。',
      sentenceTranslationFocus: '发现',
      maskedSentence: 'I _____ a new toy.',
      options: ['discovered', 'answered', 'studied', 'stopped'],
      correctAnswer: 'discovered',
    };
    const markup = renderToStaticMarkup(
      <QuestionSentenceChoice
        question={pastQuestion}
        disabled={true}
        enableAudio={true}
        questionLevel={5}
        selectedAnswer="discovered"
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain(
      'I <span class="sentence-cloze-card__english-focus">discovered</span> a new toy.',
    );
  });

  it('emphasizes a natural translated phrase even when it differs from the dictionary wording', () => {
    const familyQuestion: SentenceChoiceQuestion = {
      ...question,
      word: {
        ...question.word,
        id: 'ket_family_n',
        english: 'family',
        chinese: '家庭',
      },
      studyText: 'family',
      sentence: 'My family likes to eat together.',
      sentenceTranslation: '我的家人喜欢一起吃饭。',
      sentenceTranslationFocus: '家人',
      maskedSentence: 'My _____ likes to eat together.',
      options: ['family', 'friend', 'class', 'team'],
      correctAnswer: 'family',
    };
    const markup = renderToStaticMarkup(
      <QuestionSentenceChoice
        question={familyQuestion}
        disabled={true}
        enableAudio={true}
        questionLevel={5}
        selectedAnswer="family"
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain(
      '我的<strong class="sentence-cloze-card__translation-focus">家人</strong>喜欢一起吃饭。',
    );
  });
});
