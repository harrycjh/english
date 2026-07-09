import { describe, expect, it } from 'vitest';
import { defaultParentSetting } from '../models/parent-setting';
import { parseStudyDataImport } from './study-data-import';

function createValidBackup() {
  return {
    schemaVersion: 1,
    appVersion: '0.1.0',
    exportedAt: '2026-07-09T10:00:00.000Z',
    tables: {
      learningRecords: [
        {
          wordId: 'ket_dad_n',
          masteryLevel: 2,
          reviewStage: 2,
          correctStreak: 1,
          wrongCount: 0,
          lastStudiedAt: '2026-07-08T10:00:00.000Z',
          nextDueAt: '2026-07-10T10:00:00.000Z',
        },
      ],
      dailyTasks: [],
      parentSetting: defaultParentSetting,
      wordSelectionStates: [],
      answerEvents: [],
    },
  };
}

describe('parseStudyDataImport', () => {
  it('accepts a version 1 backup and returns its study tables', () => {
    const parsed = parseStudyDataImport(JSON.stringify(createValidBackup()));

    expect(parsed.tables.learningRecords[0].wordId).toBe('ket_dad_n');
    expect(parsed.tables.parentSetting).toEqual(defaultParentSetting);
  });

  it('rejects malformed JSON with a useful message', () => {
    expect(() => parseStudyDataImport('{broken')).toThrow('不是有效的 JSON');
  });

  it('rejects files that are not VocaRabbit backups', () => {
    expect(() => parseStudyDataImport(JSON.stringify({ hello: 'world' }))).toThrow(
      '不是 VocaRabbit 学习数据备份',
    );
  });

  it('rejects unsupported schema versions', () => {
    const backup = createValidBackup();
    backup.schemaVersion = 2;

    expect(() => parseStudyDataImport(JSON.stringify(backup))).toThrow('不支持的备份版本');
  });

  it('rejects invalid table records before they reach IndexedDB', () => {
    const backup = createValidBackup();
    backup.tables.learningRecords[0].wordId = '';

    expect(() => parseStudyDataImport(JSON.stringify(backup))).toThrow('学习记录格式不正确');
  });
});
