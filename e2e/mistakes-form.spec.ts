import { test, expect, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import { clearApp, gotoHash } from './helpers';

async function photo(page: Page) {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 800; canvas.height = 500;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f4f4f4'; ctx.fillRect(0,0,800,500);
    ctx.fillStyle = '#222'; ctx.font = '32px sans-serif';
    ctx.fillText('sin²x + cos²x = 1', 70, 160);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return { name: 'question.png', mimeType: 'image/png', buffer: Buffer.from(data!, 'base64') };
}

for (const theme of ['light','dark']) {
  test(`录题表单 ${theme}：选择科目、一体录入区、大按钮与开关`, async ({ page }) => {
    await clearApp(page);
    await gotoHash(page, 'settings');
    await page.locator(`[data-test="theme-${theme}"]`).click();
    await gotoHash(page, 'mistakes');
    await page.locator('[data-test="add-mistake-btn"]').click();
    await page.locator('[data-test="mistake-form-add-subject"]').click();
    await page.locator('[data-test="mistake-new-subject"]').fill('数学：函数与三角函数专题复习');
    await page.locator('[data-test="mistake-new-subject-save"]').click();
    const subject = page.locator('[data-test="mistake-form-subject"]').getByRole('button', { name: '数学：函数与三角函数专题复习', exact: true });
    await expect(subject).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-test="mistake-form-subject"] input')).toHaveCount(0);
    const question = page.locator('.image-composer').filter({ has: page.locator('[data-test="mistake-form-question"]') });
    const correction = page.locator('.image-composer').filter({ has: page.locator('[data-test="mistake-form-correction"]') });
    await expect(question.locator('[data-test="image-camera-question"]')).toHaveAttribute('capture','environment');
    await expect(question.locator('[data-test="image-file-question"]')).toHaveAttribute('multiple','');
    await expect(correction.locator('[data-test="image-camera-correction"]')).toHaveCount(1);
    await expect(correction.locator('[data-test="image-file-correction"]')).toHaveCount(1);
    const reason = page.locator('[data-test="mistake-reason-概念不清"]');
    await reason.click();
    await expect(reason).toHaveAttribute('aria-pressed','true');
    const toggle = page.getByRole('switch', { name: '已经掌握' });
    await toggle.focus(); await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-checked','true');
    expect(await toggle.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
    for (const [width,height] of [[320,812],[390,844],[614,547],[1440,900]]) {
      await page.setViewportSize({ width,height });
      const body = page.getByRole('dialog').locator('.modal-body');
      await expect.poll(() => body.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      await body.evaluate(el => { el.scrollTop = 0; });
      await page.screenshot({ path: resolve(`docs/ui-implementation/glass/screenshots/mistake-form-${theme}-${width}-top.png`) });
      await toggle.scrollIntoViewIfNeeded();
      expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect((await reason.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({ path: resolve(`docs/ui-implementation/glass/screenshots/mistake-form-${theme}-${width}-bottom.png`) });
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await toggle.locator('.switch-thumb').evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
  });
}

test('纯照片录题：失败重试、处理完成再保存、照片与选择状态刷新保留', async ({ page }) => {
  await clearApp(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoHash(page,'mistakes');
  await page.locator('[data-test="add-mistake-btn"]').click();
  const save = page.locator('[data-test="mistake-form-save"]');
  await save.click();
  await expect(page.getByRole('alert')).toContainText('添加一张照片');
  await page.locator('[data-test="image-file-question"]').setInputFiles({ name:'broken.png', mimeType:'image/png', buffer:Buffer.from('invalid image') });
  await expect(page.locator('[data-test="image-error-question"]')).toContainText('换一张再试');
  await page.screenshot({ path: resolve('docs/ui-implementation/glass/screenshots/mistake-form-photo-error.png') });
  await page.evaluate(() => {
    const original = window.createImageBitmap.bind(window);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    Object.defineProperty(window,'releaseTestPhoto',{ value: release, configurable:true });
    Object.defineProperty(window,'createImageBitmap',{ value:async (source:ImageBitmapSource) => { await gate; return original(source); }, configurable:true });
  });
  const image = await photo(page);
  await page.locator('[data-test="image-camera-question"]').setInputFiles(image);
  await expect(save).toBeDisabled();
  await expect(page.locator('[data-test="image-busy-question"]')).toBeVisible();
  await page.screenshot({ path: resolve('docs/ui-implementation/glass/screenshots/mistake-form-photo-loading.png') });
  await page.evaluate(() => (window as unknown as { releaseTestPhoto: () => void }).releaseTestPhoto());
  await expect(page.locator('[data-test="image-grid-question"] img')).toHaveCount(1);
  await page.locator('[data-test="image-file-correction"]').setInputFiles(image);
  await expect(page.locator('[data-test="image-grid-correction"] img')).toHaveCount(1);
  await page.locator('[data-test="mistake-reason-计算失误"]').click();
  await page.getByRole('switch', { name:'已经掌握' }).click();
  await save.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-test="mistake-photo-question"]')).toHaveCount(1);
  await expect(page.locator('[data-test="mistake-photo-correction"]')).toHaveCount(1);
  await expect(page.locator('[data-test="mistake-mastered-badge"]')).toBeVisible();
  await page.locator('[data-test="mistake-edit"]').click();
  await expect(page.locator('[data-test="mistake-form-question"]')).toHaveValue('');
  await expect(page.locator('[data-test="mistake-reason-计算失误"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('switch', { name:'已经掌握' })).toHaveAttribute('aria-checked','true');
  await page.locator('[data-test="image-remove-question"]').click();
  await save.click();
  await expect(page.locator('[data-test="mistake-photo-question"]')).toHaveCount(0);
  await expect(page.locator('[data-test="mistake-photo-correction"]')).toHaveCount(1);
});
