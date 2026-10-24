import { expect, test, type Page } from '@playwright/test';
import { addDays, clearApp, gotoHash, logicalToday, pad2, seedBook, weekdayOf } from './helpers';

/**
 * M2 日期月历（AC-57 ~ AC-59）。
 * 月历固定在顶栏日期跳转弹窗里：上面是月历网格，下面是原生日期输入与快捷按钮。
 */

function monthParts(dateKey: string): { year: number; month: number } {
  const [year, month] = dateKey.split('-').map(Number);
  return { year: year!, month: month! };
}

/** 与 utils/calendar.buildMonthGrid 同口径：周一起始、补齐整周。 */
function expectedGrid(dateKey: string): { first: string; last: string; count: number; daysInMonth: number } {
  const { year, month } = monthParts(dateKey);
  const first = `${year}-${pad2(month)}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstOffset = weekdayOf(first) - 1; // 0 = 周一
  const last = `${year}-${pad2(month)}-${pad2(daysInMonth)}`;
  const lastOffset = weekdayOf(last) - 1;
  const count = firstOffset + daysInMonth + (6 - lastOffset);
  return { first: addDays(first, -firstOffset), last: addDays(last, 6 - lastOffset), count, daysInMonth };
}

function monthLabelOf(dateKey: string): string {
  const { year, month } = monthParts(dateKey);
  return `${year}年${month}月`;
}

function shiftedMonthFirst(dateKey: string, delta: number): string {
  const { year, month } = monthParts(dateKey);
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

function shiftedMonthLabel(dateKey: string, delta: number): string {
  return monthLabelOf(shiftedMonthFirst(dateKey, delta));
}

/** 原始 IndexedDB 造数（仅测试准备数据用，不经过 UI）。 */
async function insertRow(page: Page, table: string, row: Record<string, unknown>): Promise<void> {
  await page.evaluate(async ({ tableName, record }) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('evan_personal_app_db');
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction(tableName, 'readwrite');
        tx.objectStore(tableName).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });
  }, { tableName: table, record: row });
}

function baseRow(table: string, key: string): Record<string, unknown> {
  const now = Date.now();
  return {
    id: `e2e-${table}-${key}`,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}

async function openCalendar(page: Page): Promise<void> {
  await page.click('[data-test="date-label"]');
  await expect(page.locator('[data-test="date-jump-popover"]')).toBeVisible();
  await expect(page.locator('[data-test="month-calendar"]')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await clearApp(page);
});

/** AC-57：计划页 → 顶栏日期 → 月历（周一起始/今天与选中日高亮/点选跳转/翻月不改选中日/今天按钮）。 */
test('AC-57 顶栏日期弹窗月历：格数、今天与选中日高亮、点选跳转、翻月不改选中日', async ({ page }) => {
  const today = logicalToday();
  const grid = expectedGrid(today);

  await gotoHash(page, 'plan');
  await expect(page.locator('[data-test="plan-view"]')).toBeVisible();
  await expect(page.locator('[data-test="date-switch"]')).toBeVisible();

  await openCalendar(page);
  expect(await page.locator('[data-test="calendar-month-label"]').innerText()).toBe(monthLabelOf(today));
  await expect(page.locator('.calendar-weekdays span')).toHaveText(['一', '二', '三', '四', '五', '六', '日']);

  // 当月格子数正确：周一起始 + 上下月灰格补齐
  await expect(page.locator('[data-test="calendar-day"]')).toHaveCount(grid.count);
  expect(grid.count % 7).toBe(0);
  const cells = page.locator('[data-test="calendar-day"]');
  await expect(cells.first()).toHaveAttribute('data-date', grid.first);
  await expect(cells.last()).toHaveAttribute('data-date', grid.last);
  await expect(page.locator('[data-test="calendar-day"][data-in-month="true"]')).toHaveCount(grid.daysInMonth);

  // 今天与当前选中日（此时同为今天）各自高亮，且能同时成立
  const todayCell = page.locator('[data-test="calendar-day"][data-today="true"]');
  await expect(todayCell).toHaveCount(1);
  await expect(todayCell).toHaveAttribute('data-date', today);
  await expect(todayCell).toHaveAttribute('data-selected', 'true');
  await expect(todayCell).toHaveClass(/is-today/);
  await expect(todayCell).toHaveClass(/is-selected/);

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-test="date-jump-popover"]')).toHaveCount(0);

  // 换个选中日（昨天）后：今天与选中日是两个不同的格子，各有各的高亮
  await page.click('[data-test="prev-day"]');
  const yesterday = addDays(today, -1);
  await openCalendar(page);
  const selectedCell = page.locator('[data-test="calendar-day"][data-selected="true"]');
  await expect(selectedCell).toHaveCount(1);
  await expect(selectedCell).toHaveAttribute('data-date', yesterday);
  await expect(selectedCell).not.toHaveAttribute('data-today', 'true');
  await expect(selectedCell).toHaveClass(/is-selected/);
  await expect(selectedCell).not.toHaveClass(/is-today/);
  const todayOnly = page.locator('[data-test="calendar-day"][data-today="true"]');
  await expect(todayOnly).toHaveAttribute('data-date', today);
  await expect(todayOnly).not.toHaveAttribute('data-selected', 'true');
  await expect(todayOnly).toHaveClass(/is-today/);

  // 翻月不改变当前选中日：只换查看月份，顶栏日期不动
  const labelBefore = (await page.locator('[data-test="date-label"]').innerText()).trim();
  await page.click('[data-test="calendar-prev-month"]');
  expect(await page.locator('[data-test="calendar-month-label"]').innerText()).toBe(shiftedMonthLabel(yesterday, -1));
  expect((await page.locator('[data-test="date-label"]').innerText()).trim()).toBe(labelBefore);
  const prevGrid = expectedGrid(shiftedMonthFirst(yesterday, -1));
  await expect(page.locator('[data-test="calendar-day"]')).toHaveCount(prevGrid.count);
  await expect(page.locator('[data-test="calendar-day"]').first()).toHaveAttribute('data-date', prevGrid.first);

  await page.click('[data-test="calendar-next-month"]');
  await page.click('[data-test="calendar-next-month"]');
  expect(await page.locator('[data-test="calendar-month-label"]').innerText()).toBe(shiftedMonthLabel(yesterday, 1));
  expect((await page.locator('[data-test="date-label"]').innerText()).trim()).toBe(labelBefore);

  // 顶部「今天」按钮：回到今天、弹窗关闭
  await page.click('[data-test="calendar-today"]');
  await expect(page.locator('[data-test="date-jump-popover"]')).toHaveCount(0);
  await expect(page.locator('[data-test="date-label"]')).toContainText(
    `${monthParts(today).month}月${Number(today.slice(8, 10))}日`,
  );

  // 点某一天：顶栏日期更新且弹窗关闭
  const targetDay = Number(today.slice(8, 10)) === 15 ? 16 : 15;
  const target = `${monthParts(today).year}-${pad2(monthParts(today).month)}-${pad2(targetDay)}`;
  await openCalendar(page);
  await page.locator(`[data-test="calendar-day"][data-date="${target}"]`).click();
  await expect(page.locator('[data-test="date-jump-popover"]')).toHaveCount(0);
  await expect(page.locator('[data-test="date-label"]')).toContainText(
    `${monthParts(target).month}月${Number(target.slice(8, 10))}日`,
  );
  await expect(page.locator('[data-test="viewing-banner"]')).toContainText(
    `${monthParts(target).month}月${Number(target.slice(8, 10))}日`,
  );
});

/** AC-58：五张主动记录表任一条 → 有小点；water/meals → 无；deleted_at 非 null → 无。 */
test('AC-58 月历小点只认五张主动记录表，忽略软删除与 water/meals', async ({ page }) => {
  const today = logicalToday();
  const monthPrefix = today.slice(0, 7);
  const at = (day: number): string => `${monthPrefix}-${pad2(day)}`;

  const planDay = at(2);
  const studyDay = at(3);
  const workoutDay = at(4);
  const playDay = at(5);
  const reviewDay = at(6);
  const waterDay = at(7);
  const mealDay = at(8);
  const deletedDay = at(9);

  await gotoHash(page, 'plan');
  await insertRow(page, 'plans', {
    ...baseRow('plans', 'active'),
    title: 'AC58 计划',
    date: planDay,
    start_min: null,
    end_min: null,
    category_key: 'other',
    category_name: '其他',
    target_type: null,
    target_id: null,
    target_title: null,
    done: false,
    done_at: null,
    rollover_from_date: null,
    is_rolled_over: false,
  });
  await insertRow(page, 'study_records', {
    ...baseRow('study_records', 'active'),
    target_type: 'subject',
    target_id: null,
    target_title: 'AC58 科目',
    start_at: 0,
    end_at: 0,
    duration_sec: 600,
    note: null,
    start_page: null,
    end_page: null,
    pages_read: null,
    source: 'manual',
    date: studyDay,
  });
  await insertRow(page, 'workout_records', {
    ...baseRow('workout_records', 'active'),
    date: workoutDay,
    type_name: 'AC58 训练',
    exercises: [],
    duration_min: null,
    done: true,
  });
  await insertRow(page, 'play_records', {
    ...baseRow('play_records', 'active'),
    date: playDay,
    content: 'AC58 娱乐',
    minutes: 10,
    source: 'manual',
  });
  await insertRow(page, 'reviews', {
    ...baseRow('reviews', 'active'),
    date: reviewDay,
    rating: null,
    mood: null,
    energy: null,
    good: null,
    improve: null,
    mit: null,
    mit_added_to_plan: false,
  });
  await insertRow(page, 'water', { ...baseRow('water', 'active'), date: waterDay, ml: 250, at: Date.now() });
  await insertRow(page, 'meals', {
    ...baseRow('meals', 'active'),
    date: mealDay,
    meal_key: 'breakfast',
    meal_name: '早',
    text: 'AC58 早餐',
    feeling: null,
  });
  await insertRow(page, 'plans', {
    ...baseRow('plans', 'deleted'),
    title: 'AC58 已删除计划',
    date: deletedDay,
    start_min: null,
    end_min: null,
    category_key: 'other',
    category_name: '其他',
    target_type: null,
    target_id: null,
    target_title: null,
    done: false,
    done_at: null,
    rollover_from_date: null,
    is_rolled_over: false,
    deleted_at: Date.now(),
  });

  await openCalendar(page);

  await expect(page.locator('[data-test="calendar-day"][data-has-record="true"]')).toHaveCount(5);
  for (const day of [planDay, studyDay, workoutDay, playDay, reviewDay]) {
    const cell = page.locator(`[data-test="calendar-day"][data-date="${day}"]`);
    await expect(cell).toHaveAttribute('data-has-record', 'true');
    await expect(cell.locator('[data-test="calendar-dot"]')).toHaveCount(1);
  }
  for (const day of [waterDay, mealDay, deletedDay]) {
    const cell = page.locator(`[data-test="calendar-day"][data-date="${day}"]`);
    await expect(cell).toHaveAttribute('data-has-record', 'false');
    await expect(cell.locator('[data-test="calendar-dot"]')).toHaveCount(0);
  }
});

/** AC-59：5 个日期相关页面显示日期控件，6 个非日期页面完全不显示；原生日期输入仍可跳转。 */
test('AC-59 日期控件只在 5 个日期相关页面显示，原生日期输入仍可用', async ({ page }) => {
  const datePages = ['plan', 'life/diet', 'life/workout', 'life/play', 'review'];
  const today = logicalToday();

  for (const hash of datePages) {
    await gotoHash(page, hash);
    await expect(page.locator('[data-test="date-switch"]'), hash).toBeVisible();
    await expect(page.locator('[data-test="date-label"]'), hash).toBeVisible();
    await expect(page.locator('[data-test="prev-day"]'), hash).toBeVisible();
    await expect(page.locator('[data-test="next-day"]'), hash).toBeVisible();
  }

  // 非日期页面：完全不显示
  await gotoHash(page, 'home');
  await expect(page.locator('[data-test="date-switch"]')).toHaveCount(0);

  await gotoHash(page, 'study/books');
  await expect(page.locator('[data-test="date-switch"]')).toHaveCount(0);

  await seedBook(page, { title: 'AC59 书', totalPages: 100, status: 'reading' });
  await page.click('[data-test="book-card"]');
  await expect(page).toHaveURL(/#\/study\/books\/[^/]+$/);
  await expect(page.locator('[data-test="detail-view"]')).toBeVisible();
  await expect(page.locator('[data-test="date-switch"]')).toHaveCount(0);

  for (const hash of ['study/subjects', 'study/timer', 'settings']) {
    await gotoHash(page, hash);
    await expect(page.locator('[data-test="date-switch"]'), hash).toHaveCount(0);
  }

  // 原生 <input type="date"> 仍可用、仍能跳转
  await gotoHash(page, 'plan');
  await openCalendar(page);
  const target = addDays(today, -3);
  await page.locator('[data-test="date-input"]').fill(target);
  await expect(page.locator('[data-test="date-jump-popover"]')).toHaveCount(0);
  await expect(page.locator('[data-test="date-label"]')).toContainText(
    `${monthParts(target).month}月${Number(target.slice(8, 10))}日`,
  );
  await expect(page.locator('[data-test="viewing-banner"]')).toContainText(
    `${monthParts(target).month}月${Number(target.slice(8, 10))}日`,
  );
});
