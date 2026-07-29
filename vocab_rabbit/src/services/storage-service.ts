import Dexie, { type Table } from 'dexie';
import type { AnswerEvent } from '../models/answer-event';
import type { DailyTaskSummary } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import type { LocalLifePhotoRecord } from '../models/local-media';
import {
  defaultParentSetting,
  normalizeParentSetting,
  type ParentSetting,
} from '../models/parent-setting';
import { type WordSelectionState } from '../models/word-selection-state';
import {
  SYNC_SCHEMA_VERSION,
  type SyncDelta,
  type SyncMetadata,
  type SyncRequest,
  type SyncResponse,
  type VersionedParentSetting,
  type VersionedWordSelectionState,
} from '../models/sync';
import type { StudyDataExport } from './study-data-export';
import {
  mergeAnswerEvents,
  mergeDailyTasks,
  mergeParentSetting,
  mergeWordSelectionStates,
  replayLearningRecords,
} from './sync-merge-service';

interface StoredParentSetting extends ParentSetting {
  id: string;
}

interface StoredVersionedParentSetting extends VersionedParentSetting {
  id: string;
}

const PARENT_SETTING_ID = 'default';
const SYNC_METADATA_ID = 'sync';

class VocabRabbitDatabase extends Dexie {
  answerEvents!: Table<AnswerEvent, string>;
  learningRecords!: Table<LearningRecord, string>;
  dailyTasks!: Table<DailyTaskSummary, string>;
  parentSettings!: Table<StoredParentSetting, string>;
  wordSelectionStates!: Table<VersionedWordSelectionState, string>;
  localLifePhotos!: Table<LocalLifePhotoRecord, string>;
  syncMetadata!: Table<SyncMetadata, string>;
  parentSettingSync!: Table<StoredVersionedParentSetting, string>;

  constructor() {
    super('vocab-rabbit');
    this.version(1).stores({
      learningRecords: 'wordId,nextDueAt,masteryLevel',
      dailyTasks: 'dateKey,completedAt',
    });
    this.version(2).stores({
      learningRecords: 'wordId,nextDueAt,masteryLevel',
      dailyTasks: 'dateKey,completedAt',
      parentSettings: 'id',
    });
    this.version(3).stores({
      learningRecords: 'wordId,nextDueAt,masteryLevel',
      dailyTasks: 'dateKey,completedAt',
      parentSettings: 'id',
      wordSelectionStates: 'wordId,isEnabled,isPaused,updatedAt',
    });
    this.version(4).stores({
      learningRecords: 'wordId,nextDueAt,masteryLevel',
      dailyTasks: 'dateKey,completedAt',
      parentSettings: 'id',
      wordSelectionStates: 'wordId,isEnabled,isPaused,updatedAt',
      answerEvents: 'id,wordId,dateKey,answeredAt,questionKind,isCorrect',
    });
    this.version(5).stores({
      learningRecords: 'wordId,nextDueAt,masteryLevel',
      dailyTasks: 'dateKey,completedAt',
      parentSettings: 'id',
      wordSelectionStates: 'wordId,isEnabled,isPaused,updatedAt',
      answerEvents: 'id,wordId,dateKey,answeredAt,questionKind,isCorrect',
      localLifePhotos: 'wordId,importedAt',
    });
    this.version(6).stores({
      learningRecords: 'wordId,nextDueAt,masteryLevel',
      dailyTasks: 'dateKey,completedAt',
      parentSettings: 'id',
      wordSelectionStates: 'wordId,isEnabled,isPaused,updatedAt,updatedByDeviceId',
      answerEvents: 'id,wordId,dateKey,answeredAt,questionKind,isCorrect,deviceId,generation',
      localLifePhotos: 'wordId,importedAt',
      syncMetadata: 'id,deviceId,lastSyncedAt,pendingSince',
      parentSettingSync: 'id',
    });
  }
}

const database = new VocabRabbitDatabase();

function createDeviceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createSyncMetadata(): SyncMetadata {
  return {
    id: SYNC_METADATA_ID,
    deviceId: createDeviceId(),
    deviceToken: null,
    serverCursor: null,
    generation: 0,
    lastSyncedAt: null,
    pendingSince: null,
    checkpoint: null,
    pendingEventIds: [],
    pendingTaskDateKeys: [],
    pendingSelectionWordIds: [],
    pendingParentSetting: false,
    forceFullSync: false,
  };
}

