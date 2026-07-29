import type { WordRecord } from '../models/word';
import { getStudyChinese, getStudyText } from './word-service';

export interface SpeechItem {
  text: string;
  lang: 'en-GB' | 'zh-CN';
  rate?: number;
  voiceURI?: string;
  pauseAfterMs?: number;
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
    if (item.pauseAfterMs && item.pauseAfterMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, item.pauseAfterMs));
    }
  }
}

export function playLevelUpSound(): void {
  if (typeof window === 'undefined') return;
  const AudioContextConstructor = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return;

  try {
    const context = new AudioContextConstructor();
    const startedAt = context.currentTime;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, startedAt);
    gain.gain.exponentialRampToValueAtTime(0.08, startedAt + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.72);
    gain.connect(context.destination);

    [523.25, 659.25, 783.99].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const noteStartedAt = startedAt + index * 0.11;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, noteStartedAt);
      oscillator.connect(gain);
      oscillator.start(noteStartedAt);
      oscillator.stop(noteStartedAt + 0.32);
    });

    window.setTimeout(() => {
      void context.close().catch(() => undefined);
    }, 900);
  } catch {
    // Browsers may block AudioContext creation until they see enough user intent.
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
