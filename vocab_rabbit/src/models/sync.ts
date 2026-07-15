import type { AnswerEvent } from './answer-event';
import type { DailyTaskSummary } from './daily-task';
import type { LearningRecord } from './learning-record';
import type { ParentSetting } from './parent-setting';
import type { WordSelectionState } from './word-selection-state';

export const SYNC_SCHEMA_VERSION = 1;

export interface RevisionStamp {
  updatedAt: string;
  deviceId: string;
}

export interface LearningCheckpoint {
  capturedAt: string;
  deviceId: string;
  generation: number;
  records: LearningRecord[];
}

export interface VersionedWordSelectionState extends WordSelectionState {
  updatedByDeviceId: string;
}

export type ParentSettingField = keyof ParentSetting;

export interface VersionedParentSetting {
  value: ParentSetting;
  fieldRevisions: Partial<Record<ParentSettingField, RevisionStamp>>;
}

export interface SyncSnapshot {
  schemaVersion: typeof SYNC_SCHEMA_VERSION;
  generation: number;
  events: AnswerEvent[];
  checkpoint: LearningCheckpoint | null;
  dailyTasks: DailyTaskSummary[];
  wordSelectionStates: VersionedWordSelectionState[];
  parentSetting: VersionedParentSetting;
}

export interface SyncMetadata {
  id: 'sync';
  deviceId: string;
  deviceToken: string | null;
  serverCursor: string | null;
  generation: number;
  lastSyncedAt: string | null;
  pendingSince: string | null;
  checkpoint: LearningCheckpoint | null;
}

export interface SyncRequest {
  schemaVersion: typeof SYNC_SCHEMA_VERSION;
  deviceId: string;
  cursor: string | null;
  snapshot: SyncSnapshot;
}

export interface SyncResponse {
  schemaVersion: typeof SYNC_SCHEMA_VERSION;
  cursor: string;
  serverTime: string;
  snapshot: SyncSnapshot;
}
