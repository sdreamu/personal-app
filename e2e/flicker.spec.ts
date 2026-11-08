import { test, expect } from '@playwright/test';
import { clearApp, gotoHash, seedBook } from './helpers';

test.use({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });
test.beforeEach(async ({ page }) => { await clearApp(page); });

test('进入日程时没有空白帧，七天网格从首帧就占据完整高度', async ({ page }) => {
  await page.evaluate(() => {
    const frames: { visible: boolean; days: number | null }[] = [];
    (window as any).__frames = frames;
    (window as any).__sampling = true;
    function sample() {
      if (!(window as any).__sampling) return;
      const pages = [...document.querySelectorAll('.content > .page')];
      const grid = document.querySelector('.week-grid');
      frames.push({ visible: pages.some(el => Number(getComputedStyle(el).opacity) > .05), days: grid ? grid.children.length : null });
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  await page.locator('.bottom-nav a[href="#/plan"]').tap();
  await expect(page.locator('[data-test="plan-view"]')).toBeVisible();
  await expect(page.locator('.week-grid')).toHaveAttribute('aria-busy', 'false');
  const frames = await page.evaluate(() => { (window as any).__sampling = false; return (window as any).__frames as { visible: boolean; days: number | null }[]; });
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.filter(frame => !frame.visible)).toEqual([]);
  expect(frames.filter(frame => frame.days !== null && frame.days !== 7)).toEqual([]);
});

test('饮食页加减水不替换餐食内容', async ({ page }) => {
  await gotoHash(page, 'life/diet');
  await expect(page.locator('[data-test="diet-empty"]')).toBeVisible();
  await page.evaluate(() => {
    const original = document.querySelector('[data-test="diet-empty"]')!;
    (window as any).__replaced = false;
    new MutationObserver(() => { if (!original.isConnected) (window as any).__replaced = true; })
      .observe(document.querySelector('[data-test="diet-view"]')!, { childList: true, subtree: true });
  });
  await page.locator('[data-test="water-plus"]').tap();
  await expect(page.locator('[data-test="water-total"]')).toHaveText('250 ml');
  await page.locator('[data-test="water-minus"]').tap();
  await expect(page.locator('[data-test="water-total"]')).toHaveText('0 ml');
  expect(await page.evaluate(() => (window as any).__replaced)).toBe(false);
});

test('点卡片内的加水按钮不会连带整张卡片位移', async ({ page, context }) => {
  const card = page.locator('[data-test="water-card"]');
  const button = card.locator('[data-test="water-plus"]');
  await expect(card).toHaveCSS('-webkit-tap-highlight-color', 'rgba(0, 0, 0, 0)');
  await button.scrollIntoViewIfNeeded();
  const box = (await button.boundingBox())!;
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
  await expect.poll(() => card.evaluate(el => getComputedStyle(el).transform)).toBe('none');
  // 连续采样，覆盖按钮 90ms 过渡过程中的祖先样式。
  const transforms = await card.evaluate(async el => {
    const values: string[] = [];
    for (let i = 0; i < 12; i++) {
      await new Promise(requestAnimationFrame);
      values.push(getComputedStyle(el).transform);
    }
    return values;
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
  expect(transforms.every(value => value === 'none')).toBe(true);
  await expect(card.locator('[data-test="water-text"]')).toContainText('250 ml');
});

test('保存状态切换不推动顶栏设置按钮', async ({ page }) => {
  await gotoHash(page, 'life/diet');
  await expect(page.locator('[data-test="diet-empty"]')).toBeVisible();
  await page.evaluate(() => {
    const settings = document.querySelector('[data-test="settings-link"]')!;
    const x = settings.getBoundingClientRect().x;
    const samples: number[] = [];
    (window as any).__headerShifts = samples;
    new MutationObserver(() => samples.push(Math.abs(settings.getBoundingClientRect().x - x)))
      .observe(document.querySelector('[data-test="save-status"]')!, { childList: true, subtree: true, characterData: true, attributes: true });
  });
  await page.locator('[data-test="water-plus"]').tap();
  await expect(page.locator('[data-test="water-total"]')).toHaveText('250 ml');
  const shifts = await page.evaluate(() => (window as any).__headerShifts as number[]);
  expect(shifts.length).toBeGreaterThan(0);
  expect(Math.max(...shifts)).toBeLessThanOrEqual(1);
});

test('书籍详情保存页码不卸载详情正文', async ({ page }) => {
  await seedBook(page, { title: '详情闪动回归', totalPages: 300 });
  await page.locator('[data-test="book-title"]').tap();
  await expect(page.locator('[data-test="detail-pages"]')).toHaveText('0/300 页（0%）');
  await page.evaluate(() => {
    const original = document.querySelector('[data-test="detail-title"]')!;
    (window as any).__detailReplaced = false;
    new MutationObserver(() => { if (!original.isConnected) (window as any).__detailReplaced = true; })
      .observe(document.querySelector('[data-test="detail-view"]')!, { childList: true, subtree: true });
  });
  await page.locator('[data-test="page-input"]').fill('30');
  await page.locator('[data-test="page-save"]').tap();
  await expect(page.locator('[data-test="detail-pages"]')).toHaveText('30/300 页（10%）');
  expect(await page.evaluate(() => (window as any).__detailReplaced)).toBe(false);
});

test('娱乐记录编辑保存不卸载已有列表', async ({ page }) => {
  await gotoHash(page, 'life/play');
  await page.locator('[data-test="open-form-btn"]').tap();
  await page.locator('[data-test="form-content"]').fill('闪动回归记录');
  await page.locator('[data-test="form-minutes"]').fill('15');
  await page.locator('[data-test="form-save"]').tap();
  await expect(page.locator('[data-test="play-record"]')).toContainText('15 分钟');
  await page.evaluate(() => {
    const original = document.querySelector('[data-test="record-list"]')!;
    (window as any).__listReplaced = false;
    new MutationObserver(() => { if (!original.isConnected) (window as any).__listReplaced = true; })
      .observe(document.querySelector('[data-test="play-record-list"]')!, { childList: true, subtree: true });
  });
  await page.locator('[data-test="edit-btn"]').tap();
  await page.locator('[data-test="form-minutes"]').fill('20');
  await page.locator('[data-test="form-save"]').tap();
  await expect(page.locator('[data-test="play-record"]')).toContainText('20 分钟');
  expect(await page.evaluate(() => (window as any).__listReplaced)).toBe(false);
});

test.describe('鼠标和触控笔的嵌套按钮反馈', () => {
  test.use({ isMobile: false, hasTouch: false });

  test('按下喝水按钮时仅按钮位移，卡片保持原位', async ({ page }) => {
    const card = page.locator('[data-test="water-card"]');
    const button = card.locator('[data-test="water-plus"]');
    await button.hover();
    await page.mouse.down();
    await expect.poll(() => button.evaluate(el => getComputedStyle(el).transform))
      .toBe('matrix(1, 0, 0, 1, 2, 2)');
    expect(await card.evaluate(el => getComputedStyle(el).transform)).toBe('none');
    await page.mouse.up();
    await expect(card.locator('[data-test="water-text"]')).toContainText('250 ml');
  });
});
