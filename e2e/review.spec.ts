import { test, expect, type Page, type Locator } from '@playwright/test';
import {
  clearApp,
  gotoHash,
  addPlan,
  seedBook,
  seedSubject,
  addWater,
  addDays,
  logicalToday,
  weekdayOf,
  openWeekPlan,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await clearApp(page);
});

async function fillAndBlur(locator: Locator, value: string): Promise<void> {
  await locator.fill(value);
  await locator.blur();
}

async function addWorkoutType(page: Page, name: string): Promise<void> {
  await gotoHash(page, 'settings');
  const manager = page.locator('[data-test="category-manager"]').filter({ hasText: '训练类型' });
  await manager.locator('[data-test="new-name"]').fill(name);
  await manager.locator('[data-test="add"]').click();
  await expect(manager.locator('[data-test="category-row"]', { hasText: name })).toBeVisible();
}

async function seedTodayWorkout(page: Page, typeName: string, exercise: string): Promise<void> {
  const todayWeekday = weekdayOf(logicalToday());
  await gotoHash(page, 'life/workout');
  await openWeekPlan(page);
  const row = page.locator('[data-test="week-row"][data-weekday="' + todayWeekday + '"]');
  await row.locator('[data-test="type-select"]').selectOption({ label: typeName });
  await expect(row.locator('[data-test="exercise-editor"]')).toBeVisible();
  await row.locator('[data-test="exercise-add-input"]').fill(exercise);
  await row.locator('[data-test="exercise-add"]').click();
  await expect(page.locator('[data-test="day-card"] [data-test="day-editor"]')).toBeVisible();
  await page.locator('[data-test="day-card"] [data-test="day-editor"] [data-test="set-row"]').first().locator('[data-test="set-done"]').check();
  await page.click('[data-test="finish-workout"]');
  await expect(page.locator('[data-test="day-card"] [data-test="done-badge"]')).toBeVisible();
}

async function addPlayManual(page: Page, content: string, minutes: number): Promise<void> {
  await gotoHash(page, 'life/play');
  await page.click('[data-test="open-form-btn"]');
  await page.fill('[data-test="form-content"]', content);
  await page.fill('[data-test="form-minutes"]', String(minutes));
  await page.click('[data-test="form-save"]');
  await expect(page.locator('[data-test="play-record-modal"]')).toHaveCount(0);
}

/** AC-47：当天做过计划、学习、阅读、喝水、运动、娱乐后打开复盘——7 项自动汇总数字与各模块完全一致。 */
test('AC-47 复盘7项汇总与各模块一致', async ({ page }) => {
  // 计划：1 个学习时间块（60 分钟）+ 1 个已完成待办 → 完成数 1/2，计划学习 60 分钟
  await addPlan(page, { title: 'AC47学习计划', category: 'study', start: '09:00', end: '10:00' });
  await addPlan(page, { title: 'AC47待办' });
  await page.locator('[data-test="todo-check"]').check();

  // 学习：手动补记 30 分钟
  await seedSubject(page, { name: 'AC47科目', goalMin: 60 });
  await page.locator('[data-test="subject-manual"]').click();
  await page.fill('[data-test="subject-manual-form-minutes"]', '30');
  await page.click('[data-test="subject-manual-form-save"]');
  await expect(page.locator('[data-test="subject-manual-form"]')).toHaveCount(0);

  // 阅读：更新页码 0 → 50
  await seedBook(page, { title: 'AC47书', totalPages: 200, status: 'reading' });
  await page.getByRole('heading', { name: 'AC47书', exact: true }).click();
  await page.fill('[data-test="page-input"]', '50');
  await page.click('[data-test="page-save"]');

  // 喝水：+1 杯 250ml
  await addWater(page, 1);

  // 运动：今天模板训练完成（自动用时 30 分钟）
  await addWorkoutType(page, '腿');
  await seedTodayWorkout(page, '腿', '深蹲');

  // 娱乐：手动补记 30 分钟
  await addPlayManual(page, 'AC47游戏', 30);

  await gotoHash(page, 'review');
  await expect(page.locator('[data-test="metric-plan-value"]')).toHaveText('1/2');
  await expect(page.locator('[data-test="metric-study-value"]')).toContainText('00:30:00');
  await expect(page.locator('[data-test="metric-pages-value"]')).toHaveText('50 页');
  await expect(page.locator('[data-test="metric-water-value"]')).toHaveText('250 ml / 2000 ml');
  await expect(page.locator('[data-test="metric-workout-value"]')).toContainText('腿 30 分钟');
  await expect(page.locator('[data-test="metric-play-value"]')).toHaveText('30 分钟 / 60 分钟');
  await expect(page.locator('[data-test="metric-diff-value"]')).toHaveText('-30 分钟（未达计划）');
});

