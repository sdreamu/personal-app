import { test, expect, type Page } from '@playwright/test';
import { clearApp, gotoHash, gotoDate, addDays, logicalToday } from './helpers';

const TODAY = logicalToday();
const YESTERDAY = addDays(TODAY, -1);

test.beforeEach(async ({ page }) => {
  await clearApp(page);
});

/** 进入健身页并确保出现当天编辑区（休息日则点击“开始临时训练”）。 */
async function ensureDayEditor(page: Page, date: string): Promise<void> {
  await gotoDate(page, date, 'life/workout');
  // 等待健身页挂载完成：要么是休息日提示，要么直接是编辑区
  const either = page.locator(
    '[data-test="rest-day"], [data-test="day-card"] [data-test="day-editor"]',
  );
  await expect(either.first()).toBeVisible();
  if (await page.locator('[data-test="rest-day"]').isVisible()) {
    await page.click('[data-test="start-temporary"]');
  }
  await expect(page.locator('[data-test="day-card"] [data-test="day-editor"]')).toBeVisible();
}

async function addExercise(page: Page, name: string): Promise<void> {
  await page.locator('[data-test="day-card"] [data-test="add-exercise-input"]').fill(name);
  await page.locator('[data-test="day-card"] [data-test="add-exercise"]').click();
  await expect(
    page.locator('[data-test="day-card"] [data-test="exercise-name"]', { hasText: name }).first(),
  ).toBeVisible();
}

async function fillAndBlur(locator: import('@playwright/test').Locator, value: string): Promise<void> {
  await locator.fill(value);
  await locator.blur();
}

/** 直接读 IndexedDB：exercises 表里某个名字的有效行数量（不经 UI）。 */
async function countExerciseRows(page: Page, name: string): Promise<number> {
  return page.evaluate(async (n) => {
    return await new Promise<number>((resolve, reject) => {
      const open = indexedDB.open('evan_personal_app_db');
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('exercises', 'readonly');
        const req = tx.objectStore('exercises').getAll();
        req.onsuccess = () => {
          const rows = (req.result as Array<{ deleted_at: number | null; name: string }>).filter(
            (r) => r.deleted_at === null && r.name === n,
          );
          resolve(rows.length);
        };
        req.onerror = () => reject(req.error);
      };
      open.onerror = () => reject(open.error);
    });
  }, name);
}

/** 直接读 IndexedDB：某逻辑日期的 workout_records 有效行。 */
async function readRecord(page: Page, date: string): Promise<{ exercises: Array<{ name: string; note?: string | null }> } | null> {
  return page.evaluate(async (d) => {
    return await new Promise<{ exercises: Array<{ name: string; note?: string | null }> } | null>(
      (resolve, reject) => {
        const open = indexedDB.open('evan_personal_app_db');
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction('workout_records', 'readonly');
          const req = tx.objectStore('workout_records').getAll();
          req.onsuccess = () => {
            const rows = (
              req.result as Array<{ deleted_at: number | null; date: string; exercises: Array<{ name: string; note?: string | null }> }>
            ).filter((r) => r.deleted_at === null && r.date === d);
            resolve(rows[0] ?? null);
          };
          req.onerror = () => reject(req.error);
        };
        open.onerror = () => reject(open.error);
      },
    );
  }, date);
}

