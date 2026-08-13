import { afterEach, describe, expect, it, vi } from 'vitest';
import * as audioService from './audio-service';

const { isSelectableEnglishVoice, playLevelUpSound } = audioService;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isSelectableEnglishVoice', () => {
  it.each([
    ['Daniel', 'en-GB'],
    ['Daniel (Enhanced)', 'en-GB'],
    ['Karen', 'en-AU'],
    ['Samantha', 'en-US'],
    ['Google UK English Female', 'en-GB'],
    ['Google US English', 'en-US'],
  ])('keeps the approved English voice %s (%s)', (name, lang) => {
    expect(isSelectableEnglishVoice({ name, lang })).toBe(true);
  });

  it.each([
    ['Daniel', 'en-US'],
    ['Karen', 'en-GB'],
    ['Bad News', 'en-US'],
    ['Ting-Ting', 'zh-CN'],
  ])('filters out the unapproved voice %s (%s)', (name, lang) => {
    expect(isSelectableEnglishVoice({ name, lang })).toBe(false);
  });

  it('silently skips the level-up cue when WebAudio is unavailable', () => {
    expect(() => playLevelUpSound()).not.toThrow();
  });

  it('primes one reusable audio context during the answer gesture', () => {
    const instances: FakeAudioContext[] = [];

    class FakeAudioContext {
      currentTime = 0;
      destination = {};
      state: AudioContextState = 'suspended';
      resume = vi.fn(async () => {
        this.state = 'running';
      });
      close = vi.fn(async () => undefined);

      constructor() {
        instances.push(this);
      }

      createGain() {
        return {
          gain: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        };
      }

      createOscillator = vi.fn(() => ({
        type: 'sine',
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }));
    }

    vi.stubGlobal('window', {
      AudioContext: FakeAudioContext,
      setTimeout: vi.fn(),
    });

    const primeLevelUpSound = (audioService as typeof audioService & {
      primeLevelUpSound?: () => void;
    }).primeLevelUpSound;

    expect(primeLevelUpSound).toBeTypeOf('function');
    primeLevelUpSound?.();
    playLevelUpSound();

    expect(instances).toHaveLength(1);
    expect(instances[0].resume).toHaveBeenCalledOnce();
    expect(instances[0].createOscillator).toHaveBeenCalledTimes(3);
  });
});
