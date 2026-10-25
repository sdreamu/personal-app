import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRecord, getRecord, listAlive, resetDbForTests, type Book } from '@/db';
import { useDateStore } from '@/stores/date';
import { TIMING_GUARD_MESSAGE, useLibraryStore } from '@/stores/library';
import { useTimerStore } from '@/stores/timer';
import { useToastStore } from '@/stores/toast';
import StudyBooksView from './StudyBooksView.vue';

const Stub = defineComponent({ template: '<div />' });

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/study/books', component: Stub },
      { path: '/study/books/:id', component: Stub },
      { path: '/:pathMatch(.*)*', redirect: '/study/books' },
    ],
  });
}

let pinia: Pinia;
let router: Router;
let library: ReturnType<typeof useLibraryStore>;

function makeBook(
  status: 'want' | 'reading' | 'done',
  title: string,
  currentPage = 0,
  totalPages = 300,
  /** 排序键：给了才写（不给就交给 loadBooks 的兜底按 created_at/id 排） */
  sortIndex?: number,
): Promise<Book> {
  return createRecord('books', {
    title,
    author: null,
    total_pages: totalPages,
    current_page: currentPage,
    status,
    color: '#4a6cf7',
    start_date: null,
    finish_date: null,
    ...(sortIndex === undefined ? {} : { sort_index: sortIndex }),
  });
}

function cardWith(wrapper: VueWrapper, title: string): DOMWrapper<Element> {
  const cards = wrapper.findAll('[data-test="book-card"]');
  const card = cards.find((row) => row.find('[data-test="book-title"]').text() === title);
  if (!card) throw new Error(`未找到卡片：${title}`);
  return card;
}

async function waitFor(check: () => boolean, label: string): Promise<void> {
  await vi.waitFor(
    () => {
      if (!check()) throw new Error(label);
    },
    // 全量并行时 fake-indexeddb + 挂载会慢，等到 8s（和全局 testTimeout 对齐），不放宽任何断言
    { timeout: 8000, interval: 20 },
  );
}

async function mountBooks(): Promise<VueWrapper> {
  const wrapper = mount(StudyBooksView, {
    global: { plugins: [pinia, router], stubs: { Teleport: true } },
  });
  await router.isReady();
  await waitFor(() => wrapper.find('[data-test="books-view"]').exists(), '书架页未渲染');
  return wrapper;
}

beforeEach(async () => {
  await resetDbForTests();
  pinia = createPinia();
  setActivePinia(pinia);
  router = makeRouter();
  library = useLibraryStore();
  useDateStore().setSelected('2026-06-01');
});

afterEach(() => {
  useTimerStore().dispose();
});

