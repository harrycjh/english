import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LocalLifePhotoView } from '../models/local-media';
import type { FillBlankQuestion } from '../services/question-service';
import {
  applySpellingKey,
  isPortraitSpellingLifePhoto,
  QuestionFillBlank,
} from './QuestionFillBlank';

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
  showDifficultSpellingSkip = false,
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
      showDifficultSpellingSkip={showDifficultSpellingSkip}
      onSubmit={() => undefined}
    />,
  );
}

describe('QuestionFillBlank', () => {
  it('detects only vertical life photos for the level 8 and 9 spelling image adjustment', () => {
    expect(isPortraitSpellingLifePhoto(800, 1200)).toBe(true);
    expect(isPortraitSpellingLifePhoto(1200, 800)).toBe(false);
    expect(isPortraitSpellingLifePhoto(900, 900)).toBe(false);
  });

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
    expect(markup).toContain('question-panel--full-spelling-final');
    expect(markup).not.toContain('化学 的英语怎么拼');
    expect(markup.indexOf('full-spelling-card__word')).toBeLessThan(markup.indexOf('/ˈkɛmɪstɹi/'));
    expect(markup.indexOf('/ˈkɛmɪstɹi/')).toBeLessThan(markup.indexOf('>化学</strong>'));
    expect(markup).toContain('/ˈkɛmɪstɹi/</span><button class="audio-icon-button"');
    expect(markup).toContain('autofocus=""');
    expect(markup).toContain('inputMode="none"');
    expect(markup).toContain('lang="en-US"');
    expect(markup).toContain('spelling-hardware-input');
    expect(markup).toContain('fill-blank-display__cell is-empty is-active');
    expect(markup).toContain('full-spelling-keyboard-shell');
    expect(markup).toContain('aria-label="屏幕英文键盘"');
    expect(markup.match(/aria-label="屏幕英文键盘"/g)).toHaveLength(1);
    expect(markup).toContain('aria-label="字母 Q"');
    expect(markup).toContain('aria-label="删除上一个字母"');
    expect(markup).not.toContain('手写');
    expect(markup).toContain('<span class="question-word__label">完整拼写</span><button');
    expect(markup).toContain('full-spelling-forgot-button--inline');
    expect(markup).toContain('>我忘记了</button>');
    expect(markup).not.toContain('class="full-spelling-actions"');
    expect(markup).not.toContain('爸爸帮我跳过这个单词吧');
    expect(markup).not.toContain('class="spelling-entry"');
    expect(markup).not.toContain('>确定</button>');
  });

  it('offers the dog skip action for repeated four-star level 8 or 9 spelling words', () => {
    const markup = renderQuestion({
      kind: 'fill-blank',
      prompt: '',
      studyText: 'chemistry',
      word: { ...word, difficulty: 4 },
      maskedCharacters: Array.from({ length: 9 }, () => '_'),
      missingLetters: [...'chemistry'],
      inputMode: 'full',
    }, 8, undefined, true);

    expect(markup).toContain('full-spelling-skip-button');
    expect(markup).toContain('我是小狗子（不是小兔子）所以默不出来，爸爸帮我跳过这个单词吧！');
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
    expect(markup).not.toContain('is-full-spelling-life-photo');
  });

  it('reveals the RAZ page and sentence after a correct level 8 spelling answer', () => {
    const razWord = {
      ...word,
      relatedMedia: {
        raz: {
          atlasPath: '/content/images/raz-atlases/atlas-001.webp',
          row: 1,
          column: 2,
          label: 'Level E, E08 Chemistry, Page 6',
          bookId: 'E08',
          level: 'E',
          sequence: 8,
          title: 'Chemistry',
          page: 6,
          matchKind: 'exact' as const,
          matchedTerm: 'chemistry',
          matchedForm: 'chemistry',
          sentence: 'Chemistry helps us understand materials.',
          sentenceTranslation: '化学帮助我们了解材料。',
        },
      },
    };
    const markup = renderToStaticMarkup(
      <QuestionFillBlank
        question={{
          kind: 'fill-blank',
          prompt: '',
          studyText: 'chemistry',
          word: razWord,
          maskedCharacters: Array.from({ length: 9 }, () => '_'),
          missingLetters: [...'chemistry'],
          inputMode: 'full',
        }}
        disabled
        enableAudio
        questionLevel={8}
        selectedAnswer="chemistry"
        relatedResultPhase="revealed"
        showHints={false}
        onContinue={() => undefined}
        onSubmit={() => undefined}
      />,
    );

    expect(markup).toContain('aria-label="RAZ 对应页面"');
    expect(markup).toContain('Chemistry helps us understand materials.');
    expect(markup).toContain('化学帮助我们了解材料。');
    expect(markup).toContain('atlas-001.webp');
    expect(markup).toContain('>继续</button>');
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

    const lifePhotoMarkup = renderQuestion(question, 9, localLifePhoto);
    const fallbackMarkup = renderQuestion(question, 9);

    expect(lifePhotoMarkup).toContain('blob:chemistry-life-photo');
    expect(lifePhotoMarkup).toContain('is-full-spelling-life-photo');
    expect(fallbackMarkup).toContain('/chemistry.webp');
    expect(fallbackMarkup).not.toContain('is-full-spelling-life-photo');
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
    expect(markup).not.toContain('question-panel--full-spelling-final');
    expect(markup).toContain('>部分拼写</span>');
    expect(markup).toContain('spelling-screen-keyboard');
    expect(markup).toContain('class="full-spelling-actions"><button');
    expect(markup).toContain('>我忘记了</button>');
    expect(markup).not.toContain('full-spelling-forgot-button--inline');
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

  it('applies screen keyboard letters and backspace without exceeding the answer length', () => {
    expect(applySpellingKey('', 'C', 3)).toBe('c');
    expect(applySpellingKey('ca', 'T', 3)).toBe('cat');
    expect(applySpellingKey('cat', 'S', 3)).toBe('cat');
    expect(applySpellingKey('cat', 'Backspace', 3)).toBe('ca');
    expect(applySpellingKey('ca', '1', 3)).toBe('ca');
  });
});
