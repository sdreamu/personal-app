/**
 * 月历纯函数（顶栏日期跳转弹窗的月历网格）。
 * 约定：
 * - 一周起点固定为周一（与 utils/date 的 weekStart 一致）；
 * - 不读时钟：所有“今天”必须由调用方通过 options.today 注入；
 * - 不碰数据库：有记录的日期由调用方传入（见 db/dateStats.ts 的 datesWithData）。
 */
import { addDays, pad2, parseDateKey, weekStart } from './date';

export interface CalendarCell {
  /** 逻辑日期键 'YYYY-MM-DD'。 */
  readonly date: string;
  /** 当月第几天 1~31（上月/下月补齐格也有值）。 */
  readonly day: number;
  /** 是否属于当前查看的月份；false = 上/下个月补齐的灰格。 */
  readonly in_month: boolean;
  readonly is_today: boolean;
  readonly is_selected: boolean;
  readonly has_record: boolean;
}

export interface MonthGridOptions {
  /** 调用方注入的“今天”（logicalToday 的结果），必须是合法日期键。 */
  readonly today: string;
  /** 当前选中日（可选）。 */
  readonly selected?: string;
  /** 该月有主动记录的日期（可选，来自 datesWithData）。 */
  readonly recordDates?: Iterable<string>;
}

/** 周一 → 周日的表头文案。 */
export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;

function assertMonth(year: number, month: number): void {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new Error(`非法年份：${year}`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`非法月份：${month}`);
  }
}

function assertDateKey(dateKey: string, label: string): void {
  if (parseDateKey(dateKey) === null) {
    throw new Error(`${label}不是合法日期：${dateKey}`);
  }
}

/** 某年某月的天数（1~12 月；闰年 2 月 29 天）。 */
export function daysInMonth(year: number, month: number): number {
  assertMonth(year, month);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1]!;
}

/** 'YYYY-MM-DD' → { year, month }（1~12 月）。 */
export function monthOfDateKey(dateKey: string): { year: number; month: number } {
  assertDateKey(dateKey, '日期');
  const d = parseDateKey(dateKey)!;
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/** 月份加减（delta 可为负），跨年正确滚动。 */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  assertMonth(year, month);
  if (!Number.isInteger(delta)) throw new Error(`非法月份偏移：${delta}`);
  const index = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(index / 12);
  const nextMonth = index - nextYear * 12 + 1;
  assertMonth(nextYear, nextMonth);
  return { year: nextYear, month: nextMonth };
}

/** '2026年1月'（月历标题）。 */
export function monthLabel(year: number, month: number): string {
  assertMonth(year, month);
  return `${year}年${month}月`;
}

/**
 * 生成该月的月历格：从当月 1 号所在周的周一起，到最后一天所在周的周日止。
 * 因此格子数一定是 7 的倍数（28~42），上月/下月补齐格标记 in_month=false。
 */
export function buildMonthGrid(year: number, month: number, options: MonthGridOptions): CalendarCell[] {
  assertMonth(year, month);
  assertDateKey(options.today, '“今天”');
  if (options.selected !== undefined) assertDateKey(options.selected, '选中日');

  const firstOfMonth = `${year}-${pad2(month)}-01`;
  const lastOfMonth = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`;
  const gridStart = weekStart(firstOfMonth);
  const gridEnd = addDays(weekStart(lastOfMonth), 6);
  const recordDates = new Set(options.recordDates ?? []);

  const cells: CalendarCell[] = [];
  let cursor = gridStart;
  while (cursor <= gridEnd) {
    const d = parseDateKey(cursor);
    if (d === null) throw new Error(`非法日期：${cursor}`);
    cells.push({
      date: cursor,
      day: d.getDate(),
      in_month: d.getFullYear() === year && d.getMonth() + 1 === month,
      is_today: cursor === options.today,
      is_selected: cursor === options.selected,
      has_record: recordDates.has(cursor),
    });
    cursor = addDays(cursor, 1);
  }
  return cells;
}
