import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as database from '@/db';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import {
  createRecord,
  listAliveByDate,
  resetDbForTests,
  type Plan,
  type PlayRecord,
  type Review,
  type StudyRecord,
  type Water,
  type WorkoutRecord,
} from '@/db';
import {
  computeMetrics,
  DAY_SUMMARY_MAX_LENGTH,
  formatDiffText,
  hasReviewContent,
  normalizeReviewPatch,
  summarizeReview,
  useReviewStore,
  type ReviewSettingsInput,
} from '@/stores/review';
import { useSettingsStore } from '@/stores/settings';

/** 2026-06-01 是周一。 */
const BASE = new Date('2026-06-01T10:00:00').getTime();
const TODAY = '2026-06-01';
const YESTERDAY = '2026-05-31';

const SETTINGS: ReviewSettingsInput = {
  daily_study_min: 120,
  daily_water_ml: 2000,
  daily_play_min: 60,
};

let pinia: Pinia;
let store: ReturnType<typeof useReviewStore>;
let idSeq = 0;

function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${idSeq}`;
}

type PlanData = Omit<Plan, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>;
function makePlanData(overrides: Partial<PlanData> = {}): PlanData {
  return {
    title: '计划',
    date: TODAY,
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
    ...overrides,
  };
}
function planRow(overrides: Partial<PlanData> = {}): Plan {
  return { ...makePlanData(overrides), id: nextId('plan'), created_at: 1, updated_at: 1, deleted_at: null };
}

type StudyData = Omit<StudyRecord, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>;
function makeStudyData(overrides: Partial<StudyData> = {}): StudyData {
  return {
    target_type: 'book',
    target_id: null,
    target_title: 'SICP',
    start_at: BASE,
    end_at: BASE + 30 * 60 * 1000,
    duration_sec: 1800,
    note: null,
    start_page: 10,
    end_page: 20,
    pages_read: 10,
    source: 'timer',
    date: TODAY,
    ...overrides,
  };
}
function studyRow(overrides: Partial<StudyData> = {}): StudyRecord {
  return { ...makeStudyData(overrides), id: nextId('study'), created_at: 1, updated_at: 1, deleted_at: null };
}

function waterRow(overrides: Partial<Omit<Water, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>> = {}): Water {
  return {
    date: TODAY,
    ml: 250,
    at: BASE,
    ...overrides,
    id: nextId('water'),
    created_at: 1,
    updated_at: 1,
    deleted_at: null,
  };
}

type WorkoutData = Omit<WorkoutRecord, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>;
function makeWorkoutData(overrides: Partial<WorkoutData> = {}): WorkoutData {
  return {
    date: TODAY,
    type_name: '背',
    exercises: [],
    duration_min: 40,
    done: false,
    ...overrides,
  };
}
function workoutRow(overrides: Partial<WorkoutData> = {}): WorkoutRecord {
  return { ...makeWorkoutData(overrides), id: nextId('workout'), created_at: 1, updated_at: 1, deleted_at: null };
}

type PlayData = Omit<PlayRecord, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>;
function makePlayData(overrides: Partial<PlayData> = {}): PlayData {
  return {
    date: TODAY,
    content: '游戏',
    minutes: 30,
    source: 'manual',
    ...overrides,
  };
}
function playRow(overrides: Partial<PlayData> = {}): PlayRecord {
  return { ...makePlayData(overrides), id: nextId('play'), created_at: 1, updated_at: 1, deleted_at: null };
}

type ReviewData = Omit<Review, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>;
function makeReviewData(overrides: Partial<ReviewData> = {}): ReviewData {
  return {
    date: TODAY,
    rating: null,
    mood: null,
    energy: null,
    good: null,
    improve: null,
    mit: null,
    record_worthy: null,
    day_summary: null,
    mit_added_to_plan: false,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.useRealTimers();
  await resetDbForTests();
  pinia = createPinia();
  setActivePinia(pinia);
  await useSettingsStore().load();
  store = useReviewStore();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(BASE);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('computeMetrics：7 项指标纯计算', () => {
  it('计划完成数 / 学习时长 / 阅读页数 / 喝水 / 运动 / 娱乐 / 差值全部按口径聚合', () => {
    const metrics = computeMetrics({
      plans: [
        planRow({ done: true, title: '已完成1' }),
        planRow({ done: true, title: '已完成2' }),
        planRow({ done: false }),
        planRow({ done: false }),
        planRow({ done: false }),
      ],
      studyRecords: [
        studyRow({ duration_sec: 5400, target_type: 'book', pages_read: 20 }),
        studyRow({ duration_sec: 1800, target_type: 'subject', pages_read: null }),
      ],
      waterRecords: [waterRow({ ml: 250 }), waterRow({ ml: 500 }), waterRow({ ml: -100 })],
      workoutRecords: [workoutRow({ done: true, type_name: '背', duration_min: 40 })],
      playRecords: [playRow({ minutes: 45 })],
      settings: SETTINGS,
    });

    expect(metrics.planDone).toBe(2);
    expect(metrics.planTotal).toBe(5);
    expect(metrics.planText).toBe('2/5');
    expect(metrics.studySeconds).toBe(7200);
    expect(metrics.studyGoalMin).toBe(120);
    expect(metrics.studyText).toBe('02:00:00 / 02:00:00');
    expect(metrics.pagesRead).toBe(20);
    expect(metrics.pagesText).toBe('20 页');
    expect(metrics.waterMl).toBe(650);
    expect(metrics.waterText).toBe('650 ml / 2000 ml');
    expect(metrics.workoutDone).toBe(true);
    expect(metrics.workoutText).toBe('背 40 分钟');
    expect(metrics.playMinutes).toBe(45);
    expect(metrics.playText).toBe('45 分钟 / 60 分钟');
    // 计划学习时长：未给时间块 → 0；实际 7200 秒 = 120 分钟 → 差值 +120
    expect(metrics.plannedStudyMinutes).toBe(0);
    expect(metrics.actualStudyMinutes).toBe(120);
    expect(metrics.diffMinutes).toBe(120);
    expect(metrics.diffText).toBe('+120 分钟（超额完成）');
  });

  it('计划学习时长只累加学习类且起止非空的时间块，重叠不合并扣减', () => {
    const metrics = computeMetrics({
      plans: [
        planRow({ category_key: 'study', start_min: 60, end_min: 120 }), // 60 分钟
        planRow({ category_key: 'study', start_min: 90, end_min: 150 }), // 60 分钟，与上一块重叠不扣减
        planRow({ category_key: 'life', start_min: 0, end_min: 200 }), // 非学习类不参与
        planRow({ category_key: 'study', start_min: 300, end_min: 330 }), // 30 分钟
        planRow({ category_key: 'study', start_min: null, end_min: null }), // 无起止时间不参与
      ],
      studyRecords: [studyRow({ duration_sec: 3600 })],
      waterRecords: [],
      workoutRecords: [],
      playRecords: [],
      settings: SETTINGS,
    });

    expect(metrics.plannedStudyMinutes).toBe(150);
    expect(metrics.actualStudyMinutes).toBe(60);
    expect(metrics.diffMinutes).toBe(-90);
    expect(metrics.diffText).toBe('-90 分钟（未达计划）');
  });

  it('阅读页数只加 book 类且 pages_read 非 null 的记录', () => {
    const metrics = computeMetrics({
      plans: [],
      studyRecords: [
        studyRow({ target_type: 'book', pages_read: 12 }),
        studyRow({ target_type: 'book', pages_read: 8 }),
        studyRow({ target_type: 'book', pages_read: null }),
        studyRow({ target_type: 'subject', pages_read: null }),
      ],
      waterRecords: [],
      workoutRecords: [],
      playRecords: [],
      settings: SETTINGS,
    });
    expect(metrics.pagesRead).toBe(20);
    expect(metrics.pagesText).toBe('20 页');
  });

  it('软删除记录不参与任何指标聚合', () => {
    const deletedStudy = studyRow({ duration_sec: 9999, pages_read: 99 });
    deletedStudy.deleted_at = 1;
    const metrics = computeMetrics({
      plans: [planRow({ done: true }), { ...planRow({ done: true }), deleted_at: 1 }],
      studyRecords: [deletedStudy, studyRow({ duration_sec: 600 })],
      waterRecords: [waterRow({ ml: 300 }), { ...waterRow({ ml: 500 }), deleted_at: 1 }],
      workoutRecords: [],
      playRecords: [playRow({ minutes: 10 }), { ...playRow({ minutes: 40 }), deleted_at: 1 }],
      settings: SETTINGS,
    });
    expect(metrics.planTotal).toBe(1);
    expect(metrics.studySeconds).toBe(600);
    expect(metrics.waterMl).toBe(300);
    expect(metrics.playMinutes).toBe(10);
  });

  it('运动 done 判定：无 done 记录显示未运动，多条 done 记录合并显示类型与用时', () => {
    const none = computeMetrics({
      plans: [],
      studyRecords: [],
      waterRecords: [],
      workoutRecords: [workoutRow({ done: false, duration_min: 20 })],
      playRecords: [],
      settings: SETTINGS,
    });
    expect(none.workoutDone).toBe(false);
    expect(none.workoutText).toBe('未运动');

    const multiple = computeMetrics({
      plans: [],
      studyRecords: [],
      waterRecords: [],
      workoutRecords: [
        workoutRow({ done: true, type_name: '背', duration_min: 40 }),
        workoutRow({ done: true, type_name: '腿', duration_min: 30 }),
      ],
      playRecords: [],
      settings: SETTINGS,
    });
    expect(multiple.workoutDone).toBe(true);
    expect(multiple.workoutText).toBe('背 40 分钟、腿 30 分钟');
  });

  it('差值格式化：正数超额、负数未达、0 持平', () => {
    expect(formatDiffText(10)).toBe('+10 分钟（超额完成）');
    expect(formatDiffText(-10)).toBe('-10 分钟（未达计划）');
    expect(formatDiffText(0)).toBe('±0 分钟');
  });
});

describe('hasReviewContent / summarizeReview / normalizeReviewPatch', () => {
  function reviewRow(overrides: Partial<ReviewData> = {}): Review {
    return {
      ...makeReviewData(overrides),
      id: nextId('review'),
      created_at: 1,
      updated_at: 1,
      deleted_at: null,
    };
  }

  it('hasReviewContent：任一评分或文字非空即算已填写，全空不算', () => {
    expect(hasReviewContent(reviewRow({ rating: 4 }))).toBe(true);
    expect(hasReviewContent(reviewRow({ mit: '晨跑' }))).toBe(true);
    expect(hasReviewContent(reviewRow())).toBe(false);
  });

  it('hasReviewContent：只填“值得记录”或“一句话总结”也算已复盘，纯空白不算', () => {
    expect(hasReviewContent(reviewRow({ record_worthy: '第一次跑完 5 公里' }))).toBe(true);
    expect(hasReviewContent(reviewRow({ day_summary: '状态不错' }))).toBe(true);
    expect(hasReviewContent(reviewRow({ record_worthy: '   ', day_summary: '\n' }))).toBe(false);
    expect(hasReviewContent(reviewRow({ record_worthy: null, day_summary: undefined }))).toBe(false);
  });

  it('summarizeReview：只取 day_summary 首行；为空返回空串，不回退其它字段', () => {
    const review = reviewRow({ day_summary: '状态不错\n心情好', good: '专注\n高效', mit: '晨跑' });
    expect(summarizeReview(review)).toBe('状态不错');
    expect(summarizeReview({ ...review, day_summary: '  ' })).toBe('');
    expect(summarizeReview({ ...review, day_summary: null, good: '做得再好也不当摘要' })).toBe('');
    expect(summarizeReview({ ...review, day_summary: null, good: null, mit: '晨跑' })).toBe('');
  });

  it('normalizeReviewPatch：文字 trim 后保存，空白存 null；评分只接受 null 或 1~5', () => {
    expect(normalizeReviewPatch({ good: ' 专注 ', improve: '   ', mit: '' })).toEqual({
      good: '专注',
      improve: null,
      mit: null,
    });
    expect(() => normalizeReviewPatch({ rating: 6 })).toThrow('1~5');
    expect(() => normalizeReviewPatch({ mood: 0 })).toThrow('1~5');
    expect(normalizeReviewPatch({ rating: null, energy: 5 })).toEqual({ rating: null, energy: 5 });
  });

  it('normalizeReviewPatch：新增两栏同样 trim，一句话总结超长按 100 字截断', () => {
    expect(normalizeReviewPatch({ record_worthy: ' 跑完 5 公里 ', day_summary: ' 状态不错 ' })).toEqual({
      record_worthy: '跑完 5 公里',
      day_summary: '状态不错',
    });
    expect(normalizeReviewPatch({ record_worthy: '  ', day_summary: '   ' })).toEqual({
      record_worthy: null,
      day_summary: null,
    });
    const truncated = normalizeReviewPatch({ day_summary: '字'.repeat(120) });
    expect(truncated.day_summary).toHaveLength(DAY_SUMMARY_MAX_LENGTH);
    expect(truncated.day_summary).toBe('字'.repeat(100));
  });
});

describe('upsertReview / 历史列表', () => {
  it('upsertReview 按 date 定位：不存在新增、存在更新，且不产生重复行', async () => {
    const first = await store.upsertReview(TODAY, { rating: 4 });
    expect(first.date).toBe(TODAY);
    expect(first.rating).toBe(4);
    expect(await listAliveByDate('reviews', TODAY)).toHaveLength(1);

    const second = await store.upsertReview(TODAY, { mood: 2 });
    expect(second.id).toBe(first.id);
    expect(second.mood).toBe(2);
    const rows = await listAliveByDate('reviews', TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.rating).toBe(4);
    expect(rows[0]?.mood).toBe(2);
  });

  it('同一日期并发 upsert（连点）串行执行，只创建一条记录', async () => {
    const [a, b] = await Promise.all([
      store.upsertReview(TODAY, { rating: 5 }),
      store.upsertReview(TODAY, { energy: 3 }),
    ]);
    expect(await listAliveByDate('reviews', TODAY)).toHaveLength(1);
    expect(a.id).toBe(b.id);
    expect((await listAliveByDate('reviews', TODAY))[0]?.energy).toBe(3);
  });

  it('不同日期各自定位，互不影响', async () => {
    await store.upsertReview(TODAY, { rating: 5 });
    await store.upsertReview(YESTERDAY, { rating: 1 });
    expect(await listAliveByDate('reviews', TODAY)).toHaveLength(1);
    expect(await listAliveByDate('reviews', YESTERDAY)).toHaveLength(1);
    expect((await listAliveByDate('reviews', YESTERDAY))[0]?.rating).toBe(1);
  });

  it('历史列表摘要只显示 day_summary；为空则留空，不回退“做得好的”', async () => {
    await createRecord('reviews', makeReviewData({ date: '2026-05-30', rating: 5, good: '一'.repeat(40) }));
    await createRecord(
      'reviews',
      makeReviewData({ date: YESTERDAY, rating: 4, good: '专注', day_summary: '状态不错' }),
    );
    await store.load(TODAY);
    const items = store.historyItems;
    expect(items.map((item) => item.date)).toEqual([YESTERDAY, '2026-05-30']);
    expect(items[0]?.summary).toBe('状态不错');
    expect(items[1]?.summary).toBe('');
  });

  it('历史列表项带上复盘全文，供区间详情只读展示', async () => {
    await createRecord(
      'reviews',
      makeReviewData({
        date: YESTERDAY,
        rating: 4,
        record_worthy: '跑完 5 公里',
        day_summary: '状态不错',
        good: '专注',
        improve: '早睡',
        mit: '读完一章',
      }),
    );
    await store.load(TODAY);
    expect(store.historyItems[0]).toMatchObject({
      date: YESTERDAY,
      record_worthy: '跑完 5 公里',
      day_summary: '状态不错',
      good: '专注',
      improve: '早睡',
      mit: '读完一章',
    });
  });

  it('load 聚合当天数据并生成历史列表', async () => {
    await createRecord('plans', makePlanData({ title: '学习块', start_min: 60, end_min: 120, done: true }));
    await createRecord('study_records', makeStudyData({ duration_sec: 3600, pages_read: 12 }));
    await createRecord('water', { date: TODAY, ml: 500, at: BASE });
    await createRecord('workout_records', makeWorkoutData({ done: true, type_name: '背', duration_min: 40 }));
    await createRecord('play_records', makePlayData({ minutes: 30 }));
    await createRecord(
      'reviews',
      makeReviewData({
        date: YESTERDAY,
        rating: 5,
        mood: 4,
        energy: 3,
        good: '专注',
        record_worthy: '跑完 5 公里',
        day_summary: '状态不错',
        mit: '晨跑',
      }),
    );

    await store.load(TODAY);
    expect(store.loadedDate).toBe(TODAY);
    expect(store.metrics?.planText).toBe('1/1');
    expect(store.metrics?.studySeconds).toBe(3600);
    expect(store.metrics?.pagesRead).toBe(12);
    expect(store.metrics?.waterMl).toBe(500);
    expect(store.metrics?.workoutText).toBe('背 40 分钟');
    expect(store.metrics?.playMinutes).toBe(30);
    expect(store.metrics?.diffText).toBe('±0 分钟'); // 实际 60 分钟 - 计划 60 分钟 = 持平

    expect(store.historyItems).toHaveLength(1);
    expect(store.historyItems[0]?.date).toBe(YESTERDAY);
    expect(store.historyItems[0]?.summary).toBe('状态不错');
    expect(store.historyItems[0]?.record_worthy).toBe('跑完 5 公里');
  });
});

it('快速切日期时，较晚返回的旧日期查询不能覆盖新日期', async () => {
  let release!: (rows: Review[]) => void;
  const delayed = new Promise<Review[]>(resolve => { release=resolve; });
  const spy = vi.spyOn(database, 'listAlive').mockReturnValueOnce(delayed as never);
  try {
    const oldLoad = store.load(TODAY);
    await store.load(YESTERDAY);
    release([]);
    await oldLoad;
    expect(store.loadedDate).toBe(YESTERDAY);
    expect(store.loading).toBe(false);
  } finally { spy.mockRestore(); }
});
