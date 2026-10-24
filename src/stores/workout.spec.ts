import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import {
  addCategory,
  createRecord,
  listAlive,
  listAliveByDate,
  removeCategory,
  resetDbForTests,
  softDelete,
  type WorkoutRecord,
} from '@/db';
import {
  REST_TYPE_NAME,
  TEMP_WORKOUT_TYPE_NAME,
  buildDraftForDate,
  buildExercisesFromNames,
  computeDefaultDuration,
  defaultSetsForExercise,
  lastUsedAtByName,
  normalizeDurationMinutes,
  recentOrder,
  sortRecordsDesc,
  useWorkoutStore,
  weekdayOf,
  type WorkoutHistoryEntry,
} from '@/stores/workout';

/** 2026-06-01 是周一。 */
const BASE = new Date('2026-06-01T10:00:00').getTime();
const TODAY = '2026-06-01';

let pinia: Pinia;
let store: ReturnType<typeof useWorkoutStore>;

function useFakeDate(): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(BASE);
}

type WorkoutRecordData = Omit<WorkoutRecord, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>;

function makeRecord(date: string, overrides: Partial<WorkoutRecordData> = {}): WorkoutRecordData {
  return {
    date,
    type_name: '胸',
    exercises: [],
    duration_min: 30,
    done: true,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.useRealTimers();
  window.localStorage.clear();
  await resetDbForTests();
  pinia = createPinia();
  setActivePinia(pinia);
  store = useWorkoutStore();
  useFakeDate();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('纯函数：星期、默认组数与默认用时', () => {
  it('weekdayOf：1=周一 ~ 7=周日', () => {
    expect(weekdayOf('2026-06-01')).toBe(1);
    expect(weekdayOf('2026-06-02')).toBe(2);
    expect(weekdayOf('2026-06-07')).toBe(7);
  });

  it('默认数值取最近一次已完成记录并按动作名匹配，done 重置 false', () => {
    const history: WorkoutHistoryEntry[] = [
      {
        date: '2026-05-20',
        updated_at: 1,
        done: true,
        exercises: [{ name: '卧推', sets: [{ weight_kg: 60, reps: 10, done: true }] }],
      },
      {
        date: '2026-05-30',
        updated_at: 1,
        done: false,
        exercises: [{ name: '卧推', sets: [{ weight_kg: 70, reps: 8, done: false }] }],
      },
      {
        date: '2026-05-28',
        updated_at: 1,
        done: true,
        exercises: [
          {
            name: '卧推',
            sets: [
              { weight_kg: 80, reps: 8, done: true },
              { weight_kg: 82.5, reps: 6, done: true },
            ],
          },
        ],
      },
      {
        date: '2026-05-29',
        updated_at: 1,
        done: true,
        exercises: [{ name: '深蹲', sets: [{ weight_kg: 100, reps: 5, done: true }] }],
      },
    ];
    expect(defaultSetsForExercise('卧推', history)).toEqual([
      { weight_kg: 80, reps: 8, done: false },
      { weight_kg: 82.5, reps: 6, done: false },
    ]);
    expect(defaultSetsForExercise('深蹲', history)).toEqual([
      { weight_kg: 100, reps: 5, done: false },
    ]);
  });

  it('无历史默认 3 组空值；buildExercisesFromNames 去重去空', () => {
    expect(defaultSetsForExercise('硬拉', [])).toEqual([
      { weight_kg: null, reps: null, done: false },
      { weight_kg: null, reps: null, done: false },
      { weight_kg: null, reps: null, done: false },
    ]);
    const exercises = buildExercisesFromNames(['卧推', '', '卧推', '硬拉'], []);
    expect(exercises.map((e) => e.name)).toEqual(['卧推', '硬拉']);
    expect(exercises[0]?.sets).toHaveLength(3);
  });

  it('buildDraftForDate：休息/无模板返回 null；训练模板带入类型与动作', () => {
    expect(buildDraftForDate(TODAY, [], [])).toBeNull();
    expect(
      buildDraftForDate(TODAY, [{ weekday: 1, type_name: REST_TYPE_NAME, exercise_names: [] }], []),
    ).toBeNull();
    const draft = buildDraftForDate(
      TODAY,
      [{ weekday: 1, type_name: '胸', exercise_names: ['卧推', '飞鸟'] }],
      [],
    );
    expect(draft).toMatchObject({ date: TODAY, type_name: '胸', duration_min: null, done: false });
    expect(draft?.exercises.map((e) => e.name)).toEqual(['卧推', '飞鸟']);
    expect(
      draft?.exercises.every((e) => e.sets.length === 3 && e.sets.every((s) => !s.done)),
    ).toBe(true);
  });

  it('computeDefaultDuration：无首勾/不足 1 分钟=30，1 分钟起按差值', () => {
    expect(computeDefaultDuration(null, BASE + 60_000)).toBe(30);
    expect(computeDefaultDuration(BASE, BASE + 30_000)).toBe(30);
    expect(computeDefaultDuration(BASE, BASE)).toBe(30);
    expect(computeDefaultDuration(BASE, BASE + 60_000)).toBe(1);
    expect(computeDefaultDuration(BASE, BASE + 5 * 60_000)).toBe(5);
  });

  it('sortRecordsDesc：日期倒序，同日按 updated_at 倒序', () => {
    const sorted = sortRecordsDesc<WorkoutHistoryEntry>([
      { date: '2026-05-30', updated_at: 5, done: true, exercises: [] },
      { date: '2026-06-01', updated_at: 1, done: true, exercises: [] },
      { date: '2026-05-30', updated_at: 9, done: true, exercises: [] },
      { date: '2026-05-31', updated_at: 1, done: true, exercises: [] },
    ]);
    expect(sorted.map((r) => r.date + ':' + String(r.updated_at))).toEqual([
      '2026-06-01:1',
      '2026-05-31:1',
      '2026-05-30:9',
      '2026-05-30:5',
    ]);
  });

  it('normalizeDurationMinutes：非正整数归 null', () => {
    expect(normalizeDurationMinutes(45)).toBe(45);
    expect(normalizeDurationMinutes(0)).toBeNull();
    expect(normalizeDurationMinutes(-3)).toBeNull();
    expect(normalizeDurationMinutes(null)).toBeNull();
    expect(normalizeDurationMinutes(Number.NaN)).toBeNull();
  });
});

describe('周计划即时保存', () => {
  it('saveTemplate：同一 weekday 更新不新建；休息清空动作；非法输入拒绝', async () => {
    await addCategory('workout_types', '胸');
    await store.loadWeek(TODAY);
    expect(store.workoutTypes.map((t) => t.name)).toContain('胸');

    await store.saveTemplate(1, { type_name: '胸', exercise_names: [' 卧推 ', '卧推', '飞鸟'] });
    let rows = await listAlive('workout_templates');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ weekday: 1, type_name: '胸', exercise_names: ['卧推', '飞鸟'] });

    await store.saveTemplate(1, { exercise_names: ['卧推', '夹胸'] });
    rows = await listAlive('workout_templates');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.exercise_names).toEqual(['卧推', '夹胸']);

    await store.saveTemplate(1, { type_name: REST_TYPE_NAME });
    rows = await listAlive('workout_templates');
    expect(rows[0]?.type_name).toBe(REST_TYPE_NAME);
    expect(rows[0]?.exercise_names).toEqual([]);

    await expect(store.saveTemplate(0, { type_name: '胸' })).rejects.toThrow('星期编号必须是 1~7');
    await expect(store.saveTemplate(8, { type_name: '胸' })).rejects.toThrow('星期编号必须是 1~7');
    await expect(store.saveTemplate(1, { type_name: '不存在' })).rejects.toThrow('训练类型不存在');
  });

  it('休息日判定：loadDay 返回 day=null；开始临时训练新建空记录且幂等', async () => {
    await store.loadWeek(TODAY);
    await store.saveTemplate(1, { type_name: REST_TYPE_NAME });
    await store.loadDay(TODAY);
    expect(store.day).toBeNull();
    expect(store.dayPersisted).toBe(false);

    const record = await store.startTemporaryWorkout(TODAY);
    expect(record.type_name).toBe(TEMP_WORKOUT_TYPE_NAME);
    expect(record.exercises).toEqual([]);
    expect(store.day?.type_name).toBe(TEMP_WORKOUT_TYPE_NAME);
    expect(store.dayPersisted).toBe(true);
    expect(await listAliveByDate('workout_records', TODAY)).toHaveLength(1);

    const again = await store.startTemporaryWorkout(TODAY);
    expect(again.id).toBe(record.id);
    expect(await listAliveByDate('workout_records', TODAY)).toHaveLength(1);
  });
});

