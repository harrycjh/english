import type { LearningLoadPoint } from './learning-statistics';
import type { DurabilityTimelinePoint } from './memory-statistics';

export type StatisticsTimeScale = 'day' | 'week' | 'month';

export function getStatisticsBucketKey(dateKey: string, scale: StatisticsTimeScale): string {
  if (scale === 'day') return dateKey;
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  if (scale === 'month') {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;
  }

  const dayFromMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayFromMonday);
  return date.toISOString().slice(0, 10);
}

export function aggregateLearningLoadTimeline(
  points: LearningLoadPoint[],
  scale: StatisticsTimeScale,
): LearningLoadPoint[] {
  if (scale === 'day') return points;
  const buckets = new Map<string, LearningLoadPoint[]>();
  for (const point of points) {
    const key = getStatisticsBucketKey(point.dateKey, scale);
    const bucket = buckets.get(key) ?? [];
    bucket.push(point);
    buckets.set(key, bucket);
  }

  return [...buckets.entries()].map(([dateKey, bucket]) => {
    const newCount = bucket.reduce((sum, point) => sum + point.newCount, 0);
    const reviewCount = bucket.reduce((sum, point) => sum + point.reviewCount, 0);
    const retryCount = bucket.reduce((sum, point) => sum + point.retryCount, 0);
    const deferredReviewCount = bucket.reduce((sum, point) => sum + point.deferredReviewCount, 0);
    const kind = bucket.some((point) => point.kind === 'today')
      ? 'today'
      : bucket.every((point) => point.kind === 'forecast')
        ? 'forecast'
        : 'history';
    return {
      dateKey,
      newCount,
      reviewCount,
      retryCount,
      deferredReviewCount,
      totalCount: newCount + reviewCount,
      kind,
    };
  });
}

export function aggregateDurabilityTimeline(
  points: DurabilityTimelinePoint[],
  scale: StatisticsTimeScale,
): DurabilityTimelinePoint[] {
  if (scale === 'day') return points;
  const buckets = new Map<string, DurabilityTimelinePoint[]>();
  for (const point of points) {
    const key = getStatisticsBucketKey(point.dateKey, scale);
    const bucket = buckets.get(key) ?? [];
    bucket.push(point);
    buckets.set(key, bucket);
  }

  return [...buckets.entries()].map(([dateKey, bucket]) => ({
    dateKey,
    counts: bucket.at(-1)?.counts ?? {},
  }));
}
