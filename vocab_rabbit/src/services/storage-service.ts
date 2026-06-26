import Dexie, { type Table } from 'dexie';
import type { AnswerEvent } from '../models/answer-event';
import type { DailyTaskSummary } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import {
  defaultParentSetting,
  normalizeParentSetting,
  type ParentSetting,
} from '../models/parent-setting';
import { type WordSelectionState } from '../models/word-selection-state';

interface StoredParentSetting extends ParentSetting {
  id: string;
}

const PARENT_SETTING_ID = 'default';

class VocabRabbitDatabase extends Dexie {
  answerEvents!: Table<AnswerEvent, string>;
  learningRecords!: Table<LearningRecord, string>;
  dailyTasks!: Table<DailyTaskSummary, string>;
  parentSettings!: Table<StoredParentSetting, string>;
  wordSelectionStates!: Table<WordSelectionState, string>;

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
  }
}

const database = new VocabRabbitDatabase();

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
  await database.learningRecords.put(record);
}

export async function getDailyTask(dateKey: string): Promise<DailyTaskSummary | undefined> {
  const task = await database.dailyTasks.get(dateKey);
  return task ? normalizeDailyTask(task) : undefined;
}

export async function saveDailyTask(task: DailyTaskSummary): Promise<void> {
  await database.dailyTasks.put(task);
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
  await database.parentSettings.put({
    id: PARENT_SETTING_ID,
    ...normalizeParentSetting(setting),
  });
}

export async function listWordSelectionStates(): Promise<Record<string, WordSelectionState>> {
  const states = await database.wordSelectionStates.toArray();
  return Object.fromEntries(states.map((state) => [state.wordId, state]));
}

export async function saveWordSelectionState(state: WordSelectionState): Promise<void> {
  await database.wordSelectionStates.put(state);
}

export async function saveWordSelectionStates(states: WordSelectionState[]): Promise<void> {
  if (states.length === 0) {
    return;
  }

  await database.wordSelectionStates.bulkPut(states);
}

export async function saveAnswerEvent(event: AnswerEvent): Promise<void> {
  await database.answerEvents.put(event);
}

export async function listAnswerEvents(limit?: number): Promise<AnswerEvent[]> {
  if (!limit) {
    return database.answerEvents.orderBy('answeredAt').toArray();
  }

  const events = await database.answerEvents.orderBy('answeredAt').reverse().limit(limit).toArray();
  return events.reverse();
}

export async function clearStudyData(): Promise<void> {
  await database.transaction('rw', database.learningRecords, database.dailyTasks, database.answerEvents, async () => {
    await database.learningRecords.clear();
    await database.dailyTasks.clear();
    await database.answerEvents.clear();
  });
}
