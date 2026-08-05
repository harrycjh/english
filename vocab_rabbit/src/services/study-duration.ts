import type { AnswerEvent } from '../models/answer-event';
import { MAX_MASTERY_LEVEL } from './spaced-repetition';

/**
 * A question that appears to take longer than this was almost certainly
 * abandoned — the child walked away, the tab slept, or the app was
 * backgrounded. Anything above the cap is treated as a break rather than
 * study time so a single interruption cannot inflate a day's total.
 */
export const MAX_QUESTION_DURATION_MS = 120_000;

/** Fallback per-question cost used until enough real answers are recorded. */
export const DEFAULT_QUESTION_DURATION_MS = 15_000;

/** Below this many samples the measured median is too noisy to trust alone. */
export const QUESTION_DURATION_PRIOR_SAMPLES = 12;

/**
 * Fallback per-word cost used until real study days are recorded.
 *
 * Measured on the running app, a script answering instantly and correctly still
 * spends about 8.4s on each word because of the feedback hold, the spoken
 * example and the level-up animation. A child adds several seconds of reading
 * and choosing, and a wrong answer costs a whole extra question, so 20s per
 * word is the realistic starting point.
 */
export const DEFAULT_WORD_DURATION_MS = 20_000;

/** Below this many studied words the measured pace is too noisy to trust alone. */
export const WORD_DURATION_PRIOR_WORDS = 20;

/** Only this many recent study days feed the pace, so it follows the child. */
export const WORD_DURATION_RECENT_DAYS = 14;

/**
 * A word that took less than this to study was not studied by a person.
 *
 * A script answering instantly and correctly still needs 8.4s per word, so no
 * child can beat that; anything under 5s came from generated records. The floor
 * sits well below the measured minimum so a genuinely fast word is never thrown
 * away, and it is applied per word rather than per day because one afternoon of
 * 「全部答对」 sits in the same day as a morning of real study.
 */
export const MIN_PLAUSIBLE_WORD_DURATION_MS = 5_000;

/**
 * How far back the per-level pace looks.
 *
 * Shorter than the overall window because a level is a moving target: the words
 * sitting at Lv2 this week are not the ones that were there a fortnight ago.
 */
export const LEVEL_DURATION_RECENT_DAYS = 7;

/**
 * Below this many words at a level, that level's own measurement is too thin to
 * stand alone and leans on the overall pace instead. It is much smaller than the
 * overall prior because a single level only ever sees a slice of a day's words.
 */
export const LEVEL_DURATION_PRIOR_WORDS = 5;

export interface DailyStudyDuration {
  dateKey: string;
  durationMs: number;
  answerCount: number;
}

function clampQuestionDuration(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, MAX_QUESTION_DURATION_MS);
}