describe('书架页 #/study/books', () => {
  it('三栏（想读/在读/读完）各自展示对应状态的书，卡片含色块封面与进度', async () => {
    await makeBook('want', '想读的书', 0, 200);
    await makeBook('reading', '在读的书', 50, 200);
    await makeBook('done', '读完的书', 200, 200);
    const wrapper = await mountBooks();
    await waitFor(() => wrapper.findAll('[data-test="book-card"]').length === 3, '三张卡片未出现');

    const wantColumn = wrapper.find('[data-test="column-want"]');
    const readingColumn = wrapper.find('[data-test="column-reading"]');
    const doneColumn = wrapper.find('[data-test="column-done"]');
    expect(wantColumn.text()).toContain('想读的书');
    expect(wantColumn.text()).not.toContain('在读的书');
    expect(readingColumn.text()).toContain('在读的书');
    expect(doneColumn.text()).toContain('读完的书');

    const readingCard = cardWith(wrapper, '在读的书');
    expect(readingCard.find('[data-test="book-cover"]').attributes('style')).toContain('background');
    expect(readingCard.find('[data-test="book-pages"]').text()).toContain('50/200');
    expect(readingCard.find('[data-test="book-progress"]').attributes('style')).toContain('width: 25%');
  });

  it('新增弹窗：书名必填、保存后出现在对应栏；编辑弹窗修改生效', async () => {
    const wrapper = await mountBooks();
    await wrapper.find('[data-test="add-book-btn"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="book-form"]').exists()).toBe(true);

    // 空书名被拒：弹窗不关闭、库中无数据
    await wrapper.find('[data-test="book-form-title"]').setValue('   ');
    await wrapper.find('[data-test="book-form"]').trigger('submit');
    await flushPromises();
    expect(wrapper.find('[data-test="book-form"]').exists()).toBe(true);
    expect(await library.loadBooks()).toHaveLength(0);

    await wrapper.find('[data-test="book-form-title"]').setValue('深入理解计算机系统');
    await wrapper.find('[data-test="book-form-author"]').setValue('Randal');
    await wrapper.find('[data-test="book-form-total"]').setValue('800');
    await wrapper.find('[data-test="book-form-status"]').setValue('reading');
    await wrapper.find('[data-test="book-form"]').trigger('submit');
    await waitFor(() => wrapper.find('[data-test="book-form"]').exists() === false, '弹窗未关闭');
    await waitFor(
      () => wrapper.find('[data-test="column-reading"]').text().includes('深入理解计算机系统'),
      '新书未出现在在读栏',
    );
    const row = (await library.loadBooks()).find((book) => book.title === '深入理解计算机系统');
    expect(row?.total_pages).toBe(800);
    expect(row?.current_page).toBe(0);
    expect(row?.start_date).toBe('2026-06-01');

    // 编辑
    await cardWith(wrapper, '深入理解计算机系统').find('[data-test="book-edit"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-test="book-form-title"]').setValue('CSAPP 第三版');
    await wrapper.find('[data-test="book-form"]').trigger('submit');
    await waitFor(
      () => wrapper.find('[data-test="column-reading"]').text().includes('CSAPP 第三版'),
      '编辑后的书名未出现',
    );
    expect((await library.loadBooks()).some((book) => book.title === 'CSAPP 第三版')).toBe(true);
  });

  it('改状态：想读→在读→读完移动对应栏，读完写 finish_date', async () => {
    const book = await makeBook('want', '移动的书', 10, 100);
    const wrapper = await mountBooks();
    await waitFor(() => wrapper.findAll('[data-test="book-card"]').length === 1, '卡片未出现');

    await cardWith(wrapper, '移动的书').find('[data-test="book-status"]').setValue('reading');
    await waitFor(
      () => wrapper.find('[data-test="column-reading"]').text().includes('移动的书'),
      '未移到在读栏',
    );
    expect((await getRecord('books', book.id))?.start_date).toBe('2026-06-01');

    await cardWith(wrapper, '移动的书').find('[data-test="book-status"]').setValue('done');
    await waitFor(
      () => wrapper.find('[data-test="column-done"]').text().includes('移动的书'),
      '未移到读完栏',
    );
    const done = await getRecord('books', book.id);
    expect(done?.status).toBe('done');
    expect(done?.finish_date).toBe('2026-06-01');
  });

  it('删除：软删并出现撤销提示，点击撤销恢复', async () => {
    const book = await makeBook('want', '要删的书');
    const wrapper = await mountBooks();
    await waitFor(() => wrapper.findAll('[data-test="book-card"]').length === 1, '卡片未出现');

    await cardWith(wrapper, '要删的书').find('[data-test="book-delete"]').trigger('click');
    await waitFor(
      () => wrapper.findAll('[data-test="book-card"]').some((c) => c.text().includes('要删的书')) === false,
      '卡片未消失',
    );
    expect((await getRecord('books', book.id))?.deleted_at).not.toBeNull();

    const undo = useToastStore().items.find((item) => item.undo !== null);
    expect(undo?.message).toContain('已删除书籍');
    await undo?.undo?.action();
    await waitFor(
      () => wrapper.findAll('[data-test="book-card"]').some((c) => c.text().includes('要删的书')),
      '撤销后卡片未恢复',
    );
    expect((await getRecord('books', book.id))?.deleted_at).toBeNull();
  });

  it('计时中删除被阻止并提示“该项正在计时中，请先结束计时”', async () => {
    const book = await makeBook('reading', '计时中的书');
    const timerStore = useTimerStore();
    await timerStore.startTimer({ type: 'book', targetId: book.id, targetTitle: book.title, mode: 'stopwatch' });
    const wrapper = await mountBooks();
    await waitFor(() => wrapper.findAll('[data-test="book-card"]').length === 1, '卡片未出现');

    await cardWith(wrapper, '计时中的书').find('[data-test="book-delete"]').trigger('click');
    await flushPromises();

    expect(useToastStore().items.some((item) => item.message === TIMING_GUARD_MESSAGE)).toBe(true);
    expect((await getRecord('books', book.id))?.deleted_at).toBeNull();
    expect(wrapper.find('[data-test="column-reading"]').text()).toContain('计时中的书');
    await timerStore.discardTimer();
  });

  it('拖动跨栏：把想读书卡拖到读完栏 → 移到读完栏，current_page=总页数', async () => {
    const book = await makeBook('want', '拖动的书', 30, 100);
    const wrapper = await mountBooks();
    await waitFor(() => wrapper.findAll('[data-test="book-card"]').length === 1, '卡片未出现');

    await cardWith(wrapper, '拖动的书').trigger('dragstart');
    await wrapper.find('[data-test="column-done"]').trigger('drop');
    await waitFor(
      () => wrapper.find('[data-test="column-done"]').text().includes('拖动的书'),
      '未移到读完栏',
    );
    const done = await getRecord('books', book.id);
    expect(done?.status).toBe('done');
    expect(done?.current_page).toBe(100);
    expect(wrapper.find('[data-test="column-want"]').text()).not.toContain('拖动的书');
  });

  it('拖动同栏：把第二张卡拖到第一张之上 → 顺序按 sort_index 持久化', async () => {
    await library.createBook({ title: '甲', author: null, totalPages: 100, status: 'want' });
    await library.createBook({ title: '乙', author: null, totalPages: 100, status: 'want' });
    const wrapper = await mountBooks();
    await waitFor(() => wrapper.findAll('[data-test="book-card"]').length === 2, '两张卡片未出现');

    const titles = (): string[] =>
      wrapper.findAll('[data-test="column-want"] [data-test="book-title"]').map((row) => row.text());
    expect(titles()).toEqual(['甲', '乙']);

    // 把“乙”拖到“甲”卡片上（插到甲之前）
    await cardWith(wrapper, '乙').trigger('dragstart');
    await cardWith(wrapper, '甲').trigger('drop');
    await waitFor(() => titles()[0] === '乙', '顺序未变化');
    expect(titles()).toEqual(['乙', '甲']);

    // 持久化：重新加载 store 后顺序仍是 乙、甲（sort_index 10、20）
    const stored = (await library.loadBooks())
      .filter((book) => book.status === 'want')
      .sort((x, y) => (x.sort_index ?? 0) - (y.sort_index ?? 0));
    expect(stored.map((book) => book.title)).toEqual(['乙', '甲']);
    expect(stored.map((book) => book.sort_index)).toEqual([10, 20]);
  });

  it('空状态：三栏都显示引导与添加按钮', async () => {
    const wrapper = await mountBooks();
    await waitFor(() => wrapper.findAll('[data-test="empty-state"]').length === 3, '空状态未渲染');
    expect(wrapper.find('[data-test="column-want"]').text()).toContain('暂无想读的书');
    expect(wrapper.find('[data-test="column-reading"]').text()).toContain('暂无在读的书');
    expect(wrapper.find('[data-test="column-done"]').text()).toContain('暂无读完的书');
    await wrapper.find('[data-test="column-want"] [data-test="empty-action"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="book-form"]').exists()).toBe(true);
  });
  it('书架上直接改页码：落库 current_page，并生成一条 page_update 学习记录', async () => {
    await makeBook('reading', '能改页', 50, 200);
    const wrapper = await mountBooks();
    await waitFor(() => wrapper.findAll('[data-test="book-card"]').length === 1, '卡片未出现');
    const card = cardWith(wrapper, '能改页');

    const input = card.find('[data-test="book-page-input"]');
    expect(input.exists()).toBe(true);
    await input.setValue('80');
    await input.trigger('change');

    await waitFor(() => card.find('[data-test="book-pages"]').text().includes('80/200'), '页码未更新');
    expect((await getRecord('books', (await listAlive('books'))[0]!.id))?.current_page).toBe(80);
    const records = await listAlive('study_records');
    expect(records.some((row) => row.source === 'page_update' && row.pages_read === 30)).toBe(true);
  });

  it('页码超过总页数：不改库，给出错误提示', async () => {
    const book = await makeBook('reading', '超页书', 50, 200);
    const wrapper = await mountBooks();
    await waitFor(() => wrapper.findAll('[data-test="book-card"]').length === 1, '卡片未出现');
    const card = cardWith(wrapper, '超页书');

    const input = card.find('[data-test="book-page-input"]');
    await input.setValue('999');
    await input.trigger('change');
    await flushPromises();

    expect(useToastStore().items.some((t) => t.type === 'error')).toBe(true);
    expect((await getRecord('books', book.id))?.current_page).toBe(50);
    expect(card.find('[data-test="book-pages"]').text()).toContain('50/200');
  });
});

