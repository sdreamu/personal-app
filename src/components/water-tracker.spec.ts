import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { listAliveByDate, resetDbForTests } from '@/db';
import { useDietStore } from '@/stores/diet';
import { useSettingsStore } from '@/stores/settings';
import WaterTracker from './WaterTracker.vue';

const BASE = new Date('2026-06-01T10:00:00').getTime();
const TODAY = '2026-06-01';

let pinia: Pinia;
let store: ReturnType<typeof useDietStore>;

function mountTracker() {
  return mount(WaterTracker, {
    props: { date: TODAY },
    global: { plugins: [pinia] },
  });
}

beforeEach(async () => {
  vi.useRealTimers();
  await resetDbForTests();
  pinia = createPinia();
  setActivePinia(pinia);
  await useSettingsStore().load();
  store = useDietStore();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(BASE);
  await store.loadMealData(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WaterTracker 喝水打卡', () => {
  it('点 +1 杯三次再点 -1：显示 500 ml、2 杯，且点亮 2 个圆点', async () => {
    const wrapper = mountTracker();
    for (let i = 0; i < 3; i++) {
      await wrapper.find('[data-test="water-plus"]').trigger('click');
    }
    await vi.waitFor(() => {
      expect(wrapper.find('[data-test="water-minus"]').attributes('disabled')).toBeUndefined();
    });
    await wrapper.find('[data-test="water-minus"]').trigger('click');

    await vi.waitFor(async () => {
      const records = await listAliveByDate('water', TODAY);
      expect(records.map((r) => r.ml).sort((a, b) => a - b)).toEqual([-250, 250, 250, 250]);
    });
    await vi.waitFor(() => {
      expect(wrapper.find('[data-test="water-total"]').text()).toBe('500 ml');
    });
    expect(wrapper.find('[data-test="water-cups"]').text()).toContain('2 杯');
    expect(wrapper.findAll('[data-test="water-dot"].lit')).toHaveLength(2);
  });

  it('初始 -1 杯禁用（0 保底）；+1 后可扣，扣回 0 后再次禁用', async () => {
    const wrapper = mountTracker();
    expect(wrapper.find('[data-test="water-minus"]').attributes('disabled')).toBeDefined();

    await wrapper.find('[data-test="water-plus"]').trigger('click');
    await vi.waitFor(() => {
      expect(wrapper.find('[data-test="water-minus"]').attributes('disabled')).toBeUndefined();
    });

    await wrapper.find('[data-test="water-minus"]').trigger('click');
    await vi.waitFor(async () => {
      const records = await listAliveByDate('water', TODAY);
      expect(records.map((r) => r.ml).sort((a, b) => a - b)).toEqual([-250, 250]);
    });
    await vi.waitFor(() => {
      expect(wrapper.find('[data-test="water-total"]').text()).toBe('0 ml');
      expect(wrapper.find('[data-test="water-minus"]').attributes('disabled')).toBeDefined();
    });
  });

  it('圆点按目标杯数渲染：默认 2000/250 = 8 个圆点，未喝时全灭', () => {
    const wrapper = mountTracker();
    expect(wrapper.findAll('[data-test="water-dot"]')).toHaveLength(8);
    expect(wrapper.findAll('[data-test="water-dot"].lit')).toHaveLength(0);
  });
});
