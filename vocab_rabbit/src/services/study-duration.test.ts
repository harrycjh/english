import { describe, expect, it } from 'vitest';
import type { AnswerEvent } from '../models/answer-event';
import {
  DEFAULT_QUESTION_DURATION_MS,
  MAX_QUESTION_DURATION_MS,
  QUESTION_DURATION_PRIOR_SAMPLES,
  calculateQuestionDurationMs,
  calculateStudyDurationByDate,
  estimateQuestionDurationMs,
  formatStudyDuration,
  sumStudyDuration,
} from './study-duration';

function event(
  id: string,
  dateKey: string,
  time: string,
  responseTimeMs: number,
): AnswerEvent {
  return {
    id,
    wordId: `word-${id}`,
    dateKey,
    answeredAt: `${dateKey}T${time}.000Z`,
    questionKind: 'text-choice',
    selectedAnswer: '',
    correctAnswer: '',
    isCorrect: true,
    responseTimeMs,
  };
}

/** `10:00:00` plus the given number of seconds, as an `HH:MM:SS` clock time. */
function clockAt(offsetSeconds: number): string {
  const total = (10 * 3600) + offsetSeconds;
  const hours = String(Math.floor(total / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

describe('constants', () => {
  it('caps a question at two minutes and priors it at fifteen seconds', () => {
    expect(MAX_QUESTION_DURATION_MS).toBe(120_000);
    expect(DEFAULT_QUESTION_DURATION_MS).toBe(15_000);
    expect(QUESTION_DURATION_PRIOR_SAMPLES).toBe(12);
  });
});

describe('calculateQuestionDurationMs', () => {
  it('uses the recorded think time for the first answer of a run', () => {
    expect(calculateQuestionDurationMs(event('a', '2026-08-01', '10:00:00', 6_000))).toBe(6_000);
  });

  it('prefers the gap between answers because it also covers feedback and audio', () => {
    const first = event('a', '2026-08-01', '10:00:00', 6_000);
    const second = event('b', '2026-08-01', '10:00:14', 6_000);

    expect(calculateQuestionDurationMs(second, first)).toBe(14_000);
  });

  it('treats an oversized gap as a break and bills only the think time', () => {
    const first = event('a', '2026-08-01', '10:00:00', 6_000);
    const afterBreak = event('b', '2026-08-01', '10:31:00', 9_000);

    expect(calculateQuestionDurationMs(afterBreak, first)).toBe(9_000);
  });

  it('keeps a gap that lands exactly on the cap', () => {
    const first = event('a', '2026-08-01', '10:00:00', 1_000);
    const second = event('b', '2026-08-01', '10:02:00', 1_000);

    expect(calculateQuestionDurationMs(second, first)).toBe(120_000);
  });

  it('caps a runaway think time so one walk-away cannot skew a day', () => {
    expect(calculateQuestionDurationMs(event('a', '2026-08-01', '10:00:00', 900_000))).toBe(120_000);
  });

  it('never bills negative or unusable times', () => {
    expect(calculateQuestionDurationMs(event('a', '2026-08-01', '10:00:00', -50))).toBe(0);
    expect(calculateQuestionDurationMs(event('a', '2026-08-01', '10:00:00', Number.NaN))).toBe(0);
  });

  it('falls back to the think time when a timestamp is unreadable', () => {
    const broken = { ...event('a', '2026-08-01', '10:00:00', 6_000), answeredAt: 'not-a-date' };
    const second = event('b', '2026-08-01', '10:00:20', 7_000);

    expect(calculateQuestionDurationMs(second, broken)).toBe(7_000);
  });

  it('ignores an out-of-order pair rather than billing a negative gap', () => {
    const later = event('a', '2026-08-01', '10:00:30', 6_000);
    const earlier = event('b', '2026-08-01', '10:00:10', 4_000);

    expect(calculateQuestionDurationMs(earlier, later)).toBe(4_000);
  });

  it('never returns less than the recorded think time', () => {
    const first = event('a', '2026-08-01', '10:00:00', 3_000);
    const retried = event('b', '2026-08-01', '10:00:02', 9_000);

    expect(calculateQuestionDurationMs(retried, first)).toBe(9_000);
  });
});

describe('calculateStudyDurationByDate', () => {
  it('sums a continuous run as wall-clock time', () => {
    const durations = calculateStudyDurationByDate([
      event('a', '2026-08-01', '10:00:00', 8_000),
      event('b', '2026-08-01', '10:00:12', 5_000),
      event('c', '2026-08-01', '10:00:30', 6_000),
    ]);

    // 8s think time for the first, then 12s and 18s of real elapsed time.
    expect(durations.get('2026-08-01')).toEqual({
      dateKey: '2026-08-01',
      durationMs: 38_000,
      answerCount: 3,
    });
  });

  it('excludes the break between two sessions on the same day', () => {
    const durations = calculateStudyDurationByDate([
      event('a', '2026-08-01', '08:00:00', 10_000),
      event('b', '2026-08-01', '08:00:10', 5_000),
      event('c', '2026-08-01', '20:00:00', 7_000),
      event('d', '2026-08-01', '20:00:09', 5_000),
    ]);

    expect(durations.get('2026-08-01')?.durationMs).toBe(36_000);
  });

  it('keeps each study day separate', () => {
    const durations = calculateStudyDurationByDate([
      event('a', '2026-08-01', '10:00:00', 4_000),
      event('b', '2026-08-02', '10:00:00', 9_000),
    ]);

    expect(durations.get('2026-08-01')?.durationMs).toBe(4_000);
    expect(durations.get('2026-08-02')?.durationMs).toBe(9_000);
  });

  it('orders by answer time even when the log arrives shuffled', () => {
    const ordered = calculateStudyDurationByDate([
      event('a', '2026-08-01', '10:00:00', 8_000),
      event('b', '2026-08-01', '10:00:12', 5_000),
    ]);
    const shuffled = calculateStudyDurationByDate([
      event('b', '2026-08-01', '10:00:12', 5_000),
      event('a', '2026-08-01', '10:00:00', 8_000),
    ]);

    expect(shuffled.get('2026-08-01')).toEqual(ordered.get('2026-08-01'));
    expect(shuffled.get('2026-08-01')?.durationMs).toBe(20_000);
  });

  it('returns nothing for an empty log', () => {
    expect(calculateStudyDurationByDate([]).size).toBe(0);
  });

  it('still bills the batch shortcut that records no think time', () => {
    const durations = calculateStudyDurationByDate([
      event('a', '2026-08-01', '10:00:00', 5_000),
      event('b', '2026-08-01', '10:00:01', 0),
      event('c', '2026-08-01', '10:00:02', 0),
    ]);

    expect(durations.get('2026-08-01')?.durationMs).toBe(7_000);
  });
});

describe('sumStudyDuration', () => {
  it('adds up every day', () => {
    const durations = calculateStudyDurationByDate([
      event('a', '2026-08-01', '10:00:00', 4_000),
      event('b', '2026-08-02', '10:00:00', 9_000),
    ]);

    expect(sumStudyDuration(durations.values())).toBe(13_000);
  });

  it('is zero with nothing to add', () => {
    expect(sumStudyDuration([])).toBe(0);
  });
});

describe('estimateQuestionDurationMs', () => {
  it('falls back to the prior with no answers at all', () => {
    expect(estimateQuestionDurationMs([])).toBe(15_000);
  });

  it('pulls a small sample most of the way back to the prior', () => {
    // One 35s sample: 1/(1+12) of the way from 15s toward 35s.
    expect(estimateQuestionDurationMs([
      event('a', '2026-08-01', '10:00:00', 35_000),
    ])).toBe(16_538);
  });

  it('trusts a large sample far more than the prior', () => {
    const events = Array.from({ length: 60 }, (_, index) => event(
      `e-${index}`,
      '2026-08-01',
      clockAt(index * 30),
      30_000,
    ));

    // Median 30s with 60 samples: 60/72 of the way from 15s toward 30s.
    expect(estimateQuestionDurationMs(events)).toBe(27_500);
  });

  it('uses the median so one abandoned question cannot drag the estimate up', () => {
    const steady = Array.from({ length: 20 }, (_, index) => event(
      `e-${index}`,
      '2026-08-01',
      clockAt(index * 10),
      10_000,
    ));
    const withOutlier = [...steady, event('slow', '2026-08-01', '11:00:00', 119_000)];

    // Median 10s with 20 samples: 20/32 of the way from the 15s prior toward 10s.
    expect(estimateQuestionDurationMs(steady)).toBe(11_875);
    expect(estimateQuestionDurationMs(withOutlier)).toBe(11_818);
  });
});

describe('formatStudyDuration', () => {
  it('reads seconds below a minute', () => {
    expect(formatStudyDuration(45_000)).toBe('45 秒');
  });

  it('reads minutes below an hour', () => {
    expect(formatStudyDuration(8 * 60_000)).toBe('8 分钟');
    expect(formatStudyDuration(59 * 60_000)).toBe('59 分钟');
  });

  it('reads hours and minutes above an hour', () => {
    expect(formatStudyDuration(65 * 60_000)).toBe('1 小时 5 分钟');
    expect(formatStudyDuration(100 * 60_000)).toBe('1 小时 40 分钟');
    expect(formatStudyDuration(120 * 60_000)).toBe('2 小时');
  });

  it('shows nothing rather than a negative or missing duration', () => {
    expect(formatStudyDuration(0)).toBe('0 分钟');
    expect(formatStudyDuration(-1)).toBe('0 分钟');
    expect(formatStudyDuration(Number.NaN)).toBe('0 分钟');
  });
});
