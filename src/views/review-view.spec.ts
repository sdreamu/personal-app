import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
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
  return mount(ReviewView, { global: { plugins: [pinia] } });
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
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-test="review-metrics"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-test="review-self"]').exists()).toBe(true);
    expect((wrapper.find('[data-test="review-good"]').element as HTMLTextAreaElement).value).toBe('专注');
    expect((wrapper.find('[data-test="review-mit"]').element as HTMLTextAreaElement).value).toBe('晨跑');
    expect(wrapper.find('[data-test="review-history"]').exists()).toBe(true);
  });

  it('新增两栏：回显 store 值、一句话总结 100 字上限与字数计数、输入后自动保存', async () => {
    await createRecord('reviews', {
      date: TODAY,
      rating: null,
      mood: null,
      energy: null,
      good: null,
      improve: null,
      mit: null,
      record_worthy: '跑完 5 公里',
      day_summary: '状态不错',
      mit_added_to_plan: false,
    });
    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-test="review-metrics"]').exists()).toBe(true);
    });

    const worth = wrapper.find('[data-test="review-record-worthy"]');
    const summary = wrapper.find('[data-test="review-day-summary"]');
    expect((worth.element as HTMLTextAreaElement).value).toBe('跑完 5 公里');
    expect((summary.element as HTMLInputElement).value).toBe('状态不错');
    expect(summary.attributes('maxlength')).toBe('100');
    expect(wrapper.find('[data-test="review-day-summary-counter"]').text()).toBe('4/100');

    await worth.setValue('第一次跑完 5 公里');
    await summary.setValue('今天很稳');
    expect(wrapper.find('[data-test="review-day-summary-counter"]').text()).toBe('4/100');

    await new Promise((resolve) => setTimeout(resolve, 350));
    const rows = await listAliveByDate('reviews', TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.record_worthy).toBe('第一次跑完 5 公里');
    expect(rows[0]?.day_summary).toBe('今天很稳');
  });

  it('灰点点击把 selectedDate 切到该日期并载入补写', async () => {
    await createRecord('reviews', {
      date: YESTERDAY,
      rating: 5,
      mood: 4,
      energy: 3,
      good: '专注',
      improve: null,
      mit: '晨跑',
      mit_added_to_plan: false,
    });
    const dateStore = useDateStore();
    expect(dateStore.selectedDate).toBe(TODAY);

    const wrapper = mountView();
    await vi.waitFor(() => {
      expect(wrapper.find('[data-test="review-metrics"]').exists()).toBe(true);
    });

    const reviewStore = useReviewStore();
    const missingDot = wrapper.find('[data-date="2026-05-30"]');
    expect(missingDot.exists()).toBe(true);
    expect(missingDot.classes()).toContain('missing');
    await missingDot.trigger('click');

    expect(dateStore.selectedDate).toBe('2026-05-30');
    await vi.waitFor(() => {
      expect(reviewStore.loadedDate).toBe('2026-05-30');
    });
  });
});
