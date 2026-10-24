import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import {
  createRecord,
  listAliveByDate,
  resetDbForTests,
  updateRecord,
  type ActiveTimer,
  type Book,
  type Plan,
  type PlayRecord,
  type Review,
  type StudyRecord,
  type Water,
  type WorkoutRecord,
  type WorkoutTemplate,
} from '@/db';
import { DAY_MS } from '@/utils/date';
import {
  buildHomeHintCandidates,
  computeNextTimedPlan,
  computePlayAggregate,
  computeStudyAggregate,
  computeWorkoutAggregate,
  pickHomeHints,
  pickMainReadingBook,
  summarizeTodayPlans,
  useHomeStore,
} from '@/stores/home';
import { useSettingsStore } from '@/stores/settings';
import { useTimerStore } from '@/stores/timer';

/** 2026-06-01 是周一，today=2026-06-01，yesterday=2026-05-31；10:00 距 04:00 起点偏移 360 分钟。 */
const BASE = new Date('2026-06-01T10:00:00').getTime();
const TODAY = '2026-06-01';
const YESTERDAY = '2026-05-31';

let pinia: Pinia;

function useFakeDate(): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(BASE);
}

type BaseFields = { id: string; created_at: number; updated_at: number; deleted_at: number | null };

function planFixture(title: string, overrides: Partial<Omit<Plan, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>> = {}): Plan {
  return {
    id: `plan-${title}`,
    created_at: BASE,
    updated_at: BASE,
    deleted_at: null,
    title,
    date: TODAY,
    start_min: null,
    end_min: null,
    category_key: 'other',
    category_name: '其他',
    target_type: null,
    target_id: null,
    target_title: null,
    done: false,
    done_at: null,
    rollover_from_date: null,
    is_rolled_over: false,
    ...overrides,
  };
}

function studyFixture(durationSec: number, overrides: Partial<StudyRecord> = {}): StudyRecord {
  return {
    id: `study-${durationSec}-${Math.random()}`,
    created_at: BASE,
    updated_at: BASE,
    deleted_at: null,
    target_type: 'book',
    target_id: null,
    target_title: '读书',
    start_at: BASE - durationSec * 1000,
    end_at: BASE,
    duration_sec: durationSec,
    note: null,
    start_page: null,
    end_page: null,
    pages_read: null,
    source: 'manual',
    date: TODAY,
    ...overrides,
  } as StudyRecord;
}

function playFixture(minutes: number, overrides: Partial<PlayRecord> = {}): PlayRecord {
  return {
    id: `play-${minutes}-${Math.random()}`,
    created_at: BASE,
    updated_at: BASE,
    deleted_at: null,
    date: TODAY,
    content: '游戏',
    minutes,
    source: 'manual',
    ...overrides,
  } as PlayRecord;
}

function waterFixture(ml: number): Water {
  return {
    id: `water-${ml}-${Math.random()}`,
    created_at: BASE,
    updated_at: BASE,
    deleted_at: null,
    date: TODAY,
    ml,
    at: BASE,
  };
}

function reviewFixture(overrides: Partial<Review> = {}): Review {
  return {
    id: 'review-yesterday',
    created_at: BASE,
    updated_at: BASE,
    deleted_at: null,
    date: YESTERDAY,
    rating: null,
    mood: null,
    energy: null,
    good: null,
    improve: null,
    mit: null,
    mit_added_to_plan: false,
    ...overrides,
  } as Review;
}

function bookFixture(title: string, updatedAt: number, overrides: Partial<Book> = {}): Book {
  return {
    id: `book-${title}`,
    created_at: updatedAt,
    updated_at: updatedAt,
    deleted_at: null,
    title,
    author: null,
    total_pages: 300,
    current_page: 40,
    status: 'reading',
    color: '#4a6cf7',
    start_date: null,
    finish_date: null,
    ...overrides,
  } as Book;
}

function templateFixture(weekday: number, typeName: string): WorkoutTemplate {
  return {
    id: `template-${weekday}`,
    created_at: BASE,
    updated_at: BASE,
    deleted_at: null,
    weekday,
    type_name: typeName,
    exercise_names: [],
  };
}

function workoutRecordFixture(done: boolean, typeName = '胸'): WorkoutRecord {
  return {
    id: 'workout-today',
    created_at: BASE,
    updated_at: BASE,
    deleted_at: null,
    date: TODAY,
    type_name: typeName,
    exercises: [],
    duration_min: 45,
    done,
  };
}

