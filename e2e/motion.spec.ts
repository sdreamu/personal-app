import { test, expect } from '@playwright/test';
import { clearApp, addPlan, gotoHash } from './helpers';

test.beforeEach(async ({ page }) => {
  await clearApp(page);
});

/** AC-74：按下主按钮 = 位移 2px 且硬投影消失（粗野主义「按进去」）。 */
test('AC-74 按下手感：轻微缩放 + 透明反馈', async ({ page }) => {
  await gotoHash(page, 'plan');
  const button = page.locator('[data-test="rollover-btn"]');
  await expect(button).toBeVisible();

  await button.hover();
  expect(await button.evaluate((el) => getComputedStyle(el).boxShadow)).toBe('none');

  await page.mouse.down();
  // 过渡 90ms，用 poll 等它走完（不要固定 sleep）
  await expect
    .poll(() => button.evaluate((el) => getComputedStyle(el).transform), { timeout: 3000 })
    .toContain('matrix(0.985, 0, 0, 0.985, 0, 0)');
  expect(await button.evaluate((el) => getComputedStyle(el).boxShadow)).toBe('none');
  await page.mouse.up();

  // 松开恢复原位
  await expect
    .poll(() => button.evaluate((el) => getComputedStyle(el).transform), { timeout: 3000 })
    .not.toContain('matrix(0.985, 0, 0, 0.985, 0, 0)');
});

/** AC-74：勾选待办那一刻走「完成态」过渡（行上出现 done-flash），最终变灰划线。 */
test('AC-74 完成反馈：勾选瞬间 flash，最终变灰划线', async ({ page }) => {
  await addPlan(page, { title: 'AC74待办' });

  // 先挂一个 MutationObserver，捕捉 done-flash 这个短暂类名
  await page.evaluate(() => {
    (window as unknown as { __flashSeen: boolean }).__flashSeen = false;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target as HTMLElement;
        if (target.classList && target.classList.contains('done-flash')) {
          (window as unknown as { __flashSeen: boolean }).__flashSeen = true;
        }
      }
    });
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });

  const row = page.locator('[data-test="todo-item"]').filter({ hasText: 'AC74待办' });
  await row.locator('[data-test="todo-check"]').check();

  await expect.poll(() => page.evaluate(() => (window as unknown as { __flashSeen: boolean }).__flashSeen))
    .toBe(true);

  // 最终状态：灰化 + 划线
  await expect(row).toHaveClass(/done/);
  await expect(row.locator('[data-test="todo-title"]')).toHaveCSS('text-decoration-line', 'line-through');
});

test.describe('减少动态效果', () => {
  test.use({ reducedMotion: 'reduce' });

  /** AC-74：系统开启「减少动态效果」后，过渡/动画时长全部归零（状态切换仍即时生效）。 */
  test('AC-74 prefers-reduced-motion 下所有过渡归零', async ({ page }) => {
    await gotoHash(page, 'plan');
    const button = page.locator('[data-test="rollover-btn"]');
    await expect(button).toBeVisible();

    const durations = await button.evaluate((el) => {
      const style = getComputedStyle(el);
      return { transition: style.transitionDuration, animation: style.animationDuration };
    });
    expect(durations.transition).toBe('0s');
    expect(durations.animation).toBe('0s');

    // 勾选待办：状态照常切换，但没有过渡时长
    await addPlan(page, { title: 'AC74减少动效' });
    const row = page.locator('[data-test="todo-item"]').filter({ hasText: 'AC74减少动效' });
    expect(await row.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');
    await row.locator('[data-test="todo-check"]').check();
    await expect(row).toHaveClass(/done/);
  });
});