describe('当天训练即时保存与默认数值', () => {
  it('loadDay 带出模板草稿：无历史默认 3 组，首次编辑才落库', async () => {
    await addCategory('workout_types', '胸');
    await store.loadWeek(TODAY);
    await store.saveTemplate(1, { type_name: '胸', exercise_names: ['卧推'] });
    await store.loadDay(TODAY);
    expect(store.day?.type_name).toBe('胸');
    expect(store.day?.exercises[0]?.sets).toHaveLength(3);
    expect(store.dayPersisted).toBe(false);

    await store.toggleSet(TODAY, 0, 0);
    expect(store.dayPersisted).toBe(true);
    const rows = await listAliveByDate('workout_records', TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.exercises[0]?.sets[0]?.done).toBe(true);
    expect(store.firstCheckAtMs).toBe(BASE);
  });

  it('loadDay 草稿默认数值取最近一次已完成记录（按动作名匹配，未完成忽略）', async () => {
    await createRecord(
      'workout_records',
      makeRecord('2026-05-28', {
        exercises: [
          {
            name: '卧推',
            sets: [
              { weight_kg: 80, reps: 8, done: true },
              { weight_kg: 82.5, reps: 6, done: true },
            ],
          },
        ],
      }),
    );
    await createRecord(
      'workout_records',
      makeRecord('2026-05-30', {
        done: false,
        exercises: [{ name: '卧推', sets: [{ weight_kg: 70, reps: 10, done: false }] }],
      }),
    );
    await addCategory('workout_types', '胸');
    await store.loadWeek(TODAY);
    await store.saveTemplate(1, { type_name: '胸', exercise_names: ['卧推', '硬拉'] });
    await store.loadDay(TODAY);
    expect(store.day?.exercises[0]?.sets).toEqual([
      { weight_kg: 80, reps: 8, done: false },
      { weight_kg: 82.5, reps: 6, done: false },
    ]);
    expect(store.day?.exercises[1]?.sets).toHaveLength(3);
  });

  it('addExercise 带历史默认组数；rename/remove 即时写入', async () => {
    await createRecord(
      'workout_records',
      makeRecord('2026-05-28', {
        exercises: [
          {
            name: '飞鸟',
            sets: [
              { weight_kg: 20, reps: 12, done: true },
              { weight_kg: 20, reps: 12, done: true },
            ],
          },
        ],
      }),
    );
    await addCategory('workout_types', '胸');
    await store.loadWeek(TODAY);
    await store.saveTemplate(1, { type_name: '胸', exercise_names: ['卧推'] });
    await store.loadDay(TODAY);

    await store.addExercise(TODAY, '飞鸟');
    let rows = await listAliveByDate('workout_records', TODAY);
    expect(rows[0]?.exercises.map((e) => e.name)).toEqual(['卧推', '飞鸟']);
    expect(rows[0]?.exercises[1]?.sets).toEqual([
      { weight_kg: 20, reps: 12, done: false },
      { weight_kg: 20, reps: 12, done: false },
    ]);

    await store.renameExercise(TODAY, 1, '蝴蝶机夹胸');
    await store.removeExercise(TODAY, 1);
    rows = await listAliveByDate('workout_records', TODAY);
    expect(rows[0]?.exercises.map((e) => e.name)).toEqual(['卧推']);
  });

  it('updateSet：修改重量/次数即时保存，空值归 null，done 状态保留', async () => {
    await addCategory('workout_types', '胸');
    await store.loadWeek(TODAY);
    await store.saveTemplate(1, { type_name: '胸', exercise_names: ['卧推'] });
    await store.loadDay(TODAY);
    await store.toggleSet(TODAY, 0, 0);
    await store.updateSet(TODAY, 0, 0, { weight_kg: 80, reps: 8 });
    let rows = await listAliveByDate('workout_records', TODAY);
    expect(rows[0]?.exercises[0]?.sets[0]).toMatchObject({ weight_kg: 80, reps: 8, done: true });

    await store.updateSet(TODAY, 0, 0, { weight_kg: null, reps: null });
    rows = await listAliveByDate('workout_records', TODAY);
    expect(rows[0]?.exercises[0]?.sets[0]).toMatchObject({ weight_kg: null, reps: null, done: true });
  });
});

