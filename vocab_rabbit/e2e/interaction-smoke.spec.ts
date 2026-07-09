import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { zipSync, strToU8 } from 'fflate';

const dbName = 'vocab-rabbit';

async function resetApp(page: Page) {
  await page.goto('/');
  await page.evaluate((name) => {
    indexedDB.deleteDatabase(name);
  }, dbName);
  await page.reload();
  await expect(page.getByRole('heading', { name: '今日学习计划' })).toBeVisible();
}

async function gotoHome(page: Page) {
  await page.getByRole('button', { name: '复习' }).last().click();
  await expect(page.getByRole('heading', { name: '今日学习计划' })).toBeVisible();
}

async function createTinyLifePhotoPackage() {
  const sampleImage = await readFile(path.join(process.cwd(), 'public/content/images/words/ket_girl_n.webp'));
  const manifest = {
    schemaVersion: 1,
    generatedAt: '2026-07-08T00:00:00.000Z',
    stats: {
      totalWords: 1693,
      withLifePhoto: 1,
    },
    entries: [
      {
        wordId: 'ket_girl_n',
        relatedMedia: {
          lifePhoto: {
            imagePath: '/life-photos/ket_girl_n.webp',
            caption: 'interaction smoke test life photo',
            photoId: 'test-photo-1',
            match: 'primary',
            confidence: 0.99,
          },
        },
      },
    ],
  };

  return Buffer.from(zipSync({
    'word_related_media.json': strToU8(JSON.stringify(manifest)),
    'life-photos/ket_girl_n.webp': new Uint8Array(sampleImage),
  }));
}

function createStudyDataBackup() {
  return Buffer.from(JSON.stringify({
    schemaVersion: 1,
    appVersion: '0.1.0',
    exportedAt: '2026-07-09T10:00:00.000Z',
    tables: {
      learningRecords: [
        {
          wordId: 'ket_girl_n',
          masteryLevel: 2,
          reviewStage: 2,
          correctStreak: 1,
          wrongCount: 0,
          lastStudiedAt: '2026-07-08T10:00:00.000Z',
          nextDueAt: '2026-07-10T10:00:00.000Z',
        },
      ],
      dailyTasks: [],
      parentSetting: {
        enableAudio: true,
        dailyNewWordCount: 13,
        dailyReviewLimit: 8,
        showImages: true,
        showExamples: true,
        showHints: true,
        preferLandscape: true,
      },
      wordSelectionStates: [],
      answerEvents: [],
    },
  }));
}

