import { describe, expect, it } from 'vitest';
import type { LearningLoadPoint } from './learning-statistics';
import type { DurabilityTimelinePoint } from './memory-statistics';
import {
  aggregateDurabilityTimeline,
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
      { dateKey: '2026-07-20', newCount: 3, reviewCount: 2, retryCount: 1, totalCount: 6, deferredReviewCount: 0, kind: 'history' },
      { dateKey: '2026-07-21', newCount: 4, reviewCount: 5, retryCount: 2, totalCount: 11, deferredReviewCount: 1, kind: 'today' },
    ];
    expect(aggregateLearningLoadTimeline(points, 'week')).toEqual([{
      dateKey: '2026-07-20',
      newCount: 7,
      reviewCount: 7,
      retryCount: 3,
      totalCount: 14,
      deferredReviewCount: 1,
      kind: 'today',
    }]);
  });

  it('uses the final durability state in a month instead of adding states', () => {
    const points: DurabilityTimelinePoint[] = [
      { dateKey: '2026-07-01', counts: { 10: 2, 30: 1 } },
      { dateKey: '2026-07-31', counts: { 10: 9, 30: 4 } },
    ];
    expect(aggregateDurabilityTimeline(points, 'month')).toEqual([{
      dateKey: '2026-07-01',
      counts: { 10: 9, 30: 4 },
    }]);
  });
});
