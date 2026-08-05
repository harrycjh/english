import { describe, expect, it } from 'vitest';
import type { LearningLoadPoint } from './learning-statistics';
import type { MasteryLevelTimelinePoint } from './memory-statistics';
import {
  aggregateMasteryLevelTimeline,
  aggregateLearningLoadTimeline,
  getStatisticsBucketKey,
} from './statistics-time-buckets';

describe('statistics time buckets', () => {
  it('uses Monday as the first day of a week and natural calendar months', () => {
    expect(getStatisticsBucketKey('2026-07-20', 'week')).toBe('2026-07-20');
    expect(getStatisticsBucketKey('2026-07-26', 'week')).toBe('2026-07-20');
    expect(getStatisticsBucketKey('2026-07-26', 'month')).toBe('2026-07-01');
  });

  it('sums learning load inside a week', () => {
    const points: LearningLoadPoint[] = [
      { dateKey: '2026-07-20', newCount: 3, reviewCount: 2, retryCount: 1, totalCount: 6, deferredReviewCount: 0, durationMs: 90_000, kind: 'history' },
      { dateKey: '2026-07-21', newCount: 4, reviewCount: 5, retryCount: 2, totalCount: 11, deferredReviewCount: 1, durationMs: 150_000, kind: 'today' },
    ];
    expect(aggregateLearningLoadTimeline(points, 'week')).toEqual([{
      dateKey: '2026-07-20',
      newCount: 7,
      reviewCount: 7,
      retryCount: 3,
      totalCount: 14,
      deferredReviewCount: 1,
      durationMs: 240_000,
      kind: 'today',
    }]);
  });

  it('uses the final mastery-level state in a month instead of adding states', () => {
    const points: MasteryLevelTimelinePoint[] = [
      { dateKey: '2026-07-01', counts: { 1: 2, 2: 1 } },
      { dateKey: '2026-07-31', counts: { 1: 9, 2: 4 } },
    ];
    expect(aggregateMasteryLevelTimeline(points, 'month')).toEqual([{
      dateKey: '2026-07-01',
      counts: { 1: 9, 2: 4 },
    }]);
  });
});
