import type { AnswerEvent } from '../models/answer-event';
import type { DailyTaskSummary } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import { normalizeParentSetting, type ParentSetting } from '../models/parent-setting';
import type { WordSelectionState } from '../models/word-selection-state';
import type { StudyDataExport } from './study-data-export';

type UnknownRecord = Record<string, unknown>;

export interface StudyDataImportResult {
  learningRecords: number;
  dailyTasks: number;
  wordSelectionStates: number;
  answerEvents: number;
  exportedAt: string;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isLearningRecord(value: unknown): value is LearningRecord {
  return isRecord(value)
    && isNonEmptyString(value.wordId)
    && typeof value.masteryLevel === 'number'
    && typeof value.reviewStage === 'number'
    && typeof value.correctStreak === 'number'
    && typeof value.wrongCount === 'number'
    && isNullableString(value.lastStudiedAt)
    && isNullableString(value.nextDueAt);
}

function isDailyTask(value: unknown): value is DailyTaskSummary {
  return isRecord(value)
    && isNonEmptyString(value.dateKey)
    && isStringArray(value.newWordIds)
    && isStringArray(value.reviewWordIds)
    && isNullableString(value.completedAt)
    && typeof value.correctCount === 'number'
    && typeof value.wrongCount === 'number'
    && typeof value.totalAnswered === 'number'
    && isStringArray(value.answeredWordIds);
}

function isSelectionState(value: unknown): value is WordSelectionState {
  return isRecord(value)
    && isNonEmptyString(value.wordId)
    && typeof value.isEnabled === 'boolean'
    && typeof value.isPaused === 'boolean'
    && isNonEmptyString(value.updatedAt);
}

function isAnswerEvent(value: unknown): value is AnswerEvent {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && isNonEmptyString(value.wordId)
    && isNonEmptyString(value.dateKey)
    && isNonEmptyString(value.answeredAt)
    && isNonEmptyString(value.questionKind)
    && typeof value.selectedAnswer === 'string'
    && typeof value.correctAnswer === 'string'
    && typeof value.isCorrect === 'boolean'
    && typeof value.responseTimeMs === 'number';
}

function assertArray<T>(
  value: unknown,
  predicate: (item: unknown) => item is T,
  message: string,
): asserts value is T[] {
  if (!Array.isArray(value) || !value.every(predicate)) {
    throw new Error(message);
  }
}

export function parseStudyDataImport(text: string): StudyDataExport {
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch {
    throw new Error('所选文件不是有效的 JSON。');
  }

  if (!isRecord(candidate) || !('schemaVersion' in candidate) || !isRecord(candidate.tables)) {
    throw new Error('所选文件不是 VocaRabbit 学习数据备份。');
  }
  if (candidate.schemaVersion !== 1) {
    throw new Error(`不支持的备份版本：${String(candidate.schemaVersion)}。`);
  }

  const tables = candidate.tables;
  assertArray(tables.learningRecords, isLearningRecord, '备份中的学习记录格式不正确。');
  assertArray(tables.dailyTasks, isDailyTask, '备份中的每日任务格式不正确。');
  assertArray(tables.wordSelectionStates, isSelectionState, '备份中的选词状态格式不正确。');
  assertArray(tables.answerEvents, isAnswerEvent, '备份中的答题记录格式不正确。');
  if (!isRecord(tables.parentSetting)) {
    throw new Error('备份中的学习设置格式不正确。');
  }

  return {
    schemaVersion: 1,
    appVersion: typeof candidate.appVersion === 'string' ? candidate.appVersion : 'unknown',
    exportedAt: typeof candidate.exportedAt === 'string' ? candidate.exportedAt : '',
    tables: {
      learningRecords: tables.learningRecords,
      dailyTasks: tables.dailyTasks,
      parentSetting: normalizeParentSetting(tables.parentSetting as Partial<ParentSetting>),
      wordSelectionStates: tables.wordSelectionStates,
      answerEvents: tables.answerEvents,
    },
  };
}

export async function readStudyDataImport(file: File): Promise<StudyDataExport> {
  if (!file.name.toLowerCase().endsWith('.json')) {
    throw new Error('请选择由 VocaRabbit 导出的 JSON 备份文件。');
  }
  return parseStudyDataImport(await file.text());
}
