import { test, expect, type Page } from '@playwright/test';
import {
  clearApp,
  gotoHash,
  addMealItem,
  addWater,
  gotoDate,
  setSelectedDate,
  addDays,
  logicalToday,
  weekdayOf,
  thisWeekDate,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await clearApp(page);
});

async function addWorkoutType(page: Page, name: string): Promise<void> {
  await gotoHash(page, 'settings');
  const manager = page.locator('[data-test="category-manager"]').filter({ hasText: '训练类型' });
  await manager.locator('[data-test="new-name"]').fill(name);
  await manager.locator('[data-test="add"]').click();
  await expect(manager.locator('[data-test="category-row"]', { hasText: name })).toBeVisible();
}

async function fillAndBlur(locator: import('@playwright/test').Locator, value: string): Promise<void> {
  await locator.fill(value);
  await locator.blur();
}

/** AC-40：早餐区输入一行文字回车——立即添加；常吃快捷项最多 8 项且不串到午餐。 */
test('AC-40 常吃快捷项前8且不串餐次', async ({ page }) => {
  for (let i = 1; i <= 9; i += 1) {
    await addMealItem(page, 'breakfast', '早A' + i);
  }
  await addMealItem(page, 'lunch', '午B1');

  const breakfast = page.locator('[data-testid="meal-section-breakfast"]');
  await expect(breakfast.locator('[data-test="quick-item"]')).toHaveCount(8);
  await expect(breakfast.locator('[data-test="quick-row"]')).not.toContainText('早A1');
  await expect(breakfast.locator('[data-test="quick-row"]')).toContainText('早A9');

  const lunch = page.locator('[data-testid="meal-section-lunch"]');
  await expect(lunch.locator('[data-test="quick-item"]')).toHaveCount(1);
  await expect(lunch.locator('[data-test="quick-row"]')).toContainText('午B1');
  await expect(lunch.locator('[data-test="quick-row"]')).not.toContainText('早A');
});

/** AC-41：点“复制昨天的这一餐”——昨天该餐次的内容复制到今天。 */
test('AC-41 复制昨天这一餐', async ({ page }) => {
  // 日期控件只在日期相关页面显示：先到饮食页再切到昨天。
  await gotoHash(page, 'life/diet');
  await page.click('[data-test="prev-day"]');
  await addMealItem(page, 'breakfast', 'AC41昨天早餐');
  await page.click('[data-test="go-today"]');

  await gotoHash(page, 'life/diet');
  if ((await page.locator('[data-test="meal-sections"]').count()) === 0) {
    await page.locator('[data-test="diet-empty"] [data-test="empty-action"]').click();
  }
  const breakfast = page.locator('[data-testid="meal-section-breakfast"]');
  await breakfast.locator('[data-test="copy-meal"]').click();
  await expect(breakfast.locator('[data-test="meal-text"]', { hasText: 'AC41昨天早餐' })).toBeVisible();
});

/** AC-42：杯量 250ml，点 +1 杯三次再点 -1——显示 500ml，圆点进度对应。 */
test('AC-42 喝水加减与圆点进度', async ({ page }) => {
  await addWater(page, 3);
  await expect(page.locator('[data-test="water-total"]')).toHaveText('750 ml');
  await page.locator('[data-test="water-tracker"] [data-test="water-minus"]').click();
  await expect(page.locator('[data-test="water-total"]')).toHaveText('500 ml');
  await expect(page.locator('[data-test="water-cups"]')).toContainText('2 杯');
  await expect(page.locator('[data-test="water-dot"].lit')).toHaveCount(2);
});

/** AC-43：设置周三为“背+二头”并添加动作，到周三打开健身页——自动带出模板；重量次数默认带入上次数值；勾选刷新不丢。 */
test('AC-43 周三模板带出/上次数值/勾选持久', async ({ page }) => {
  await addWorkoutType(page, '背+二头');

  await gotoHash(page, 'life/workout');
  const wedRow = page.locator('[data-test="week-row"][data-weekday="3"]');
  await wedRow.locator('[data-test="type-select"]').selectOption({ label: '背+二头' });
  await expect(wedRow.locator('[data-test="exercise-editor"]')).toBeVisible();
  await wedRow.locator('[data-test="exercise-add-input"]').fill('引体向上,弯举');
  await wedRow.locator('[data-test="exercise-add"]').click();
  await expect(wedRow.locator('[data-test="exercise-chip"]')).toHaveCount(2);

  const wednesday = thisWeekDate(3);
  await gotoDate(page, wednesday, 'life/workout');
  const day = page.locator('[data-test="day-card"] [data-test="day-editor"]');
  await expect(day.locator('[data-test="day-type"]')).toHaveText('背+二头');
  await expect(day.locator('[data-test="exercise-name"]')).toHaveCount(2);

  const set1 = day.locator('[data-test="set-row"]').first();
  await fillAndBlur(set1.locator('[data-test="set-weight"]'), '60');
  await fillAndBlur(set1.locator('[data-test="set-reps"]'), '10');
  await set1.locator('[data-test="set-done"]').check();

  await page.reload();
  await expect(page.locator('[data-test="day-card"] [data-test="day-editor"]')).toBeVisible();
  const reloadedSet1 = page.locator('[data-test="day-card"] [data-test="day-editor"] [data-test="set-row"]').first();
  await expect(reloadedSet1.locator('[data-test="set-done"]')).toBeChecked();
  await expect(reloadedSet1.locator('[data-test="set-weight"]')).toHaveValue('60');
  await expect(reloadedSet1.locator('[data-test="set-reps"]')).toHaveValue('10');

  // 完成一次训练后，下周同一天应默认带入上次数值
  await page.click('[data-test="finish-workout"]');
  await expect(page.locator('[data-test="day-card"] [data-test="done-badge"]')).toBeVisible();

  await gotoDate(page, addDays(wednesday, 7), 'life/workout');
  await expect(page.locator('[data-test="day-card"] [data-test="day-editor"]')).toBeVisible();
  const nextWeekSet1 = page.locator('[data-test="day-card"] [data-test="day-editor"] [data-test="set-row"]').first();
  await expect(nextWeekSet1.locator('[data-test="set-weight"]')).toHaveValue('60');
  await expect(nextWeekSet1.locator('[data-test="set-reps"]')).toHaveValue('10');
  await expect(nextWeekSet1.locator('[data-test="set-done"]')).not.toBeChecked();
});

