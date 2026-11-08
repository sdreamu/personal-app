import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { addPlan, seedBook, gotoHash } from './helpers';

const output = resolve('docs/ui-implementation/glass/screenshots');
const routes = ['home', 'plan', 'study/books', 'study/subjects', 'study/timer', 'mistakes', 'life/diet', 'life/workout', 'life/play', 'review', 'settings'];
mkdirSync(output, { recursive: true });

for (const theme of ['light', 'dark'] as const) {
  test(`通透主题 ${theme}：真实页面、窄屏和桌面无横向溢出`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/#/home');
    await expect(page.locator('[data-test="home-view"]')).toBeVisible();
    await seedBook(page, { title: '原子习惯：一个很长的书名用于验证小屏排版', totalPages: 320 });
    await addPlan(page, { title: '整理今天的学习记录与运动计划，检查长文本换行' });
    await gotoHash(page, 'settings');
    await page.locator(`[data-test="theme-${theme}"]`).click();
    for (const [width, height] of [[320,812], [390,844], [430,932], [1440,900]]) {
      await page.setViewportSize({ width, height });
      for (const route of routes) {
        await gotoHash(page, route);
        await expect(page.locator('.content .page')).toBeVisible();
        await page.mouse.move(0, 0);
        await expect.poll(() => page.locator('.content').evaluate(el => el.scrollWidth - el.clientWidth), { message: `${route} at ${width}` }).toBeLessThanOrEqual(1);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        if (width === 390 || route === 'home') {
          await page.screenshot({ path: resolve(output, `${route.replaceAll('/','-')}-${theme}-${width}.png`) });
        }
        if (route === 'study/books' && width === 390) {
          await page.locator('[data-test="book-title"]').first().click();
          await expect(page.locator('.content .page')).toBeVisible();
          await page.screenshot({ path: resolve(output, `book-detail-${theme}.png`) });
        }
      }
    }
  });
}

test('手机快捷新增、焦点、保存和运动入口保持可用', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/home');
  const add = page.locator('[data-test="quick-add"]');
  await expect(add).toBeVisible();
  expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).not.toBe('none');
  await add.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('[data-test="plan-form-title"]').fill('新界面真实保存验证');
  await page.screenshot({ path: resolve(output, 'plan-sheet.png') });
  await page.locator('[data-test="plan-form-save"]').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-test="todo-title"]').filter({ hasText: '新界面真实保存验证' })).toBeVisible();
  await gotoHash(page, 'home');
  await expect(page.locator('[data-test="tile-workout"]')).toBeVisible();
  await expect(page.locator('[data-test="tile-water"]')).toHaveCount(0);
  await page.locator('[data-test="tile-workout"]').click();
  await expect(page).toHaveURL(/life\/workout/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await add.evaluate(el => getComputedStyle(el).animationDuration)).toBe('0s');
});

test('状态反馈：空态、加载、错误与恢复入口', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/study/timer');
  await expect(page.locator('[data-test="target-empty"]')).toBeVisible();
  await expect(page.locator('[data-test="empty-add-target"]')).toBeVisible();
  await gotoHash(page, 'review');
  await expect(page.locator('[data-test="review-metrics"]')).toBeVisible();
  // 在隔离浏览器中控制业务状态，验证既有状态分支在新材质下仍可见。
  await page.evaluate(async () => {
    const modulePath = '/src/stores/review.ts';
    const { useReviewStore } = await import(/* @vite-ignore */ modulePath);
    useReviewStore().$patch({ loading: true, metrics: null });
  });
  await expect(page.locator('[data-test="review-loading"]')).toBeVisible();
  await page.screenshot({ path: resolve(output, 'loading.png') });
  await gotoHash(page, 'home');
  await page.evaluate(async () => {
    const modulePath = '/src/stores/saveStatus.ts';
    const { useSaveStatusStore } = await import(/* @vite-ignore */ modulePath);
    useSaveStatusStore().fail();
  });
  await expect(page.locator('[data-test="error-bar"]')).toBeVisible();
  await expect(page.locator('[data-test="error-export"]')).toBeVisible();
  await page.screenshot({ path: resolve(output, 'error.png') });
});
