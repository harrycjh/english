import type { Question } from './question-service';
import type { SpeechItem } from './audio-service';
import { getPrimaryExamplePair } from './example-service';
import { getStudyChinese, getStudyText } from './word-service';

export interface StudyAudioPlan {
  beforeAnswer: SpeechItem[];
  afterAnswer: SpeechItem[];
}

export interface RelatedResultAudioPlan {
  beforeReveal: SpeechItem[];
  afterReveal: SpeechItem[];
}

export function splitRelatedResultAudio(
  level: number,
  question: Question,
  items: SpeechItem[],
): RelatedResultAudioPlan {
  const relatedMedia = level === 4
    ? question.word.relatedMedia?.oxford
    : level === 6
      ? question.word.relatedMedia?.redRocket
      : undefined;
  const relatedItemCount = (relatedMedia?.sentence ? 1 : 0)
    + (relatedMedia?.sentenceTranslation ? 1 : 0);

  if (relatedItemCount === 0) {
    return { beforeReveal: items, afterReveal: [] };
  }

  const splitIndex = Math.max(0, items.length - relatedItemCount);
  return {
    beforeReveal: items.slice(0, splitIndex),
    afterReveal: items.slice(splitIndex),
  };
}

export function getStudyAudioPlan(
  level: number,
  question: Question,
  answerCorrect = true,
): StudyAudioPlan {
  const beforeAnswer: SpeechItem[] = [];
  const afterAnswer: SpeechItem[] = [];
  const example = getPrimaryExamplePair(question.word);
  const pushExample = () => {
    if (example?.sentence) {
      afterAnswer.push({ text: example.sentence, lang: 'en-GB', rate: 0.86 });
    }
    if (example?.translation) {
      afterAnswer.push({ text: example.translation, lang: 'zh-CN' });
    }
  };

  if (level === 0 || level === 1 || level === 3 || level === 4) {
    beforeAnswer.push({ text: getStudyText(question.word), lang: 'en-GB' });
  } else if (level === 2 || (level >= 6 && level <= 8)) {
    beforeAnswer.push({ text: getStudyChinese(question.word), lang: 'zh-CN' });
  }

  if (level === 0 || level === 1) {
    afterAnswer.push({ text: getStudyChinese(question.word), lang: 'zh-CN' });
    pushExample();
  } else if (level === 2) {
    afterAnswer.push({ text: getStudyText(question.word), lang: 'en-GB' });
    if (answerCorrect) pushExample();
  } else if (level === 3 && answerCorrect) {
    pushExample();
  } else if (level === 3) {
    afterAnswer.push({ text: getStudyText(question.word), lang: 'en-GB' });
    pushExample();
  } else if (level === 4 && answerCorrect) {
    afterAnswer.push({ text: getStudyChinese(question.word), lang: 'zh-CN' });
    pushExample();
    const oxfordSentence = question.word.relatedMedia?.oxford?.sentence;
    if (oxfordSentence) {
      afterAnswer.push({ text: oxfordSentence, lang: 'en-GB', rate: 0.86 });
      const translation = question.word.relatedMedia?.oxford?.sentenceTranslation;
      if (translation) afterAnswer.push({ text: translation, lang: 'zh-CN' });
    }
  } else if (level === 4) {
    afterAnswer.push({ text: getStudyText(question.word), lang: 'en-GB' });
    afterAnswer.push({ text: getStudyChinese(question.word), lang: 'zh-CN' });
  } else if (level === 5 && question.kind === 'sentence-choice') {
    afterAnswer.push({ text: question.sentence, lang: 'en-GB', rate: 0.86 });
    if (question.sentenceTranslation) {
      afterAnswer.push({ text: question.sentenceTranslation, lang: 'zh-CN' });
    }
  } else if (level === 6 && answerCorrect) {
    afterAnswer.push({ text: getStudyText(question.word), lang: 'en-GB' });
    pushExample();
    const redRocketSentence = question.word.relatedMedia?.redRocket?.sentence;
    if (redRocketSentence) {
      afterAnswer.push({ text: redRocketSentence, lang: 'en-GB', rate: 0.86 });
      const translation = question.word.relatedMedia?.redRocket?.sentenceTranslation;
      if (translation) afterAnswer.push({ text: translation, lang: 'zh-CN' });
    }
  } else if (level === 6) {
    afterAnswer.push({ text: getStudyText(question.word), lang: 'en-GB' });
    afterAnswer.push({ text: getStudyChinese(question.word), lang: 'zh-CN' });
  } else if (level === 7) {
    if (!answerCorrect) {
      afterAnswer.push({ text: getStudyText(question.word), lang: 'en-GB' });
      afterAnswer.push({ text: getStudyChinese(question.word), lang: 'zh-CN' });
    }
    pushExample();
  } else if (level === 8) {
    afterAnswer.push({ text: getStudyText(question.word), lang: 'en-GB' });
    if (answerCorrect) pushExample();
  } else if (level === 9) {
    afterAnswer.push({ text: getStudyText(question.word), lang: 'en-GB' });
    if (answerCorrect) {
      pushExample();
    } else {
      afterAnswer.push({ text: getStudyChinese(question.word), lang: 'zh-CN' });
      pushExample();
    }
  }

  return { beforeAnswer, afterAnswer };
}