async function ensureSyncMetadata(): Promise<SyncMetadata> {
  const existing = await database.syncMetadata.get(SYNC_METADATA_ID);
  if (existing) {
    const hasChangeTracking = Array.isArray(existing.pendingEventIds)
      || Array.isArray(existing.pendingTaskDateKeys)
      || Array.isArray(existing.pendingSelectionWordIds)
      || typeof existing.pendingParentSetting === 'boolean'
      || typeof existing.forceFullSync === 'boolean';
    return {
      ...existing,
      checkpoint: existing.checkpoint ?? null,
      pendingEventIds: existing.pendingEventIds ?? [],
      pendingTaskDateKeys: existing.pendingTaskDateKeys ?? [],
      pendingSelectionWordIds: existing.pendingSelectionWordIds ?? [],
      pendingParentSetting: existing.pendingParentSetting ?? false,
      forceFullSync: existing.forceFullSync ?? (existing.pendingSince !== null && !hasChangeTracking),
    };
  }
  const metadata = createSyncMetadata();
  await database.syncMetadata.put(metadata);
  return metadata;
}

interface PendingSyncChanges {
  eventIds?: string[];
  taskDateKeys?: string[];
  selectionWordIds?: string[];
  parentSetting?: boolean;
  forceFullSync?: boolean;
}

function unionStrings(current: string[], additions: string[] = []): string[] {
  return [...new Set([...current, ...additions])];
}

async function markPending(
  metadata?: SyncMetadata,
  changes: PendingSyncChanges = { forceFullSync: true },
): Promise<SyncMetadata> {
  const current = metadata ?? await ensureSyncMetadata();
  const next = {
    ...current,
    pendingSince: current.pendingSince ?? new Date().toISOString(),
    pendingEventIds: unionStrings(current.pendingEventIds, changes.eventIds),
    pendingTaskDateKeys: unionStrings(current.pendingTaskDateKeys, changes.taskDateKeys),
    pendingSelectionWordIds: unionStrings(current.pendingSelectionWordIds, changes.selectionWordIds),
    pendingParentSetting: current.pendingParentSetting || Boolean(changes.parentSetting),
    forceFullSync: current.forceFullSync || Boolean(changes.forceFullSync),
  };
  await database.syncMetadata.put(next);
  return next;
}

export async function getOrCreateSyncMetadata(): Promise<SyncMetadata> {
  return ensureSyncMetadata();
}

export async function saveDeviceToken(deviceToken: string | null): Promise<SyncMetadata> {
  const metadata = await ensureSyncMetadata();
  const next = { ...metadata, deviceToken };
  await database.syncMetadata.put(next);
  return next;
}

