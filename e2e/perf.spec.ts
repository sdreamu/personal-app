import { test, expect } from '@playwright/test';
import { clearApp, gotoHash, addPlan, seedBook, seedSubject, addWater, addDays, logicalToday } from './helpers';
import { buildBackup, defaultSettingsRow, builtinPlanCategories, builtinMealTypes, writeFixture, nextId } from './fixtures';

test.beforeEach(async ({ page }) => {
  await clearApp(page);
});

/** AC-52：导入含 1 年模拟数据的备份文件（每天约 20 条）——各页面切换在 3 秒内打开。 */
test('AC-52 导入1年模拟数据后页面切换不卡顿', async ({ page }) => {
  const today = logicalToday();
  const plans: unknown[] = [];
  const study: unknown[] = [];
  const water: unknown[] = [];
  const play: unknown[] = [];
  const reviews: unknown[] = [];
  const ts = Date.now();

  for (let offset = -364; offset <= 0; offset += 1) {
    const date = addDays(today, offset);
    for (let i = 0; i < 4; i += 1) {
      const base = ts + offset * 86_400_000 + i * 1000;
      plans.push({
        id: nextId(),
        created_at: base,
        updated_at: base,
        deleted_at: null,
        title: '第' + Math.abs(offset) + '天计划' + i,
        date,
        start_min: i === 0 ? 540 : null,
        end_min: i === 0 ? 600 : null,
        category_key: i % 2 === 0 ? 'study' : 'other',
        category_name: i % 2 === 0 ? '学习' : '其他',
        target_type: null,
        target_id: null,
        target_title: null,
        done: i % 3 === 0,
        done_at: i % 3 === 0 ? base + 600_000 : null,
        rollover_from_date: null,
        is_rolled_over: false,
      });
    }
    for (let i = 0; i < 4; i += 1) {
      const base = ts + offset * 86_400_000 + i * 2000;
      study.push({
        id: nextId(),
        created_at: base,
        updated_at: base,
        deleted_at: null,
        target_type: 'subject',
        target_id: null,
        target_title: '模拟科目',
        start_at: base,
        end_at: base + 1800_000,
        duration_sec: 1800,
        note: null,
        start_page: null,
        end_page: null,
        pages_read: null,
        source: 'manual',
        date,
      });
    }
    for (let i = 0; i < 8; i += 1) {
      const base = ts + offset * 86_400_000 + i * 3000;
      water.push({
        id: nextId(),
        created_at: base,
        updated_at: base,
        deleted_at: null,
        date,
        ml: 250,
        at: base,
      });
    }
    for (let i = 0; i < 4; i += 1) {
      const base = ts + offset * 86_400_000 + i * 4000;
      play.push({
        id: nextId(),
        created_at: base,
        updated_at: base,
        deleted_at: null,
        date,
        content: '模拟游戏',
        minutes: 30,
        source: 'manual',
      });
    }
    if (offset < 0) {
      reviews.push({
        id: nextId(),
        created_at: ts + offset * 86_400_000,
        updated_at: ts + offset * 86_400_000,
        deleted_at: null,
        date,
        rating: 4,
        mood: 4,
        energy: 4,
        good: '模拟复盘',
        improve: null,
        mit: null,
        mit_added_to_plan: false,
      });
    }
  }

  const backup = buildBackup({
    settings: [defaultSettingsRow()],
    plan_categories: builtinPlanCategories(),
    meal_types: builtinMealTypes(),
    plans,
    study_records: study,
    water,
    play_records: play,
    reviews,
  });
  const filePath = writeFixture('ac52-year.json', backup);

  await gotoHash(page, 'settings');
  await page.setInputFiles('[data-test="import-file"]', filePath);
  await expect(page.locator('[data-test="confirm-import"]')).toBeVisible();
  const autoBackup = page.waitForEvent('download');
  await page.click('[data-test="confirm-import"]');
  await autoBackup;
  await expect(page.locator('[data-test="toast-stack"]')).toContainText('导入完成');

  const pages: Array<[string, string]> = [
    ['home', 'home-view'],
    ['plan', 'plan-view'],
    ['review', 'review-view'],
    ['study/books', 'books-view'],
    ['study/subjects', 'subjects-view'],
    ['life/diet', 'diet-view'],
    ['life/workout', 'workout-view'],
    ['life/play', 'play-page'],
    ['settings', 'settings-page'],
  ];

  const timings: string[] = [];
  for (const [path, testId] of pages) {
    await page.goto('/#' + path);
    const t0 = Date.now();
    await page.reload();
    await expect(page.locator('[data-test="' + testId + '"]')).toBeVisible();
    const elapsed = Date.now() - t0;
    timings.push(path + '=' + elapsed + 'ms');
    expect(elapsed).toBeLessThan(3000);
  }
  console.log('AC-52 page open timings:', timings.join(', '));
});

/** AC-53：正常操作过程中控制台没有红色报错。 */
test('AC-53 控制台无红色报错', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await addPlan(page, { title: 'AC53计划' });
  await page.locator('[data-test="todo-check"]').check();
  await seedBook(page, { title: 'AC53书', totalPages: 100, status: 'reading' });
  await page.click('[data-test="book-card"]');
  await page.fill('[data-test="page-input"]', '30');
  await page.click('[data-test="page-save"]');
  await seedSubject(page, { name: 'AC53科目', goalMin: 60 });
  await addWater(page, 1);

  await gotoHash(page, 'study/timer');
  await page.click('[data-test="type-subject"]');
  const label = page.locator('label.target-option').filter({ hasText: 'AC53科目' });
  await label.locator('input[data-test="target-option"]').check();
  await page.click('[data-test="start-btn"]');
  await page.click('[data-test="end-btn"]');
  await page.click('[data-test="short-discard"]');

  for (const path of ['home', 'plan', 'study/books', 'study/subjects', 'study/timer', 'life/diet', 'life/workout', 'life/play', 'review', 'settings']) {
    await gotoHash(page, path);
  }

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
