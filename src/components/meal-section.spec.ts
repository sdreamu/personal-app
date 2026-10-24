import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRecord, getRecord, listAliveByDate, resetDbForTests, type Meal } from '@/db';
import { useDietStore } from '@/stores/diet';
import { useSettingsStore } from '@/stores/settings';
import { useToastStore } from '@/stores/toast';
import MealSection from './MealSection.vue';

const BASE = new Date('2026-06-01T10:00:00').getTime();
const TODAY = '2026-06-01';
const YESTERDAY = '2026-05-31';

let pinia: Pinia;
let store: ReturnType<typeof useDietStore>;

type MealData = Omit<Meal, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>;

function makeMealData(
  date: string,
  mealKey: string,
  mealName: string,
  text: string,
  overrides: Partial<MealData> = {},
): MealData {
  return { date, meal_key: mealKey, meal_name: mealName, text, feeling: null, ...overrides };
}

function mountSection(overrides: Record<string, unknown> = {}) {
  return mount(MealSection, {
    props: { date: TODAY, mealKey: 'breakfast', mealName: '早', open: false, ...overrides },
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

describe('MealSection 餐次分区', () => {
  it('点 + 打开输入行，输入文字回车立即添加并清空输入框', async () => {
    const wrapper = mountSection();
    await wrapper.find('[data-test="toggle-input"]').trigger('click');
    expect(wrapper.emitted('update:open')?.[0]).toEqual([true]);

    await wrapper.setProps({ open: true });
    const input = wrapper.find('[data-test="meal-input"]');
    await input.setValue('鸡蛋');
    await input.trigger('keydown.enter');

    await vi.waitFor(async () => {
      expect((await listAliveByDate('meals', TODAY)).map((m) => m.text)).toEqual(['鸡蛋']);
    });
    await vi.waitFor(() => {
      expect((wrapper.find('[data-test="meal-input"]').element as HTMLInputElement).value).toBe('');
      expect(wrapper.find('[data-test="meal-text"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-test="meal-text"]').text()).toBe('鸡蛋');
  });

  it('常吃快捷标签只展示本餐次前 8 项，点击一次立即添加到当天该餐次', async () => {
    await createRecord('meals', makeMealData(YESTERDAY, 'breakfast', '早', '牛奶'));
    await createRecord('meals', makeMealData(YESTERDAY, 'breakfast', '早', '牛奶'));
    await createRecord('meals', makeMealData(YESTERDAY, 'breakfast', '早', '鸡蛋'));
    await createRecord('meals', makeMealData(YESTERDAY, 'lunch', '午', '咖啡'));
    await store.loadMealData(TODAY);

    const wrapper = mountSection();
    expect(wrapper.findAll('[data-test="quick-item"]').map((b) => b.text())).toEqual(['牛奶', '鸡蛋']);
    expect(wrapper.text()).not.toContain('咖啡'); // 午餐快捷项绝不串到早餐

    await wrapper.findAll('[data-test="quick-item"]')[0]?.trigger('click');
    await vi.waitFor(async () => {
      expect((await listAliveByDate('meals', TODAY)).map((m) => m.text)).toEqual(['牛奶']);
    });
  });

  it('编辑可改文字与感受；删除走软删除并可撤销', async () => {
    const meal = await createRecord('meals', makeMealData(TODAY, 'breakfast', '早', '鸡蛋'));
    await store.loadMealData(TODAY);
    const wrapper = mountSection();

    await wrapper.find('[data-test="meal-edit"]').trigger('click');
    await wrapper.find('[data-test="meal-edit-input"]').setValue('煎蛋');
    await wrapper.find('[data-test="meal-edit-feeling"]').setValue('full');
    await wrapper.find('[data-test="meal-edit-save"]').trigger('click');

    await vi.waitFor(async () => {
      const row = await getRecord('meals', meal.id);
      expect(row?.text).toBe('煎蛋');
      expect(row?.feeling).toBe('full');
    });
    await vi.waitFor(() => {
      expect(wrapper.find('[data-test="meal-feeling"]').exists()).toBe(true);
    });
    expect(wrapper.find('[data-test="meal-feeling"]').text()).toBe('吃饱');

    await wrapper.find('[data-test="meal-delete"]').trigger('click');
    await vi.waitFor(async () => {
      expect((await getRecord('meals', meal.id))?.deleted_at).not.toBeNull();
    });
    expect(await listAliveByDate('meals', TODAY)).toHaveLength(0);

    await vi.waitFor(() => {
      expect(useToastStore().items.some((i) => i.undo !== null)).toBe(true);
    });
    const undoToast = useToastStore().items.find((i) => i.undo !== null);
    expect(undoToast?.message).toContain('已删除');
    await undoToast?.undo?.action();
    await vi.waitFor(async () => {
      expect((await getRecord('meals', meal.id))?.deleted_at).toBeNull();
    });
    expect(await listAliveByDate('meals', TODAY)).toHaveLength(1);
  });
});
