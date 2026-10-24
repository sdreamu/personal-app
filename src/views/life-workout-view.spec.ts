import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import {
  addCategory,
  createRecord,
  listAlive,
  listAliveByDate,
  resetDbForTests,
  type WorkoutRecord,
} from '@/db';
import { useDateStore } from '@/stores/date';
import { useWorkoutStore } from '@/stores/workout';
import LifeWorkoutView from './LifeWorkoutView.vue';

/** 2026-06-01 是周一。 */
const BASE = new Date('2026-06-01T10:00:00').getTime();
const TODAY = '2026-06-01';
const YESTERDAY = '2026-05-31';
const TOMORROW = '2026-06-02';

let pinia: Pinia;
let wrapper: VueWrapper;

async function mountPage(): Promise<VueWrapper> {
  const w = mount(LifeWorkoutView, { global: { plugins: [pinia] } });
  const store = useWorkoutStore();
  await vi.waitFor(
    () => {
      if (store.loading || store.loadedDate === null) throw new Error('健身页尚未加载完成');
    },
    { timeout: 3000, interval: 10 },
  );
  await flushPromises();
  return w;
}

async function seedTypeTemplate(weekday: number, typeName: string, exercises: string[]): Promise<void> {
  await addCategory('workout_types', typeName);
  await createRecord('workout_templates', { weekday, type_name: typeName, exercise_names: exercises });
}

async function seedType(typeName: string): Promise<void> {
  await addCategory('workout_types', typeName);
}

type WorkoutRecordData = Omit<WorkoutRecord, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>;

function makeRecord(date: string, overrides: Partial<WorkoutRecordData> = {}): WorkoutRecordData {
  return {
    date,
    type_name: '背',
    exercises: [],
    duration_min: 45,
    done: true,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.useRealTimers();
  window.localStorage.clear();
  await resetDbForTests();
  pinia = createPinia();
  setActivePinia(pinia);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(BASE);
});

afterEach(() => {
  vi.useRealTimers();
});

enableAutoUnmount(afterEach);

