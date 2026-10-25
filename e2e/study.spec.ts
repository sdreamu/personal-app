import { test, expect } from '@playwright/test';
import { clearApp, gotoHash, seedBook, seedSubject, startStudyTimer, startPlayTimer, settleStudy, addDays, logicalToday } from './helpers';

test.beforeEach(async ({ page }) => {
  await clearApp(page);
});

/** AC-04：开始一个计时，等 1 分钟后刷新页面——计时继续显示，时间没有归零，也没有丢失。 */
test('AC-04 计时跨刷新不丢', async ({ page }) => {
  await page.clock.install({ time: new Date('2030-06-24T12:00:00') });
  await clearApp(page);
  await seedSubject(page, { name: 'AC04科目', goalMin: 60 });
  await startStudyTimer(page, 'AC04科目');
  await page.clock.fastForward(60 * 1000);
  await expect(page.locator('[data-test="clock-face"]')).toHaveText('00:01:00');
  await page.reload();
  await expect(page.locator('[data-test="pause-btn"]')).toBeVisible();
  await expect(page.locator('[data-test="clock-face"]')).toContainText('00:01:0');
});

/** AC-31：添加科目，周目标 6 小时，截止日期设在 30 天后——卡片显示 0/6h 和“还剩 30 天”。 */
test('AC-31 科目周目标与截止倒计时', async ({ page }) => {
  const deadline = addDays(logicalToday(), 30);
  await seedSubject(page, { name: 'AC31科目', goalMin: 360, deadline });
  const card = page.locator('[data-test="subject-card"]');
  await expect(card.locator('[data-test="subject-week"]')).toContainText('本周已学 0');
  await expect(card.locator('[data-test="subject-week"]')).toContainText('6h');
  await expect(card.locator('[data-test="subject-deadline"]')).toHaveText('还剩 30 天');
});

/** AC-32：手动补一条 1 小时的记录——周进度变为 1/6h，柱状图对应日期出现柱子。 */
test('AC-32 手动补记后周进度与柱状图更新', async ({ page }) => {
  await seedSubject(page, { name: 'AC32科目', goalMin: 360 });
  await page.locator('[data-test="subject-manual"]').click();
  await page.fill('[data-test="subject-manual-form-minutes"]', '60');
  await page.click('[data-test="subject-manual-form-save"]');
  await expect(page.locator('[data-test="subject-manual-form"]')).toHaveCount(0);

  await expect(page.locator('[data-test="subject-week"]')).toContainText('本周已学 1h');
  await expect(page.locator('[data-test="subject-chart"]')).toContainText('60');
});

/** AC-33：不选对象直接点开始——无法开始，提示先选择。 */
test('AC-33 未选对象无法开始计时', async ({ page }) => {
  await seedSubject(page, { name: 'AC33科目', goalMin: 60 });
  await gotoHash(page, 'study/timer');
  await page.click('[data-test="start-btn"]');
  await expect(page.locator('[data-test="toast-stack"]')).toContainText('请先选择对象');
  await expect(page.locator('[data-test="pause-btn"]')).toHaveCount(0);
});

/** AC-34：暂停 1 分钟再继续后结束——记录时长不含暂停的 1 分钟。 */
test('AC-34 暂停时间不计入有效时长', async ({ page }) => {
  await page.clock.install({ time: new Date('2030-06-25T12:00:00') });
  await clearApp(page);
  await seedSubject(page, { name: 'AC34科目', goalMin: 60 });
  await startStudyTimer(page, 'AC34科目');

  await page.clock.fastForward(60 * 1000);
  await page.click('[data-test="pause-btn"]');
  await page.clock.fastForward(60 * 1000);
  await page.click('[data-test="resume-btn"]');
  await page.clock.fastForward(120 * 1000);
  await page.click('[data-test="end-btn"]');

  await expect(page.locator('[data-test="settlement-modal"]')).toBeVisible();
  await expect(page.locator('[data-test="settle-duration"]')).toContainText('00:03:00');
  await expect(page.locator('[data-test="settle-duration"]')).not.toContainText('00:04:00');
  await settleStudy(page);
});

