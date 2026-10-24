import { test, expect } from '@playwright/test';
import { clearApp, gotoHash, addPlan, seedSubject, startStudyTimer } from './helpers';

test.beforeEach(async ({ page }) => {
  await clearApp(page);
});

/** AC-17：首页喝水卡片点 +1 杯——首页数字增加，饮食页同步增加同样的量。 */
test('AC-17 首页+1杯与饮食页同步', async ({ page }) => {
  await page.click('[data-test="water-plus"]');
  await expect(page.locator('[data-test="water-text"]')).toContainText('250 ml');
  await gotoHash(page, 'life/diet');
  await expect(page.locator('[data-test="water-total"]')).toHaveText('250 ml');
});

/** AC-18：计划页完成一项——首页“今日计划”的完成数同步变化。 */
test('AC-18 计划完成数同步首页', async ({ page }) => {
  await addPlan(page, { title: 'AC18计划' });
  await page.locator('[data-test="todo-check"]').check();
  await expect(page.locator('[data-test="progress-row"]')).toContainText('1 / 1');

  await gotoHash(page, 'home');
  await expect(page.locator('[data-test="plan-progress"]')).toHaveText('已完成 1 / 1');
});

/** AC-19：未结束计时、昨天未复盘、昨天有未完成项同时存在——提示条最多 2 条，按计时>复盘>顺延>备份排序。 */
test('AC-19 首页提示条最多2条且按优先级', async ({ page }) => {
  // 昨天留 1 项未完成
  await page.click('[data-test="prev-day"]');
  await addPlan(page, { title: 'AC19昨日未完成' });
  await page.click('[data-test="go-today"]');

  // 未结束计时
  await seedSubject(page, { name: 'AC19科目', goalMin: 60 });
  await startStudyTimer(page, 'AC19科目');

  await gotoHash(page, 'home');
  const hints = page.locator('[data-test="hint-item"]');
  await expect(hints).toHaveCount(2);
  await expect(hints.nth(0)).toContainText('计时');
  await expect(hints.nth(1)).toContainText('复盘');
  await expect(hints.nth(0).locator('[data-test="hint-text"]')).toContainText('AC19科目');
});

/** AC-20：昨天写下“明天最重要的一件事”——今天首页和计划页顶部显示，加入今日待办后按钮禁用不可重复添加。 */
test('AC-20 昨天MIT今天显示并防重复加入', async ({ page }) => {
  await page.click('[data-test="prev-day"]');
  await gotoHash(page, 'review');
  await page.locator('[data-test="rating-star"]').nth(4).click();
  await page.fill('[data-test="review-mit"]', 'AC20最重要的一件事');
  await page.click('[data-test="review-confirm"]');
  await expect(page.locator('[data-test="review-confirm"]')).toBeDisabled();
  await page.click('[data-test="go-today"]');

  await gotoHash(page, 'home');
  const mitBar = page.locator('[data-test="mit-bar"]');
  await expect(mitBar).toBeVisible();
  await expect(page.locator('[data-test="mit-text"]')).toHaveText('AC20最重要的一件事');
  await page.click('[data-test="mit-add-btn"]');
  await expect(page.locator('[data-test="mit-add-btn"]')).toContainText('已加入今日待办 ✓');
  await expect(page.locator('[data-test="mit-add-btn"]')).toBeDisabled();

  await gotoHash(page, 'plan');
  await expect(page.locator('[data-test="mit-row"]')).toBeVisible();
  await expect(page.locator('[data-test="todo-title"]', { hasText: 'AC20最重要的一件事' })).toBeVisible();
  await expect(page.locator('[data-test="mit-added"]')).toContainText('已加入今日待办 ✓');
});
