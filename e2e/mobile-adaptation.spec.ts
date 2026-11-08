import { test, expect } from '@playwright/test';
import { clearApp, gotoHash, seedBook } from './helpers';

test.use({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => { await clearApp(page); });

for (const width of [320, 360, 390, 768]) {
  test(`手机 ${width}px：主页面不溢出、设置可达、书卡操作不被裁切`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const title = '一本用来验证安卓小屏长标题和按钮完整显示的书籍ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    await seedBook(page, { title, author: '作者名字也可以非常长ABCDEFGHIJKLMNOPQRSTUVWXYZ', status: 'reading' });
    const card = page.locator('[data-test="column-reading"] [data-test="book-card"]');
    await expect(card).toHaveAttribute('draggable', 'false');
    expect(await card.evaluate(el => getComputedStyle(el).userSelect)).toBe('none');
    expect(await card.locator('input').evaluate(el => getComputedStyle(el).userSelect)).toBe('text');
    for (const selector of ['book-status', 'book-edit', 'book-delete', 'book-page-input']) {
      const control = card.locator(`[data-test="${selector}"]`);
      await control.scrollIntoViewIfNeeded();
      const rect = await control.boundingBox();
      const bounds = await card.boundingBox();
      expect(rect!.x).toBeGreaterThanOrEqual(bounds!.x);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
      expect(rect!.height).toBeGreaterThanOrEqual(44);
      expect(rect!.y + rect!.height).toBeLessThanOrEqual((await page.locator('.bottom-nav').boundingBox())!.y);
    }
    await page.locator('[data-test="settings-link"]').tap();
    await expect(page.locator('[data-test="settings-page"]')).toBeVisible();
    for (const path of ['home', 'plan', 'study/books', 'study/subjects', 'study/timer', 'life/diet', 'life/workout', 'life/play', 'review', 'settings']) {
      await gotoHash(page, path);
      await expect(page.locator('.page')).toBeVisible();
      const overflow = await page.locator('.content').evaluate(el => ({ scroll: el.scrollWidth, width: el.clientWidth }));
      expect(overflow.scroll, path).toBeLessThanOrEqual(overflow.width + 1);
      await expect(page.locator('.topbar [data-test="date-switch"]')).toHaveCount(0);
      await expect(page.locator('.topbar [data-test="theme-toggle"]')).toHaveCount(0);
      await expect(page.locator('[data-test="settings-link"]')).toBeVisible();
    }
    await page.screenshot({ path: `test-results/mobile-${width}-settings.png` });
  });
}

test('触摸手柄排序持久化，取消手势不改顺序，普通触摸能滚动', async ({ page, context }) => {
  await seedBook(page, { title: '第一本', status: 'reading' });
  await seedBook(page, { title: '第二本', status: 'reading' });
  const titles = page.locator('[data-test="column-reading"] [data-test="book-title"]');
  const before = await titles.allTextContents();
  await page.locator('[data-test="sort-books"]').tap();
  const cards = page.locator('[data-test="column-reading"] [data-test="book-card"]');
  const handle = cards.nth(1).locator('[data-test="sort-handle"]');
  await handle.scrollIntoViewIfNeeded();
  const start = (await handle.boundingBox())!;
  const target = (await cards.nth(0).boundingBox())!;
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start.x + 20, y: start.y + 20 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: target.x + 30, y: target.y + 80 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(titles).toHaveText([...before].reverse());
  await page.reload();
  await expect(titles).toHaveText([...before].reverse());
  await page.locator('[data-test="sort-books"]').tap();
  await handle.dispatchEvent('pointerdown', { button: 0, pointerId: 9, clientX: 30, clientY: 250 });
  await page.dispatchEvent('body', 'pointercancel', { pointerId: 9 });
  await expect(titles).toHaveText([...before].reverse());
  await page.locator('[data-test="sort-books"]').tap();
  await page.setViewportSize({ width: 390, height: 600 });
  expect(await page.locator('.content').evaluate(el => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0);
  await page.locator('.content').evaluate(el => { el.scrollTop = 0; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 220, y: 480 }] });
  for (let y = 430; y >= 180; y -= 50) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 220, y }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.locator('.content').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await cdp.detach();
});

test('精力圆形选择、保存后单点曲线和主题设置重启后仍保留', async ({ page }) => {
  await gotoHash(page, 'review');
  const energy = page.locator('[data-test="energy-bar"]').nth(3);
  await energy.tap();
  await expect(energy).toHaveAttribute('aria-pressed', 'true');
  const size = (await energy.boundingBox())!;
  expect(size.width).toBe(size.height);
  expect(await energy.evaluate(el => getComputedStyle(el).borderRadius)).toBe('50%');
  await expect(page.locator('[data-test="review-save-status"]')).toHaveText('已自动保存');
  await expect(page.locator('[data-test="trend-point-energy"]')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('[data-test="energy-bar"]').nth(3)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-test="trend-point-energy"]')).toHaveCount(1);
  await page.locator('[data-test="review-trend"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/mobile-review-energy.png' });
  await page.locator('[data-test="settings-link"]').tap();
  await page.locator('[data-test="theme-dark"]').tap();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('短视口表单仍可保存，长书名与大字号不挤掉操作', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 420 });
  await seedBook(page, { title: '在小屏和大字体下也应该完整显示并且可以更新进度的长书名', status: 'reading' });
  await page.addStyleTag({ content: '.book-title, .book-author, .book-ops button, .pick-label { font-size: 22px !important; }' });
  const card = page.locator('[data-test="column-reading"] [data-test="book-card"]');
  await card.locator('[data-test="book-page-input"]').fill('25');
  await card.locator('[data-test="book-page-input"]').press('Enter');
  await expect(card.locator('[data-test="book-pages"]')).toContainText('25/300');
  await card.locator('[data-test="book-edit"]').tap();
  await page.locator('[data-test="book-form-title"]').fill('修改后的书名');
  await page.locator('[data-test="book-form-save"]').tap();
  await expect(card.locator('[data-test="book-title"]')).toHaveText('修改后的书名');
  expect(await page.locator('.content').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile-books-short-viewport.png' });
});
