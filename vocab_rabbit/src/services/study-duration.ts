import type { AnswerEvent } from '../models/answer-event';

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
