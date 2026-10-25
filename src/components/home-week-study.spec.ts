import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import type { SettingsRecord, StudyRecord } from '@/db';
import { useSettingsStore } from '@/stores/settings';

/** 本周（周一 2026-10-19 起）三天有学习：周一 30 分、周三 20 分、今天（周六）15 分。 */
const listAliveByDate = vi.fn(async (table: string, date: string): Promise<StudyRecord[]> => {
  if (table !== 'study_records') return [];
  const minutes: Record<string, number> = {
    '2026-10-19': 30,
    '2026-10-21': 20,
    '2026-10-24': 15,
  };
  const value = minutes[date];
  return value === undefined ? [] : [recordFixture(date, value * 60)];
});
vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, listAliveByDate: (table: string, date: string) => listAliveByDate(table, date) };
});

const HomeWeekStudy = (await import('./HomeWeekStudy.vue')).default;

function recordFixture(date: string, duration: number): StudyRecord {
  return {
    key: `r-${date}`,
    id: `r-${date}`,
    created_at: 0,
    updated_at: 0,
    deleted_at: null,
    target_type: 'subject',
    target_id: null,
    target_title: '微积分',
    start_at: 0,
    end_at: duration * 1000,
    duration_sec: duration,
    note: null,
    start_page: null,
    end_page: null,
    pages_read: null,
    source: 'timer',
    date,
  } as StudyRecord;
}

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
  vi.setSystemTime(new Date(2026, 9, 24, 21, 0, 0));
  listAliveByDate.mockClear();
  pinia = createPinia();
  setActivePinia(pinia);
  useSettingsStore().$patch({ loaded: true, data: settingsRecord() });
});

async function mountWeek() {
  const wrapper = mount(HomeWeekStudy, { global: { plugins: [pinia] } });
  await flushPromises();
  return wrapper;
}

describe('首页本周学习', () => {
  it('七根柱子，按周一到周日排，今天那根反白', async () => {
    const wrapper = await mountWeek();
    const cols = wrapper.findAll('.week-col');
    expect(cols).toHaveLength(7);
    expect(wrapper.find('[data-test="week-bar-2026-10-19"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="week-bar-2026-10-25"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="week-bar-2026-10-24"]').classes()).toContain('today');
    expect(listAliveByDate).toHaveBeenCalledTimes(7);
  });

  it('本周合计 + 一周目标（每天 120 分 → 14 小时）', async () => {
    const wrapper = await mountWeek();
    expect(wrapper.find('.week-sum').text()).toContain('本周 1 小时 5 分');
    expect(wrapper.find('.week-sum').text()).toContain('目标 14 小时');
  });

  it('最高的那天占满柱高，其余按比例', async () => {
    const wrapper = await mountWeek();
    const heights = wrapper.findAll('.week-col').map((col) => (col.find('.week-bar').element as HTMLElement).style.height);
    expect(heights[0]).toBe('100%');
    expect(heights[2]).toBe('67%');
  });
});
