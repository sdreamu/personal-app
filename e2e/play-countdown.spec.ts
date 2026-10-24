import { test, expect, type Page } from '@playwright/test';
import { clearApp, gotoHash } from './helpers';

/**
 * M3 娱乐页倒计时（AC-60 / AC-61）。
 * 直接读 IndexedDB 核对 active_timer / play_records 的字段，避免只凭界面文案判断。
 */
async function readTable(page: Page, table: string): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(async (name) => {
    return await new Promise<Array<Record<string, unknown>>>((resolve) => {
      const open = indexedDB.open('evan_personal_app_db');
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction(name, 'readonly');
        const req = tx.objectStore(name).getAll();
        req.onsuccess = () => {
          const rows = (req.result ?? []) as Array<Record<string, unknown>>;
          db.close();
          resolve(rows);
        };
        req.onerror = () => {
          db.close();
          resolve([]);
        };
      };
      open.onerror = () => resolve([]);
    });
  }, table);
}

async function readActiveTimer(page: Page): Promise<Record<string, unknown> | null> {
  const rows = await readTable(page, 'active_timer');
  return rows[0] ?? null;
}

/** 结束并丢弃当前计时（清理用），避免下一条用例受全局单计时守卫影响。 */
async function endAndDiscard(page: Page): Promise<void> {
  await page.click('[data-test="end-btn"]');
  await page.click('[data-test="short-discard"]');
  await expect(page.locator('[data-test="settlement-overlay"]')).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await clearApp(page);
});

/** AC-60：必须先填内容名称才能开始（沿用现有提示）。 */
test('AC-60 未填内容名称无法开始倒计时', async ({ page }) => {
  await gotoHash(page, 'life/play');
  await page.click('[data-test="play-mode-countdown"]');
  await page.click('[data-test="start-btn"]');
  await expect(page.locator('[data-test="toast-stack"]')).toContainText('请输入娱乐内容名称');
  await expect(page.locator('[data-test="pause-btn"]')).toHaveCount(0);
  expect(await readActiveTimer(page)).toBeNull();
});

/** AC-60：倒计时 + 快捷 30 分钟 → active_timer.mode=countdown、countdown_sec=1800，界面显示剩余时间。 */
test('AC-60 倒计时快捷30分钟启动并显示剩余时间', async ({ page }) => {
  await page.clock.install({ time: new Date('2030-07-01T12:00:00') });
  await clearApp(page);
  await gotoHash(page, 'life/play');
  await page.fill('[data-test="play-name-input"]', 'AC60游戏');
  await page.click('[data-test="play-mode-countdown"]');
  await page.click('[data-test="play-quick-30"]');
  await page.click('[data-test="start-btn"]');

  await expect(page.locator('[data-test="pause-btn"]')).toBeVisible();
  const row = await readActiveTimer(page);
  expect(row?.type).toBe('entertainment');
  expect(row?.mode).toBe('countdown');
  expect(row?.countdown_sec).toBe(1800);
  expect(row?.target_title).toBe('AC60游戏');
  await expect(page.locator('[data-test="clock-face"]')).toHaveText('00:30:00');
  await expect(page.locator('[data-test="play-timer-mode"]')).toHaveText('倒计时');

  await endAndDiscard(page);
});

/** AC-60：自定义分钟输入生效（25 → 1500 秒）；0 / 小数 / 超上限 1440 被拒绝。 */
test('AC-60 自定义分钟生效且非法值被拒绝', async ({ page }) => {
  await page.clock.install({ time: new Date('2030-07-02T12:00:00') });
  await clearApp(page);
  await gotoHash(page, 'life/play');
  await page.fill('[data-test="play-name-input"]', 'AC60自定义');
  await page.click('[data-test="play-mode-countdown"]');

  const invalid: Array<[string, string]> = [
    ['0', '倒计时分钟数至少 1 分钟'],
    ['1.5', '倒计时分钟数必须为整数'],
    ['1441', '倒计时分钟数不能超过 1440 分钟'],
  ];
  for (const [value, message] of invalid) {
    await page.fill('[data-test="play-countdown-minutes"]', value);
    await page.click('[data-test="start-btn"]');
    await expect(page.locator('[data-test="toast-stack"]')).toContainText(message);
    await expect(page.locator('[data-test="pause-btn"]')).toHaveCount(0);
  }
  expect(await readActiveTimer(page)).toBeNull();

  await page.fill('[data-test="play-countdown-minutes"]', '25');
  await page.click('[data-test="start-btn"]');
  await expect(page.locator('[data-test="pause-btn"]')).toBeVisible();
  expect((await readActiveTimer(page))?.countdown_sec).toBe(1500);
  await expect(page.locator('[data-test="clock-face"]')).toHaveText('00:25:00');

  await endAndDiscard(page);
});