/** AC-48：评分/心情/精力与复盘文字刷新后保留；再次点击已选评分可取消选择。 */
test('AC-48 复盘评分文字刷新保留与再点取消', async ({ page }) => {
  await gotoHash(page, 'review');
  const stars = page.locator('[data-test="rating-star"]');
  await stars.nth(3).click();
  await page.fill('[data-test="review-good"]', 'AC48做得好');
  await expect(page.locator('[data-test="review-save-status"]')).toHaveText('已自动保存');

  await page.reload();
  await expect(page.locator('[data-test="review-view"]')).toBeVisible();
  await expect(page.locator('[data-test="rating-star"]').nth(3)).toHaveText('★');
  await expect(page.locator('[data-test="rating-star"]').nth(4)).toHaveText('☆');
  await expect(page.locator('[data-test="review-good"]')).toHaveValue('AC48做得好');

  await page.locator('[data-test="rating-star"]').nth(3).click();
  await expect(page.locator('[data-test="rating-star"]').nth(0)).toHaveText('☆');
  await expect(page.locator('[data-test="rating-star"]').nth(3)).toHaveText('☆');

  await expect(page.locator('[data-test="review-save-status"]')).toHaveText('已自动保存');
  await page.reload();
  await expect(page.locator('[data-test="rating-star"]').nth(0)).toHaveText('☆');
  await expect(page.locator('[data-test="review-good"]')).toHaveValue('AC48做得好');
});

test('AC-49 从历史区补写并点击查看详情', async ({ page }) => {
  await gotoHash(page, 'review');
  const yesterday = addDays(logicalToday(), -1);
  await expect(page.locator('[data-test="prev-day"]')).toHaveCount(0);
  await expect(page.locator('[data-test="history-range-stats"]')).toHaveCount(0);
  await page.locator('[data-test="history-open-date"]').fill(yesterday);
  await expect(page.locator('[data-test="review-date"]')).toHaveText(yesterday);
  await page.locator('[data-test="rating-star"]').nth(2).click();
  await page.locator('[data-test="review-day-summary"]').fill('昨天的一句话');
  await expect(page.locator('[data-test="review-save-status"]')).toHaveText('已自动保存');
  await page.locator('[data-test="review-today"]').click();
  await expect(page.locator('[data-test="review-date"]')).toHaveText(logicalToday());
  const row = page.locator(`[data-test="history-item"][data-date="${yesterday}"]`);
  await row.locator('[data-test="history-row"]').click();
  await expect(row.locator('[data-test="history-detail-day-summary"]')).toHaveText('昨天的一句话');
  await expect(page.locator('[data-test="review-date"]')).toHaveText(logicalToday());
});

test('AC-49b 输入后立即换日期或离页仍保存', async ({ page }) => {
  await gotoHash(page, 'review');
  await page.fill('[data-test="review-good"]', '自动保存的记录');
  await page.locator('[data-test="history-open-date"]').fill(addDays(logicalToday(), -1));
  await expect(page.locator('[data-test="review-date"]')).toHaveText(addDays(logicalToday(), -1));
  await page.locator('[data-test="review-today"]').click();
  await expect(page.locator('[data-test="review-good"]')).toHaveValue('自动保存的记录');
  await page.fill('[data-test="review-mit"]', '离开时保留');
  await gotoHash(page, 'home');
  await gotoHash(page, 'review');
  await expect(page.locator('[data-test="review-mit"]')).toHaveValue('离开时保留');
});

