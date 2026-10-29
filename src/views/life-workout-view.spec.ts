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
import { useToastStore } from '@/stores/toast';
import { useWorkoutStore } from '@/stores/workout';
import LifeWorkoutView from './LifeWorkoutView.vue';

/** 2026-06-01 是周一。 */
const BASE = new Date('2026-06-01T10:00:00').getTime();
const TODAY = '2026-06-01';
const YESTERDAY = '2026-05-31';
const TOMORROW = '2026-06-02';

/** 全量并行跑时 IndexedDB 写 + DOM 刷新可能超过 vitest waitFor 默认 1s 上限；
 *  这里只放宽等待上限，断言与期望值一律不变。 */
const WAIT_OPTS = { timeout: 5000 } as const;

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
    }, WAIT_OPTS);
    await vi.waitFor(() => {
      if (wrapper.findAll('[data-test="exercise-add-input"]').length === 0) {
        throw new Error('动作输入未出现');
      }
    }, WAIT_OPTS);

    const addInput = wrapper.findAll('[data-test="exercise-add-input"]')[0]!;
    await addInput.setValue('卧推，飞鸟');
    await wrapper.findAll('[data-test="exercise-add"]')[0]!.trigger('click');
    await vi.waitFor(async () => {
      const rows = await listAlive('workout_templates');
      if ((rows[0]?.exercise_names ?? []).join(',') !== '卧推,飞鸟') {
        throw new Error('模板动作未保存');
      }
    }, WAIT_OPTS);

    const day = wrapper.find('[data-test="day-editor"]');
    await vi.waitFor(() => {
      if (!day.text().includes('卧推')) throw new Error('当天训练未带出模板动作');
    }, WAIT_OPTS);
    expect(day.text()).toContain('胸');
    expect(day.text()).toContain('卧推');
    // 组行是模板动作落库后再渲染的，等它补齐（2 个动作 × 3 组）再断言
    await vi.waitFor(() => {
      if (wrapper.find('[data-test="day-editor"]').findAll('[data-test="set-row"]').length !== 6) {
        throw new Error('组行还没渲染齐');
      }
    }, WAIT_OPTS);
    expect(wrapper.find('[data-test="day-editor"]').findAll('[data-test="set-row"]')).toHaveLength(6);
  });

  it('组勾选即时保存：重新挂载（刷新页面）勾选状态不丢', async () => {
    await seedTypeTemplate(1, '胸', ['卧推']);
    wrapper = await mountPage();

    await wrapper.find('[data-test="set-done"]').setValue(true);
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('workout_records', TODAY);
      if (rows[0]?.exercises[0]?.sets[0]?.done !== true) throw new Error('勾选未写入');
    }, WAIT_OPTS);

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
    }, WAIT_OPTS);

    await wrapper.find('[data-test="set-reps"]').setValue('8');
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('workout_records', TODAY);
      if (rows[0]?.exercises[0]?.sets[0]?.reps !== 8) throw new Error('次数未保存');
    }, WAIT_OPTS);
  });

  it('临时动作增删即时保存', async () => {
    await seedTypeTemplate(1, '胸', ['卧推']);
    wrapper = await mountPage();

    await wrapper.find('[data-test="add-exercise-input"]').setValue('飞鸟');
    await wrapper.find('[data-test="add-exercise"]').trigger('click');
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('workout_records', TODAY);
      if (!rows[0]?.exercises.some((e) => e.name === '飞鸟')) throw new Error('临时动作未添加');
    }, WAIT_OPTS);
    const dayEditor = wrapper.find('[data-test="day-editor"]');
    const items = dayEditor.findAll('[data-test="exercise-item"]');
    expect(items).toHaveLength(2);
    const flyItem = items.find((i) => i.text().includes('飞鸟'))!;
    await flyItem.find('[data-test="exercise-remove"]').trigger('click');
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('workout_records', TODAY);
      if (rows[0]?.exercises.some((e) => e.name === '飞鸟')) throw new Error('临时动作未删除');
    }, WAIT_OPTS);
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
    }, WAIT_OPTS);
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
    }, WAIT_OPTS);
    // vi.waitFor 会推进假 Date，这里按当前假时刻再前进 5 分钟，避免依赖具体毫秒数
    vi.setSystemTime(Date.now() + 5 * 60_000);
    await wrapper.find('[data-test="finish-workout"]').trigger('click');
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('workout_records', TODAY);
      if (rows[0]?.done !== true || rows[0]?.duration_min !== 5) throw new Error('完成未写入');
    }, WAIT_OPTS);
    await vi.waitFor(() => {
      if (!wrapper.find('[data-test="done-badge"]').text().includes('已完成')) {
        throw new Error('当天完成标记未刷新');
      }
      const item = wrapper.find('[data-test="history-item"]');
      if (!item.exists() || !item.text().includes('已完成')) throw new Error('历史列表未刷新');
    }, WAIT_OPTS);
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
    }, WAIT_OPTS);
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
    }, WAIT_OPTS);
    expect(wrapper.find('[data-test="day-editor"]').text()).toContain('背');

    await wrapper.find('[data-test="add-exercise-input"]').setValue('划船');
    await wrapper.find('[data-test="add-exercise"]').trigger('click');
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('workout_records', TOMORROW);
      if (!rows[0]?.exercises.some((e) => e.name === '划船')) throw new Error('周二补记未写入');
    }, WAIT_OPTS);
    expect((await listAliveByDate('workout_records', TOMORROW))[0]?.type_name).toBe('背');
    expect(await listAliveByDate('workout_records', TODAY)).toHaveLength(0);
  });

  it('项目库区块：添加动作后自动收录，点一下可再次加入当天训练（重复点击不重复）', async () => {
    await seedTypeTemplate(1, '胸', ['卧推']);
    wrapper = await mountPage();

    await wrapper.find('[data-test="add-exercise-input"]').setValue('飞鸟');
    await wrapper.find('[data-test="add-exercise"]').trigger('click');
    await vi.waitFor(() => {
      const lib = wrapper.findAll('[data-test="library-item"]');
      if (!lib.some((i) => i.text() === '飞鸟')) throw new Error('项目库未出现飞鸟');
    }, WAIT_OPTS);
    // exercises 表恰好一行 name=飞鸟
    expect((await listAlive('exercises')).filter((r) => r.name === '飞鸟')).toHaveLength(1);

    // 从当天记录里删掉飞鸟（项目库仍保留）
    const dayEditor = wrapper.find('[data-test="day-editor"]');
    const flyItem = dayEditor
      .findAll('[data-test="exercise-item"]')
      .find((i) => i.text().includes('飞鸟'))!;
    await flyItem.find('[data-test="exercise-remove"]').trigger('click');
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('workout_records', TODAY);
      if (rows[0]?.exercises.some((e) => e.name === '飞鸟')) throw new Error('飞鸟未删除');
    }, WAIT_OPTS);

    // 点项目库按钮 → 加回当天训练
    await wrapper
      .findAll('[data-test="library-item"]')
      .find((i) => i.text() === '飞鸟')!
      .trigger('click');
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('workout_records', TODAY);
      if (!rows[0]?.exercises.some((e) => e.name === '飞鸟')) throw new Error('项目库未加入当天训练');
    }, WAIT_OPTS);

    // 再点一次：记录里仍只有一条，exercises 表仍只有一行
    await wrapper
      .findAll('[data-test="library-item"]')
      .find((i) => i.text() === '飞鸟')!
      .trigger('click');
    await flushPromises();
    const rows = await listAliveByDate('workout_records', TODAY);
    expect(rows[0]?.exercises.filter((e) => e.name === '飞鸟')).toHaveLength(1);
    expect((await listAlive('exercises')).filter((r) => r.name === '飞鸟')).toHaveLength(1);
  });

  it('动作备注：编辑即时落库、刷新后仍在，清空存 null；不改变默认组数', async () => {
    await seedTypeTemplate(1, '胸', ['卧推']);
    wrapper = await mountPage();

    // 回归：备注不影响默认 3 组
    expect(wrapper.findAll('[data-test="set-row"]')).toHaveLength(3);

    await wrapper.find('[data-test="exercise-note"]').trigger('click');
    const noteInput = wrapper.find('[data-test="exercise-note-input"]');
    await noteInput.setValue('加到 60kg，8 次力竭');
    await noteInput.trigger('blur');
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('workout_records', TODAY);
      if (rows[0]?.exercises[0]?.note !== '加到 60kg，8 次力竭') throw new Error('备注未落库');
    }, WAIT_OPTS);
    await vi.waitFor(() => {
      if (!wrapper.find('[data-test="exercise-note-text"]').text().includes('加到 60kg')) {
        throw new Error('备注未显示');
      }
    }, WAIT_OPTS);

    // 刷新（重新挂载）后备注仍在
    wrapper.unmount();
    wrapper = await mountPage();
    expect(wrapper.find('[data-test="exercise-note-text"]').text()).toContain('加到 60kg，8 次力竭');

    // 清空 → 落库为 null，展示区不再占位
    await wrapper.find('[data-test="exercise-note"]').trigger('click');
    const clearInput = wrapper.find('[data-test="exercise-note-input"]');
    await clearInput.setValue('');
    await clearInput.trigger('blur');
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('workout_records', TODAY);
      if (rows[0]?.exercises[0]?.note !== null) throw new Error('备注未清空为 null');
    }, WAIT_OPTS);
    await vi.waitFor(() => {
      if (wrapper.find('[data-test="exercise-note-text"]').exists()) throw new Error('清空后仍显示备注');
    }, WAIT_OPTS);
  });
});

