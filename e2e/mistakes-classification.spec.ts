import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { clearApp, gotoHash } from './helpers';

for (const theme of ['light', 'dark']) {
  test(`错题分类 ${theme}：新增、持久化、跨日期、筛选与响应式`, async ({ page }) => {
    await clearApp(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    await gotoHash(page, 'mistakes');
    await expect(page.locator('[data-test="date-switch"]')).toHaveCount(0);
    await expect(page.locator('[data-test="mistakes-subject-filter"] select')).toHaveCount(0);
    await page.locator('[data-test="add-mistake-subject"]').click();
    await page.locator('[data-test="category-subject"]').fill('数学');
    await page.locator('[data-test="category-point"]').fill('三角函数');
    await page.locator('[data-test="category-save"]').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('分类已保存', { exact: true })).toBeVisible();
    const subjects = page.locator('[data-test="mistakes-subject-filter"]');
    const points = page.locator('[data-test="mistakes-knowledge-filter"]');
    await expect(subjects.getByRole('button', { name: '数学', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-test="add-knowledge-point"]').click();
    await page.locator('[data-test="category-point"]').fill('导数');
    await page.locator('[data-test="category-save"]').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    await subjects.getByRole('button', { name: '数学', exact: true }).click();
    await points.getByRole('button', { name: '三角函数', exact: true }).click();
    await page.locator('[data-test="add-mistake-btn"]').click();
    await expect(page.locator('[data-test="mistake-form-subject"]').getByRole('button', { name: '数学', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-test="mistake-form-knowledge"]')).toHaveValue('三角函数');
    await expect(page.locator('[data-test="mistake-form"] input[type=date]')).toHaveCount(0);
    await page.locator('[data-test="mistake-form-question"]').fill('求三角函数的周期，先辨认自变量系数，再计算最小正周期。');
    await page.locator('[data-test="mistake-form-save"]').click();
    await expect(page.locator('[data-test="mistake-card"]')).toHaveCount(1);
    await expect(page.locator('[data-test="mistake-knowledge"]')).toHaveText('三角函数');
    await points.getByRole('button', { name: '导数', exact: true }).click();
    await expect(page.locator('[data-test="mistakes-empty"]')).toContainText('当前分类下没有错题');
    await points.getByRole('button', { name: '全部知识点', exact: true }).click();
    await gotoHash(page, 'plan');
    await page.locator('[data-test="next-day"]').click();
    await gotoHash(page, 'mistakes');
    await expect(page.locator('[data-test="mistake-card"]')).toHaveCount(1);
    await expect(page.locator('[data-test="viewing-banner"]')).toHaveCount(0);
    await subjects.getByRole('button', { name: '数学', exact: true }).click();
    for (const [width, height] of [[320,812],[390,844],[430,932],[614,547],[1440,900]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      await expect.poll(() => page.locator('.content').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      for (const chip of await page.locator('.filter-chip').all()) {
        expect((await chip.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await page.locator('.content').evaluate(el => { el.scrollTop = 0; });
      await page.screenshot({ path: resolve(`docs/ui-implementation/glass/screenshots/mistakes-refined-${theme}-${width}.png`) });
    }
    await subjects.getByRole('button', { name: '数学', exact: true }).focus();
    await expect(subjects.getByRole('button', { name: '数学', exact: true })).toBeFocused();
  });
}

test('错题分类状态：加载提示、空态、保存失败与原地重试', async ({ page }) => {
  await clearApp(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHash(page, 'mistakes');
  await expect(page.locator('[data-test="mistakes-empty"]')).toBeVisible();
  await page.screenshot({ path: resolve('docs/ui-implementation/glass/screenshots/mistakes-empty.png') });
  await page.evaluate(async () => {
    const modulePath = '/src/stores/mistakes.ts';
    const { useMistakesStore } = await import(/* @vite-ignore */ modulePath);
    useMistakesStore().$patch({ loading: true });
  });
  await expect(page.getByRole('status').filter({ hasText: '正在加载错题' })).toBeVisible();
  await page.screenshot({ path: resolve('docs/ui-implementation/glass/screenshots/mistakes-loading.png') });
  await page.evaluate(async () => {
    const modulePath = '/src/stores/mistakes.ts';
    const { useMistakesStore } = await import(/* @vite-ignore */ modulePath);
    useMistakesStore().$patch({ loading: false });
    const libraryPath = '/src/stores/library.ts';
    const { useLibraryStore } = await import(/* @vite-ignore */ libraryPath);
    const library = useLibraryStore();
    const original = library.createMistakeSubject;
    library.createMistakeSubject = async () => {
      library.createMistakeSubject = original;
      throw new Error('isolated test failure');
    };
  });
  await page.locator('[data-test="add-mistake-subject"]').click();
  await page.locator('[data-test="category-subject"]').fill('物理');
  await page.locator('[data-test="category-save"]').click();
  await expect(page.getByRole('alert')).toHaveText('保存分类失败，请重试');
  await expect(page.locator('[data-test="category-subject"]')).toHaveValue('物理');
  await page.screenshot({ path: resolve('docs/ui-implementation/glass/screenshots/mistakes-category-error.png') });
  await page.locator('[data-test="category-save"]').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-test="mistakes-subject-filter"]').getByRole('button', { name: '物理', exact: true })).toBeVisible();
});
