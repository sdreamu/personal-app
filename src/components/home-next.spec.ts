import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent } from 'vue';
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import type { Plan, SettingsRecord } from '@/db';
import { useDateStore } from '@/stores/date';
import { usePlanStore } from '@/stores/plan';
import { useSettingsStore } from '@/stores/settings';

const TODAY = '2026-10-25';
const TOMORROW = '2026-10-26';

/** 今天：一个未完成时间块（起点偏移 720 = 16:00 起）+ 一个无时间待办；明天：一件偏移 480 = 12:00 的晨读。
 *  一天起点是 04:00（settings.day_start），所以偏移要加 4 小时才是墙上时间。 */
const listAliveByDate = vi.fn(async (_table: string, date: string): Promise<Plan[]> => {
  if (date === TODAY) {
    return [
      planFixture(date, 'a', '微积分习题', 720, 780),
      planFixture(date, 'b', '买牛奶', null, null),
      planFixture(date, 'c', '已完成的事', 500, 540, true),
    ];
  }
  if (date === TOMORROW) return [planFixture(date, 'd', '晨读', 480, 540)];
  return [];
});
vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, listAliveByDate: (table: string, date: string) => listAliveByDate(table, date) };
});

const HomeNext = (await import('./HomeNext.vue')).default;

function planFixture(
  date: string,
  id: string,
  title: string,
  start: number | null,
  end: number | null,
  done = false,
): Plan {
  return {
    key: id,
    id,
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
    title,
    date,
    start_min: start,
    end_min: end,
    category_key: 'study',
    category_name: '学习',
    target_type: null,
    target_id: null,
    target_title: null,
    done,
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
  pinia = createPinia();
  setActivePinia(pinia);
  router = createRouter({ history: createWebHashHistory(), routes });
  useSettingsStore().$patch({ loaded: true, data: settingsRecord() });
  useDateStore().$patch({ selectedDate: TODAY });
});

async function mountNext() {
  const wrapper = mount(HomeNext, { global: { plugins: [pinia, router] } });
  await router.isReady();
  await flushPromises();
  return wrapper;
}

describe('首页接下来', () => {
  it('三行封顶：今天下一个时间块、无时间待办、明天第一件', async () => {
    const wrapper = await mountNext();
    const rows = wrapper.findAll('.next-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]?.text()).toContain('16:00–17:00');
    expect(rows[0]?.text()).toContain('微积分习题');
    expect(rows[1]?.text()).toContain('无时间');
    expect(rows[1]?.text()).toContain('买牛奶');
    expect(rows[2]?.text()).toContain('明天 12:00');
    expect(rows[2]?.text()).toContain('晨读');
    // 已完成的那条不出现
    expect(wrapper.text()).not.toContain('已完成的事');
  });

  it('第一行反白标记（荧光笔），且只有一处', async () => {
    const wrapper = await mountNext();
    expect(wrapper.findAll('mark.hl')).toHaveLength(1);
  });

  it('无时间待办可以就地「完成」，完成后重新聚合', async () => {
    const wrapper = await mountNext();
    const toggles = vi.spyOn(usePlanStore(), 'toggleDone').mockResolvedValue(undefined);
    await wrapper.find('[data-test="next-done-1"]').trigger('click');
    await flushPromises();
    expect(toggles).toHaveBeenCalledTimes(1);
    expect(toggles.mock.calls[0]?.[0].title).toBe('买牛奶');
  });

  it('「开始」跳到日程页并把日期切到今天', async () => {
    const wrapper = await mountNext();
    useDateStore().$patch({ selectedDate: '2026-10-30' });
    await wrapper.find('[data-test="next-start-0"]').trigger('click');
    await flushPromises();
    expect(useDateStore().selectedDate).toBe(TODAY);
    expect(router.currentRoute.value.path).toBe('/plan');
  });

  it('今天空了就直说明天：不编造今天的行', async () => {
    listAliveByDate.mockImplementation(async (_table: string, date: string) =>
      date === TOMORROW ? [planFixture(date, 'd', '晨读', 480, 540)] : [],
    );
    const wrapper = await mountNext();
    const rows = wrapper.findAll('.next-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.text()).toContain('明天 12:00');
    listAliveByDate.mockReset();
  });
});

describe('N4 首页「完成」的完成反馈（AC-74）', () => {
  it('点「完成」后该行挂 done-flash，其它行不挂', async () => {
    const wrapper = await mountNext();
    vi.spyOn(usePlanStore(), 'toggleDone').mockResolvedValue(undefined);
    expect(wrapper.findAll('.next-row.done-flash')).toHaveLength(0);

    await wrapper.find('[data-test="next-done-1"]').trigger('click');
    await flushPromises();
    const flashing = wrapper.findAll('.next-row.done-flash');
    expect(flashing).toHaveLength(1);
    expect(flashing[0]?.text()).toContain('买牛奶');
  });
});