export async function buildLocalSyncRequest(options: { forceFull?: boolean } = {}): Promise<SyncRequest> {
  const metadata = await ensureSyncMetadata();
  if (metadata.serverCursor && !metadata.pendingSince) {
    return {
      schemaVersion: SYNC_SCHEMA_VERSION,
      deviceId: metadata.deviceId,
      cursor: metadata.serverCursor,
      hasLocalChanges: false,
      snapshot: null,
      delta: null,
    };
  }

  if (metadata.serverCursor && !metadata.forceFullSync && !options.forceFull) {
    const [events, dailyTasks, selectionStates, storedSetting, storedVersionedSetting] = await Promise.all([
      database.answerEvents.bulkGet(metadata.pendingEventIds),
      database.dailyTasks.bulkGet(metadata.pendingTaskDateKeys),
      database.wordSelectionStates.bulkGet(metadata.pendingSelectionWordIds),
      metadata.pendingParentSetting ? database.parentSettings.get(PARENT_SETTING_ID) : undefined,
      metadata.pendingParentSetting ? database.parentSettingSync.get(PARENT_SETTING_ID) : undefined,
    ]);
    const parentSetting = storedSetting ? normalizeParentSetting(storedSetting) : null;
    const versionedParentSetting = storedVersionedSetting
      ? { value: storedVersionedSetting.value, fieldRevisions: storedVersionedSetting.fieldRevisions }
      : parentSetting ? {
        value: parentSetting,
        fieldRevisions: {},
      } : null;
    const delta: SyncDelta = {
      schemaVersion: SYNC_SCHEMA_VERSION,
      generation: metadata.generation,
      events: events.filter((event): event is AnswerEvent => Boolean(event)),
      dailyTasks: dailyTasks.filter((task): task is DailyTaskSummary => Boolean(task)).map(normalizeDailyTask),
      wordSelectionStates: selectionStates.filter(
        (state): state is VersionedWordSelectionState => Boolean(state),
      ),
      parentSetting: versionedParentSetting,
    };
    return {
      schemaVersion: SYNC_SCHEMA_VERSION,
      deviceId: metadata.deviceId,
      cursor: metadata.serverCursor,
      hasLocalChanges: true,
      snapshot: null,
      delta,
    };
  }

  const [events, records, dailyTasks, storedSetting, storedVersionedSetting, selectionStates] = await Promise.all([
    database.answerEvents.orderBy('answeredAt').toArray(),
    database.learningRecords.toArray(),
    database.dailyTasks.orderBy('dateKey').toArray(),
    database.parentSettings.get(PARENT_SETTING_ID),
    database.parentSettingSync.get(PARENT_SETTING_ID),
    database.wordSelectionStates.toArray(),
  ]);
  const now = new Date().toISOString();
  const parentSetting = normalizeParentSetting(storedSetting ?? defaultParentSetting);
  const versionedParentSetting: VersionedParentSetting = storedVersionedSetting ?? {
    value: parentSetting,
    fieldRevisions: Object.fromEntries(
      (Object.keys(parentSetting) as (keyof ParentSetting)[]).map((field) => [
        field,
        { updatedAt: now, deviceId: metadata.deviceId },
      ]),
    ),
  };
  const selectionNeedsUpgrade = selectionStates.some((state) => !state.updatedByDeviceId);
  const versionedSelectionStates = selectionStates.map((state) => ({
    ...state,
    updatedByDeviceId: state.updatedByDeviceId ?? metadata.deviceId,
  }));
  const checkpoint = metadata.checkpoint ?? (records.length > 0 ? {
    capturedAt: now,
    deviceId: metadata.deviceId,
    generation: metadata.generation,
    records,
  } : null);

  if (!storedVersionedSetting || checkpoint !== metadata.checkpoint || selectionNeedsUpgrade) {
    await database.transaction(
      'rw',
      database.parentSettingSync,
      database.wordSelectionStates,
      database.syncMetadata,
      async () => {
        await database.parentSettingSync.put({ id: PARENT_SETTING_ID, ...versionedParentSetting });
        if (versionedSelectionStates.length > 0) {
          await database.wordSelectionStates.bulkPut(versionedSelectionStates);
        }
        await database.syncMetadata.put({ ...metadata, checkpoint });
      },
    );
  }

  return {
    schemaVersion: SYNC_SCHEMA_VERSION,
    deviceId: metadata.deviceId,
    cursor: metadata.serverCursor,
    hasLocalChanges: true,
    delta: null,
    snapshot: {
      schemaVersion: SYNC_SCHEMA_VERSION,
      generation: metadata.generation,
      events,
      checkpoint,
      dailyTasks,
      wordSelectionStates: versionedSelectionStates,
      parentSetting: versionedParentSetting,
    },
  };
}

function normalizeDailyTask(task: DailyTaskSummary): DailyTaskSummary {
  return {
    ...task,
    wrongCount: task.wrongCount ?? Math.max(task.totalAnswered - task.correctCount, 0),
    answeredWordIds: task.answeredWordIds ?? [],
  };
}

export async function listLearningRecords(): Promise<Record<string, LearningRecord>> {
  const records = await database.learningRecords.toArray();
  return Object.fromEntries(records.map((record) => [record.wordId, record]));
}

export async function saveLearningRecord(record: LearningRecord): Promise<void> {
  await database.transaction('rw', database.learningRecords, database.syncMetadata, async () => {
    await database.learningRecords.put(record);
    await markPending(undefined, { forceFullSync: true });
  });
}