describe('完成训练与用时计算', () => {
  async function seedToday(): Promise<void> {
    await addCategory('workout_types', '胸');
    await store.loadWeek(TODAY);
    await store.saveTemplate(1, { type_name: '胸', exercise_names: ['卧推'] });
    await store.loadDay(TODAY);
  }

  it('默认用时=首组勾选到完成的时间差，done=true', async () => {
    await seedToday();
    await store.toggleSet(TODAY, 0, 0);
    vi.setSystemTime(BASE + 5 * 60_000);
    const finished = await store.finishWorkout(TODAY);
    expect(finished.done).toBe(true);
    expect(finished.duration_min).toBe(5);
  });

  it('同一日期重载（保存后刷新）不丢首勾时刻，仍按首勾到完成算默认用时', async () => {
    await seedToday();
    await store.toggleSet(TODAY, 0, 0);
    expect(store.firstCheckAtMs).toBe(BASE);

    // 模拟"每次保存后重新 loadDay"造成的重载：不得清空首勾时刻
    await store.loadDay(TODAY);
    expect(store.firstCheckAtMs).toBe(BASE);

    vi.setSystemTime(BASE + 5 * 60_000);
    expect((await store.finishWorkout(TODAY)).duration_min).toBe(5);
  });

  it('切到另一天会重置首勾时刻（不跨日期串用）', async () => {
    await seedToday();
    await store.toggleSet(TODAY, 0, 0);
    expect(store.firstCheckAtMs).toBe(BASE);

    await store.loadDay('2026-06-02');
    expect(store.firstCheckAtMs).toBeNull();
  });

  it('不足 1 分钟：默认 30 分钟', async () => {
    await seedToday();
    await store.toggleSet(TODAY, 0, 0);
    vi.setSystemTime(BASE + 30_000);
    expect((await store.finishWorkout(TODAY)).duration_min).toBe(30);
  });

  it('一次性勾完（无有效时间差）：默认 30 分钟', async () => {
    await seedToday();
    await store.toggleSet(TODAY, 0, 0);
    expect((await store.finishWorkout(TODAY)).duration_min).toBe(30);
  });

  it('从未勾选直接完成：默认 30 分钟且草稿落库', async () => {
    await seedToday();
    expect(store.dayPersisted).toBe(false);
    const finished = await store.finishWorkout(TODAY);
    expect(finished.duration_min).toBe(30);
    expect(finished.done).toBe(true);
    expect(store.dayPersisted).toBe(true);
  });

  it('手改用时优先，完成后仍可手改', async () => {
    await seedToday();
    await store.toggleSet(TODAY, 0, 0);
    await store.setDuration(TODAY, 45);
    vi.setSystemTime(BASE + 10 * 60_000);
    const finished = await store.finishWorkout(TODAY);
    expect(finished.duration_min).toBe(45);

    await store.setDuration(TODAY, 50);
    const rows = await listAliveByDate('workout_records', TODAY);
    expect(rows[0]?.duration_min).toBe(50);
    expect(rows[0]?.done).toBe(true);
  });
});