/** AC-64：项目库自动维护 + 最近使用优先排序 + 点一下加入当天训练。 */
test('AC-64 项目库自动维护与快速选择', async ({ page }) => {
  // 今天：临时训练里添加“飞鸟”（进入项目库 + 当天记录）
  await ensureDayEditor(page, TODAY);
  await addExercise(page, '飞鸟');
  await expect(page.locator('[data-test="exercise-library"]')).toBeVisible();
  await expect(page.locator('[data-test="library-item"]', { hasText: '飞鸟' })).toBeVisible();
  expect(await countExerciseRows(page, '飞鸟')).toBe(1);
  await page.click('[data-test="finish-workout"]');

  // 昨天：临时训练里添加“卧推”（更晚写入 → 最近使用更近）
  await ensureDayEditor(page, YESTERDAY);
  await addExercise(page, '卧推');
  expect(await countExerciseRows(page, '卧推')).toBe(1);

  // 回到今天：项目库最近使用优先 —— 卧推（更晚）排在飞鸟之前
  await gotoDate(page, TODAY, 'life/workout');
  await expect(page.locator('[data-test="day-card"] [data-test="day-editor"]')).toBeVisible();
  const labels = await page.locator('[data-test="library-item"]').allTextContents();
  expect(labels.map((t) => t.trim())).toEqual(['卧推', '飞鸟']);

  // 点一下项目库按钮 → 把动作加入当天训练（先删掉当天已有的飞鸟，再点回去）
  const flyItem = page
    .locator('[data-test="day-card"] [data-test="exercise-item"]')
    .filter({ hasText: '飞鸟' });
  await flyItem.locator('[data-test="exercise-remove"]').click();
  await expect(page.locator('[data-test="day-card"] [data-test="exercise-item"]')).toHaveCount(0);

  await page.locator('[data-test="library-item"]', { hasText: '飞鸟' }).click();
  await expect(
    page.locator('[data-test="day-card"] [data-test="exercise-name"]', { hasText: '飞鸟' }),
  ).toHaveCount(1);

  // 重复点击不产生重复动作、也不新增 exercises 行
  await page.locator('[data-test="library-item"]', { hasText: '飞鸟' }).click();
  await expect(
    page.locator('[data-test="day-card"] [data-test="exercise-name"]', { hasText: '飞鸟' }),
  ).toHaveCount(1);
  expect(await countExerciseRows(page, '飞鸟')).toBe(1);
});

/** AC-65：动作备注 —— 写入落库并刷新后仍在；清空存 null；不影响组数/默认用时。 */
test('AC-65 动作备注写入/刷新/清空与回归', async ({ page }) => {
  await ensureDayEditor(page, TODAY);
  await addExercise(page, '卧推');
  // 回归：默认 3 组
  expect(await page.locator('[data-test="day-card"] [data-test="set-row"]').count()).toBe(3);

  // 写备注
  await page.locator('[data-test="exercise-note"]').first().click();
  await fillAndBlur(page.locator('[data-test="exercise-note-input"]').first(), '加到 60kg，8 次力竭');
  await expect(page.locator('[data-test="exercise-note-text"]').first()).toContainText('加到 60kg，8 次力竭');
  let record = await readRecord(page, TODAY);
  expect(record?.exercises[0]?.note).toBe('加到 60kg，8 次力竭');

  // 刷新后仍在
  await page.reload();
  await expect(page.locator('[data-test="day-card"] [data-test="day-editor"]')).toBeVisible();
  await expect(page.locator('[data-test="exercise-note-text"]').first()).toContainText('加到 60kg，8 次力竭');

  // 清空 → 落库为 null，展示区不再出现
  await page.locator('[data-test="exercise-note"]').first().click();
  await fillAndBlur(page.locator('[data-test="exercise-note-input"]').first(), '');
  await expect(page.locator('[data-test="exercise-note-text"]')).toHaveCount(0);
  record = await readRecord(page, TODAY);
  expect(record?.exercises[0]?.note).toBeNull();

  // 回归：备注不影响组数与默认用时（勾一组后立即完成 = 30 分钟），且备注保留
  await page.locator('[data-test="exercise-note"]').first().click();
  await fillAndBlur(page.locator('[data-test="exercise-note-input"]').first(), 'AC65备注');
  await page.locator('[data-test="day-card"] [data-test="set-done"]').first().check();
  await page.click('[data-test="finish-workout"]');
  await expect(page.locator('[data-test="day-card"] [data-test="duration-input"]')).toHaveValue('30');
  record = await readRecord(page, TODAY);
  expect(record?.exercises[0]?.note).toBe('AC65备注');
  expect(await page.locator('[data-test="day-card"] [data-test="set-row"]').count()).toBe(3);
});
