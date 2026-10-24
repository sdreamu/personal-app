/**
 * 导出备份 / 导入恢复 / 清空支持。
 * 备份 JSON：{ app:'evan-app', schema_version:1, exported_at(ms), tables:{<表名>:[有效记录...]} }
 * 文件名：evan-backup-年月日-时分.json。
 * 导出前执行 GC；导入先校验（失败不改动现有数据）→ 事务性覆盖并保留原 id。
 */
import type { Table } from 'dexie';
import { getDb, gcOnDb } from './database';
import { backupTimestamp } from '@/utils/date';
import { APP_ID, SCHEMA_VERSION, TABLE_NAMES, type BackupFile, type BaseFields, type TableName, type TableRecordMap } from './schema';
import { errorMessage, nowMs } from './util';
import { setLastBackupAt } from './settings';

export function backupFileName(exportedAtMs: number): string {
  return `evan-backup-${backupTimestamp(exportedAtMs)}.json`;
}

/** 导出备份对象：GC → 收集全部表有效记录。 */
export async function exportBackup(): Promise<BackupFile> {
  const db = await getDb();
  await gcOnDb(db, nowMs()); // 导出前 GC
  const tables: Record<string, BaseFields[]> = {};
  for (const name of TABLE_NAMES) {
    const table = db[name] as unknown as Table<BaseFields, string>;
    tables[name] = await table.filter((record) => record.deleted_at === null).toArray();
  }
  return {
    app: APP_ID,
    schema_version: SCHEMA_VERSION,
    exported_at: nowMs(),
    tables: tables as unknown as BackupFile['tables'],
  };
}

/** 浏览器端导出：生成文件下载并记录 last_backup_at。 */
export async function downloadBackup(): Promise<{ backup: BackupFile; filename: string }> {
  const backup = await exportBackup();
  const filename = backupFileName(backup.exported_at);
  await setLastBackupAt(backup.exported_at);
  triggerDownload(filename, JSON.stringify(backup, null, 2));
  return { backup, filename };
}

function triggerDownload(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type BackupValidation = { ok: true; backup: BackupFile } | { ok: false; reason: string };

/** 校验 app 标识 / schema_version / 表结构格式；不通过则给出明确原因。 */
export function validateBackup(raw: unknown): BackupValidation {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: '文件不是有效的备份对象' };
  }
  const obj = raw as Record<string, unknown>;
  if (obj['app'] !== APP_ID) return { ok: false, reason: `应用标识不匹配（需要 ${APP_ID}）` };
  if (obj['schema_version'] !== SCHEMA_VERSION) {
    return { ok: false, reason: `结构版本不匹配（需要 ${SCHEMA_VERSION}）` };
  }
  if (typeof obj['exported_at'] !== 'number' || !Number.isFinite(obj['exported_at'])) {
    return { ok: false, reason: '缺少有效的导出时间' };
  }
  const tables = obj['tables'];
  if (typeof tables !== 'object' || tables === null || Array.isArray(tables)) {
    return { ok: false, reason: '缺少数据表集合 tables' };
  }
  const tablesObj = tables as Record<string, unknown>;
  for (const name of TABLE_NAMES) {
    const rows = tablesObj[name];
    if (!Array.isArray(rows)) return { ok: false, reason: `数据表 ${name} 缺失或格式错误` };
    for (const row of rows) {
      if (
        typeof row !== 'object' ||
        row === null ||
        Array.isArray(row) ||
        typeof (row as Record<string, unknown>)['id'] !== 'string'
      ) {
        return { ok: false, reason: `数据表 ${name} 中存在格式错误的记录` };
      }
    }
  }
  const unknownTables = Object.keys(tablesObj).filter(
    (key) => !(TABLE_NAMES as readonly string[]).includes(key),
  );
  if (unknownTables.length > 0) return { ok: false, reason: `包含未知数据表：${unknownTables.join('、')}` };
  return { ok: true, backup: raw as unknown as BackupFile };
}

/** 解析并校验备份 JSON 文本（不写入任何数据）。 */
export function parseBackupJson(text: string): BackupValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, reason: 'JSON 格式错误，无法解析' };
  }
  return validateBackup(parsed);
}

export interface BackupSummary {
  exportedAt: number;
  counts: { table: TableName; count: number }[];
  total: number;
}

export function summarizeBackup(backup: BackupFile): BackupSummary {
  const counts = TABLE_NAMES.map((table) => ({ table, count: backup.tables[table].length }));
  return {
    exportedAt: backup.exported_at,
    counts,
    total: counts.reduce((sum, entry) => sum + entry.count, 0),
  };
}

/** 事务性覆盖导入（保留原 id）：全部表清空 + bulkPut 在同一事务内，失败整体回滚。 */
export async function importBackupObject(backup: BackupFile): Promise<void> {
  const db = await getDb();
  const tables = TABLE_NAMES.map((name) => db[name] as unknown as Table<BaseFields, string>);
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((table) => table.clear()));
    for (const name of TABLE_NAMES) {
      const rows = backup.tables[name] as unknown as BaseFields[];
      if (rows.length > 0) {
        await (db[name] as unknown as Table<BaseFields, string>).bulkPut(rows);
      }
    }
  });
}

export type ImportResult = { ok: true; summary: BackupSummary } | { ok: false; reason: string };

/** 一步式导入（校验失败或事务异常时均不改动现有数据）。 */
export async function importBackupFromJson(text: string): Promise<ImportResult> {
  const parsed = parseBackupJson(text);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  try {
    await importBackupObject(parsed.backup);
  } catch (err) {
    return { ok: false, reason: `导入失败：${errorMessage(err)}` };
  }
  return { ok: true, summary: summarizeBackup(parsed.backup) };
}