describe('快照与历史列表', () => {
  it('训练类型删除后历史记录靠 type_name 快照显示', async () => {
    const type = await addCategory('workout_types', '胸');
    await store.loadWeek(TODAY);
    await store.saveTemplate(1, { type_name: '胸', exercise_names: ['卧推'] });
    await store.loadDay(TODAY);
    await store.toggleSet(TODAY, 0, 0);

    await removeCategory('workout_types', type.id);
    await store.load(TODAY);
    expect(store.workoutTypes).toHaveLength(0);
    expect(store.day?.type_name).toBe('胸');
    expect((await listAliveByDate('workout_records', TODAY))[0]?.type_name).toBe('胸');
  });

  it('listHistory：日期倒序', async () => {
    await createRecord('workout_records', makeRecord('2026-05-30'));
    await createRecord('workout_records', makeRecord('2026-06-01'));
    await createRecord('workout_records', makeRecord('2026-05-31'));
    const history = await store.listHistory();
    expect(history.map((r) => r.date)).toEqual(['2026-06-01', '2026-05-31', '2026-05-30']);
    expect(store.history.map((r) => r.date)).toEqual(history.map((r) => r.date));
  });
});


describe('M5 项目库排序（纯函数）', () => {
  it('lastUsedAtByName：取最近一条包含该动作记录的 updated_at', () => {
    const history: WorkoutHistoryEntry[] = [
      { date: '2026-05-20', updated_at: 100, done: true, exercises: [{ name: '卧推', sets: [] }] },
      { date: '2026-05-20', updated_at: 200, done: true, exercises: [{ name: '卧推', sets: [] }] },
      { date: '2026-05-25', updated_at: 50, done: true, exercises: [{ name: '飞鸟', sets: [] }] },
    ];
    const used = lastUsedAtByName(history);
    expect(used.get('卧推')).toBe(200);
    expect(used.get('飞鸟')).toBe(50);
    expect(used.has('深蹲')).toBe(false);
  });

  it('recentOrder：最近使用优先，无历史排后面，再按名字升序', () => {
    const history: WorkoutHistoryEntry[] = [
      { date: '2026-05-20', updated_at: 100, done: true, exercises: [{ name: '卧推', sets: [] }] },
      { date: '2026-05-20', updated_at: 200, done: true, exercises: [{ name: '飞鸟', sets: [] }] },
    ];
    // 飞鸟(200) > 卧推(100) > 无历史按名字升序：深蹲 < 硬拉
    expect(recentOrder(['深蹲', '卧推', '硬拉', '飞鸟'], history)).toEqual([
      '飞鸟',
      '卧推',
      '深蹲',
      '硬拉',
    ]);
    // 全部无历史：名字升序
    expect(recentOrder(['B', 'A', 'C'], [])).toEqual(['A', 'B', 'C']);
    // 同名去重、去空
    expect(recentOrder(['A', 'A', ' ', 'B'], [])).toEqual(['A', 'B']);
  });
});