export async function getDailyTask(dateKey: string): Promise<DailyTaskSummary | undefined> {
  const task = await database.dailyTasks.get(dateKey);
  return task ? normalizeDailyTask(task) : undefined;
}

export async function saveDailyTask(task: DailyTaskSummary): Promise<void> {
  await database.transaction('rw', database.dailyTasks, database.syncMetadata, async () => {
    await database.dailyTasks.put(task);
    await markPending(undefined, { taskDateKeys: [task.dateKey] });
  });
}

export async function listRecentTasks(limit: number): Promise<DailyTaskSummary[]> {
  const tasks = await database.dailyTasks.orderBy('dateKey').reverse().limit(limit).toArray();
  return tasks.reverse().map(normalizeDailyTask);
}

export async function listDailyTasks(): Promise<DailyTaskSummary[]> {
  const tasks = await database.dailyTasks.orderBy('dateKey').toArray();
  return tasks.map(normalizeDailyTask);
}

export async function getParentSetting(): Promise<ParentSetting> {
  const setting = await database.parentSettings.get(PARENT_SETTING_ID);
  if (!setting) {
    return defaultParentSetting;
  }

  const { id: _id, ...savedSetting } = setting;
  return normalizeParentSetting(savedSetting);
}

export async function saveParentSetting(setting: ParentSetting): Promise<void> {
  await database.transaction('rw', database.parentSettings, database.parentSettingSync, database.syncMetadata, async () => {
    const metadata = await ensureSyncMetadata();
    const normalized = normalizeParentSetting(setting);
    const previous = await database.parentSettings.get(PARENT_SETTING_ID);
    const previousVersioned = await database.parentSettingSync.get(PARENT_SETTING_ID);
    const now = new Date().toISOString();
    const fieldRevisions = { ...(previousVersioned?.fieldRevisions ?? {}) };
    for (const field of Object.keys(normalized) as (keyof ParentSetting)[]) {
      if (!previous || previous[field] !== normalized[field] || !fieldRevisions[field]) {
        fieldRevisions[field] = { updatedAt: now, deviceId: metadata.deviceId };
      }
    }
    await database.parentSettings.put({ id: PARENT_SETTING_ID, ...normalized });
    await database.parentSettingSync.put({
      id: PARENT_SETTING_ID,
      value: normalized,
      fieldRevisions,
    });
    await markPending(metadata, { parentSetting: true });
  });
}

export async function listWordSelectionStates(): Promise<Record<string, WordSelectionState>> {
  const states = await database.wordSelectionStates.toArray();
  return Object.fromEntries(states.map((state) => [state.wordId, state]));
}

export async function saveWordSelectionState(state: WordSelectionState): Promise<void> {
  await saveWordSelectionStates([state]);
}

export async function saveWordSelectionStates(states: WordSelectionState[]): Promise<void> {
  if (states.length === 0) {
    return;
  }

  await database.transaction('rw', database.wordSelectionStates, database.syncMetadata, async () => {
    const metadata = await ensureSyncMetadata();
    await database.wordSelectionStates.bulkPut(states.map((state) => ({
      ...state,
      updatedByDeviceId: (state as VersionedWordSelectionState).updatedByDeviceId ?? metadata.deviceId,
    })));
    await markPending(metadata, { selectionWordIds: states.map((state) => state.wordId) });
  });
}

export async function saveAnswerEvent(event: AnswerEvent): Promise<void> {
  await database.transaction('rw', database.answerEvents, database.syncMetadata, async () => {
    const metadata = await ensureSyncMetadata();
    await database.answerEvents.put({
      ...event,
      deviceId: event.deviceId ?? metadata.deviceId,
      schemaVersion: event.schemaVersion ?? SYNC_SCHEMA_VERSION,
      generation: event.generation ?? metadata.generation,
    });
    await markPending(metadata, { eventIds: [event.id] });
  });
}

export async function saveAnswerAndLearningRecord(
  event: AnswerEvent,
  record: LearningRecord,
): Promise<void> {
  await database.transaction(
    'rw',
    database.answerEvents,
    database.learningRecords,
    database.syncMetadata,
    async () => {
      const metadata = await ensureSyncMetadata();
      await database.answerEvents.put({
        ...event,
        deviceId: event.deviceId ?? metadata.deviceId,
        schemaVersion: event.schemaVersion ?? SYNC_SCHEMA_VERSION,
        generation: event.generation ?? metadata.generation,
        learningStateAfter: event.learningStateAfter ?? record,
      });
      await database.learningRecords.put(record);
      await markPending(metadata, { eventIds: [event.id] });
    },
  );
}

