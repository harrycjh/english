import type { WordRecord } from '../models/word';
import { getStudyChinese, getStudyText } from './word-service';

export interface SpeechItem {
  text: string;
  lang: 'en-GB' | 'zh-CN';
  rate?: number;
  voiceURI?: string;
}

export interface SpeechVoiceOption {
  voiceURI: string;
  name: string;
  lang: string;
  localService: boolean;
  isDefault: boolean;
}

export interface SpeechVoicePreferences {
  englishVoiceURI: string;
  chineseVoiceURI: string;
}

let voicePreferences: SpeechVoicePreferences = {
  englishVoiceURI: '',
  chineseVoiceURI: '',
};

function canSpeak(): boolean {
  return typeof window !== 'undefined'
    && 'speechSynthesis' in window
    && typeof SpeechSynthesisUtterance !== 'undefined';
}

function speakItem(item: SpeechItem): Promise<void> {
  if (!canSpeak() || !item.text.trim()) return Promise.resolve();

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(item.text);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(fallbackTimer);
      resolve();
    };
    utterance.lang = item.lang;
    utterance.rate = item.rate ?? (item.lang === 'zh-CN' ? 0.92 : 0.9);
    const preferredVoiceURI = item.voiceURI
      ?? (item.lang === 'zh-CN' ? voicePreferences.chineseVoiceURI : voicePreferences.englishVoiceURI);
    if (preferredVoiceURI) {
      const preferredVoice = window.speechSynthesis.getVoices()
        .find((voice) => voice.voiceURI === preferredVoiceURI);
      if (preferredVoice) utterance.voice = preferredVoice;
    }
    utterance.onend = finish;
    utterance.onerror = finish;
    const fallbackTimer = window.setTimeout(
      finish,
      Math.min(12_000, Math.max(2_500, item.text.length * 180)),
    );
    window.speechSynthesis.speak(utterance);
  });
}

export function configureSpeechVoices(preferences: SpeechVoicePreferences): void {
  voicePreferences = { ...preferences };
}

export function isSelectableEnglishVoice(
  voice: Pick<SpeechSynthesisVoice, 'name' | 'lang'>,
): boolean {
  const name = voice.name.trim().toLowerCase();
  const baseName = name.split('(')[0].trim();
  const lang = voice.lang.trim().toLowerCase();

  return (baseName === 'daniel' && lang === 'en-gb')
    || (baseName === 'karen' && lang === 'en-au')
    || (baseName === 'samantha' && lang === 'en-us')
    || (name.includes('google') && lang.startsWith('en'));
}

export function getAvailableSpeechVoices(language: 'en' | 'zh'): SpeechVoiceOption[] {
  if (!canSpeak()) return [];
  const prefix = language.toLowerCase();
  const uniqueVoices = new Map<string, SpeechSynthesisVoice>();
  for (const voice of window.speechSynthesis.getVoices()) {
    if (!voice.lang.toLowerCase().startsWith(prefix)) continue;
    if (language === 'en' && !isSelectableEnglishVoice(voice)) continue;
    uniqueVoices.set(voice.voiceURI, voice);
  }
  return [...uniqueVoices.values()]
    .sort((left, right) => Number(right.default) - Number(left.default)
      || Number(right.localService) - Number(left.localService)
      || left.name.localeCompare(right.name))
    .map((voice) => ({
      voiceURI: voice.voiceURI,
      name: voice.name,
      lang: voice.lang,
      localService: voice.localService,
      isDefault: voice.default,
    }));
}

export function subscribeSpeechVoices(listener: () => void): () => void {
  if (!canSpeak()) return () => undefined;
  const update = () => listener();
  window.speechSynthesis.addEventListener('voiceschanged', update);
  const retryTimer = window.setTimeout(update, 300);
  update();
  return () => {
    window.clearTimeout(retryTimer);
    window.speechSynthesis.removeEventListener('voiceschanged', update);
  };
}

export async function speakSequence(items: SpeechItem[]): Promise<void> {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  for (const item of items) {
    await speakItem(item);
  }
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

export function speakWord(word: WordRecord): void {
  void speakSequence([{ text: getStudyText(word), lang: 'en-GB' }]);
}

export function speakChinese(word: WordRecord): void {
  void speakSequence([{ text: getStudyChinese(word), lang: 'zh-CN' }]);
}

export function speakSentence(sentence: string): void {
  void speakSequence([{ text: sentence, lang: 'en-GB', rate: 0.86 }]);
}
