import { describe, expect, it } from 'vitest';
import { defaultParentSetting } from '../models/parent-setting';
import { buildStudyDataExport } from './study-data-export';

describe('buildStudyDataExport', () => {
  it('creates a portable export payload with every local data table', () => {
    const exported = buildStudyDataExport({
      exportedAt: '2026-06-26T10:00:00.000Z',
      appVersion: '0.1.0',
      learningRecords: [{ wordId: 'ket_a_n', masteryLevel: 1, reviewStage: 1, correctStreak: 1, wrongCount: 0, lastStudiedAt: null, nextDueAt: null }],
      dailyTasks: [{ dateKey: '2026-06-26', newWordIds: [], reviewWordIds: [], completedAt: null, correctCount: 0, wrongCount: 0, totalAnswered: 0, answeredWordIds: [] }],
      parentSetting: defaultParentSetting,
      wordSelectionStates: [{ wordId: 'ket_a_n', isEnabled: true, isPaused: false, updatedAt: '2026-06-26T10:00:00.000Z' }],
      answerEvents: [],
    });

    expect(exported.schemaVersion).toBe(1);
    expect(exported.tables.learningRecords).toHaveLength(1);
    expect(exported.tables.dailyTasks).toHaveLength(1);
    expect(exported.tables.parentSetting).toEqual(defaultParentSetting);
    expect(exported.tables.wordSelectionStates).toHaveLength(1);
    expect(exported.tables.answerEvents).toEqual([]);
  });
});
