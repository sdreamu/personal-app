import { test, expect, type Page } from '@playwright/test';
import { clearApp, gotoHash, addPlan, seedBook, addMealItem, addWater, expectToast, logicalToday } from './helpers';
import { buildBackup, defaultSettingsRow, builtinPlanCategories, builtinMealTypes, writeFixture } from './fixtures';

test.beforeEach(async ({ page }) => {
  await clearApp(page);
});

/** AC-01：添加一条计划、一本书、一条饮食记录后刷新页面——三条数据都还在，停留在刷新前的页面。 */
test('AC-01 数据刷新后保留并停留当前页', async ({ page }) => {
  await addPlan(page, { title: 'AC01计划' });
  await seedBook(page, { title: 'AC01书', totalPages: 300, status: 'reading' });
  await addMealItem(page, 'breakfast', 'AC01早餐');
  await expect(page).toHaveURL(/#\/life\/diet/);
  await page.reload();
  await expect(page).toHaveURL(/#\/life\/diet/);
  await expect(page.locator('[data-test="meal-text"]', { hasText: 'AC01早餐' })).toBeVisible();

  await gotoHash(page, 'plan');
  await expect(page.locator('[data-test="todo-title"]', { hasText: 'AC01计划' })).toBeVisible();
  await gotoHash(page, 'study/books');
  await expect(page.locator('[data-test="book-title"]', { hasText: 'AC01书' })).toBeVisible();
});

/** AC-02：关闭整个浏览器后重新打开 App 地址——所有数据都还在（用新 page 同一 context 模拟重开）。 */
test('AC-02 关闭浏览器重开后数据仍在', async ({ page, context }) => {
  await addPlan(page, { title: 'AC02计划' });
  await seedBook(page, { title: 'AC02书', totalPages: 200, status: 'reading' });
  await addWater(page, 1);

  await page.close();
  const page2 = await context.newPage();
  await page2.goto('/#/home');
  await expect(page2.locator('[data-test="home-view"]')).toBeVisible();
  await gotoHash(page2, 'plan');
  await expect(page2.locator('[data-test="todo-title"]', { hasText: 'AC02计划' })).toBeVisible();
  await gotoHash(page2, 'study/books');
  await expect(page2.locator('[data-test="book-title"]', { hasText: 'AC02书' })).toBeVisible();
  await gotoHash(page2, 'life/diet');
  await expect(page2.locator('[data-test="water-total"]')).toHaveText('250 ml');
});

/** AC-03：重启电脑后启动 App——所有数据都还在（以新 page 同一 context 模拟）。 */
test('AC-03 重启后数据仍在', async ({ page, context }) => {
  await addPlan(page, { title: 'AC03计划' });
  await seedBook(page, { title: 'AC03书', totalPages: 100, status: 'reading' });
  await addMealItem(page, 'lunch', 'AC03午餐');

  await page.close();
  const page2 = await context.newPage();
  await page2.goto('/#/home');
  await expect(page2.locator('[data-test="home-view"]')).toBeVisible();
  await gotoHash(page2, 'plan');
  await expect(page2.locator('[data-test="todo-title"]', { hasText: 'AC03计划' })).toBeVisible();
  await gotoHash(page2, 'study/books');
  await expect(page2.locator('[data-test="book-title"]', { hasText: 'AC03书' })).toBeVisible();
  await gotoHash(page2, 'life/diet');
  await expect(page2.locator('[data-test="meal-text"]', { hasText: 'AC03午餐' })).toBeVisible();
});

/** AC-05：导出备份 → 清空所有数据 → 导入刚才的文件——数据与清空前完全一致。 */
test('AC-05 导出-清空-导入数据完全恢复', async ({ page }) => {
  await addPlan(page, { title: 'AC05计划' });
  await seedBook(page, { title: 'AC05书', totalPages: 120, status: 'reading' });
  await addWater(page, 1);

  await gotoHash(page, 'settings');
  const downloadPromise = page.waitForEvent('download');
  await page.click('[data-test="export-backup"]');
  const download = await downloadPromise;
  const backupPath = 'test-results/ac05-backup.json';
  await download.saveAs(backupPath);
  await expect(page.locator('[data-test="toast-stack"]')).toContainText('备份已导出');

  await page.click('[data-test="clear-data"]');
  const clearModal = page.locator('[data-test="clear-input"]');
  await expect(clearModal).toBeVisible();
  await clearModal.fill('清空');
  await page.click('[data-test="confirm-clear"]');
  await expect(page.locator('[data-test="clear-input"]')).toHaveCount(0);

  await gotoHash(page, 'plan');
  await expect(page.locator('[data-test="plan-empty"]')).toBeVisible();
  await gotoHash(page, 'study/books');
  await expect(page.locator('[data-test="book-card"]')).toHaveCount(0);
  await gotoHash(page, 'life/diet');
  await expect(page.locator('[data-test="water-total"]')).toHaveText('0 ml');

  await gotoHash(page, 'settings');
  await page.setInputFiles('[data-test="import-file"]', backupPath);
  await expect(page.locator('[data-test="confirm-import"]')).toBeVisible();
  const autoBackupPromise = page.waitForEvent('download');
  await page.click('[data-test="confirm-import"]');
  await autoBackupPromise;
  await expectToast(page, '导入完成');

  await gotoHash(page, 'plan');
  await expect(page.locator('[data-test="todo-title"]', { hasText: 'AC05计划' })).toBeVisible();
  await gotoHash(page, 'study/books');
  await expect(page.locator('[data-test="book-title"]', { hasText: 'AC05书' })).toBeVisible();
  await gotoHash(page, 'life/diet');
  await expect(page.locator('[data-test="water-total"]')).toHaveText('250 ml');
});

/** AC-06：导入坏文件——提示格式或标识不对，现有数据没有变化。 */
test('AC-06 坏文件被拒绝且现有数据不变', async ({ page }) => {
  await addPlan(page, { title: 'AC06保留计划' });

  await gotoHash(page, 'settings');
  await page.setInputFiles('[data-test="import-file"]', {
    name: 'bad.txt.json',
    mimeType: 'application/json',
    buffer: Buffer.from('这不是 JSON'),
  });
  await expectToast(page, '导入失败：JSON 格式错误');

  await page.setInputFiles('[data-test="import-file"]', {
    name: 'wrong-app.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ app: 'other-app', schema_version: 1, exported_at: 1, tables: {} })),
  });
  await expectToast(page, '应用标识不匹配');

  await gotoHash(page, 'plan');
  await expect(page.locator('[data-test="todo-title"]', { hasText: 'AC06保留计划' })).toBeVisible();
});

/** AC-07：执行导入——覆盖前提示确认，并先自动导出了一份当前数据。 */
test('AC-07 导入覆盖前确认并自动备份', async ({ page }) => {
  await addPlan(page, { title: 'AC07旧计划' });

  const backup = buildBackup({
    settings: [defaultSettingsRow()],
    plan_categories: builtinPlanCategories(),
    meal_types: builtinMealTypes(),
    plans: [
      {
        id: 'plan-b',
        created_at: Date.now(),
        updated_at: Date.now(),
        deleted_at: null,
        title: 'AC07新计划',
        date: logicalToday(),
        start_min: null,
        end_min: null,
        category_key: 'other',
        category_name: '其他',
        target_type: null,
        target_id: null,
        target_title: null,
        done: false,
        done_at: null,
        rollover_from_date: null,
        is_rolled_over: false,
      },
    ],
  });
  const importPath = writeFixture('ac07-import.json', backup);

  await gotoHash(page, 'settings');
  await page.setInputFiles('[data-test="import-file"]', importPath);
  const modal = page.locator('[data-test="confirm-import"]');
  await expect(modal).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('覆盖当前全部数据');
  const autoBackup = page.waitForEvent('download');
  await modal.click();
  await autoBackup;
  await expectToast(page, '导入完成');

  await gotoHash(page, 'plan');
  await expect(page.locator('[data-test="todo-title"]', { hasText: 'AC07新计划' })).toBeVisible();
  await expect(page.locator('[data-test="todo-title"]', { hasText: 'AC07旧计划' })).toHaveCount(0);
});

/** AC-08：执行清空——必须输入“清空”才能执行。 */
test('AC-08 清空必须输入清空二字', async ({ page }) => {
  await addPlan(page, { title: 'AC08计划' });
  await gotoHash(page, 'settings');
  await page.click('[data-test="clear-data"]');
  const confirm = page.locator('[data-test="confirm-clear"]');
  await expect(confirm).toBeDisabled();
  await page.fill('[data-test="clear-input"]', '删除');
  await expect(confirm).toBeDisabled();
  await page.fill('[data-test="clear-input"]', '清空');
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.locator('[data-test="clear-input"]')).toHaveCount(0);
  await gotoHash(page, 'plan');
  await expect(page.locator('[data-test="plan-empty"]')).toBeVisible();
});

/** AC-09：导出后设置页显示备份时间；把时间改为 8 天前后首页出现备份提醒。 */
test('AC-09 备份时间显示与8天备份提醒', async ({ page }) => {
  await addPlan(page, { title: 'AC09计划' });
  await gotoHash(page, 'settings');
  const downloadPromise = page.waitForEvent('download');
  await page.click('[data-test="export-backup"]');
  await downloadPromise;
  await expect(page.locator('[data-test="toast-stack"]')).toContainText('备份已导出');
  await expect(page.locator('text=上次备份时间')).toBeVisible();
  await expect(page.locator('text=从未备份')).toHaveCount(0);

  // 用原始 IndexedDB 把 last_backup_at 改成 8 天前（仅测试准备数据）。
  await page.evaluate(async () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('evan_personal_app_db');
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('settings', 'readwrite');
        const store = tx.objectStore('settings');
        const get = store.get('app');
        get.onsuccess = () => {
          const row = get.result;
          if (row) store.put({ ...row, last_backup_at: eightDaysAgo });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        get.onerror = () => reject(get.error);
      };
      open.onerror = () => reject(open.error);
    });
  });

  await gotoHash(page, 'home');
  await page.reload();
  await expect(page.locator('[data-test="home-view"]')).toBeVisible();
  await expect(page.locator('[data-test="hint-text"]', { hasText: '超过 7 天没有备份' })).toBeVisible();
});
