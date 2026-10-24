/**
 * 日期统计：某月“有主动记录”的逻辑日期集合（顶栏月历小点用）。
 *
 * 口径由用户拍板（不得扩表）：只算 plans / study_records / workout_records /
 * play_records / reviews 五张表；water / meals / excerpts 不参与；
 * 所有表都忽略 deleted_at !== null 的软删除行。
 */
import type { Table } from 'dexie';
import { pad2 } from '@/utils/date';
import { getDb } from './database';
import type { DateTableName } from './schema';

/** 计入“有主动记录”小点的表（顺序不影响结果）。 */
export const DATE_STAT_TABLES: readonly DateTableName[] = [
  'plans',
  'study_records',
  'workout_records',
  'play_records',
  'reviews',
];

interface DatedRow {
  date: string;
  deleted_at: number | null;
}

/**
 * 返回该月有主动记录的逻辑日期（YYYY-MM-DD，升序去重）。
 * @param year 四位年份
 * @param month 1~12
 */
export async function datesWithData(year: number, month: number): Promise<string[]> {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new Error(`非法年份：${year}`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`非法月份：${month}`);
  }
  const prefix = `${String(year).padStart(4, '0')}-${pad2(month)}`;
  const db = await getDb();
  const dates = new Set<string>();
  for (const tableName of DATE_STAT_TABLES) {
    const table = db[tableName] as unknown as Table<DatedRow, string>;
    const rows = await table.where('date').startsWith(prefix).toArray();
    for (const row of rows) {
      if (row.deleted_at === null) dates.add(row.date);
    }
  }
  return [...dates].sort();
}