export async function listAnswerEvents(limit?: number): Promise<AnswerEvent[]> {
  if (!limit) {
    return database.answerEvents.orderBy('answeredAt').toArray();
  }

  const events = await database.answerEvents.orderBy('answeredAt').reverse().limit(limit).toArray();
  return events.reverse();
}

export async function listLocalLifePhotos(): Promise<Record<string, LocalLifePhotoRecord>> {
  const photos = await database.localLifePhotos.toArray();
  return Object.fromEntries(photos.map((photo) => [photo.wordId, photo]));
}

export async function listLocalLifePhotoIds(): Promise<string[]> {
  return database.localLifePhotos.toCollection().primaryKeys();
}

export async function countLocalLifePhotos(): Promise<number> {
  return database.localLifePhotos.count();
}

export async function getLocalLifePhotos(wordIds: string[]): Promise<LocalLifePhotoRecord[]> {
  if (wordIds.length === 0) {
    return [];
  }
  const photos = await database.localLifePhotos.bulkGet(wordIds);
  return photos.filter((photo): photo is LocalLifePhotoRecord => Boolean(photo));
}

export async function saveLocalLifePhotos(photos: LocalLifePhotoRecord[]): Promise<void> {
  if (photos.length === 0) {
    return;
  }

  await database.localLifePhotos.bulkPut(photos);
}

export async function replaceLocalLifePhotos(photos: LocalLifePhotoRecord[]): Promise<void> {
  await database.transaction('rw', database.localLifePhotos, async () => {
    await database.localLifePhotos.clear();
    if (photos.length > 0) {
      await database.localLifePhotos.bulkPut(photos);
    }
  });
}

export async function clearLocalLifePhotos(): Promise<void> {
  await database.localLifePhotos.clear();
}

export async function replaceStudyData(backup: StudyDataExport): Promise<void> {
  const storedSetting: StoredParentSetting = {
    id: PARENT_SETTING_ID,
    ...normalizeParentSetting(backup.tables.parentSetting),
  };

  await database.transaction(
    'rw',
    [
      database.learningRecords,
      database.dailyTasks,
      database.parentSettings,
      database.wordSelectionStates,
      database.answerEvents,
      database.syncMetadata,
    ],
    async () => {
      const metadata = await ensureSyncMetadata();
      await Promise.all([
        database.learningRecords.clear(),
        database.dailyTasks.clear(),
        database.parentSettings.clear(),
        database.wordSelectionStates.clear(),
        database.answerEvents.clear(),
      ]);
      await Promise.all([
        database.learningRecords.bulkPut(backup.tables.learningRecords),
        database.dailyTasks.bulkPut(backup.tables.dailyTasks),
        database.parentSettings.put(storedSetting),
        database.wordSelectionStates.bulkPut(backup.tables.wordSelectionStates.map((state) => ({
          ...state,
          updatedByDeviceId: metadata.deviceId,
        }))),
        database.answerEvents.bulkPut(backup.tables.answerEvents),
        markPending(undefined, { forceFullSync: true }),
      ]);
    },
  );
}

