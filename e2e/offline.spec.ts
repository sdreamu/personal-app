import { test, expect } from '@playwright/test';
import { clearApp } from './helpers';

test.beforeEach(async ({ page }) => {
  // 先装路由拦截，再打开应用：除 127.0.0.1/localhost 之外的请求全部记录并中止。
  const external: string[] = [];
  (page as any).__externalRequests = external;
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
        external.push(request.url());
        await route.abort();
        return;
      }
    }
    await route.continue();
  });
  await clearApp(page);
});

/** AC-10：断开网络使用全部功能——没有任何外部请求（dev 服务器资源除外）。 */
test('AC-10 离线使用零外部请求', async ({ page }) => {
  const external = (page as any).__externalRequests as string[];

  const navs: Array<{ label: string; test: string }> = [
    { label: '今天', test: 'home-view' },
    { label: '日程', test: 'plan-view' },
    { label: '读书', test: 'books-view' },
    { label: '科目', test: 'subjects-view' },
    { label: '计时器', test: 'study-timer-view' },
    { label: '饮食', test: 'diet-view' },
    { label: '健身', test: 'workout-view' },
    { label: '娱乐', test: 'play-page' },
    { label: '复盘', test: 'review-view' },
    { label: '设置', test: 'settings-page' },
  ];

  for (const nav of navs) {
    await page.locator('.side-nav a.nav-link', { hasText: nav.label }).first().click();
    await expect(page.locator('[data-test="' + nav.test + '"]')).toBeVisible();
  }

  // 再走几个真实操作：新增计划、添加书籍、喝水、打开计时器
  await page.locator('.side-nav a.nav-link', { hasText: '日程' }).first().click();
  await page.click('[data-test="add-plan-btn"]');
  await page.fill('[data-test="plan-form-title"]', 'AC10计划');
  await page.click('[data-test="plan-form-save"]');
  await expect(page.locator('[data-test="plan-form"]')).toHaveCount(0);

  await page.locator('.side-nav a.nav-link', { hasText: '读书' }).first().click();
  await page.click('[data-test="add-book-btn"]');
  await page.fill('[data-test="book-form-title"]', 'AC10书');
  await page.locator('[data-test="book-form-status"]').selectOption('reading');
  await page.click('[data-test="book-form-save"]');
  await expect(page.locator('[data-test="book-form"]')).toHaveCount(0);

  await page.locator('.side-nav a.nav-link', { hasText: '饮食' }).first().click();
  await page.locator('[data-test="water-tracker"] [data-test="water-plus"]').click();
  await expect(page.locator('[data-test="water-total"]')).toHaveText('250 ml');

  expect(external).toEqual([]);
});
