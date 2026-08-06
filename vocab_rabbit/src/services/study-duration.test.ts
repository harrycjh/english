import { describe, expect, it } from 'vitest';
import type { AnswerEvent } from '../models/answer-event';
import {
  DEFAULT_QUESTION_DURATION_MS,
  MAX_QUESTION_DURATION_MS,
  QUESTION_DURATION_PRIOR_SAMPLES,
  calculateQuestionDurationMs,
  calculateStudyDurationByDate,
  estimateQuestionDurationMs,
  LEVEL_DURATION_PRIOR_WORDS,
  estimateSessionDuration,
  estimateWordDurationByLevel,
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

/** One study day of `count` words answered `gapSeconds` apart, some repeated. */
function studyDay(
  dateKey: string,
  wordIds: string[],
  gapSeconds: number,
  responseTimeMs = 1_000,
  startSeconds = 0,
): AnswerEvent[] {
  return wordIds.map((wordId, index) => ({
    ...event(
      `${dateKey}-${wordId}-${index}`,
      dateKey,
      clockAt(startSeconds + index * gapSeconds),
      responseTimeMs,
    ),
    wordId,
  }));
}

/**
 * One study day where every word was sitting at `level` when the day's first
 * question about it was asked.
 */
function levelDay(
  dateKey: string,
  level: number,
  wordIds: string[],
  gapSeconds: number,
  startSeconds = 0,
): AnswerEvent[] {
  return studyDay(dateKey, wordIds, gapSeconds, 8_000, startSeconds).map((entry) => ({
    ...entry,
    id: `${entry.id}-lv${level}`,
    learningStateBefore: {
      wordId: entry.wordId,
      masteryLevel: level,
      reviewStage: level,
      correctStreak: 0,
      wrongCount: 0,
      lastStudiedAt: null,
      nextDueAt: null,
    },
  }));
}

describe('estimateWordDurationMs', () => {

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
    // 5 words, but "b" was wrong once so it cost 6 questions. The day's first
    // answer has no earlier stamp to measure against and only bills its 1s
    // think time, so "a" falls under the floor and drops out. That leaves
    // b at 24s and c, d, e at 12s: 60s over 4 words = 15s per word, which with
    // 4 words is 4/24 of the way from the 20s prior toward 15s.
    const events = studyDay('2026-08-01', ['a', 'b', 'c', 'b', 'd', 'e'], 12);

    expect(estimateWordDurationMs(events)).toBe(19_167);
  });

  it('charges retries to the word so a struggling day reads slower than a clean one', () => {
    const clean = studyDay('2026-08-01', ['a', 'b', 'c', 'd', 'e', 'f'], 10);
    const struggled = studyDay('2026-08-01', ['a', 'a', 'b', 'b', 'c', 'c'], 10);

    // Same six questions and the same 51s of wall clock either way. The clean
    // day covers five measurable words at 10s each; the hard day covers three,
    // and "a" keeps both of its questions, so it reads 17s a word.
    expect(estimateWordDurationMs(clean)).toBe(18_000);
    expect(estimateWordDurationMs(struggled)).toBe(19_609);
  });

  it('trusts a long history far more than the prior', () => {
    const events = Array.from({ length: 10 }, (_, day) => studyDay(
      `2026-08-${String(day + 1).padStart(2, '0')}`,
      Array.from({ length: 10 }, (_, index) => `word-${index}`),
      30,
    )).flat();

    // Each day covers 10 words but only 9 are measurable: the first answer has
    // no earlier stamp and bills 1s. 9 x 30s = 270s over 9 words, and 90 words
    // weigh 90/110 against the 20s prior.
    expect(estimateWordDurationMs(events)).toBe(28_182);
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
    // billing a 3s think time that the floor then rejects. The morning's study
    // is left reading exactly as it did before the shortcut was ever pressed.
    expect(estimateWordDurationMs(real)).toBe(19_464);
    expect(estimateWordDurationMs(polluted)).toBe(19_464);
  });

  it('weighs each word on its own so half a real day survives the other half', () => {
    const real = studyDay('2026-08-01', ['a', 'b', 'c', 'd', 'e', 'f'], 20, 8_000);
    const generated = studyDay('2026-08-01', ['g', 'h', 'i', 'j'], 1, 1_000, 3_600);

    // The generated words have a think time, so only the floor can catch them,
    // and pooling the day would hide them: 112s over 10 words averages 11.2s
    // and reads perfectly ordinary. Checked one word at a time all four go and
    // the six real ones are untouched.
    expect(estimateWordDurationMs(real)).toBe(19_538);
    expect(estimateWordDurationMs([...real, ...generated])).toBe(19_538);
  });

  it('drops a run that is fast per word however long it ran in total', () => {
    const wordIds = Array.from({ length: 60 }, (_, index) => `word-${index}`);
    const impossible = studyDay('2026-08-01', wordIds, 2, 2_000);
    const merelyQuick = studyDay('2026-08-01', wordIds, 6, 6_000);

    // Both runs go on for minutes, so a total-based check would keep them
    // either way. 2s a word is below anything a person can do and goes; 6s a
    // word is fast but reachable and stays.
    expect(estimateWordDurationMs(impossible)).toBe(20_000);
    expect(estimateWordDurationMs(merelyQuick)).toBe(9_500);
  });

  it('ignores answers with no think time however far apart they are stamped', () => {
    const generated = Array.from({ length: 20 }, (_, index) => ({
      ...event(`gen-${index}`, '2026-08-01', clockAt(index * 30), 0),
      wordId: `gen-${index}`,
    }));

    // Spaced half a minute apart these clear the per-word floor comfortably, so
    // only the think time gives them away. Nobody answers in zero milliseconds.
    expect(estimateWordDurationMs(generated)).toBe(20_000);
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

describe('estimateWordDurationByLevel', () => {
  /**
   * One study day, `gapSeconds` apart, where every word was sitting at
   * `level` when the day's first question about it was asked.
   */
  it('quotes the overall pace for every level with no history at all', () => {
    const byLevel = estimateWordDurationByLevel([]);

    expect(byLevel.size).toBe(11);
    expect([...byLevel.values()].every((entry) => entry.durationMs === 20_000)).toBe(true);
    expect([...byLevel.values()].every((entry) => !entry.isMeasured)).toBe(true);
  });

  it('separates a slow level from a fast one', () => {
    const events = [
      // 10 new words at 40s each, then 10 nearly-mastered ones at 10s.
      ...levelDay('2026-08-01', 0, Array.from({ length: 10 }, (_, i) => `new-${i}`), 40),
      ...levelDay('2026-08-01', 9, Array.from({ length: 10 }, (_, i) => `old-${i}`), 10, 3_600),
    ];
    const byLevel = estimateWordDurationByLevel(events);

    // Overall: Lv0 gives 8s + 9 x 40s = 368s, Lv9 gives 8s + 9 x 10s = 98s,
    // so 466s over 20 words = 23.3s, blended 20/40 with the 20s prior = 21.65s.
    expect(estimateWordDurationMs(events)).toBe(21_650);
    // Lv0 measured 36.8s over 10 words, held 10/15 against that 21.65s.
    expect(byLevel.get(0)).toEqual({
      level: 0, words: 10, durationMs: 31_750, isMeasured: true,
    });
    // Lv9 measured 9.8s, so the same blend pulls it up instead of down.
    expect(byLevel.get(9)).toEqual({
      level: 9, words: 10, durationMs: 13_750, isMeasured: true,
    });
    // A level nobody visited sits on the line between the two that were:
    // five ninths of the way from Lv0's 31.75s down to Lv9's 13.75s.
    expect(byLevel.get(5)).toEqual({
      level: 5, words: 0, durationMs: 21_750, isMeasured: false,
    });
  });

  it('leans on the overall pace until a level has enough words of its own', () => {
    const busy = Array.from({ length: 7 }, (_, day) => levelDay(
      `2026-08-0${day + 1}`, 3, Array.from({ length: 10 }, (_, i) => `w-${day}-${i}`), 30,
    )).flat();
    const oneWordAtLevelSix = [
      ...busy,
      ...levelDay('2026-08-07', 6, ['rare'], 30, 7_200),
    ];
    const byLevel = estimateWordDurationByLevel(oneWordAtLevelSix);

    // Lv3 has 70 words of its own and barely moves off its own 27.6s.
    expect(byLevel.get(3)?.words).toBe(70);
    expect(byLevel.get(3)?.durationMs).toBe(27_671);
    // Lv6 has a single 8s word and is held five-sixths of the way back to the
    // 26.4s overall pace rather than claiming a level costs 8 seconds.
    expect(byLevel.get(6)).toEqual({
      level: 6, words: 1, durationMs: 22_890, isMeasured: true,
    });
  });

  it('prices the levels above the child at the highest one she reached', () => {
    // A child working through Lv0-Lv5: new words are slow, reviews get quicker.
    const ladder = Array.from({ length: 6 }, (_, level) => levelDay(
      '2026-08-01',
      level,
      Array.from({ length: 10 }, (_, i) => `w-${level}-${i}`),
      30 - (level * 3),
      level * 600,
    )).flat();
    const byLevel = estimateWordDurationByLevel(ladder);

    // Lv5 is the top of what has actually been timed, and it is well below the
    // overall pace, which is dragged up by the new words at the bottom.
    const levelFive = byLevel.get(5)!;
    expect(levelFive.isMeasured).toBe(true);
    expect(levelFive.durationMs).toBeLessThan(estimateWordDurationMs(ladder));

    for (let level = 6; level <= 10; level += 1) {
      expect(byLevel.get(level)).toEqual({
        level, words: 0, durationMs: levelFive.durationMs, isMeasured: false,
      });
    }
  });

  it('prices the levels below the child at the lowest one she reached', () => {
    // Only Lv7 was studied, so Lv0-Lv6 have nothing below them to read.
    const highOnly = levelDay(
      '2026-08-01', 7, Array.from({ length: 10 }, (_, i) => `w-${i}`), 12,
    );
    const byLevel = estimateWordDurationByLevel(highOnly);
    const levelSeven = byLevel.get(7)!;

    expect(levelSeven.isMeasured).toBe(true);
    for (let level = 0; level <= 6; level += 1) {
      expect(byLevel.get(level)?.durationMs).toBe(levelSeven.durationMs);
    }
  });

  it('reads a gap between two studied levels off the line joining them', () => {
    const gapped = [
      ...levelDay('2026-08-01', 2, Array.from({ length: 20 }, (_, i) => `low-${i}`), 40),
      ...levelDay('2026-08-01', 6, Array.from({ length: 20 }, (_, i) => `high-${i}`), 10, 3_600),
    ];
    const byLevel = estimateWordDurationByLevel(gapped);
    const low = byLevel.get(2)!.durationMs;
    const high = byLevel.get(6)!.durationMs;

    // Lv3, Lv4, Lv5 step evenly from Lv2 down to Lv6 rather than all quoting
    // one average, and Lv4 lands exactly halfway.
    expect(byLevel.get(4)?.durationMs).toBe(Math.round((low + high) / 2));
    expect(byLevel.get(3)!.durationMs).toBeGreaterThan(byLevel.get(4)!.durationMs);
    expect(byLevel.get(4)!.durationMs).toBeGreaterThan(byLevel.get(5)!.durationMs);
    // Everything below Lv2 and above Lv6 repeats the nearest measured end.
    expect(byLevel.get(0)?.durationMs).toBe(low);
    expect(byLevel.get(10)?.durationMs).toBe(high);
  });

  it('reads a gap off the levels either side of it, not the far end of the ladder', () => {
    const threeRungs = [
      ...levelDay('2026-08-01', 0, Array.from({ length: 20 }, (_, i) => `a-${i}`), 40),
      // Deliberately off the straight line from Lv0 to Lv8: if a gap were read
      // from the far end of the ladder instead of its neighbours, these numbers
      // would be the ones to give it away.
      ...levelDay('2026-08-01', 4, Array.from({ length: 20 }, (_, i) => `b-${i}`), 34, 3_600),
      ...levelDay('2026-08-01', 8, Array.from({ length: 20 }, (_, i) => `c-${i}`), 10, 7_200),
    ];
    const byLevel = estimateWordDurationByLevel(threeRungs);

    // Lv6 sits halfway between Lv4 and Lv8, the rungs either side of it --
    // reaching past Lv4 to Lv0 would price a review like a first meeting.
    expect(byLevel.get(6)?.durationMs).toBe(
      Math.round((byLevel.get(4)!.durationMs + byLevel.get(8)!.durationMs) / 2),
    );
    expect(byLevel.get(2)?.durationMs).toBe(
      Math.round((byLevel.get(0)!.durationMs + byLevel.get(4)!.durationMs) / 2),
    );
  });

  it('leaves a guessed level marked as a guess', () => {
    const onlyLevelOne = levelDay(
      '2026-08-01', 1, Array.from({ length: 10 }, (_, i) => `w-${i}`), 25,
    );
    const byLevel = estimateWordDurationByLevel(onlyLevelOne);

    // Borrowing a neighbour's number is still not a measurement of this level.
    expect(byLevel.get(8)?.isMeasured).toBe(false);
    expect(byLevel.get(8)?.words).toBe(0);
  });

  it('only looks back a week, so a level follows the child', () => {
    const eightDays = [
      // Lv2 was studied nine days ago and not since.
      ...levelDay('2026-07-31', 2, ['old-a', 'old-b', 'old-c'], 30),
      ...Array.from({ length: 7 }, (_, day) => levelDay(
        `2026-08-0${day + 1}`, 5, Array.from({ length: 5 }, (_, i) => `w-${day}-${i}`), 20,
      )).flat(),
    ];
    const byLevel = estimateWordDurationByLevel(eightDays);

    // Seven days of Lv5 push the Lv2 day out, so Lv2 stops claiming to know.
    expect(byLevel.get(2)?.words).toBe(0);
    expect(byLevel.get(2)?.isMeasured).toBe(false);
    expect(byLevel.get(5)?.words).toBe(35);
  });

  it('files a word under the level it started the day at, not the one it reached', () => {
    // "climber" was wrong once, so it was asked twice: at Lv1, then again at
    // Lv2 after the downgrade. Both questions belong to the Lv1 attempt.
    const climber = [
      ...levelDay('2026-08-01', 1, ['climber'], 30),
      ...levelDay('2026-08-01', 2, ['climber'], 30, 30),
    ];
    const byLevel = estimateWordDurationByLevel(climber);

    expect(byLevel.get(1)?.words).toBe(1);
    expect(byLevel.get(2)?.words).toBe(0);
  });

  it('ignores records saved before the app tracked levels', () => {
    const untracked = studyDay('2026-08-01', ['a', 'b', 'c', 'd'], 30, 8_000);
    const byLevel = estimateWordDurationByLevel(untracked);

    expect([...byLevel.values()].every((entry) => entry.words === 0)).toBe(true);
    // The overall pace still counts them, so the fallback is a real measurement.
    expect(byLevel.get(0)?.durationMs).toBe(estimateWordDurationMs(untracked));
  });

  it('keeps every level inside the mastery range', () => {
    const strays = [
      ...levelDay('2026-08-01', 99, ['too-high'], 30),
      ...levelDay('2026-08-01', -4, ['too-low'], 30, 60),
    ];
    const byLevel = estimateWordDurationByLevel(strays);

    expect(byLevel.get(10)?.words).toBe(1);
    expect(byLevel.get(0)?.words).toBe(1);
    expect([...byLevel.keys()]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});

describe('estimateSessionDuration', () => {
  const history = [
    ...levelDay('2026-08-01', 0, Array.from({ length: 10 }, (_, i) => `new-${i}`), 40),
    ...levelDay('2026-08-01', 9, Array.from({ length: 10 }, (_, i) => `old-${i}`), 10, 3_600),
  ];

  it('has nothing to show for an empty session', () => {
    expect(estimateSessionDuration([], history)).toMatchObject({
      totalDurationMs: 0,
      rows: [],
      overallWordDurationMs: 21_650,
    });
    // The pace table still comes back, so the drawer needs only the one call.
    expect(estimateSessionDuration([], history).byLevel)
      .toEqual(estimateWordDurationByLevel(history));
  });

  it('shows the working one level at a time, lowest first', () => {
    const estimate = estimateSessionDuration([9, 0, 9, 0, 0], history);

    expect(estimate.rows).toEqual([
      { level: 0, words: 3, wordDurationMs: 31_750, durationMs: 95_250, isMeasured: true },
      { level: 9, words: 2, wordDurationMs: 13_750, durationMs: 27_500, isMeasured: true },
    ]);
    expect(estimate.totalDurationMs).toBe(122_750);
  });

  it('charges a session of new words more than the same count of easy reviews', () => {
    const newWords = estimateSessionDuration([0, 0, 0, 0, 0, 0], history);
    const easyReviews = estimateSessionDuration([9, 9, 9, 9, 9, 9], history);

    // Six words either way, but one average would have priced both at 130s.
    expect(newWords.totalDurationMs).toBe(190_500);
    expect(easyReviews.totalDurationMs).toBe(82_500);
  });

  it('marks the levels it had to guess at', () => {
    const estimate = estimateSessionDuration([4, 4], history);

    // Lv4 was never studied, so it is read off the line between Lv0 and Lv9
    // rather than quoting the overall pace.
    expect(estimate.rows).toEqual([
      { level: 4, words: 2, wordDurationMs: 23_750, durationMs: 47_500, isMeasured: false },
    ]);
  });

  it('prices a level out of range as the nearest real one', () => {
    expect(estimateSessionDuration([42], history).rows[0].level).toBe(10);
    expect(estimateSessionDuration([-1], history).rows[0].level).toBe(0);
  });

  it('prices a part-finished level as the level it has actually reached', () => {
    expect(estimateSessionDuration([2.9], history).rows[0].level).toBe(2);
    expect(estimateSessionDuration([Number.NaN], history).rows[0].level).toBe(0);
  });

  it('exposes the prior it blends sparse levels with', () => {
    expect(LEVEL_DURATION_PRIOR_WORDS).toBe(5);
  });
});
