import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultParentSetting } from '../models/parent-setting';
import { SettingsPage } from './SettingsPage';

describe('SettingsPage local data controls', () => {
  it('keeps only the verified local clear action and exposes no progress reset', () => {
    const markup = renderToStaticMarkup(
      <SettingsPage
        settings={defaultParentSetting}
        task={{
          dateKey: '2026-07-14',
          newWordIds: [],
          reviewWordIds: [],
          completedAt: null,
          correctCount: 0,
          wrongCount: 0,
          totalAnswered: 0,
          answeredWordIds: [],
        }}
        onBackHome={() => undefined}
        onOpenSelection={() => undefined}
        onOpenStats={() => undefined}
        onUpdateSettings={async () => 'synced'}
        onSelectProfile={async () => undefined}
        onExportStudyData={async () => undefined}
        onImportStudyData={async () => ({
          learningRecords: 0,
          dailyTasks: 0,
          wordSelectionStates: 0,
          answerEvents: 0,
          exportedAt: '2026-07-14T00:00:00.000Z',
        })}
        onClearLocalData={async () => undefined}
        onImportLifePhotoPackage={async () => ({
          imported: 0,
          skipped: 0,
          totalInManifest: 0,
          importedAt: '2026-07-14T00:00:00.000Z',
        })}
        localLifePhotoCount={0}
        localLifePhotoImportedAt={null}
        words={[]}
      />,
    );

    expect(markup).toContain('清空本地学习数据');
    expect(markup).toContain('下载全部图片');
    expect(markup).toContain('下载图片');
    expect(markup).toContain('class="primary-button settings-volume-confirm"');
    expect(markup).toContain('>确定</button>');
    expect(markup).not.toContain('重置进度');
    expect(markup).not.toContain('云端重置');
  });
});
