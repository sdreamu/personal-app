import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import {
  createRecord,
  resetDbForTests,
  softDelete,
  type Meal,
  type Plan,
  type StudyRecord,
  type Water,
} from '@/db';
import MonthCalendar from './MonthCalendar.vue';

let pinia: Pinia;

function makePlan(date: string): Promise<Plan> {
  return createRecord('plans', {
    title: '月历测试',
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
  });
}

function makeStudy(date: string): Promise<StudyRecord> {
  return createRecord('study_records', {
    target_type: 'subject',
    target_id: null,
    target_title: '测试科目',
    start_at: 0,
    end_at: 0,
    duration_sec: 60,
    note: null,
    start_page: null,
    end_page: null,
    pages_read: null,
    source: 'manual',
    date,
  });
}

function makeWater(date: string): Promise<Water> {
  return createRecord('water', { date, ml: 250, at: 0 });
}

function makeMeal(date: string): Promise<Meal> {
  return createRecord('meals', { date, meal_key: 'breakfast', meal_name: '早', text: '测试', feeling: null });
}

function mountCalendar(selectedDate = '2026-01-15'): VueWrapper {
  return mount(MonthCalendar, {
    props: { selectedDate },
    global: { plugins: [pinia] },
  });
}

function day(wrapper: VueWrapper, date: string) {
  return wrapper.find(`[data-test="calendar-day"][data-date="${date}"]`);
}

function recordDatesOf(wrapper: VueWrapper): string[] {
  return wrapper
    .findAll('[data-test="calendar-day"][data-has-record="true"]')
    .map((node) => node.attributes('data-date') ?? '');
}

beforeEach(async () => {
  await resetDbForTests();
  pinia = createPinia();
  setActivePinia(pinia);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 0, 15, 12, 0, 0)); // 逻辑今天 = 2026-01-15
});

afterEach(() => {
  vi.useRealTimers();
});

