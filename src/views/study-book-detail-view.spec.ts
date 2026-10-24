import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRecord, getRecord, listAlive, resetDbForTests, type Book } from '@/db';
import { useDateStore } from '@/stores/date';
import { useLibraryStore } from '@/stores/library';
import StudyBookDetailView from './StudyBookDetailView.vue';

const Stub = defineComponent({ template: '<div />' });

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/study/books', component: Stub },
      { path: '/study/books/:id', component: Stub },
      { path: '/study/timer', component: Stub },
      { path: '/:pathMatch(.*)*', redirect: '/study/books' },
    ],
  });
}

let pinia: Pinia;
let router: Router;

function makeBook(currentPage = 0, totalPages = 300, status: 'want' | 'reading' | 'done' = 'reading'): Promise<Book> {
  return createRecord('books', {
    title: 'SICP',
    author: null,
    total_pages: totalPages,
    current_page: currentPage,
    status,
    color: '#4a6cf7',
    start_date: null,
    finish_date: null,
  });
}

async function makeStudyRecord(targetId: string, durationSec: number): Promise<void> {
  await createRecord('study_records', {
    target_type: 'book',
    target_id: targetId,
    target_title: 'SICP',
    start_at: Date.now(),
    end_at: Date.now(),
    duration_sec: durationSec,
    note: null,
    start_page: null,
    end_page: null,
    pages_read: null,
    source: 'manual',
    date: '2026-06-01',
  });
}

async function waitFor(check: () => boolean, label: string): Promise<void> {
  await vi.waitFor(
    () => {
      if (!check()) throw new Error(label);
    },
    { timeout: 3000, interval: 20 },
  );
}

async function mountDetail(bookId: string): Promise<VueWrapper> {
  await router.push(`/study/books/${bookId}`);
  const wrapper = mount(StudyBookDetailView, {
    global: { plugins: [pinia, router], stubs: { Teleport: true } },
  });
  await router.isReady();
  await waitFor(
    () => wrapper.find('[data-test="detail-title"]').exists() || wrapper.text().includes('未找到这本书'),
    '书详情未渲染',
  );
  return wrapper;
}

beforeEach(async () => {
  await resetDbForTests();
  pinia = createPinia();
  setActivePinia(pinia);
  router = makeRouter();
  useDateStore().setSelected('2026-06-01');
});

afterEach(() => {
  useLibraryStore().$dispose();
});

