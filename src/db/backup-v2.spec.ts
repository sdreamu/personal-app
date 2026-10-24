import { beforeEach, describe, expect, it } from 'vitest';
import {
  APP_ID,
  SCHEMA_VERSION,
  TABLE_NAMES,
  V1_TABLE_NAMES,
  clearAll,
  createRecord,
  exportBackup,
  getRecord,
  importBackupFromJson,
  importBackupObject,
  listAlive,
  parseBackupJson,
  resetDbForTests,
} from './index';

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

function emptyTables(names: readonly string[]): Record<string, unknown[]> {
  return Object.fromEntries(names.map((name) => [name, []]));
}

/** 构造一份 v1 结构（16 张表、无 exercises/mistakes）的旧备份文本。 */
function makeV1BackupJson(): string {
  const tables = emptyTables(V1_TABLE_NAMES);
  const base = { created_at: 1_700_000_000_000, updated_at: 1_700_000_000_000, deleted_at: null };
  tables['settings'] = [
    {
      ...base,
      id: 'settings-1',
      key: 'app',
      daily_study_min: 120,
      daily_water_ml: 2000,
      cup_ml: 300,
      daily_play_min: 60,
      day_start: '04:00',
      theme: 'dark',
      last_backup_at: null,
    },
  ];
  tables['plans'] = [
    {
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
    },
  ];
  tables['reviews'] = [
    {
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
    },
  ];
  tables['workout_records'] = [
    {
      ...base,
      id: 'workout-1',
      date: '2026-06-01',
      type_name: '胸',
      exercises: [{ name: '卧推', sets: [{ weight_kg: 60, reps: 8, done: true }] }],
      duration_min: 45,
      done: true,
    },
  ];
  return JSON.stringify({ app: APP_ID, schema_version: 1, exported_at: 1_700_000_000_000, tables });
}

beforeEach(async () => {
  await resetDbForTests();
});

describe('v1 旧备份兼容导入', () => {
  it('v1 备份 JSON 能导入成功：旧表数据进入库，exercises/mistakes 为空', async () => {
    const result = await importBackupFromJson(makeV1BackupJson());
    expect(result.ok).toBe(true);

    const plans = await listAlive('plans');
    expect(plans.map((plan) => plan.title)).toEqual(['背单词']);
    expect((await listAlive('exercises'))).toHaveLength(0);
    expect((await listAlive('mistakes'))).toHaveLength(0);
    expect(await getRecord('settings', 'settings-1')).toBeUndefined(); // 单行表主键是 key
    expect((await getRecord('plans', 'plan-1'))?.category_name).toBe('学习');
  });

  it('v1 备份里 reviews / workout_records 的新字段按默认值补齐', async () => {
    const result = await importBackupFromJson(makeV1BackupJson());
    expect(result.ok).toBe(true);

    const review = await getRecord('reviews', 'review-1');
    expect(review?.good).toBe('专注');
    expect(review?.record_worthy).toBeNull();
    expect(review?.day_summary).toBeNull();

    const workout = await getRecord('workout_records', 'workout-1');
    expect(workout?.exercises).toEqual([
      { name: '卧推', sets: [{ weight_kg: 60, reps: 8, done: true }], note: null },
    ]);
  });

  it('校验通过后返回的备份已补齐为 v2 结构（schema_version=2、18 张表齐全）', () => {
    const parsed = parseBackupJson(makeV1BackupJson());
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.schema_version).toBe(SCHEMA_VERSION);
    expect(Object.keys(parsed.backup.tables).sort()).toEqual([...TABLE_NAMES].sort());
    expect(parsed.backup.tables['exercises']).toEqual([]);
    expect(parsed.backup.tables['mistakes']).toEqual([]);
  });

  it('v1 备份缺少旧表仍然拒绝导入（只对 v2 新增表放宽）', async () => {
    const raw = JSON.parse(makeV1BackupJson()) as { tables: Record<string, unknown[]> };
    delete raw.tables['water'];
    const result = await importBackupFromJson(JSON.stringify(raw));
    expect(result.ok).toBe(false);
    expect(await listAlive('plans')).toHaveLength(0); // 失败不改动现有数据
  });

  it('不支持的 schema_version（4，大于当前 3）被拒绝', async () => {
    const raw = JSON.parse(makeV1BackupJson()) as { schema_version: number };
    raw.schema_version = 4;
    const result = await importBackupFromJson(JSON.stringify(raw));
    expect(result.ok).toBe(false);
  });
});

