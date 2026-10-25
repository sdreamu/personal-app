import { test, expect } from '@playwright/test';
import { clearApp, gotoHash, seedBook } from './helpers';

test.beforeEach(async ({ page }) => {
  await clearApp(page);
});

/** AC-26：添加一本总页数 300 的书，状态选“在读”——出现在在读栏，卡片显示色块封面和 0/300。 */
test('AC-26 新增在读书籍出现在在读栏', async ({ page }) => {
  await seedBook(page, { title: 'AC26书', totalPages: 300, status: 'reading' });
  const card = page.locator('[data-test="column-reading"] [data-test="book-card"]');
  await expect(card).toHaveCount(1);
  await expect(card.locator('[data-test="book-title"]')).toHaveText('AC26书');
  await expect(card.locator('[data-test="book-pages"]')).toHaveText('0/300 页（0%）');
  const coverStyle = await card.locator('[data-test="book-cover"]').getAttribute('style');
  expect(coverStyle).toContain('background');
});

/** AC-27：更新页码到 120——进度显示 40%，首页阅读卡片同步，当天复盘阅读页数增加 120 页。 */
test('AC-27 更新页码40%并同步首页与复盘', async ({ page }) => {
  await seedBook(page, { title: 'AC27书', totalPages: 300, status: 'reading' });
  await page.click('[data-test="book-card"]');
  await page.fill('[data-test="page-input"]', '120');
  await page.click('[data-test="page-save"]');
  await expect(page.locator('[data-test="detail-pages"]')).toHaveText('120/300 页（40%）');

  await gotoHash(page, 'home');
  await expect(page.locator('[data-test="reading-progress"]')).toHaveText('120 / 300 页');

  await gotoHash(page, 'review');
  await expect(page.locator('[data-test="metric-pages-value"]')).toHaveText('120 页');
});

/** AC-28：把页码更新为 300——提示“标记为读完？”，确认后移到读完栏。 */
test('AC-28 读到总页数提示并移入读完', async ({ page }) => {
  await seedBook(page, { title: 'AC28书', totalPages: 300, status: 'reading' });
  await page.click('[data-test="book-card"]');
  await page.fill('[data-test="page-input"]', '300');
  await page.click('[data-test="page-save"]');
  await expect(page.locator('[data-test="done-confirm-yes"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: '标记为读完？' })).toBeVisible();
  await page.click('[data-test="done-confirm-yes"]');

  await gotoHash(page, 'study/books');
  await expect(page.locator('[data-test="column-done"] [data-test="book-title"]')).toHaveText('AC28书');
  await expect(page.locator('[data-test="column-reading"] [data-test="book-card"]')).toHaveCount(0);
});

/** AC-29：新增 3 条不同页码的摘录（顺序打乱）——按页码从小到大显示。 */
test('AC-29 摘录按页码排序', async ({ page }) => {
  await seedBook(page, { title: 'AC29书', totalPages: 200, status: 'reading' });
  await page.click('[data-test="book-card"]');

  const addExcerpt = async (pageNum: string, content: string) => {
    await page.click('[data-test="excerpt-add"]');
    await page.fill('[data-test="excerpt-form-page"]', pageNum);
    await page.fill('[data-test="excerpt-form-content"]', content);
    await page.click('[data-test="excerpt-form-save"]');
    await expect(page.locator('[data-test="excerpt-form"]')).toHaveCount(0);
  };

  await addExcerpt('50', '第五十页摘录');
  await addExcerpt('30', '第三十页摘录');
  await addExcerpt('10', '第十页摘录');

  const pages = await page.locator('[data-test="excerpt-page"]').allTextContents();
  expect(pages).toEqual(['第 10 页', '第 30 页', '第 50 页']);
});

/** AC-30：书详情点“开始阅读计时”跳计时器预选该书；“手动补记”成功补记阅读时长。 */
test('AC-30 开始阅读计时预选与手动补记', async ({ page }) => {
  await seedBook(page, { title: 'AC30书', totalPages: 200, status: 'reading' });
  await page.click('[data-test="book-card"]');

  await page.click('[data-test="start-timer"]');
  await expect(page).toHaveURL(/type=book/);
  await expect(page.locator('label.target-option.selected')).toContainText('AC30书');

  await page.goBack();
  await page.click('[data-test="manual-open"]');
  await page.fill('[data-test="manual-form-minutes"]', '30');
  await page.fill('[data-test="manual-form-endpage"]', '20');
  await page.fill('[data-test="manual-form-note"]', 'AC30收获');
  await page.click('[data-test="manual-form-save"]');
  await expect(page.locator('[data-test="manual-form"]')).toHaveCount(0);

  await gotoHash(page, 'review');
  await expect(page.locator('[data-test="metric-study-value"]')).toContainText('00:30:00');
});

/** AC-69：书架卡片上直接改当前页（PRD §5.2 允许「书架或书详情页」二选一）——进度同步、复盘页数增加。 */
test('AC-69 书架卡片直接改页码', async ({ page }) => {
  await seedBook(page, { title: 'AC69书', totalPages: 200, status: 'reading' });

  const card = page.locator('[data-test="column-reading"] [data-test="book-card"]');
  await expect(card).toHaveCount(1);
  await expect(card.locator('[data-test="book-pages"]')).toHaveText('0/200 页（0%）');

  await card.locator('[data-test="book-page-input"]').fill('50');
  await card.locator('[data-test="book-page-input"]').press('Enter');
  await expect(card.locator('[data-test="book-pages"]')).toHaveText('50/200 页（25%）');

  // 改页码生成 page_update 学习记录 → 复盘页的阅读页数跟着涨
  await gotoHash(page, 'review');
  await expect(page.locator('[data-test="metric-pages-value"]')).toHaveText('50 页');

  // 超过总页数的输入被拒绝，页码保持不变
  await gotoHash(page, 'study/books');
  const input = page.locator('[data-test="column-reading"] [data-test="book-page-input"]');
  await input.fill('999');
  await input.press('Enter');
  await expect(page.locator('[data-test="column-reading"] [data-test="book-pages"]')).toHaveText('50/200 页（25%）');
});
