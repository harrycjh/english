import type { AnswerEvent } from '../models/answer-event';
import type { DailyTaskSummary } from '../models/daily-task';
import type { LearningRecord } from '../models/learning-record';
import type { ParentSetting } from '../models/parent-setting';
import type { WordSelectionState } from '../models/word-selection-state';

export interface StudyDataExportInput {
  exportedAt: string;
  appVersion: string;
  learningRecords: LearningRecord[];
  dailyTasks: DailyTaskSummary[];
  parentSetting: ParentSetting;
  wordSelectionStates: WordSelectionState[];
  answerEvents: AnswerEvent[];
}

export interface StudyDataExport {
  schemaVersion: 1;
  appVersion: string;
  exportedAt: string;
  tables: {
    learningRecords: LearningRecord[];
    dailyTasks: DailyTaskSummary[];
    parentSetting: ParentSetting;
    wordSelectionStates: WordSelectionState[];
    answerEvents: AnswerEvent[];
  };
}

export function buildStudyDataExport(input: StudyDataExportInput): StudyDataExport {
  return {
    schemaVersion: 1,
    appVersion: input.appVersion,
    exportedAt: input.exportedAt,
    tables: {
      learningRecords: input.learningRecords,
      dailyTasks: input.dailyTasks,
      parentSetting: input.parentSetting,
      wordSelectionStates: input.wordSelectionStates,
      answerEvents: input.answerEvents,
    },
  };
}

export function downloadJsonFile(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