describe('N3 今日训练置顶 + 周计划折叠（AC-73）', () => {
  it('页面顺序：今日训练 → 每周计划 → 历史训练记录', async () => {
    wrapper = await mountPage();
    const html = wrapper.html();
    const dayIndex = html.indexOf('data-test="day-card"');
    const weekIndex = html.indexOf('data-test="week-plan-card"');
    const historyIndex = html.indexOf('历史训练记录');
    expect(dayIndex).toBeGreaterThan(-1);
    expect(weekIndex).toBeGreaterThan(dayIndex);
    expect(historyIndex).toBeGreaterThan(weekIndex);
  });

  it('今日训练卡标题带日期与状态（未开始 / 进行中 / 已完成）', async () => {
    wrapper = await mountPage();
    const title = wrapper.find('[data-test="day-card-title"]');
    expect(title.text()).toContain('6月1日');
    expect(title.text()).toContain('周一');
    expect(wrapper.find('[data-test="day-status"]').text()).toContain('未开始');
    wrapper.unmount();

    await seedTypeTemplate(1, '胸', ['卧推']);
    wrapper = await mountPage();
    expect(wrapper.find('[data-test="day-status"]').text()).toContain('进行中');
    wrapper.unmount();

    await createRecord('workout_records', makeRecord(TODAY, { type_name: '胸', done: true }));
    wrapper = await mountPage();
    expect(wrapper.find('[data-test="day-status"]').text()).toContain('已完成');
  });

  it('每周计划默认收成一行摘要，点开才看到编辑器', async () => {
    await seedTypeTemplate(1, '胸', ['卧推']);
    wrapper = await mountPage();

    const toggle = wrapper.find('[data-test="week-plan-toggle"]');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    const body = wrapper.find('[data-test="week-plan-body"]');
    expect(body.attributes('style')).toContain('display: none');
    expect(wrapper.find('[data-test="week-plan-summary"]').text()).toContain('周一 胸');

    await toggle.trigger('click');
    expect(wrapper.find('[data-test="week-plan-toggle"]').attributes('aria-expanded')).toBe('true');
    expect(wrapper.find('[data-test="week-plan-body"]').attributes('style') ?? '').not.toContain(
      'display: none',
    );
  });
});

