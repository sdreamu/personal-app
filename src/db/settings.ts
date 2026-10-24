/**
 * 设置读写、上次备份时间、最早数据时间（备份提醒用）。
 */
import { getDb, seedFirstRun } from './database';
import type { BaseFields } from './schema';
import { DATA_TABLES, type SettingsRecord, type TableName, type TableRecordMap } from './schema';
import type { Table } from 'dexie';
import { nowMs } from './util';

export async function getSettings(): Promise<SettingsRecord> {
  const db = await getDb();
  const row = await db.settings.get('app');
  if (row) return row;
  await seedFirstRun(db);
  const after = await db.settings.get('app');
  if (!after) throw new Error('设置初始化失败');
  return after;
}

export async function updateSettings(patch: Partial<SettingsRecord>): Promise<SettingsRecord> {
  await getSettings(); // 确保单行存在
  const db = await getDb();
  await db.settings.update('app', { ...patch, updated_at: nowMs() });
  const row = await db.settings.get('app');
  if (!row) throw new Error('设置行不存在');
  return row;
}

export async function setLastBackupAt(tsMs: number): Promise<void> {
  await updateSettings({ last_backup_at: tsMs });
}

/** 最早一条有效用户数据的 created_at（无数据返回 null）——备份提醒“已有数据满 7 天”用。 */
export async function getOldestDataCreatedAt(): Promise<number | null> {
  const db = await getDb();
  let oldest: number | null = null;
  for (const name of DATA_TABLES as readonly TableName[]) {
    const table = db[name] as unknown as Table<TableRecordMap[TableName] & BaseFields, string>;
    await table
      .filter((record) => record.deleted_at === null)
      .each((record) => {
        if (oldest === null || record.created_at < oldest) oldest = record.created_at;
      });
  }
  return oldest;
}
