import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LocalLifePhotoView } from '../models/local-media';
import type { FillBlankQuestion } from '../services/question-service';
import { QuestionFillBlank } from './QuestionFillBlank';

const word = {
  id: 'ket_chemistry_n',
  english: 'chemistry',
  phonetic: '/ˈkɛmɪstɹi/',
  chinese: '化学',
  partOfSpeech: 'n',
  category: '学校',
  difficulty: 3,
  imagePath: '/chemistry.webp',
  imageApproved: true,
  oxfordRefs: [],
};

const localLifePhoto: LocalLifePhotoView = {
  wordId: word.id,
  objectUrl: 'blob:chemistry-life-photo',
  caption: 'A chemistry lesson',
  photoId: 'chemistry-photo',
  match: 'primary',
  confidence: 1,
  importedAt: '2026-07-27T00:00:00.000Z',
};

function renderQuestion(
  question: FillBlankQuestion,
  questionLevel: number,
  photo?: LocalLifePhotoView,
) {
  return renderToStaticMarkup(
    <QuestionFillBlank
      question={question}
      disabled={false}
      enableAudio={true}
      questionLevel={questionLevel}
      selectedAnswer={null}
      localLifePhoto={photo}
      showHints={true}
      onSubmit={() => undefined}
    />,
  );
}