describe('N3 项目库可编写（AC-73）', () => {
  it('输入框 + 添加按钮新建动作：落 exercises 表；同名不重复；空名字不加', async () => {
    await seedTypeTemplate(1, '胸', ['卧推']);
    wrapper = await mountPage();

    await wrapper.find('[data-test="library-add-input"]').setValue('深蹲');
    await wrapper.find('[data-test="library-add-btn"]').trigger('click');
    await vi.waitFor(() => {
      const rows = wrapper.findAll('[data-test="library-item"]');
      if (!rows.some((row) => row.text() === '深蹲')) throw new Error('项目库未出现深蹲');
    }, WAIT_OPTS);
    expect((await listAlive('exercises')).map((row) => row.name)).toEqual(['深蹲']);

    // 回车也能加；同名不产生第二行
    const input = wrapper.find('[data-test="library-add-input"]');
    await input.setValue('深蹲');
    await input.trigger('keyup.enter');
    await flushPromises();
    expect((await listAlive('exercises')).length).toBe(1);

    // 空名字不加
    await input.setValue('   ');
    await input.trigger('keyup.enter');
    await flushPromises();
    expect((await listAlive('exercises')).length).toBe(1);
  });

  it('删项目：软删除、列表消失、5 秒内可撤销恢复', async () => {
    await seedTypeTemplate(1, '胸', []);
    await createRecord('exercises', { name: '深蹲' });
    wrapper = await mountPage();
    await vi.waitFor(() => {
      if (wrapper.findAll('[data-test="library-item"]').length !== 1) throw new Error('项目库未就绪');
    }, WAIT_OPTS);

    await wrapper.find('[data-test="library-remove"]').trigger('click');
    await vi.waitFor(() => {
      if (wrapper.findAll('[data-test="library-item"]').length !== 0) throw new Error('删除后列表未消失');
    }, WAIT_OPTS);
    expect(await listAlive('exercises')).toHaveLength(0);

    const undoToast = useToastStore().items.at(-1);
    expect(undoToast?.message).toBe('已删除动作，可撤销');
    await undoToast?.undo?.action();
    await vi.waitFor(() => {
      if (wrapper.findAll('[data-test="library-item"]').length !== 1) throw new Error('撤销后未恢复');
    }, WAIT_OPTS);
    expect((await listAlive('exercises')).map((row) => row.name)).toEqual(['深蹲']);
  });

  it('项目库空态给出「自己的动作清单」引导语', async () => {
    await seedTypeTemplate(1, '胸', []);
    wrapper = await mountPage();
    expect(wrapper.find('[data-test="library-empty"]').text()).toContain(
      '这里是你自己的动作清单，先写下来，练的时候点一下',
    );
  });
});

