import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const TABLE_NAMES = [
  'settings',
  'plan_categories',
  'meal_types',
  'workout_types',
  'plans',
  'books',
  'excerpts',
  'subjects',
  'study_records',
  'active_timer',
  'meals',
  'water',
  'workout_templates',
  'workout_records',
  'play_records',
  'reviews',
] as const;

const now = Date.now();
let seq = 0;
export function nextId(): string {
  seq += 1;
  return 'fixture-' + now + '-' + seq;
}

export function defaultSettingsRow() {
  const ts = now;
  return {
    key: 'app',
    id: nextId(),
    created_at: ts,
    updated_at: ts,
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

export function builtinPlanCategories() {
  const ts = now;
  return [
    { name: '学习', builtin_key: 'study' },
    { name: '生活', builtin_key: 'life' },
    { name: '其他', builtin_key: 'other' },
  ].map((c) => ({ ...c, id: nextId(), created_at: ts, updated_at: ts, deleted_at: null }));
}

export function builtinMealTypes() {
  const ts = now;
  return [
    { name: '早', builtin_key: 'breakfast' },
    { name: '午', builtin_key: 'lunch' },
    { name: '晚', builtin_key: 'dinner' },
    { name: '加餐', builtin_key: 'snack' },
  ].map((c) => ({ ...c, id: nextId(), created_at: ts, updated_at: ts, deleted_at: null }));
}

/** 构造一个通过校验的备份对象（含全部表名）。 */
export function buildBackup(rows: Partial<Record<(typeof TABLE_NAMES)[number], unknown[]>> = {}) {
  const tables: Record<string, unknown[]> = {};
  for (const name of TABLE_NAMES) tables[name] = [];
  const full = { ...tables, ...rows };
  return {
    app: 'evan-app',
    schema_version: 1,
    exported_at: now,
    tables: full,
  };
}

/** 把 JSON 写入 test-results 下的文件并返回绝对路径。 */
export function writeFixture(name: string, data: unknown): string {
  const dir = join(process.cwd(), 'test-results');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(file, JSON.stringify(data));
  return file;
}
