import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import type { Plan } from '@/db';
import { useDateStore } from '@/stores/date';
import { useSettingsStore } from '@/stores/settings';

/** 只替换「按日期取计划」，其余 db 导出保持原样（组件只用这一个函数）。 */
const listAliveByDate = vi.fn(async (_table: string, date: string): Promise<Plan[]> => {
  if (date === '2026-10-26') return [planFixture(date, 'a'), planFixture(date, 'b')];
  return [];
});
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

let pinia: Pinia;
let router: ReturnType<typeof createRouter>;

beforeEach(() => {
  vi.setSystemTime(new Date(2026, 9, 25, 10, 0, 0));
  listAliveByDate.mockClear();
  pinia = createPinia();
  setActivePinia(pinia);
  router = createRouter({ history: createWebHashHistory(), routes });
  useSettingsStore().$patch({ loaded: true, dayStartMin: 240 });
  useDateStore().$patch({ selectedDate: '2026-10-25' });
});

async function mountSeven() {
  const wrapper = mount(HomeSevenDays, { global: { plugins: [pinia, router] } });
  await router.isReady();
  await flushPromises();
  return wrapper;
}

describe('首页未来七天', () => {
  it('默认窗口是「昨天 → 后五天」共 7 天，今天那列反相', async () => {
    const wrapper = await mountSeven();
    const days = wrapper.findAll('.day');
    expect(days).toHaveLength(7);
    expect(wrapper.find('[data-test="seven-day-2026-10-24"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="seven-day-2026-10-30"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="seven-day-2026-10-25"]').classes()).toContain('today');
    expect(listAliveByDate).toHaveBeenCalledTimes(7);
  });

  it('空的一天写「0 件 / 还没有安排」，不当空白', async () => {
    const wrapper = await mountSeven();
    const empty = wrapper.find('[data-test="seven-day-2026-10-27"]');
    expect(empty.text()).toContain('0 件');
    expect(empty.text()).toContain('还没有安排');
  });

  it('有安排的一天给件数与主项', async () => {
    const wrapper = await mountSeven();
    const day = wrapper.find('[data-test="seven-day-2026-10-26"]');
    expect(day.text()).toContain('2 件');
    expect(day.text()).toContain('读书');
    expect(day.findAll('.bar').length).toBe(2);
  });

  it('点某天把日期切过去并跳到日程页', async () => {
    const wrapper = await mountSeven();
    await wrapper.find('[data-test="seven-day-2026-10-28"]').trigger('click');
    await flushPromises();
    expect(useDateStore().selectedDate).toBe('2026-10-28');
    expect(router.currentRoute.value.path).toBe('/plan');
  });
});
