import type { WordRecord } from '../models/word';
import { getStudyText } from './word-service';

export function speakWord(word: WordRecord): void {
  if (!('speechSynthesis' in window)) {
    return;
  }

  const utterance = new SpeechSynthesisUtterance(getStudyText(word));
  utterance.lang = 'en-GB';
  utterance.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}