function toTimestamp(event: AnswerEvent): number {
  const parsed = Date.parse(event.answeredAt);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

/**
 * Wall-clock cost of one question.
 *
 * `responseTimeMs` only covers "question rendered -> answer submitted", so it
 * misses the feedback animation, the spoken example and the reveal that follow
 * every answer. The gap between two consecutive `answeredAt` stamps covers that
 * whole cycle, so the gap is the better measure whenever it is available and
 * plausible. Outside a continuous run we fall back to the recorded think time.
 */
export function calculateQuestionDurationMs(
  event: AnswerEvent,
  previousEvent?: AnswerEvent,
): number {
  const fallback = clampQuestionDuration(event.responseTimeMs);
  if (!previousEvent) return fallback;

  const current = toTimestamp(event);
  const previous = toTimestamp(previousEvent);
  if (Number.isNaN(current) || Number.isNaN(previous)) return fallback;

  const gap = current - previous;
  if (gap <= 0 || gap > MAX_QUESTION_DURATION_MS) return fallback;
  return Math.max(gap, fallback);
}

function sortByAnsweredAt(events: AnswerEvent[]): AnswerEvent[] {
  return [...events].sort((left, right) => (
    left.answeredAt.localeCompare(right.answeredAt) || left.id.localeCompare(right.id)
  ));
}

/** Answers grouped per study day, each day ordered as it was actually answered. */
function groupOrderedByDate(events: AnswerEvent[]): Map<string, AnswerEvent[]> {
  const byDate = new Map<string, AnswerEvent[]>();
  for (const event of events) {
    const bucket = byDate.get(event.dateKey) ?? [];
    bucket.push(event);
    byDate.set(event.dateKey, bucket);
  }
  for (const [dateKey, bucket] of byDate) {
    byDate.set(dateKey, sortByAnsweredAt(bucket));
  }
  return byDate;
}

/**
 * Total study time per study day, reconstructed from the answer log alone so it
 * also covers every session recorded before durations were ever displayed.
 */
export function calculateStudyDurationByDate(
  events: AnswerEvent[],
): Map<string, DailyStudyDuration> {
  const result = new Map<string, DailyStudyDuration>();
  for (const [dateKey, ordered] of groupOrderedByDate(events)) {
    let durationMs = 0;
    for (const [index, event] of ordered.entries()) {
      durationMs += calculateQuestionDurationMs(event, ordered[index - 1]);
    }
    result.set(dateKey, { dateKey, durationMs, answerCount: ordered.length });
  }

  return result;
}

export function sumStudyDuration(durations: Iterable<DailyStudyDuration>): number {
  let total = 0;
  for (const entry of durations) total += entry.durationMs;
  return total;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Typical cost of one question, blended with the default prior so a handful of
 * unusually fast or slow answers cannot swing the estimate.
 */
export function estimateQuestionDurationMs(events: AnswerEvent[]): number {
  const samples: number[] = [];
  for (const bucket of groupOrderedByDate(events).values()) {
    for (const [index, event] of bucket.entries()) {
      const duration = calculateQuestionDurationMs(event, bucket[index - 1]);
      if (duration > 0) samples.push(duration);
    }
  }

  if (samples.length === 0) return DEFAULT_QUESTION_DURATION_MS;
  const observed = median(samples);
  const weight = samples.length / (samples.length + QUESTION_DURATION_PRIOR_SAMPLES);
  return Math.round((observed * weight) + (DEFAULT_QUESTION_DURATION_MS * (1 - weight)));
}

function clampMasteryLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  // Floor, not round: a word part-way to the next level has not reached it.
  return Math.min(MAX_MASTERY_LEVEL, Math.max(0, Math.floor(level)));
}

/** One word, on one day, with what it cost and the level it started at. */
interface StudiedWord {
  wordId: string;
  /** Null for records written before the app kept level snapshots. */
  level: number | null;
  durationMs: number;
}

/**
 * Every word that was really studied in the window, with what it really cost.
 *
 * A word is not one question: every wrong answer puts it back at the end of the
 * queue, so a 20-word session regularly runs 25 questions. Counting a word's
 * whole day — retries, feedback holds, level-up animations and all — is what
 * makes a word count multipliable by a per-word cost.
 *
 * Records nobody sat through are dropped here so every caller gets the same
 * guarantee. The debug "全部答对" shortcut (`LearningPage.handleAllCorrect`)
 * stamps its answers one second apart and writes `responseTimeMs: 0` for every
 * one after the first, so a 51-word shortcut otherwise teaches the estimate
 * that a word costs a second. Two guards catch it: a zero think time never
 * comes from a real answer, and every word is then checked against a floor no
 * person can beat. The check is per word, not per day, because the shortcut is
 * usually reached partway through a day of genuine study. Day totals in
 * `calculateStudyDurationByDate` keep every record on purpose — those report
 * what the log says happened, while this reports how long a person takes.
 */
function collectStudiedWords(events: AnswerEvent[], recentDays: number): StudiedWord[] {
  const byDate = groupOrderedByDate(events.filter((event) => event.responseTimeMs > 0));
  const recentDateKeys = [...byDate.keys()].sort().slice(-recentDays);

  const studied: StudiedWord[] = [];
  for (const dateKey of recentDateKeys) {
    const ordered = byDate.get(dateKey) ?? [];

    const durationByWord = new Map<string, number>();
    const levelByWord = new Map<string, number | null>();
    for (const [index, event] of ordered.entries()) {
      const duration = calculateQuestionDurationMs(event, ordered[index - 1]);
      durationByWord.set(event.wordId, (durationByWord.get(event.wordId) ?? 0) + duration);
      // A word climbs a level the moment it is answered right, so only the
      // first question of the day is asked at the level today's plan shows.
      if (!levelByWord.has(event.wordId)) {
        levelByWord.set(event.wordId, event.learningStateBefore?.masteryLevel ?? null);
      }
    }

    for (const [wordId, durationMs] of durationByWord) {
      if (durationMs < MIN_PLAUSIBLE_WORD_DURATION_MS) continue;
      studied.push({ wordId, level: levelByWord.get(wordId) ?? null, durationMs });
    }
  }
  return studied;
}

/**
 * Typical cost of studying one word, measured end to end.
 *
 * The pool is a ratio of sums rather than an average of daily ratios because
 * the answer being predicted is itself a sum, and only recent days are used so
 * the estimate follows the child as they speed up.
 */
export function estimateWordDurationMs(events: AnswerEvent[]): number {
  const studied = collectStudiedWords(events, WORD_DURATION_RECENT_DAYS);
  if (studied.length === 0) return DEFAULT_WORD_DURATION_MS;

  let totalDurationMs = 0;
  for (const entry of studied) totalDurationMs += entry.durationMs;

  const observed = totalDurationMs / studied.length;
  const weight = studied.length / (studied.length + WORD_DURATION_PRIOR_WORDS);
  return Math.round((observed * weight) + (DEFAULT_WORD_DURATION_MS * (1 - weight)));
}

/** What one word at one mastery level costs, and how much was measured. */
export interface LevelWordDuration {
  level: number;
  /** Words studied at this level inside the window. */
  words: number;
  /** Blended cost of a single word at this level. */
  durationMs: number;
  /** False when the level had no words and is quoting the overall pace. */
  isMeasured: boolean;
}

/**
 * Cost of a word at each mastery level, Lv0 through Lv10.
 *
 * Levels really do cost different amounts: Lv0 shows the picture and the
 * spelling for the first time, the middle levels add example sentences, and the
 * last ones are a quick recognition check. Estimating a session from one
 * average therefore over-charges a day of easy reviews and under-charges a day
 * of new words.
 *
 * A word is filed under the level it *started* the day at, because that is the
 * level today's plan can also be read at — after a correct answer the word moves
 * up, but by then it has left the queue.
 *
 * Levels the child has not touched lately, and levels with only a word or two,
 * lean on the overall pace rather than inventing a number from one sample.
 */
export function estimateWordDurationByLevel(
  events: AnswerEvent[],
): Map<number, LevelWordDuration> {
  const overallDurationMs = estimateWordDurationMs(events);
  const studied = collectStudiedWords(events, LEVEL_DURATION_RECENT_DAYS);

  const totals = new Map<number, { durationMs: number; words: number }>();
  for (const entry of studied) {
    // Records written before the app kept level snapshots cannot be filed.
    if (entry.level === null) continue;
    const level = clampMasteryLevel(entry.level);
    const bucket = totals.get(level) ?? { durationMs: 0, words: 0 };
    bucket.durationMs += entry.durationMs;
    bucket.words += 1;
    totals.set(level, bucket);
  }

  const byLevel = new Map<number, LevelWordDuration>();
  for (let level = 0; level <= MAX_MASTERY_LEVEL; level += 1) {
    const bucket = totals.get(level);
    const words = bucket?.words ?? 0;
    const observed = bucket && words > 0 ? bucket.durationMs / words : 0;
    const weight = words / (words + LEVEL_DURATION_PRIOR_WORDS);
    byLevel.set(level, {
      level,
      words,
      durationMs: Math.round((observed * weight) + (overallDurationMs * (1 - weight))),
      isMeasured: words > 0,
    });
  }
  return byLevel;
}

/** One row of the estimate: every word of a level, and what they add up to. */
export interface SessionEstimateRow {
  level: number;
  words: number;
  wordDurationMs: number;
  durationMs: number;
  isMeasured: boolean;
}

export interface SessionEstimate {
  totalDurationMs: number;
  /** One row per level present in the session, lowest level first. */
  rows: SessionEstimateRow[];
  /** The single-figure pace the sparse levels fall back to. */
  overallWordDurationMs: number;
  /** The full Lv0–Lv10 pace table the rows were priced from. */
  byLevel: Map<number, LevelWordDuration>;
}

/**
 * How long the words still to be studied should take, level by level.
 *
 * Returns the working rather than just the total so the estimate can show where
 * the number came from instead of asking to be trusted.
 */
export function estimateSessionDuration(
  wordLevels: number[],
  events: AnswerEvent[],
): SessionEstimate {
  const byLevel = estimateWordDurationByLevel(events);

  const wordsByLevel = new Map<number, number>();
  for (const level of wordLevels) {
    const clamped = clampMasteryLevel(level);
    wordsByLevel.set(clamped, (wordsByLevel.get(clamped) ?? 0) + 1);
  }

  let totalDurationMs = 0;
  const rows: SessionEstimateRow[] = [];
  // Walking the pace table rather than the session keeps the rows in level
  // order by construction, and means every row has a pace to quote.
  for (const [level, pace] of byLevel) {
    const words = wordsByLevel.get(level) ?? 0;
    if (words === 0) continue;
    const durationMs = pace.durationMs * words;
    totalDurationMs += durationMs;
    rows.push({
      level,
      words,
      wordDurationMs: pace.durationMs,
      durationMs,
      isMeasured: pace.isMeasured,
    });
  }

  return {
    totalDurationMs,
    rows,
    overallWordDurationMs: estimateWordDurationMs(events),
    byLevel,
  };
}

/** Child-friendly duration label, e.g. `1 小时 5 分钟` / `8 分钟` / `45 秒`. */
export function formatStudyDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return '0 分钟';

  const totalSeconds = Math.round(durationMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds} 秒`;

  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} 分钟`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} 小时` : `${hours} 小时 ${minutes} 分钟`;
}