test.describe('main app interactions', () => {
  test.beforeEach(async ({ page }) => {
    await resetApp(page);
  });

  test('home, learning, completion, and stats buttons are actionable', async ({ page }) => {
    await page.getByRole('button', { name: /开始|继续/ }).click();
    await expect(page.getByRole('button', { name: '返回首页' })).toBeVisible();

    for (let index = 0; index < 12 && await page.locator('.celebration-card').count() === 0; index += 1) {
      const correctChinese = (await page.locator('.learning-header__meta strong').innerText()).trim();
      const choice = page.locator('.choice-button:not([disabled])').filter({ hasText: correctChinese }).first();
      await expect(choice).toBeVisible();
      await choice.click();
      await page.waitForTimeout(760);
    }

    await expect(page.locator('.celebration-card')).toBeVisible();
    await page.getByRole('button', { name: '回到首页' }).click();
    await expect(page.getByRole('heading', { name: '今日学习计划' })).toBeVisible();

    await page.getByRole('button', { name: '统计' }).last().click();
    await expect(page.getByRole('heading', { name: /把学习节奏看成一张图/ })).toBeVisible();
    await page.getByRole('button', { name: '选词' }).last().click();
    await expect(page.getByRole('heading', { name: '词库管理' })).toBeVisible();
  });

  test('selection page filters, bulk buttons, detail drawer, and dock navigation work', async ({ page }) => {
    await page.getByRole('button', { name: '选词' }).last().click();
    await expect(page.getByRole('heading', { name: '词库管理' })).toBeVisible();

    await page.getByPlaceholder('搜索单词或中文意思').fill('girl');
    await expect(page.getByText('共 2 个单词')).toBeVisible();

    await page.getByRole('button', { name: '列表视图' }).click();
    await expect(page.locator('.selection-list')).toBeVisible();
    await page.locator('.selection-word-row__main').first().click();
    await expect(page.getByLabel('单词详情抽屉')).toBeVisible();
    await expect(page.getByText('关联图片')).toBeVisible();
    await page.getByRole('button', { name: '关闭' }).click();
    await expect(page.getByLabel('单词详情抽屉')).toBeHidden();

    await page.getByRole('button', { name: '卡片视图' }).click();
    await page.getByRole('button', { name: '暂停筛选结果' }).click();
    await expect(page.locator('.selection-word-card__body').filter({ hasText: '已暂停' }).first()).toBeVisible();
    await page.getByRole('button', { name: '启用筛选结果' }).click();
    await expect(page.locator('.selection-word-card__body').filter({ hasText: '未学' }).first()).toBeVisible();
    await page.getByRole('button', { name: '移出筛选结果' }).click();
    await expect(page.locator('.selection-word-card__body').filter({ hasText: '未启用' }).first()).toBeVisible();
    await page.getByRole('button', { name: '重置筛选' }).click();
    await expect(page.getByText(/共 \d+ 个单词/)).toBeVisible();

    await page.getByRole('button', { name: '保存返回' }).click();
    await expect(page.getByRole('heading', { name: '今日学习计划' })).toBeVisible();
  });

  test('settings controls, export, reset confirmation, and local photo import work', async ({ page }) => {
    await page.getByRole('button', { name: '设置' }).last().click();
    await expect(page.getByRole('heading', { name: /把学习节奏/ })).toBeVisible();

    await page.getByLabel('每日新词调节').getByRole('button', { name: '+' }).click();
    await expect(page.getByText(/已自动保存于/)).toBeVisible();
    const imageToggle = page.locator('.settings-toggle-row').filter({ hasText: '图片题' }).getByRole('button');
    await imageToggle.click();
    await expect(imageToggle).toHaveAttribute('aria-pressed', 'false');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出数据' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('vocab-rabbit-study-data');

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('重新生成今天的任务');
      await dialog.dismiss();
    });
    await page.getByRole('button', { name: '重置进度' }).click();

    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('永久删除所有本地学习数据');
      await dialog.dismiss();
    });
    await page.getByRole('button', { name: '清空并确认' }).click();

    const packageBuffer = await createTinyLifePhotoPackage();
    await page.locator('input[accept*="application/zip"]').setInputFiles({
      name: 'tiny-life-photos.zip',
      mimeType: 'application/zip',
      buffer: packageBuffer,
    });
    await expect(page.getByText(/已导入 1 张.*导入时间/)).toBeVisible();

    const backupBuffer = createStudyDataBackup();
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('替换当前学习进度');
      await dialog.accept();
    });
    await page.locator('input[accept*="application/json"]').setInputFiles({
      name: 'vocab-rabbit-study-data.json',
      mimeType: 'application/json',
      buffer: backupBuffer,
    });
    await expect(page.getByText('已恢复 1 条学习记录、0 条答题记录')).toBeVisible();
    await expect(page.getByLabel('每日新词调节')).toContainText('13');

    await page.getByRole('button', { name: '选词' }).last().click();
    await page.getByPlaceholder('搜索单词或中文意思').fill('girl');
    await page.locator('.selection-word-card__body').first().click();
    await expect(page.getByText('生活照片')).toBeVisible();
    await expect(page.getByText('interaction smoke test life photo')).toBeVisible();
    await page.getByRole('button', { name: '关闭' }).click();

    await gotoHome(page);
  });
});