/** AC-35：计时 30 秒后结束——询问是否丢弃。 */
test('AC-35 不足1分钟询问丢弃', async ({ page }) => {
  await page.clock.install({ time: new Date('2030-06-26T12:00:00') });
  await clearApp(page);
  await seedSubject(page, { name: 'AC35科目', goalMin: 60 });
  await startStudyTimer(page, 'AC35科目');
  await page.clock.fastForward(30 * 1000);
  await page.click('[data-test="end-btn"]');
  await expect(page.locator('[data-test="short-confirm-text"]')).toContainText('计时不足 1 分钟');
  await page.click('[data-test="short-discard"]');
  await expect(page.locator('[data-test="settlement-overlay"]')).toHaveCount(0);
});

/** AC-36：阅读计时结束进入待结算弹窗，刷新页面——仍回到结算弹窗且时长不丢；保存后页码与阅读页数同步。 */
test('AC-36 待结算刷新恢复且保存更新页码', async ({ page }) => {
  await page.clock.install({ time: new Date('2030-06-27T12:00:00') });
  await clearApp(page);
  await seedBook(page, { title: 'AC36书', totalPages: 300, status: 'reading' });
  await page.click('[data-test="book-card"]');
  await page.fill('[data-test="page-input"]', '100');
  await page.click('[data-test="page-save"]');
  await expect(page.locator('[data-test="detail-pages"]')).toContainText('100/300');

  await page.click('[data-test="start-timer"]');
  await page.click('[data-test="start-btn"]');
  await page.clock.fastForward(2 * 60 * 1000);
  await page.click('[data-test="end-btn"]');
  await expect(page.locator('[data-test="settlement-modal"]')).toBeVisible();
  const before = await page.locator('[data-test="settle-duration"]').textContent();

  await page.reload();
  await expect(page.locator('[data-test="settlement-modal"]')).toBeVisible();
  await expect(page.locator('[data-test="settle-duration"]')).toHaveText(before ?? '');

  await page.fill('[data-test="settle-end-page"]', '150');
  await page.click('[data-test="settle-save"]');
  await expect(page.locator('[data-test="settlement-overlay"]')).toHaveCount(0);

  await gotoHash(page, 'study/books');
  await page.click('[data-test="book-card"]');
  await expect(page.locator('[data-test="detail-pages"]')).toContainText('150/300');
  await gotoHash(page, 'review');
  await expect(page.locator('[data-test="metric-pages-value"]')).toHaveText('150 页');
});

