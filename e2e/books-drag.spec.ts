import { test, expect, type Page } from '@playwright/test';
import { clearApp, gotoHash, logicalToday, seedBook } from './helpers';

/**
 * M4 书架拖动 e2e（AC-62 / AC-63）。
 *
 * 说明：Playwright 原生 dragAndDrop 对 HTML5 DnD 的模拟在 Chromium 上不稳定（有时不触发 drop），
 * 因此这里用「DataTransfer 事件注入」手动派发 dragstart / dragover / drop / dragend，
 * 与组件真实监听的同一套 DOM 事件对齐；稳定性由连续多次全量运行验证（见交付报告）。
 */

/** 按书名精确匹配一张书卡。 */
function cardByTitle(page: Page, title: string) {
  return page.locator('[data-test="book-card"]', {
    has: page.locator('[data-test="book-title"]', { hasText: title }),
  });
}

/** 用 DataTransfer 注入的方式把 source 卡片拖到 target 元素上（HTML5 DnD）。 */
async function html5Drag(page: Page, sourceTitle: string, target: ReturnType<Page['locator']>): Promise<void> {
  const source = cardByTitle(page, sourceTitle);
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent('dragstart', { dataTransfer });
  await target.dispatchEvent('dragover', { dataTransfer });
  await target.dispatchEvent('drop', { dataTransfer });
  await source.dispatchEvent('dragend', { dataTransfer });
  await dataTransfer.dispose();
}

/** 直接读 books 表全部记录（绕过 UI，只用于断言 finish_date / sort_index）。 */
function readBooks(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(
    () =>
      new Promise<Array<Record<string, unknown>>>((resolve) => {
        const open = indexedDB.open('evan_personal_app_db');
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction('books', 'readonly').objectStore('books').getAll();
          req.onsuccess = () => resolve(req.result as Array<Record<string, unknown>>);
          req.onerror = () => resolve([]);
        };
        open.onerror = () => resolve([]);
      }),
  );
}

function readStudyRecords(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(
    () =>
      new Promise<Array<Record<string, unknown>>>((resolve) => {
        const open = indexedDB.open('evan_personal_app_db');
        open.onsuccess = () => {
          const db = open.result;
          const req = db.transaction('study_records', 'readonly').objectStore('study_records').getAll();
          req.onsuccess = () => resolve(req.result as Array<Record<string, unknown>>);
          req.onerror = () => resolve([]);
        };
        open.onerror = () => resolve([]);
      }),
  );
}

async function bookByTitle(page: Page, title: string): Promise<Record<string, unknown> | undefined> {
  return (await readBooks(page)).find((row) => row['title'] === title);
}

test.beforeEach(async ({ page }) => {
  await clearApp(page);
});

/** AC-62：拖到读完 → current_page=总页数、finish_date=逻辑今天、study_records 条数不变（无 page_update）。 */
test('AC-62 拖到读完：当前页设为总页数、finish_date 今天、不生成学习记录', async ({ page }) => {
  await seedBook(page, { title: 'AC62读完', totalPages: 300, status: 'reading' });
  const before = await readStudyRecords(page);
  expect(before).toHaveLength(0);

  await html5Drag(page, 'AC62读完', page.locator('[data-test="column-done"]'));

  await expect(page.locator('[data-test="column-done"] [data-test="book-title"]')).toHaveText('AC62读完');
  await expect(page.locator('[data-test="column-reading"] [data-test="book-card"]')).toHaveCount(0);
  await expect(page.locator('[data-test="column-done"] [data-test="book-pages"]')).toHaveText('300/300 页（100%）');

  const book = await bookByTitle(page, 'AC62读完');
  expect(book?.['status']).toBe('done');
  expect(book?.['current_page']).toBe(300);
  expect(book?.['finish_date']).toBe(logicalToday());

  const records = await readStudyRecords(page);
  expect(records).toHaveLength(0); // 关键：拖动到读完绝不生成 page_update 学习记录
  expect(records.some((row) => row['source'] === 'page_update')).toBe(false);
});

/** AC-62：从读完拖出 → finish_date=null、current_page 保持不动。 */
test('AC-62 从读完拖出：finish_date 清空、current_page 不变', async ({ page }) => {
  await seedBook(page, { title: 'AC62拖出', totalPages: 200, status: 'reading' });
  // 先拖到读完（当前页=总页数）
  await html5Drag(page, 'AC62拖出', page.locator('[data-test="column-done"]'));
  await expect(page.locator('[data-test="column-done"] [data-test="book-title"]')).toHaveText('AC62拖出');
  expect((await bookByTitle(page, 'AC62拖出'))?.['current_page']).toBe(200);

  // 再拖回想读
  await html5Drag(page, 'AC62拖出', page.locator('[data-test="column-want"]'));
  await expect(page.locator('[data-test="column-want"] [data-test="book-title"]')).toHaveText('AC62拖出');
  await expect(page.locator('[data-test="column-want"] [data-test="book-pages"]')).toHaveText('200/200 页（100%）');

  const book = await bookByTitle(page, 'AC62拖出');
  expect(book?.['status']).toBe('want');
  expect(book?.['finish_date']).toBeNull();
  expect(book?.['current_page']).toBe(200); // 拖出不改页码
  expect(await readStudyRecords(page)).toHaveLength(0);
});

/** AC-62：拖到在读 → start_date 补逻辑今天。 */
test('AC-62 拖到在读：start_date 补逻辑今天', async ({ page }) => {
  await seedBook(page, { title: 'AC62在读', totalPages: 120, status: 'want' });
  expect((await bookByTitle(page, 'AC62在读'))?.['start_date']).toBeNull();

  await html5Drag(page, 'AC62在读', page.locator('[data-test="column-reading"]'));
  await expect(page.locator('[data-test="column-reading"] [data-test="book-title"]')).toHaveText('AC62在读');
  expect((await bookByTitle(page, 'AC62在读'))?.['start_date']).toBe(logicalToday());
});

/** AC-63：同栏拖动调整顺序，刷新后顺序保持（sort_index 持久化）。 */
test('AC-63 同栏拖动顺序刷新后保持', async ({ page }) => {
  await seedBook(page, { title: 'AC63甲', totalPages: 100, status: 'want' });
  await seedBook(page, { title: 'AC63乙', totalPages: 100, status: 'want' });
  await seedBook(page, { title: 'AC63丙', totalPages: 100, status: 'want' });

  const wantTitles = (): Promise<string[]> =>
    page.locator('[data-test="column-want"] [data-test="book-title"]').allTextContents();
  expect(await wantTitles()).toEqual(['AC63甲', 'AC63乙', 'AC63丙']);

  // 把“丙”拖到“甲”卡片上（插到甲之前）
  await html5Drag(page, 'AC63丙', cardByTitle(page, 'AC63甲'));
  await expect
    .poll(async () => (await wantTitles())[0], { timeout: 3000 })
    .toBe('AC63丙');

  // 刷新后顺序保持
  await page.reload();
  await expect(page.locator('[data-test="books-view"]')).toBeVisible();
  expect(await wantTitles()).toEqual(['AC63丙', 'AC63甲', 'AC63乙']);

  // sort_index 已持久化为 10、20、30
  const books = (await readBooks(page))
    .filter((row) => row['status'] === 'want')
    .sort((a, b) => Number(a['sort_index']) - Number(b['sort_index']));
  expect(books.map((row) => row['title'])).toEqual(['AC63丙', 'AC63甲', 'AC63乙']);
  expect(books.map((row) => row['sort_index'])).toEqual([10, 20, 30]);
});