describe('月历组件 MonthCalendar', () => {
  it('周一起始：2026 年 1 月 35 格，含上下月灰格补齐', async () => {
    const wrapper = mountCalendar();
    await flushPromises();

    const buttons = wrapper.findAll('[data-test="calendar-day"]');
    expect(buttons).toHaveLength(35);
    expect(buttons[0]!.attributes('data-date')).toBe('2025-12-29');
    expect(buttons[0]!.attributes('data-in-month')).toBe('false');
    expect(buttons[3]!.attributes('data-date')).toBe('2026-01-01');
    expect(buttons[3]!.attributes('data-in-month')).toBe('true');
    expect(buttons[34]!.attributes('data-date')).toBe('2026-02-01');
    expect(wrapper.findAll('[data-test="calendar-day"][data-in-month="true"]')).toHaveLength(31);
    expect(wrapper.find('[data-test="calendar-month-label"]').text()).toBe('2026年1月');
    expect(wrapper.find('.calendar-weekdays').text()).toBe('一二三四五六日');
  });

  it('今天与当前选中日分别高亮；同一天时两个标记同时成立', async () => {
    const same = mountCalendar('2026-01-15');
    await flushPromises();
    const todayAndSelected = day(same, '2026-01-15');
    expect(todayAndSelected.attributes('data-today')).toBe('true');
    expect(todayAndSelected.attributes('data-selected')).toBe('true');
    expect(todayAndSelected.classes()).toContain('is-today');
    expect(todayAndSelected.classes()).toContain('is-selected');
    expect(todayAndSelected.attributes('aria-current')).toBe('date');
    expect(todayAndSelected.attributes('aria-pressed')).toBe('true');

    const apart = mountCalendar('2026-01-10');
    await flushPromises();
    expect(day(apart, '2026-01-15').attributes('data-today')).toBe('true');
    expect(day(apart, '2026-01-15').attributes('data-selected')).toBe('false');
    expect(day(apart, '2026-01-10').attributes('data-today')).toBe('false');
    expect(day(apart, '2026-01-10').attributes('data-selected')).toBe('true');
    expect(day(apart, '2026-01-10').attributes('aria-pressed')).toBe('true');
  });

  it('点某一天（含上下月灰格）emit select，交给弹窗跳转并关闭', async () => {
    const wrapper = mountCalendar('2026-01-15');
    await flushPromises();

    await day(wrapper, '2026-01-20').trigger('click');
    await day(wrapper, '2025-12-30').trigger('click');

    expect(wrapper.emitted('select')).toEqual([['2026-01-20'], ['2025-12-30']]);
  });

  it('翻月只改变查看月份，不改变当前选中日、不 emit select', async () => {
    const wrapper = mountCalendar('2026-01-15');
    await flushPromises();

    await wrapper.find('[data-test="calendar-prev-month"]').trigger('click');
    expect(wrapper.find('[data-test="calendar-month-label"]').text()).toBe('2025年12月');
    expect(wrapper.findAll('[data-test="calendar-day"]')).toHaveLength(35);
    expect(wrapper.find('[data-test="calendar-day"]').attributes('data-date')).toBe('2025-12-01');
    expect(wrapper.findAll('[data-test="calendar-day"][data-selected="true"]')).toHaveLength(0);
    expect(wrapper.emitted('select')).toBeUndefined();

    await wrapper.find('[data-test="calendar-next-month"]').trigger('click');
    await wrapper.find('[data-test="calendar-next-month"]').trigger('click');
    expect(wrapper.find('[data-test="calendar-month-label"]').text()).toBe('2026年2月');
    expect(wrapper.find('[data-test="calendar-day"]').attributes('data-date')).toBe('2026-01-26');
    expect(wrapper.findAll('[data-test="calendar-day"][data-selected="true"]')).toHaveLength(0);
    expect(wrapper.emitted('select')).toBeUndefined();
    expect(wrapper.findComponent(MonthCalendar).props('selectedDate')).toBe('2026-01-15');
  });

  it('顶部「今天」按钮：从别的月份回到今天并 emit select', async () => {
    const wrapper = mountCalendar('2026-01-15');
    await flushPromises();

    await wrapper.find('[data-test="calendar-prev-month"]').trigger('click');
    await wrapper.find('[data-test="calendar-prev-month"]').trigger('click');
    expect(wrapper.find('[data-test="calendar-month-label"]').text()).toBe('2025年11月');

    await wrapper.find('[data-test="calendar-today"]').trigger('click');
    expect(wrapper.emitted('select')).toEqual([['2026-01-15']]);
  });

  it('小点：五张主动记录表有效记录有；water / meals / 软删除行没有', async () => {
    await makePlan('2026-01-05');
    await makeStudy('2026-01-20');
    const deleted = await makePlan('2026-01-08');
    await softDelete('plans', deleted.id);
    await makeWater('2026-01-06');
    await makeMeal('2026-01-07');
    await makePlan('2025-12-30'); // 上个月，不应出现在 1 月月历的小点里

    const wrapper = mountCalendar('2026-01-15');
    await vi.waitFor(() => {
      expect(recordDatesOf(wrapper)).toEqual(['2026-01-05', '2026-01-20']);
    });
    await flushPromises();
    expect(wrapper.findAll('[data-test="calendar-dot"]')).toHaveLength(2);
    expect(day(wrapper, '2026-01-06').attributes('data-has-record')).toBe('false');
    expect(day(wrapper, '2026-01-07').attributes('data-has-record')).toBe('false');
    expect(day(wrapper, '2026-01-08').attributes('data-has-record')).toBe('false');
  });

  it('翻到上个月会重新加载该月的小点', async () => {
    await makePlan('2026-01-05');
    await makePlan('2025-12-10');

    const wrapper = mountCalendar('2026-01-15');
    await vi.waitFor(() => {
      expect(recordDatesOf(wrapper)).toEqual(['2026-01-05']);
    });

    await wrapper.find('[data-test="calendar-prev-month"]').trigger('click');
    await vi.waitFor(() => {
      expect(recordDatesOf(wrapper)).toEqual(['2025-12-10']);
    });
  });

  it('可访问性：日期格是带 aria-label 的按钮，翻月与今天按钮可键盘操作', async () => {
    const wrapper = mountCalendar('2026-01-15');
    await flushPromises();

    const cells = wrapper.findAll('[data-test="calendar-day"]');
    for (const cell of cells) {
      expect(cell.element.tagName).toBe('BUTTON');
      expect((cell.attributes('aria-label') ?? '').length).toBeGreaterThan(0);
    }
    expect(day(wrapper, '2026-01-15').attributes('aria-label')).toContain('今天');
    expect(day(wrapper, '2026-01-15').attributes('aria-label')).toContain('当前选中');

    const prev = wrapper.find('[data-test="calendar-prev-month"]');
    const next = wrapper.find('[data-test="calendar-next-month"]');
    const today = wrapper.find('[data-test="calendar-today"]');
    for (const button of [prev, next, today]) {
      expect(button.element.tagName).toBe('BUTTON');
      expect(button.attributes('type')).toBe('button');
    }
    expect(prev.attributes('aria-label')).toBe('上个月');
    expect(next.attributes('aria-label')).toBe('下个月');
    expect(today.attributes('aria-label')).toBe('回到今天');
  });
});