describe('M5 项目库自动维护', () => {
  async function seedChest(): Promise<void> {
    await addCategory('workout_types', '胸');
    await store.loadWeek(TODAY);
    await store.saveTemplate(1, { type_name: '胸', exercise_names: ['卧推'] });
    await store.loadDay(TODAY);
  }

  it('addExercise：把动作名 upsert 进 exercises，重复添加不产生重复行', async () => {
    await seedChest();
    await store.addExercise(TODAY, '飞鸟');
    let rows = await listAlive('exercises');
    expect(rows.filter((r) => r.name === '飞鸟')).toHaveLength(1);
    // 模板里的动作也被收录
    expect(rows.some((r) => r.name === '卧推')).toBe(true);

    // 再次添加同名（当天记录里已存在，属幂等 no-op）——exercises 仍只有一行
    await store.addExercise(TODAY, '飞鸟');
    rows = await listAlive('exercises');
    expect(rows.filter((r) => r.name === '飞鸟')).toHaveLength(1);
  });

  it('软删除的 exercises 行视为不存在：upsert 新建一条有效行', async () => {
    await seedChest();
    await store.addExercise(TODAY, '飞鸟');
    const before = (await listAlive('exercises')).find((r) => r.name === '飞鸟')!;
    await softDelete('exercises', before.id);
    expect((await listAlive('exercises')).some((r) => r.name === '飞鸟')).toBe(false);

    await store.addExercise(TODAY, '飞鸟');
    const alive = (await listAlive('exercises')).filter((r) => r.name === '飞鸟');
    expect(alive).toHaveLength(1);
    expect(alive[0]?.id).not.toBe(before.id);
  });

  it('renameExercise / saveTemplate 也会 upsert 项目库', async () => {
    await seedChest();
    await store.renameExercise(TODAY, 0, '蝴蝶机夹胸');
    expect((await listAlive('exercises')).some((r) => r.name === '蝴蝶机夹胸')).toBe(true);

    await store.saveTemplate(2, { type_name: '胸', exercise_names: ['深蹲', '硬拉'] });
    const names = (await listAlive('exercises')).map((r) => r.name);
    expect(names).toContain('深蹲');
    expect(names).toContain('硬拉');
  });
});

