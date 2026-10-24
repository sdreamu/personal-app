import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import {
  addCategory,
  createRecord,
  getRecord,
  listAlive,
  listAliveByDate,
  resetDbForTests,
  softDelete,
  type Book,
  type Plan,
  type Subject,
} from '@/db';
import {
  addMitToPlan,
  layoutTimelineLanes,
  rangesOverlap,
  resolveTimeRange,
  sortPlansByOffset,
  usePlanStore,
  validateTimeRange,
  weekdayOf,
} from '@/stores/plan';
import { useSettingsStore } from '@/stores/settings';
import { useToastStore } from '@/stores/toast';

/** 2026-06-01 是周一（today=2026-06-01，yesterday=2026-05-31）。 */
const BASE = new Date('2026-06-01T10:00:00').getTime();
const TODAY = '2026-06-01';
const YESTERDAY = '2026-05-31';

let pinia: Pinia;
let store: ReturnType<typeof usePlanStore>;

function useFakeDate(): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(BASE);
}

type PlanData = Omit<Plan, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>;

function makePlanData(date: string, title: string, overrides: Partial<PlanData> = {}): PlanData {
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
    ...overrides,
  };
}

async function makeBook(title = 'SICP'): Promise<Book> {
  return createRecord('books', {
    title,
    author: null,
    total_pages: 300,
    current_page: 40,
    status: 'reading',
    color: '#4a6cf7',
    start_date: null,
    finish_date: null,
  });
}

async function makeSubject(name = '数学'): Promise<Subject> {
  return createRecord('subjects', {
    name,
    weekly_goal_min: 360,
    deadline: null,
    archived: false,
  });
}