describe('N3 一键整组完成（AC-73）', () => {
  it('点「一键完成全部组」：3 组全部打勾、进度显示 3/3', async () => {
    await seedTypeTemplate(1, '胸', ['卧推']);
    wrapper = await mountPage();
    await vi.waitFor(() => {
      if (wrapper.findAll('[data-test="set-row"]').length !== 3) throw new Error('组未就绪');
    }, WAIT_OPTS);

    await wrapper.find('[data-test="exercise-complete-all"]').trigger('click');
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('workout_records', TODAY);
      const sets = rows[0]?.exercises[0]?.sets ?? [];
      if (!sets.every((set) => set.done)) throw new Error('组未全部完成');
    }, WAIT_OPTS);
    await vi.waitFor(() => {
      if (!wrapper.find('[data-test="exercise-progress"]').text().includes('3/3')) {
        throw new Error('进度未更新');
      }
    }, WAIT_OPTS);
  });
});

describe('N4 训练组完成反馈（AC-74）', () => {
  it('勾选一组：该行挂 done-flash 并出现右侧对勾；未勾选的组没有', async () => {
    await seedTypeTemplate(1, '胸', ['卧推']);
    wrapper = await mountPage();
    await vi.waitFor(() => {
      if (wrapper.findAll('[data-test="set-row"]').length !== 3) throw new Error('组未就绪');
    }, WAIT_OPTS);
    const card = () => wrapper.find('[data-test="day-card"]');
    expect(card().findAll('[data-test="set-done-mark"]')).toHaveLength(0);

    await card().findAll('[data-test="set-done"]')[0]!.trigger('change');
    await vi.waitFor(() => {
      if (card().findAll('[data-test="set-row"].done-flash').length !== 1) {
        throw new Error('完成态没有闪一下');
      }
    }, WAIT_OPTS);
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('workout_records', TODAY);
      if (rows[0]?.exercises[0]?.sets[0]?.done !== true) throw new Error('勾选未写入');
    }, WAIT_OPTS);
    await vi.waitFor(() => {
      if (card().findAll('[data-test="set-done-mark"]').length !== 1) throw new Error('没有对勾');
    }, WAIT_OPTS);
    expect(card().findAll('[data-test="set-row"].set-row-done')).toHaveLength(1);
  });
});