describe('M5 动作备注', () => {
  async function seedChest(): Promise<void> {
    await addCategory('workout_types', '胸');
    await store.loadWeek(TODAY);
    await store.saveTemplate(1, { type_name: '胸', exercise_names: ['卧推'] });
    await store.loadDay(TODAY);
  }

  it('setExerciseNote：写入 note 即时落库；空白/清空存 null', async () => {
    await seedChest();
    await store.setExerciseNote(TODAY, 0, '  加到 60kg，8 次力竭  ');
    let rows = await listAliveByDate('workout_records', TODAY);
    expect(rows[0]?.exercises[0]?.note).toBe('加到 60kg，8 次力竭');

    await store.setExerciseNote(TODAY, 0, '   ');
    rows = await listAliveByDate('workout_records', TODAY);
    expect(rows[0]?.exercises[0]?.note).toBeNull();

    await store.setExerciseNote(TODAY, 0, '再写一条');
    await store.setExerciseNote(TODAY, 0, null);
    rows = await listAliveByDate('workout_records', TODAY);
    expect(rows[0]?.exercises[0]?.note).toBeNull();
  });

  it('备注在勾选/改值后仍保留（cloneExercises 不丢 note）', async () => {
    await seedChest();
    await store.setExerciseNote(TODAY, 0, '保留我');
    await store.toggleSet(TODAY, 0, 0);
    await store.updateSet(TODAY, 0, 0, { weight_kg: 60, reps: 8 });
    const rows = await listAliveByDate('workout_records', TODAY);
    expect(rows[0]?.exercises[0]?.note).toBe('保留我');
    expect(rows[0]?.exercises[0]?.sets[0]).toMatchObject({ weight_kg: 60, reps: 8, done: true });
  });

  it('备注不影响默认用时（首勾到完成的差值照旧）', async () => {
    await seedChest();
    await store.setExerciseNote(TODAY, 0, '备注不该影响用时');
    await store.toggleSet(TODAY, 0, 0);
    vi.setSystemTime(BASE + 5 * 60_000);
    const finished = await store.finishWorkout(TODAY);
    expect(finished.duration_min).toBe(5);
    const rows = await listAliveByDate('workout_records', TODAY);
    expect(rows[0]?.exercises[0]?.note).toBe('备注不该影响用时');
  });
});

describe('M5 libraryNames getter', () => {
  it('最近使用优先，无历史按名字升序', async () => {
    vi.setSystemTime(BASE);
    await createRecord(
      'workout_records',
      makeRecord('2026-05-30', {
        exercises: [{ name: '卧推', sets: [{ weight_kg: 60, reps: 8, done: true }] }],
      }),
    );
    vi.setSystemTime(BASE + 1000);
    await createRecord(
      'workout_records',
      makeRecord('2026-05-30', {
        exercises: [{ name: '飞鸟', sets: [{ weight_kg: 20, reps: 12, done: true }] }],
      }),
    );
    await createRecord('exercises', { name: '卧推' });
    await createRecord('exercises', { name: '飞鸟' });
    await createRecord('exercises', { name: '深蹲' });

    await store.load(TODAY);
    expect(store.libraryNames).toEqual(['飞鸟', '卧推', '深蹲']);
  });
});

