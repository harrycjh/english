import type { AnswerEvent } from '../models/answer-event';
import type { DailyTaskSummary } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import type { ParentSetting } from '../models/parent-setting';
import type {
  LearningCheckpoint,
  ParentSettingField,
  RevisionStamp,
  VersionedParentSetting,
  VersionedWordSelectionState,
} from '../models/sync';
import { createEmptyRecord, evaluateAnswer } from './spaced-repetition';

function compareEvents(left: AnswerEvent, right: AnswerEvent): number {
  return left.answeredAt.localeCompare(right.answeredAt) || left.id.localeCompare(right.id);
}

function chooseCanonicalEvent(left: AnswerEvent, right: AnswerEvent): AnswerEvent {
  const leftKey = `${left.schemaVersion ?? 0}\u0000${left.deviceId ?? ''}\u0000${JSON.stringify(left)}`;
  const rightKey = `${right.schemaVersion ?? 0}\u0000${right.deviceId ?? ''}\u0000${JSON.stringify(right)}`;
  return leftKey.localeCompare(rightKey) >= 0 ? left : right;
}

export function mergeAnswerEvents(local: AnswerEvent[], remote: AnswerEvent[]): AnswerEvent[] {
  const byId = new Map<string, AnswerEvent>();
  for (const event of [...local, ...remote]) {
    const existing = byId.get(event.id);
    byId.set(event.id, existing ? chooseCanonicalEvent(existing, event) : event);
  }
  return [...byId.values()].sort(compareEvents);
}

export function replayLearningRecords(
  events: AnswerEvent[],
  checkpoint: LearningCheckpoint | null = null,
): Record<string, LearningRecord> {
  const records = Object.fromEntries(
    (checkpoint?.records ?? []).map((record) => [record.wordId, { ...record }]),
  );
  const generation = checkpoint?.generation ?? 0;

  for (const event of [...events].sort(compareEvents)) {
    if ((event.generation ?? 0) !== generation) {
      continue;
    }
    if (checkpoint && event.answeredAt <= checkpoint.capturedAt) {
      continue;
    }
    const current = records[event.wordId] ?? createEmptyRecord(event.wordId);
    records[event.wordId] = evaluateAnswer(
      current,
      event.isCorrect,
      new Date(event.answeredAt),
      event.learningAction,
      event.levelDowngrade,
    );
  }

  return records;
}

function compareRevision(left?: RevisionStamp, right?: RevisionStamp): number {
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  return left.updatedAt.localeCompare(right.updatedAt) || left.deviceId.localeCompare(right.deviceId);
}

function compareSelection(left: VersionedWordSelectionState, right: VersionedWordSelectionState): number {
  return left.updatedAt.localeCompare(right.updatedAt)
    || left.updatedByDeviceId.localeCompare(right.updatedByDeviceId);
}

export function mergeWordSelectionStates(
  local: VersionedWordSelectionState[],
  remote: VersionedWordSelectionState[],
): VersionedWordSelectionState[] {
  const byWordId = new Map<string, VersionedWordSelectionState>();
  for (const state of [...local, ...remote]) {
    const existing = byWordId.get(state.wordId);
    if (!existing || compareSelection(state, existing) > 0) {
      byWordId.set(state.wordId, state);
    }
  }
  return [...byWordId.values()].sort((left, right) => left.wordId.localeCompare(right.wordId));
}

export function mergeParentSetting(
  local: VersionedParentSetting,
  remote: VersionedParentSetting,
): VersionedParentSetting {
  const fields = Object.keys(local.value) as ParentSettingField[];
  const value = { ...local.value };
  const fieldRevisions = { ...local.fieldRevisions };

  for (const field of fields) {
    const localRevision = local.fieldRevisions[field];
    const remoteRevision = remote.fieldRevisions[field];
    if (compareRevision(remoteRevision, localRevision) > 0) {
      Object.assign(value, { [field]: remote.value[field] });
      fieldRevisions[field] = remoteRevision;
    }
  }

  return { value, fieldRevisions };
}

function mergeTaskBase(left: DailyTaskSummary, right: DailyTaskSummary): DailyTaskSummary {
  const completedTimes = [left.completedAt, right.completedAt].filter((value): value is string => Boolean(value));
  return {
    ...left,
    newWordIds: [...new Set([...left.newWordIds, ...right.newWordIds])],
    reviewWordIds: [...new Set([...left.reviewWordIds, ...right.reviewWordIds])],
    completedAt: completedTimes.sort()[0] ?? null,
    correctCount: 0,
    wrongCount: 0,
    totalAnswered: 0,
    answeredWordIds: [...new Set([...left.answeredWordIds, ...right.answeredWordIds])],
  };
}

export function mergeDailyTasks(
  local: DailyTaskSummary[],
  remote: DailyTaskSummary[],
  events: AnswerEvent[],
): DailyTaskSummary[] {
  const byDate = new Map<string, DailyTaskSummary>();
  for (const task of [...local, ...remote]) {
    const existing = byDate.get(task.dateKey);
    byDate.set(task.dateKey, existing ? mergeTaskBase(existing, task) : { ...task });
  }

  const eventsByDate = new Map<string, AnswerEvent[]>();
  for (const event of events) {
    const dateEvents = eventsByDate.get(event.dateKey) ?? [];
    dateEvents.push(event);
    eventsByDate.set(event.dateKey, dateEvents);
  }

  for (const [dateKey, task] of byDate) {
    const dateEvents = (eventsByDate.get(dateKey) ?? []).sort(compareEvents);
    const answeredWordIds = dateEvents.length > 0
      ? [...new Set(dateEvents.filter((event) => event.isCorrect).map((event) => event.wordId))]
      : task.answeredWordIds;
    const answeredWordIdSet = new Set(answeredWordIds);
    const plannedWordIds = new Set([...task.reviewWordIds, ...task.newWordIds]);
    const isFullyAnswered = [...plannedWordIds].every((wordId) => answeredWordIdSet.has(wordId));
    byDate.set(dateKey, {
      ...task,
      completedAt: task.completedAt && isFullyAnswered ? task.completedAt : null,
      correctCount: dateEvents.filter((event) => event.isCorrect).length,
      wrongCount: dateEvents.filter((event) => !event.isCorrect).length,
      totalAnswered: dateEvents.length,
      answeredWordIds,
    });
  }

  return [...byDate.values()].sort((left, right) => left.dateKey.localeCompare(right.dateKey));
}
