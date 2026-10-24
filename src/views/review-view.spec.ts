import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRecord, listAliveByDate, resetDbForTests } from '@/db';
import { useDateStore } from '@/stores/date';
import { useReviewStore } from '@/stores/review';
import { useSettingsStore } from '@/stores/settings';
import ReviewView from './ReviewView.vue';

/** 2026-06-01 是周一。 */
const BASE = new Date('2026-06-01T10:00:00').getTime();
const TODAY = '2026-06-01';
const YESTERDAY = '2026-05-31';

let pinia: Pinia;

beforeEach(async () => {
  vi.useRealTimers();
  window.localStorage.clear();
  await resetDbForTests();
  pinia = createPinia();
  setActivePinia(pinia);
  await useSettingsStore().load();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(BASE);
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

function mountView() {
  return mount(ReviewView, { global: { plugins: [pinia], stubs: { Teleport: true } } });
}

async function waitFor(check: () => boolean | Promise<boolean>, label: string): Promise<void> {
  await vi.waitFor(
    async () => {
      if (!(await check())) throw new Error(label);
    },
    { timeout: 3000, interval: 20 },
  );
}

async function mountLoaded() {
  const wrapper = mountView();
  await waitFor(
    () => wrapper.find('[data-test="review-metrics"]').exists(),
    '复盘页未加载完成',
  );
  return wrapper;
}

describe('ReviewView 复盘页', () => {
  it('加载后渲染 7 项指标与自评区', async () => {
    await createRecord('reviews', {
      date: TODAY,
      rating: 5,
      mood: 4,
      energy: 3,
      good: '专注',
      improve: null,
      mit: '晨跑',
      mit_added_to_plan: false,
    });
    const wrapper = await mountLoaded();
    expect(wrapper.find('[data-test="review-self"]').exists()).toBe(true);
    expect((wrapper.find('[data-test="review-good"]').element as HTMLTextAreaElement).value).toBe('专注');
    expect((wrapper.find('[data-test="review-mit"]').element as HTMLTextAreaElement).value).toBe('晨跑');
    expect(wrapper.find('[data-test="review-history"]').exists()).toBe(true);
  });

  it('输入只留在草稿：不写库、不进历史；点「确认」才保存并出现在历史复盘', async () => {
    const wrapper = await mountLoaded();
    const confirm = wrapper.find('[data-test="review-confirm"]');
    expect(confirm.attributes('disabled')).toBeDefined();

    await wrapper.find('[data-test="review-record-worthy"]').setValue('跑完 5 公里');
    await wrapper.find('[data-test="review-day-summary"]').setValue('状态不错');
    await wrapper.find('[data-test="review-good"]').setValue('专注');
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(await listAliveByDate('reviews', TODAY)).toHaveLength(0);
    // 未确认的草稿不出现在历史复盘里：没写过的日期根本不占行
    expect(wrapper.find('[data-date="' + TODAY + '"]').exists()).toBe(false);

    await confirm.trigger('click');
    await waitFor(
      async () => (await listAliveByDate('reviews', TODAY)).length === 1,
      '确认后未写入复盘',
    );

    const rows = await listAliveByDate('reviews', TODAY);
    expect(rows[0]?.record_worthy).toBe('跑完 5 公里');
    expect(rows[0]?.day_summary).toBe('状态不错');
    expect(rows[0]?.good).toBe('专注');

    await waitFor(
      () => wrapper.find('[data-date="' + TODAY + '"]').exists(),
      '历史复盘未刷新',
    );
    expect(wrapper.find('[data-date="' + TODAY + '"]').find('[data-test="history-summary"]').text()).toBe('状态不错');
  });

  it('评分同样先存草稿，点「确认」后才落库', async () => {
    const wrapper = await mountLoaded();
    await wrapper.findAll('[data-test="rating-star"]')[3]?.trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(await listAliveByDate('reviews', TODAY)).toHaveLength(0);

    await wrapper.find('[data-test="review-confirm"]').trigger('click');
    await waitFor(
      async () => (await listAliveByDate('reviews', TODAY)).length === 1,
      '确认后未写入评分',
    );
    expect((await listAliveByDate('reviews', TODAY))[0]?.rating).toBe(4);
  });

  it('历史区间查看不改变全局日期；「编辑这一天」才切日期', async () => {
    await createRecord('reviews', {
      date: YESTERDAY,
      rating: 5,
      mood: 4,
      energy: 3,
      good: '专注',
      improve: null,
      record_worthy: '跑完 5 公里',
      day_summary: '状态不错',
      mit: '晨跑',
      mit_added_to_plan: false,
    });
    const wrapper = await mountLoaded();
    const dateStore = useDateStore();
    const reviewStore = useReviewStore();
    expect(dateStore.selectedDate).toBe(TODAY);

    const row = wrapper.find('[data-date="' + YESTERDAY + '"]');
    expect(row.attributes('data-filled')).toBe('yes');
    await row.find('[data-test="history-row"]').trigger('click');

    expect(wrapper.find('[data-test="history-detail"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="history-detail-day-summary"]').text()).toBe('状态不错');
    expect(dateStore.selectedDate).toBe(TODAY);
    expect(reviewStore.loadedDate).toBe(TODAY);

    await wrapper.find('[data-test="history-edit-date"]').trigger('click');
    expect(dateStore.selectedDate).toBe(YESTERDAY);
    await waitFor(() => reviewStore.loadedDate === YESTERDAY, '未载入所选日期复盘');
  });

  it('有未确认草稿时切日期被拦下，确认丢弃后才切换', async () => {
    const wrapper = await mountLoaded();
    const dateStore = useDateStore();

    await wrapper.find('[data-test="review-good"]').setValue('没点确认的草稿');

    dateStore.prevDay();
    await flushPromises();
    expect(dateStore.selectedDate).toBe(TODAY);
    expect(wrapper.find('[data-test="review-leave-modal"]').exists()).toBe(true);

    await wrapper.find('[data-test="review-leave-cancel"]').trigger('click');
    expect(wrapper.find('[data-test="review-leave-modal"]').exists()).toBe(false);
    expect(dateStore.selectedDate).toBe(TODAY);
    expect((wrapper.find('[data-test="review-good"]').element as HTMLTextAreaElement).value).toBe(
      '没点确认的草稿',
    );

    dateStore.prevDay();
    await flushPromises();
    await wrapper.find('[data-test="review-leave-discard"]').trigger('click');
    expect(dateStore.selectedDate).toBe(YESTERDAY);
    await waitFor(() => useReviewStore().loadedDate === YESTERDAY, '未载入所选日期复盘');
    expect((wrapper.find('[data-test="review-good"]').element as HTMLTextAreaElement).value).toBe('');
  });

  it('没有草稿时切日期不弹确认', async () => {
    const wrapper = await mountLoaded();
    const dateStore = useDateStore();

    dateStore.prevDay();
    await flushPromises();
    expect(wrapper.find('[data-test="review-leave-modal"]').exists()).toBe(false);
    expect(dateStore.selectedDate).toBe(YESTERDAY);
    await waitFor(() => useReviewStore().loadedDate === YESTERDAY, '未载入所选日期复盘');
  });
});
