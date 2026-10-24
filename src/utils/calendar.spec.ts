import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  daysInMonth,
  monthLabel,
  monthOfDateKey,
  shiftMonth,
} from './calendar';
import { weekdayCN } from './date';

afterEach(() => {
  vi.useRealTimers();
});

describe('月历纯函数：daysInMonth', () => {
  it('平年/闰年与大小月的天数', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('非法年月报错，不静默返回错误值', () => {
    expect(() => daysInMonth(2026, 0)).toThrow('非法月份');
    expect(() => daysInMonth(2026, 13)).toThrow('非法月份');
    expect(() => daysInMonth(2026, 1.5)).toThrow('非法月份');
    expect(() => daysInMonth(0, 1)).toThrow('非法年份');
  });
});

describe('月历纯函数：月份工具', () => {
  it('monthOfDateKey 解析日期键；非法日期报错', () => {
    expect(monthOfDateKey('2026-01-15')).toEqual({ year: 2026, month: 1 });
    expect(monthOfDateKey('2024-02-29')).toEqual({ year: 2024, month: 2 });
    expect(() => monthOfDateKey('2026-02-30')).toThrow('不是合法日期');
    expect(() => monthOfDateKey('2026-1-1')).toThrow('不是合法日期');
  });

  it('shiftMonth 跨年滚动（前后都可）', () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 6, -18)).toEqual({ year: 2024, month: 12 });
    expect(shiftMonth(2026, 6, 0)).toEqual({ year: 2026, month: 6 });
    expect(() => shiftMonth(2026, 13, 1)).toThrow('非法月份');
  });

  it('monthLabel 输出“YYYY年M月”，周表头从周一开始', () => {
    expect(monthLabel(2026, 1)).toBe('2026年1月');
    expect(monthLabel(2026, 12)).toBe('2026年12月');
    expect(WEEKDAY_LABELS).toEqual(['一', '二', '三', '四', '五', '六', '日']);
  });
});

describe('月历纯函数：buildMonthGrid', () => {
  it('2026 年 1 月：周一起始，35 格，含上下月灰格补齐', () => {
    const cells = buildMonthGrid(2026, 1, { today: '2026-01-15' });
    expect(cells).toHaveLength(35);
    expect(cells).toHaveLength((cells.length / 7) * 7);
    // 2026-01-01 是周四 → 从 2025-12-29（周一）开始
    expect(cells[0]!.date).toBe('2025-12-29');
    expect(weekdayCN(cells[0]!.date)).toBe('周一');
    expect(cells[0]!.in_month).toBe(false);
    expect(cells[2]!.date).toBe('2025-12-31');
    expect(cells[3]!.date).toBe('2026-01-01');
    expect(cells[3]!.in_month).toBe(true);
    expect(cells[cells.length - 1]!.date).toBe('2026-02-01');
    expect(cells[cells.length - 1]!.in_month).toBe(false);
    expect(cells.filter((cell) => cell.in_month)).toHaveLength(31);
    for (const cell of cells.slice(0, 3)) expect(cell.in_month).toBe(false);
  });

  it('2026 年 3 月：需要 6 行（42 格）', () => {
    const cells = buildMonthGrid(2026, 3, { today: '2026-03-01' });
    expect(cells).toHaveLength(42);
    expect(cells[0]!.date).toBe('2026-02-23');
    expect(cells[cells.length - 1]!.date).toBe('2026-04-05');
    expect(cells.filter((cell) => cell.in_month)).toHaveLength(31);
  });

  it('2026 年 2 月：28 天仍补齐整周（35 格）', () => {
    const cells = buildMonthGrid(2026, 2, { today: '2026-02-01' });
    expect(cells).toHaveLength(35);
    expect(cells[0]!.date).toBe('2026-01-26');
    expect(cells[cells.length - 1]!.date).toBe('2026-03-01');
    expect(cells.filter((cell) => cell.in_month)).toHaveLength(28);
  });

  it('今天 / 选中日 / 有记录三个标记互不干扰', () => {
    const cells = buildMonthGrid(2026, 1, {
      today: '2026-01-15',
      selected: '2026-01-15',
      recordDates: ['2026-01-05', '2026-01-05', '2026-01-20'],
    });
    const todayCell = cells.find((cell) => cell.date === '2026-01-15')!;
    expect(todayCell.is_today).toBe(true);
    expect(todayCell.is_selected).toBe(true);
    expect(todayCell.has_record).toBe(false);

    const recorded = cells.filter((cell) => cell.has_record).map((cell) => cell.date);
    expect(recorded).toEqual(['2026-01-05', '2026-01-20']);
    expect(cells.find((cell) => cell.date === '2026-01-06')!.has_record).toBe(false);
    expect(cells.find((cell) => cell.date === '2026-01-06')!.is_today).toBe(false);
    expect(cells.find((cell) => cell.date === '2026-01-06')!.is_selected).toBe(false);
  });

  it('选中日可以不在当前月（翻月后仍保留选中日，不强行塞进格子）', () => {
    const cells = buildMonthGrid(2026, 2, { today: '2026-01-15', selected: '2026-01-15' });
    expect(cells.some((cell) => cell.is_selected)).toBe(false);
    expect(cells.some((cell) => cell.is_today)).toBe(false);
  });

  it('不读时钟：系统时间变化不影响同一份输入的结果', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2020, 0, 1, 12, 0, 0));
    const first = buildMonthGrid(2026, 1, { today: '2026-01-15', selected: '2026-01-10' });
    vi.setSystemTime(new Date(2030, 5, 5, 12, 0, 0));
    const second = buildMonthGrid(2026, 1, { today: '2026-01-15', selected: '2026-01-10' });
    expect(second).toEqual(first);
  });

  it('非法输入直接报错（今天必须由调用方注入合法日期键）', () => {
    expect(() => buildMonthGrid(2026, 1, { today: '2026-02-30' })).toThrow('“今天”不是合法日期');
    expect(() => buildMonthGrid(2026, 1, { today: '2026-01-15', selected: '2026-13-01' })).toThrow(
      '选中日不是合法日期',
    );
    expect(() => buildMonthGrid(2026, 13, { today: '2026-01-15' })).toThrow('非法月份');
  });
});
