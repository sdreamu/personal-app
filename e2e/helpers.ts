import { expect, type Page } from '@playwright/test';

/** 数据库名（与 DECISIONS.md 一致）。 */
export const DB_NAME = 'evan_personal_app_db';
/** 默认一天起点 04:00 的偏移分钟数。 */
export const DAY_START_MIN = 240;

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 本地时区毫秒时间戳 → 'YYYY-MM-DD'（与 app 的 dateKeyOf 一致）。 */
export function dateKeyOf(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 逻辑今天（按默认 04:00 起点）。 */
export function logicalToday(now: number = Date.now()): string {
  return dateKeyOf(now - DAY_START_MIN * 60_000);
}

export function addDays(dateKey: string, delta: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return dateKeyOf(dt.getTime());
}

/** 1=周一 ... 7=周日（与 app weekdayOf 一致）。 */
export function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return (dt.getDay() + 6) % 7 + 1;
}

/** 当前逻辑日期所在周的指定星期几（1=周一）。 */
export function thisWeekDate(weekday: number): string {
  const today = logicalToday();
  return addDays(today, weekday - weekdayOf(today));
}

/** 每个 test 前的干净环境：清 localStorage 与 IndexedDB 后重开 App。 */
export async function clearApp(page: Page): Promise<void> {
  await page.goto('/#/home');
  await page.evaluate(async () => {
    try {
      localStorage.clear();
    } catch {
      // 隐私模式等场景忽略
    }
    try {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('evan_personal_app_db');
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    } catch {
      // 数据库不可用忽略
    }
  });
  await page.goto('about:blank');
  await page.goto('/#/home');
  await expect(page.locator('[data-test="home-view"]')).toBeVisible();
}

/** 跳转到 hash 路由页面。 */
export async function gotoHash(page: Page, hash: string): Promise<void> {
  await page.goto('/#' + hash);
}

/** 切换顶栏日期到指定逻辑日期（通过 localStorage 注入，刷新后生效）。 */
export async function setSelectedDate(page: Page, date: string): Promise<void> {
  await page.evaluate((d) => {
    try {
      localStorage.setItem('evan-app:selected-date', d);
    } catch {
      // 忽略
    }
  }, date);
}

/** 直接打开指定日期的指定页面（避免 HomeView 挂载时强制回到今天）。 */
export async function gotoDate(page: Page, date: string, hash = '/home'): Promise<void> {
  if (hash === '/home') {
    // 首页永远显示今天，按设计不允许指定日期；只跳转到首页即可
    await page.goto('/#/home');
    await expect(page.locator('[data-test="home-view"]')).toBeVisible();
    return;
  }
  await page.goto('/#/plan');
  await setSelectedDate(page, date);
  await page.reload();
  await expect(page.locator('[data-test="plan-view"]')).toBeVisible();
  await gotoHash(page, hash);
}

/** 在计划页新增一条计划（待办或时间块）。 */
export async function addPlan(
  page: Page,
  opts: { title: string; category?: string; start?: string; end?: string; targetLabel?: string },
): Promise<void> {
  await gotoHash(page, 'plan');
  await page.click('[data-test="add-plan-btn"]');
  const form = page.locator('[data-test="plan-form"]');
  await form.locator('[data-test="plan-form-title"]').fill(opts.title);
  if (opts.category !== undefined) {
    await form.locator('[data-test="plan-form-category"]').selectOption(opts.category);
  }
  if (opts.start !== undefined) {
    await form.locator('[data-test="plan-form-start"]').fill(opts.start);
  }
  if (opts.end !== undefined) {
    await form.locator('[data-test="plan-form-end"]').fill(opts.end);
  }
  if (opts.targetLabel !== undefined) {
    await form.locator('[data-test="plan-form-target"]').selectOption({ label: opts.targetLabel });
  }
  await form.locator('[data-test="plan-form-save"]').click();
  await expect(page.locator('[data-test="plan-form"]')).toHaveCount(0);
}

/** 在书架新增一本书。 */
export async function seedBook(
  page: Page,
  opts: { title: string; author?: string; totalPages?: number; status?: 'want' | 'reading' | 'done' },
): Promise<void> {
  await gotoHash(page, 'study/books');
  await page.click('[data-test="add-book-btn"]');
  const form = page.locator('[data-test="book-form"]');
  await form.locator('[data-test="book-form-title"]').fill(opts.title);
  if (opts.author !== undefined) {
    await form.locator('[data-test="book-form-author"]').fill(opts.author);
  }
  if (opts.totalPages !== undefined) {
    await form.locator('[data-test="book-form-total"]').fill(String(opts.totalPages));
  }
  await form.locator('[data-test="book-form-status"]').selectOption(opts.status ?? 'reading');
  await form.locator('[data-test="book-form-save"]').click();
  await expect(page.locator('[data-test="book-form"]')).toHaveCount(0);
}

