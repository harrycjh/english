import TableStore from 'tablestore';
import { mergeSnapshots } from './index.mjs';

const DEFAULT_TABLES = {
  events: 'vocab_learning_events',
  words: 'vocab_word_states',
  app: 'vocab_app_states',
};

function condition() {
  return new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null);
}

function columnValue(row, name) {
  const columns = row?.attributes ?? row?.attributeColumns ?? [];
  for (const column of columns) {
    if (Array.isArray(column) && column[0] === name) return column[1];
    if (column.columnName === name || column.name === name) {
      return column.columnValue ?? column.value;
    }
    if (Object.hasOwn(column, name)) return column[name];
  }
  return undefined;
}

function parseJsonColumn(row, name, fallback) {
  const value = columnValue(row, name);
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function writeRows(client, tableName, rows) {
  for (let offset = 0; offset < rows.length; offset += 200) {
    const chunk = rows.slice(offset, offset + 200);
    const result = await client.batchWriteRow({ tables: [{ tableName, rows: chunk }] });
    const tableResult = result.tables?.[0];
    if (tableResult?.isOk === false) {
      throw new Error(`Tablestore batch failed: ${tableResult.errorMessage ?? tableName}`);
    }
    for (const rowResult of tableResult?.rows ?? []) {
      if (rowResult.isOk === false) {
        throw new Error(`Tablestore row failed: ${rowResult.errorMessage ?? tableName}`);
      }
    }
  }
}

async function readAllEvents(client, tableName, userId) {
  const events = [];
  let start = [
    { user_id: userId },
    { event_time: TableStore.INF_MIN },
    { event_id: TableStore.INF_MIN },
  ];
  const end = [
    { user_id: userId },
    { event_time: TableStore.INF_MAX },
    { event_id: TableStore.INF_MAX },
  ];

  while (start) {
    const result = await client.getRange({
      tableName,
      direction: TableStore.Direction.FORWARD,
      inclusiveStartPrimaryKey: start,
      exclusiveEndPrimaryKey: end,
      columnsToGet: ['payload_json'],
      maxVersions: 1,
      limit: 5000,
    });
    for (const row of result.rows ?? []) {
      const event = parseJsonColumn(row, 'payload_json', null);
      if (event) events.push(event);
    }
    start = result.nextStartPrimaryKey ?? null;
  }
  return events;
}

function evaluateRecord(current, event) {
  const intervals = [0, 12, 36, 72, 168, 336, 720];
  const reviewStage = event.isCorrect
    ? Math.min(current.reviewStage + 1, intervals.length - 1)
    : Math.max(current.reviewStage - 1, 0);
  const masteryLevel = event.isCorrect
    ? Math.min(current.masteryLevel + 1, 6)
    : Math.max(current.masteryLevel - 1, 0);
  const answeredAt = new Date(event.answeredAt);
  return {
    ...current,
    masteryLevel,
    reviewStage,
    correctStreak: event.isCorrect ? current.correctStreak + 1 : 0,
    wrongCount: event.isCorrect ? current.wrongCount : current.wrongCount + 1,
    lastStudiedAt: event.answeredAt,
    nextDueAt: new Date(answeredAt.getTime() + intervals[reviewStage] * 60 * 60 * 1000).toISOString(),
  };
}

function deriveWordStates(snapshot) {
  const records = new Map((snapshot.checkpoint?.records ?? []).map((record) => [record.wordId, record]));
  const checkpointAt = snapshot.checkpoint?.capturedAt ?? '';
  for (const event of snapshot.events) {
    if ((event.generation ?? 0) !== snapshot.generation || event.answeredAt <= checkpointAt) continue;
    const current = records.get(event.wordId) ?? {
      wordId: event.wordId,
      masteryLevel: 0,
      reviewStage: 0,
      correctStreak: 0,
      wrongCount: 0,
      lastStudiedAt: null,
      nextDueAt: null,
    };
    records.set(event.wordId, evaluateRecord(current, event));
  }
  return [...records.values()];
}

export function createTablestoreRepository(client, tables = DEFAULT_TABLES) {
  async function readAppState(userId) {
    const appResult = await client.getRow({
      tableName: tables.app,
      primaryKey: [
        { user_id: userId },
        { state_type: 'sync_snapshot' },
        { state_id: 'current' },
      ],
      columnsToGet: ['payload_json', 'cursor'],
      maxVersions: 1,
    });
    if (!appResult.row) return null;
    const snapshotWithoutEvents = parseJsonColumn(appResult.row, 'payload_json', null);
    return snapshotWithoutEvents ? {
      cursor: columnValue(appResult.row, 'cursor') ?? null,
      snapshotWithoutEvents,
    } : null;
  }

  async function getSyncState(userId, clientCursor) {
    const appState = await readAppState(userId);
    if (!appState) return { cursor: null, isCurrent: false, snapshot: null };
    if (clientCursor && clientCursor === appState.cursor) {
      return { cursor: appState.cursor, isCurrent: true, snapshot: null };
    }
    const events = await readAllEvents(client, tables.events, userId);
    return {
      cursor: appState.cursor,
      isCurrent: false,
      snapshot: { ...appState.snapshotWithoutEvents, events },
    };
  }

  return {
    async registerDevice(userId, deviceId) {
      await client.putRow({
        tableName: tables.app,
        condition: condition(),
        primaryKey: [
          { user_id: userId },
          { state_type: 'device' },
          { state_id: deviceId },
        ],
        attributeColumns: [
          { active: true },
          { connected_at: new Date().toISOString() },
        ],
      });
    },
    async isDeviceActive(userId, deviceId) {
      const result = await client.getRow({
        tableName: tables.app,
        primaryKey: [
          { user_id: userId },
          { state_type: 'device' },
          { state_id: deviceId },
        ],
        columnsToGet: ['active'],
        maxVersions: 1,
      });
      return result.row ? columnValue(result.row, 'active') === true : false;
    },
    getSyncState,
    async mergeSnapshot(userId, incoming) {
      const current = (await getSyncState(userId, null)).snapshot;
      const merged = mergeSnapshots(current, incoming);
      const eventRows = incoming.events.map((event) => ({
        type: 'PUT',
        condition: condition(),
        primaryKey: [
          { user_id: userId },
          { event_time: event.answeredAt },
          { event_id: event.id },
        ],
        attributeColumns: [
          { payload_json: JSON.stringify(event) },
          { word_id: event.wordId },
          { device_id: event.deviceId ?? incoming.checkpoint?.deviceId ?? 'legacy' },
          { server_received_at: new Date().toISOString() },
        ],
      }));
      await writeRows(client, tables.events, eventRows);

      const wordRows = deriveWordStates(merged).map((record) => ({
        type: 'PUT',
        condition: condition(),
        primaryKey: [{ user_id: userId }, { word_id: record.wordId }],
        attributeColumns: [
          { state_json: JSON.stringify(record) },
          { generation: TableStore.Long.fromNumber(merged.generation) },
          { updated_at: record.lastStudiedAt ?? new Date().toISOString() },
        ],
      }));
      await writeRows(client, tables.words, wordRows);

      const { events: _events, ...snapshotWithoutEvents } = merged;
      const cursor = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      await client.putRow({
        tableName: tables.app,
        condition: condition(),
        primaryKey: [
          { user_id: userId },
          { state_type: 'sync_snapshot' },
          { state_id: 'current' },
        ],
        attributeColumns: [
          { payload_json: JSON.stringify(snapshotWithoutEvents) },
          { cursor },
          { updated_at: new Date().toISOString() },
        ],
      });
      return { snapshot: merged, cursor };
    },
  };
}

export function createTablestoreRepositoryFromEnv(env, context = {}) {
  const credentials = context.credentials ?? context.Credentials ?? {};
  const accessKeyId = credentials.accessKeyId ?? credentials.AccessKeyId
    ?? env.ALIBABA_CLOUD_ACCESS_KEY_ID ?? env.TABLESTORE_ACCESS_KEY_ID;
  const secretAccessKey = credentials.accessKeySecret ?? credentials.AccessKeySecret
    ?? env.ALIBABA_CLOUD_ACCESS_KEY_SECRET ?? env.TABLESTORE_ACCESS_KEY_SECRET;
  const stsToken = credentials.securityToken ?? credentials.SecurityToken
    ?? env.ALIBABA_CLOUD_SECURITY_TOKEN;
  if (!accessKeyId || !secretAccessKey || !env.TABLESTORE_ENDPOINT || !env.TABLESTORE_INSTANCE_NAME) {
    throw new Error('Tablestore connection environment variables are incomplete.');
  }
  const client = new TableStore.Client({
    accessKeyId,
    secretAccessKey,
    stsToken,
    endpoint: env.TABLESTORE_ENDPOINT,
    instancename: env.TABLESTORE_INSTANCE_NAME,
  });
  return createTablestoreRepository(client, {
    events: env.TABLESTORE_EVENTS_TABLE ?? DEFAULT_TABLES.events,
    words: env.TABLESTORE_WORDS_TABLE ?? DEFAULT_TABLES.words,
    app: env.TABLESTORE_APP_TABLE ?? DEFAULT_TABLES.app,
  });
}
