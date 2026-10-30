import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { createRecord, getRecord, listAliveByDate, resetDbForTests, type Meal } from '@/db';
import { useDietStore } from '@/stores/diet';
import { useSettingsStore } from '@/stores/settings';
import { useToastStore } from '@/stores/toast';
import type { ImageDeps } from '@/utils/image';
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


/** 假的压缩依赖：不碰 canvas（jsdom 没有），只返回固定 dataURL。 */
function fakeImageDeps(): ImageDeps {
  return {
    async load() {
      return { width: 1200, height: 900 };
    },
    createCanvas() {
      return {
        draw() {
          /* 不需要记录 */
        },
        toDataURL() {
          return 'data:image/jpeg;base64,FAKEMEAL';
        },
      };
    },
  };
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


describe('餐食照片（AC-86）', () => {
  it('点「＋ 照片」展开拍照/相册入口（camera 输入带 capture）', async () => {
    await createRecord('meals', makeMealData(TODAY, 'breakfast', '早', '鸡蛋'));
    await store.loadMealData(TODAY);

    const wrapper = mountSection({ imageDeps: fakeImageDeps() });
    expect(wrapper.find('[data-test="meal-photo-editor"]').exists()).toBe(false);
    await wrapper.find('[data-test="meal-photo"]').trigger('click');
    expect(wrapper.find('[data-test="meal-photo-editor"]').exists()).toBe(true);

    const meal = (await listAliveByDate('meals', TODAY))[0]!;
    const camera = wrapper.find('[data-test="image-camera-meal-' + meal.id + '"]');
    expect(camera.exists()).toBe(true);
    expect(camera.attributes('capture')).toBe('environment');
    expect(camera.attributes('accept')).toBe('image/*');
  });

  it('选图后照片落库（meals.photos）、显示缩略图，刷新后还在', async () => {
    await createRecord('meals', makeMealData(TODAY, 'breakfast', '早', '鸡蛋'));
    await store.loadMealData(TODAY);
    const meal = (await listAliveByDate('meals', TODAY))[0]!;

    const wrapper = mountSection({ imageDeps: fakeImageDeps() });
    await wrapper.find('[data-test="meal-photo"]').trigger('click');
    const input = wrapper.find('[data-test="image-file-meal-' + meal.id + '"]');
    Object.defineProperty(input.element, 'files', {
      value: [new File(['x'], 'a.png', { type: 'image/png' }), new File(['x'], 'b.png', { type: 'image/png' })],
      writable: false,
    });
    await input.trigger('change');

    await vi.waitFor(async () => {
      const rows = await listAliveByDate('meals', TODAY);
      if ((rows[0]?.photos ?? []).length !== 2) throw new Error('照片未落库');
    });
    await vi.waitFor(() => {
      if (wrapper.findAll('[data-test="meal-photo-thumb"]').length !== 2) throw new Error('缩略图未出现');
    });
    expect((await listAliveByDate('meals', TODAY))[0]?.photos?.[0]).toContain('data:image/jpeg');

    // 重新挂载（= 刷新页面）后照片还在
    const again = mountSection();
    await vi.waitFor(() => {
      if (again.findAll('[data-test="meal-photo-thumb"]').length !== 2) throw new Error('刷新后照片丢了');
    });
  });

  it('删一张照片：落库只剩一张；最多 3 张', async () => {
    const photos = ['data:image/jpeg;base64,A', 'data:image/jpeg;base64,B'];
    await createRecord('meals', { ...makeMealData(TODAY, 'breakfast', '早', '鸡蛋'), photos });
    await store.loadMealData(TODAY);
    const meal = (await listAliveByDate('meals', TODAY))[0]!;

    const wrapper = mountSection();
    await vi.waitFor(() => {
      if (wrapper.findAll('[data-test="meal-photo-thumb"]').length !== 2) throw new Error('缩略图未就绪');
    });
    await wrapper.findAll('[data-test="meal-photo-remove"]')[0]!.trigger('click');

    await vi.waitFor(async () => {
      const rows = await listAliveByDate('meals', TODAY);
      if ((rows[0]?.photos ?? []).length !== 1) throw new Error('删除未落库');
    });
    expect((await listAliveByDate('meals', TODAY))[0]?.photos).toEqual([photos[1]]);

    // 上限 3 张：超过的部分不写进去
    await store.updateMealItem(meal.id, { photos: [...photos, 'C', 'D', 'E'] });
    const saved = (await listAliveByDate('meals', TODAY))[0]!;
    expect(saved.photos).toHaveLength(3);
  });

  it('复制昨天这一餐会把照片一起带过来', async () => {
    await createRecord('meals', {
      ...makeMealData(YESTERDAY, 'breakfast', '早', '牛奶'),
      photos: ['data:image/jpeg;base64,Y'],
    });
    await store.loadMealData(TODAY);

    const wrapper = mountSection();
    await wrapper.find('[data-test="copy-meal"]').trigger('click');
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('meals', TODAY);
      if (rows.length !== 1) throw new Error('未复制');
      if ((rows[0]?.photos ?? []).length !== 1) throw new Error('照片未复制');
    });
    expect((await listAliveByDate('meals', TODAY))[0]?.photos?.[0]).toContain('data:image/jpeg');
  });
});
