import { test, expect } from '@playwright/test';
import { clearApp, gotoHash, addPlan, seedBook } from './helpers';

test.beforeEach(async ({ page }) => {
  await clearApp(page);
});

/** AC-21：添加待办再“安排时间”设置起止时间——出现在时间轴上，不再重复出现在无时间待办里。 */
test('AC-21 待办安排时间进入时间轴', async ({ page }) => {
  await addPlan(page, { title: 'AC21任务' });
  await expect(page.locator('[data-test="todo-title"]', { hasText: 'AC21任务' })).toBeVisible();

  await page.locator('[data-test="todo-schedule"]').click();
  await page.fill('[data-test="plan-form-start"]', '09:00');
  await page.fill('[data-test="plan-form-end"]', '10:00');
  await page.click('[data-test="plan-form-save"]');
  await expect(page.locator('[data-test="plan-form"]')).toHaveCount(0);

  await expect(page.locator('[data-test="timeline-block"]', { hasText: 'AC21任务' })).toBeVisible();
  await expect(page.locator('[data-test="todo-title"]', { hasText: 'AC21任务' })).toHaveCount(0);
  await expect(page.locator('[data-test="todo-empty"]')).toBeVisible();
});

/** AC-22：两个重叠时间块——出现重叠提示并排显示，且可以保存。 */
test('AC-22 重叠时间块并排显示与提示', async ({ page }) => {
  await addPlan(page, { title: 'AC22块A', start: '09:00', end: '10:30' });
  await addPlan(page, { title: 'AC22块B', start: '10:00', end: '11:00' });

  const blocks = page.locator('[data-test="timeline-block"]');
  await expect(blocks).toHaveCount(2);
  await expect(page.locator('[data-test="overlap-icon"]')).toHaveCount(2);
  await expect(page.locator('[data-test="timeline-block"][data-lane="0"]')).toBeVisible();
  await expect(page.locator('[data-test="timeline-block"][data-lane="1"]')).toBeVisible();
});

/** AC-23：未完成项“移到明天”——今天不再显示，切换到明天出现。 */
test('AC-23 移到明天', async ({ page }) => {
  await addPlan(page, { title: 'AC23移到明天' });
  await page.locator('[data-test="todo-tomorrow"]').click();
  await expect(page.locator('[data-test="todo-title"]', { hasText: 'AC23移到明天' })).toHaveCount(0);
  await expect(page.locator('[data-test="plan-empty"]')).toBeVisible();

  await page.click('[data-test="next-day"]');
  await expect(page.locator('[data-test="todo-title"]', { hasText: 'AC23移到明天' })).toBeVisible();
});

/** AC-24：昨天留 2 项未完成，今天一键顺延——今天新增2项带顺延标记；昨天原记录保留、复盘分母不变。 */
test('AC-24 一键顺延昨日未完成且分母不变', async ({ page }) => {
  await gotoHash(page, 'plan');
  await page.click('[data-test="prev-day"]');
  await addPlan(page, { title: 'AC24昨日A' });
  await addPlan(page, { title: 'AC24昨日B' });

  await page.click('[data-test="go-today"]');
  await expect(page.locator('[data-test="rollover-btn"]')).toContainText('2');
  await page.click('[data-test="rollover-btn"]');
  await expect(page.locator('[data-test="todo-title"]', { hasText: 'AC24昨日A' })).toBeVisible();
  await expect(page.locator('[data-test="todo-title"]', { hasText: 'AC24昨日B' })).toBeVisible();
  await expect(page.locator('[data-test="rollover-badge"]')).toHaveCount(2);

  await page.click('[data-test="prev-day"]');
  await expect(page.locator('[data-test="todo-title"]', { hasText: 'AC24昨日A' })).toBeVisible();
  await expect(page.locator('[data-test="todo-title"]', { hasText: 'AC24昨日B' })).toBeVisible();

  await gotoHash(page, 'review');
  await expect(page.locator('[data-test="metric-plan-value"]')).toHaveText('0/2');
});

/** AC-25：时间块关联一本书点“开始”——进入计时器预选该书；结束保存后询问是否标记该块完成。 */
test('AC-25 关联书籍计时并询问完成计划块', async ({ page }) => {
  await page.clock.install({ time: new Date('2030-06-20T12:00:00') });
  await clearApp(page);
  await seedBook(page, { title: 'AC25关联书', totalPages: 200, status: 'reading' });
  await addPlan(page, {
    title: 'AC25读书块',
    category: 'study',
    start: '09:00',
    end: '10:00',
    targetLabel: '书 · AC25关联书',
  });

  await page.locator('[data-test="timeline-start"]').click();
  await expect(page).toHaveURL(/type=book/);
  const selected = page.locator('label.target-option.selected');
  await expect(selected).toContainText('AC25关联书');

  await page.click('[data-test="start-btn"]');
  await expect(page.locator('[data-test="pause-btn"]')).toBeVisible();
  await page.clock.fastForward(2 * 60 * 1000);
  await page.click('[data-test="end-btn"]');
  await expect(page.locator('[data-test="settlement-modal"]')).toBeVisible();
  await page.fill('[data-test="settle-end-page"]', '50');
  await page.click('[data-test="settle-save"]');
  await expect(page.locator('[data-test="plan-question-text"]')).toContainText('AC25读书块');
  await page.click('[data-test="plan-question-confirm"]');
  await expect(page.locator('[data-test="toast-stack"]')).toContainText('已标记计划完成');

  await gotoHash(page, 'plan');
  await expect(page.locator('[data-test="timeline-block"].done')).toContainText('AC25读书块');
});
