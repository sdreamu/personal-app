import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { createMemoryHistory, createRouter, type Router } from 'vue-router';
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import ToastStack from '@/components/ToastStack.vue';
import { useEscToCloseModal } from '@/composables/useEscToCloseModal';
import { createRecord, getRecord, listAliveByDate, resetDbForTests, type Book, type Plan } from '@/db';
import { useDateStore } from '@/stores/date';
import { useSettingsStore } from '@/stores/settings';
import PlanView from './PlanView.vue';

/** 2026-06-01 是周一。 */
const BASE = new Date('2026-06-01T10:00:00').getTime();
const TODAY = '2026-06-01';
const TOMORROW = '2026-06-02';
const YESTERDAY = '2026-05-31';

const Stub = defineComponent({ template: '<div />' });

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/plan', component: Stub },
      { path: '/study/timer', component: Stub },
      { path: '/life/workout', component: Stub },
      { path: '/:pathMatch(.*)*', redirect: '/plan' },
    ],
  });
}

/** 与 App.vue 相同的运行环境：全局 Esc + ToastStack（撤销按钮）。 */
const Host = defineComponent({
  components: { PlanView, ToastStack },
  setup() {
    useEscToCloseModal();
  },
  template: '<div><input data-test="host-input" /><PlanView /><ToastStack /></div>',
});

type PlanData = Omit<Plan, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>;

function planData(date: string, title: string, overrides: Partial<PlanData> = {}): PlanData {
  return {
    title,
    date,
    start_min: null,
    end_min: null,
    category_key: 'other',
    category_name: '其他',
    target_type: null,
    target_id: null,
    target_title: null,
    done: false,
    done_at: null,
    rollover_from_date: null,
    is_rolled_over: false,
    ...overrides,
  };
}

async function makeBook(): Promise<Book> {
  return createRecord('books', {
    title: 'SICP',
    author: null,
    total_pages: 300,
    current_page: 40,
    status: 'reading',
    color: '#4a6cf7',
    start_date: null,
    finish_date: null,
  });
}

let pinia: Pinia;
let router: Router;
let wrapper: VueWrapper;

async function mountPage(): Promise<VueWrapper> {
  const w = mount(Host, {
    global: { plugins: [pinia, router], stubs: { Teleport: true } },
  });
  await router.push('/plan');
  await router.isReady();
  await vi.waitFor(
    () => {
      if (w.find('[data-test="plan-loading"]').exists()) throw new Error('计划尚未加载完成');
    },
    { timeout: 3000, interval: 20 },
  );
  await flushPromises();
  return w;
}

beforeEach(async () => {
  vi.useRealTimers();
  window.localStorage.clear();
  await resetDbForTests();
  pinia = createPinia();
  setActivePinia(pinia);
  router = makeRouter();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(BASE);
  await useSettingsStore().load();
});

afterEach(() => {
  vi.useRealTimers();
});

enableAutoUnmount(afterEach);

