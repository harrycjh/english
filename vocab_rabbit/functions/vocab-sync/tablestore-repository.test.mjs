import { describe, expect, it } from 'vitest';
import { createTablestoreRepository } from './tablestore-repository.mjs';

function snapshotWithoutEvents() {
  return {
    schemaVersion: 1,
    generation: 0,
    checkpoint: null,
    dailyTasks: [],
    wordSelectionStates: [],
    parentSetting: {
      value: {
        profileId: 'cute-junjun',
        enableAudio: true,
        dailyNewWordCount: 15,
        dailyReviewLimit: 30,
        showImages: true,
        showExamples: true,
        showHints: true,
        preferLandscape: true,
      },
      fieldRevisions: {},
    },
  };
}

describe('Tablestore incremental synchronization', () => {
  it('does not scan all events and writes only changed event and word rows for a current cursor', async () => {
    const batchWrites = [];
    let rangeReadCount = 0;
    const client = {
      async getRow() {
        return {
          row: {
            attributes: [
              ['payload_json', JSON.stringify(snapshotWithoutEvents())],
              ['cursor', 'cursor-current'],
            ],
          },
        };
      },
      async getRange() {
        rangeReadCount += 1;
        return { rows: [], nextStartPrimaryKey: null };
      },
      async batchWriteRow(request) {
        batchWrites.push(request);
        return {
          tables: [{
            isOk: true,
            rows: request.tables[0].rows.map(() => ({ isOk: true })),
          }],
        };
      },
      async putRow() {},
    };
    const repository = createTablestoreRepository(client);
    const record = {
      wordId: 'word-a',
      masteryLevel: 2,
      reviewStage: 2,
      correctStreak: 1,
      wrongCount: 0,
      lastStudiedAt: '2026-07-22T08:00:00.000Z',
      nextDueAt: '2026-07-24T20:00:00.000Z',
    };

    const result = await repository.mergeDelta('xiaojunjun', {
      schemaVersion: 1,
      generation: 0,
      events: [{
        id: 'event-a',
        wordId: 'word-a',
        dateKey: '2026-07-22',
        answeredAt: '2026-07-22T08:00:00.000Z',
        isCorrect: true,
        generation: 0,
        learningStateAfter: record,
      }],
      dailyTasks: [],
      wordSelectionStates: [],
      parentSetting: null,
    }, 'cursor-current');

    expect(result.cursor).toBeTruthy();
    expect(result.snapshot).toBeNull();
    expect(rangeReadCount).toBe(0);
    expect(batchWrites).toHaveLength(2);
    expect(batchWrites[0].tables[0].rows).toHaveLength(1);
    expect(batchWrites[1].tables[0].rows).toHaveLength(1);
  });
});