/** 在科目页新增一个科目。 */
export async function seedSubject(
  page: Page,
  opts: { name: string; goalMin?: number; deadline?: string },
): Promise<void> {
  await gotoHash(page, 'study/subjects');
  await page.click('[data-test="add-subject-btn"]');
  const form = page.locator('[data-test="subject-form"]');
  await form.locator('[data-test="subject-form-name"]').fill(opts.name);
  if (opts.goalMin !== undefined) {
    await form.locator('[data-test="subject-form-goal"]').fill(String(opts.goalMin));
  }
  if (opts.deadline !== undefined) {
    await form.locator('[data-test="subject-form-deadline"]').fill(opts.deadline);
  }
  await form.locator('[data-test="subject-form-save"]').click();
  await expect(page.locator('[data-test="subject-form"]')).toHaveCount(0);
}

/** 在饮食页喝水 +n 杯（杯量按当前设置）。 */
export async function addWater(page: Page, times = 1): Promise<void> {
  await gotoHash(page, 'life/diet');
  const plus = page.locator('[data-test="water-tracker"] [data-test="water-plus"]');
  for (let i = 0; i < times; i += 1) {
    await plus.click();
  }
}

/** 在指定餐次分区输入一行文字并回车添加。 */
export async function addMealItem(page: Page, mealKey: string, text: string): Promise<void> {
  await gotoHash(page, 'life/diet');
  // 当天还没有任何记录时，先点空状态主按钮打开分区列表
  if ((await page.locator('[data-test="meal-sections"]').count()) === 0) {
    await page.locator('[data-test="diet-empty"] [data-test="empty-action"]').click();
  }
  const section = page.locator(`[data-testid="meal-section-${mealKey}"]`);
  if ((await section.locator('[data-test="add-row"]').count()) === 0) {
    await section.locator('[data-test="toggle-input"]').click();
  }
  await section.locator('[data-test="meal-input"]').fill(text);
  await section.locator('[data-test="meal-input"]').press('Enter');
  await expect(section.locator('[data-test="meal-text"]', { hasText: text }).first()).toBeVisible();
}

/** 在计时器页选择对象并开始学习计时（等待出现暂停按钮）。默认选“科目”页签。 */
export async function startStudyTimer(
  page: Page,
  targetLabel: string,
  type: 'book' | 'subject' = 'subject',
): Promise<void> {
  await gotoHash(page, 'study/timer');
  if (type === 'subject') {
    await page.click('[data-test="type-subject"]');
  } else {
    await page.click('[data-test="type-book"]');
  }
  const label = page.locator('label.target-option').filter({ hasText: targetLabel });
  await label.locator('input[data-test="target-option"]').check();
  await page.click('[data-test="start-btn"]');
  await expect(page.locator('[data-test="pause-btn"]')).toBeVisible();
}

/** 在娱乐页开始一次娱乐计时。 */
export async function startPlayTimer(page: Page, name: string): Promise<void> {
  await gotoHash(page, 'life/play');
  await page.fill('[data-test="play-name-input"]', name);
  await page.click('[data-test="start-btn"]');
  await expect(page.locator('[data-test="pause-btn"]')).toBeVisible();
}

/** 学习计时结算：填写可选收获/页码后保存，等待结算弹窗关闭。 */
export async function settleStudy(page: Page, opts: { note?: string; endPage?: number } = {}): Promise<void> {
  const modal = page.locator('[data-test="settlement-modal"]');
  if (opts.endPage !== undefined) {
    await modal.locator('[data-test="settle-end-page"]').fill(String(opts.endPage));
  }
  if (opts.note !== undefined) {
    await modal.locator('[data-test="settle-note"]').fill(opts.note);
  }
  await modal.locator('[data-test="settle-save"]').click();
  await expect(page.locator('[data-test="settlement-overlay"]')).toHaveCount(0);
}

/** 娱乐计时结算：保存分钟数。 */
export async function settlePlay(page: Page, minutes?: number): Promise<void> {
  const modal = page.locator('[data-test="settlement-modal"]');
  if (minutes !== undefined) {
    await modal.locator('[data-test="settle-minutes"]').fill(String(minutes));
  }
  await modal.locator('[data-test="settle-save"]').click();
  await expect(page.locator('[data-test="settlement-overlay"]')).toHaveCount(0);
}

/** 原始 IndexedDB 补丁（仅测试准备数据用，不经过 UI）。 */
export async function patchSettingsRaw(
  page: Page,
  patch: Record<string, unknown>,
): Promise<void> {
  await page.evaluate(async (p) => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('evan_personal_app_db');
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('settings', 'readwrite');
        const store = tx.objectStore('settings');
        const get = store.get('app');
        get.onsuccess = () => {
          const row = get.result;
          if (!row) {
            resolve();
            return;
          }
          store.put({ ...row, ...p });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        get.onerror = () => reject(get.error);
      };
      open.onerror = () => reject(open.error);
    });
  }, patch);
}

/** 等待 toast 出现并包含文本。 */
export async function expectToast(page: Page, text: string): Promise<void> {
  await expect(page.locator('[data-test="toast-stack"]')).toContainText(text);
}
