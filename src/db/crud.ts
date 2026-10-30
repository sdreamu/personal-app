/**
 * 通用 CRUD、软删除/撤销、GC、有效记录（alive）查询。
 */
import type { Table, UpdateSpec } from 'dexie';
import { getDb, gcOnDb, type AppDB } from './database';
import type { BaseFields, DateTableName, TableName, TableRecordMap } from './schema';
import { nowMs, uuid } from './util';

export type NewRecord<K extends TableName> = Omit<TableRecordMap[K], keyof BaseFields>;

function tableOf<K extends TableName>(db: AppDB, tableName: K): Table<TableRecordMap[K], string> {
  return db[tableName] as unknown as Table<TableRecordMap[K], string>;
}

/** 新建记录：自动补全 id / created_at / updated_at / deleted_at=null。 */
export async function createRecord<K extends TableName>(tableName: K, data: NewRecord<K>): Promise<TableRecordMap[K]> {
  const db = await getDb();
  const now = nowMs();
  const record = {
    ...data,
    id: uuid(),
    created_at: now,
    updated_at: now,
    deleted_at: null,
  } as unknown as TableRecordMap[K];
  await tableOf(db, tableName).add(record);
  return record;
}

/** 更新记录（并刷新 updated_at）。 */
export async function updateRecord<K extends TableName>(
  tableName: K,
  id: string,
  patch: Partial<TableRecordMap[K]>,
): Promise<void> {
  const db = await getDb();
  const changes = { ...patch, updated_at: nowMs() } as unknown as UpdateSpec<TableRecordMap[K]>;
  await tableOf(db, tableName).update(id, changes);
}

export async function getRecord<K extends TableName>(tableName: K, id: string): Promise<TableRecordMap[K] | undefined> {
  const db = await getDb();
  return tableOf(db, tableName).get(id);
}

/** 有效记录：deleted_at 为 null。 */
export function isAlive(record: BaseFields | undefined | null): boolean {
  return record !== undefined && record !== null && record.deleted_at === null;
}

export async function listAlive<K extends TableName>(tableName: K): Promise<TableRecordMap[K][]> {
  const db = await getDb();
  return tableOf(db, tableName)
    .filter((record) => record.deleted_at === null)
    .toArray();
}

/** 按逻辑日期查询有效记录。 */
export async function listAliveByDate<K extends DateTableName>(
  tableName: K,
  date: string,
): Promise<TableRecordMap[K][]> {
  const db = await getDb();
  return tableOf(db, tableName)
    .filter((record) => record.deleted_at === null && record.date === date)
    .toArray();
}

/** 软删除：打上 deleted_at 时间戳（5 秒内可撤销）。 */
export async function softDelete(tableName: TableName, id: string): Promise<void> {
  await updateRecord(tableName, id, { deleted_at: nowMs() } as Partial<TableRecordMap[TableName]>);
}

/** 撤销软删除：deleted_at 置 null。 */
export async function undoDelete(tableName: TableName, id: string): Promise<void> {
  await updateRecord(tableName, id, { deleted_at: null } as Partial<TableRecordMap[TableName]>);
}

/** 垃圾回收：物理删除 deleted_at 早于 1 小时前的软删除记录（启动时与导出前调用）。 */
export async function gc(nowMsValue: number = nowMs()): Promise<number> {
  const db = await getDb();
  return gcOnDb(db, nowMsValue);
}
