import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildWordPronunciationRequest,
  describeWordPronunciationEvaluation,
  describeSpeechEvaluationFailure,
  getCachedSpeechEvaluationWarrant,
  parseWordPronunciationEvaluation,
  resetPronunciationPreparationCacheForTests,
} from './pronunciation-practice';

beforeEach(() => {
  resetPronunciationPreparationCacheForTests();
});

describe('parseWordPronunciationEvaluation', () => {
  it('normalizes the Alibaba word score and keeps its record id', () => {
    expect(parseWordPronunciationEvaluation(JSON.stringify({
      recordId: 'record-a',
      result: {
        overall: '82.4',
        wavetime: 2100,
        info: { volume: 62, snr: 24.5, tipId: 0 },
        details: [{ score: 81 }],
      },
    }))).toEqual({
      score: 82,
      recordId: 'record-a',
      audioDurationMs: 2100,
      inputVolume: 62,
      signalToNoise: 24.5,
      tipId: 0,
      wordScore: 81,
    });
  });

  it('rejects malformed evaluation results', () => {
    expect(() => parseWordPronunciationEvaluation({ result: {} }))
      .toThrow('语音评测没有返回有效分数');
  });
});

describe('buildWordPronunciationRequest', () => {
  it('uses the lenient American child word evaluator', () => {
    expect(buildWordPronunciationRequest('Rabbit', 'warrant-a')).toEqual({
      coreType: 'en.word_kid.score',
      refText: 'Rabbit',
      rank: 100,
      precision: 0.5,
      attachAudioUrl: 0,
      typeThres: 2,
      accent: 'am',
      evalTime: 5_000,
      warrantId: 'warrant-a',
    });
  });
});

describe('describeWordPronunciationEvaluation', () => {
  it('explains an empty recording instead of treating zero as a completed score', () => {
    expect(describeWordPronunciationEvaluation({ score: 0, tipId: 10000 }))
      .toContain('没有录到声音');
  });

  it('explains a low-volume recording', () => {
    expect(describeWordPronunciationEvaluation({ score: 0, tipId: 10004 }))
      .toContain('声音有点小');
  });
});

describe('describeSpeechEvaluationFailure', () => {
  it('turns authorization failures into a useful message', () => {
    expect(describeSpeechEvaluationFailure(JSON.stringify({ errId: 41030 })))
      .toContain('授权无效（41030）');
  });

  it('keeps unknown Alibaba error codes visible', () => {
    expect(describeSpeechEvaluationFailure({ errId: 53000 }))
      .toContain('53000');
  });
});

describe('getCachedSpeechEvaluationWarrant', () => {
  it('reuses a valid warrant for the same device', async () => {
    const request = vi.fn(async () => ({
      applicationId: 'speech-app',
      userId: 'device-a',
      warrantId: 'warrant-a',
      expiresAt: 1_784_800_000,
    }));

    await getCachedSpeechEvaluationWarrant('token-a', request, 1_784_790_000_000);
    const result = await getCachedSpeechEvaluationWarrant('token-a', request, 1_784_790_100_000);

    expect(result.warrantId).toBe('warrant-a');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('requests a new warrant when the cached one is close to expiry', async () => {
    const request = vi.fn(async () => ({
      applicationId: 'speech-app',
      userId: 'device-a',
      warrantId: `warrant-${request.mock.calls.length}`,
      expiresAt: 1_784_800_000,
    }));

    await getCachedSpeechEvaluationWarrant('token-a', request, 1_784_790_000_000);
    await getCachedSpeechEvaluationWarrant('token-a', request, 1_784_799_950_000);

    expect(request).toHaveBeenCalledTimes(2);
  });
});
