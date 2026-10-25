import { test, expect, type Page } from '@playwright/test';
import { clearApp, gotoHash } from './helpers';

/** 在页面里画一张 3000×2000 的 PNG，取它的字节；用来验「选图 → 压缩」这条真实链路。 */
async function makePng(page: Page, width = 3000, height = 2000): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const dataUrl = await page.evaluate(
    ([w, h]) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no canvas');
      ctx.fillStyle = '#88aaff';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#223344';
      ctx.font = '40px sans-serif';
      ctx.fillText('错题', 20, 60);
      return canvas.toDataURL('image/png');
    },
    [width, height],
  );
  return { name: 'big.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1] ?? '', 'base64') };
}

test.beforeEach(async ({ page }) => {
  await clearApp(page);
  await gotoHash(page, 'mistakes');
  await expect(page.locator('[data-test="mistakes-view"]')).toBeVisible();
});

/** AC-76：错题本文字录入 —— 一题一卡、预设错误原因、跟着日期走、可编辑/掌握/删除。 */
test('AC-76 错题本文字录入与卡片操作', async ({ page }) => {
  // 空态引导
  await expect(page.locator('[data-test="mistakes-empty"]')).toBeVisible();
  await expect(page.locator('[data-test="mistakes-progress"]')).toContainText('共 0 条');

  // 新增一道错题
  await page.click('[data-test="add-mistake-btn"]');
  await expect(page.locator('[data-test="mistake-form"]')).toBeVisible();
  await page.fill('[data-test="mistake-form-subject"]', '数学');
  await page.fill('[data-test="mistake-form-question"]', '求 lim(x→0) sin x / x 时直接代入了');
  await page.fill('[data-test="mistake-form-correction"]', '先等价无穷小替换再取极限');
  await page.click('[data-test="mistake-reason-概念不清"]');
  await page.click('[data-test="mistake-reason-审题错误"]');
  await page.click('[data-test="mistake-difficulty-4"]');
  await page.fill('[data-test="mistake-form-note"]', '下次先看是否满足替换条件');
  await page.click('[data-test="mistake-form-save"]');

  const card = page.locator('[data-test="mistake-card"]').first();
  await expect(card).toBeVisible();
  await expect(card.locator('[data-test="mistake-subject"]')).toHaveText('数学');
  await expect(card.locator('[data-test="mistake-question"]')).toContainText('sin x / x');
  await expect(card.locator('[data-test="mistake-correction"]')).toContainText('等价无穷小');
  await expect(card.locator('[data-test="mistake-reasons"]')).toContainText('概念不清');
  await expect(card.locator('[data-test="mistake-reasons"]')).toContainText('审题错误');
  await expect(card.locator('[data-test="mistake-difficulty"]')).toHaveText('★★★★☆');
  await expect(page.locator('[data-test="mistakes-progress"]')).toContainText('共 1 条');

  // 刷新后仍在（落库了，不是内存态）
  await page.reload();
  await expect(page.locator('[data-test="mistake-card"]')).toHaveCount(1);
  await expect(page.locator('[data-test="mistake-question"]')).toContainText('sin x / x');

  // 编辑：改题干 + 难度
  await page.click('[data-test="mistake-edit"]');
  await page.fill('[data-test="mistake-form-question"]', '改：∫x²dx 忘了 +C');
  await page.click('[data-test="mistake-difficulty-2"]');
  await page.click('[data-test="mistake-form-save"]');
  await expect(page.locator('[data-test="mistake-question"]')).toContainText('忘了 +C');
  await expect(page.locator('[data-test="mistake-difficulty"]')).toHaveText('★★☆☆☆');

  // 标记已掌握 → 徽标 + 「未掌握」筛选里消失
  await page.click('[data-test="mistake-toggle-mastered"]');
  await expect(page.locator('[data-test="mistake-mastered-badge"]')).toBeVisible();
  await expect(page.locator('[data-test="mistakes-progress"]')).toContainText('已掌握 1 条');
  await page.click('[data-test="mistakes-filter-unmastered"]');
  await expect(page.locator('[data-test="mistake-card"]')).toHaveCount(0);
  await page.click('[data-test="mistakes-filter-all"]');
  await expect(page.locator('[data-test="mistake-card"]')).toHaveCount(1);

  // 跟着日期走：顶栏有日期控件，切到后一天是空的，回到今天又回来
  await expect(page.locator('[data-test="date-switch"]')).toBeVisible();
  await page.click('[data-test="next-day"]');
  await expect(page.locator('[data-test="mistakes-empty"]')).toBeVisible();
  await page.click('[data-test="go-today"]');
  await expect(page.locator('[data-test="mistake-card"]')).toHaveCount(1);

  // 删除 → 卡片消失，撤销后回来
  await page.click('[data-test="mistake-delete"]');
  await expect(page.locator('[data-test="mistake-card"]')).toHaveCount(0);
  await page.click('.toast-undo');
  await expect(page.locator('[data-test="mistake-card"]')).toHaveCount(1);
});