describe('书架页弹窗关闭：✕ / 遮罩（AC-73）', () => {
  it('新增书籍弹窗：点 ✕ 关闭、不写库', async () => {
    await makeBook('reading', 'SICP');
    const wrapper = await mountBooks();
    await waitFor(() => wrapper.findAll('[data-test="book-card"]').length === 1, '卡片未出现');

    await wrapper.find('[data-test="add-book-btn"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="book-form"]').exists()).toBe(true);

    await wrapper.find('[data-test="modal-close"]').trigger('click');
    await flushPromises();
    await waitFor(() => !wrapper.find('[data-test="book-form"]').exists(), '弹窗未关闭');
    expect((await listAlive('books')).length).toBe(1);
  });

  it('编辑书籍弹窗：点遮罩关闭、书名不变', async () => {
    const book = await makeBook('reading', 'SICP');
    const wrapper = await mountBooks();
    await waitFor(() => wrapper.findAll('[data-test="book-card"]').length === 1, '卡片未出现');

    await wrapper.find('[data-test="book-edit"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-test="book-form-title"]').setValue('改了一半');
    await wrapper.find('.modal-overlay').trigger('click');
    await flushPromises();
    await waitFor(() => !wrapper.find('[data-test="book-form"]').exists(), '弹窗未关闭');
    expect((await getRecord('books', book.id))?.title).toBe('SICP');
  });
});