function baseTimer(): ActiveTimer {
  return {
    key: 'global',
    id: 'timer-1',
    created_at: BASE,
    updated_at: BASE,
    deleted_at: null,
    type: 'book',
    target_id: null,
    target_title: '深入理解计算机系统',
    plan_id: null,
    mode: 'stopwatch',
    countdown_sec: 1500,
    started_at: BASE - 65_000,
    paused_total_ms: 0,
    paused: false,
    pause_started_at: null,
    ended_at: null,
  };
}

beforeEach(async () => {
  vi.useRealTimers();
  await resetDbForTests();
  pinia = createPinia();
  setActivePinia(pinia);
  await useSettingsStore().load();
  useFakeDate();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('提示条候选与优先级', () => {
  it('buildHomeHintCandidates：按命中生成计时/复盘/顺延/备份候选', () => {
    const candidates = buildHomeHintCandidates({
      timerActive: true,
      timerTitle: '读书',
      timerRoute: '/study/timer',
      yesterdayReviewed: false,
      rolloverCount: 3,
      backupDue: true,
    });
    expect(candidates.map((h) => h.kind)).toEqual(['timer', 'review', 'rollover', 'backup']);
    expect(candidates[0]?.text).toContain('计时');
    expect(candidates[2]?.text).toContain('3 项');
  });

  it('pickHomeHints：同优先级去重、按优先级升序、最多取 2 条', () => {
    const candidates = buildHomeHintCandidates({
      timerActive: true,
      timerTitle: '读书',
      timerRoute: '/study/timer',
      yesterdayReviewed: false,
      rolloverCount: 2,
      backupDue: true,
    });
    const duplicated = [...candidates, { ...(candidates[0] as (typeof candidates)[number]) }];
    expect(pickHomeHints(duplicated).map((h) => h.kind)).toEqual(['timer', 'review']);
    expect(pickHomeHints(candidates).map((h) => h.kind)).toEqual(['timer', 'review']);
  });

  it('无计时时顺延与备份按优先级依次补位', () => {
    const picked = pickHomeHints(
      buildHomeHintCandidates({
        timerActive: false,
        timerTitle: '',
        timerRoute: '',
        yesterdayReviewed: true,
        rolloverCount: 4,
        backupDue: true,
      }),
    );
    expect(picked.map((h) => h.kind)).toEqual(['rollover', 'backup']);
  });
});

describe('备份提醒判断', () => {
  it('home.backupDue：从未备份且最早数据满 7 天才提醒', () => {
    const home = useHomeStore();
    home.$patch({ earliestDataAt: BASE - 7 * DAY_MS });
    expect(home.backupDue).toBe(true);
    home.$patch({ earliestDataAt: BASE - 6 * DAY_MS });
    expect(home.backupDue).toBe(false);
  });

  it('home.backupDue：距上次备份超过 7 天提醒（恰好 7 天不提醒）', async () => {
    const settings = useSettingsStore();
    const home = useHomeStore();
    settings.data = { ...(settings.data as NonNullable<typeof settings.data>), last_backup_at: BASE - 7 * DAY_MS };
    home.$patch({ earliestDataAt: null });
    expect(home.backupDue).toBe(false);
    settings.data = { ...(settings.data as NonNullable<typeof settings.data>), last_backup_at: BASE - 7 * DAY_MS - 1 };
    expect(home.backupDue).toBe(true);
  });
});

describe('今日聚合纯函数', () => {
  it('computeStudyAggregate：学习时长合计与进度百分比（超目标封顶 100）', () => {
    expect(computeStudyAggregate([studyFixture(5400)], 120)).toEqual({
      totalSec: 5400,
      goalMin: 120,
      progressPercent: 75,
    });
    expect(computeStudyAggregate([studyFixture(7200), studyFixture(7200)], 120).progressPercent).toBe(100);
    expect(computeStudyAggregate([], 0)).toEqual({ totalSec: 0, goalMin: 0, progressPercent: 0 });
  });

  it('computePlayAggregate：已用/额度/剩余/超额度', () => {
    expect(computePlayAggregate([playFixture(30), playFixture(45)], 60)).toEqual({
      usedMin: 75,
      limitMin: 60,
      remainingMin: 0,
      over: true,
    });
    expect(computePlayAggregate([playFixture(20)], 60)).toEqual({
      usedMin: 20,
      limitMin: 60,
      remainingMin: 40,
      over: false,
    });
  });

  it('pickMainReadingBook：在读书籍取最近更新的一本；无在读返回 null', () => {
    const older = bookFixture('旧书', BASE);
    const newer = bookFixture('新书', BASE + 60_000);
    const done = bookFixture('读完的书', BASE + 120_000, { status: 'done' });
    expect(pickMainReadingBook([older, newer, done])?.title).toBe('新书');
    expect(pickMainReadingBook([done])).toBeNull();
  });

  it('computeNextTimedPlan：优先取开始偏移 >= 当前偏移的第一项；没有则取最近一个未完成时间块', () => {
    const plans = [
      planFixture('早起', { start_min: 200, end_min: 260 }),
      planFixture('读书', { start_min: 400, end_min: 460 }),
      planFixture('已完成', { start_min: 360, end_min: 380, done: true }),
    ];
    expect(computeNextTimedPlan(plans, 360)?.title).toBe('读书');
    expect(computeNextTimedPlan(plans, 500)?.title).toBe('读书');
    expect(computeNextTimedPlan(plans, 100)?.title).toBe('早起');
  });

  it('summarizeTodayPlans：完成数/总数/下一项；无未完成时间块返回 null', () => {
    const plans = [
      planFixture('早起', { start_min: 200, end_min: 260 }),
      planFixture('读书', { start_min: 400, end_min: 460 }),
      planFixture('已完成待办', { done: true }),
    ];
    expect(summarizeTodayPlans(plans, 360)).toEqual({
      done: 1,
      total: 3,
      next: plans.find((p) => p.title === '读书') ?? null,
    });
    expect(summarizeTodayPlans([planFixture('已完成', { start_min: 100, end_min: 200, done: true })], 0).next).toBeNull();
  });

  it('computeWorkoutAggregate：休息日（无模板或模板为休息）与训练完成状态', () => {
    expect(computeWorkoutAggregate(null, null)).toEqual({ isRest: true, typeName: null, done: false });
    expect(computeWorkoutAggregate(templateFixture(1, '休息'), null)).toEqual({ isRest: true, typeName: null, done: false });
    expect(computeWorkoutAggregate(templateFixture(1, '胸'), workoutRecordFixture(true))).toEqual({
      isRest: false,
      typeName: '胸',
      done: true,
    });
    expect(computeWorkoutAggregate(templateFixture(1, '胸'), null)).toEqual({
      isRest: false,
      typeName: '胸',
      done: false,
    });
  });
});

describe('首页 store 聚合与动作', () => {
  it('load 按今天聚合六张卡片数据，并识别昨日未复盘与可顺延数', async () => {
    await createRecord('study_records', {
      target_type: 'book',
      target_id: null,
      target_title: '读书',
      start_at: BASE - 1800_000,
      end_at: BASE,
      duration_sec: 1800,
      note: null,
      start_page: null,
      end_page: null,
      pages_read: null,
      source: 'manual',
      date: TODAY,
    });
    await createRecord('study_records', {
      target_type: 'subject',
      target_id: null,
      target_title: '数学',
      start_at: BASE - 3600_000,
      end_at: BASE,
      duration_sec: 3600,
      note: null,
      start_page: null,
      end_page: null,
      pages_read: null,
      source: 'manual',
      date: TODAY,
    });
    await createRecord('water', { date: TODAY, ml: 250, at: BASE });
    await createRecord('water', { date: TODAY, ml: 500, at: BASE });
    await createRecord('play_records', { date: TODAY, content: '游戏', minutes: 30, source: 'manual' });
    await createRecord('play_records', { date: TODAY, content: '视频', minutes: 45, source: 'manual' });
    await createRecord('plans', {
      title: '已完成待办',
      date: TODAY,
      start_min: null,
      end_min: null,
      category_key: 'other',
      category_name: '其他',
      target_type: null,
      target_id: null,
      target_title: null,
      done: true,
      done_at: BASE,
      rollover_from_date: null,
      is_rolled_over: false,
    });
    await createRecord('plans', {
      title: '未完成待办',
      date: TODAY,
      start_min: null,
      end_min: null,
      category_key: 'other',
      category_name: '其他',
      target_type: null,
      target_id: null,
      target_title: null,
      done: false,
      done_at: null,
      rollover_from_date: null,
      is_rolled_over: false,
    });
    await createRecord('plans', {
      title: '早间时间块',
      date: TODAY,
      start_min: 200,
      end_min: 260,
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
    await createRecord('plans', {
      title: '晚间时间块',
      date: TODAY,
      start_min: 400,
      end_min: 460,
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
    await createRecord('plans', {
      title: '昨天没做完',
      date: YESTERDAY,
      start_min: null,
      end_min: null,
      category_key: 'other',
      category_name: '其他',
      target_type: null,
      target_id: null,
      target_title: null,
      done: false,
      done_at: null,
      rollover_from_date: null,
      is_rolled_over: false,
    });
    await createRecord('workout_templates', { weekday: 1, type_name: '胸', exercise_names: ['卧推'] });
    await createRecord('workout_records', {
      date: TODAY,
      type_name: '胸',
      exercises: [{ name: '卧推', sets: [{ weight_kg: 40, reps: 10, done: true }] }],
      duration_min: 45,
      done: true,
    });
    await createRecord('books', {
      title: '旧书',
      author: null,
      total_pages: 300,
      current_page: 40,
      status: 'reading',
      color: '#4a6cf7',
      start_date: null,
      finish_date: null,
    });
    vi.setSystemTime(BASE + 60_000);
    await createRecord('books', {
      title: '新书',
      author: null,
      total_pages: 200,
      current_page: 100,
      status: 'reading',
      color: '#2e9e5b',
      start_date: null,
      finish_date: null,
    });
    vi.setSystemTime(BASE);

    const home = useHomeStore();
    await home.load();

    expect(home.study).toEqual({ totalSec: 5400, goalMin: 120, progressPercent: 75 });
    expect(home.water).toEqual({ totalMl: 750, goalMl: 2000 });
    expect(home.play).toEqual({ usedMin: 75, limitMin: 60, remainingMin: 0, over: true });
    expect(home.planSummary.done).toBe(1);
    expect(home.planSummary.total).toBe(4);
    expect(home.planSummary.next?.title).toBe('晚间时间块');
    expect(home.mainBook?.title).toBe('新书');
    expect(home.workout).toEqual({ isRest: false, typeName: '胸', done: true });
    expect(home.yesterdayReviewed).toBe(false);
    expect(home.rolloverCount).toBe(1);
  });

  it('yesterdayReviewed 与复盘页同口径：空记录行不算已复盘，只填一句话总结也算', async () => {
    await createRecord('reviews', {
      date: YESTERDAY,
      rating: null,
      mood: null,
      energy: null,
      good: null,
      improve: null,
      mit: null,
      record_worthy: null,
      day_summary: null,
      mit_added_to_plan: false,
    });
    const home = useHomeStore();
    await home.load();
    expect(home.yesterdayReviewed).toBe(false);
    expect(home.hints.some((hint) => hint.kind === 'review')).toBe(true);

    const emptyRow = (await listAliveByDate('reviews', YESTERDAY))[0];
    expect(emptyRow).toBeDefined();
    await updateRecord('reviews', emptyRow!.id, { day_summary: '状态不错' });

    await home.load();
    expect(home.yesterdayReviewed).toBe(true);
    expect(home.hints.some((hint) => hint.kind === 'review')).toBe(false);
  });

  it('store.hints 在计时进行中且昨日未复盘时取计时+复盘两条', async () => {
    const timer = useTimerStore();
    timer.$patch({ timer: baseTimer() });
    const home = useHomeStore();
    await home.load();
    expect(home.hints.map((h) => h.kind)).toEqual(['timer', 'review']);
    expect(home.hints).toHaveLength(2);
  });

  it('addMit 复用 addMitToPlan：成功加入后置位防重复，重复调用不再新增', async () => {
    await createRecord('reviews', {
      date: YESTERDAY,
      rating: 5,
      mood: 4,
      energy: 4,
      good: null,
      improve: null,
      mit: '写代码',
      mit_added_to_plan: false,
    });
    const home = useHomeStore();
    await home.load();
    expect(home.mitText).toBe('写代码');
    expect(home.mitAdded).toBe(false);

    const created = await home.addMit();
    expect(created?.title).toBe('写代码');
    expect(home.mitAdded).toBe(true);

    const again = await home.addMit();
    expect(again).toBeNull();
    const todayPlans = await listAliveByDate('plans', TODAY);
    expect(todayPlans.filter((plan) => plan.title === '写代码')).toHaveLength(1);
  });

  it('addWater 复用 diet store：首页喝水 +1 杯并刷新聚合', async () => {
    const home = useHomeStore();
    await home.load();
    expect(home.water.totalMl).toBe(0);

    await home.addWater();
    expect(home.water.totalMl).toBe(250);

    const rows = await listAliveByDate('water', TODAY);
    expect(rows.reduce((sum, row) => sum + row.ml, 0)).toBe(250);
  });
});