describe('书详情页 #/study/books/:id', () => {
  it('更新当前页（回车）：新>旧生成 page_update 记录并更新书页码与进度', async () => {
    const book = await makeBook(0, 300);
    const wrapper = await mountDetail(book.id);
    expect(wrapper.find('[data-test="detail-title"]').text()).toBe('SICP');

    await wrapper.find('[data-test="page-input"]').setValue('120');
    await wrapper.find('[data-test="page-input"]').trigger('keydown.enter');
    await vi.waitFor(
      async () => {
        if ((await getRecord('books', book.id))?.current_page !== 120) throw new Error('页码未更新');
      },
      { timeout: 3000, interval: 20 },
    );
    await vi.waitFor(
      async () => {
        if ((await listAlive('study_records')).length !== 1) throw new Error('page_update 记录未生成');
      },
      { timeout: 3000, interval: 20 },
    );

    const record = (await listAlive('study_records'))[0];
    expect(record?.source).toBe('page_update');
    expect(record?.start_page).toBe(0);
    expect(record?.end_page).toBe(120);
    expect(record?.pages_read).toBe(120);
    expect(record?.date).toBe('2026-06-01');
    expect(wrapper.find('[data-test="detail-pages"]').text()).toContain('120/300');
  });

  it('更新到总页数：弹出“标记为读完？”，确认后 status=done+finish_date', async () => {
    const book = await makeBook(100, 300);
    const wrapper = await mountDetail(book.id);

    await wrapper.find('[data-test="page-input"]').setValue('300');
    await wrapper.find('[data-test="page-save"]').trigger('click');
    await waitFor(() => wrapper.find('[data-test="done-confirm-yes"]').exists(), '读完确认弹窗未出现');

    await wrapper.find('[data-test="done-confirm-yes"]').trigger('click');
    await vi.waitFor(
      async () => {
        if ((await getRecord('books', book.id))?.status !== 'done') throw new Error('状态未变为读完');
      },
      { timeout: 3000, interval: 20 },
    );
    const done = await getRecord('books', book.id);
    expect(done?.finish_date).toBe('2026-06-01');
    await waitFor(() => wrapper.find('[data-test="detail-status"]').text() === '读完', '状态徽章未更新');
  });

  it('更新到总页数后取消：页码保留、状态不变、不写 finish_date', async () => {
    const book = await makeBook(100, 300);
    const wrapper = await mountDetail(book.id);

    await wrapper.find('[data-test="page-input"]').setValue('300');
    await wrapper.find('[data-test="page-input"]').trigger('keydown.enter');
    await waitFor(() => wrapper.find('[data-test="done-confirm-yes"]').exists(), '读完确认弹窗未出现');
    await wrapper.find('[data-test="done-confirm-no"]').trigger('click');
    await flushPromises();

    const after = await getRecord('books', book.id);
    expect(after?.current_page).toBe(300);
    expect(after?.status).toBe('reading');
    expect(after?.finish_date).toBeNull();
  });

  it('摘录：增删改可用，按页码从小到大排序显示', async () => {
    const book = await makeBook();
    const wrapper = await mountDetail(book.id);

    async function add(page: string, content: string): Promise<void> {
      // 上一条保存后父组件重新渲染存在一帧延迟，先等按钮真的回到 DOM 再点，避免空 DOMWrapper 竞态。
      await waitFor(() => wrapper.find('[data-test="excerpt-add"]').exists(), '新增摘录按钮未出现');
      await wrapper.find('[data-test="excerpt-add"]').trigger('click');
      await flushPromises();
      await wrapper.find('[data-test="excerpt-form-page"]').setValue(page);
      await wrapper.find('[data-test="excerpt-form-content"]').setValue(content);
      await wrapper.find('[data-test="excerpt-form"]').trigger('submit');
      await waitFor(
        () => wrapper.find('[data-test="excerpt-form"]').exists() === false,
        '摘录弹窗未关闭',
      );
    }

    await add('90', '第90页的句子');
    await add('12', '第12页的句子');
    await add('45', '第45页的句子');
    await waitFor(() => wrapper.findAll('[data-test="excerpt-row"]').length === 3, '摘录未全部显示');

    const pages = wrapper
      .findAll('[data-test="excerpt-page"]')
      .map((node) => Number(node.text().replace('第 ', '').replace(' 页', '')));
    expect(pages).toEqual([12, 45, 90]);

    // 编辑第一条（12 → 20）
    await waitFor(() => wrapper.findAll('[data-test="excerpt-edit"]').length > 0, '编辑按钮未出现');
    await wrapper.findAll('[data-test="excerpt-edit"]')[0]?.trigger('click');
    await waitFor(() => wrapper.find('[data-test="excerpt-form-page"]').exists(), '编辑表单未打开');
    await wrapper.find('[data-test="excerpt-form-page"]').setValue('20');
    await wrapper.find('[data-test="excerpt-form"]').trigger('submit');
    await waitFor(
      () =>
        wrapper
          .findAll('[data-test="excerpt-page"]')
          .some((node) => node.text().includes('20')),
      '编辑后的页码未出现',
    );

    // 删除第一条（20）
    await waitFor(() => wrapper.findAll('[data-test="excerpt-delete"]').length > 0, '删除按钮未出现');
    await wrapper.findAll('[data-test="excerpt-delete"]')[0]?.trigger('click');
    await waitFor(() => wrapper.findAll('[data-test="excerpt-row"]').length === 2, '摘录未删除');
  });

  it('手动补记：source=manual、end_page=读到页码、不改 current_page、逻辑日期生效', async () => {
    const book = await makeBook(50, 300);
    const wrapper = await mountDetail(book.id);

    await wrapper.find('[data-test="manual-open"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="manual-form"]').exists()).toBe(true);
    await wrapper.find('[data-test="manual-form-date"]').setValue('2026-06-02');
    await wrapper.find('[data-test="manual-form-minutes"]').setValue('45');
    await wrapper.find('[data-test="manual-form-endpage"]').setValue('80');
    await wrapper.find('[data-test="manual-form-note"]').setValue('地铁上读');
    await wrapper.find('[data-test="manual-form"]').trigger('submit');
    await waitFor(() => wrapper.find('[data-test="manual-form"]').exists() === false, '补记弹窗未关闭');

    const record = (await listAlive('study_records'))[0];
    expect(record?.source).toBe('manual');
    expect(record?.duration_sec).toBe(2700);
    expect(record?.date).toBe('2026-06-02');
    expect(record?.end_page).toBe(80);
    expect(record?.start_page).toBeNull();
    expect(record?.pages_read).toBeNull();
    expect((await getRecord('books', book.id))?.current_page).toBe(50);
  });

  it('预计剩余时间：累计≥2小时且当前页>0且未读完才显示；否则不显示（除零保护）', async () => {
    const fullBook = await makeBook(50, 400);
    await makeStudyRecord(fullBook.id, 5400);
    await makeStudyRecord(fullBook.id, 5400); // 累计 3 小时
    const shown = await mountDetail(fullBook.id);
    await waitFor(() => shown.find('[data-test="remaining"]').exists(), '预计剩余未显示');
    expect(shown.find('[data-test="remaining"]').text()).toContain('预计剩余');

    // 累计不足 2 小时：不显示
    const shortBook = await makeBook(50, 400, 'reading');
    await makeStudyRecord(shortBook.id, 3600);
    const hidden = await mountDetail(shortBook.id);
    await waitFor(() => hidden.find('[data-test="detail-title"]').exists(), '详情未渲染');
    expect(hidden.find('[data-test="remaining"]').exists()).toBe(false);

    // 当前页为 0（即使累计满 2 小时）：不显示，无除零错误
    const zeroPageBook = await makeBook(0, 400, 'reading');
    await makeStudyRecord(zeroPageBook.id, 7200);
    const zeroHidden = await mountDetail(zeroPageBook.id);
    await waitFor(() => zeroHidden.find('[data-test="detail-title"]').exists(), '详情未渲染');
    expect(zeroHidden.find('[data-test="remaining"]').exists()).toBe(false);
  });

  it('开始阅读计时：跳转 #/study/timer 并带 type=book&id 预选参数', async () => {
    const book = await makeBook();
    const wrapper = await mountDetail(book.id);
    await wrapper.find('[data-test="start-timer"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/study/timer');
    expect(router.currentRoute.value.query).toMatchObject({ type: 'book', id: book.id });
  });

  it('书不存在或已删除：显示空状态与返回按钮', async () => {
    const wrapper = await mountDetail('not-exist-id');
    expect(wrapper.text()).toContain('未找到这本书');
    await wrapper.find('[data-test="empty-action"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/study/books');
  });
});
