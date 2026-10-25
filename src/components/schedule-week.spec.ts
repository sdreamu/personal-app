import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import type { Plan, StudyRecord } from '@/db';
import { useDateStore } from '@/stores/date';
import type { SettingsRecord } from '@/db';
import { useSettingsStore } from '@/stores/settings';

/** 只替换「按日期取记录」：学习 1 条 5400 秒 = 90 分钟。 */
const listAliveByDate = vi.fn(async (table: string, date: string) => {
  if (table === 'study_records') {
    return date === '2026-10-25' ? [recordFixture(date)] : [];
  }
  if (date === '2026-10-25') {
    return [
      planFixture(date, 'a', 'study', 120, 180, true),
      planFixture(date, 'b', 'life', 300, 360, false),
    ];
  }
  return [];
});
vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, listAliveByDate: (table: string, date: string) => listAliveByDate(table, date) };
});

const ScheduleWeek = (await import('./ScheduleWeek.vue')).default;

function planFixture(
  date: string,
  id: string,
  category: string,
  start: number,
  end: number,
  done: boolean,
): Plan {
  return {
    key: id,
    id,
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
    title: '写周报 ' + id,
    date,
    start_min: start,
    end_min: end,
    category_key: category,
    category_name: category,
    target_type: null,
    target_id: null,
    target_title: null,
    done,
    done_at: null,
    rollover_from_date: null,
    is_rolled_over: false,
  } as Plan;
}

function recordFixture(date: string): StudyRecord {
  return {
    key: 'r1',
    id: 'r1',
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
    target_type: 'subject',
    target_id: null,
    target_title: '微积分',
    start_at: 0,
    end_at: 5400,
    duration_sec: 5400,
    note: null,
    start_page: null,
    end_page: null,
    pages_read: null,
    source: 'timer',
    date,
  } as StudyRecord;
}

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

beforeEach(() => {
  vi.setSystemTime(new Date(2026, 9, 25, 10, 0, 0));
  listAliveByDate.mockClear();
  pinia = createPinia();
  setActivePinia(pinia);
  useSettingsStore().$patch({ loaded: true, data: settingsRecord() });
  useDateStore().$patch({ selectedDate: '2026-10-25' });
});

async function mountWeek() {
  const wrapper = mount(ScheduleWeek, { global: { plugins: [pinia] } });
  await vi.dynamicImportSettled();
  await wrapper.vm.$nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await wrapper.vm.$nextTick();
  return wrapper;
}

describe('日程页一周概览', () => {
  it('默认窗口 7 天：昨天 → 后五天，今天那列反相、当前选中那列描边', async () => {
    const wrapper = await mountWeek();
    expect(wrapper.findAll('.day')).toHaveLength(7);
    expect(wrapper.find('[data-test="week-day-2026-10-24"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="week-day-2026-10-30"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="week-day-2026-10-25"]').classes()).toContain('today');
    expect(wrapper.find('[data-test="week-day-2026-10-25"]').classes()).toContain('sel');
  });

  it('列脚摘要：件数 + 学习时长 + 主项', async () => {
    const wrapper = await mountWeek();
    const day = wrapper.find('[data-test="week-day-2026-10-25"]');
    expect(day.text()).toContain('2 件');
    expect(day.text()).toContain('01:30:00');
    // 主项取「还没做完的那件」（a 已完成，所以显示 b）
    expect(day.text()).toContain('写周报 b');
    expect(day.text()).toContain('完成 1/2');
  });

  it('三条泳道分开画：学习 1 根、生活 1 根、其它 0 根', async () => {
    const wrapper = await mountWeek();
    const day = wrapper.find('[data-test="week-day-2026-10-25"]');
    expect(day.findAll('.lane-study .bar')).toHaveLength(1);
    expect(day.findAll('.lane-life .bar')).toHaveLength(1);
    expect(day.findAll('.lane-other .bar')).toHaveLength(0);
  });

  it('空的一天写「0 件 / 还没有安排」，不当空白', async () => {
    const wrapper = await mountWeek();
    const day = wrapper.find('[data-test="week-day-2026-10-27"]');
    expect(day.text()).toContain('0 件');
    expect(day.text()).toContain('还没有安排');
  });

  it('点某天只切换下面的单日时间轴，不跳页', async () => {
    const wrapper = await mountWeek();
    await wrapper.find('[data-test="week-day-2026-10-28"]').trigger('click');
    expect(useDateStore().selectedDate).toBe('2026-10-28');
  });
});