describe('计划页 #/plan', () => {
  it('顶部：完成进度 / 今日训练（weekday=今天）/ 昨日 MIT / 可顺延数量', async () => {
    await createRecord('plans', planData(TODAY, '已完成', { done: true, done_at: BASE }));
    await createRecord('plans', planData(TODAY, '未完成A'));
    await createRecord('plans', planData(TODAY, '未完成B'));
    await createRecord('workout_templates', { weekday: 1, type_name: '腿', exercise_names: ['深蹲'] });
    await createRecord('workout_templates', { weekday: 2, type_name: '背', exercise_names: ['引体'] });
    await createRecord('reviews', {
      date: YESTERDAY,
      rating: 4,
      mood: 4,
      energy: 4,
      good: null,
      improve: null,
      mit: '晨跑',
      mit_added_to_plan: false,
    });
    await createRecord('plans', planData(YESTERDAY, '昨天A'));
    await createRecord('plans', planData(YESTERDAY, '昨天B'));

    wrapper = await mountPage();
    expect(wrapper.find('[data-test="progress-row"]').text()).toContain('1 / 3');
    const workoutRow = wrapper.find('[data-test="workout-row"]');
    expect(workoutRow.text()).toContain('今日训练：腿');
    expect(wrapper.find('[data-test="workout-link"]').attributes('href')).toContain('/life/workout');
    expect(wrapper.find('[data-test="mit-row"]').text()).toContain('晨跑');
    expect(wrapper.find('[data-test="mit-add"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="rollover-btn"]').text()).toContain('（2）');
  });

  it('N 键打开新增弹窗；弹窗打开或输入框聚焦时不响应；Esc 关闭', async () => {
    wrapper = await mountPage();
    expect(wrapper.find('[data-test="plan-empty"]').exists()).toBe(true); // 空状态引导 + 主按钮

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    await flushPromises();
    expect(wrapper.find('[data-test="plan-form"]').exists()).toBe(true);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    await flushPromises();
    expect(wrapper.findAll('[data-test="plan-form"]')).toHaveLength(1); // 已打开不重复

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(wrapper.find('[data-test="plan-form"]').exists()).toBe(false);

    const hostInput = wrapper.find('[data-test="host-input"]');
    (hostInput.element as HTMLInputElement).focus();
    await hostInput.trigger('keydown', { key: 'n' });
    await flushPromises();
    expect(wrapper.find('[data-test="plan-form"]').exists()).toBe(false);
  });

  it('弹窗新增待办：写入 dateStore.selectedDate，分类快照为内置“其他”', async () => {
    wrapper = await mountPage();
    await wrapper.find('[data-test="add-plan-btn"]').trigger('click');
    await wrapper.find('[data-test="plan-form-title"]').setValue('背单词');
    await wrapper.find('[data-test="plan-form"]').trigger('submit');
    await vi.waitFor(
      () => {
        if (!wrapper.find('[data-test="todo-item"]').exists()) throw new Error('待办未出现');
      },
      { timeout: 3000, interval: 20 },
    );
    const item = wrapper.find('[data-test="todo-item"]');
    expect(item.text()).toContain('背单词');
    expect(item.text()).toContain('其他');
    const rows = await listAliveByDate('plans', TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.category_key).toBe('other');
    expect(rows[0]?.category_name).toBe('其他');
    expect(rows[0]?.date).toBe(TODAY);
  });

  it('安排时间 + 快捷时长：待办移入时间轴，不再出现在待办清单', async () => {
    const plan = await createRecord('plans', planData(TODAY, '读一章'));
    wrapper = await mountPage();
    await wrapper.find('[data-test="todo-schedule"]').trigger('click');
    await wrapper.find('[data-test="plan-form-start"]').setValue('09:00');
    await wrapper.find('[data-test="quick-30"]').trigger('click');
    expect((wrapper.find('[data-test="plan-form-end"]').element as HTMLInputElement).value).toBe('09:30');
    await wrapper.find('[data-test="plan-form"]').trigger('submit');
    await vi.waitFor(
      () => {
        if (!wrapper.find('[data-test="timeline-block"]').exists()) throw new Error('时间块未出现');
      },
      { timeout: 3000, interval: 20 },
    );
    expect(wrapper.find('[data-test="todo-list"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="todo-empty"]').exists()).toBe(true);
    const block = wrapper.find('[data-test="timeline-block"]');
    expect(block.text()).toContain('读一章');
    expect(block.attributes('data-start')).toBe('300');
    const row = await getRecord('plans', plan.id);
    expect(row?.start_min).toBe(300);
    expect(row?.end_min).toBe(330);
  });

  it('两个重叠时间块并排显示 + 重叠提示图标（不阻止保存）', async () => {
    await createRecord('plans', planData(TODAY, 'A块', { start_min: 300, end_min: 420 }));
    await createRecord('plans', planData(TODAY, 'B块', { start_min: 330, end_min: 390 }));
    wrapper = await mountPage();
    const blocks = wrapper.findAll('[data-test="timeline-block"]');
    expect(blocks).toHaveLength(2);
    expect(wrapper.findAll('[data-test="overlap-icon"]')).toHaveLength(2);
    expect(blocks.map((b) => b.attributes('data-lane')).sort()).toEqual(['0', '1']);
  });

  it('移到明天：今天不再显示，切到明天出现', async () => {
    const plan = await createRecord('plans', planData(TODAY, '写周报'));
    wrapper = await mountPage();
    await wrapper.find('[data-test="todo-tomorrow"]').trigger('click');
    await vi.waitFor(
      () => {
        if (wrapper.find('[data-test="todo-item"]').exists()) throw new Error('今天列表未清空');
      },
      { timeout: 3000, interval: 20 },
    );
    expect((await getRecord('plans', plan.id))?.date).toBe(TOMORROW);

    useDateStore().setSelected(TOMORROW);
    await vi.waitFor(
      () => {
        if (!wrapper.find('[data-test="todo-item"]').exists()) throw new Error('明天列表未出现');
      },
      { timeout: 3000, interval: 20 },
    );
    expect(wrapper.find('[data-test="todo-item"]').text()).toContain('写周报');
  });

  it('一键顺延：按钮显示可顺延数量，点击后克隆带“昨日顺延”标记，昨天原记录保留且防重复', async () => {
    await createRecord('plans', planData(YESTERDAY, '昨天A', { start_min: 600, end_min: 660 }));
    await createRecord('plans', planData(YESTERDAY, '昨天B'));
    wrapper = await mountPage();
    const btn = wrapper.find('[data-test="rollover-btn"]');
    expect(btn.text()).toContain('（2）');
    await btn.trigger('click');
    await vi.waitFor(
      () => {
        if (wrapper.findAll('[data-test="rollover-badge"]').length !== 2) {
          throw new Error('顺延克隆未出现');
        }
      },
      { timeout: 3000, interval: 20 },
    );
    const todayRows = await listAliveByDate('plans', TODAY);
    expect(todayRows).toHaveLength(2);
    expect(
      todayRows.every((p) => p.rollover_from_date === YESTERDAY && p.start_min === null && p.end_min === null),
    ).toBe(true);
    const yesterdayRows = await listAliveByDate('plans', YESTERDAY);
    expect(yesterdayRows).toHaveLength(2); // 昨日分母保留
    expect(yesterdayRows.every((p) => p.is_rolled_over)).toBe(true);
    expect(btn.text()).toContain('（0）');

    await btn.trigger('click'); // 防重复：数量已为 0，无新增
    expect(await listAliveByDate('plans', TODAY)).toHaveLength(2);
  });

  it('MIT：加入今日待办后按钮变“已加入”禁用；重新挂载仍保持（防重复）', async () => {
    await createRecord('reviews', {
      date: YESTERDAY,
      rating: 4,
      mood: 4,
      energy: 4,
      good: null,
      improve: null,
      mit: '晨跑',
      mit_added_to_plan: false,
    });
    wrapper = await mountPage();
    expect(wrapper.find('[data-test="mit-row"]').text()).toContain('晨跑');
    await wrapper.find('[data-test="mit-add"]').trigger('click');
    await vi.waitFor(
      () => {
        if (!wrapper.find('[data-test="mit-added"]').exists()) throw new Error('已加入状态未出现');
      },
      { timeout: 3000, interval: 20 },
    );
    expect(wrapper.find('[data-test="mit-add"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="mit-added"]').attributes('disabled')).toBeDefined();

    const rows = await listAliveByDate('plans', TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe('晨跑');
    expect(rows[0]?.category_key).toBe('other');
    expect(rows[0]?.category_name).toBe('其他');
    expect(rows[0]?.start_min).toBeNull();
    const review = (await listAliveByDate('reviews', YESTERDAY))[0];
    expect(review?.mit_added_to_plan).toBe(true);

    wrapper.unmount();
    wrapper = await mountPage();
    expect(wrapper.find('[data-test="mit-added"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="mit-add"]').exists()).toBe(false);
    expect(await listAliveByDate('plans', TODAY)).toHaveLength(1); // 未重复添加
  });

  it('带关联对象的时间块“开始”→ /study/timer?type=&id=&plan=', async () => {
    const book = await makeBook();
    const plan = await createRecord('plans', planData(TODAY, '读 SICP', {
      category_key: 'study',
      category_name: '学习',
      target_type: 'book',
      target_id: book.id,
      target_title: book.title,
    }));
    wrapper = await mountPage();
    expect(wrapper.find('[data-test="todo-item"]').text()).toContain('SICP');
    await wrapper.find('[data-test="todo-start"]').trigger('click');
    await vi.waitFor(
      () => {
        if (router.currentRoute.value.path !== '/study/timer') throw new Error('未跳转计时器');
      },
      { timeout: 3000, interval: 20 },
    );
    expect(router.currentRoute.value.query).toEqual({ type: 'book', id: book.id, plan: plan.id });
  });

  it('删除走软删除，5 秒内点“撤销”恢复', async () => {
    await createRecord('plans', planData(TODAY, '要删的'));
    wrapper = await mountPage();
    await wrapper.find('[data-test="todo-delete"]').trigger('click');
    await vi.waitFor(
      () => {
        if (!wrapper.find('[data-test="toast-undo"]').exists()) throw new Error('撤销提示未出现');
      },
      { timeout: 3000, interval: 20 },
    );
    expect(wrapper.find('[data-test="todo-item"]').exists()).toBe(false);
    expect(await listAliveByDate('plans', TODAY)).toHaveLength(0);

    await wrapper.find('[data-test="toast-undo"]').trigger('click');
    await vi.waitFor(
      () => {
        if (!wrapper.find('[data-test="todo-item"]').exists()) throw new Error('撤销后待办未恢复');
      },
      { timeout: 3000, interval: 20 },
    );
    expect(await listAliveByDate('plans', TODAY)).toHaveLength(1);
  });

  it('完成勾选为一键动作：写 done/done_at 且进度更新', async () => {
    await createRecord('plans', planData(TODAY, '待勾选'));
    await createRecord('plans', planData(TODAY, '时间块', { start_min: 300, end_min: 330 }));
    wrapper = await mountPage();
    expect(wrapper.find('[data-test="progress-row"]').text()).toContain('0 / 2');

    await wrapper.find('[data-test="todo-check"]').trigger('change');
    await vi.waitFor(
      () => {
        if (!wrapper.find('[data-test="progress-row"]').text().includes('1 / 2')) {
          throw new Error('进度未更新');
        }
      },
      { timeout: 3000, interval: 20 },
    );
    const rows = await listAliveByDate('plans', TODAY);
    const done = rows.find((p) => p.title === '待勾选');
    expect(done?.done).toBe(true);
    expect(done?.done_at).toBeGreaterThanOrEqual(BASE); // 假时钟按真实时间微漂移
    expect(done?.done_at).toBeLessThan(BASE + 60_000);
    expect(wrapper.find('[data-test="todo-item"]').classes()).toContain('done');
  });

  it('读/写跟随 dateStore.selectedDate：切到明天显示明天计划，新增也落到明天', async () => {
    await createRecord('plans', planData(TODAY, '今天的'));
    await createRecord('plans', planData(TOMORROW, '明天的'));
    wrapper = await mountPage();
    expect(wrapper.find('[data-test="todo-item"]').text()).toContain('今天的');

    useDateStore().setSelected(TOMORROW);
    await vi.waitFor(
      () => {
        if (!wrapper.find('[data-test="todo-item"]').text().includes('明天的')) {
          throw new Error('明天计划未显示');
        }
      },
      { timeout: 3000, interval: 20 },
    );
    expect(wrapper.find('[data-test="todo-item"]').text()).not.toContain('今天的');

    await wrapper.find('[data-test="add-plan-btn"]').trigger('click');
    await wrapper.find('[data-test="plan-form-title"]').setValue('明天新增');
    await wrapper.find('[data-test="plan-form"]').trigger('submit');
    await vi.waitFor(
      () => {
        if (wrapper.findAll('[data-test="todo-item"]').length !== 2) throw new Error('明天新增未写入');
      },
      { timeout: 3000, interval: 20 },
    );
    expect((await listAliveByDate('plans', TOMORROW)).map((p) => p.title)).toContain('明天新增');
    expect((await listAliveByDate('plans', TODAY)).map((p) => p.title)).not.toContain('明天新增');
  });

  it('今天无训练模板时“今日训练”整条不显示', async () => {
    wrapper = await mountPage();
    expect(wrapper.find('[data-test="workout-row"]').exists()).toBe(false);
  });
});

describe('N4 完成反馈（AC-74）', () => {
  it('勾选待办那一刻该行挂 done-flash；已完成的待办打开页面时不会自己动', async () => {
    await createRecord('plans', planData(TODAY, '待勾选'));
    await createRecord('plans', planData(TODAY, '早就完成', { done: true, done_at: BASE }));
    wrapper = await mountPage();

    const rows = wrapper.findAll('[data-test="todo-item"]');
    expect(rows).toHaveLength(2);
    // 打开页面：没有任何行在播完成动画
    expect(wrapper.findAll('[data-test="todo-item"].done-flash')).toHaveLength(0);

    const undone = rows.find((row) => !row.classes('done'))!;
    await undone.find('[data-test="todo-check"]').trigger('change');
    await vi.waitFor(() => {
      if (wrapper.findAll('[data-test="todo-item"].done-flash').length !== 1) {
        throw new Error('完成态没有闪一下');
      }
    }, { timeout: 3000, interval: 20 });

    // 等这次闪烁结束（180ms）后，取消勾选不应再播（只对"变成完成"方向）
    await vi.waitFor(() => {
      if (wrapper.findAll('[data-test="todo-item"].done-flash').length !== 0) {
        throw new Error('闪烁还没结束');
      }
    }, { timeout: 3000, interval: 20 });
    await wrapper.find('[data-test="todo-item"].done [data-test="todo-check"]').trigger('change');
    await flushPromises();
    expect(wrapper.findAll('[data-test="todo-item"].done-flash')).toHaveLength(0);
  });
});
