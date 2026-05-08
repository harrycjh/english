import Dexie, { type Table } from 'dexie';
import type { DailyTaskSummary } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';

class VocabRabbitDatabase extends Dexie {
  learningRecords!: Table<LearningRecord, string>;
  dailyTasks!: Table<DailyTaskSummary, string>;

  constructor() {
    super('vocab-rabbit');
    this.version(1).stores({
      learningRecords: 'wordId,nextDueAt,masteryLevel',
      dailyTasks: 'dateKey,completedAt',
    });
  }
}

const database = new VocabRabbitDatabase();

export async function listLearningRecords(): Promise<Record<string, LearningRecord>> {
  const records = await database.learningRecords.toArray();
  return Object.fromEntries(records.map((record) => [record.wordId, record]));
}

export async function saveLearningRecord(record: LearningRecord): Promise<void> {
  await database.learningRecords.put(record);
}

export async function getDailyTask(dateKey: string): Promise<DailyTaskSummary | undefined> {
  return database.dailyTasks.get(dateKey);
}

export async function saveDailyTask(task: DailyTaskSummary): Promise<void> {
  await database.dailyTasks.put(task);
}

export async function listRecentTasks(limit: number): Promise<DailyTaskSummary[]> {
  const tasks = await database.dailyTasks.orderBy('dateKey').reverse().limit(limit).toArray();
  return tasks.reverse();
}