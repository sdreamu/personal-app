import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { addDays, addMealItem, addPlan, addWater, clearApp, gotoHash, logicalToday, patchSettingsRaw } from './helpers';

/** 固定的「上次备份时间」：文本导出后必须原值不变。 */
const FIXED_LAST_BACKUP = 1_700_000_000_000;

function compact(date: string): string {
  return date.replace(/-/g, '');
}

/** 直接读 IndexedDB 里的 settings.last_backup_at（不经 UI，避免读到缓存）。 */
async function readLastBackupAt(page: Page): Promise<number | null> {
  return page.evaluate(async () => {
    return new Promise<number | null>((resolve, reject) => {
      const open = indexedDB.open('evan_personal_app_db');
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('settings', 'readonly');
        const get = tx.objectStore('settings').get('app');
        get.onsuccess = () => {
          const row = get.result as { last_backup_at?: number | null } | undefined;
          resolve(row?.last_backup_at ?? null);
        };
        get.onerror = () => reject(get.error);
      };
      open.onerror = () => reject(open.error);
    });
  });
}

test.beforeEach(async ({ page }) => {
  await clearApp(page);
});

/** AC-66：设置页「导出文本」→ 一次下载，文件名是区间，内容含区间内记录，且不刷新备份时间。 */
test('AC-66 文本导出区间文件名与内容且不刷新备份提醒', async ({ page }) => {
  await addPlan(page, { title: 'AC66计划' });
  await addMealItem(page, 'breakfast', 'AC66早餐');
  await addWater(page, 1);

  // 先把「上次备份时间」写成一个固定值，导出后必须完全不变
  await patchSettingsRaw(page, { last_backup_at: FIXED_LAST_BACKUP });
  const lastBackupBefore = await readLastBackupAt(page);
  expect(lastBackupBefore).toBe(FIXED_LAST_BACKUP);

  await gotoHash(page, 'settings');
  await page.click('[data-test="text-range-last7"]');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.click('[data-test="export-text"]'),
  ]);

  // 文件名：evan-text-YYYYMMDD-YYYYMMDD.md（最近 7 天 = 今天往前 6 天 ~ 今天）
  const today = logicalToday();
  const start = addDays(today, -6);
  expect(download.suggestedFilename()).toBe('evan-text-' + compact(start) + '-' + compact(today) + '.md');

  const filePath = 'test-results/ac66-text.md';
  await download.saveAs(filePath);
  const text = readFileSync(filePath, 'utf8');
  expect(text).toContain('# 个人数据导出（' + start + ' ~ ' + today + '）');
  expect(text).toContain('### 计划');
  expect(text).toContain('- [ ] AC66计划（');
  expect(text).toContain('### 饮食');
  expect(text).toContain('- 早：AC66早餐');
  // 汇总区与当天段落的喝水各一行
  expect(text).toContain('- 喝水：1 次，合计 250 ml');
  expect(text).toContain('- 共 1 次，合计 250 ml');

  // 文本导出绝不刷新备份时间
  expect(await readLastBackupAt(page)).toBe(lastBackupBefore);
  expect(await readLastBackupAt(page)).toBe(FIXED_LAST_BACKUP);
});
