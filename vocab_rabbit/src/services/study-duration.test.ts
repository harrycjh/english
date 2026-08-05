import { describe, expect, it } from 'vitest';
import type { AnswerEvent } from '../models/answer-event';
import {
  DEFAULT_QUESTION_DURATION_MS,
  MAX_QUESTION_DURATION_MS,
  QUESTION_DURATION_PRIOR_SAMPLES,
  calculateQuestionDurationMs,
  calculateStudyDurationByDate,
  estimateQuestionDurationMs,
  estimateWordDurationMs,
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

describe('estimateWordDurationMs', () => {
  /** One study day of `count` words answered `gapSeconds` apart, some repeated. */
  function studyDay(
    dateKey: string,
    wordIds: string[],
    gapSeconds: number,
    responseTimeMs = 1_000,
  ): AnswerEvent[] {
    return wordIds.map((wordId, index) => ({
      ...event(`${dateKey}-${index}`, dateKey, clockAt(index * gapSeconds), responseTimeMs),
      wordId,
    }));
  }

  /**
   * What the debug 「全部答对」 shortcut writes: answers stamped exactly a second
   * apart, with a real think time only on the question that was really shown.
   */
  function shortcutDay(
    dateKey: string,
    wordIds: string[],
    startSeconds = 0,
  ): AnswerEvent[] {
    return wordIds.map((wordId, index) => ({
      ...event(
        `${dateKey}-all-${index}`,
        dateKey,
        clockAt(startSeconds + index),
        index === 0 ? 3_000 : 0,
      ),
      wordId,
    }));
  }

  it('falls back to the prior with no answers at all', () => {
    expect(estimateWordDurationMs([])).toBe(20_000);
  });

  it('pools a day total over the words it covered rather than the questions', () => {
    // 5 words, but "b" was wrong once so it cost 6 questions. The day runs
    // 5 x 12s of measurable gaps = 60s plus the 1s fallback on the first
    // answer, so 61s over 5 words = 12.2s per word. With 5 words that is
    // 5/25 of the way from the 20s prior toward 12.2s.
    const events = studyDay('2026-08-01', ['a', 'b', 'c', 'b', 'd', 'e'], 12);

    expect(estimateWordDurationMs(events)).toBe(18_440);
  });

  it('charges retries to the word so a struggling day reads slower than a clean one', () => {
    const clean = studyDay('2026-08-01', ['a', 'b', 'c', 'd', 'e', 'f'], 10);
    const struggled = studyDay('2026-08-01', ['a', 'a', 'b', 'b', 'c', 'c'], 10);

    // Same six questions and the same 51s of wall clock either way, but the
    // clean day covered six words and the hard day only three.
    expect(estimateWordDurationMs(clean)).toBe(17_346);
    expect(estimateWordDurationMs(struggled)).toBe(19_609);
  });

  it('trusts a long history far more than the prior', () => {
    const events = Array.from({ length: 10 }, (_, day) => studyDay(
      `2026-08-${String(day + 1).padStart(2, '0')}`,
      Array.from({ length: 10 }, (_, index) => `word-${index}`),
      30,
    )).flat();

    // Each day: 9 x 30s + a 1s fallback = 271s over 10 words = 27.1s per word.
    // 100 words weigh 100/120 against the 20s prior.
    expect(estimateWordDurationMs(events)).toBe(25_917);
  });

  it('ignores study days older than the recent window', () => {
    const recent = Array.from({ length: 14 }, (_, day) => studyDay(
      `2026-08-${String(day + 1).padStart(2, '0')}`,
      Array.from({ length: 10 }, (_, index) => `word-${index}`),
      10,
    )).flat();
    const withAncientSlowDay = [
      ...studyDay('2020-01-01', ['old-a', 'old-b'], 110),
      ...recent,
    ];

    expect(estimateWordDurationMs(withAncientSlowDay)).toBe(estimateWordDurationMs(recent));
  });

  it('treats a break longer than the cap as a pause, not study time', () => {
    const withLongBreak = studyDay('2026-08-01', ['a', 'b'], 600, 30_000);
    const uninterrupted = studyDay('2026-08-01', ['a', 'b'], 60, 30_000);

    // The 600s gap is past the 120s cap, so the second answer falls back to its
    // 30s think time: 60s over 2 words. The 60s gap is inside the cap and bills
    // in full, so the same two answers pool 90s over the same 2 words.
    expect(estimateWordDurationMs(withLongBreak)).toBe(20_909);
    expect(estimateWordDurationMs(uninterrupted)).toBe(22_273);
  });

  it('ignores the answers the 「全部答对」 shortcut writes for itself', () => {
    const shortcut = shortcutDay(
      '2026-08-01',
      Array.from({ length: 51 }, (_, index) => `word-${index}`),
    );

    // Billed literally these are 51 words in 53s, which would teach the
    // estimate that a word costs a second. Nothing here is a real answer, so
    // the day is dropped and only the prior is left.
    expect(estimateWordDurationMs(shortcut)).toBe(20_000);
  });

  it('keeps the real half of a day the shortcut was also used on', () => {
    const real = studyDay('2026-08-01', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 20, 5_000);
    const polluted = [
      ...real,
      ...shortcutDay('2026-08-01', Array.from({ length: 51 }, (_, index) => `w-${index}`), 3_600),
    ];

    // 8 real words cost 5s + 7 x 20s = 145s. The shortcut only contributes the
    // one question that really was answered, an hour later and so past the cap,
    // billing its 3s think time: 148s over 9 words instead of 198s over 59.
    expect(estimateWordDurationMs(real)).toBe(19_464);
    expect(estimateWordDurationMs(polluted)).toBe(18_897);
  });

  it('drops a day that is fast per word however long it ran in total', () => {
    const wordIds = Array.from({ length: 60 }, (_, index) => `word-${index}`);
    const impossible = studyDay('2026-08-01', wordIds, 2, 2_000);
    const merelyQuick = studyDay('2026-08-01', wordIds, 6, 6_000);

    // Both days run for minutes on end, so a total-based check would keep them
    // either way. 2s a word is below anything a person can do and goes; 6s a
    // word is fast but reachable and stays.
    expect(estimateWordDurationMs(impossible)).toBe(20_000);
    expect(estimateWordDurationMs(merelyQuick)).toBe(9_500);
  });

  it('measures the pace against every word of the day', () => {
    const wordIds = Array.from({ length: 6 }, (_, index) => `word-${index}`);
    const justUnder = studyDay('2026-08-01', wordIds, 5, 2_000);
    const justOver = studyDay('2026-08-01', wordIds, 6, 2_000);

    // 27s over 6 words is 4.5s each and goes; 32s over the same 6 words is
    // 5.33s each and stays. Dividing by anything but the day's own word count
    // puts both on the same side of the floor.
    expect(estimateWordDurationMs(justUnder)).toBe(20_000);
    expect(estimateWordDurationMs(justOver)).toBe(16_615);
  });

  it('leaves the recorded day totals alone', () => {
    const shortcut = shortcutDay(
      '2026-08-01',
      Array.from({ length: 51 }, (_, index) => `word-${index}`),
    );

    // Day totals report what the log says happened rather than how fast a
    // person can go, so they still count every answer the shortcut wrote.
    expect(calculateStudyDurationByDate(shortcut).get('2026-08-01')).toEqual({
      dateKey: '2026-08-01',
      durationMs: 53_000,
      answerCount: 51,
    });
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
