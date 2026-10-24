import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRecord, getRecord, resetDbForTests, type Book } from '@/db';
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

function makeBook(status: 'want' | 'reading' | 'done', title: string, currentPage = 0, totalPages = 300): Promise<Book> {
  return createRecord('books', {
    title,
    author: null,
    total_pages: totalPages,
    current_page: currentPage,
    status,
    color: '#4a6cf7',
    start_date: null,
    finish_date: null,
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
    { timeout: 3000, interval: 20 },
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
});