describe('项目库外置（AC-83）', () => {
  it('项目库是独立卡片：不在「今日训练」卡片里，页面顺序 今日训练 → 项目库 → 每周计划', async () => {
    await seedTypeTemplate(1, '胸', ['卧推']);
    wrapper = await mountPage();

    const html = wrapper.html();
    expect(html.indexOf('data-test="library-card"')).toBeGreaterThan(-1);
    // 不在当天训练的卡片内部
    expect(wrapper.find('[data-test="day-card"] [data-test="exercise-library"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="library-card"] [data-test="exercise-library"]').exists()).toBe(true);

    const dayIndex = html.indexOf('data-test="day-card"');
    const libraryIndex = html.indexOf('data-test="library-card"');
    const weekIndex = html.indexOf('data-test="week-plan-card"');
    expect(libraryIndex).toBeGreaterThan(dayIndex);
    expect(weekIndex).toBeGreaterThan(libraryIndex);
  });

  it('休息日没有当天记录，项目库照样能看能点（点一下会建当天记录并加入）', async () => {
    await createRecord('exercises', { name: '深蹲' });
    wrapper = await mountPage();
    expect(wrapper.find('[data-test="rest-day"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="library-card"]').exists()).toBe(true);

    await vi.waitFor(() => {
      if (!wrapper.findAll('[data-test="library-item"]').some((i) => i.text() === '深蹲')) {
        throw new Error('项目库未就绪');
      }
    }, WAIT_OPTS);

    await wrapper
      .findAll('[data-test="library-item"]')
      .find((i) => i.text() === '深蹲')!
      .trigger('click');
    await vi.waitFor(async () => {
      const rows = await listAliveByDate('workout_records', TODAY);
      if (!rows[0]?.exercises.some((e) => e.name === '深蹲')) throw new Error('休息日点击未建记录');
    }, WAIT_OPTS);
  });

  it('历史训练记录里不重复出现项目库', async () => {
    await seedTypeTemplate(1, '胸', ['卧推']);
    await createRecord('workout_records', makeRecord(YESTERDAY));
    wrapper = await mountPage();
    expect(wrapper.findAll('[data-test="exercise-library"]')).toHaveLength(1);
  });
});


describe('每日计划能加能写（AC-84）', () => {
  it('周计划下拉自带内置类型（力量/有氧/拉伸），不再是只有「休息」', async () => {
    wrapper = await mountPage();
    const options = wrapper
      .findAll('[data-test="type-select"]')[0]!
      .findAll('option')
      .map((o) => o.text());
    expect(options).toContain('休息');
    expect(options).toContain('力量');
    expect(options).toContain('有氧');
    expect(options).toContain('拉伸');
  });

  it('「＋ 类型」新建一个类型：落 workout_types 并直接选到这一行', async () => {
    wrapper = await mountPage();
    await wrapper.find('[data-test="week-plan-toggle"]').trigger('click');

    const mondayRow = wrapper.findAll('[data-test="week-row"]')[0]!;
    await mondayRow.find('[data-test="new-type-btn"]').trigger('click');
    await mondayRow.find('[data-test="new-type-input"]').setValue('腿');
    await mondayRow.find('[data-test="new-type-input"]').trigger('keyup.enter');

    await vi.waitFor(async () => {
      const types = await listAlive('workout_types');
      if (!types.some((t) => t.name === '腿')) throw new Error('类型未落库');
    }, WAIT_OPTS);
    await vi.waitFor(() => {
      const select = wrapper.findAll('[data-test="type-select"]')[0]!;
      if ((select.element as HTMLSelectElement).value !== '腿') throw new Error('新类型未选中');
    }, WAIT_OPTS);
    // 周计划真的写进去了
    await vi.waitFor(() => {
      if (useWorkoutStore().week.find((t) => t.weekday === 1)?.type_name !== '腿') {
        throw new Error('周计划未保存新类型');
      }
    }, WAIT_OPTS);
  });

  it('周计划里给周一排的动作，周一当天能看到（每日计划真的下来了）', async () => {
    await seedTypeTemplate(1, '胸', ['卧推', '飞鸟']);
    wrapper = await mountPage();
    const names = wrapper.findAll('[data-test="exercise-name"]').map((n) => n.text());
    expect(names).toContain('卧推');
    expect(names).toContain('飞鸟');
  });
});
