import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { clearApp, gotoHash, logicalToday, addDays } from './helpers';

for (const theme of ['light', 'dark']) {
  test(`首页七天 ${theme}：原地选择、最多三条、空态、完整清单与响应式`, async ({ page }) => {
    await clearApp(page);
    const today = logicalToday();
    const tomorrow = addDays(today, 1);
    await page.evaluate(async ({ today, tomorrow }) => {
      const modulePath = '/src/db/index.ts';
      const { createRecord } = await import(/* @vite-ignore */ modulePath);
      for (let i = 0; i < 10; i++) await createRecord('plans', {
        title: i < 8 ? (i === 1 ? '阅读与整理本周学习笔记，这是用于验证窄屏长标题换行和预览长度的安排' : '今天的安排 ' + (i + 1)) : '明天的安排 ' + (i - 7),
        date: i < 8 ? today : tomorrow,
        start_min: i === 1 ? 300 : null, end_min: i === 1 ? 360 : null,
        category_key:'study', category_name:'学习', target_type:null, target_id:null, target_title:null,
        done: i === 0 || i === 9, done_at: i === 0 || i === 9 ? Date.now() : null,
        rollover_from_date:null, is_rolled_over:false,
      });
    }, { today, tomorrow });
    await gotoHash(page,'settings');
    await page.locator(`[data-test="theme-${theme}"]`).click();
    await gotoHash(page,'home');
    const seven = page.locator('[data-test="home-seven-days"]');
    await expect(seven.locator('[data-test="seven-preview-item"]')).toHaveCount(3);
    await expect(seven.locator('.preview-remaining')).toHaveText('还有 5 项');
    for (const [width,height] of [[320,812],[390,844],[614,547],[1440,900]]) {
      await page.setViewportSize({ width,height });
      await seven.scrollIntoViewIfNeeded();
      await expect.poll(() => page.locator('.content').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      const date = seven.locator(`[data-test="seven-day-${today}"]`);
      expect((await date.boundingBox())!.width).toBeGreaterThanOrEqual(44);
      await page.keyboard.press('Tab');
      await date.focus();
      expect(await date.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
      await seven.screenshot({ path:resolve(`docs/ui-implementation/glass/screenshots/home-seven-${theme}-${width}.png`) });
    }
    await seven.locator(`[data-test="seven-day-${tomorrow}"]`).click();
    await expect(page).toHaveURL(/home$/);
    await expect(seven.locator('[data-test="seven-preview-item"]')).toHaveCount(2);
    await expect(seven.locator('.preview-row.done')).toHaveCount(1);
    await expect(page.locator('[data-test="viewing-banner"]')).toHaveCount(0);
    await seven.locator(`[data-test="seven-day-${addDays(today, 2)}"]`).click();
    await expect(seven.locator('[data-test="seven-empty"]')).toHaveText('这一天还没有安排');
    await expect(seven.locator('[data-test="seven-preview-item"]')).toHaveCount(0);
    await seven.locator(`[data-test="seven-day-${today}"]`).click();
    await page.setViewportSize({ width:390, height:844 });
    await seven.locator('[data-test="seven-view-all"]').evaluate(el => el.scrollIntoView({ block:'center' }));
    await seven.locator('[data-test="seven-view-all"]').click();
    await expect(page).toHaveURL(/plan\?view=list$/);
    await expect(page.locator('[data-test="list-view"]')).toBeVisible();
    await expect(page.locator('[data-test="plan-list-row"]')).toHaveCount(8);
    await page.locator('[data-test="plan-view-day"]').click();
    await page.reload();
    await expect(page.locator('[data-test="day-view"]')).toBeVisible();
  });
}

test('首页七天的加载、空态、单日失败与恢复', async ({ page }) => {
  await clearApp(page);
  await page.setViewportSize({ width:390,height:844 });
  const seven = page.locator('[data-test="home-seven-days"]');
  await expect(seven.locator('[data-test="seven-empty"]')).toBeVisible();
  await seven.screenshot({ path:resolve('docs/ui-implementation/glass/screenshots/home-seven-empty.png') });
  // 隔离测试实例的显示状态；失败后的重试调用真实数据库查询。
  await seven.evaluate(el => { (el as any).__vueParentComponent.setupState.loading = true; });
  await expect(seven.getByRole('status')).toHaveText('正在加载安排…');
  await seven.screenshot({ path:resolve('docs/ui-implementation/glass/screenshots/home-seven-loading.png') });
  await seven.evaluate(el => {
    const state = (el as any).__vueParentComponent.setupState;
    state.days.find((day: {date:string}) => day.date === state.selectedDate).failed = true;
    state.loading = false;
  });
  await expect(seven.getByRole('alert')).toContainText('未能加载');
  await seven.screenshot({ path:resolve('docs/ui-implementation/glass/screenshots/home-seven-error.png') });
  await seven.getByRole('button',{ name:'重试', exact:true }).click();
  await expect(seven.locator('[data-test="seven-empty"]')).toBeVisible();
});
