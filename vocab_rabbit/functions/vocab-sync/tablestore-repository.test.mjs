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
  it('restores check-ins from dedicated app-state rows when the snapshot lost them', async () => {
    const snapshot = snapshotWithoutEvents();
    snapshot.dailyTasks = [{
      dateKey: '2026-08-30',
      newWordIds: [],
      reviewWordIds: [],
      completedAt: null,
      checkedInAt: null,
      correctCount: 0,
      wrongCount: 0,
      totalAnswered: 0,
      answeredWordIds: [],
    }];
    const client = {
      async getRow() {
        return {
          row: {
            attributes: [
              ['payload_json', JSON.stringify(snapshot)],
              ['cursor', 'cursor-current'],
            ],
          },
        };
      },
      async getRange(request) {
        const stateType = request.inclusiveStartPrimaryKey[1]?.state_type;
        if (stateType === 'check_in') {
          return {
            rows: [{
              primaryKey: [
                { name: 'user_id', value: 'xiaojunjun' },
                { name: 'state_type', value: 'check_in' },
                { name: 'state_id', value: '2026-08-30' },
              ],
              attributes: [
                ['checked_in_at', '2026-08-30T09:00:00.000Z'],
                ['source_device_id', 'ipad-a'],
              ],
            }],
            nextStartPrimaryKey: null,
          };
        }
        return { rows: [], nextStartPrimaryKey: null };
      },
      async batchWriteRow(request) {
        return {
          tables: [{ isOk: true, rows: request.tables[0].rows.map(() => ({ isOk: true })) }],
        };
      },
      async putRow() {},
    };
    const repository = createTablestoreRepository(client);

    const result = await repository.getSyncState('xiaojunjun', 'cursor-stale');

    expect(result.snapshot.dailyTasks[0].checkedInAt).toBe('2026-08-30T09:00:00.000Z');
  });

  it('migrates legacy snapshot check-ins into dedicated app-state rows', async () => {
    const snapshot = snapshotWithoutEvents();
    snapshot.dailyTasks = [{
      dateKey: '2026-08-29',
      newWordIds: [],
      reviewWordIds: [],
      completedAt: null,
      checkedInAt: '2026-08-29T08:00:00.000Z',
      correctCount: 0,
      wrongCount: 0,
      totalAnswered: 0,
      answeredWordIds: [],
    }];
    const batchWrites = [];
    const client = {
      async getRow() {
        return {
          row: {
            attributes: [
              ['payload_json', JSON.stringify(snapshot)],
              ['cursor', 'cursor-current'],
            ],
          },
        };
      },
      async getRange() {
        return { rows: [], nextStartPrimaryKey: null };
      },
      async batchWriteRow(request) {
        batchWrites.push(request);
        return {
          tables: [{ isOk: true, rows: request.tables[0].rows.map(() => ({ isOk: true })) }],
        };
      },
      async putRow() {},
    };
    const repository = createTablestoreRepository(client);

    await repository.getSyncState('xiaojunjun', 'cursor-stale');

    const migratedRows = batchWrites
      .flatMap((request) => request.tables)
      .filter((table) => table.tableName === 'vocab_app_states')
      .flatMap((table) => table.rows);
    expect(migratedRows).toEqual([
      expect.objectContaining({
        primaryKey: [
          { user_id: 'xiaojunjun' },
          { state_type: 'check_in' },
          { state_id: '2026-08-29' },
        ],
      }),
    ]);
  });

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
      async getRange(request) {
        if (request.inclusiveStartPrimaryKey[1]?.state_type !== 'check_in') {
          rangeReadCount += 1;
        }
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

  it('writes a checked-in task as one dedicated app-state row', async () => {
    const batchWrites = [];
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
        return { rows: [], nextStartPrimaryKey: null };
      },
      async batchWriteRow(request) {
        batchWrites.push(request);
        return {
          tables: [{ isOk: true, rows: request.tables[0].rows.map(() => ({ isOk: true })) }],
        };
      },
      async putRow() {},
    };
    const repository = createTablestoreRepository(client);

    await repository.mergeDelta('xiaojunjun', {
      schemaVersion: 1,
      generation: 0,
      events: [],
      dailyTasks: [{
        dateKey: '2026-08-31',
        newWordIds: [],
        reviewWordIds: [],
        completedAt: null,
        checkedInAt: '2026-08-31T08:00:00.000Z',
        correctCount: 0,
        wrongCount: 0,
        totalAnswered: 0,
        answeredWordIds: [],
      }],
      wordSelectionStates: [],
      parentSetting: null,
    }, 'cursor-current', 'ipad-home');

    const checkInRows = batchWrites
      .flatMap((request) => request.tables)
      .filter((table) => table.tableName === 'vocab_app_states')
      .flatMap((table) => table.rows);
    expect(checkInRows).toEqual([
      expect.objectContaining({
        primaryKey: [
          { user_id: 'xiaojunjun' },
          { state_type: 'check_in' },
          { state_id: '2026-08-31' },
        ],
        attributeColumns: expect.arrayContaining([
          { checked_in_at: '2026-08-31T08:00:00.000Z' },
          { source_device_id: 'ipad-home' },
        ]),
      }),
    ]);
  });

  it('resumes a paged event scan using primary key shorthand', async () => {
    const rangeRequests = [];
    const pages = [
      {
        rows: [{ attributes: [['payload_json', JSON.stringify({ id: 'event-a', wordId: 'word-a' })]] }],
        nextStartPrimaryKey: [
          { name: 'user_id', value: 'xiaojunjun' },
          { name: 'event_time', value: '2026-07-22T08:00:00.000Z' },
          { name: 'event_id', value: 'event-a' },
        ],
      },
      {
        rows: [{ attributes: [['payload_json', JSON.stringify({ id: 'event-b', wordId: 'word-b' })]] }],
        nextStartPrimaryKey: null,
      },
    ];
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
      async getRange(request) {
        const stateType = request.inclusiveStartPrimaryKey[1]?.state_type;
        if (stateType === 'check_in') return { rows: [], nextStartPrimaryKey: null };
        rangeRequests.push(request);
        return pages[rangeRequests.length - 1];
      },
      async batchWriteRow(request) {
        return {
          tables: [{ isOk: true, rows: request.tables[0].rows.map(() => ({ isOk: true })) }],
        };
      },
      async putRow() {},
    };
    const repository = createTablestoreRepository(client);

    const result = await repository.getSyncState('xiaojunjun', null);

    expect(rangeRequests).toHaveLength(2);
    // Every entry must carry exactly one column, otherwise Tablestore rejects the
    // request with "The number of primary key columns must be in range: [1, 4]".
    for (const entry of rangeRequests[1].inclusiveStartPrimaryKey) {
      expect(Object.keys(entry)).toHaveLength(1);
    }
    expect(rangeRequests[1].inclusiveStartPrimaryKey).toEqual([
      { user_id: 'xiaojunjun' },
      { event_time: '2026-07-22T08:00:00.000Z' },
      { event_id: 'event-a' },
    ]);
    expect(result.snapshot.events.map((event) => event.id)).toEqual(['event-a', 'event-b']);
  });
});