describe('健身页 #/life/workout', () => {
  it('周计划即时保存：选类型 + 逗号批量添加动作，当天立即带出模板', async () => {
    await seedType('胸');
    wrapper = await mountPage();

    const select = wrapper.findAll('[data-test="type-select"]')[0]!;
    await select.setValue('胸');
    await vi.waitFor(async () => {
      const rows = await listAlive('workout_templates');
      if (rows[0]?.type_name !== '胸') throw new Error('模板类型未保存');
    });
    await vi.waitFor(() => {
      if (wrapper.findAll('[data-test="exercise-add-input"]').length === 0) {
        throw new Error('动作输入未出现');
      }
    });

    const addInput = wrapper.findAll('[data-test="exercise-add-input"]')[0]!;
    await addInput.setValue('卧推，飞鸟');
    await wrapper.findAll('[data-test="exercise-add"]')[0]!.trigger('click');
    await vi.waitFor(async () => {
      const rows = await listAlive('workout_templates');
      if ((rows[0]?.exercise_names ?? []).join(',') !== '卧推,飞鸟') {
        throw new Error('模板动作未保存');
      }
    });

    const day = wrapper.find('[data-test="day-editor"]');
    await vi.waitFor(() => {
      if (!day.text().includes('卧推')) throw new Error('当天训练未带出模板动作');
    });
    expect(day.text()).toContain('胸');
    expect(day.text()).toContain('卧推');
    expect(wrapper.find('[data-test="day-editor"]').findAll('[data-test="set-row"]')).toHaveLength(6);
  });

  it('组勾选即时保存：重新挂载（刷新页面）勾选状态不丢', async () => {
    await seedTypeTemplate(1, '胸', ['卧推']);
    wrapper = await mountPage();

    await wrapper.find('[data-test="set-done"]').setValue(true);
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('workout_records', TODAY);
      if (rows[0]?.exercises[0]?.sets[0]?.done !== true) throw new Error('勾选未写入');
    });

    wrapper.unmount();
    wrapper = await mountPage();
    const checkboxes = wrapper.findAll('[data-test="set-done"]');
    expect((checkboxes[0]!.element as HTMLInputElement).checked).toBe(true);
  });

  it('修改重量/次数即时保存到当天记录', async () => {
    await seedTypeTemplate(1, '胸', ['卧推']);
    wrapper = await mountPage();

    await wrapper.find('[data-test="set-weight"]').setValue('80');
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('workout_records', TODAY);
      if (rows[0]?.exercises[0]?.sets[0]?.weight_kg !== 80) throw new Error('重量未保存');
    });

    await wrapper.find('[data-test="set-reps"]').setValue('8');
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('workout_records', TODAY);
      if (rows[0]?.exercises[0]?.sets[0]?.reps !== 8) throw new Error('次数未保存');
    });
  });

  it('临时动作增删即时保存', async () => {
    await seedTypeTemplate(1, '胸', ['卧推']);
    wrapper = await mountPage();

    await wrapper.find('[data-test="add-exercise-input"]').setValue('飞鸟');
    await wrapper.find('[data-test="add-exercise"]').trigger('click');
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('workout_records', TODAY);
      if (!rows[0]?.exercises.some((e) => e.name === '飞鸟')) throw new Error('临时动作未添加');
    });
    const dayEditor = wrapper.find('[data-test="day-editor"]');
    const items = dayEditor.findAll('[data-test="exercise-item"]');
    expect(items).toHaveLength(2);
    const flyItem = items.find((i) => i.text().includes('飞鸟'))!;
    await flyItem.find('[data-test="exercise-remove"]').trigger('click');
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('workout_records', TODAY);
      if (rows[0]?.exercises.some((e) => e.name === '飞鸟')) throw new Error('临时动作未删除');
    });
    expect((await listAliveByDate('workout_records', TODAY))[0]?.exercises.map((e) => e.name)).toEqual([
      '卧推',
    ]);
  });

  it('休息日显示“今天休息”和“开始临时训练”按钮，点击新建临时训练记录', async () => {
    await createRecord('workout_templates', { weekday: 1, type_name: '休息', exercise_names: [] });
    wrapper = await mountPage();

    const rest = wrapper.find('[data-test="rest-day"]');
    expect(rest.exists()).toBe(true);
    expect(rest.text()).toContain('今天休息');
    expect(wrapper.find('[data-test="start-temporary"]').exists()).toBe(true);

    await wrapper.find('[data-test="start-temporary"]').trigger('click');
    await vi.waitFor(() => {
      if (!wrapper.find('[data-test="day-editor"]').exists()) throw new Error('临时训练未开始');
    });
    const rows = await listAliveByDate('workout_records', TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.type_name).toBe('临时训练');
    expect(wrapper.find('[data-test="day-type"]').text()).toBe('临时训练');
  });

  it('完成训练：默认用时=首勾到完成差值，历史列表标记已完成', async () => {
    await seedTypeTemplate(1, '胸', ['卧推']);
    wrapper = await mountPage();

    await wrapper.find('[data-test="set-done"]').setValue(true);
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('workout_records', TODAY);
      if (rows[0]?.exercises[0]?.sets[0]?.done !== true) throw new Error('勾选未写入');
    });
    // vi.waitFor 会推进假 Date，这里按当前假时刻再前进 5 分钟，避免依赖具体毫秒数
    vi.setSystemTime(Date.now() + 5 * 60_000);
    await wrapper.find('[data-test="finish-workout"]').trigger('click');
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('workout_records', TODAY);
      if (rows[0]?.done !== true || rows[0]?.duration_min !== 5) throw new Error('完成未写入');
    });
    await vi.waitFor(() => {
      if (!wrapper.find('[data-test="done-badge"]').text().includes('已完成')) {
        throw new Error('当天完成标记未刷新');
      }
      const item = wrapper.find('[data-test="history-item"]');
      if (!item.exists() || !item.text().includes('已完成')) throw new Error('历史列表未刷新');
    });
    expect(wrapper.find('[data-test="done-badge"]').text()).toContain('已完成');
    expect(wrapper.find('[data-test="history-item"]').text()).toContain('已完成');
  });

  it('历史列表：日期倒序展示，可展开编辑当天记录', async () => {
    await createRecord(
      'workout_records',
      makeRecord(YESTERDAY, {
        exercises: [{ name: '引体', sets: [{ weight_kg: null, reps: 8, done: false }] }],
      }),
    );
    wrapper = await mountPage();

    const items = wrapper.findAll('[data-test="history-item"]');
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.text()).toContain('2026-05-31');
    expect(item.text()).toContain('背');
    expect(item.text()).toContain('已完成');

    await item.find('[data-test="set-done"]').setValue(true);
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('workout_records', YESTERDAY);
      if (rows[0]?.exercises[0]?.sets[0]?.done !== true) throw new Error('历史勾选未写入');
    });
    expect((await listAliveByDate('workout_records', YESTERDAY))[0]?.exercises[0]?.sets[0]?.done).toBe(true);
  });

  it('读/写跟随 dateStore.selectedDate：切到明天补记，写入明天记录', async () => {
    await seedTypeTemplate(1, '胸', ['卧推']);
    await seedTypeTemplate(2, '背', ['引体']);
    wrapper = await mountPage();
    expect(wrapper.find('[data-test="day-editor"]').text()).toContain('卧推');

    useDateStore().setSelected(TOMORROW);
    await vi.waitFor(() => {
      if (!wrapper.find('[data-test="day-editor"]').text().includes('引体')) {
        throw new Error('周二训练未显示');
      }
    });
    expect(wrapper.find('[data-test="day-editor"]').text()).toContain('背');

    await wrapper.find('[data-test="add-exercise-input"]').setValue('划船');
    await wrapper.find('[data-test="add-exercise"]').trigger('click');
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('workout_records', TOMORROW);
      if (!rows[0]?.exercises.some((e) => e.name === '划船')) throw new Error('周二补记未写入');
    });
    expect((await listAliveByDate('workout_records', TOMORROW))[0]?.type_name).toBe('背');
    expect(await listAliveByDate('workout_records', TODAY)).toHaveLength(0);
  });
});
