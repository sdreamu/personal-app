import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import type { Plan } from '@/db';
import { useDateStore } from '@/stores/date';
import type { SettingsRecord } from '@/db';
import { useSettingsStore } from '@/stores/settings';

/** 只替换「按日期取计划」，其余 db 导出保持原样（组件只用这一个函数）。 */
async function defaultPlans(_table: string, date: string): Promise<Plan[]> {
  if (date === '2026-10-26') return [planFixture(date, 'a'), planFixture(date, 'b')];
  return [];
}
const listAliveByDate = vi.fn(defaultPlans);
vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, listAliveByDate: (table: string, date: string) => listAliveByDate(table, date) };
});

const HomeSevenDays = (await import('./HomeSevenDays.vue')).default;

function planFixture(date: string, id: string): Plan {
  return {
    key: id,
    id,
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
    title: '读书',
    date,
    start_min: 120,
    end_min: 180,
    category_key: 'study',
    category_name: '学习',
    target_type: null,
    target_id: null,
    target_title: null,
    done: false,
    done_at: null,
    rollover_from_date: null,
    is_rolled_over: false,
  } as Plan;
}

const Stub = defineComponent({ template: '<div />' });
const routes: RouteRecordRaw[] = [
  { path: '/plan', component: Stub },
  { path: '/:pathMatch(.*)*', redirect: '/plan' },
];

/** 一天起点 04:00 的设置记录（settings store 的 dayStartMin 是派生 getter）。 */
function settingsRecord(): SettingsRecord {
  return {
    key: 'app',
    id: 'settings-1',
    created_at: 1,
    updated_at: 1,
    deleted_at: null,
    daily_study_min: 120,
    daily_water_ml: 2000,
    cup_ml: 250,
    daily_play_min: 60,
    day_start: '04:00',
    theme: 'light',
    last_backup_at: null,
  };
}

let pinia: Pinia;
let router: ReturnType<typeof createRouter>;

beforeEach(() => {
  vi.setSystemTime(new Date(2026, 9, 25, 10, 0, 0));
  listAliveByDate.mockClear();
  listAliveByDate.mockImplementation(defaultPlans);
  pinia = createPinia();
  setActivePinia(pinia);
  router = createRouter({ history: createWebHashHistory(), routes });
  useSettingsStore().$patch({ loaded: true, data: settingsRecord() });
  useDateStore().$patch({ selectedDate: '2026-10-25' });
});

async function mountSeven() {
  const wrapper = mount(HomeSevenDays, { global: { plugins: [pinia, router] } });
  await router.isReady();
  await flushPromises();
  return wrapper;
}

describe('首页未来七天', () => {
  it('首帧就渲染七天，避免查询完成时整块撑开', async () => {
    const wrapper = mount(HomeSevenDays, { global: { plugins: [pinia, router] } });
    expect(wrapper.findAll('.day')).toHaveLength(7);
    await flushPromises();
    expect(wrapper.findAll('.day')).toHaveLength(7);
    wrapper.unmount();
  });

  it('保留七天窗口，默认选中今天', async () => {
    const wrapper = await mountSeven();
    const days = wrapper.findAll('.day');
    expect(days).toHaveLength(7);
    expect(wrapper.find('[data-test="seven-day-2026-10-24"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="seven-day-2026-10-30"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="seven-day-2026-10-25"]').classes()).toContain('today');
    expect(wrapper.find('[data-test="seven-day-2026-10-25"]').attributes('aria-pressed')).toBe('true');
    expect(listAliveByDate).toHaveBeenCalledTimes(7);
  });

  it('空的一天写「0 件 / 还没有安排」，不当空白', async () => {
    const wrapper = await mountSeven();
    const empty = wrapper.find('[data-test="seven-day-2026-10-27"]');
    expect(empty.text()).toContain('0 件');
    await empty.trigger('click');
    expect(wrapper.find('[data-test="seven-empty"]').text()).toBe('这一天还没有安排');
    expect(wrapper.findAll('[data-test="seven-empty"]')).toHaveLength(1);
  });

  it('日期条只显示数量，选中后预览具体安排', async () => {
    const wrapper = await mountSeven();
    const day = wrapper.find('[data-test="seven-day-2026-10-26"]');
    expect(day.text()).toContain('2 件');
    expect(day.text()).not.toContain('读书');
    await day.trigger('click');
    expect(wrapper.findAll('[data-test="seven-preview-item"]')).toHaveLength(2);
    expect(wrapper.find('[data-test="seven-preview"]').text()).toContain('06:00');
  });

  it('选择日期不改全局日期；查看全部才进入该日列表', async () => {
    const wrapper = await mountSeven();
    await wrapper.find('[data-test="seven-day-2026-10-26"]').trigger('click');
    expect(useDateStore().selectedDate).toBe('2026-10-25');
    expect(router.currentRoute.value.query.view).toBeUndefined();
    await wrapper.find('[data-test="seven-view-all"]').trigger('click');
    await flushPromises();
    expect(useDateStore().selectedDate).toBe('2026-10-26');
    expect(router.currentRoute.value.path).toBe('/plan');
    expect(router.currentRoute.value.query.view).toBe('list');
  });

  it('最多三条，未完成优先，长清单通过查看全部打开', async () => {
    listAliveByDate.mockImplementation(async (_, date) => date === '2026-10-25'
      ? Array.from({ length: 8 }, (_, i) => ({ ...planFixture(date, String(i)), done: i === 0 })) : []);
    const wrapper = await mountSeven();
    expect(wrapper.findAll('[data-test="seven-preview-item"]')).toHaveLength(3);
    expect(wrapper.findAll('.preview-row.done')).toHaveLength(0);
    expect(wrapper.find('.preview-remaining').text()).toBe('还有 5 项');
    expect(wrapper.find('[data-test="seven-view-all"]').text()).toContain('8 项');
  });

  it('单日失败不掩盖其它日期，重试后恢复', async () => {
    let fail = true;
    listAliveByDate.mockImplementation(async (table, date) => {
      if (date === '2026-10-25' && fail) throw new Error('read failed');
      return defaultPlans(table, date);
    });
    const wrapper = await mountSeven();
    expect(wrapper.find('[role="alert"]').text()).toContain('未能加载');
    await wrapper.find('[data-test="seven-day-2026-10-26"]').trigger('click');
    expect(wrapper.findAll('[data-test="seven-preview-item"]')).toHaveLength(2);
    await wrapper.find('[data-test="seven-day-2026-10-25"]').trigger('click');
    fail = false;
    await wrapper.find('[role="alert"] button').trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="seven-empty"]').exists()).toBe(true);
  });
});
