/**
 * 文本导出的数据装载层：从数据库读「有效记录」（deleted_at === null），
 * 组装成 exportText() 需要的 ExportSource。
 *
 * 约定：
 * - 不做区间裁剪：所有表都按有效记录全量取，区间过滤交给 exportText() 里的 inRange /
 *   按天分段逻辑（书的「区间内有活动」也要看区间外的 start_date，裁剪会算错）。
 *   好处是导出内容与 exportText 的单测口径完全一致，这里只负责「装数据」。
 * - 只读：绝不写库（尤其不碰 settings.last_backup_at —— 文本导出不刷新备份提醒）。
 * - 文件名与区间预设都是纯函数，放在这里便于单测。
 */
import type { Table } from 'dexie';
import { getDb } from './database';
import { getSettings } from './settings';
import { addDays, dateKeyOf, parseDateKey } from '@/utils/date';
import type { BaseFields, DateTableName, TableName, TableRecordMap } from './schema';
import type { ExportSource } from './exportText';

/** 带 date 索引（逻辑日期）的表 —— 「全部」区间的起点候选。 */
const DATED_TABLES: readonly DateTableName[] = [
  'plans',
  'study_records',
  'meals',
  'water',
  'workout_records',
  'play_records',
  'reviews',
  'mistakes',
];

/** 「一条记录都没有」时「全部」区间的兜底天数（含今天，共 30 天）。 */
export const ALL_RANGE_FALLBACK_DAYS = 30;

async function aliveRows<K extends TableName>(tableName: K): Promise<TableRecordMap[K][]> {
  const db = await getDb();
  const table = db[tableName] as unknown as Table<TableRecordMap[K] & BaseFields, string>;
  return table.filter((record) => record.deleted_at === null).toArray();
}

/** 读全部导出用表（只取有效记录）并组装 ExportSource；区间内过滤由 exportText() 负责。 */
export async function loadExportSource(start: string, end: string): Promise<ExportSource> {
  const [
    settings,
    exercises,
    plans,
    study_records,
    books,
    excerpts,
    meals,
    water,
    workout_records,
    play_records,
    reviews,
    mistakes,
  ] = await Promise.all([
    getSettings(),
    aliveRows('exercises'),
    aliveRows('plans'),
    aliveRows('study_records'),
    aliveRows('books'),
    aliveRows('excerpts'),
    aliveRows('meals'),
    aliveRows('water'),
    aliveRows('workout_records'),
    aliveRows('play_records'),
    aliveRows('reviews'),
    aliveRows('mistakes'),
  ]);
  return {
    start,
    end,
    settings,
    exercises,
    plans,
    study_records,
    books,
    excerpts,
    meals,
    water,
    workout_records,
    play_records,
    reviews,
    mistakes,
  };
}

/**
 * 最早有记录的日期（'YYYY-MM-DD'），一条都没有时返回 null。
 * 有 date 字段的表按 date 取最小；摘录没有 date，按 created_at 换算本地日期。
 */
export async function getEarliestRecordDate(): Promise<string | null> {
  const db = await getDb();
  let earliest: string | null = null;
  const consider = (date: string): void => {
    if (earliest === null || date < earliest) earliest = date;
  };
  for (const name of DATED_TABLES) {
    const table = db[name] as unknown as Table<{ date: string; deleted_at: number | null }, string>;
    await table
      .filter((record) => record.deleted_at === null)
      .each((record) => consider(record.date));
  }
  await db.excerpts
    .filter((record) => record.deleted_at === null)
    .each((record) => consider(dateKeyOf(record.created_at)));
  return earliest;
}

/** 区间预设：最近 7 天 / 最近 30 天 / 全部 / 自定义起止日期。 */
export type TextRangePreset = 'last7' | 'last30' | 'all' | 'custom';

export interface DateRange {
  /** 起始日期 'YYYY-MM-DD'（含）。 */
  start: string;
  /** 结束日期 'YYYY-MM-DD'（含）。 */
  end: string;
}

/** 「全部」= 最早有记录的日期 ~ 今天；完全没有记录时退回最近 30 天。 */
export function resolveAllRange(earliest: string | null, today: string): DateRange {
  if (earliest === null) return { start: addDays(today, -(ALL_RANGE_FALLBACK_DAYS - 1)), end: today };
  // 记录都在未来（改过系统时间等）时不越过今天，避免导出空区间。
  return { start: earliest <= today ? earliest : today, end: today };
}

/** 把预设 + 自定义输入解析成实际区间；自定义日期非法时抛错（由调用方 toast）。 */
export function resolveTextRange(
  preset: TextRangePreset,
  today: string,
  earliest: string | null,
  custom: DateRange = { start: '', end: '' },
): DateRange {
  switch (preset) {
    case 'last7':
      return { start: addDays(today, -6), end: today };
    case 'last30':
      return { start: addDays(today, -29), end: today };
    case 'all':
      return resolveAllRange(earliest, today);
    case 'custom': {
      if (parseDateKey(custom.start) === null || parseDateKey(custom.end) === null) {
        throw new Error('请选择有效的起止日期');
      }
      // 起止填反了自动对调，不静默出一份空文本。
      return custom.start <= custom.end ? { start: custom.start, end: custom.end } : { start: custom.end, end: custom.start };
    }
  }
}

/** 文本导出文件名：evan-text-YYYYMMDD-YYYYMMDD.md（起止日期，去横线）。 */
export function textExportFileName(start: string, end: string): string {
  const compact = (date: string): string => date.replace(/-/g, '');
  return 'evan-text-' + compact(start) + '-' + compact(end) + '.md';
}
