import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { addPlan, gotoHash } from './helpers';

for (const theme of ['light', 'dark']) {
  test(`日程开放布局 ${theme}：日期圆角、今日柔和高亮、移动端无快捷键提示`, async ({ page }) => {
    await page.goto('/#/settings');
    await page.locator(`[data-test="theme-${theme}"]`).click();
    await addPlan(page, { title: '整理本周学习记录与运动计划，检查长文字的完整显示' });
    await expect(page.locator('[data-test="schedule-week"] .day.today .day-count')).toHaveText('1 件');
    await gotoHash(page, 'home');
    await expect(page.locator('[data-test="home-view"]')).toBeVisible();
    for (const [width, height] of [[320,812], [390,844], [614,547], [1440,900]]) {
      await page.setViewportSize({ width, height });
      await gotoHash(page, 'plan');
      const header = page.locator('[data-test="plan-header"]');
      const week = page.locator('[data-test="schedule-week"]');
      await expect(week).toBeVisible();
      await expect(week.locator('.week-grid')).toHaveAttribute('aria-busy', 'false');
      await expect(week.locator('.day.today .day-count')).toHaveText('1 件');
      expect((await header.boundingBox())!.y).toBeLessThan((await week.boundingBox())!.y);
      await expect(header).toHaveCSS('box-shadow', 'none');
      await expect(week).toHaveCSS('border-top-width', '0px');
      const today = week.locator('.day.today');
      expect(await today.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(await today.evaluate(el => {
        const probe = document.createElement('span'); probe.style.background = 'var(--accent-soft)'; el.append(probe);
        const color = getComputedStyle(probe).backgroundColor; probe.remove(); return color;
      }));
      expect(await page.locator('[data-test="date-label"]').evaluate(el => parseFloat(getComputedStyle(el).borderRadius))).toBeGreaterThan(0);
      await expect.poll(() => page.locator('.content').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      if (width <= 768) await expect(page.locator('.keyboard-hint')).toBeHidden();
      else await expect(page.locator('.keyboard-hint')).toBeVisible();
      await page.mouse.move(0,0);
      await page.locator('.content').evaluate(el => { el.scrollTop = 0; });
      await page.screenshot({ path: resolve(`docs/ui-implementation/glass/screenshots/plan-refined-${theme}-${width}.png`) });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-test="date-label"]').click();
    await expect(page.getByRole('dialog').locator('.keyboard-hint')).toBeHidden();
    await page.locator('[data-test="modal-close"]').click();
    await page.locator('[data-test="schedule-week"] .day.today').click();
    await expect(page.locator('[data-test="plan-view-day"]')).toHaveClass(/on/);
    await gotoHash(page, 'study/timer');
    await expect(page.locator('.keyboard-hint')).toBeHidden();
  });
}
