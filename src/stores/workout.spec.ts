import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import {
  addCategory,
  createRecord,
  listAlive,
  listAliveByDate,
  removeCategory,
  resetDbForTests,
  type WorkoutRecord,
} from '@/db';
import {
  REST_TYPE_NAME,
  TEMP_WORKOUT_TYPE_NAME,
  buildDraftForDate,
  buildExercisesFromNames,
  computeDefaultDuration,
  defaultSetsForExercise,
  normalizeDurationMinutes,
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