export async function clearStudyData(): Promise<void> {
  await database.transaction('rw', database.learningRecords, database.dailyTasks, database.answerEvents, database.syncMetadata, async () => {
    await database.learningRecords.clear();
    await database.dailyTasks.clear();
    await database.answerEvents.clear();
    await markPending(undefined, { forceFullSync: true });
  });
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

function hasChangesAfterRequest(
  request: SyncRequest | undefined,
  metadata: SyncMetadata,
  events: AnswerEvent[],
  dailyTasks: DailyTaskSummary[],
  wordSelectionStates: VersionedWordSelectionState[],
  parentSetting: VersionedParentSetting | null,
): boolean {
  if (!request) return false;
  const sortEvents = (items: AnswerEvent[]) => [...items].sort((left, right) => left.id.localeCompare(right.id));
  const sortTasks = (items: DailyTaskSummary[]) => [...items].sort((left, right) => left.dateKey.localeCompare(right.dateKey));
  const sortSelection = (items: VersionedWordSelectionState[]) => [...items].sort((left, right) => left.wordId.localeCompare(right.wordId));

  if (request.delta) {
    const eventById = new Map(events.map((event) => [event.id, event]));
    const taskByDate = new Map(dailyTasks.map((task) => [task.dateKey, task]));
    const selectionById = new Map(wordSelectionStates.map((state) => [state.wordId, state]));
    const sentEventIds = new Set(request.delta.events.map((event) => event.id));
    const sentTaskDateKeys = new Set(request.delta.dailyTasks.map((task) => task.dateKey));
    const sentSelectionWordIds = new Set(request.delta.wordSelectionStates.map((state) => state.wordId));
    return metadata.forceFullSync
      || metadata.pendingEventIds.some((id) => !sentEventIds.has(id))
      || metadata.pendingTaskDateKeys.some((dateKey) => !sentTaskDateKeys.has(dateKey))
      || metadata.pendingSelectionWordIds.some((wordId) => !sentSelectionWordIds.has(wordId))
      || (metadata.pendingParentSetting && request.delta.parentSetting === null)
      || request.delta.events.some((event) => canonicalJson(eventById.get(event.id)) !== canonicalJson(event))
      || request.delta.dailyTasks.some((task) => canonicalJson(taskByDate.get(task.dateKey)) !== canonicalJson(task))
      || request.delta.wordSelectionStates.some(
        (state) => canonicalJson(selectionById.get(state.wordId)) !== canonicalJson(state),
      )
      || (request.delta.parentSetting !== null
        && canonicalJson(parentSetting) !== canonicalJson(request.delta.parentSetting));
  }

  if (!request.snapshot) return metadata.pendingSince !== null;

  return canonicalJson(sortEvents(events)) !== canonicalJson(sortEvents(request.snapshot.events))
    || canonicalJson(sortTasks(dailyTasks)) !== canonicalJson(sortTasks(request.snapshot.dailyTasks))
    || canonicalJson(sortSelection(wordSelectionStates)) !== canonicalJson(sortSelection(request.snapshot.wordSelectionStates))
    || canonicalJson(parentSetting) !== canonicalJson(request.snapshot.parentSetting)
    || canonicalJson(metadata.checkpoint) !== canonicalJson(request.snapshot.checkpoint);
}

function syncMetadataAfterResponse(
  metadata: SyncMetadata,
  response: SyncResponse,
  hasLateLocalChanges: boolean,
): SyncMetadata {
  return {
    ...metadata,
    deviceToken: response.deviceToken ?? metadata.deviceToken,
    serverCursor: response.cursor,
    lastSyncedAt: response.serverTime,
    pendingSince: hasLateLocalChanges ? metadata.pendingSince ?? new Date().toISOString() : null,
    pendingEventIds: hasLateLocalChanges ? metadata.pendingEventIds : [],
    pendingTaskDateKeys: hasLateLocalChanges ? metadata.pendingTaskDateKeys : [],
    pendingSelectionWordIds: hasLateLocalChanges ? metadata.pendingSelectionWordIds : [],
    pendingParentSetting: hasLateLocalChanges ? metadata.pendingParentSetting : false,
    forceFullSync: hasLateLocalChanges ? metadata.forceFullSync : false,
  };
}

export async function applySyncResponse(response: SyncResponse, request?: SyncRequest): Promise<void> {
  if (response.schemaVersion !== SYNC_SCHEMA_VERSION
    || (!response.snapshot && response.upToDate !== true)
    || (response.snapshot && response.snapshot.schemaVersion !== SYNC_SCHEMA_VERSION)) {
    throw new Error('云端数据版本高于当前应用，请先升级应用。');
  }

  if (!response.snapshot) {
    await database.transaction(
      'rw',
      [
        database.answerEvents,
        database.dailyTasks,
        database.parentSettingSync,
        database.wordSelectionStates,
        database.syncMetadata,
      ],
      async () => {
      const metadata = await ensureSyncMetadata();
      const [events, dailyTasks, storedParentSetting, wordSelectionStates] = await Promise.all([
        database.answerEvents.orderBy('answeredAt').toArray(),
        database.dailyTasks.orderBy('dateKey').toArray(),
        database.parentSettingSync.get(PARENT_SETTING_ID),
        database.wordSelectionStates.toArray(),
      ]);
      const parentSetting = storedParentSetting
        ? { value: storedParentSetting.value, fieldRevisions: storedParentSetting.fieldRevisions }
        : null;
      const hasLateLocalChanges = hasChangesAfterRequest(
        request,
        metadata,
        events,
        dailyTasks,
        wordSelectionStates,
        parentSetting,
      );
      await database.syncMetadata.put(syncMetadataAfterResponse(metadata, response, hasLateLocalChanges));
      },
    );
    return;
  }

  const snapshot = response.snapshot;
  await database.transaction(
    'rw',
    [
      database.answerEvents,
      database.learningRecords,
      database.dailyTasks,
      database.parentSettings,
      database.parentSettingSync,
      database.wordSelectionStates,
      database.syncMetadata,
    ],
    async () => {
      const metadata = await ensureSyncMetadata();
      const [localEvents, localDailyTasks, localParentSetting, localWordSelectionStates] = await Promise.all([
        database.answerEvents.orderBy('answeredAt').toArray(),
        database.dailyTasks.orderBy('dateKey').toArray(),
        database.parentSettingSync.get(PARENT_SETTING_ID),
        database.wordSelectionStates.toArray(),
      ]);
      const storedParentSetting = localParentSetting
        ? { value: localParentSetting.value, fieldRevisions: localParentSetting.fieldRevisions }
        : null;
      const hasLateLocalChanges = hasChangesAfterRequest(
        request,
        metadata,
        localEvents,
        localDailyTasks,
        localWordSelectionStates,
        storedParentSetting,
      );
      const events = mergeAnswerEvents(snapshot.events, localEvents);
      const dailyTasks = mergeDailyTasks(snapshot.dailyTasks, localDailyTasks, events);
      const wordSelectionStates = mergeWordSelectionStates(snapshot.wordSelectionStates, localWordSelectionStates);
      const parentSetting = storedParentSetting
        ? mergeParentSetting(snapshot.parentSetting, storedParentSetting)
        : snapshot.parentSetting;
      const checkpoint = request?.snapshot
        && canonicalJson(metadata.checkpoint) !== canonicalJson(request.snapshot.checkpoint)
        ? metadata.checkpoint
        : snapshot.checkpoint;
      const records = Object.values(replayLearningRecords(events, checkpoint));
      await Promise.all([
        database.answerEvents.clear(),
        database.learningRecords.clear(),
        database.dailyTasks.clear(),
        database.parentSettings.clear(),
        database.parentSettingSync.clear(),
        database.wordSelectionStates.clear(),
      ]);
      await Promise.all([
        database.answerEvents.bulkPut(events),
        database.learningRecords.bulkPut(records),
        database.dailyTasks.bulkPut(dailyTasks),
        database.parentSettings.put({
          id: PARENT_SETTING_ID,
          ...normalizeParentSetting(parentSetting.value),
        }),
        database.parentSettingSync.put({ id: PARENT_SETTING_ID, ...parentSetting }),
        database.wordSelectionStates.bulkPut(wordSelectionStates),
        database.syncMetadata.put({
          ...syncMetadataAfterResponse(metadata, response, hasLateLocalChanges),
          generation: snapshot.generation,
          checkpoint,
        }),
      ]);
    },
  );
}

export async function clearLocalDeviceData(): Promise<void> {
  await database.transaction(
    'rw',
    [
      database.answerEvents,
      database.learningRecords,
      database.dailyTasks,
      database.parentSettings,
      database.parentSettingSync,
      database.wordSelectionStates,
      database.localLifePhotos,
      database.syncMetadata,
    ],
    async () => {
      await Promise.all([
        database.answerEvents.clear(),
        database.learningRecords.clear(),
        database.dailyTasks.clear(),
        database.parentSettings.clear(),
        database.parentSettingSync.clear(),
        database.wordSelectionStates.clear(),
        database.localLifePhotos.clear(),
        database.syncMetadata.clear(),
      ]);
    },
  );
}
