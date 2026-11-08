import { test, expect, type Page } from '@playwright/test';
import { clearApp, gotoHash } from './helpers';

/** 直接读 IndexedDB 里的 settings.theme（不经 UI，避免读到内存快照）。 */
async function readThemeSetting(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    return new Promise<string | null>((resolve, reject) => {
      const open = indexedDB.open('evan_personal_app_db');
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('settings', 'readonly');
        const get = tx.objectStore('settings').get('app');
        get.onsuccess = () => {
          const row = get.result as { theme?: string } | undefined;
          resolve(row?.theme ?? null);
        };
        get.onerror = () => reject(get.error);
      };
      open.onerror = () => reject(open.error);
    });
  });
}

test.beforeEach(async ({ page }) => {
  await clearApp(page);
});

/**
 * AC-68 跟随系统主题：
 * 系统深色 + 选「跟随系统」→ data-theme=dark；系统切浅色 → light；
 * 再选「浅色」→ 即使系统深色也仍是 light；刷新后选择保持（settings.theme === 'system'）。
 */
test('AC-68 跟随系统主题：三选一、系统切换即时生效、手选不被系统覆盖、刷新保持', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await gotoHash(page, 'settings');
  await expect(page.locator('[data-test="theme-system"]')).toHaveText('跟随系统');

  // 1) 跟随系统 + 系统深色 → dark（写到 data-theme 的是解析后的结果）
  await page.click('[data-test="theme-system"]');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('[data-test="theme-system"]')).toHaveClass(/on/);
  expect(await readThemeSetting(page)).toBe('system');

  // 2) 系统切浅色 → 立即变成 light（不刷新页面）
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  // 3) 手选「浅色」→ 即使系统是深色也仍是 light
  await page.click('[data-test="theme-light"]');
  await expect(page.locator('[data-test="theme-light"]')).toHaveClass(/on/);
  expect(await readThemeSetting(page)).toBe('light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  // 4) 回到「跟随系统」（此时系统深色）→ dark；刷新后选择保持
  await page.click('[data-test="theme-system"]');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await readThemeSetting(page)).toBe('system');

  await page.reload();
  await expect(page.locator('[data-test="theme-system"]')).toHaveClass(/on/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await readThemeSetting(page)).toBe('system');

  // 5) 系统再切浅色 → 刷新后依然跟随（监听器没有因为刷新叠加或丢失）
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

/** AC-68 附属：index.html 的 theme-color 与 UI_GUIDE 的 --accent 一致（#0065D1）。 */
test('AC-68 theme-color 与 UI_GUIDE 主色一致', async ({ page }) => {
  await gotoHash(page, 'settings');
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0065D1');
});


/**
 * AC-82 顶栏一键切白天/夜间：不进口设置页也能切，刷新后保持，写进的是 settings.theme。
 */
test('设置齿轮取代顶栏主题按钮，设置中切换主题且刷新保持', async ({ page }) => {
  await gotoHash(page, 'home');
  await expect(page.locator('.topbar [data-test="theme-toggle"]')).toHaveCount(0);
  await page.locator('[data-test="settings-link"]').click();
  await expect(page.locator('[data-test="settings-page"]')).toBeVisible();
  await page.locator('[data-test="theme-dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect.poll(async () => readThemeSetting(page)).toBe('dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.locator('[data-test="theme-light"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect.poll(async () => readThemeSetting(page)).toBe('light');
});
