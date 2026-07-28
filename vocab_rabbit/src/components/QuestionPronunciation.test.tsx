import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ChoiceQuestion, RecognitionQuestion } from '../services/question-service';
import { QuestionImage } from './QuestionImage';
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
};

const recognitionQuestion: RecognitionQuestion = {
  kind: 'recognition',
  prompt: '这个单词你认识吗？',
  studyText: 'rabbit',
  word,
  options: ['认识', '不认识'],
  correctAnswer: '认识',
  imageStrategy: 'comfy',
};

const imageQuestion: ChoiceQuestion = {
  kind: 'image-choice',
  prompt: '看看图片，选出正确中文',
  studyText: 'rabbit',
  word,
  options: ['兔子', '猫', '狗', '鸟'],
  correctAnswer: '兔子',
  imageStrategy: 'comfy',
};

describe('question pronunciation display', () => {
  it('shows the level 0 audio action directly to the right of the phonetic transcription', () => {
    const markup = renderToStaticMarkup(
      <QuestionRecognition
        question={recognitionQuestion}
        disabled={false}
        enableAudio={true}
        questionLevel={0}
        selectedAnswer={null}
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain(
      '<div class="question-phonetic-row"><span class="question-word__phonetic">/ˈræbɪt/</span><button class="audio-icon-button"',
    );
    expect(markup.indexOf('>rabbit</strong>')).toBeLessThan(markup.indexOf('question-phonetic-row'));
    expect(markup.indexOf('question-phonetic-row')).toBeLessThan(markup.indexOf('>兔子</p>'));
  });

  it('shows only the correct English word with phonetic and audio above the level 1 options', () => {
    const markup = renderToStaticMarkup(
      <QuestionImage
        question={imageQuestion}
        disabled={false}
        enableAudio={true}
        questionLevel={1}
        selectedAnswer={null}
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain(
      '<div class="question-panel__word-cue"><strong>rabbit</strong><div class="question-phonetic-row"><span>/ˈræbɪt/</span><button class="audio-icon-button"',
    );
    expect(markup).not.toContain('看看图片，选出正确中文');
    expect(markup).toContain('>兔子</button>');
    expect(markup).toContain('>猫</button>');
    expect(markup).not.toContain('>cat</button>');
    expect(markup).not.toContain('>dog</button>');
  });

  it('does not add the English cue to level 2', () => {
    const markup = renderToStaticMarkup(
      <QuestionImage
        question={{ ...imageQuestion, kind: 'image-english-choice', options: ['rabbit', 'cat', 'dog', 'bird'] }}
        disabled={false}
        enableAudio={true}
        questionLevel={2}
        selectedAnswer={null}
        onSubmit={() => undefined}
      />,
    );

    expect(markup).not.toContain('question-panel__word-cue');
  });

  it('shows the phonetic transcription below the English word at level 3', () => {
    const markup = renderToStaticMarkup(
      <QuestionImageAnswer
        question={{
          kind: 'image-answer-choice',
          prompt: '看看英文，选出正确图片',
          studyText: 'rabbit',
          word,
          options: [word],
          correctAnswer: word.id,
          imageStrategy: 'comfy',
        }}
        disabled={false}
        enableAudio={true}
        questionLevel={3}
        selectedAnswer={null}
        localLifePhotosById={{}}
        onSubmit={() => undefined}
      />,
    );

    expect(markup.indexOf('>rabbit</strong>')).toBeLessThan(
      markup.indexOf('<span class="question-word__phonetic">/ˈræbɪt/</span>'),
    );
    expect(markup.indexOf('<span class="question-word__phonetic">/ˈræbɪt/</span>')).toBeLessThan(
      markup.indexOf('>The rabbit eats a carrot.</p>'),
    );
    expect(markup).not.toContain('看看英文，选出正确图片');
  });

  it('colors only the selected level 0 recognition result', () => {
    const recognizedMarkup = renderToStaticMarkup(
      <QuestionRecognition
        question={recognitionQuestion}
        disabled={true}
        enableAudio={true}
        questionLevel={0}
        selectedAnswer="认识"
        onSubmit={() => undefined}
      />,
    );
    const unknownMarkup = renderToStaticMarkup(
      <QuestionRecognition
        question={recognitionQuestion}
        disabled={true}
        enableAudio={true}
        questionLevel={0}
        selectedAnswer="不认识"
        onSubmit={() => undefined}
      />,
    );

    expect(recognizedMarkup).toContain('class="choice-button is-selected is-correct"');
    expect(unknownMarkup).toContain('class="choice-button is-selected is-wrong"');
    expect(unknownMarkup).not.toContain('class="choice-button is-correct"');
  });
});
