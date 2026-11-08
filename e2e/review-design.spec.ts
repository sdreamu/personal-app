import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { clearApp, gotoHash, logicalToday, addDays } from './helpers';

for (const theme of ['light','dark']) {
  test(`复盘 ${theme}：开放布局、历史详情、响应式与可访问操作`, async ({ page }) => {
    await clearApp(page);
    const today = logicalToday();
    await page.evaluate(async ({today}) => {
      const modulePath = '/src/db/index.ts';
      const {createRecord} = await import(/* @vite-ignore */ modulePath);
      for (let i=0; i<3; i++) {
        const day = new Date(today+'T12:00:00'); day.setDate(day.getDate()-i);
        const date = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
        await createRecord('reviews', {date, rating:i===1?null:4, mood:i===1?null:4, energy:i===0?3:null,
          good:'完成计划后，留出时间整理思路。', improve:'睡前少看手机，给明天留一点精力。', mit:'读完一章书',
          record_worthy:'傍晚散步，看见了一场很美的日落。', day_summary:i===0?'把平凡的一天过得充实，也给自己留了放松的时间。':null, mit_added_to_plan:false});
      }
    }, {today});
    await gotoHash(page,'settings');
    await page.locator(`[data-test="theme-${theme}"]`).click();
    await gotoHash(page,'review');
    const history = page.locator('[data-test="review-history"]');
    await expect(page.locator('[data-test="review-self"]')).toBeVisible();
    await expect(page.locator('.page-date-controls')).toHaveCount(0);
    await expect(page.locator('[data-test="review-confirm"]')).toHaveCount(0);
    await expect(page.locator('[data-test="energy-description"]')).toHaveCount(0);
    await expect(page.locator('[data-test="history-range-stats"]')).toHaveCount(0);
    await expect(history.locator('[data-test="history-item"]')).toHaveCount(3);
    for (const [width,height] of [[320,720],[390,844],[699,668],[1440,900]]) {
      await page.setViewportSize({width,height});
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.locator('[data-test="review-view"]').evaluate(el => el.scrollIntoView({block:'start'}));
      await expect.poll(() => page.locator('.content').evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
      expect(await page.locator('[data-test="review-metrics"]').evaluate(el=>getComputedStyle(el).borderTopWidth)).toBe('0px');
      await page.screenshot({path:resolve(`docs/ui-implementation/glass/screenshots/review-${theme}-${width}-summary.png`)});
      const star = page.locator('[data-test="rating-star"]').nth(3);
      await star.scrollIntoViewIfNeeded(); await page.keyboard.press('Tab'); await star.focus();
      const size = (await star.boundingBox())!;
      expect(size.width).toBeGreaterThanOrEqual(44); expect(size.height).toBeGreaterThanOrEqual(44);
      expect(await star.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
      await page.locator('[data-test="review-self"]').evaluate(el=>el.scrollIntoView({block:'start'}));
      await page.screenshot({path:resolve(`docs/ui-implementation/glass/screenshots/review-${theme}-${width}-self.png`)});
      await history.evaluate(el=>el.scrollIntoView({block:'start'}));
      await expect(history.locator('[data-test="history-row"]').first()).toHaveAttribute('aria-expanded','false');
      await page.screenshot({path:resolve(`docs/ui-implementation/glass/screenshots/review-${theme}-${width}-history.png`)});
      expect(await page.locator('[data-test="review-trend"]').evaluate(el=>parseFloat(getComputedStyle(el).marginTop))).toBeGreaterThanOrEqual(32);
      await history.locator('[data-test="history-row"]').first().click();
      await expect(history.locator('[data-test="history-detail-record-worthy"]')).toContainText('日落');
      await expect(page.locator('[data-test="review-date"]')).toHaveText(today);
      await history.locator('[data-test="history-row"]').first().click();
    }
    await page.setViewportSize({width:390,height:844});
    await history.locator('summary').click();
    await expect(history.locator('[data-test="history-start"]')).toBeVisible();
    await history.locator('[data-test="history-start"]').fill(addDays(today,-1));
    await history.locator('[data-test="history-end"]').fill(addDays(today,-1));
    await expect(history.locator('[data-test="history-item"]')).toHaveCount(1);
    await page.screenshot({path:resolve(`docs/ui-implementation/glass/screenshots/review-${theme}-custom-range.png`)});
  });
}

test('复盘加载、空态、保存失败恢复与立即刷新', async ({page}) => {
  await clearApp(page); await page.setViewportSize({width:390,height:844}); await gotoHash(page,'review');
  const view = page.locator('[data-test="review-view"]');
  await expect(view.locator('[data-test="review-self"]')).toBeVisible();
  await view.evaluate(el=>{ const state=(el as any).__vueParentComponent.setupState; state.ready=false; });
  await expect(page.locator('[data-test="review-loading"]')).toBeVisible();
  await page.screenshot({path:resolve('docs/ui-implementation/glass/screenshots/review-loading.png')});
  await view.evaluate(el=>{ const state=(el as any).__vueParentComponent.setupState; state.loadError=true; });
  await expect(page.locator('[data-test="review-load-error"]')).toBeVisible();
  await page.screenshot({path:resolve('docs/ui-implementation/glass/screenshots/review-load-error.png')});
  await page.getByRole('button',{name:'重新加载'}).click();
  await expect(page.locator('[data-test="review-self"]')).toBeVisible();
  await page.locator('[data-test="review-history"]').scrollIntoViewIfNeeded();
  await expect(page.locator('[data-test="history-empty"]')).toBeVisible();
  await expect(page.locator('[data-test="trend-empty"]')).toContainText('生成曲线');
  await page.screenshot({path:resolve('docs/ui-implementation/glass/screenshots/review-empty.png')});
  await view.evaluate(el=>{
    const store=(el as any).__vueParentComponent.setupState.reviewStore;
    const original=store.upsertReview.bind(store); let fails=true;
    store.upsertReview=async (...args:any[])=>{ if(fails) throw new Error('模拟存储写入失败'); return original(...args); };
    (window as any).__reviewRecover=()=>{ fails=false; };
  });
  await page.fill('[data-test="review-good"]','保存失败仍保留这段内容');
  await expect(page.locator('[data-test="review-save-retry"]')).toBeVisible();
  await page.locator('[data-test="review-self"]').evaluate(el=>el.scrollIntoView({block:'start'}));
  await page.screenshot({path:resolve('docs/ui-implementation/glass/screenshots/review-save-error.png')});
  await page.locator('a[href="#/home"]:visible').click();
  await expect(page).toHaveURL(/review$/);
  await page.evaluate(()=>{ (window as any).__reviewRecover(); });
  await page.locator('[data-test="review-save-retry"]').click();
  await expect(page.locator('[data-test="review-save-status"]')).toHaveText('已自动保存');
  await page.fill('[data-test="review-day-summary"]','刷新前尚未等到防抖的内容');
  await page.reload();
  await expect(page.locator('[data-test="review-day-summary"]')).toHaveValue('刷新前尚未等到防抖的内容');
  await expect(page.locator('[data-test="review-good"]')).toHaveValue('保存失败仍保留这段内容');
});
