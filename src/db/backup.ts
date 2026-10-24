/**
 * 导出备份 / 导入恢复 / 清空支持。
 * 备份 JSON：{ app:'evan-app', schema_version:2, exported_at(ms), tables:{<表名>:[有效记录...]} }
 * 文件名：evan-backup-年月日-时分.json。
 * 导出前执行 GC；导入先校验（失败不改动现有数据）→ 事务性覆盖并保留原 id。
 * 兼容：schema_version 1 的旧备份仍然可导入——缺失的 exercises / mistakes 补空数组，
 * reviews / workout_records 记录补 v2 新字段默认值后再放行。
 */
import type { Table } from 'dexie';
import { getDb, gcOnDb } from './database';
import { backupTimestamp } from '@/utils/date';
import {
  APP_ID,
  SCHEMA_VERSION,
  SUPPORTED_BACKUP_VERSIONS,
  TABLE_NAMES,
  V1_TABLE_NAMES,
  type BackupFile,
  type BaseFields,
  type TableName,
} from './schema';
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

/** 用 v2 默认值补齐单条记录的缺失字段（只补不改：已有值原样保留）。 */
function normalizeRow(name: TableName, row: Record<string, unknown>): Record<string, unknown> {
  if (name === 'reviews') {
    if (row['record_worthy'] === undefined) row['record_worthy'] = null;
    if (row['day_summary'] === undefined) row['day_summary'] = null;
  } else if (name === 'workout_records') {
    const exercises = Array.isArray(row['exercises']) ? (row['exercises'] as Record<string, unknown>[]) : [];
    row['exercises'] = exercises.map((entry) =>
      entry['note'] === undefined ? { ...entry, note: null } : entry,
    );
  } else if (name === 'mistakes') {
    if (!Array.isArray(row['question_images'])) row['question_images'] = [];
    if (!Array.isArray(row['correction_images'])) row['correction_images'] = [];
    if (!Array.isArray(row['reasons'])) row['reasons'] = [];
    if (row['note'] === undefined) row['note'] = null;
  }
  return row;
}

/** 把任意受支持版本的备份补齐成当前版本的完整备份对象。 */
function normalizeBackup(obj: Record<string, unknown>): BackupFile {
  const source = obj['tables'] as Record<string, unknown>;
  const tables = {} as Record<TableName, Record<string, unknown>[]>;
  for (const name of TABLE_NAMES) {
    const rows = source[name];
    tables[name] = Array.isArray(rows)
      ? rows.map((row) => normalizeRow(name, { ...(row as Record<string, unknown>) }))
      : [];
  }
  return {
    app: APP_ID,
    schema_version: SCHEMA_VERSION,
    exported_at: obj['exported_at'] as number,
    tables: tables as unknown as BackupFile['tables'],
  };
}

/** 校验 app 标识 / schema_version / 表结构格式；通过时返回补齐 v2 默认值的备份。 */
export function validateBackup(raw: unknown): BackupValidation {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: '文件不是有效的备份对象' };
  }
  const obj = raw as Record<string, unknown>;
  if (obj['app'] !== APP_ID) return { ok: false, reason: `应用标识不匹配（需要 ${APP_ID}）` };
  const version = obj['schema_version'];
  if (typeof version !== 'number' || !SUPPORTED_BACKUP_VERSIONS.includes(version)) {
    return {
      ok: false,
      reason: `结构版本不匹配（需要 ${SUPPORTED_BACKUP_VERSIONS.join(' 或 ')}）`,
    };
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
    // v1 备份没有 v2 新增表：缺失即视为空表，其余表必须齐全。
    if (rows === undefined && version === 1 && !V1_TABLE_NAMES.includes(name)) continue;
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
  return { ok: true, backup: normalizeBackup(obj) };
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
