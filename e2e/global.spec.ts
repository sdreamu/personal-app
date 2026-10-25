import { test, expect } from '@playwright/test';
import {
  clearApp,
  gotoHash,
  gotoDate,
  addPlan,
  addDays,
  logicalToday,
  seedBook,
  seedSubject,
  addWater,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await clearApp(page);
});

/** AC-11：依次点击导航里的每个页面入口——每页正常打开，当前页高亮，地址栏地址对应（含 P1 新增错题本）。 */
test('AC-11 全站页面路由导航与高亮', async ({ page }) => {
  await seedBook(page, { title: 'AC11导航书', totalPages: 100, status: 'reading' });

  const routes: Array<{ label: string; hash: string; test: string }> = [
    { label: '今天', hash: '#/home', test: 'home-view' },
    { label: '日程', hash: '#/plan', test: 'plan-view' },
    { label: '读书', hash: '#/study/books', test: 'books-view' },
    { label: '科目', hash: '#/study/subjects', test: 'subjects-view' },
    { label: '计时器', hash: '#/study/timer', test: 'study-timer-view' },
    { label: '错题本', hash: '#/mistakes', test: 'mistakes-view' },
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

  // 最后一个入口：书详情页（从书架卡片进入）
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

/** AC-79：侧栏可主动折叠到 68px，状态记在 localStorage，刷新保持，入口仍可访问。 */
test('AC-79 侧栏折叠与记忆', async ({ page }) => {
  const nav = page.locator('[data-test="side-nav"]');
  await expect(nav).toBeVisible();

  const widthOf = async (): Promise<number> => (await nav.boundingBox())?.width ?? 0;
  expect(Math.round(await widthOf())).toBe(212);

  await page.click('[data-test="side-collapse"]');
  await expect(nav).toHaveAttribute('data-collapsed', 'true');
  await expect.poll(async () => Math.round(await widthOf())).toBe(68);
  expect(await page.evaluate(() => localStorage.getItem('evan-sidebar-collapsed'))).toBe('1');

  // 折叠后入口还在（图标 + title 仍可访问）
  await expect(page.locator('.side-nav a.nav-link').first()).toHaveAttribute('title', '今天');

  // 刷新保持
  await page.reload();
  await expect(page.locator('[data-test="side-nav"]')).toHaveAttribute('data-collapsed', 'true');
  await expect.poll(async () => Math.round(await widthOf())).toBe(68);

  // 展开回去，宽度回到 212，记忆置 0
  await page.click('[data-test="side-collapse"]');
  await expect(nav).toHaveAttribute('data-collapsed', 'false');
  await expect.poll(async () => Math.round(await widthOf())).toBe(212);
  expect(await page.evaluate(() => localStorage.getItem('evan-sidebar-collapsed'))).toBe('0');

  // 折叠状态下点图标也能进页面
  await page.click('[data-test="side-collapse"]');
  await expect(nav).toHaveAttribute('data-collapsed', 'true');
  await page.locator('.side-nav a.nav-link', { hasText: '' }).first().click();
  await expect(page.locator('[data-test="home-view"]')).toBeVisible();
});

/** AC-80（P5 补欠账）：首页「接下来」「本周学习」两块新面板 + 日程页 7 天概览三泳道。 */
test('AC-80 首页接下来 / 本周学习 / 日程页三泳道', async ({ page }) => {
  const today = logicalToday();
  const tomorrow = addDays(today, 1);

  // 今天：一个时间块（学习）+ 一个无时间待办（生活）；明天：一件早读
  await addPlan(page, { title: 'AC80时间块', category: 'study', start: '09:00', end: '10:00' });
  await addPlan(page, { title: 'AC80无时间待办', category: 'life' });
  await gotoDate(page, tomorrow, '/plan');
  await addPlan(page, { title: 'AC80明天早读', category: 'study', start: '08:00', end: '08:30' });
  await page.evaluate(() => localStorage.removeItem('evan-app:selected-date'));

  // ---- 首页「接下来」：三行封顶、第一行反白、第二行是无时间待办且能就地完成 ----
  await gotoDate(page, today, '/home');
  const next = page.locator('[data-test="home-next"]');
  await expect(next).toBeVisible();
  await expect(next.locator('[data-test="next-row-0"]')).toContainText('09:00');
  await expect(next.locator('[data-test="next-row-0"]')).toContainText('AC80时间块');
  await expect(next.locator('[data-test="next-row-0"] mark.hl')).toHaveCount(1);
  await expect(next.locator('[data-test="next-row-1"]')).toContainText('AC80无时间待办');
  await expect(next.locator('[data-test="next-row-2"]')).toContainText('明天');
  await expect(next.locator('[data-test="next-row-2"]')).toContainText('AC80明天早读');

  // 就地完成第二行：重新聚合，那一行换掉
  await next.locator('[data-test="next-done-1"]').click();
  await expect(next.locator('[data-test="next-row-1"]')).not.toContainText('AC80无时间待办');

  // ---- 首页「本周学习」：7 根柱子 + 合计文案 ----
  const week = page.locator('[data-test="home-week-study"]');
  await expect(week).toBeVisible();
  await expect(week.locator('[data-test^="week-bar-"]')).toHaveCount(7);
  await expect(week.locator('[data-test="week-bar-' + today + '"]')).toHaveClass(/today/);
  await expect(week).toContainText('本周');

  // ---- 日程页 7 天概览：三泳道（学习 / 生活 / 其它）各就位 ----
  await gotoHash(page, 'plan');
  const todayColumn = page.locator('[data-test="week-day-' + today + '"]');
  await expect(todayColumn).toBeVisible();
  await expect(todayColumn).toHaveClass(/today/);
  await expect(todayColumn.locator('.lane-study .bar')).toHaveCount(1);
  await expect(todayColumn.locator('.lane-life .bar')).toHaveCount(0);
  await expect(todayColumn.locator('.lane-other .bar')).toHaveCount(0);
  await expect(todayColumn.locator('.day-count')).toHaveText('2 件');
});