describe('QuestionFillBlank', () => {
  it('uses the streamlined word, phonetic, and Chinese stack for full spelling', () => {
    const markup = renderQuestion({
      kind: 'fill-blank',
      prompt: '',
      studyText: 'chemistry',
      word,
      maskedCharacters: Array.from({ length: 9 }, () => '_'),
      missingLetters: [...'chemistry'],
      inputMode: 'full',
    }, 8);

    expect(markup).toContain('question-panel--full-spelling');
    expect(markup).not.toContain('化学 的英语怎么拼');
    expect(markup.indexOf('full-spelling-card__word')).toBeLessThan(markup.indexOf('/ˈkɛmɪstɹi/'));
    expect(markup.indexOf('/ˈkɛmɪstɹi/')).toBeLessThan(markup.indexOf('>化学</strong>'));
    expect(markup).toContain('/ˈkɛmɪstɹi/</span><button class="audio-icon-button"');
    expect(markup).toContain('autofocus=""');
    expect(markup).toContain('inputMode="text"');
    expect(markup).toContain('lang="en-US"');
    expect(markup).toContain('enterKeyHint="done"');
    expect(markup).toContain('full-spelling-card__inline-input');
    expect(markup).toContain('fill-blank-display__cell is-empty is-active');
    expect(markup).toContain('aria-label="拼写输入方式"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('>键盘</button>');
    expect(markup).toContain('>手写</button>');
    expect(markup).toContain(
      'class="full-spelling-card__title-row"><span class="question-word__label">完整拼写</span><div class="spelling-input-method-toggle"',
    );
    expect(markup).toContain('class="full-spelling-actions"><button');
    expect(markup).toContain('>我忘记了</button>');
    expect(markup).not.toContain('class="spelling-entry"');
    expect(markup).not.toContain('>确定</button>');
  });

  it('uses compact single-line letter cells for words longer than nine characters', () => {
    const compactMarkup = renderQuestion({
      kind: 'fill-blank',
      prompt: '',
      studyText: 'congratulations',
      word: { ...word, id: 'ket_congratulations', english: 'congratulations' },
      maskedCharacters: [...'congratulations'].map(() => '_'),
      missingLetters: [...'congratulations'],
      inputMode: 'full',
    }, 8);
    const regularMarkup = renderQuestion({
      kind: 'fill-blank',
      prompt: '',
      studyText: 'chemistry',
      word,
      maskedCharacters: Array.from({ length: 9 }, () => '_'),
      missingLetters: [...'chemistry'],
      inputMode: 'full',
    }, 8);

    expect(compactMarkup).toContain('full-spelling-card__word is-compact');
    expect(compactMarkup).toContain('--spelling-character-count:15');
    expect(regularMarkup).not.toContain('full-spelling-card__word is-compact');
  });

  it('uses Comfy at level 8 even when a life photo is available', () => {
    const markup = renderQuestion({
      kind: 'fill-blank',
      prompt: '',
      studyText: 'chemistry',
      word,
      maskedCharacters: Array.from({ length: 9 }, () => '_'),
      missingLetters: [...'chemistry'],
      inputMode: 'full',
    }, 8, localLifePhoto);

    expect(markup).toContain('/chemistry.webp');
    expect(markup).not.toContain('blob:chemistry-life-photo');
  });

  it('uses a life photo at level 9 and falls back to Comfy when none exists', () => {
    const question: FillBlankQuestion = {
      kind: 'fill-blank',
      prompt: '',
      studyText: 'chemistry',
      word,
      maskedCharacters: Array.from({ length: 9 }, () => '_'),
      missingLetters: [...'chemistry'],
      inputMode: 'full',
    };

    expect(renderQuestion(question, 9, localLifePhoto)).toContain('blob:chemistry-life-photo');
    expect(renderQuestion(question, 9)).toContain('/chemistry.webp');
  });

  it('uses the level 8 card layout for level 7 partial spelling', () => {
    const markup = renderQuestion({
      kind: 'fill-blank',
      prompt: '化学 的英语怎么拼？',
      studyText: 'chemistry',
      word,
      maskedCharacters: ['c', 'h', 'e', 'm', '_', '_', '_', 'r', 'y'],
      missingLetters: ['i', 's', 't'],
      inputMode: 'partial',
    }, 7);

    expect(markup).toContain('question-panel--full-spelling');
    expect(markup).toContain('>部分拼写</span>');
    expect(markup).toContain('full-spelling-card__inline-input');
    expect(markup).toContain('>我忘记了</button>');
    expect(markup).not.toContain('化学 的英语怎么拼？');
    expect(markup).not.toContain('还缺 3 个字母');
    expect(markup).not.toContain('已填写 0/3');
  });

  it('shows the correct level 8 spelling and bilingual example after a wrong answer', () => {
    const markup = renderToStaticMarkup(
      <QuestionFillBlank
        question={{
          kind: 'fill-blank',
          prompt: '',
          studyText: 'chemistry',
          word: {
            ...word,
            examples: ['Chemistry helps us understand materials.'],
            exampleTranslations: ['化学帮助我们了解材料。'],
          },
          maskedCharacters: Array.from({ length: 9 }, () => '_'),
          missingLetters: [...'chemistry'],
          inputMode: 'full',
        }}
        disabled
        enableAudio
        questionLevel={8}
        selectedAnswer="wrong"
        showHints={false}
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain('>c</span>');
    expect(markup).toContain('>y</span>');
    expect(markup).not.toContain('Chemistry helps us understand materials.');
    expect(markup.match(/is-answer-wrong/g)).toHaveLength(9);
  });

  it('shows the correct partial spelling after a wrong or forgotten level 7 answer', () => {
    const markup = renderToStaticMarkup(
      <QuestionFillBlank
        question={{
          kind: 'fill-blank',
          prompt: '',
          studyText: 'chemistry',
          word,
          maskedCharacters: ['c', 'h', 'e', 'm', '_', '_', '_', 'r', 'y'],
          missingLetters: ['i', 's', 't'],
          inputMode: 'partial',
        }}
        disabled
        enableAudio
        questionLevel={7}
        selectedAnswer=""
        showHints={false}
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain('>i</span>');
    expect(markup).toContain('>s</span>');
    expect(markup).toContain('>t</span>');
    expect(markup.match(/is-corrected/g)).toHaveLength(3);
    expect(markup.match(/is-answer-wrong/g)).toHaveLength(3);
  });

  it('shows the bilingual example after either a correct or wrong level 7 answer', () => {
    const level7Question: FillBlankQuestion = {
      kind: 'fill-blank',
      prompt: '',
      studyText: 'chemistry',
      word: {
        ...word,
        examples: ['Chemistry helps us understand materials.'],
        exampleTranslations: ['化学帮助我们了解材料。'],
      },
      maskedCharacters: ['c', 'h', 'e', 'm', '_', '_', '_', 'r', 'y'],
      missingLetters: ['i', 's', 't'],
      inputMode: 'partial',
    };
    const renderAnswered = (selectedAnswer: string) => renderToStaticMarkup(
      <QuestionFillBlank
        question={level7Question}
        disabled
        enableAudio
        questionLevel={7}
        selectedAnswer={selectedAnswer}
        showHints={false}
        onSubmit={() => undefined}
      />,
    );

    expect(renderAnswered('ist')).toContain('Chemistry helps us understand materials.');
    expect(renderAnswered('bad')).toContain('化学帮助我们了解材料。');
    expect(renderAnswered('bad')).toContain('question-example-result is-visible is-reserved');
  });

  it('reveals the bilingual example after a correct level 8 answer', () => {
    const markup = renderToStaticMarkup(
      <QuestionFillBlank
        question={{
          kind: 'fill-blank',
          prompt: '',
          studyText: 'chemistry',
          word: {
            ...word,
            examples: ['Chemistry helps us understand materials.'],
            exampleTranslations: ['化学帮助我们了解材料。'],
          },
          maskedCharacters: Array.from({ length: 9 }, () => '_'),
          missingLetters: [...'chemistry'],
          inputMode: 'full',
        }}
        disabled
        enableAudio
        questionLevel={8}
        selectedAnswer="chemistry"
        showHints={false}
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain('Chemistry helps us understand materials.');
    expect(markup).toContain('化学帮助我们了解材料。');
    expect(markup).toContain('question-example-result is-visible is-reserved');
    expect(markup.match(/is-answer-correct/g)).toHaveLength(9);
  });

  it('removes missing and entered letter counts at level 8', () => {
    const markup = renderQuestion({
      kind: 'fill-blank',
      prompt: '',
      studyText: 'chemistry',
      word,
      maskedCharacters: Array.from({ length: 9 }, () => '_'),
      missingLetters: [...'chemistry'],
      inputMode: 'full',
    }, 8);

    expect(markup).not.toContain('还缺 9 个字母');
    expect(markup).not.toContain('已填写 0/9');
  });

  it('renders spaces in multi-word answers without treating them as input cells', () => {
    const markup = renderQuestion({
      kind: 'fill-blank',
      prompt: '',
      studyText: 'ice cream',
      word: { ...word, id: 'ket_ice_cream_n', english: 'ice cream' },
      maskedCharacters: ['_', '_', '_', ' ', '_', '_', '_', '_', '_'],
      missingLetters: [...'icecream'],
      inputMode: 'full',
    }, 10);

    expect(markup).toContain('is-literal-space');
    expect(markup).toContain('maxLength="8"');
  });

  it('shows the bilingual example after either a correct or wrong level 9 answer', () => {
    const level9Question: FillBlankQuestion = {
      kind: 'fill-blank',
      prompt: '',
      studyText: 'chemistry',
      word: {
        ...word,
        examples: ['Chemistry helps us understand materials.'],
        exampleTranslations: ['化学帮助我们了解材料。'],
      },
      maskedCharacters: Array.from({ length: 9 }, () => '_'),
      missingLetters: [...'chemistry'],
      inputMode: 'full',
    };
    const renderAnswered = (selectedAnswer: string) => renderToStaticMarkup(
      <QuestionFillBlank
        question={level9Question}
        disabled
        enableAudio
        questionLevel={9}
        selectedAnswer={selectedAnswer}
        showHints={false}
        onSubmit={() => undefined}
      />,
    );

    expect(renderAnswered('chemistry')).toContain('Chemistry helps us understand materials.');
    expect(renderAnswered('')).toContain('Chemistry helps us understand materials.');
    expect(renderAnswered('')).toContain('化学帮助我们了解材料。');
    expect(renderAnswered('')).toContain('question-example-result is-visible is-reserved');
  });

  it.each([7, 8, 9])('removes the entire spelling hint panel from level %i', (level) => {
    const markup = renderQuestion({
      kind: 'fill-blank',
      prompt: '',
      studyText: 'chemistry',
      word,
      maskedCharacters: Array.from({ length: 9 }, () => '_'),
      missingLetters: [...'chemistry'],
      inputMode: 'full',
    }, level);

    expect(markup).not.toContain('>拼写提示</span>');
    expect(markup).not.toContain('class="fill-blank-hint"');
    expect(markup).not.toContain('还缺 9 个字母');
  });

  it.each([7, 8, 9])('colors level %i entered letters green after a correct answer', (level) => {
    const markup = renderToStaticMarkup(
      <QuestionFillBlank
        question={{
          kind: 'fill-blank',
          prompt: '',
          studyText: 'chemistry',
          word,
          maskedCharacters: Array.from({ length: 9 }, () => '_'),
          missingLetters: [...'chemistry'],
          inputMode: 'full',
        }}
        disabled
        enableAudio
        questionLevel={level}
        selectedAnswer="chemistry"
        showHints
        onSubmit={() => undefined}
      />,
    );

    expect(markup.match(/is-answer-correct/g)).toHaveLength(9);
    expect(markup).not.toContain('is-answer-wrong');
  });

  it.each([7, 8, 9])('colors level %i corrected letters red after a wrong answer', (level) => {
    const markup = renderToStaticMarkup(
      <QuestionFillBlank
        question={{
          kind: 'fill-blank',
          prompt: '',
          studyText: 'chemistry',
          word,
          maskedCharacters: Array.from({ length: 9 }, () => '_'),
          missingLetters: [...'chemistry'],
          inputMode: 'full',
        }}
        disabled
        enableAudio
        questionLevel={level}
        selectedAnswer="wrongword"
        showHints
        onSubmit={() => undefined}
      />,
    );

    expect(markup.match(/is-answer-wrong/g)).toHaveLength(9);
    expect(markup).not.toContain('is-answer-correct');
  });

  it('removes level 9 phonetic and pronunciation controls', () => {
    const markup = renderToStaticMarkup(
      <QuestionFillBlank
        question={{
          kind: 'fill-blank',
          prompt: '',
          studyText: 'chemistry',
          word,
          maskedCharacters: Array.from({ length: 9 }, () => '_'),
          missingLetters: [...'chemistry'],
          inputMode: 'full',
        }}
        disabled={false}
        enableAudio
        questionLevel={9}
        selectedAnswer={null}
        showHints={false}
        onSubmit={() => undefined}
      />,
    );

    expect(markup).not.toContain('/ˈkɛmɪstɹi/');
    expect(markup).not.toContain('audio-icon-button');
  });
});