/** AC-60：「按剩余额度」= 今日额度剩余分钟；额度为 0 时按钮禁用并提示「今日娱乐额度已用完」。 */
test('AC-60 按剩余额度取今日剩余分钟且额度为0时禁用', async ({ page }) => {
  await page.clock.install({ time: new Date('2030-07-03T12:00:00') });
  await clearApp(page);
  await gotoHash(page, 'life/play');

  // 今天先补记 20 分钟 → 默认额度 60，剩 40
  await page.click('[data-test="open-form-btn"]');
  await page.fill('[data-test="form-content"]', 'AC60补记');
  await page.fill('[data-test="form-minutes"]', '20');
  await page.click('[data-test="form-save"]');
  await expect(page.locator('[data-test="play-record-modal"]')).toHaveCount(0);

  await page.fill('[data-test="play-name-input"]', 'AC60额度');
  await page.click('[data-test="play-mode-countdown"]');
  const quotaBtn = page.locator('[data-test="play-quota-btn"]');
  await expect(quotaBtn).toContainText('40 分钟');
  await expect(quotaBtn).toBeEnabled();
  await quotaBtn.click();
  await expect(page.locator('[data-test="play-countdown-minutes"]')).toHaveValue('40');

  await page.click('[data-test="start-btn"]');
  await expect(page.locator('[data-test="pause-btn"]')).toBeVisible();
  expect((await readActiveTimer(page))?.countdown_sec).toBe(2400);
  await endAndDiscard(page);

  // 再补记 40 分钟 → 今日 60/60，剩余 0
  await page.click('[data-test="open-form-btn"]');
  await page.fill('[data-test="form-content"]', 'AC60补记2');
  await page.fill('[data-test="form-minutes"]', '40');
  await page.click('[data-test="form-save"]');
  await expect(page.locator('[data-test="play-record-modal"]')).toHaveCount(0);

  await expect(page.locator('[data-test="play-quota-btn"]')).toBeDisabled();
  await expect(page.locator('[data-test="play-quota-empty-hint"]')).toHaveText('今日娱乐额度已用完');
});

/** AC-61：设定 30 分钟倒计时，到点后一直不结束、45 分钟才结束 → 记录 30 分钟（不是 45）。 */
test('AC-61 娱乐倒计时到点后超时结束仍记设定时长', async ({ page }) => {
  await page.clock.install({ time: new Date('2030-07-04T12:00:00') });
  await clearApp(page);
  await gotoHash(page, 'life/play');
  await page.fill('[data-test="play-name-input"]', 'AC61封顶');
  await page.click('[data-test="play-mode-countdown"]');
  await page.click('[data-test="play-quick-30"]');
  await page.click('[data-test="start-btn"]');
  await expect(page.locator('[data-test="clock-face"]')).toHaveText('00:30:00');

  await page.clock.fastForward(45 * 60 * 1000);
  await expect(page.locator('[data-test="countdown-finished-text"]')).toBeVisible();
  await page.click('[data-test="countdown-end"]');
  await expect(page.locator('[data-test="settlement-modal"]')).toBeVisible();
  await expect(page.locator('[data-test="settle-duration"]')).toContainText('00:45:00');
  // 折算分钟预填必须等于设定时长（与最终落库值一致，界面不能骗人）
  await expect(page.locator('[data-test="settle-minutes"]')).toHaveValue('30');
  await page.click('[data-test="settle-save"]');
  await expect(page.locator('[data-test="settlement-overlay"]')).toHaveCount(0);

  const rows = await readTable(page, 'play_records');
  expect(rows).toHaveLength(1);
  expect(rows[0]?.content).toBe('AC61封顶');
  expect(rows[0]?.minutes).toBe(30);

  await page.reload();
  await expect(page.locator('[data-test="play-record"]').first()).toContainText('AC61封顶');
  await expect(page.locator('[data-test="play-record"]').first()).toContainText('30 分钟');
});

/** AC-61：历史行「再来一轮」预填名称 + 倒计时 30 分钟，但不自动开始，点「开始」才真正计时。 */
test('AC-61 历史再来一轮预填但不自动开始', async ({ page }) => {
  await page.clock.install({ time: new Date('2030-07-05T12:00:00') });
  await clearApp(page);
  await gotoHash(page, 'life/play');
  await page.click('[data-test="open-form-btn"]');
  await page.fill('[data-test="form-content"]', 'AC61再来');
  await page.fill('[data-test="form-minutes"]', '25');
  await page.click('[data-test="form-save"]');
  await expect(page.locator('[data-test="play-record-modal"]')).toHaveCount(0);

  await page.click('[data-test="play-again-btn"]');
  await expect(page.locator('[data-test="play-name-input"]')).toHaveValue('AC61再来');
  await expect(page.locator('[data-test="play-mode-countdown"]')).toHaveClass(/on/);
  await expect(page.locator('[data-test="play-countdown-minutes"]')).toHaveValue('30');
  await expect(page.locator('[data-test="pause-btn"]')).toHaveCount(0);
  expect(await readActiveTimer(page)).toBeNull();

  await page.click('[data-test="start-btn"]');
  await expect(page.locator('[data-test="pause-btn"]')).toBeVisible();
  const row = await readActiveTimer(page);
  expect(row?.type).toBe('entertainment');
  expect(row?.mode).toBe('countdown');
  expect(row?.countdown_sec).toBe(1800);
  expect(row?.target_title).toBe('AC61再来');

  await endAndDiscard(page);
});
