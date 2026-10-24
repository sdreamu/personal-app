/**
 * Dexie 数据库实例、初始化（首次运行种子 + 启动 GC + 申请持久存储）、清空。
 */
import Dexie, { type Table } from 'dexie';
import {
  DB_NAME,
  SCHEMA_VERSION,
  BUILTIN_MEAL_TYPES,
  BUILTIN_PLAN_CATEGORIES,
  DEFAULT_SETTINGS_VALUES,
  GC_TABLES,
  TABLE_NAMES,
  type ActiveTimer,
  type BaseFields,
  type Book,
  type Excerpt,
  type Meal,
  type MealType,
  type Plan,
  type PlanCategory,
  type PlayRecord,
  type Review,
  type SettingsRecord,
  type StudyRecord,
  type Subject,
  type Water,
  type WorkoutRecord,
  type WorkoutTemplate,
  type WorkoutType,
} from './schema';
import { nowMs, uuid } from './util';

export const GC_GRACE_MS = 60 * 60 * 1000; // 软删除保留 1 小时（5 秒撤销的余量）

export class EvanDB extends Dexie {
  settings!: Table<SettingsRecord, string>;
  plan_categories!: Table<PlanCategory, string>;
  meal_types!: Table<MealType, string>;
  workout_types!: Table<WorkoutType, string>;
  plans!: Table<Plan, string>;
  books!: Table<Book, string>;
  excerpts!: Table<Excerpt, string>;
  subjects!: Table<Subject, string>;
  study_records!: Table<StudyRecord, string>;
  active_timer!: Table<ActiveTimer, string>;
  meals!: Table<Meal, string>;
  water!: Table<Water, string>;
  workout_templates!: Table<WorkoutTemplate, string>;
  workout_records!: Table<WorkoutRecord, string>;
  play_records!: Table<PlayRecord, string>;
  reviews!: Table<Review, string>;

  constructor() {
    super(DB_NAME);
    this.version(SCHEMA_VERSION).stores({
      settings: 'key',
      plan_categories: 'id, builtin_key, deleted_at',
      meal_types: 'id, builtin_key, deleted_at',
      workout_types: 'id, deleted_at',
      plans: 'id, date, category_key, target_id, deleted_at',
      books: 'id, status, deleted_at',
      excerpts: 'id, book_id, deleted_at',
      subjects: 'id, archived, deleted_at',
      study_records: 'id, date, target_id, deleted_at',
      active_timer: 'key',
      meals: 'id, date, meal_key, deleted_at',
      water: 'id, date, deleted_at',
      workout_templates: 'id, weekday, deleted_at',
      workout_records: 'id, date, deleted_at',
      play_records: 'id, date, deleted_at',
      reviews: 'id, date, deleted_at',
    });
  }
}

let dbPromise: Promise<EvanDB> | null = null;

export function getDb(): Promise<EvanDB> {
  dbPromise ??= openAndPrepare();
  return dbPromise;
}

/** 打开数据库：首次运行种子 → 启动 GC → 申请持久存储。 */
export async function initAppDb(): Promise<EvanDB> {
  return getDb();
}

async function openAndPrepare(): Promise<EvanDB> {
  const db = new EvanDB();
  await db.open();
  await seedFirstRun(db);
  await gcOnDb(db, nowMs());
  requestPersistentStorage();
  return db;
}

/** 仅测试用：关闭并删除数据库后重新打开（浏览器代码不应调用）。 */
export async function resetDbForTests(): Promise<EvanDB> {
  if (dbPromise) {
    const old = await dbPromise;
    old.close();
    dbPromise = null;
  }
  await deleteDatabase(DB_NAME);
  return getDb();
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** 首次运行种子：默认 settings + 内置分类/餐次（幂等，缺哪补哪）。 */
export async function seedFirstRun(db: EvanDB): Promise<void> {
  await db.transaction('rw', [db.settings, db.plan_categories, db.meal_types], async () => {
    if ((await db.settings.get('app')) === undefined) {
      const now = nowMs();
      await db.settings.add({
        ...DEFAULT_SETTINGS_VALUES,
        key: 'app',
        id: uuid(),
        created_at: now,
        updated_at: now,
        deleted_at: null,
      });
    }
    for (const builtin of BUILTIN_PLAN_CATEGORIES) {
      const rows = await db.plan_categories.where('builtin_key').equals(builtin.builtin_key).toArray();
      if (!rows.some((r) => r.deleted_at === null)) {
        const now = nowMs();
        await db.plan_categories.add({
          id: uuid(),
          created_at: now,
          updated_at: now,
          deleted_at: null,
          name: builtin.name,
          builtin_key: builtin.builtin_key,
        });
      }
    }
    for (const builtin of BUILTIN_MEAL_TYPES) {
      const rows = await db.meal_types.where('builtin_key').equals(builtin.builtin_key).toArray();
      if (!rows.some((r) => r.deleted_at === null)) {
        const now = nowMs();
        await db.meal_types.add({
          id: uuid(),
          created_at: now,
          updated_at: now,
          deleted_at: null,
          name: builtin.name,
          builtin_key: builtin.builtin_key,
        });
      }
    }
  });
}

/** 物理删除 deleted_at 早于 1 小时前的软删除记录；返回删除条数。 */
export async function gcOnDb(db: EvanDB, nowMsValue: number = nowMs()): Promise<number> {
  const threshold = nowMsValue - GC_GRACE_MS;
  let total = 0;
  for (const name of GC_TABLES) {
    const table = db[name] as unknown as Table<BaseFields, string>;
    total += await table.where('deleted_at').below(threshold).delete();
  }
  return total;
}

function requestPersistentStorage(): void {
  try {
    void navigator.storage?.persist().catch(() => undefined);
  } catch {
    // 浏览器不支持时忽略
  }
}

async function wipeAllTables(db: EvanDB): Promise<void> {
  const tables = TABLE_NAMES.map((name) => db[name] as unknown as Table<BaseFields, string>);
  await db.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()));
  });
}

/** 清空所有数据（页面需二次确认后调用）；清空后恢复内置种子与默认设置。 */
export async function clearAll(): Promise<void> {
  const db = await getDb();
  await wipeAllTables(db);
  await seedFirstRun(db);
}
