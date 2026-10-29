import { beforeEach, describe, expect, it } from 'vitest';
import {
  GC_GRACE_MS,
  TABLE_NAMES,
  addCategory,
  clearActiveTimer,
  clearAll,
  createRecord,
  exportBackup,
  gc,
  getActiveTimer,
  getOldestDataCreatedAt,
  getRecord,
  getSettings,
  importBackupFromJson,
  importBackupObject,
  listAlive,
  listAliveByDate,
  listCategories,
  removeCategory,
  renameCategory,
  SCHEMA_VERSION,
  resetDbForTests,
  setActiveTimer,
  softDelete,
  undoDelete,
  updateRecord,
  updateSettings,
  type ActiveTimer,
  type Plan,
} from './index';

function makePlan(
  date = '2026-06-01',
  title = '背单词',
): Omit<Plan, 'id' | 'created_at' | 'updated_at' | 'deleted_at'> {
  return {
    title,
    date,
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
  };
}

beforeEach(async () => {
  await resetDbForTests();
});

describe('基础 CRUD 与通用时间戳字段', () => {
  it('创建记录自动补全 UUID 与 created_at/updated_at/deleted_at', async () => {
    const before = Date.now();
    const plan = await createRecord('plans', makePlan());
    expect(plan.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(plan.created_at).toBeGreaterThanOrEqual(before);
    expect(plan.updated_at).toBe(plan.created_at);
    expect(plan.deleted_at).toBeNull();
    const fetched = await getRecord('plans', plan.id);
    expect(fetched).toEqual(plan);
  });

  it('更新记录刷新 updated_at', async () => {
    const plan = await createRecord('plans', makePlan());
    await updateRecord('plans', plan.id, { title: '背单词（改）' });
    const fetched = await getRecord('plans', plan.id);
    expect(fetched?.title).toBe('背单词（改）');
    expect(fetched?.updated_at ?? 0).toBeGreaterThanOrEqual(plan.updated_at);
  });

  it('按逻辑日期查询有效记录（alive 过滤）', async () => {
    await createRecord('plans', makePlan('2026-06-01', 'A'));
    await createRecord('plans', makePlan('2026-06-02', 'B'));
    const gone = await createRecord('plans', makePlan('2026-06-01', 'C'));
    await softDelete('plans', gone.id);
    const rows = await listAliveByDate('plans', '2026-06-01');
    expect(rows.map((r) => r.title)).toEqual(['A']);
    expect(await listAlive('plans')).toHaveLength(2);
  });
});

describe('软删除与撤销', () => {
  it('softDelete 打时间戳、undo 置 null、alive 查询过滤', async () => {
    const plan = await createRecord('plans', makePlan());
    await softDelete('plans', plan.id);
    const soft = await getRecord('plans', plan.id);
    expect(soft?.deleted_at).not.toBeNull();
    expect(await listAlive('plans')).toHaveLength(0);
    await undoDelete('plans', plan.id);
    expect((await getRecord('plans', plan.id))?.deleted_at).toBeNull();
    expect(await listAlive('plans')).toHaveLength(1);
  });
});

describe('GC 垃圾回收', () => {
  it('只物理删除 deleted_at 早于 1 小时前的记录', async () => {
    const now = Date.now();
    const oldDeleted = await createRecord('plans', makePlan('2026-06-01', 'old'));
    await softDelete('plans', oldDeleted.id);
    await updateRecord('plans', oldDeleted.id, { deleted_at: now - GC_GRACE_MS - 1 });
    const freshDeleted = await createRecord('plans', makePlan('2026-06-01', 'fresh'));
    await softDelete('plans', freshDeleted.id);
    await updateRecord('plans', freshDeleted.id, { deleted_at: now - GC_GRACE_MS + 60_000 });
    const alive = await createRecord('plans', makePlan('2026-06-01', 'alive'));

    const removed = await gc(now);
    expect(removed).toBe(1);
    expect(await getRecord('plans', oldDeleted.id)).toBeUndefined();
    expect((await getRecord('plans', freshDeleted.id))?.deleted_at).not.toBeNull();
    expect((await getRecord('plans', alive.id))?.deleted_at).toBeNull();
  });

  it('启动时自动执行 GC', async () => {
    const plan = await createRecord('plans', makePlan());
    await softDelete('plans', plan.id);
    await updateRecord('plans', plan.id, { deleted_at: Date.now() - 2 * GC_GRACE_MS });
    await resetDbForTests(); // 重新打开数据库 → 启动 GC
    expect(await getRecord('plans', plan.id)).toBeUndefined();
  });

  it('导出前执行 GC，备份不含已清理记录', async () => {
    const plan = await createRecord('plans', makePlan());
    await softDelete('plans', plan.id);
    await updateRecord('plans', plan.id, { deleted_at: Date.now() - 2 * GC_GRACE_MS });
    const backup = await exportBackup();
    expect(backup.tables['plans']).toHaveLength(0);
    expect(await getRecord('plans', plan.id)).toBeUndefined();
  });
});

describe('导出 / 清空 / 导入', () => {
  it('roundtrip：导出→清空→导入后数据与 id 完全一致（含全部 16 张表）', async () => {
    await addCategory('plan_categories', '摸鱼');
    await addCategory('meal_types', '夜宵');
    await addCategory('workout_types', '胸');
    const plan = await createRecord('plans', makePlan());
    const book = await createRecord('books', {
      title: 'SICP',
      author: 'Abelson',
      total_pages: 300,
      current_page: 40,
      status: 'reading',
      color: '#4a6cf7',
      start_date: '2026-05-01',
      finish_date: null,
    });
    await createRecord('excerpts', { book_id: book.id, page: 12, content: '好句子', thought: null });
    const subject = await createRecord('subjects', {
      name: '数学',
      weekly_goal_min: 360,
      deadline: '2026-12-31',
      archived: false,
    });
    await createRecord('study_records', {
      target_type: 'book',
      target_id: book.id,
      target_title: 'SICP',
      start_at: Date.now() - 3600_000,
      end_at: Date.now() - 1800_000,
      duration_sec: 1800,
      note: null,
      start_page: 20,
      end_page: 40,
      pages_read: 20,
      source: 'timer',
      date: '2026-06-01',
    });
    await createRecord('meals', {
      date: '2026-06-01',
      meal_key: 'breakfast',
      meal_name: '早',
      text: '包子',
      feeling: null,
    });
    await createRecord('water', { date: '2026-06-01', ml: 250, at: Date.now() });
    await createRecord('workout_templates', { weekday: 1, type_name: '胸', exercise_names: ['卧推'] });
    await createRecord('workout_records', {
      date: '2026-06-01',
      type_name: '胸',
      exercises: [{ name: '卧推', sets: [{ weight_kg: 60, reps: 8, done: true }] }],
      duration_min: 45,
      done: true,
    });
    await createRecord('play_records', { date: '2026-06-01', content: '游戏', minutes: 30, source: 'manual' });
    await createRecord('reviews', {
      date: '2026-06-01',
      rating: 4,
      mood: 5,
      energy: 3,
      good: '专注',
      improve: '早睡',
      mit: '读完一章',
      mit_added_to_plan: false,
    });
    await updateSettings({ cup_ml: 300, theme: 'dark', last_backup_at: 123 });
    const timer: ActiveTimer = {
      key: 'global',
      id: 'timer-1',
      created_at: Date.now(),
      updated_at: Date.now(),
      deleted_at: null,
      type: 'book',
      target_id: book.id,
      target_title: 'SICP',
      plan_id: null,
      mode: 'stopwatch',
      countdown_sec: 1500,
      started_at: Date.now() - 65_000,
      paused_total_ms: 0,
      paused: false,
      pause_started_at: null,
      ended_at: null,
    };
    await setActiveTimer(timer);

    const backup = await exportBackup();
    expect(backup.app).toBe('evan-app');
    expect(backup.schema_version).toBe(SCHEMA_VERSION);

    await clearAll();
    expect(await listAlive('plans')).toHaveLength(0);
    expect((await getSettings()).cup_ml).toBe(250); // 清空后恢复默认种子
    expect(await getActiveTimer()).toBeNull();

    await importBackupObject(backup);
    const backup2 = await exportBackup();
    const sortById = (rows: { id: string }[]): { id: string }[] =>
      [...rows].sort((a, b) => a.id.localeCompare(b.id));
    for (const name of TABLE_NAMES) {
      expect(
        sortById(backup2.tables[name] as { id: string }[]),
        '表 ' + name + ' 数据不一致',
      ).toEqual(sortById(backup.tables[name] as { id: string }[]));
    }
    expect((await getSettings()).cup_ml).toBe(300);
    expect((await getSettings()).theme).toBe('dark');
    expect((await getRecord('plans', plan.id))?.title).toBe('背单词');
    expect((await getRecord('books', book.id))?.title).toBe('SICP');
    expect((await getRecord('subjects', subject.id))?.weekly_goal_min).toBe(360);
    expect((await getActiveTimer())?.id).toBe('timer-1');
  });

  it('导入坏文件一律拒绝且不改动现有数据', async () => {
    const plan = await createRecord('plans', makePlan('2026-06-01', '原始数据'));
    const emptyTables = (): Record<string, unknown[]> =>
      Object.fromEntries(TABLE_NAMES.map((name) => [name, []]));

    const badTables = emptyTables();
    badTables['plans'] = [{ id: 123 }];
    const unknownTables = emptyTables();
    unknownTables['mystery'] = [];

    const cases: [string, string][] = [
      ['非法 JSON', 'not json at all'],
      [
        '应用标识错误',
        JSON.stringify({ app: 'other-app', schema_version: 1, exported_at: 1, tables: emptyTables() }),
      ],
      [
        '结构版本错误',
        JSON.stringify({ app: 'evan-app', schema_version: 99, exported_at: 1, tables: emptyTables() }),
      ],
      ['缺少数据表', JSON.stringify({ app: 'evan-app', schema_version: 1, exported_at: 1, tables: { plans: [] } })],
      [
        '记录格式错误',
        JSON.stringify({ app: 'evan-app', schema_version: 1, exported_at: 1, tables: badTables }),
      ],
      [
        '未知数据表',
        JSON.stringify({ app: 'evan-app', schema_version: 1, exported_at: 1, tables: unknownTables }),
      ],
    ];
    for (const [label, text] of cases) {
      const result = await importBackupFromJson(text);
      expect(result.ok, label + ' 应被拒绝').toBe(false);
    }

    const survivors = await listAlive('plans');
    expect(survivors).toHaveLength(1);
    expect(survivors[0]?.title).toBe('原始数据');
    expect((await getSettings()).cup_ml).toBe(250); // 设置未被污染
  });
});

describe('种子与内置保护', () => {
  it('首次运行种子：内置分类/餐次 + 默认 settings', async () => {
    const settings = await getSettings();
    expect(settings.daily_study_min).toBe(120);
    expect(settings.daily_water_ml).toBe(2000);
    expect(settings.cup_ml).toBe(250);
    expect(settings.daily_play_min).toBe(60);
    expect(settings.day_start).toBe('04:00');
    expect(settings.theme).toBe('light');
    expect(settings.last_backup_at).toBeNull();
    const planCats = await listCategories('plan_categories');
    expect(planCats.map((c) => c.name).sort()).toEqual(['学习', '生活', '其他'].sort());
    const mealTypes = await listCategories('meal_types');
    expect(mealTypes.map((c) => c.name).sort()).toEqual(['早', '午', '晚', '加餐'].sort());
  });

  it('内置分类不可删除/改名；自定义可增删改；训练类型全部可增删改', async () => {
    const study = (await listCategories('plan_categories')).find((c) => c.name === '学习');
    const studyId = study?.id ?? '';
    await expect(removeCategory('plan_categories', studyId)).rejects.toThrow('内置');
    await expect(renameCategory('plan_categories', studyId, '学学')).rejects.toThrow('内置');

    const custom = await addCategory('plan_categories', '摸鱼');
    await renameCategory('plan_categories', custom.id, '摸鱼改');
    expect((await listCategories('plan_categories')).map((c) => c.name)).toContain('摸鱼改');
    await removeCategory('plan_categories', custom.id);
    expect((await listCategories('plan_categories')).map((c) => c.name)).not.toContain('摸鱼改');

    const workout = await addCategory('workout_types', '胸');
    await renameCategory('workout_types', workout.id, '胸+三头');
    await removeCategory('workout_types', workout.id);
    // AC-84 之后 workout_types 随库种入内置三项（力量/有氧/拉伸），所以这里断言"删掉的那个没了"，
    // 而不是"整张表为空"。
    const remaining = (await listCategories('workout_types')).map((c) => c.name);
    expect(remaining).not.toContain('胸+三头');
    expect(remaining.slice().sort()).toEqual(['力量', '拉伸', '有氧'].sort());
  });
});

describe('settings / active_timer / 备份提醒数据', () => {
  it('settings 即时读写', async () => {
    await updateSettings({ daily_study_min: 150, day_start: '04:30' });
    const saved = await getSettings();
    expect(saved.daily_study_min).toBe(150);
    expect(saved.day_start).toBe('04:30');
  });

  it('active_timer 单行读写与清除', async () => {
    expect(await getActiveTimer()).toBeNull();
    const timer: ActiveTimer = {
      key: 'global',
      id: 't1',
      created_at: 1,
      updated_at: 1,
      deleted_at: null,
      type: 'entertainment',
      target_id: '游戏',
      target_title: '游戏',
      plan_id: null,
      mode: 'stopwatch',
      countdown_sec: 1500,
      started_at: Date.now(),
      paused_total_ms: 0,
      paused: false,
      pause_started_at: null,
      ended_at: null,
    };
    await setActiveTimer(timer);
    expect((await getActiveTimer())?.id).toBe('t1');
    await clearActiveTimer();
    expect(await getActiveTimer()).toBeNull();
  });

  it('getOldestDataCreatedAt 取最早有效数据（忽略已删除与配置表）', async () => {
    const t1 = Date.now() - 60_000;
    const first = await createRecord('plans', makePlan());
    await updateRecord('plans', first.id, { created_at: t1 });
    const soft = await createRecord('plans', makePlan('2026-06-02', '被删'));
    await updateRecord('plans', soft.id, { created_at: t1 - 60_000 });
    await softDelete('plans', soft.id);
    expect(await getOldestDataCreatedAt()).toBe(t1);
  });
});