describe('v2 备份 round-trip', () => {
  it('导出→清空→导入后全部 18 张表与 id 完全一致，图片仍是 base64 data URL', async () => {
    await createRecord('exercises', { name: '卧推' });
    const mistake = await createRecord('mistakes', {
      date: '2026-06-01',
      subject_name: '数学',
      question_text: '求导',
      question_images: [PNG_DATA_URL],
      correction_text: null,
      correction_images: [PNG_DATA_URL, PNG_DATA_URL],
      reasons: ['计算错误'],
      note: null,
      difficulty: 3,
      mastered: false,
    });
    await createRecord('reviews', {
      date: '2026-06-01',
      rating: 5,
      mood: 4,
      energy: 3,
      good: '专注',
      improve: null,
      mit: '晨跑',
      record_worthy: '第一次跑完 5 公里',
      day_summary: '状态不错',
      mit_added_to_plan: false,
    });
    await createRecord('workout_records', {
      date: '2026-06-01',
      type_name: '胸',
      exercises: [
        { name: '卧推', sets: [{ weight_kg: 60, reps: 8, done: true }], note: '停顿 2 秒' },
      ],
      duration_min: 40,
      done: true,
    });

    const backup = await exportBackup();
    expect(backup.schema_version).toBe(SCHEMA_VERSION);
    expect(JSON.parse(JSON.stringify(backup)).tables['mistakes']).toHaveLength(1);

    await clearAll();
    expect(await listAlive('exercises')).toHaveLength(0);
    expect(await listAlive('mistakes')).toHaveLength(0);

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

    const restored = await getRecord('mistakes', mistake.id);
    expect(restored?.question_images).toEqual([PNG_DATA_URL]);
    expect(restored?.correction_images).toEqual([PNG_DATA_URL, PNG_DATA_URL]);
    expect(restored?.reasons).toEqual(['计算错误']);
    expect(restored?.mastered).toBe(false);
    const reviews = await listAlive('reviews');
    expect(reviews[0]?.record_worthy).toBe('第一次跑完 5 公里');
    expect(reviews[0]?.day_summary).toBe('状态不错');
    const workouts = await listAlive('workout_records');
    expect(workouts[0]?.exercises[0]?.note).toBe('停顿 2 秒');
    expect((await listAlive('exercises')).map((row) => row.name)).toEqual(['卧推']);
  });

  it('错题缺 note 的旧结构备份：导入时补 null，已有备注原样保留', async () => {
    const raw = JSON.parse(makeV1BackupJson()) as {
      schema_version: number;
      tables: Record<string, unknown[]>;
    };
    raw.schema_version = 2;
    for (const name of TABLE_NAMES) raw.tables[name] = raw.tables[name] ?? [];
    const mistakeBase = {
      created_at: 1_700_000_000_000,
      updated_at: 1_700_000_000_000,
      deleted_at: null,
      date: '2026-06-01',
      subject_name: '数学',
      question_text: '求导',
      question_images: [],
      correction_text: null,
      correction_images: [],
      reasons: [],
      difficulty: 3,
      mastered: false,
    };
    raw.tables['mistakes'] = [
      { ...mistakeBase, id: 'mistake-no-note' },
      { ...mistakeBase, id: 'mistake-with-note', note: '粗心' },
    ];

    const parsed = parseBackupJson(JSON.stringify(raw));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.tables['mistakes'].map((row) => row.note)).toEqual([null, '粗心']);

    const result = await importBackupObject(parsed.backup);
    expect(result).toBeUndefined();
    expect((await getRecord('mistakes', 'mistake-no-note'))?.note).toBeNull();
    expect((await getRecord('mistakes', 'mistake-with-note'))?.note).toBe('粗心');
  });

  it('v2 备份的 JSON 文本可以重新解析导入（导入前提是 parseBackupJson 通过）', async () => {
    await createRecord('exercises', { name: '深蹲' });
    const text = JSON.stringify(await exportBackup());
    const parsed = parseBackupJson(text);
    expect(parsed.ok).toBe(true);
    const result = await importBackupFromJson(text);
    expect(result.ok).toBe(true);
    expect((await listAlive('exercises')).map((row) => row.name)).toEqual(['深蹲']);
  });
});

describe('v3 备份：books 补 sort_index（旧备份仍可导入）', () => {
  /** 构造一份 v2 结构（books 缺 sort_index）的备份文本。 */
  function makeV2BackupWithBooks(): string {
    const base = { created_at: 1_700_000_000_000, updated_at: 1_700_000_000_000, deleted_at: null };
    const tables: Record<string, unknown[]> = emptyTables(TABLE_NAMES);
    tables['books'] = [
      {
        ...base,
        id: 'book-a',
        title: 'A',
        author: null,
        total_pages: 300,
        current_page: 0,
        status: 'reading',
        color: '#4a6cf7',
        start_date: null,
        finish_date: null,
      },
      {
        ...base,
        id: 'book-b',
        title: 'B',
        author: null,
        total_pages: 300,
        current_page: 0,
        status: 'reading',
        color: '#4a6cf7',
        start_date: null,
        finish_date: null,
      },
    ];
    return JSON.stringify({ app: APP_ID, schema_version: 2, exported_at: 1_700_000_000_000, tables });
  }

  it('v2 备份导入成功，books 缺失的 sort_index 按出现顺序回填 10、20……', async () => {
    const result = await importBackupFromJson(makeV2BackupWithBooks());
    expect(result.ok).toBe(true);
    expect((await getRecord('books', 'book-a'))?.sort_index).toBe(10);
    expect((await getRecord('books', 'book-b'))?.sort_index).toBe(20);
  });

  it('已带 sort_index 的记录原样保留（只补不改）', () => {
    const raw = JSON.parse(makeV2BackupWithBooks()) as {
      tables: Record<string, unknown[]>;
    };
    (raw.tables['books'] as Array<Record<string, unknown>>)[0]!['sort_index'] = 70;
    const parsed = parseBackupJson(JSON.stringify(raw));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.tables['books'].map((row) => row.sort_index)).toEqual([70, 20]);
  });

  it('导出写 schema_version=3，导入接受 1/2/3，拒绝 4', async () => {
    const backup = await exportBackup();
    expect(backup.schema_version).toBe(3);
    for (const version of [1, 2, 3]) {
      const raw = JSON.parse(makeV2BackupWithBooks()) as { schema_version: number };
      raw.schema_version = version;
      expect(parseBackupJson(JSON.stringify(raw)).ok, '版本 ' + version + ' 应被接受').toBe(true);
    }
    const tooNew = JSON.parse(makeV2BackupWithBooks()) as { schema_version: number };
    tooNew.schema_version = 4;
    expect(parseBackupJson(JSON.stringify(tooNew)).ok).toBe(false);
  });
});
