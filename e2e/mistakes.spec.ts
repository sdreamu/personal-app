import { test, expect } from '@playwright/test';
import { clearApp, gotoHash } from './helpers';

test.beforeEach(async ({ page }) => {
  await clearApp(page);
  await gotoHash(page, 'mistakes');
  await expect(page.locator('[data-test="mistakes-view"]')).toBeVisible();
});

/** AC-76：错题本文字录入 —— 一题一卡、预设错误原因、跟着日期走、可编辑/掌握/删除。 */
test('AC-76 错题本文字录入与卡片操作', async ({ page }) => {
  // 空态引导
  await expect(page.locator('[data-test="mistakes-empty"]')).toBeVisible();
  await expect(page.locator('[data-test="mistakes-progress"]')).toContainText('共 0 条');

  // 新增一道错题
  await page.click('[data-test="add-mistake-btn"]');
  await expect(page.locator('[data-test="mistake-form"]')).toBeVisible();
  await page.fill('[data-test="mistake-form-subject"]', '数学');
  await page.fill('[data-test="mistake-form-question"]', '求 lim(x→0) sin x / x 时直接代入了');
  await page.fill('[data-test="mistake-form-correction"]', '先等价无穷小替换再取极限');
  await page.click('[data-test="mistake-reason-概念不清"]');
  await page.click('[data-test="mistake-reason-审题错误"]');
  await page.click('[data-test="mistake-difficulty-4"]');
  await page.fill('[data-test="mistake-form-note"]', '下次先看是否满足替换条件');
  await page.click('[data-test="mistake-form-save"]');

  const card = page.locator('[data-test="mistake-card"]').first();
  await expect(card).toBeVisible();
  await expect(card.locator('[data-test="mistake-subject"]')).toHaveText('数学');
  await expect(card.locator('[data-test="mistake-question"]')).toContainText('sin x / x');
  await expect(card.locator('[data-test="mistake-correction"]')).toContainText('等价无穷小');
  await expect(card.locator('[data-test="mistake-reasons"]')).toContainText('概念不清');
  await expect(card.locator('[data-test="mistake-reasons"]')).toContainText('审题错误');
  await expect(card.locator('[data-test="mistake-difficulty"]')).toHaveText('★★★★☆');
  await expect(page.locator('[data-test="mistakes-progress"]')).toContainText('共 1 条');

  // 刷新后仍在（落库了，不是内存态）
  await page.reload();
  await expect(page.locator('[data-test="mistake-card"]')).toHaveCount(1);
  await expect(page.locator('[data-test="mistake-question"]')).toContainText('sin x / x');

  // 编辑：改题干 + 难度
  await page.click('[data-test="mistake-edit"]');
  await page.fill('[data-test="mistake-form-question"]', '改：∫x²dx 忘了 +C');
  await page.click('[data-test="mistake-difficulty-2"]');
  await page.click('[data-test="mistake-form-save"]');
  await expect(page.locator('[data-test="mistake-question"]')).toContainText('忘了 +C');
  await expect(page.locator('[data-test="mistake-difficulty"]')).toHaveText('★★☆☆☆');

  // 标记已掌握 → 徽标 + 「未掌握」筛选里消失
  await page.click('[data-test="mistake-toggle-mastered"]');
  await expect(page.locator('[data-test="mistake-mastered-badge"]')).toBeVisible();
  await expect(page.locator('[data-test="mistakes-progress"]')).toContainText('已掌握 1 条');
  await page.click('[data-test="mistakes-filter-unmastered"]');
  await expect(page.locator('[data-test="mistake-card"]')).toHaveCount(0);
  await page.click('[data-test="mistakes-filter-all"]');
  await expect(page.locator('[data-test="mistake-card"]')).toHaveCount(1);

  // 跟着日期走：顶栏有日期控件，切到后一天是空的，回到今天又回来
  await expect(page.locator('[data-test="date-switch"]')).toBeVisible();
  await page.click('[data-test="next-day"]');
  await expect(page.locator('[data-test="mistakes-empty"]')).toBeVisible();
  await page.click('[data-test="go-today"]');
  await expect(page.locator('[data-test="mistake-card"]')).toHaveCount(1);

  // 删除 → 卡片消失，撤销后回来
  await page.click('[data-test="mistake-delete"]');
  await expect(page.locator('[data-test="mistake-card"]')).toHaveCount(0);
  await page.click('.toast-undo');
  await expect(page.locator('[data-test="mistake-card"]')).toHaveCount(1);
});