beforeEach(async () => {
  vi.useRealTimers();
  await resetDbForTests();
  pinia = createPinia();
  setActivePinia(pinia);
  await useSettingsStore().load();
  store = usePlanStore();
  useFakeDate();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('时间偏移换算与边界校验', () => {
  it('resolveTimeRange：23:00→次日 01:00 = 1140→1260；结束=起点时刻映射为次日 1440', () => {
    expect(resolveTimeRange('23:00', '01:00', 240)).toEqual({ ok: true, startMin: 1140, endMin: 1260 });
    expect(resolveTimeRange('03:00', '04:00', 240)).toEqual({ ok: true, startMin: 1380, endMin: 1440 });
    expect(resolveTimeRange('04:00', '04:00', 240)).toEqual({ ok: true, startMin: 0, endMin: 1440 });
    expect(resolveTimeRange('04:00', '23:00', 240)).toEqual({ ok: true, startMin: 0, endMin: 1140 });
  });

  it('resolveTimeRange：跨越一天起点边界拒绝（22:00→06:00、09:00→次日 08:00）', () => {
    const crossing = resolveTimeRange('22:00', '06:00', 240);
    expect(crossing.ok).toBe(false);
    if (!crossing.ok) expect(crossing.reason).toBe('时间块不得跨越一天起点边界');
    const crossing2 = resolveTimeRange('09:00', '08:00', 240);
    expect(crossing2.ok).toBe(false);
    if (!crossing2.ok) expect(crossing2.reason).toBe('时间块不得跨越一天起点边界');
  });

  it('resolveTimeRange：非法 HH:mm 拒绝；validateTimeRange 覆盖 0<=开始<结束<=1440 边界', () => {
    expect(resolveTimeRange('aa', '09:00', 240).ok).toBe(false);
    expect(resolveTimeRange('09:00', '25:00', 240).ok).toBe(false);
    expect(validateTimeRange(0, 1440)).toEqual({ ok: true });
    expect(validateTimeRange(1140, 1440)).toEqual({ ok: true });
    expect(validateTimeRange(0, 0).ok).toBe(false);
    expect(validateTimeRange(10, 9).ok).toBe(false);
    expect(validateTimeRange(1440, 1440).ok).toBe(false);
    expect(validateTimeRange(-1, 10).ok).toBe(false);
    expect(validateTimeRange(10, 1441).ok).toBe(false);
    expect(validateTimeRange(1.5, 2).ok).toBe(false);
  });
});

describe('重叠检测与泳道布局', () => {
  it('rangesOverlap：半开区间，首尾相接不算重叠', () => {
    expect(rangesOverlap(0, 60, 30, 90)).toBe(true);
    expect(rangesOverlap(0, 60, 60, 90)).toBe(false);
    expect(rangesOverlap(30, 90, 0, 60)).toBe(true);
    expect(rangesOverlap(0, 60, 120, 180)).toBe(false);
  });

  it('layoutTimelineLanes：两个重叠块并排两泳道，互不重叠块单泳道', () => {
    const plans = [
      { ...makePlanData(TODAY, 'A', { start_min: 0, end_min: 60 }), id: 'a', created_at: 1, updated_at: 1, deleted_at: null },
      { ...makePlanData(TODAY, 'B', { start_min: 30, end_min: 90 }), id: 'b', created_at: 1, updated_at: 1, deleted_at: null },
      { ...makePlanData(TODAY, 'C', { start_min: 120, end_min: 180 }), id: 'c', created_at: 1, updated_at: 1, deleted_at: null },
    ];
    const layout = layoutTimelineLanes(plans);
    const a = layout.find((i) => i.plan.title === 'A');
    const b = layout.find((i) => i.plan.title === 'B');
    const c = layout.find((i) => i.plan.title === 'C');
    expect(a?.lane).toBe(0);
    expect(b?.lane).toBe(1);
    expect(a?.laneCount).toBe(2);
    expect(b?.laneCount).toBe(2);
    expect(a?.hasOverlap).toBe(true);
    expect(b?.hasOverlap).toBe(true);
    expect(c?.lane).toBe(0);
    expect(c?.laneCount).toBe(1);
    expect(c?.hasOverlap).toBe(false);
  });

  it('layoutTimelineLanes：传递重叠链分到独立泳道，时间轴按偏移排序', () => {
    const plans = [
      { ...makePlanData(TODAY, 'A', { start_min: 0, end_min: 60 }), id: 'a', created_at: 1, updated_at: 1, deleted_at: null },
      { ...makePlanData(TODAY, 'B', { start_min: 10, end_min: 30 }), id: 'b', created_at: 1, updated_at: 1, deleted_at: null },
      { ...makePlanData(TODAY, 'C', { start_min: 20, end_min: 50 }), id: 'c', created_at: 1, updated_at: 1, deleted_at: null },
      { ...makePlanData(TODAY, 'D', { start_min: 200, end_min: 240 }), id: 'd', created_at: 1, updated_at: 1, deleted_at: null },
      { ...makePlanData(TODAY, '无时间待办'), id: 'e', created_at: 1, updated_at: 1, deleted_at: null },
    ];
    const layout = layoutTimelineLanes(plans);
    expect(layout.map((i) => i.plan.title)).toEqual(['A', 'B', 'C', 'D']);
    expect(layout.map((i) => i.lane)).toEqual([0, 1, 2, 0]);
    expect(layout.map((i) => i.laneCount)).toEqual([3, 3, 3, 1]);
    expect(layout.every((i) => i.hasOverlap === (i.laneCount > 1))).toBe(true);
  });

  it('sortPlansByOffset：仅保留时间块，按开始偏移（同开始按结束）升序', () => {
    const plans = [
      { ...makePlanData(TODAY, 'B', { start_min: 300, end_min: 330 }), id: 'b', created_at: 1, updated_at: 1, deleted_at: null },
      { ...makePlanData(TODAY, '无时间'), id: 'x', created_at: 1, updated_at: 1, deleted_at: null },
      { ...makePlanData(TODAY, 'A2', { start_min: 120, end_min: 200 }), id: 'a2', created_at: 1, updated_at: 1, deleted_at: null },
      { ...makePlanData(TODAY, 'A1', { start_min: 120, end_min: 150 }), id: 'a1', created_at: 1, updated_at: 1, deleted_at: null },
    ];
    expect(sortPlansByOffset(plans).map((p) => p.title)).toEqual(['A1', 'A2', 'B']);
  });

  it('weekdayOf：1=周一 ~ 7=周日', () => {
    expect(weekdayOf('2026-06-01')).toBe(1);
    expect(weekdayOf('2026-06-07')).toBe(7);
    expect(weekdayOf('2026-06-02')).toBe(2);
  });
});

describe('计划项 CRUD（分类/关联快照）', () => {
  it('createPlan：内置分类存 builtin_key、自定义分类存其 id，均带 category_name 快照', async () => {
    const book = await makeBook();
    const custom = await addCategory('plan_categories', '摸鱼');
    await store.load(TODAY);
    const builtin = await store.createPlan(TODAY, {
      title: '读 SICP',
      categoryKey: 'study',
      startMin: 600,
      endMin: 660,
      targetType: 'book',
      targetId: book.id,
      targetTitle: '过时名称',
    });
    expect(builtin.category_key).toBe('study');
    expect(builtin.category_name).toBe('学习');
    expect(builtin.target_title).toBe('SICP'); // 快照以库内当前名称为准
    expect(builtin.date).toBe(TODAY);

    const customPlan = await store.createPlan(TODAY, {
      title: '打游戏',
      categoryKey: custom.id,
      startMin: null,
      endMin: null,
      targetType: 'book',
      targetId: book.id,
      targetTitle: 'SICP',
    });
    expect(customPlan.category_key).toBe(custom.id);
    expect(customPlan.category_name).toBe('摸鱼');
    expect(customPlan.target_type).toBeNull(); // 非学习类不保留关联对象
    expect(customPlan.target_id).toBeNull();
  });

  it('createPlan 校验：标题必填 / 起止成对 / 范围合法 / 分类与关联对象存在', async () => {
    await store.load(TODAY);
    const base = {
      categoryKey: 'study',
      startMin: null as number | null,
      endMin: null as number | null,
      targetType: null as 'book' | 'subject' | null,
      targetId: null as string | null,
      targetTitle: null as string | null,
    };
    await expect(store.createPlan(TODAY, { ...base, title: '   ' })).rejects.toThrow('标题不能为空');
    await expect(
      store.createPlan(TODAY, { ...base, title: 'x', startMin: 100, endMin: null }),
    ).rejects.toThrow('请同时填写开始与结束时间');
    await expect(
      store.createPlan(TODAY, { ...base, title: 'x', startMin: 100, endMin: 100 }),
    ).rejects.toThrow('结束时间必须晚于开始时间');
    await expect(
      store.createPlan(TODAY, { ...base, title: 'x', categoryKey: '不存在的分类' }),
    ).rejects.toThrow('分类不存在');
    await expect(
      store.createPlan(TODAY, {
        ...base,
        title: 'x',
        targetType: 'book',
        targetId: 'missing-book',
        targetTitle: '不存在',
      }),
    ).rejects.toThrow('关联对象不存在');
  });

  it('updatePlan：清空起止时间变回普通待办；非法时间拒绝且原记录不变', async () => {
    await store.load(TODAY);
    const plan = await createRecord('plans', makePlanData(TODAY, '安排好的块', { start_min: 300, end_min: 330 }));
    await store.updatePlan(plan.id, {
      title: '安排好的块',
      categoryKey: 'study',
      startMin: null,
      endMin: null,
      targetType: null,
      targetId: null,
      targetTitle: null,
    });
    const after = await getRecord('plans', plan.id);
    expect(after?.start_min).toBeNull();
    expect(after?.end_min).toBeNull();
    expect(store.todoPlans.map((p) => p.title)).toContain('安排好的块');
    expect(store.timedPlans.map((p) => p.title)).not.toContain('安排好的块');

    await expect(
      store.updatePlan(plan.id, {
        title: '安排好的块',
        categoryKey: 'study',
        startMin: 200,
        endMin: 100,
        targetType: null,
        targetId: null,
        targetTitle: null,
      }),
    ).rejects.toThrow('结束时间必须晚于开始时间');
    const unchanged = await getRecord('plans', plan.id);
    expect(unchanged?.start_min).toBeNull(); // 失败未写入
  });

  it('updatePlan：关联对象已删除时保留原快照不阻止保存（PRD §5.10）', async () => {
    const book = await makeBook();
    const plan = await createRecord('plans', makePlanData(TODAY, '读书块', {
      target_type: 'book',
      target_id: book.id,
      target_title: book.title,
    }));
    await softDelete('books', book.id);
    await store.load(TODAY); // 在读书籍列表不再包含该书

    await store.updatePlan(plan.id, {
      title: '读书块（改名）',
      categoryKey: 'study',
      startMin: null,
      endMin: null,
      targetType: 'book',
      targetId: book.id,
      targetTitle: book.title,
    });
    const row = await getRecord('plans', plan.id);
    expect(row?.title).toBe('读书块（改名）');
    expect(row?.target_type).toBe('book');
    expect(row?.target_id).toBe(book.id);
    expect(row?.target_title).toBe(book.title); // 快照保留，显示时标“已删除”
  });

  it('toggleDone：勾选一键写 done/done_at，再次勾选清除', async () => {
    await store.load(TODAY);
    const plan = await createRecord('plans', makePlanData(TODAY, '背单词'));
    await store.toggleDone(plan);
    let row = await getRecord('plans', plan.id);
    expect(row?.done).toBe(true);
    expect(row?.done_at).toBeGreaterThanOrEqual(BASE); // 假时钟按真实时间微漂移
    expect(row?.done_at).toBeLessThan(BASE + 60_000);
    expect(store.doneCount).toBe(1);

    await store.toggleDone(store.plans.find((p) => p.id === plan.id) as Plan);
    row = await getRecord('plans', plan.id);
    expect(row?.done).toBe(false);
    expect(row?.done_at).toBeNull();
  });

  it('softDeletePlan：软删除 + 5 秒撤销恢复', async () => {
    await store.load(TODAY);
    const plan = await createRecord('plans', makePlanData(TODAY, '要删的'));
    await store.softDeletePlan(plan);
    expect((await getRecord('plans', plan.id))?.deleted_at).not.toBeNull();
    expect(await listAliveByDate('plans', TODAY)).toHaveLength(0);
    const undoToast = useToastStore().items.find((i) => i.undo !== null);
    expect(undoToast?.message).toContain('已删除计划');
    await undoToast?.undo?.action();
    expect((await getRecord('plans', plan.id))?.deleted_at).toBeNull();
    expect(await listAliveByDate('plans', TODAY)).toHaveLength(1);
  });

  it('moveToTomorrow：未完成项日期 +1 天（跨月正确），已完成项不移动', async () => {
    await store.load('2026-06-30');
    const plan = await createRecord('plans', makePlanData('2026-06-30', '写周报'));
    await store.moveToTomorrow(plan);
    expect((await getRecord('plans', plan.id))?.date).toBe('2026-07-01');

    const done = await createRecord('plans', makePlanData('2026-06-30', '已完成', { done: true, done_at: BASE }));
    await store.moveToTomorrow(done);
    expect((await getRecord('plans', done.id))?.date).toBe('2026-06-30');
  });
});

describe('一键顺延昨日未完成', () => {
  it('原记录留在昨天并置 is_rolled_over，今天克隆无时间待办（快照相同、rollover_from_date=昨天），防重复', async () => {
    const book = await makeBook();
    const undoneA = await createRecord('plans', makePlanData(YESTERDAY, 'A 时间块', {
      start_min: 600,
      end_min: 660,
      target_type: 'book',
      target_id: book.id,
      target_title: book.title,
    }));
    const undoneB = await createRecord('plans', makePlanData(YESTERDAY, 'B 待办', { category_key: 'life', category_name: '生活' }));
    await createRecord('plans', makePlanData(YESTERDAY, 'C 已完成', { done: true, done_at: BASE }));
    await createRecord('plans', makePlanData(YESTERDAY, 'D 已顺延过', { is_rolled_over: true }));

    await store.load(TODAY);
    expect(store.rolloverCount).toBe(2);

    const count = await store.rollOverYesterday();
    expect(count).toBe(2);
    expect(useToastStore().items.some((i) => i.message.includes('2 项昨日未完成顺延'))).toBe(true);

    const yesterdayRows = await listAliveByDate('plans', YESTERDAY);
    expect(yesterdayRows).toHaveLength(4); // 昨日分母保留
    expect((await getRecord('plans', undoneA.id))?.is_rolled_over).toBe(true);
    expect((await getRecord('plans', undoneB.id))?.is_rolled_over).toBe(true);

    const todayRows = await listAliveByDate('plans', TODAY);
    expect(todayRows).toHaveLength(2);
    const cloneA = todayRows.find((p) => p.title === 'A 时间块');
    const cloneB = todayRows.find((p) => p.title === 'B 待办');
    expect(cloneA?.date).toBe(TODAY);
    expect(cloneA?.start_min).toBeNull(); // 清空起止时间
    expect(cloneA?.end_min).toBeNull();
    expect(cloneA?.rollover_from_date).toBe(YESTERDAY);
    expect(cloneA?.is_rolled_over).toBe(false);
    expect(cloneA?.category_key).toBe('study'); // 标题/分类/关联快照相同
    expect(cloneA?.category_name).toBe('学习');
    expect(cloneA?.target_type).toBe('book');
    expect(cloneA?.target_id).toBe(book.id);
    expect(cloneA?.target_title).toBe(book.title);
    expect(cloneA?.done).toBe(false);
    expect(cloneB?.category_key).toBe('life');
    expect(cloneB?.category_name).toBe('生活');

    const second = await store.rollOverYesterday(); // 防重复
    expect(second).toBe(0);
    expect(await listAliveByDate('plans', TODAY)).toHaveLength(2);
    expect(store.rolloverCount).toBe(0);
  });

  it('并发调用 rollOverYesterday（连点）：只克隆一次，不重复顺延', async () => {
    await createRecord('plans', makePlanData(YESTERDAY, '并发A'));
    await createRecord('plans', makePlanData(YESTERDAY, '并发B'));
    await store.load(TODAY);
    const [first, second] = await Promise.all([store.rollOverYesterday(), store.rollOverYesterday()]);
    expect(first).toBe(2);
    expect(second).toBe(2);
    expect(await listAliveByDate('plans', TODAY)).toHaveLength(2);
    const yesterdayRows = await listAliveByDate('plans', YESTERDAY);
    expect(yesterdayRows.filter((p) => p.is_rolled_over)).toHaveLength(2);
  });
});

describe('“最重要的一件事”加入今日待办（防重复）', () => {
  it('addMitToPlan：生成今日无时间待办（内置其他），置 mit_added_to_plan，重复调用返回 null', async () => {
    const review = await createRecord('reviews', {
      date: YESTERDAY,
      rating: 4,
      mood: 5,
      energy: 4,
      good: '专注',
      improve: null,
      mit: '读完一章',
      mit_added_to_plan: false,
    });
    const created = await addMitToPlan();
    expect(created?.title).toBe('读完一章');
    expect(created?.date).toBe(TODAY);
    expect(created?.start_min).toBeNull();
    expect(created?.end_min).toBeNull();
    expect(created?.category_key).toBe('other');
    expect(created?.category_name).toBe('其他');
    expect(created?.done).toBe(false);
    expect(created?.target_type).toBeNull();
    expect((await getRecord('reviews', review.id))?.mit_added_to_plan).toBe(true);

    expect(await addMitToPlan()).toBeNull(); // 防重复
    expect(await listAliveByDate('plans', TODAY)).toHaveLength(1);
  });

  it('并发调用 addMitToPlan（连点）：只生成一条待办，返回同一结果', async () => {
    await createRecord('reviews', {
      date: YESTERDAY,
      rating: 4,
      mood: 4,
      energy: 4,
      good: null,
      improve: null,
      mit: '连点防护',
      mit_added_to_plan: false,
    });
    const [first, second] = await Promise.all([addMitToPlan(), addMitToPlan()]);
    expect(await listAliveByDate('plans', TODAY)).toHaveLength(1);
    expect(first?.id).toBe(second?.id);
  });

  it('addMitToPlan：无 MIT / 已加入时返回 null 且不新增', async () => {
    await createRecord('reviews', {
      date: YESTERDAY,
      rating: 3,
      mood: 3,
      energy: 3,
      good: null,
      improve: null,
      mit: null,
      mit_added_to_plan: false,
    });
    expect(await addMitToPlan()).toBeNull();

    await createRecord('reviews', {
      date: YESTERDAY,
      rating: 3,
      mood: 3,
      energy: 3,
      good: null,
      improve: null,
      mit: '另一个 MIT',
      mit_added_to_plan: true,
    });
    expect(await addMitToPlan()).toBeNull();
    expect(await listAliveByDate('plans', TODAY)).toHaveLength(0);
  });
});

describe('load：顶部上下文（今日训练 / 昨日 MIT / 可顺延数量）与日期上下文', () => {
  it('按选中日期载入计划；今日训练只读 weekday=今天的模板；昨日 MIT 与顺延数量跟随真实今天', async () => {
    await createRecord('plans', makePlanData(TODAY, '今天的待办'));
    await createRecord('plans', makePlanData('2026-06-02', '明天的待办'));
    await createRecord('workout_templates', { weekday: 2, type_name: '背', exercise_names: ['引体'] });
    await createRecord('workout_templates', { weekday: 1, type_name: '腿', exercise_names: ['深蹲'] });
    await createRecord('reviews', {
      date: YESTERDAY,
      rating: 4,
      mood: 4,
      energy: 4,
      good: null,
      improve: null,
      mit: '晨跑',
      mit_added_to_plan: false,
    });
    await createRecord('plans', makePlanData(YESTERDAY, '昨天没做完'));
    await createRecord('plans', makePlanData(YESTERDAY, '昨天顺延过', { is_rolled_over: true }));

    await store.load(TODAY);
    expect(store.plans.map((p) => p.title)).toEqual(['今天的待办']);
    expect(store.totalCount).toBe(1);
    expect(store.todayWorkout?.type_name).toBe('腿'); // 2026-06-01 是周一
    expect(store.mitReview?.mit).toBe('晨跑');
    expect(store.mitAdded).toBe(false);
    expect(store.rolloverCount).toBe(1);

    await store.load('2026-06-02');
    expect(store.plans.map((p) => p.title)).toEqual(['明天的待办']);
    expect(store.todayWorkout?.type_name).toBe('腿'); // 训练/MIT/顺延始终看真实今天
    expect(store.rolloverCount).toBe(1);
  });

  it('当天无训练模板时 todayWorkout 为 null；昨天无 MIT 时 mitReview 为 null', async () => {
    await store.load(TODAY);
    expect(store.todayWorkout).toBeNull();
    expect(store.mitReview).toBeNull();
    expect(store.rolloverCount).toBe(0);
  });
});
