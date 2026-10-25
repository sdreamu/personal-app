import { test, expect } from '@playwright/test';
import { clearApp, gotoHash, addPlan, seedBook, seedSubject, addWater } from './helpers';

test.beforeEach(async ({ page }) => {
  await clearApp(page);
});

/** AC-11：依次点击导航中的 11 个页面入口——每页正常打开，当前页高亮，地址栏地址对应。 */
test('AC-11 十一路由导航与高亮', async ({ page }) => {
  await seedBook(page, { title: 'AC11导航书', totalPages: 100, status: 'reading' });

  const routes: Array<{ label: string; hash: string; test: string }> = [
    { label: '今天', hash: '#/home', test: 'home-view' },
    { label: '日程', hash: '#/plan', test: 'plan-view' },
    { label: '读书', hash: '#/study/books', test: 'books-view' },
    { label: '科目', hash: '#/study/subjects', test: 'subjects-view' },
    { label: '计时器', hash: '#/study/timer', test: 'study-timer-view' },
    { label: '饮食', hash: '#/life/diet', test: 'diet-view' },
    { label: '健身', hash: '#/life/workout', test: 'workout-view' },
    { label: '娱乐', hash: '#/life/play', test: 'play-page' },
    { label: '复盘', hash: '#/review', test: 'review-view' },
    { label: '设置', hash: '#/settings', test: 'settings-page' },
  ];

  for (const route of routes) {
    // 侧栏里点（首页的「接下来 / 未来七天」也有「日程」字样，不加作用域会撞 strict mode）
    await page.locator('.side-nav a.nav-link', { hasText: route.label }).first().click();
    await expect(page).toHaveURL(new RegExp(route.hash + '$'));
    await expect(page.locator('[data-test="' + route.test + '"]')).toBeVisible();
    await expect(page.locator('a.nav-link.active')).toContainText(route.label);
  }

  // 第 11 个入口：书详情页（从书架卡片进入）
  await page.locator('.side-nav a.nav-link', { hasText: '读书' }).first().click();
  await page.click('[data-test="book-card"]');
  await expect(page).toHaveURL(/#\/study\/books\/[^/]+$/);
  await expect(page.locator('[data-test="detail-view"]')).toBeVisible();
  await expect(page.locator('[data-test="detail-title"]')).toHaveText('AC11导航书');
});

/** AC-12：凌晨 2 点（一天起点 04:00 之前）添加记录——记录归属前一天。 */
test('AC-12 凌晨2点记录归属前一天', async ({ page }) => {
  await page.clock.install({ time: new Date('2030-06-15T02:00:00') });
  await clearApp(page);
  // 日期控件只在日期相关页面显示：先到饮食页再断言逻辑日期。
  await gotoHash(page, 'life/diet');
  await expect(page.locator('[data-test="date-label"]')).toContainText('6月14日');

  await page.locator('[data-test="water-tracker"] [data-test="water-plus"]').click();
  await expect(page.locator('[data-test="water-total"]')).toHaveText('250 ml');

  // 时间推进到当天中午，重载后“回到今天”应回到 6月15日，且 6月14日 的 250ml 不计入 6月15日
  await page.clock.fastForward(10 * 60 * 60 * 1000);
  await page.reload();
  await expect(page.locator('[data-test="go-today"]')).toBeVisible();
  await page.click('[data-test="go-today"]');
  await expect(page.locator('[data-test="date-label"]')).toContainText('6月15日');
  await expect(page.locator('[data-test="water-total"]')).toHaveText('0 ml');

  await page.click('[data-test="prev-day"]');
  await expect(page.locator('[data-test="date-label"]')).toContainText('6月14日');
  await expect(page.locator('[data-test="water-total"]')).toHaveText('250 ml');
});

/** AC-13：点顶栏“前一天”，添加一条喝水——记录归到前一天，回到今天后不计入今天。 */
test('AC-13 前一天补记喝水', async ({ page }) => {
  // 日期控件只在日期相关页面显示：先到饮食页再切前一天。
  await gotoHash(page, 'life/diet');
  await page.click('[data-test="prev-day"]');
  await page.locator('[data-test="water-tracker"] [data-test="water-plus"]').click();
  await expect(page.locator('[data-test="water-total"]')).toHaveText('250 ml');

  await page.click('[data-test="go-today"]');
  await expect(page.locator('[data-test="water-total"]')).toHaveText('0 ml');
});

/** AC-14：删除任意一条数据——顶部出现“撤销”，5 秒内点击后数据恢复。 */
test('AC-14 删除后5秒内撤销恢复', async ({ page }) => {
  await addPlan(page, { title: 'AC14撤销计划' });
  await page.locator('[data-test="todo-delete"]').first().click();
  await expect(page.locator('[data-test="toast-undo"]')).toBeVisible();
  await expect(page.locator('[data-test="todo-title"]', { hasText: 'AC14撤销计划' })).toHaveCount(0);

  await page.click('[data-test="toast-undo"]');
  await expect(page.locator('[data-test="todo-title"]', { hasText: 'AC14撤销计划' })).toBeVisible();
});

/** AC-15：数据为空时打开每个页面——每页显示引导语和主按钮，不是空白。 */
test('AC-15 全页面空状态引导', async ({ page }) => {
  await expect(page.locator('[data-test="home-cards"]')).toBeVisible();

  await gotoHash(page, 'plan');
  await expect(page.locator('[data-test="plan-empty"]')).toBeVisible();
  await expect(page.locator('[data-test="empty-action"]')).toBeVisible();

  await gotoHash(page, 'study/books');
  await expect(page.locator('[data-test="empty-state"]')).toHaveCount(3);

  await gotoHash(page, 'study/books/no-such-id');
  await expect(page.locator('[data-test="detail-view"]')).toBeVisible();
  await expect(page.locator('[data-test="empty-state"]').first()).toContainText('未找到这本书');
  await expect(page.locator('[data-test="empty-action"]')).toBeVisible();

  await gotoHash(page, 'study/subjects');
  await expect(page.locator('[data-test="empty-state"]')).toBeVisible();

  await gotoHash(page, 'study/timer');
  await expect(page.locator('[data-test="target-empty"]')).toBeVisible();
  // 空状态必须有主按钮（PRD §10 AC-15），点它去对应页面添加对象
  await expect(page.locator('[data-test="empty-add-target"]')).toBeVisible();

  await gotoHash(page, 'life/diet');
  await expect(page.locator('[data-test="diet-empty"]')).toBeVisible();
  await expect(page.locator('[data-test="empty-action"]')).toBeVisible();

  await gotoHash(page, 'life/workout');
  await expect(page.locator('[data-test="rest-day"]')).toBeVisible();
  await expect(page.locator('[data-test="start-temporary"]')).toBeVisible();

  await gotoHash(page, 'life/play');
  await expect(page.locator('[data-test="list-empty"]')).toBeVisible();
  await expect(page.locator('[data-test="open-form-btn"]')).toBeVisible();

  await gotoHash(page, 'review');
  await expect(page.locator('[data-test="history-empty"]')).toBeVisible();

  await gotoHash(page, 'settings');
  await expect(page.locator('.settings-page')).toBeVisible();
});

/** AC-16：快捷键——计划页 N 打开新增弹窗；Esc 关闭；计时器页 Space 开始/暂停。 */
test('AC-16 快捷键 N Esc Space', async ({ page }) => {
  await gotoHash(page, 'plan');
  await expect(page.locator('[data-test="plan-view"]')).toBeVisible();
  await page.keyboard.press('n');
  await expect(page.locator('[data-test="plan-form"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-test="plan-form"]')).toHaveCount(0);

  await seedSubject(page, { name: 'AC16科目', goalMin: 60 });
  await gotoHash(page, 'study/timer');
  await page.click('[data-test="type-subject"]');
  const label = page.locator('label.target-option').filter({ hasText: 'AC16科目' });
  await label.locator('input[data-test="target-option"]').check();
  await label.locator('input[data-test="target-option"]').blur();
  await page.keyboard.press('Space');
  await expect(page.locator('[data-test="pause-btn"]')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(page.locator('[data-test="resume-btn"]')).toBeVisible();
});