describe('书架排序的键盘 / 触屏替代（P6-3）', () => {
  function titlesInColumn(wrapper: VueWrapper): string[] {
    return wrapper.findAll('[data-test="book-card"]').map((card) => card.find('[data-test="book-title"]').text());
  }

  it('卡片上有 ↑ / ↓ 按钮：点 ↑ 把第二本换到第一位，落库 sort_index 重排', async () => {
    await makeBook('want', '甲书', 0, 300, 10);
    await makeBook('want', '乙书', 0, 300, 20);
    await makeBook('want', '丙书', 0, 300, 30);
    const wrapper = await mountBooks();
    await waitFor(() => titlesInColumn(wrapper).length === 3, '三张卡片未渲染');
    expect(titlesInColumn(wrapper)).toEqual(['甲书', '乙书', '丙书']);

    const second = cardWith(wrapper, '乙书');
    await second.find('[data-test="book-move-up"]').trigger('click');
    await waitFor(() => titlesInColumn(wrapper)[0] === '乙书', '上移后顺序未更新');
    expect(titlesInColumn(wrapper)).toEqual(['乙书', '甲书', '丙书']);

    const rows = (await listAlive<Book>('books')).sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0));
    expect(rows.map((row) => row.title)).toEqual(['乙书', '甲书', '丙书']);
    expect(rows.map((row) => row.sort_index)).toEqual([10, 20, 30]);
  });

  it('列首没有 ↑、列尾没有 ↓（按钮 disabled），点不动也没副作用', async () => {
    await makeBook('want', '甲书', 0, 300, 10);
    await makeBook('want', '乙书', 0, 300, 20);
    const wrapper = await mountBooks();
    await waitFor(() => titlesInColumn(wrapper).length === 2, '卡片未渲染');

    const first = cardWith(wrapper, '甲书');
    const last = cardWith(wrapper, '乙书');
    expect((first.find('[data-test="book-move-up"]').element as HTMLButtonElement).disabled).toBe(true);
    expect((last.find('[data-test="book-move-down"]').element as HTMLButtonElement).disabled).toBe(true);
    expect((first.find('[data-test="book-move-down"]').element as HTMLButtonElement).disabled).toBe(false);

    // 键盘也能到：按钮是可聚焦的 button 且带 aria-label
    const up = first.find('[data-test="book-move-up"]');
    expect(up.attributes('aria-label')).toContain('上移一位');
    expect(up.attributes('title')).toBeTruthy();
  });

  it('只能在本栏内移动（不同状态列互不影响）', async () => {
    await makeBook('want', '想读书', 0, 300, 10);
    await makeBook('reading', '在读一', 0, 300, 10);
    await makeBook('reading', '在读二', 0, 300, 20);
    const wrapper = await mountBooks();
    await waitFor(() => titlesInColumn(wrapper).length === 3, '卡片未渲染');

    await cardWith(wrapper, '在读二').find('[data-test="book-move-up"]').trigger('click');
    // 列的顺序是 想读 → 在读 → 读完，所以只看整体列表的 2、3 位
    await waitFor(
      () => titlesInColumn(wrapper).slice(1).join(',') === '在读二,在读一',
      '在读列顺序未更新',
    );
    // 「想读」列那本没被带着走
    const rows = await listAlive<Book>('books');
    const wantRows = rows.filter((row) => row.status === 'want');
    expect(wantRows.map((row) => row.title)).toEqual(['想读书']);
    expect(wantRows[0]?.sort_index).toBe(10);
  });
});