/** AC-78：错题照片录入 —— 选图后压到最长边 1400 的 JPEG dataURL，进卡片、进库、可删。 */
test('AC-78 错题照片录入与压缩', async ({ page }) => {
  await gotoHash(page, 'mistakes');
  await expect(page.locator('[data-test="mistakes-view"]')).toBeVisible();

  await page.click('[data-test="add-mistake-btn"]');
  await page.fill('[data-test="mistake-form-question"]', '这道题有照片');
  await page.setInputFiles('[data-test="image-file-question"]', await makePng(page));
  await expect(page.locator('[data-test="image-count"]').first()).toHaveText('1 / 4 张');
  await expect(page.locator('[data-test="image-thumb"]')).toHaveCount(1);
  await page.setInputFiles('[data-test="image-file-correction"]', await makePng(page, 1200, 2400));
  await page.click('[data-test="mistake-form-save"]');

  // 卡片出现两张缩略图（题目 + 订正）
  await expect(page.locator('[data-test="mistake-photo-question"]')).toHaveCount(1);
  await expect(page.locator('[data-test="mistake-photo-correction"]')).toHaveCount(1);

  // 落库的是 JPEG dataURL，最长边压到 1400
  const question = page.locator('[data-test="mistake-photo-question"] img').first();
  const src = (await question.getAttribute('src')) ?? '';
  expect(src.startsWith('data:image/jpeg;base64,')).toBe(true);
  expect(src).not.toContain('data:image/png');
  const questionSize = await question.evaluate((el) => ({
    w: (el as HTMLImageElement).naturalWidth,
    h: (el as HTMLImageElement).naturalHeight,
  }));
  expect(questionSize.w).toBe(1400);
  expect(questionSize.h).toBe(933);

  const correction = page.locator('[data-test="mistake-photo-correction"] img').first();
  const correctionSize = await correction.evaluate((el) => ({
    w: (el as HTMLImageElement).naturalWidth,
    h: (el as HTMLImageElement).naturalHeight,
  }));
  expect(correctionSize.h).toBe(1400);
  expect(correctionSize.w).toBe(700);

  // 刷新后照片还在（进的是 IndexedDB，不是内存）
  await page.reload();
  await expect(page.locator('[data-test="mistake-photo-question"]')).toHaveCount(1);
  await expect(page.locator('[data-test="mistake-photo-correction"]')).toHaveCount(1);

  // 编辑里删掉题目那张：卡片上只剩订正那张
  await page.click('[data-test="mistake-edit"]');
  await expect(page.locator('[data-test="image-thumb"]')).toHaveCount(2);
  await page.locator('[data-test="image-remove-question"]').first().click();
  await expect(page.locator('[data-test="image-count"]').first()).toHaveText('0 / 4 张');
  await page.click('[data-test="mistake-form-save"]');
  await expect(page.locator('[data-test="mistake-photo-question"]')).toHaveCount(0);
  await expect(page.locator('[data-test="mistake-photo-correction"]')).toHaveCount(1);
});
