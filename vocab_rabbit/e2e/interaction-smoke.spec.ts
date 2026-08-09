import { expect, test, type Page } from '@playwright/test';

const dbName = 'vocab-rabbit';

async function resetApp(page: Page) {
  await page.goto('/');
  await page.evaluate(async (name) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error(`Database ${name} deletion was blocked`));
    });
  }, dbName);
  await page.reload();
  const offlineEntry = page.getByRole('button', { name: '暂时离线进入' });
  await expect(offlineEntry).toBeVisible();
  await offlineEntry.click();
  await expect(page.getByRole('heading', { name: '今日学习计划' })).toBeVisible();
}

async function gotoHome(page: Page) {
  await page.getByRole('button', { name: '复习' }).last().click();
  await expect(page.getByRole('heading', { name: '今日学习计划' })).toBeVisible();
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
    await page.getByRole('button', { name: '可爱的小珺珺' }).click();
    await page.getByRole('menuitemradio', { name: '臭臭的小狗子' }).click();
    await page.getByRole('button', { name: /开始|继续/ }).click();
    await expect(page.getByRole('button', { name: '返回首页' })).toBeVisible();
    await page.getByRole('button', { name: '全部答对' }).click();

    await expect(page.getByRole('heading', { name: '今天还没签到' })).toBeVisible();
    await page.getByRole('button', { name: '返回首页' }).click();
    await expect(page.getByRole('heading', { name: '今日学习计划' })).toBeVisible();

    await page.getByRole('button', { name: '统计' }).last().click();
    await expect(page.getByRole('heading', { name: '学习统计' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '遗忘曲线' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '学习情况' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '记忆持久度' })).toBeVisible();
    await page.getByRole('button', { name: '选词' }).last().click();
    await expect(page.getByRole('heading', { name: '词库管理' })).toBeVisible();
  });

  test('dog debug mode previews a selected level without changing study progress', async ({ page }) => {
    await page.getByRole('button', { name: '可爱的小珺珺' }).click();
    await page.getByRole('menuitemradio', { name: '臭臭的小狗子' }).click();
    await expect(page.getByRole('button', { name: '调试模式' })).toBeVisible();

    await page.getByRole('button', { name: '调试模式' }).click();
    const debugDialog = page.getByRole('dialog', { name: '选择题目等级' });
    const closeDebugButton = page.getByRole('button', { name: '关闭调试模式' });
    await expect(debugDialog).toBeVisible();
    await expect(page.locator('.review-debug-level-grid button')).toHaveCount(11);
    const [dialogBox, closeButtonBox] = await Promise.all([
      debugDialog.boundingBox(),
      closeDebugButton.boundingBox(),
    ]);
    expect(dialogBox).not.toBeNull();
    expect(closeButtonBox).not.toBeNull();
    expect(closeButtonBox!.x).toBeGreaterThan(dialogBox!.x + dialogBox!.width * 0.8);
    expect(closeButtonBox!.y).toBeLessThan(dialogBox!.y + dialogBox!.height * 0.2);
    await page.getByRole('button', { name: 'Lv5 第 6 阶段' }).click();

    await expect(page.getByText('例句填词')).toBeVisible();
    await expect(page.locator('.sentence-cloze-card strong')).toContainText('_____');
    await expect(page.getByLabel('例句')).toHaveCount(0);
    await expect(page.locator('.progress-ring__label')).toContainText('1/ 10');
    await page.getByRole('button', { name: '返回首页' }).click();
    await expect(debugDialog).toBeVisible();
    await page.getByRole('button', { name: 'Lv5 第 6 阶段' }).click();
    await expect(page.getByText('例句填词')).toBeVisible();
    await page.getByRole('button', { name: '全部答对' }).click();
    await expect(debugDialog).toBeVisible();
    await closeDebugButton.click();
    await expect(page.getByRole('heading', { name: '今日学习计划' })).toBeVisible();

    const learningRecordCount = await page.evaluate(async (name) => {
      return await new Promise<number>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('learningRecords', 'readonly');
          const countRequest = transaction.objectStore('learningRecords').count();
          countRequest.onerror = () => reject(countRequest.error);
          countRequest.onsuccess = () => resolve(countRequest.result);
        };
      });
    }, dbName);
    expect(learningRecordCount).toBe(0);
  });

  test('debug levels keep the requested iPad layout and labels', async ({ page }) => {
    await page.getByRole('button', { name: '可爱的小珺珺' }).click();
    await page.getByRole('menuitemradio', { name: '臭臭的小狗子' }).click();
    await page.getByRole('button', { name: '调试模式' }).click();

    const openLevel = async (level: number) => {
      await page.getByRole('button', { name: `Lv${level} 第 ${level + 1} 阶段` }).click();
      await expect(page.locator('.question-panel')).toBeVisible();
    };
    const returnToPicker = async () => {
      await page.getByRole('button', { name: '返回首页' }).click();
      await expect(page.getByRole('dialog', { name: '选择题目等级' })).toBeVisible();
    };

    await openLevel(0);
    await expect(page.getByText('初次见面')).toBeVisible();
    const levelZeroOffset = await page.locator('.recognition-card').evaluate((card) => {
      const cardBox = card.getBoundingClientRect();
      const wordBox = card.querySelector(':scope > strong')!.getBoundingClientRect();
      const option = card.querySelector('.choice-button')!;
      return {
        wordTop: wordBox.top - cardBox.top,
        optionBorderWidth: Number.parseFloat(getComputedStyle(option).borderTopWidth),
      };
    });
    expect(levelZeroOffset.wordTop).toBeGreaterThanOrEqual(190);
    expect(levelZeroOffset.optionBorderWidth).toBe(2);
    await returnToPicker();

    await openLevel(1);
    const levelOneOffset = await page.locator('.question-panel__answer-column').evaluate((column) => {
      const columnBox = column.getBoundingClientRect();
      const cueBox = column.querySelector('.question-panel__word-cue')!.getBoundingClientRect();
      const option = column.querySelector('.choice-button')!;
      return {
        cueTop: cueBox.top - columnBox.top,
        optionBorderWidth: Number.parseFloat(getComputedStyle(option).borderTopWidth),
      };
    });
    expect(levelOneOffset.cueTop).toBeGreaterThanOrEqual(190);
    expect(levelOneOffset.optionBorderWidth).toBe(2);
    await returnToPicker();

    await openLevel(2);
    const levelTwoExampleTop = await page.locator('.question-panel__answer-column').evaluate((column) => {
      const columnBox = column.getBoundingClientRect();
      const exampleBox = column.querySelector('.question-example-result')!.getBoundingClientRect();
      return exampleBox.top - columnBox.top;
    });
    expect(levelTwoExampleTop).toBeGreaterThanOrEqual(190);
    await returnToPicker();

    await openLevel(4);
    await expect(page.getByText('看看英文，选出正确中文')).toHaveCount(0);
    await returnToPicker();

    await openLevel(5);
    const levelFiveLayout = await page.locator('.question-panel--sentence').evaluate((panel) => {
      const panelBox = panel.getBoundingClientRect();
      const cardBox = panel.querySelector('.sentence-cloze-card')!.getBoundingClientRect();
      const columnBox = panel.querySelector('.sentence-answer-column')!.getBoundingClientRect();
      const optionsBox = panel.querySelector('.sentence-option-grid')!.getBoundingClientRect();
      return {
        cardHeightRatio: cardBox.height / panelBox.height,
        optionBottomGap: columnBox.bottom - optionsBox.bottom,
      };
    });
    expect(levelFiveLayout.cardHeightRatio).toBeGreaterThan(0.95);
    expect(levelFiveLayout.optionBottomGap).toBeLessThanOrEqual(2);
    await returnToPicker();

    await openLevel(6);
    const levelSixLayout = await page.locator('.letter-choice-answer-column').evaluate((column) => {
      const example = column.querySelector('.question-example-result')!;
      return {
        display: getComputedStyle(column).display,
        exampleGridRow: getComputedStyle(example).gridRowStart,
      };
    });
    expect(levelSixLayout).toEqual({ display: 'grid', exampleGridRow: '2' });
    await returnToPicker();

    for (const level of [7, 8]) {
      await openLevel(level);
      await expect(page.getByText(/还缺 \d+ 个字母/)).toHaveCount(0);
      await expect(page.getByText(/已填写 \d+\/\d+/)).toHaveCount(0);
      await returnToPicker();
    }

    await openLevel(9);
    await expect(page.getByLabel('待拼写单词')).toBeVisible();
    await expect(page.getByRole('textbox', { name: '使用实体键盘输入字母' })).toBeVisible();
    await expect(page.locator('.learning-level-control')).toHaveAttribute('data-level', '9');
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
    await expect(page.getByRole('button', { name: '恢复', exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: '启用筛选结果' }).click();
    await expect(page.getByRole('button', { name: '暂停', exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: '移出筛选结果' }).click();
    await expect(page.getByRole('button', { name: '启用', exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: '重置筛选' }).click();
    await expect(page.getByText(/共 \d+ 个单词/)).toBeVisible();

    await page.getByRole('button', { name: '保存返回' }).click();
    await expect(page.getByRole('heading', { name: '今日学习计划' })).toBeVisible();
  });

  test('settings controls, export, and restore work', async ({ page }) => {
    await page.getByRole('button', { name: '设置' }).last().click();
    await expect(page.getByRole('heading', { name: /把学习节奏/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /音色选择/ })).toBeVisible();
    await expect(page.getByRole('combobox', { name: '英文发音音色' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: '中文发音音色' })).toBeVisible();
    await expect(page.getByRole('button', { name: '试听' })).toHaveCount(2);
    const englishVoiceSelect = page.getByRole('combobox', { name: '英文发音音色' });
    const englishVoiceValues = await englishVoiceSelect.locator('option').evaluateAll(
      (options) => options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
    );
    if (englishVoiceValues.length > 0) {
      await englishVoiceSelect.selectOption(englishVoiceValues[0]);
    }
    await expect(page.getByRole('button', { name: '试听' }).first()).toBeEnabled();
    await page.getByRole('button', { name: '试听' }).first().click();

    await page.getByRole('button', { name: '每日新词增加 1' }).click();
    const imageToggle = page.locator('.settings-toggle-row').filter({ hasText: '图片题' }).getByRole('button');
    await imageToggle.click();
    await expect(imageToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: '确定修改' })).toBeEnabled();

    const settingsBeforeConfirm = await page.evaluate(async (name) => {
      return await new Promise<{ dailyNewWordCount: number; showImages: boolean } | undefined>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const transaction = request.result.transaction('parentSettings', 'readonly');
          const settingRequest = transaction.objectStore('parentSettings').get('default');
          settingRequest.onerror = () => reject(settingRequest.error);
          settingRequest.onsuccess = () => resolve(settingRequest.result);
        };
      });
    }, dbName);
    expect(settingsBeforeConfirm).toBeUndefined();

    await page.getByRole('button', { name: '确定修改' }).click();
    await expect(page.getByText(/已保存/)).toBeVisible();
    const settingsAfterConfirm = await page.evaluate(async (name) => {
      return await new Promise<{ dailyNewWordCount: number; showImages: boolean }>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const transaction = request.result.transaction('parentSettings', 'readonly');
          const settingRequest = transaction.objectStore('parentSettings').get('default');
          settingRequest.onerror = () => reject(settingRequest.error);
          settingRequest.onsuccess = () => resolve(settingRequest.result);
        };
      });
    }, dbName);
    expect(settingsAfterConfirm.dailyNewWordCount).toBe(9);
    expect(settingsAfterConfirm.showImages).toBe(false);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出数据' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('vocab-rabbit-study-data');

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

    await gotoHome(page);
  });
});