/** AC-37：计时进行中切换页面——顶栏胶囊持续显示并更新；点击回到对应计时页。 */
test('AC-37 计时胶囊跨页显示与跳转', async ({ page }) => {
  await page.clock.install({ time: new Date('2030-06-28T12:00:00') });
  await clearApp(page);
  await seedSubject(page, { name: 'AC37科目', goalMin: 60 });
  await startStudyTimer(page, 'AC37科目');

  await gotoHash(page, 'home');
  const capsule = page.locator('[data-test="timer-capsule"]');
  await expect(capsule).toContainText('AC37科目');
  await page.clock.fastForward(2 * 60 * 1000);
  await expect(capsule).toContainText('00:02:0');
  await capsule.click();
  await expect(page).toHaveURL(/#\/study\/timer$/);
});

/** AC-38：已有计时进行或待结算时尝试再开一个（含娱乐计时）——不允许，提示先处理当前计时。 */
test('AC-38 全局单计时守卫', async ({ page }) => {
  await seedSubject(page, { name: 'AC38科目', goalMin: 60 });
  await startStudyTimer(page, 'AC38科目');

  await gotoHash(page, 'life/play');
  await expect(page.locator('[data-test="other-timer-notice"]')).toContainText('当前有其他计时进行中');
  await gotoHash(page, 'study/timer');
  await page.click('[data-test="end-btn"]');
  await page.click('[data-test="short-discard"]');

  await startPlayTimer(page, 'AC38游戏');
  await gotoHash(page, 'study/timer');
  await expect(page.locator('[data-test="entertainment-notice"]')).toContainText('娱乐计时');
  await gotoHash(page, 'life/play');
  await page.click('[data-test="end-btn"]');
  await page.click('[data-test="short-discard"]');
});

/** AC-39：倒计时 1 分钟到点——标题闪烁并弹出提示，可选“再来一轮”或“结束”。 */
test('AC-39 倒计时1分钟到点提示与再来一轮', async ({ page }) => {
  await page.clock.install({ time: new Date('2030-06-29T12:00:00') });
  await clearApp(page);
  await seedSubject(page, { name: 'AC39科目', goalMin: 60 });
  await gotoHash(page, 'study/timer');
  await page.click('[data-test="type-subject"]');
  const label = page.locator('label.target-option').filter({ hasText: 'AC39科目' });
  await label.locator('input[data-test="target-option"]').check();
  await page.click('[data-test="mode-countdown"]');
  await page.fill('[data-test="countdown-minutes"]', '1');
  await page.click('[data-test="start-btn"]');
  await expect(page.locator('[data-test="clock-face"]')).toHaveText('00:01:00');

  await page.clock.fastForward(70 * 1000);
  await expect(page.locator('[data-test="countdown-finished-text"]')).toBeVisible();
  await expect(page.locator('[data-test="countdown-next-round"]')).toBeVisible();
  await expect(page.locator('[data-test="countdown-end"]')).toBeVisible();
  expect(['⏰ 时间到！', 'Evan的专属APP']).toContain(await page.title());

  await page.click('[data-test="countdown-next-round"]');
  await expect(page.locator('[data-test="settlement-overlay"]')).toHaveCount(0);
  await expect(page.locator('[data-test="pause-btn"]')).toBeVisible();

  // 清理本轮计时
  await page.click('[data-test="end-btn"]');
  await page.click('[data-test="short-discard"]');
});

/** AC-39 辅助：进行中的计时超过 12 小时——弹窗让用户选择继续/结束并手动修改/直接丢弃。 */
test('AC-39辅助 计时12小时恢复', async ({ page }) => {
  await page.clock.install({ time: new Date('2030-06-30T12:00:00') });
  await clearApp(page);
  await seedSubject(page, { name: 'AC39B科目', goalMin: 60 });
  await startStudyTimer(page, 'AC39B科目');

  await page.clock.fastForward(12 * 60 * 60 * 1000 + 60 * 1000);
  await expect(page.locator('[data-test="settlement-modal"]')).toContainText('计时恢复');
  await expect(page.locator('[data-test="recovery-continue"]')).toBeVisible();
  await expect(page.locator('[data-test="recovery-end-override"]')).toBeVisible();
  await expect(page.locator('[data-test="recovery-discard"]')).toBeVisible();

  await page.click('[data-test="recovery-continue"]');
  await expect(page.locator('[data-test="settlement-overlay"]')).toHaveCount(0);
  await expect(page.locator('[data-test="pause-btn"]')).toBeVisible();
});

/** AC-71：科目/书籍弹窗都能被 ✕ / 点遮罩 / Esc 关掉，且三种方式都不写库。 */
test('AC-71 弹窗三种关闭方式（✕ / 遮罩 / Esc）', async ({ page }) => {
  await gotoHash(page, 'study/subjects');

  // 1) ✕
  await page.click('[data-test="add-subject-btn"]');
  await expect(page.locator('[data-test="subject-form"]')).toBeVisible();
  await page.click('[data-test="modal-close"]');
  await expect(page.locator('[data-test="subject-form"]')).toHaveCount(0);

  // 2) 点遮罩空白处
  await page.click('[data-test="add-subject-btn"]');
  await expect(page.locator('[data-test="subject-form"]')).toBeVisible();
  await page.locator('.modal-overlay').click({ position: { x: 4, y: 4 } });
  await expect(page.locator('[data-test="subject-form"]')).toHaveCount(0);

  // 3) Esc
  await page.click('[data-test="add-subject-btn"]');
  await expect(page.locator('[data-test="subject-form"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-test="subject-form"]')).toHaveCount(0);

  // 三种方式都没写库
  await expect(page.locator('[data-test="subject-card"]')).toHaveCount(0);

  // 书籍页同理：✕ 与 Esc
  await gotoHash(page, 'study/books');
  await page.click('[data-test="add-book-btn"]');
  await expect(page.locator('[data-test="book-form"]')).toBeVisible();
  await page.click('[data-test="modal-close"]');
  await expect(page.locator('[data-test="book-form"]')).toHaveCount(0);
  await page.click('[data-test="add-book-btn"]');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-test="book-form"]')).toHaveCount(0);
  await expect(page.locator('[data-test="book-card"]')).toHaveCount(0);
});
