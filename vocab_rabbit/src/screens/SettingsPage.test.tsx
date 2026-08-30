import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { defaultParentSetting } from '../models/parent-setting';
import { pickRandomPronunciationWord, SettingsPage } from './SettingsPage';

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
        onDownloadPrivateLifePhotos={async () => ({
          existing: 0,
          downloaded: 0,
          failed: 0,
          total: 0,
        })}
        localLifePhotoCount={0}
        words={[{
          id: 'ket_family_n',
          english: 'family',
          partOfSpeech: 'n',
          chinese: '家庭',
          category: '家人和朋友',
          difficulty: 1,
          imagePath: '/content/images/words/ket_family_n.webp',
          imageApproved: true,
          oxfordRefs: [],
          hasLifePhoto: true,
        }]}
      />,
    );

    expect(markup).toContain('清空本地学习数据');
    expect(markup).toContain('下载全部图片');
    expect(markup).toContain('下载照片');
    expect(markup).toContain('可下载 1 张生活照片');
    expect(markup).not.toContain('下载私密生活照片');
    expect(markup).not.toContain('导入生活照片包');
    expect(markup).not.toContain('选择照片包');
    expect(markup).toContain('下载图片');
    expect(markup).toContain('class="primary-button settings-unified-confirm"');
    expect(markup).toContain('>确定修改</button>');
    expect(markup).toContain('学习设置');
    expect(markup).toContain('学习负荷');
    expect(markup).toContain('学习体验');
    expect(markup).toContain('语音评测');
    expect(markup).toContain('随机抽取一个单词');
    expect(markup).toContain('音色选择');
    expect(markup).toContain('aria-label="英文发音音色"');
    expect(markup).toContain('aria-label="中文发音音色"');
    expect(markup).toContain('aria-label="每日新词增加 1"');
    expect(markup).toContain('aria-label="每日复习上限增加 5"');
    expect(markup).toContain('aria-label="每日复习上限减少 5"');
    expect(markup).not.toContain('设备与使用方式');
    expect(markup).not.toContain('重置进度');
    expect(markup).not.toContain('云端重置');
  });

  it('selects a single-word pronunciation target and avoids the previous word', () => {
    const words = [
      { id: 'one', english: 'rabbit' },
      { id: 'two', english: 'look after' },
      { id: 'three', english: 'mother-in-law' },
      { id: 'four', english: 'family' },
    ] as Parameters<typeof pickRandomPronunciationWord>[0];

    expect(pickRandomPronunciationWord(words, () => 0, 'one')?.id).toBe('three');
    expect(pickRandomPronunciationWord(words, () => 0.99, 'one')?.id).toBe('four');
  });
});