/** AC-50：修改每日目标、杯量、娱乐额度立即生效；内置分类不可删除，自定义分类可增删改。 */
test('AC-50 设置目标立即生效与内置分类保护', async ({ page }) => {
  await gotoHash(page, 'settings');
  await fillAndBlur(page.locator('[data-test="goal-study"]'), '200');
  await fillAndBlur(page.locator('[data-test="goal-water"]'), '2500');
  await fillAndBlur(page.locator('[data-test="goal-cup"]'), '300');
  await fillAndBlur(page.locator('[data-test="goal-play"]'), '90');

  await gotoHash(page, 'home');
  await expect(page.locator('[data-test="study-text"]')).toContainText('目标 200 分钟');
  await expect(page.locator('[data-test="water-text"]')).toContainText('目标 2500 ml');

  await gotoHash(page, 'life/diet');
  await expect(page.locator('[data-test="water-cups"]')).toContainText('目标 2500 ml');
  await page.locator('[data-test="water-tracker"] [data-test="water-plus"]').click();
  await expect(page.locator('[data-test="water-total"]')).toHaveText('300 ml');

  await gotoHash(page, 'life/play');
  await expect(page.locator('[data-test="quota-text"]')).toContainText('/ 90 分钟');

  // 内置“学习”分类不可删除
  await gotoHash(page, 'settings');
  const planMgr = page.locator('[data-test="category-manager"]').filter({ hasText: '计划分类' });
  const studyRow = planMgr.locator('[data-test="category-row"]', { hasText: '学习' });
  await expect(studyRow.locator('[data-test="builtin-badge"]')).toBeVisible();
  await expect(studyRow.locator('[data-test="delete"]')).toHaveCount(0);

  // 自定义分类：增、改、删
  await planMgr.locator('[data-test="new-name"]').fill('读书会');
  await planMgr.locator('[data-test="add"]').click();
  const customRow = planMgr.locator('[data-test="category-row"]', { hasText: '读书会' });
  await expect(customRow).toBeVisible();

  await customRow.locator('[data-test="edit"]').click();
  await planMgr.locator('[data-test="edit-name"]').fill('读书会2');
  await planMgr.locator('[data-test="edit-save"]').click();
  await expect(planMgr.locator('[data-test="category-row"]', { hasText: '读书会2' })).toBeVisible();

  await planMgr.locator('[data-test="category-row"]', { hasText: '读书会2' }).locator('[data-test="delete"]').click();
  await expect(planMgr.locator('[data-test="category-row"]', { hasText: '读书会2' })).toHaveCount(0);
});

/** AC-51：切换深色模式后刷新——保持深色。 */
test('AC-51 深色模式刷新保持', async ({ page }) => {
  await gotoHash(page, 'settings');
  await page.click('[data-test="theme-dark"]');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('[data-test="theme-dark"]')).toHaveClass(/on/);
});

/** AC-77：复盘页底部的「心情 / 精力」曲线——纯 SVG，跟着 reviews.mood / energy 长。 */
test('AC-77 心情 / 精力曲线', async ({ page }) => {
  await gotoHash(page, 'review');
  await expect(page.locator('[data-test="review-view"]')).toBeVisible();

  // 还没记录：空态文案，不画空坐标轴
  const card = page.locator('[data-test="review-trend"]');
  await expect(card).toBeVisible();
  await expect(card.locator('[data-test="trend-empty"]')).toBeVisible();
  await expect(card.locator('[data-test="trend-svg"]')).toHaveCount(0);

  // 记一天：心情 5、精力 2 → 自动保存后曲线出现
  await page.locator('[data-test="mood-btn"]').nth(4).click();
  await page.locator('[data-test="energy-bar"]').nth(1).click();
  await expect(page.locator('[data-test="review-save-status"]')).toHaveText('已自动保存');

  await expect(card.locator('[data-test="trend-empty"]')).toHaveCount(0);
  await expect(card.locator('[data-test="trend-svg"]')).toBeVisible();
  await expect(card.locator('[data-test="trend-line-mood"]')).toHaveCount(1);
  await expect(card.locator('[data-test="trend-line-energy"]')).toHaveCount(1);
  await expect(card.locator('[data-test="trend-stat-mood"]')).toHaveText('1 天 · 平均 5');
  await expect(card.locator('[data-test="trend-stat-energy"]')).toHaveText('1 天 · 平均 2');

  // 还是纯 SVG：没有图片、没有外部脚本
  await expect(card.locator('img')).toHaveCount(0);
  await expect(card.locator('script')).toHaveCount(0);

  // 切到前一天记第二条：心情 1、精力 5 → 两天相邻，折线连成一条、两个点
  await page.locator('[data-test="history-open-date"]').fill(addDays(logicalToday(), -1));
  await expect(page.locator('[data-test="review-date"]')).toHaveText(addDays(logicalToday(), -1));
  await expect(page.locator('[data-test="review-trend"]')).toBeVisible();
  await page.locator('[data-test="mood-btn"]').nth(0).click();
  await page.locator('[data-test="energy-bar"]').nth(4).click();
  await expect(page.locator('[data-test="review-save-status"]')).toHaveText('已自动保存');
  await expect(card.locator('[data-test="trend-stat-mood"]')).toHaveText('2 天 · 平均 3');
  await expect(card.locator('[data-test="trend-stat-energy"]')).toHaveText('2 天 · 平均 3.5');
  await expect(card.locator('[data-test="trend-line-mood"]')).toHaveCount(1);
  const moodPoints = (await card.locator('[data-test="trend-line-mood"]').first().getAttribute('points')) ?? '';
  expect(moodPoints.split(' ')).toHaveLength(2);
});
