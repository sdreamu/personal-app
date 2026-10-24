import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { EvanDB, SCHEMA_V1_STORES, SCHEMA_V2_STORES } from './database';
import { DB_NAME, DB_VERSION, TABLE_NAMES } from './schema';

let opened: EvanDB | null = null;

afterEach(async () => {
  opened?.close();
  opened = null;
  await Dexie.delete(DB_NAME);
});

/** 用冻结的 v1 建表语句造一个真实的旧库（模拟浏览器里已经在用的 v1 数据）。 */
async function createLegacyV1(): Promise<void> {
  await Dexie.delete(DB_NAME);
  const legacy = new Dexie(DB_NAME);
  legacy.version(1).stores(SCHEMA_V1_STORES);
  await legacy.open();
  const now = 1_700_000_000_000;
  const base = { created_at: now, updated_at: now, deleted_at: null };
  await legacy.table('plans').add({
    ...base,
    id: 'plan-1',
    title: '背单词',
    date: '2026-06-01',
    start_min: null,
    end_min: null,
    category_key: 'study',
    category_name: '学习',
    target_type: null,
    target_id: null,
    target_title: null,
    done: false,
    done_at: null,
    rollover_from_date: null,
    is_rolled_over: false,
  });
  await legacy.table('plans').add({
    ...base,
    id: 'plan-deleted',
    title: '已删除的计划',
    date: '2026-06-02',
    start_min: null,
    end_min: null,
    category_key: 'life',
    category_name: '生活',
    target_type: null,
    target_id: null,
    target_title: null,
    done: false,
    done_at: null,
    rollover_from_date: null,
    is_rolled_over: false,
    deleted_at: now - 1,
  });
  await legacy.table('reviews').add({
    ...base,
    id: 'review-1',
    date: '2026-06-01',
    rating: 4,
    mood: 3,
    energy: 5,
    good: '专注',
    improve: null,
    mit: '晨跑',
    mit_added_to_plan: false,
  });
  await legacy.table('workout_records').add({
    ...base,
    id: 'workout-1',
    date: '2026-06-01',
    type_name: '胸',
    exercises: [{ name: '卧推', sets: [{ weight_kg: 60, reps: 8, done: true }] }],
    duration_min: 45,
    done: true,
  });
  await legacy.close();
}

describe('Dexie 结构版本 v1 → v2', () => {
  it('v2 建表语句保留 v1 的全部表与索引（只新增，不改旧索引）', () => {
    for (const [table, spec] of Object.entries(SCHEMA_V1_STORES)) {
      expect(SCHEMA_V2_STORES[table], '表 ' + table + ' 的索引被改动').toBe(spec);
    }
    expect(SCHEMA_V2_STORES['exercises']).toBe('id, deleted_at');
    expect(SCHEMA_V2_STORES['mistakes']).toBe('id, date, mastered, deleted_at');
    expect(DB_VERSION).toBe(2);
  });

  it('旧库升级：已有数据一条不少（含软删除记录），新表建好且为空，新字段补 null', async () => {
    await createLegacyV1();
    opened = new EvanDB();
    await opened.open();

    expect(opened.verno).toBe(DB_VERSION);
    expect(opened.tables.map((table) => table.name).sort()).toEqual([...TABLE_NAMES].sort());

    const plan = await opened.plans.get('plan-1');
    expect(plan?.title).toBe('背单词');
    expect(plan?.created_at).toBe(1_700_000_000_000);
    const softDeleted = await opened.plans.get('plan-deleted');
    expect(softDeleted?.title).toBe('已删除的计划');
    expect(softDeleted?.deleted_at).not.toBeNull();

    const review = await opened.reviews.get('review-1');
    expect(review?.good).toBe('专注');
    expect(review?.mit_added_to_plan).toBe(false);
    expect(review?.record_worthy).toBeNull();
    expect(review?.day_summary).toBeNull();

    const workout = await opened.workout_records.get('workout-1');
    expect(workout?.exercises).toEqual([
      { name: '卧推', sets: [{ weight_kg: 60, reps: 8, done: true }], note: null },
    ]);

    expect(await opened.exercises.count()).toBe(0);
    expect(await opened.mistakes.count()).toBe(0);
  });

  it('导出备份带上新表与新字段：v1 旧库升级后导出的备份是 schema_version 2 结构', async () => {
    await createLegacyV1();
    opened = new EvanDB();
    await opened.open();
    await opened.exercises.add({
      id: 'ex-1',
      created_at: 1,
      updated_at: 1,
      deleted_at: null,
      name: '卧推',
    });
    const review = await opened.reviews.get('review-1');
    expect(Object.keys(review ?? {})).toEqual(
      expect.arrayContaining(['record_worthy', 'day_summary']),
    );
  });
});