/** AC-44：完成当天训练——自动算出默认用时（可手改），首页运动卡片变为“已完成”，历史里出现该次记录。 */
test('AC-44 完成训练自动用时与首页历史同步', async ({ page }) => {
  await addWorkoutType(page, '胸+三头');
  const todayWeekday = weekdayOf(logicalToday());

  await gotoHash(page, 'life/workout');
  const row = page.locator('[data-test="week-row"][data-weekday="' + todayWeekday + '"]');
  await row.locator('[data-test="type-select"]').selectOption({ label: '胸+三头' });
  await expect(row.locator('[data-test="exercise-editor"]')).toBeVisible();
  await row.locator('[data-test="exercise-add-input"]').fill('卧推');
  await row.locator('[data-test="exercise-add"]').click();
  await expect(page.locator('[data-test="day-card"] [data-test="day-editor"]')).toBeVisible();
  await expect(page.locator('[data-test="day-card"] [data-test="day-type"]')).toHaveText('胸+三头');

  const set1 = page.locator('[data-test="day-card"] [data-test="day-editor"] [data-test="set-row"]').first();
  await set1.locator('[data-test="set-done"]').check();
  await page.click('[data-test="finish-workout"]');
  await expect(page.locator('[data-test="day-card"] [data-test="done-badge"]')).toBeVisible();
  await expect(page.locator('[data-test="day-card"] [data-test="duration-input"]')).toHaveValue('30');

  // 手改用时
  await fillAndBlur(page.locator('[data-test="day-card"] [data-test="duration-input"]'), '45');
  await expect(page.locator('[data-test="history-duration"]').first()).toContainText('45 分钟');

  await gotoHash(page, 'home');
  await expect(page.locator('[data-test="workout-type"]')).toHaveText('胸+三头');
  await expect(page.locator('[data-test="workout-status"]')).toHaveText('已完成');

  await gotoHash(page, 'life/workout');
  await expect(page.locator('[data-test="history-item"]')).toContainText('已完成');
  await expect(page.locator('[data-test="history-duration"]').first()).toContainText('45 分钟');
});

/** AC-45：周计划为休息的日子打开健身页——显示“今天休息”，仍可手动开始临时训练。 */
test('AC-45 休息日临时训练', async ({ page }) => {
  await gotoHash(page, 'life/workout');
  await expect(page.locator('[data-test="rest-day"]')).toBeVisible();
  await expect(page.locator('[data-test="rest-text"]')).toHaveText('今天休息');
  await page.click('[data-test="start-temporary"]');
  await expect(page.locator('[data-test="day-card"] [data-test="day-editor"]')).toBeVisible();
  await expect(page.locator('[data-test="day-card"] [data-test="day-type"]')).toHaveText('临时训练');
});

/** AC-46：娱乐额度 60 分钟，补记 70 分钟——额度条变红并提示用完，记录仍可保存。 */
test('AC-46 娱乐超额变红仍可保存', async ({ page }) => {
  await gotoHash(page, 'life/play');
  await page.click('[data-test="open-form-btn"]');
  await page.fill('[data-test="form-content"]', 'AC46游戏');
  await page.fill('[data-test="form-minutes"]', '70');
  await page.click('[data-test="form-save"]');
  await expect(page.locator('[data-test="play-record-modal"]')).toHaveCount(0);

  await expect(page.locator('[data-test="quota-text"]')).toHaveText('已用 70 / 60 分钟 · 剩余 0 分钟');
  await expect(page.locator('[data-test="quota-over-hint"]')).toBeVisible();
  await expect(page.locator('[data-test="progress-bar"]')).toHaveClass(/over/);
  await expect(page.locator('[data-test="play-record"]')).toContainText('70 分钟');
});
